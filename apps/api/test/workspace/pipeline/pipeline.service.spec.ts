/**
 * WorkspacePipelineService — port-to-port spec (PipelineService driving port)
 *
 * Scenario: "chunks written with project_id and semantic search scoped by project"
 *
 * The pipeline driving port is PipelineService. Its driven ports are mocked at the
 * boundary: DatabaseService (persistence), EmbeddingService (HTTP embedding call),
 * ChunkingService (pure splitter — real, it is in-hexagon pure logic).
 *
 * Test Budget: 2 distinct behaviors × 2 = 4 max unit tests
 * Behaviors:
 *   B1: chunkAndEmbed persists chunks with project_id (and NO user_id) then updates vectors
 *   B2: semanticSearch scopes the similarity query by the owning project_id
 *       (ownership isolation now via RLS — step 04-01 removed the assertOwnership gate)
 *
 * Note (step 02-02): DatabaseService double updated to include asUser() that
 * routes callbacks through the same drizzle tx double, satisfying the RLS wiring
 * added in step 02-02 without changing the behavioral assertions.
 * Note (step 04-01): ProjectsService removed from PipelineService constructor;
 * semanticSearch ownership-gate tests updated to reflect RLS enforcement.
 * Note (review-revision): semanticSearch now calls asUser() — execute spy lives on tx double.
 */

import { PipelineService } from '../../../src/workspace/pipeline/pipeline.service';
import { ChunkingService } from '../../../src/workspace/pipeline/chunking.service';
import type { EmbeddingService } from '../../../src/workspace/pipeline/embedding.service';
import type { DatabaseService } from '../../../src/database/database.service';

// ── Driven-port doubles ────────────────────────────────────────────

function makeEmbeddingService(vectors: number[][]): EmbeddingService {
  return {
    embed: jest.fn().mockResolvedValue(vectors),
  } as unknown as EmbeddingService;
}

/**
 * Persistence double recording insert values and update filters so the test can
 * assert the project_id propagation contract at the driven-port boundary.
 *
 * The tx double is shared by both asUser() calls in chunkAndEmbed (insert + update)
 * and the asUser() call in semanticSearch (execute). This keeps the double minimal
 * while satisfying the RLS wiring added in step-02-02 and review-revision.
 */
function makePersistenceDb() {
  const insertValues: Record<string, unknown>[] = [];

  const insertChain = {
    values: jest.fn((rows: Record<string, unknown>[]) => {
      insertValues.push(...rows);
      return Promise.resolve(undefined);
    }),
  };

  const updateChain = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(undefined),
  };

  // execute spy lives on tx so that semanticSearch (which calls asUser → tx.execute)
  // and callers that previously accessed db.db.execute directly both resolve correctly.
  const executeSpy = jest.fn().mockResolvedValue({ rows: [] });

  const tx = {
    insert: jest.fn().mockReturnValue(insertChain),
    update: jest.fn().mockReturnValue(updateChain),
    delete: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
    execute: executeSpy,
  };

  // asUser routes the callback through the same tx double so that all RLS-wrapped
  // calls in PipelineService are satisfied without a live DB.
  const asUser = jest.fn(
    (_userId: string, cb: (tx: typeof tx) => Promise<unknown>) => cb(tx),
  );

  return {
    dbService: { asUser } as unknown as DatabaseService,
    insertValues,
    tx,
    asUser,
    executeSpy,
  };
}

/**
 * Flatten a drizzle SQL object's queryChunks into literal text + bound values.
 * Chunks interleave StringChunk ({ value: string[] }), nested SQL objects
 * ({ queryChunks }), and raw bound values — nested fragments (e.g. the
 * conditional project filter) must be descended into, not skipped.
 */
function flattenSql(queryChunks: unknown[]): { text: string; values: unknown[] } {
  let text = '';
  const values: unknown[] = [];
  for (const chunk of queryChunks) {
    if (chunk && typeof chunk === 'object' && 'value' in chunk) {
      text += ((chunk as { value: string[] }).value ?? []).join('');
    } else if (chunk && typeof chunk === 'object' && 'queryChunks' in chunk) {
      const nested = flattenSql((chunk as { queryChunks: unknown[] }).queryChunks);
      text += nested.text;
      values.push(...nested.values);
    } else {
      values.push(chunk);
    }
  }
  return { text, values };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('WorkspacePipelineService', () => {
  // ── B1: chunk persistence carries project_id, never user_id ──────

  describe('chunkAndEmbed', () => {
    it.each([
      { projectId: 'proj-1', thoughtId: 'thought-1', body: 'hello world', ownerId: 'owner-a' },
      { projectId: 'proj-42', thoughtId: 'thought-9', body: 'a longer body of text', ownerId: 'owner-b' },
    ])(
      'persists chunks scoped by project_id (%o) with no user_id column',
      async ({ projectId, thoughtId, body, ownerId }) => {
        const { dbService, insertValues } = makePersistenceDb();
        const chunking = new ChunkingService();
        const expectedChunks = chunking.chunk(body);
        const embedding = makeEmbeddingService(expectedChunks.map(() => [0.1, 0.2]));

        const service = new PipelineService(dbService, embedding, chunking);

        await service.chunkAndEmbed(projectId, thoughtId, body, ownerId);

        // One inserted row per chunk
        expect(insertValues).toHaveLength(expectedChunks.length);
        for (const row of insertValues) {
          expect(row).toMatchObject({ projectId, thoughtId });
          // Persistence is project-scoped; no userId column (ownerId is the RLS param)
          expect(row).not.toHaveProperty('userId');
        }
        // Embedding driven port called with the chunk texts
        expect(embedding.embed).toHaveBeenCalledWith(expectedChunks);
      },
    );
  });

  // ── B2: project-scoped semantic search (RLS enforces ownership — step 04-01) ─

  describe('semanticSearch', () => {
    // Step 04-01: assertOwnership removed from semanticSearch; RLS on chunks table
    // scopes the similarity query to the current user's rows automatically.
    // review-revision: semanticSearch now calls asUser() — execute spy lives on tx.
    // The test verifies the SQL still scopes by project_id (not user_id).

    it('scopes the similarity query by the owning project_id (ownership via RLS)', async () => {
      const { dbService, tx, executeSpy } = makePersistenceDb();
      executeSpy.mockResolvedValue({
        rows: [{ chunkId: 'c1', thoughtId: 't1', body: 'match', score: 0.9 }],
      });
      const embedding = makeEmbeddingService([[0.5, 0.5]]);
      const service = new PipelineService(
        dbService,
        embedding,
        new ChunkingService(),
      );

      const results = await service.semanticSearch('owner', 'proj-7', 'find me');

      expect(executeSpy).toHaveBeenCalledTimes(1);

      // The parameterized SQL must scope by the owning project_id and must NOT
      // reference a user_id column. The project filter is a nested sql fragment
      // (it is conditional), so the chunks are flattened recursively.
      const sqlArg = executeSpy.mock.calls[0][0] as { queryChunks?: unknown[] };
      const { text: sqlText, values: boundValues } = flattenSql(sqlArg.queryChunks ?? []);

      expect(sqlText).toContain('project_id');
      expect(sqlText).not.toContain('user_id');
      // The owning project_id is bound as a parameter (project-scoped filter).
      expect(boundValues).toContain('proj-7');

      expect(results).toEqual([
        { chunkId: 'c1', thoughtId: 't1', body: 'match', score: 0.9 },
      ]);

      void tx; // suppress unused warning
    });

    it('searches all of the user\'s projects when projectId is omitted (RLS scopes rows)', async () => {
      const { dbService, asUser, executeSpy } = makePersistenceDb();
      const embedding = makeEmbeddingService([[0.5, 0.5]]);
      const service = new PipelineService(dbService, embedding, new ChunkingService());

      await service.semanticSearch('owner', undefined, 'find me');

      // Runs under the user's tenant context; no project filter in the SQL.
      expect(asUser).toHaveBeenCalledWith('owner', expect.any(Function));
      const sqlArg = executeSpy.mock.calls[0][0] as { queryChunks?: unknown[] };
      const { text: sqlText } = flattenSql(sqlArg.queryChunks ?? []);
      expect(sqlText).not.toContain('project_id');
      expect(sqlText).toContain('WHERE TRUE');
    });
  });
});
