import { Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { chunks } from '../../database/schema/index';
import { ChunkingService } from './chunking.service';
import { EmbeddingService } from './embedding.service';

/**
 * PipelineService — chunk → persist (project-scoped) → embed → update vectors,
 * plus project-scoped semantic search.
 *
 * Persistence is scoped by project_id (entities.id of the owning project).
 * All DB writes run inside DatabaseService.asUser(ownerId) so that RLS
 * policies see the correct app.current_user_id for the transaction.
 *
 * Ownership isolation for semanticSearch is now enforced entirely by RLS on
 * the chunks table — assertOwnership removed (step 04-01).
 */
@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly embeddingService: EmbeddingService,
    private readonly chunkingService: ChunkingService,
  ) {}

  /**
   * Re-chunk + re-embed a thought body. Persists chunks inside asUser(ownerId)
   * so RLS withCheck constraints are satisfied. Embeddings are computed outside
   * the transaction (no DB write, pure HTTP call) then written back via a second
   * asUser transaction. Intended to be called fire-and-forget by ThoughtsService.
   */
  async chunkAndEmbed(
    projectId: string,
    thoughtId: string,
    body: string,
    ownerId: string,
  ): Promise<void> {
    const chunkTexts = this.chunkingService.chunk(body);
    if (chunkTexts.length === 0) return;

    const chunkRows = chunkTexts.map((text, index) => ({
      projectId,
      ownerId,
      thoughtId,
      body: text,
      chunkIndex: index,
    }));

    // Insert chunks under the owner's tenant context so RLS withCheck passes.
    await this.db.asUser(ownerId, async (tx) => {
      await tx.insert(chunks).values(chunkRows);
    });

    // Embedding is a pure HTTP call — no DB write, runs outside any transaction.
    const vectors = await this.embeddingService.embed(chunkTexts);

    // Back-fill vector embeddings under the same tenant context.
    await this.db.asUser(ownerId, async (tx) => {
      for (let index = 0; index < chunkTexts.length; index++) {
        await tx
          .update(chunks)
          .set({ vectorEmbedding: vectors[index] })
          .where(and(eq(chunks.thoughtId, thoughtId), eq(chunks.chunkIndex, index)));
      }
    });

    this.logger.log(
      `Chunked+embedded thought ${thoughtId} into ${chunkTexts.length} chunks (project ${projectId})`,
    );
  }

  /**
   * Re-chunk a thought after a body edit: drop existing chunks then re-run the
   * pipeline. All DB writes (delete + re-insert + vector update) run under
   * asUser(ownerId) to satisfy RLS. Preserves async/background behaviour at the
   * call site.
   */
  async rechunk(
    projectId: string,
    thoughtId: string,
    body: string,
    ownerId: string,
  ): Promise<void> {
    await this.db.asUser(ownerId, async (tx) => {
      await tx.delete(chunks).where(eq(chunks.thoughtId, thoughtId));
    });
    await this.chunkAndEmbed(projectId, thoughtId, body, ownerId);
  }

  /**
   * Semantic search, scoped through asUser(userId) so RLS sees the tenant.
   *
   * Scope rules:
   *   - projectId given  → search that project. RLS makes this work for a graph
   *     the user owns OR a public one they can read (subscribed/discoverable),
   *     so this is how you deliberately search a public graph.
   *   - projectId omitted → search only the user's OWNED chunks. Without the
   *     explicit owner filter the chunks_public_read policy would fold every
   *     public project on the platform into an unscoped search — surprising and
   *     unwanted. Public graphs are opt-in per projectId.
   */
  async semanticSearch(
    userId: string,
    projectId: string | undefined,
    query: string,
    n: number = 5,
  ) {
    const clampedN = Math.min(Math.max(n, 1), 20);
    const [queryVector] = await this.embeddingService.embed([query]);
    const projectFilter = projectId
      ? sql`c.project_id = ${projectId}`
      : sql`c.owner_id = ${userId}`;

    return this.db.asUser(userId, async (tx) => {
      const results = await tx.execute(sql`
        SELECT
          c.id AS "chunkId",
          c.thought_id AS "thoughtId",
          c.body AS "body",
          t.title AS "thoughtTitle",
          t.body AS "thoughtBody",
          1 - (c.vector_embedding <=> ${JSON.stringify(queryVector)}::vector) AS "score"
        FROM chunks c
        JOIN thoughts t ON t.id = c.thought_id
        WHERE ${projectFilter}
          AND c.vector_embedding IS NOT NULL
        ORDER BY c.vector_embedding <=> ${JSON.stringify(queryVector)}::vector
        LIMIT ${clampedN}
      `);

      return results.rows;
    });
  }
}
