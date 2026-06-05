/**
 * DatabaseService — tenant-context spec (step 02-02)
 *
 * Scenario: "Property: asUser scopes app.current_user_id to the request user and asSystem omits it"
 *
 * Test Budget: 4 distinct behaviors × 2 = 8 max unit tests
 * Behaviors:
 *   B1: asUser calls set_config with the userId (property: arbitrary uuid — exercised via it.each)
 *   B2: asUser exposes the userId via getCurrentUserId inside the callback (ALS store)
 *   B3: asSystem does NOT call set_config (system context omits tenant)
 *   B4: pipeline chunkAndEmbed / rechunk DB writes are wrapped in asUser(ownerId)
 *
 * "Property" (criterion 5): fast-check not installed — property exercised via it.each
 * with 5 representative UUIDs covering the arbitrary-userId invariant.
 *
 * No live DB required: the internal drizzle db.transaction is patched with a
 * controlled spy that invokes the callback synchronously, allowing inspection of
 * tx.execute arguments without a real Postgres connection.
 */

import { DatabaseService } from '../../src/database/database.service';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build a DatabaseService instance with the internal `db` drizzle instance
 * replaced by a controlled double whose transaction() immediately invokes cb(tx).
 * The tx spy records all execute() calls so we can assert set_config behavior.
 */
function makePatchedDbService() {
  const executeSpy = jest.fn().mockResolvedValue({ rows: [] });
  const tx = {
    execute: executeSpy,
    insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }),
    update: jest
      .fn()
      .mockReturnValue({ set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue(undefined) }),
    delete: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
  };

  // Use Object.create to bypass the constructor (which needs env vars + Pool).
  const dbService = Object.create(DatabaseService.prototype) as DatabaseService;

  // Patch the `db` field (the drizzle NeonDatabase instance) with a controlled double.
  // asUser/asSystem call this.db.transaction(cb) — we intercept at that boundary.
  Object.defineProperty(dbService, 'db', {
    value: {
      transaction: jest.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    },
    writable: true,
  });

  return { dbService, tx, executeSpy };
}

/**
 * Extract the userId bound into set_config from the tx.execute spy calls.
 * Drizzle sql`` objects expose queryChunks: an array of StringChunk (with `.value: string[]`)
 * and parameter nodes (plain values). We find the set_config call and return its
 * first bound parameter (the userId).
 */
function capturedSetConfigUserId(executeSpy: jest.Mock): string | null {
  for (const [arg] of executeSpy.mock.calls) {
    const chunks: unknown[] = (arg as { queryChunks?: unknown[] }).queryChunks ?? [];
    const text = chunks
      .filter((c): c is { value: string[] } => !!c && typeof c === 'object' && 'value' in c)
      .flatMap((c) => c.value)
      .join('');
    if (text.includes('set_config')) {
      const boundValues = chunks.filter(
        (c) => !(c && typeof c === 'object' && 'value' in c),
      );
      return boundValues[0] as string ?? null;
    }
  }
  return null;
}

function setConfigWasCalled(executeSpy: jest.Mock): boolean {
  return capturedSetConfigUserId(executeSpy) !== null;
}

// ── B1 + B2: asUser — set_config + ALS ────────────────────────────────────────

describe('DatabaseService.asUser', () => {
  // Property: for arbitrary userId, asUser sets app.current_user_id via set_config
  // and exposes it via getCurrentUserId() inside the callback.
  // Exercised with 5 representative UUIDs (fast-check substitute per criterion 5).
  it.each([
    '00000000-0000-0000-0000-000000000001',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    '550e8400-e29b-41d4-a716-446655440000',
    '123e4567-e89b-12d3-a456-426614174000',
  ])('sets app.current_user_id to %s via set_config and exposes via getCurrentUserId', async (userId) => {
    const { dbService, executeSpy } = makePatchedDbService();

    let insideCalled = false;
    await dbService.asUser(userId, async () => {
      insideCalled = true;
      // B2: ALS store must expose the current userId inside the callback.
      expect(DatabaseService.getCurrentUserId()).toBe(userId);
      return undefined;
    });

    // B1: set_config called with the correct userId.
    expect(setConfigWasCalled(executeSpy)).toBe(true);
    expect(capturedSetConfigUserId(executeSpy)).toBe(userId);
    expect(insideCalled).toBe(true);

    // ALS store cleared after exit (outer context = undefined).
    expect(DatabaseService.getCurrentUserId()).toBeUndefined();
  });
});

// ── B3: asSystem — no set_config ──────────────────────────────────────────────

describe('DatabaseService.asSystem', () => {
  it('does NOT call set_config — system context omits tenant', async () => {
    const { dbService, executeSpy } = makePatchedDbService();

    let insideCalled = false;
    await dbService.asSystem(async () => {
      insideCalled = true;
      return undefined;
    });

    expect(setConfigWasCalled(executeSpy)).toBe(false);
    expect(insideCalled).toBe(true);
  });
});

// ── B4: pipeline wraps DB writes in asUser(ownerId) ───────────────────────────
//
// Exercises PipelineService through its driving port (chunkAndEmbed / rechunk).
// Asserts that DatabaseService.asUser is invoked with ownerId for all DB writes.

import { PipelineService } from '../../src/workspace/pipeline/pipeline.service';
import { ChunkingService } from '../../src/workspace/pipeline/chunking.service';
import type { EmbeddingService } from '../../src/workspace/pipeline/embedding.service';
import type { ProjectsService } from '../../src/projects/projects.service';

function makeEmbeddingService(vectors: number[][]): EmbeddingService {
  return { embed: jest.fn().mockResolvedValue(vectors) } as unknown as EmbeddingService;
}

function makeProjectsService(): ProjectsService {
  return {
    assertOwnership: jest.fn().mockResolvedValue(undefined),
  } as unknown as ProjectsService;
}

function makePipelineDbDouble() {
  const txDouble = {
    insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }),
    update: jest
      .fn()
      .mockReturnValue({ set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue(undefined) }),
    delete: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
  };
  // asUser spy: invokes the callback with the tx double, records userId arg.
  const asUserSpy = jest.fn((_userId: string, cb: (tx: typeof txDouble) => Promise<unknown>) =>
    cb(txDouble),
  );
  const dbService = {
    asUser: asUserSpy,
    // db.execute used by semanticSearch only — not needed here.
    db: { execute: jest.fn().mockResolvedValue({ rows: [] }) },
  } as unknown as DatabaseService;
  return { dbService, asUserSpy };
}

describe('PipelineService — asUser wrapping (B4)', () => {
  it('chunkAndEmbed wraps all DB writes in asUser(ownerId)', async () => {
    const { dbService, asUserSpy } = makePipelineDbDouble();
    const chunking = new ChunkingService();
    const embedding = makeEmbeddingService([[0.1, 0.2]]);
    const service = new PipelineService(dbService, embedding, chunking, makeProjectsService());

    const ownerId = 'owner-uuid-001';
    await service.chunkAndEmbed('proj-1', 'thought-1', 'hello world pipeline', ownerId);

    expect(asUserSpy).toHaveBeenCalled();
    const calledOwnerIds = asUserSpy.mock.calls.map(([uid]: [string]) => uid);
    expect(calledOwnerIds.every((uid) => uid === ownerId)).toBe(true);
  });

  it('rechunk wraps all DB writes (delete + re-chunk) in asUser(ownerId)', async () => {
    const { dbService, asUserSpy } = makePipelineDbDouble();
    const chunking = new ChunkingService();
    const embedding = makeEmbeddingService([[0.1, 0.2]]);
    const service = new PipelineService(dbService, embedding, chunking, makeProjectsService());

    const ownerId = 'owner-uuid-002';
    await service.rechunk('proj-2', 'thought-2', 'rechunked body text', ownerId);

    expect(asUserSpy).toHaveBeenCalled();
    const calledOwnerIds = asUserSpy.mock.calls.map(([uid]: [string]) => uid);
    expect(calledOwnerIds.every((uid) => uid === ownerId)).toBe(true);
  });
});
