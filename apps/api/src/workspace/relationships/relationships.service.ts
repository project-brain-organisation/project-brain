import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { isUniqueViolation } from '../../database/pg-errors';
import { ProjectsService, READ_ONLY_GRAPH_MESSAGE } from '../../projects/projects.service';
import { WorkspaceEventsService } from '../gateway/workspace-events.service';
import { entities, relationships } from '../../database/schema/index';
import { CreateRelationshipDto } from './dto/create-relationship.dto';

// Endpoint-type rules per relationship kind. 'edge' is deliberately absent —
// it places no restriction on its endpoints.
const endpointRules: Partial<
  Record<CreateRelationshipDto['kind'], { source: string; target: string; error: string }>
> = {
  hierarchy: {
    source: 'thought',
    target: 'thought',
    error: 'hierarchy relationships require thought/thought endpoints',
  },
  tag: {
    source: 'thought',
    target: 'label',
    error: 'tag relationships require thought→label',
  },
};

@Injectable()
export class RelationshipsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly projectsService: ProjectsService,
    private readonly workspaceEvents: WorkspaceEventsService,
  ) {}

  async create(userId: string, dto: CreateRelationshipDto, source: 'user' | 'mcp' = 'user') {
    await this.projectsService.assertOwnership(userId, dto.projectId);

    return this.db.asUser(userId, async (tx) => {
      const endpoints = await tx
        .select()
        .from(entities)
        .where(inArray(entities.id, [dto.sourceId, dto.targetId]));

      const sourceEntity = endpoints.find((e) => e.id === dto.sourceId);
      const targetEntity = endpoints.find((e) => e.id === dto.targetId);

      if (!sourceEntity) {
        throw new NotFoundException(`Entity ${dto.sourceId} not found`);
      }
      if (!targetEntity) {
        throw new NotFoundException(`Entity ${dto.targetId} not found`);
      }

      // Cross-project invariant
      if (sourceEntity.projectId !== dto.projectId || targetEntity.projectId !== dto.projectId) {
        throw new BadRequestException('Cross-project relationships are not allowed');
      }

      const rule = endpointRules[dto.kind];
      if (rule && (sourceEntity.type !== rule.source || targetEntity.type !== rule.target)) {
        throw new BadRequestException(rule.error);
      }

      try {
        const [relationship] = await tx
          .insert(relationships)
          .values({
            ...(dto.id && { id: dto.id }),
            projectId: dto.projectId,
            ownerId: userId,
            sourceId: dto.sourceId,
            targetId: dto.targetId,
            kind: dto.kind,
            labelId: dto.labelId ?? null,
          })
          .returning();

        this.workspaceEvents.emit(userId, 'relationship.created', {
          source,
          resourceId: relationship.id,
          projectId: dto.projectId,
        });

        return relationship;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException('Relationship already exists');
        }
        throw err;
      }
    });
  }

  /**
   * All-or-nothing batch create: one ownership check, one endpoint-validation
   * select, batched inserts, one SSE event after commit. Applies the same
   * per-kind endpoint rules as create().
   */
  async createBatch(
    userId: string,
    projectId: string,
    items: {
      sourceId: string;
      targetId: string;
      kind: CreateRelationshipDto['kind'];
      labelId?: string | null;
    }[],
    source: 'user' | 'mcp' = 'user',
  ) {
    if (items.length === 0) throw new BadRequestException('Batch is empty');
    await this.projectsService.assertOwnership(userId, projectId);

    const created = await this.db
      .asUser(userId, async (tx) => {
        const endpointIds = [...new Set(items.flatMap((r) => [r.sourceId, r.targetId]))];
        const endpoints = await tx
          .select()
          .from(entities)
          .where(inArray(entities.id, endpointIds));
        const entityById = new Map(endpoints.map((e) => [e.id, e]));

        for (const item of items) {
          const src = entityById.get(item.sourceId);
          const tgt = entityById.get(item.targetId);
          if (!src) throw new NotFoundException(`Entity ${item.sourceId} not found`);
          if (!tgt) throw new NotFoundException(`Entity ${item.targetId} not found`);
          if (src.projectId !== projectId || tgt.projectId !== projectId) {
            throw new BadRequestException('Cross-project relationships are not allowed');
          }
          const rule = endpointRules[item.kind];
          if (rule && (src.type !== rule.source || tgt.type !== rule.target)) {
            throw new BadRequestException(rule.error);
          }
        }

        // Batched inserts guard against pg's parameter ceiling, cf. clone().
        const rows = [];
        for (let i = 0; i < items.length; i += 500) {
          rows.push(
            ...(await tx
              .insert(relationships)
              .values(
                items.slice(i, i + 500).map((item) => ({
                  projectId,
                  ownerId: userId,
                  sourceId: item.sourceId,
                  targetId: item.targetId,
                  kind: item.kind,
                  labelId: item.labelId ?? null,
                })),
              )
              .returning()),
          );
        }
        return rows;
      })
      .catch((err) => {
        if (isUniqueViolation(err)) throw new ConflictException('Relationship already exists');
        throw err;
      });

    // One coarse event — the web client refetches the workspace snapshot per event.
    this.workspaceEvents.emit(userId, 'relationship.created', {
      source,
      resourceId: created[0].id,
      projectId,
    });

    return created;
  }

  async findByProject(userId: string, projectId: string, kind?: 'hierarchy' | 'tag' | 'edge') {
    // Ownership isolation enforced by RLS; assertOwnership removed on read path.
    return this.db.asUser(userId, async (tx) =>
      tx
        .select()
        .from(relationships)
        .where(
          kind
            ? and(eq(relationships.projectId, projectId), eq(relationships.kind, kind))
            : eq(relationships.projectId, projectId),
        ),
    );
  }

  async findOne(userId: string, id: string) {
    const relationship = await this.db.asUser(userId, async (tx) => {
      const [row] = await tx
        .select()
        .from(relationships)
        .where(eq(relationships.id, id))
        .limit(1);
      return row;
    });

    if (!relationship) {
      throw new NotFoundException(`Relationship ${id} not found`);
    }

    // Ownership isolation enforced by RLS; unauthorized rows invisible.

    return relationship;
  }

  async findDescendants(userId: string, thoughtId: string) {
    return this.db.asUser(userId, async (tx) => {
      // Load entity to get projectId for ownership check
      const [entity] = await tx
        .select()
        .from(entities)
        .where(eq(entities.id, thoughtId))
        .limit(1);

      if (!entity) {
        throw new NotFoundException(`Entity ${thoughtId} not found`);
      }

      // Ownership isolation enforced by RLS; assertOwnership removed on read path.

      // Recursive CTE: source=child, target=parent
      // "descendants of X" = rows where target=X, then recurse
      const result = await tx.execute(sql`
        WITH RECURSIVE descendants AS (
          SELECT source_id, target_id, 0 AS depth
          FROM relationships
          WHERE target_id = ${thoughtId} AND kind = 'hierarchy'
          UNION ALL
          SELECT r.source_id, r.target_id, d.depth + 1
          FROM relationships r
          INNER JOIN descendants d ON r.target_id = d.source_id
          WHERE r.kind = 'hierarchy'
        )
        SELECT * FROM descendants ORDER BY depth
      `);

      return result.rows;
    });
  }

  async remove(userId: string, id: string, source: 'user' | 'mcp' = 'user') {
    const relationship = await this.findOne(userId, id);
    if (relationship.ownerId !== userId) throw new ForbiddenException(READ_ONLY_GRAPH_MESSAGE);

    await this.db.asUser(userId, async (tx) =>
      tx.delete(relationships).where(eq(relationships.id, id)),
    );

    this.workspaceEvents.emit(userId, 'relationship.deleted', {
      source,
      resourceId: id,
      projectId: relationship.projectId,
    });

    return { deleted: true };
  }
}
