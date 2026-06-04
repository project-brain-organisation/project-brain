import { Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { ProjectsService } from '../../projects/projects.service';
import { chunks } from '../../database/schema/index';
import { ChunkingService } from './chunking.service';
import { EmbeddingService } from './embedding.service';

/**
 * PipelineService — chunk → persist (project-scoped) → embed → update vectors,
 * plus project-scoped, ownership-gated semantic search.
 *
 * Persistence is scoped by project_id (entities.id of the owning project),
 * NEVER by user_id. The thought's project is supplied by the caller (available
 * as entities.projectId for the thought's id).
 */
@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly embeddingService: EmbeddingService,
    private readonly chunkingService: ChunkingService,
    private readonly projectsService: ProjectsService,
  ) {}

  /**
   * Re-chunk + re-embed a thought body. Persists chunks scoped to the owning
   * project_id then back-fills vector embeddings. Intended to be called
   * fire-and-forget by ThoughtsService create/update with a logged catch so the
   * caller returns without awaiting embedding.
   */
  async chunkAndEmbed(projectId: string, thoughtId: string, body: string): Promise<void> {
    const chunkTexts = this.chunkingService.chunk(body);
    if (chunkTexts.length === 0) return;

    const chunkRows = chunkTexts.map((text, index) => ({
      projectId,
      thoughtId,
      body: text,
      chunkIndex: index,
    }));

    await this.db.db.insert(chunks).values(chunkRows);

    const vectors = await this.embeddingService.embed(chunkTexts);

    for (let index = 0; index < chunkTexts.length; index++) {
      await this.db.db
        .update(chunks)
        .set({ vectorEmbedding: vectors[index] })
        .where(and(eq(chunks.thoughtId, thoughtId), eq(chunks.chunkIndex, index)));
    }

    this.logger.log(
      `Chunked+embedded thought ${thoughtId} into ${chunkTexts.length} chunks (project ${projectId})`,
    );
  }

  /**
   * Re-chunk a thought after a body edit: drop existing chunks then re-run the
   * pipeline. Preserves async/background behaviour at the call site.
   */
  async rechunk(projectId: string, thoughtId: string, body: string): Promise<void> {
    await this.db.db.delete(chunks).where(eq(chunks.thoughtId, thoughtId));
    await this.chunkAndEmbed(projectId, thoughtId, body);
  }

  /**
   * Project-scoped, ownership-gated semantic search. Ownership is asserted
   * BEFORE any DB access; similarity is filtered by c.project_id (never user_id).
   */
  async semanticSearch(userId: string, projectId: string, query: string, n: number = 5) {
    await this.projectsService.assertOwnership(userId, projectId);

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
      WHERE c.project_id = ${projectId}
        AND c.vector_embedding IS NOT NULL
      ORDER BY c.vector_embedding <=> ${JSON.stringify(queryVector)}::vector
      LIMIT ${clampedN}
    `);

    return results.rows;
  }
}
