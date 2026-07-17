import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { eq, getTableColumns, inArray } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { isUniqueViolation } from '../../database/pg-errors';
import { ProjectsService, READ_ONLY_GRAPH_MESSAGE } from '../../projects/projects.service';
import { PipelineService } from '../pipeline/pipeline.service';
import { WorkspaceEventsService } from '../gateway/workspace-events.service';
import { entities, relationships, thoughts } from '../../database/schema/index';
import { CreateThoughtDto } from './dto/create-thought.dto';

@Injectable()
export class ThoughtsService {
  private readonly logger = new Logger(ThoughtsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly projectsService: ProjectsService,
    private readonly pipelineService: PipelineService,
    private readonly workspaceEvents: WorkspaceEventsService,
  ) {}

  async create(userId: string, dto: CreateThoughtDto, source: 'user' | 'mcp' = 'user') {
    await this.projectsService.assertOwnership(userId, dto.projectId);

    const thought = await this.db
      .asUser(userId, async (tx) => {
        const id = dto.id ?? crypto.randomUUID();

        await tx
          .insert(entities)
          .values({ id, projectId: dto.projectId, type: 'thought' })
          .returning();

        const [row] = await tx
          .insert(thoughts)
          .values({
            id,
            projectId: dto.projectId,
            ownerId: userId,
            body: dto.body,
            title: dto.title ?? '',
            color: dto.color ?? null,
            canvasX: dto.canvasX ?? null,
            canvasY: dto.canvasY ?? null,
            width: dto.width ?? null,
            height: dto.height ?? null,
          })
          .returning();

        // Composite create: parent in the same tx so the client pays one
        // round trip and never observes a thought without its hierarchy edge.
        let parentRelationshipId: string | null = null;
        if (dto.parentId) {
          const [parent] = await tx
            .select()
            .from(entities)
            .where(eq(entities.id, dto.parentId))
            .limit(1);
          if (!parent || parent.type !== 'thought' || parent.projectId !== dto.projectId) {
            throw new BadRequestException('parentId must be a thought in the same project');
          }
          const [rel] = await tx
            .insert(relationships)
            .values({
              projectId: dto.projectId,
              ownerId: userId,
              sourceId: id,
              targetId: dto.parentId,
              kind: 'hierarchy',
            })
            .returning();
          parentRelationshipId = rel.id;
        }

        return { ...row, parentRelationshipId };
      })
      .catch((err) => {
        if (isUniqueViolation(err)) throw new ConflictException('Thought already exists');
        throw err;
      });

    this.workspaceEvents.emit(userId, 'thought.created', {
      source,
      resourceId: thought.id,
      projectId: dto.projectId,
    });

    // Fire-and-forget chunk+embed scoped to the owning project (async/background).
    if (dto.body) {
      this.pipelineService
        .chunkAndEmbed(dto.projectId, [{ thoughtId: thought.id, body: dto.body }], userId)
        .catch((err) =>
          this.logger.warn(`Chunk/embed failed for thought ${thought.id}: ${err.message}`),
        );
    }

    return thought;
  }

  /**
   * All-or-nothing batch create: one ownership check, one transaction, one SSE
   * event, one embedding pass — clone()'s techniques fed from caller args. An
   * item nests under another item in the same batch by pointing parentRef at
   * that item's ref (refs are resolved to fresh uuids server-side and never
   * persist), or under an existing thought via parentId.
   */
  async createBatch(
    userId: string,
    projectId: string,
    items: { ref?: string; body: string; title?: string; parentRef?: string; parentId?: string }[],
    source: 'user' | 'mcp' = 'user',
  ) {
    if (items.length === 0) throw new BadRequestException('Batch is empty');
    await this.projectsService.assertOwnership(userId, projectId);

    const itemByRef = new Map<string, (typeof items)[number]>();
    for (const item of items) {
      if (!item.ref) continue;
      if (itemByRef.has(item.ref)) {
        throw new BadRequestException(`Duplicate ref '${item.ref}' in batch`);
      }
      itemByRef.set(item.ref, item);
    }
    for (const item of items) {
      if (item.parentRef && item.parentId) {
        throw new BadRequestException('Give parentRef (in-batch) or parentId (existing), not both');
      }
      if (item.parentRef && !itemByRef.has(item.parentRef)) {
        throw new BadRequestException(`parentRef '${item.parentRef}' matches no ref in this batch`);
      }
    }
    // A parentRef loop would insert cleanly and corrupt the hierarchy.
    for (const item of items) {
      const seen = new Set<string>();
      let cur: (typeof items)[number] | undefined = item;
      while (cur?.parentRef) {
        if (seen.has(cur.parentRef)) {
          throw new BadRequestException(`parentRef chain through '${cur.parentRef}' forms a cycle`);
        }
        seen.add(cur.parentRef);
        cur = itemByRef.get(cur.parentRef);
      }
    }

    const idByRef = new Map([...itemByRef.keys()].map((ref) => [ref, crypto.randomUUID()]));
    const ids = items.map((item) => (item.ref ? idByRef.get(item.ref)! : crypto.randomUUID()));
    const existingParentIds = [
      ...new Set(items.map((i) => i.parentId).filter((v): v is string => !!v)),
    ];

    const created = await this.db
      .asUser(userId, async (tx) => {
        if (existingParentIds.length > 0) {
          const parents = await tx
            .select()
            .from(entities)
            .where(inArray(entities.id, existingParentIds));
          const parentById = new Map(parents.map((p) => [p.id, p]));
          for (const id of existingParentIds) {
            const parent = parentById.get(id);
            if (!parent || parent.type !== 'thought' || parent.projectId !== projectId) {
              throw new BadRequestException(
                `parentId ${id} must be a thought in the same project`,
              );
            }
          }
        }

        // Batched inserts guard against pg's parameter ceiling, cf. clone().
        const BATCH = 500;
        const insertAll = async (table: any, rows: any[]) => {
          const returned: any[] = [];
          for (let i = 0; i < rows.length; i += BATCH) {
            const batch = (await tx
              .insert(table)
              .values(rows.slice(i, i + BATCH))
              .returning()) as any[];
            returned.push(...batch);
          }
          return returned;
        };

        // Entities first so thought rows and hierarchy FKs resolve.
        await insertAll(
          entities,
          ids.map((id) => ({ id, projectId, type: 'thought' as const })),
        );
        const rows = await insertAll(
          thoughts,
          items.map((item, i) => ({
            id: ids[i],
            projectId,
            ownerId: userId,
            body: item.body,
            title: item.title ?? '',
          })),
        );
        await insertAll(
          relationships,
          items.flatMap((item, i) => {
            const parentId = item.parentRef ? idByRef.get(item.parentRef)! : item.parentId;
            return parentId
              ? [{ projectId, ownerId: userId, sourceId: ids[i], targetId: parentId, kind: 'hierarchy' as const }]
              : [];
          }),
        );

        // Echo each item's ref beside its real id so callers can map.
        return rows.map((row, i) => ({ ...row, ref: items[i].ref ?? null }));
      })
      .catch((err) => {
        if (isUniqueViolation(err)) throw new ConflictException('Thought already exists');
        throw err;
      });

    // One coarse event after commit — the web client refetches the whole
    // workspace snapshot per event, so per-row emits would just be a storm.
    this.workspaceEvents.emit(userId, 'thought.created', {
      source,
      resourceId: created[0].id,
      projectId,
    });

    const bodies = created.map((t) => ({ thoughtId: t.id, body: t.body }));
    this.pipelineService
      .chunkAndEmbed(projectId, bodies, userId)
      .catch((err) =>
        this.logger.warn(`Chunk/embed failed for batch of ${bodies.length}: ${err.message}`),
      );

    return created;
  }

  async update(
    userId: string,
    id: string,
    patch: {
      body?: string;
      title?: string;
      color?: string | null;
      canvasX?: number | null;
      canvasY?: number | null;
      width?: number | null;
      height?: number | null;
    },
    source: 'user' | 'mcp' = 'user',
  ) {
    const thought = await this.findOne(userId, id);
    // findOne succeeds for a readable public thought; block the write so RLS
    // doesn't silently no-op (0 rows) and leave callers thinking it worked.
    if (thought.ownerId !== userId) throw new ForbiddenException(READ_ONLY_GRAPH_MESSAGE);

    const [updated] = await this.db.asUser(userId, async (tx) => {
      // Timestamps live on the entities supertype; without this bump
      // updated_at would stay at creation time forever.
      await tx.update(entities).set({ updatedAt: new Date() }).where(eq(entities.id, id));
      return tx
        .update(thoughts)
        .set({
          ...(patch.body !== undefined && { body: patch.body }),
          ...(patch.title !== undefined && { title: patch.title }),
          ...(patch.color !== undefined && { color: patch.color }),
          ...(patch.canvasX !== undefined && { canvasX: patch.canvasX }),
          ...(patch.canvasY !== undefined && { canvasY: patch.canvasY }),
          ...(patch.width !== undefined && { width: patch.width }),
          ...(patch.height !== undefined && { height: patch.height }),
        })
        .where(eq(thoughts.id, id))
        .returning();
    });

    // Re-chunk + re-embed only when the body text actually changed.
    if (patch.body !== undefined && patch.body !== thought.body) {
      this.pipelineService
        .rechunk(thought.projectId, id, patch.body, userId)
        .catch((err) =>
          this.logger.warn(`Re-chunk/embed failed for thought ${id}: ${err.message}`),
        );
    }

    this.workspaceEvents.emit(userId, 'thought.updated', {
      source,
      resourceId: id,
      projectId: thought.projectId,
    });

    return updated;
  }

  async semanticSearch(userId: string, projectId: string | undefined, query: string, n?: number) {
    return this.pipelineService.semanticSearch(userId, projectId, query, n);
  }

  async findByProject(userId: string, projectId: string) {
    // Ownership isolation is enforced by RLS — only rows owned by the current
    // user are visible on this read path. Timestamps live on the entities
    // supertype row (TPT), not on thoughts.
    return this.db.asUser(userId, async (tx) =>
      tx
        .select({ ...getTableColumns(thoughts), createdAt: entities.createdAt, updatedAt: entities.updatedAt })
        .from(thoughts)
        .innerJoin(entities, eq(entities.id, thoughts.id))
        .where(eq(thoughts.projectId, projectId)),
    );
  }

  async findOne(userId: string, id: string) {
    // Ownership isolation is enforced by RLS — unauthorized rows are invisible,
    // so the 404 below covers both missing and cross-tenant ids. Mutators lean
    // on this by loading through findOne before writing.
    const thought = await this.db.asUser(userId, async (tx) => {
      const [row] = await tx
        .select()
        .from(thoughts)
        .where(eq(thoughts.id, id))
        .limit(1);
      return row;
    });

    if (!thought) {
      throw new NotFoundException(`Thought ${id} not found`);
    }

    return thought;
  }

  async remove(userId: string, id: string, source: 'user' | 'mcp' = 'user') {
    const thought = await this.findOne(userId, id);
    if (thought.ownerId !== userId) throw new ForbiddenException(READ_ONLY_GRAPH_MESSAGE);

    await this.db.asUser(userId, async (tx) =>
      tx.delete(entities).where(eq(entities.id, id)),
    );

    this.workspaceEvents.emit(userId, 'thought.deleted', {
      source,
      resourceId: id,
      projectId: thought.projectId,
    });

    return { deleted: true };
  }
}
