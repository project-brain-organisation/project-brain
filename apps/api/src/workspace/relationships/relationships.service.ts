import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { ProjectsService } from '../../projects/projects.service';
import { WorkspaceEventsService } from '../gateway/workspace-events.service';
import { entities, relationships } from '../../database/schema/index';
import { CreateRelationshipDto } from './dto/create-relationship.dto';

@Injectable()
export class RelationshipsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly projectsService: ProjectsService,
    private readonly workspaceEvents: WorkspaceEventsService,
  ) {}

  async create(userId: string, dto: CreateRelationshipDto, source: 'user' | 'mcp' = 'user') {
    await this.projectsService.assertOwnership(userId, dto.projectId);

    // Load source entity
    const [source_entity] = await this.db.db
      .select()
      .from(entities)
      .where(eq(entities.id, dto.sourceId))
      .limit(1);

    if (!source_entity) {
      throw new NotFoundException(`Entity ${dto.sourceId} not found`);
    }

    // Load target entity
    const [target_entity] = await this.db.db
      .select()
      .from(entities)
      .where(eq(entities.id, dto.targetId))
      .limit(1);

    if (!target_entity) {
      throw new NotFoundException(`Entity ${dto.targetId} not found`);
    }

    // Cross-project invariant
    if (source_entity.projectId !== dto.projectId || target_entity.projectId !== dto.projectId) {
      throw new BadRequestException('Cross-project relationships are not allowed');
    }

    // Per-kind endpoint-type validation
    if (dto.kind === 'hierarchy') {
      if (source_entity.type !== 'thought' || target_entity.type !== 'thought') {
        throw new BadRequestException('hierarchy relationships require thought/thought endpoints');
      }
    } else if (dto.kind === 'tag') {
      if (source_entity.type !== 'thought' || target_entity.type !== 'label') {
        throw new BadRequestException('tag relationships require thought→label');
      }
    }
    // edge: no type restriction

    try {
      const [relationship] = await this.db.db
        .insert(relationships)
        .values({
          projectId: dto.projectId,
          ownerId: userId,
          sourceId: dto.sourceId,
          targetId: dto.targetId,
          kind: dto.kind,
          labelId: dto.labelId ?? null,
        })
        .returning();

      this.workspaceEvents.publish(userId, {
        eventId: crypto.randomUUID(),
        type: 'relationship.created',
        source,
        resourceId: relationship.id,
        projectId: dto.projectId,
        timestamp: new Date().toISOString(),
      });

      return relationship;
    } catch (err) {
      if ((err as Record<string, unknown>)?.code === '23505') {
        throw new ConflictException('Relationship already exists');
      }
      throw err;
    }
  }

  async findByProject(userId: string, projectId: string, kind?: 'hierarchy' | 'tag' | 'edge') {
    await this.projectsService.assertOwnership(userId, projectId);

    const query = this.db.db
      .select()
      .from(relationships)
      .where(
        kind
          ? and(eq(relationships.projectId, projectId), eq(relationships.kind, kind))
          : eq(relationships.projectId, projectId),
      );

    return query;
  }

  async findOne(userId: string, id: string) {
    const [relationship] = await this.db.db
      .select()
      .from(relationships)
      .where(eq(relationships.id, id))
      .limit(1);

    if (!relationship) {
      throw new NotFoundException(`Relationship ${id} not found`);
    }

    await this.projectsService.assertOwnership(userId, relationship.projectId);

    return relationship;
  }

  async findDescendants(userId: string, thoughtId: string) {
    // Load entity to get projectId for ownership check
    const [entity] = await this.db.db
      .select()
      .from(entities)
      .where(eq(entities.id, thoughtId))
      .limit(1);

    if (!entity) {
      throw new NotFoundException(`Entity ${thoughtId} not found`);
    }

    await this.projectsService.assertOwnership(userId, entity.projectId);

    // Recursive CTE: source=child, target=parent
    // "descendants of X" = rows where target=X, then recurse
    const result = await this.db.db.execute(sql`
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
  }

  async remove(userId: string, id: string, source: 'user' | 'mcp' = 'user') {
    const relationship = await this.findOne(userId, id);

    await this.db.db.delete(relationships).where(eq(relationships.id, id));

    this.workspaceEvents.publish(userId, {
      eventId: crypto.randomUUID(),
      type: 'relationship.deleted',
      source,
      resourceId: id,
      projectId: relationship.projectId,
      timestamp: new Date().toISOString(),
    });

    return { deleted: true };
  }
}
