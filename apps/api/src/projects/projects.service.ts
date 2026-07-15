import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { and, eq, getTableColumns, ne } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { WorkspaceEventsService } from '../workspace/gateway/workspace-events.service';
import {
  entities,
  projectMeta,
  projectSubscriptions,
  users,
  thoughts,
  labels,
  relationships,
  chunks,
} from '../database/schema/index';

export type ProjectRole = 'owner' | 'subscriber';

/** Shown when a caller tries to write to a public graph they can read but
 *  don't own (a subscribed/discoverable graph). */
export const READ_ONLY_GRAPH_MESSAGE =
  'This graph is read-only — you added it but do not own it.';

/** pgvector round-trips as a string through the neon driver; normalise back to
 *  a number[] so the customType re-encodes it correctly on re-insert. */
function normalizeVector(v: unknown): number[] | null {
  if (v == null) return null;
  return typeof v === 'string' ? (JSON.parse(v) as number[]) : (v as number[]);
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly workspaceEvents: WorkspaceEventsService,
  ) {}

  async assertOwnership(userId: string, projectId: string): Promise<void> {
    const [meta] = await this.db.asUser(userId, (tx) =>
      tx.select().from(projectMeta).where(eq(projectMeta.id, projectId)).limit(1),
    );
    // A public project is visible here via project_meta_public_read even when
    // owned by someone else — distinguish "can't see it at all" from "can see
    // it but it's not yours" so read-only graphs get an actionable message.
    if (!meta) {
      throw new ForbiddenException('Project not found or access denied');
    }
    if (meta.ownerId !== userId) {
      throw new ForbiddenException(READ_ONLY_GRAPH_MESSAGE);
    }
  }

  async create(
    userId: string,
    data: { name: string; emoji?: string; isPublic?: boolean },
    source: 'user' | 'mcp' = 'user',
  ) {
    const meta = await this.db.asUser(userId, async (tx) => {
      const id = crypto.randomUUID();
      await tx.insert(entities).values({ id, projectId: id, type: 'project' });
      const [row] = await tx
        .insert(projectMeta)
        .values({
          id,
          ownerId: userId,
          name: data.name,
          emoji: data.emoji ?? null,
          isPublic: data.isPublic ?? true,
        })
        .returning();
      return { ...row, role: 'owner' as ProjectRole };
    });

    this.workspaceEvents.emit(userId, 'project.created', {
      source,
      resourceId: meta.id,
      projectId: meta.id,
    });

    return meta;
  }

  /**
   * Deep-copy any *readable* graph (one you own or a public one) into a fresh
   * project owned by the caller — a "fork" that edits freely without touching
   * the source. Runs in one asUser(caller) transaction: reads land through the
   * caller's owner/public_read RLS policies, and every inserted row is stamped
   * owner_id = caller so withCheck passes and the clone is wholly theirs.
   *
   * The clone starts private (isPublic:false) regardless of the source — the
   * owner shares it deliberately via the sidebar. Vectors are copied verbatim
   * (no re-embedding cost); ids are remapped through a single old→new map that
   * spans thoughts *and* labels, since relationships reference either.
   */
  async clone(userId: string, sourceId: string) {
    const meta = await this.db.asUser(userId, async (tx) => {
      const [source] = await tx
        .select()
        .from(projectMeta)
        .where(eq(projectMeta.id, sourceId))
        .limit(1);
      if (!source) {
        throw new NotFoundException('Project not found or access denied');
      }

      const newProjectId = crypto.randomUUID();
      await tx
        .insert(entities)
        .values({ id: newProjectId, projectId: newProjectId, type: 'project' });
      const [project] = await tx
        .insert(projectMeta)
        .values({
          id: newProjectId,
          ownerId: userId,
          name: source.name,
          emoji: source.emoji,
          color: source.color,
          isPublic: false,
        })
        .returning();

      const [srcThoughts, srcLabels, srcRels, srcChunks] = await Promise.all([
        tx.select().from(thoughts).where(eq(thoughts.projectId, sourceId)),
        tx.select().from(labels).where(eq(labels.projectId, sourceId)),
        tx.select().from(relationships).where(eq(relationships.projectId, sourceId)),
        tx.select().from(chunks).where(eq(chunks.projectId, sourceId)),
      ]);

      const idMap = new Map<string, string>();
      for (const t of srcThoughts) idMap.set(t.id, crypto.randomUUID());
      for (const l of srcLabels) idMap.set(l.id, crypto.randomUUID());
      const remap = (id: string) => idMap.get(id) ?? id;

      // Batched inserts guard against pg's parameter ceiling on large graphs.
      const BATCH = 500;
      const insertAll = async (table: any, rows: any[]) => {
        for (let i = 0; i < rows.length; i += BATCH) {
          await tx.insert(table).values(rows.slice(i, i + BATCH));
        }
      };

      // Entities first so subtype rows and relationship FKs resolve.
      await insertAll(entities, [
        ...srcThoughts.map((t) => ({ id: remap(t.id), projectId: newProjectId, type: 'thought' as const })),
        ...srcLabels.map((l) => ({ id: remap(l.id), projectId: newProjectId, type: 'label' as const })),
      ]);

      await insertAll(
        thoughts,
        srcThoughts.map((t) => ({
          id: remap(t.id),
          projectId: newProjectId,
          ownerId: userId,
          color: t.color,
          body: t.body,
          title: t.title,
          contentHash: t.contentHash,
          canvasX: t.canvasX,
          canvasY: t.canvasY,
          width: t.width,
          height: t.height,
        })),
      );

      await insertAll(
        labels,
        srcLabels.map((l) => ({
          id: remap(l.id),
          projectId: newProjectId,
          ownerId: userId,
          name: l.name,
          color: l.color,
          isEdge: l.isEdge,
        })),
      );

      await insertAll(
        relationships,
        srcRels.map((r) => ({
          projectId: newProjectId,
          ownerId: userId,
          sourceId: remap(r.sourceId),
          targetId: remap(r.targetId),
          kind: r.kind,
          labelId: r.labelId ? remap(r.labelId) : null,
        })),
      );

      await insertAll(
        chunks,
        srcChunks.map((c) => ({
          thoughtId: remap(c.thoughtId),
          projectId: newProjectId,
          ownerId: userId,
          body: c.body,
          chunkIndex: c.chunkIndex,
          vectorEmbedding: normalizeVector(c.vectorEmbedding),
        })),
      );

      return { ...project, role: 'owner' as ProjectRole };
    });

    this.workspaceEvents.emit(userId, 'project.created', {
      source: 'user',
      resourceId: meta.id,
      projectId: meta.id,
    });

    return meta;
  }

  /** Owned projects plus still-public subscribed ones, each tagged with a role.
   *  The subscribed join goes through project_meta under RLS: a project the
   *  owner re-privatised drops out here without any cleanup.
   *  `includeSubscribed: false` restores owned-only (the MCP surface, which has
   *  no notion of subscriptions yet). */
  async findAllByUser(userId: string, { includeSubscribed = true } = {}) {
    return this.db.asUser(userId, async (tx) => {
      const owned = await tx
        .select()
        .from(projectMeta)
        .where(eq(projectMeta.ownerId, userId));
      if (!includeSubscribed) {
        return owned.map((p) => ({ ...p, role: 'owner' as ProjectRole }));
      }
      const subscribed = await tx
        .select({ ...getTableColumns(projectMeta), ownerName: users.username })
        .from(projectSubscriptions)
        .innerJoin(projectMeta, eq(projectMeta.id, projectSubscriptions.projectId))
        .innerJoin(users, eq(users.id, projectMeta.ownerId))
        .where(eq(projectSubscriptions.userId, userId));
      return [
        ...owned.map((p) => ({ ...p, role: 'owner' as ProjectRole })),
        ...subscribed.map((p) => ({ ...p, role: 'subscriber' as ProjectRole })),
      ];
    });
  }

  /** All public projects except the caller's own — the Discover dialog's feed. */
  async findPublic(userId: string) {
    return this.db.asUser(userId, (tx) =>
      tx
        .select({ ...getTableColumns(projectMeta), ownerName: users.username })
        .from(projectMeta)
        .innerJoin(users, eq(users.id, projectMeta.ownerId))
        .where(and(eq(projectMeta.isPublic, true), ne(projectMeta.ownerId, userId)))
        .orderBy(projectMeta.name),
    );
  }

  async subscribe(userId: string, projectId: string) {
    return this.db.asUser(userId, async (tx) => {
      const [meta] = await tx
        .select()
        .from(projectMeta)
        .where(and(eq(projectMeta.id, projectId), eq(projectMeta.isPublic, true)))
        .limit(1);
      if (!meta) throw new NotFoundException('Public project not found');
      if (meta.ownerId === userId) {
        throw new BadRequestException('You already own this project');
      }
      await tx
        .insert(projectSubscriptions)
        .values({ userId, projectId })
        .onConflictDoNothing();
      return { ...meta, role: 'subscriber' as ProjectRole };
    });
  }

  async unsubscribe(userId: string, projectId: string) {
    await this.db.asUser(userId, (tx) =>
      tx
        .delete(projectSubscriptions)
        .where(
          and(
            eq(projectSubscriptions.userId, userId),
            eq(projectSubscriptions.projectId, projectId),
          ),
        ),
    );
    return { deleted: true };
  }

  async findOne(userId: string, projectId: string) {
    await this.assertOwnership(userId, projectId);
    const [meta] = await this.db.asUser(userId, (tx) =>
      tx.select().from(projectMeta).where(eq(projectMeta.id, projectId)).limit(1),
    );
    return meta;
  }

  async update(
    userId: string,
    projectId: string,
    data: Partial<{ name: string; emoji: string; isPublic: boolean; color: string | null }>,
    source: 'user' | 'mcp' = 'user',
  ) {
    await this.assertOwnership(userId, projectId);
    const [updated] = await this.db.asUser(userId, (tx) =>
      tx
        .update(projectMeta)
        .set({
          ...(data.name !== undefined && { name: data.name }),
          ...(data.emoji !== undefined && { emoji: data.emoji }),
          ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
          ...(data.color !== undefined && { color: data.color }),
        })
        .where(eq(projectMeta.id, projectId))
        .returning(),
    );

    this.workspaceEvents.emit(userId, 'project.updated', {
      source,
      resourceId: projectId,
      projectId,
    });

    return updated;
  }

  async remove(userId: string, projectId: string, source: 'user' | 'mcp' = 'user') {
    await this.assertOwnership(userId, projectId);
    await this.db.asUser(userId, (tx) =>
      tx.delete(entities).where(eq(entities.id, projectId)),
    );

    this.workspaceEvents.emit(userId, 'project.deleted', {
      source,
      resourceId: projectId,
      projectId,
    });

    return { deleted: true };
  }
}
