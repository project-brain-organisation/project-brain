// @ts-nocheck — legacy service referencing removed schema columns; redesign in later backend-redesign-v2 steps
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { thoughts, chunks, thoughtLabels, labels } from '../database/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
// Legacy request shapes (class-validator DTOs removed in step 04-01). These
// deprecated `/thoughts` routes are rewired in step 05-01.
interface CreateThoughtDto {
  body?: string;
  title?: string;
  parentId?: string;
  isRoot?: boolean;
  canvasX?: number;
  canvasY?: number;
}
interface UpdateThoughtDto {
  body?: string;
  title?: string;
  parentId?: string;
  canvasX?: number;
  canvasY?: number;
  width?: number;
  height?: number;
}
import { EmbeddingService } from '../embedding/embedding.service';
import { ChunkingService } from '../chunking/chunking.service';

@Injectable()
export class ThoughtsService {
  private readonly logger = new Logger(ThoughtsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly embeddingService: EmbeddingService,
    private readonly chunkingService: ChunkingService,
  ) {}

  async findRoots(userId: string) {
    return this.db.db
      .select()
      .from(thoughts)
      .where(and(eq(thoughts.userId, userId), eq(thoughts.isRoot, true)))
      .orderBy(desc(thoughts.updatedAt));
  }

  async findByRoot(userId: string, rootId?: string) {
    const conditions = [eq(thoughts.userId, userId)];
    if (rootId) conditions.push(eq(thoughts.projectId, rootId));

    const projectThoughts = await this.db.db
      .select()
      .from(thoughts)
      .where(and(...conditions));

    // Fetch edge label assignments scoped to this project
    const edgeConditions = [eq(thoughts.userId, userId), eq(labels.isEdge, true)];
    if (rootId) edgeConditions.push(eq(thoughts.projectId, rootId));

    const edgeRows = await this.db.db
      .select({
        thoughtId: thoughtLabels.thoughtId,
        labelId: thoughtLabels.labelId,
        labelName: labels.name,
        labelColor: labels.color,
      })
      .from(thoughtLabels)
      .innerJoin(labels, eq(thoughtLabels.labelId, labels.id))
      .innerJoin(thoughts, eq(thoughtLabels.thoughtId, thoughts.id))
      .where(and(...edgeConditions));

    // Group edge labels by thought
    const edgeMap = new Map<string, { id: string; name: string; color: string }[]>();
    for (const row of edgeRows) {
      let arr = edgeMap.get(row.thoughtId);
      if (!arr) {
        arr = [];
        edgeMap.set(row.thoughtId, arr);
      }
      arr.push({ id: row.labelId, name: row.labelName, color: row.labelColor });
    }

    return projectThoughts.map((t) => ({
      ...t,
      edgeLabels: edgeMap.get(t.id) || [],
    }));
  }

  async findAll(userId: string, parentId?: string) {
    const conditions = [eq(thoughts.userId, userId)];
    if (parentId) conditions.push(eq(thoughts.parentId, parentId));

    const allThoughts = await this.db.db
      .select()
      .from(thoughts)
      .where(and(...conditions))
      .orderBy(desc(thoughts.createdAt));

    const edgeRows = await this.db.db
      .select({
        thoughtId: thoughtLabels.thoughtId,
        labelId: thoughtLabels.labelId,
        labelName: labels.name,
        labelColor: labels.color,
      })
      .from(thoughtLabels)
      .innerJoin(labels, eq(thoughtLabels.labelId, labels.id))
      .innerJoin(thoughts, eq(thoughtLabels.thoughtId, thoughts.id))
      .where(and(eq(thoughts.userId, userId), eq(labels.isEdge, true)));

    const edgeMap = new Map<string, { id: string; name: string; color: string }[]>();
    for (const row of edgeRows) {
      let arr = edgeMap.get(row.thoughtId);
      if (!arr) {
        arr = [];
        edgeMap.set(row.thoughtId, arr);
      }
      arr.push({ id: row.labelId, name: row.labelName, color: row.labelColor });
    }

    return allThoughts.map((t) => ({
      ...t,
      edgeLabels: edgeMap.get(t.id) || [],
    }));
  }

  async findOne(userId: string, thoughtId: string) {
    const [thought] = await this.db.db
      .select()
      .from(thoughts)
      .where(and(eq(thoughts.id, thoughtId), eq(thoughts.userId, userId)))
      .limit(1);
    if (!thought) throw new NotFoundException('Thought not found');
    return thought;
  }

  async create(userId: string, dto: CreateThoughtDto) {
    const contentHash = dto.body ? this.hashBody(dto.body) : null;
    const isRoot = dto.isRoot ?? !dto.parentId;

    // Determine projectId: for roots it's self (set after insert), for children inherit from parent
    let projectId: string | null = null;
    if (!isRoot && dto.parentId) {
      const parent = await this.findOne(userId, dto.parentId);
      projectId = parent.projectId ?? null;
    }

    const [thought] = await this.db.db
      .insert(thoughts)
      .values({
        userId,
        body: dto.body ?? '',
        title: dto.title ?? '',
        parentId: dto.parentId ?? null,
        projectId,
        isRoot,
        contentHash,
        canvasX: dto.canvasX ?? null,
        canvasY: dto.canvasY ?? null,
      })
      .returning();

    // Root thoughts reference themselves as projectId
    if (isRoot) {
      const [updated] = await this.db.db
        .update(thoughts)
        .set({ projectId: thought.id })
        .where(eq(thoughts.id, thought.id))
        .returning();
      Object.assign(thought, updated);
    }

    if (dto.body) {
      this.chunkAndEmbed(userId, thought.id, thought.body).catch((err) =>
        this.logger.warn(`Chunk/embed failed for thought ${thought.id}: ${err.message}`),
      );
    }

    return thought;
  }

  hashBody(body: string): string {
    return createHash('sha256')
      .update(body.trim().toLowerCase())
      .digest('hex');
  }

  private async chunkAndEmbed(userId: string, thoughtId: string, body: string) {
    const chunkTexts = this.chunkingService.chunk(body);

    const chunkRows = chunkTexts.map((text, i) => ({
      userId,
      thoughtId,
      body: text,
      chunkIndex: i,
    }));

    await this.db.db.insert(chunks).values(chunkRows);

    const vectors = await this.embeddingService.embed(chunkTexts);

    for (let i = 0; i < chunkTexts.length; i++) {
      await this.db.db
        .update(chunks)
        .set({ vectorEmbedding: vectors[i] })
        .where(
          and(
            eq(chunks.thoughtId, thoughtId),
            eq(chunks.chunkIndex, i),
          ),
        );
    }

    this.logger.log(`Chunked+embedded thought ${thoughtId} into ${chunkTexts.length} chunks`);
  }

  async update(userId: string, thoughtId: string, dto: UpdateThoughtDto) {
    await this.findOne(userId, thoughtId);
    const [updated] = await this.db.db
      .update(thoughts)
      .set({
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
        ...(dto.canvasX !== undefined && { canvasX: dto.canvasX }),
        ...(dto.canvasY !== undefined && { canvasY: dto.canvasY }),
        ...(dto.width !== undefined && { width: dto.width }),
        ...(dto.height !== undefined && { height: dto.height }),
        updatedAt: new Date(),
      })
      .where(and(eq(thoughts.id, thoughtId), eq(thoughts.userId, userId)))
      .returning();

    if (dto.body !== undefined) {
      await this.db.db.delete(chunks).where(eq(chunks.thoughtId, thoughtId));
      this.chunkAndEmbed(userId, thoughtId, dto.body).catch((err) =>
        this.logger.warn(`Re-chunk/embed failed for thought ${thoughtId}: ${err.message}`),
      );
    }

    return updated;
  }

  async remove(userId: string, thoughtId: string) {
    await this.findOne(userId, thoughtId);
    await this.db.db
      .delete(thoughts)
      .where(and(eq(thoughts.id, thoughtId), eq(thoughts.userId, userId)));
    return { deleted: true };
  }

  async semanticSearch(userId: string, query: string, n: number = 5) {
    const clampedN = Math.min(Math.max(n, 1), 20);
    const [queryVector] = await this.embeddingService.embed([query]);

    const results = await this.db.db.execute(sql`
      SELECT
        c.id AS "chunkId",
        c.thought_id AS "thoughtId",
        c.body AS "body",
        t.title AS "thoughtTitle",
        t.body AS "thoughtBody",
        1 - (c.vector_embedding <=> ${JSON.stringify(queryVector)}::vector) AS "score"
      FROM chunks c
      JOIN thoughts t ON t.id = c.thought_id
      WHERE c.user_id = ${userId}
        AND c.vector_embedding IS NOT NULL
      ORDER BY c.vector_embedding <=> ${JSON.stringify(queryVector)}::vector
      LIMIT ${clampedN}
    `);

    return results.rows;
  }
}
