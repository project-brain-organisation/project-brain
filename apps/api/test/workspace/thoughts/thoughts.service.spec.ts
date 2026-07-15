/**
 * WorkspaceThoughtsService unit tests — port-to-port (ThoughtsService driving port)
 *
 * Property: thoughts service stamps and filters project_id without joining entities for scope
 *
 * Test Budget: 6 distinct behaviors × 2 = 12 max unit tests
 * Behaviors:
 *   B1: create() calls assertOwnership before any DB operation
 *   B2: create() runs asUser inserting paired entities + thoughts rows,
 *       with thoughts row carrying projectId = dto.projectId
 *   B3: findByProject() filters on thoughts.projectId — no innerJoin on entities
 *   B4: by-id methods (update, remove) resolve scope from the thought row
 *       directly (no entities query first)
 *   B5: assertOwnership receives the thought's project_id on by-id mutations
 *   B6: NotFoundException thrown when thought row is missing (not entity row)
 *
 * DatabaseService and ProjectsService are mocked at the driven port boundary.
 * No mocks inside the hexagonal domain — only at port boundaries.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ThoughtsService } from '../../../src/workspace/thoughts/thoughts.service';
import type { DatabaseService } from '../../../src/database/database.service';
import type { ProjectsService } from '../../../src/projects/projects.service';
import type { PipelineService } from '../../../src/workspace/pipeline/pipeline.service';
import type { WorkspaceEventsService } from '../../../src/workspace/gateway/workspace-events.service';

// Pipeline is a driven collaborator of ThoughtsService — fire-and-forget chunk/embed.
// Stubbed at the boundary; these unit tests assert thought persistence, not the pipeline.
function makePipelineService(): PipelineService {
  return {
    chunkAndEmbed: jest.fn().mockResolvedValue(undefined),
    rechunk: jest.fn().mockResolvedValue(undefined),
    semanticSearch: jest.fn().mockResolvedValue([]),
  } as unknown as PipelineService;
}

function makeWorkspaceEventsService(): WorkspaceEventsService {
  return { publish: jest.fn(), emit: jest.fn() } as unknown as WorkspaceEventsService;
}

// ── Fluent Drizzle tx mock helpers ─────────────────────────────────

function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  chain.from = jest.fn().mockReturnValue(chain);
  chain.innerJoin = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockResolvedValue(rows);
  return chain;
}

function makeUpdateChain(rows: unknown[]) {
  const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  chain.set = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.returning = jest.fn().mockResolvedValue(rows);
  return chain;
}

function makeDeleteChain() {
  const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  chain.where = jest.fn().mockResolvedValue(undefined);
  return chain;
}

/**
 * Build transaction tx mock that tracks insert calls to entities and thoughts tables.
 * The tx object is passed as the argument to the asUser() callback.
 */
function makeTxMock(entityRow: unknown, thoughtRow: unknown) {
  const txInsertCalls: Array<{ tableName: string; values: Record<string, unknown> }> = [];

  const makeTxInsertChain = (tableName: string, rows: unknown[]) => {
    const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
    chain.values = jest.fn((vals: Record<string, unknown>) => {
      txInsertCalls.push({ tableName, values: vals });
      return chain;
    });
    chain.returning = jest.fn().mockResolvedValue(rows);
    return chain;
  };

  const tx = {
    insert: jest.fn((table: Record<string, unknown>) => {
      const tableName = (table as any)[Symbol.for('drizzle:Name')] ?? 'unknown';
      const rows = tableName === 'entities' ? [entityRow] : [thoughtRow];
      return makeTxInsertChain(tableName, rows);
    }),
    select: jest.fn().mockReturnValue(makeSelectChain([])),
    update: jest.fn().mockReturnValue(makeUpdateChain([])),
    delete: jest.fn().mockReturnValue(makeDeleteChain()),
  };

  return { tx, txInsertCalls };
}

/**
 * Build a DatabaseService mock where asUser() routes the callback through a tx double.
 * This mirrors the real DatabaseService.asUser() shape — the callback receives a tx.
 */
function makeDbService(txOverride?: ReturnType<typeof makeTxMock>['tx']) {
  const defaultTx = {
    select: jest.fn().mockReturnValue(makeSelectChain([])),
    update: jest.fn().mockReturnValue(makeUpdateChain([])),
    delete: jest.fn().mockReturnValue(makeDeleteChain()),
    insert: jest.fn(),
  };
  const tx = txOverride ?? defaultTx;

  const asUser = jest.fn(
    (_userId: string, cb: (tx: typeof tx) => Promise<unknown>) => cb(tx),
  );

  return { asUser, tx, dbService: { asUser } as unknown as DatabaseService };
}

function makeProjectsService(assertOwnershipImpl?: () => Promise<void>) {
  return {
    assertOwnership: jest.fn().mockImplementation(
      assertOwnershipImpl ?? (() => Promise.resolve()),
    ),
  } as unknown as ProjectsService;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('WorkspaceThoughtsService', () => {
  // ── B1 + B2: create() ───────────────────────────────────────────

  describe('create', () => {
    it('calls assertOwnership before any DB operation', async () => {
      const callOrder: string[] = [];

      const projectsService = {
        assertOwnership: jest.fn().mockImplementation(() => {
          callOrder.push('assertOwnership');
          return Promise.resolve();
        }),
      } as unknown as ProjectsService;

      const entityRow = { id: 'entity-uuid', projectId: 'proj-1', type: 'thought' };
      const thoughtRow = { id: 'entity-uuid', projectId: 'proj-1', body: 'hello', title: '', color: null };
      const { tx, txInsertCalls } = makeTxMock(entityRow, thoughtRow);

      const asUser = jest.fn((_userId: string, cb: (tx: unknown) => Promise<unknown>) => {
        callOrder.push('asUser');
        return cb(tx);
      });
      const dbService = { asUser } as unknown as DatabaseService;
      const service = new ThoughtsService(dbService, projectsService, makePipelineService(), makeWorkspaceEventsService());

      await service.create('user-1', { projectId: 'proj-1', body: 'hello' });

      expect(callOrder[0]).toBe('assertOwnership');
      expect(callOrder[1]).toBe('asUser');
      void txInsertCalls; // suppress unused warning — tracked for B2
    });

    it('runs asUser inserting into both entities and thoughts tables', async () => {
      const entityRow = { id: 'entity-uuid', projectId: 'proj-1', type: 'thought' };
      const thoughtRow = { id: 'entity-uuid', projectId: 'proj-1', body: 'hello', title: '', color: null };
      const { tx, txInsertCalls } = makeTxMock(entityRow, thoughtRow);

      const asUser = jest.fn((_userId: string, cb: (tx: unknown) => Promise<unknown>) => cb(tx));
      const dbService = { asUser } as unknown as DatabaseService;
      const projectsService = makeProjectsService();
      const service = new ThoughtsService(dbService, projectsService, makePipelineService(), makeWorkspaceEventsService());

      const result = await service.create('user-1', { projectId: 'proj-1', body: 'hello' });

      expect(asUser).toHaveBeenCalledTimes(1);
      const tableNames = txInsertCalls.map((c) => c.tableName);
      expect(tableNames).toContain('entities');
      expect(tableNames).toContain('thoughts');
      expect(result).toMatchObject({ id: 'entity-uuid', body: 'hello' });
    });

    // bypass: fallback — Jest example-based test; fast-check not installed in this workspace
    it('stamps projectId onto the thoughts insert (AC1)', async () => {
      const entityRow = { id: 'entity-uuid', projectId: 'proj-1', type: 'thought' };
      const thoughtRow = { id: 'entity-uuid', projectId: 'proj-1', body: 'hello', title: '', color: null };
      const { tx, txInsertCalls } = makeTxMock(entityRow, thoughtRow);

      const asUser = jest.fn((_userId: string, cb: (tx: unknown) => Promise<unknown>) => cb(tx));
      const dbService = { asUser } as unknown as DatabaseService;
      const projectsService = makeProjectsService();
      const service = new ThoughtsService(dbService, projectsService, makePipelineService(), makeWorkspaceEventsService());

      await service.create('user-1', { projectId: 'proj-1', body: 'hello' });

      const thoughtsInsert = txInsertCalls.find((c) => c.tableName === 'thoughts');
      expect(thoughtsInsert).toBeDefined();
      // AC1: thoughts insert must carry the denormalized project_id
      expect(thoughtsInsert!.values).toMatchObject({ projectId: 'proj-1' });
    });

    it('propagates asUser failure — rolls back both inserts', async () => {
      const tx = {
        insert: jest.fn().mockImplementation(() => {
          throw new Error('DB constraint violation');
        }),
      };
      const asUser = jest.fn((_userId: string, cb: (tx: unknown) => Promise<unknown>) => cb(tx));
      const dbService = { asUser } as unknown as DatabaseService;
      const projectsService = makeProjectsService();
      const service = new ThoughtsService(dbService, projectsService, makePipelineService(), makeWorkspaceEventsService());

      await expect(
        service.create('user-1', { projectId: 'proj-1', body: 'hello' }),
      ).rejects.toThrow('DB constraint violation');
    });

    it('honours a client-supplied id and creates the hierarchy edge in the same tx (parentId)', async () => {
      const inserted: Array<{ table: string; values: Record<string, unknown> }> = [];
      const tx = {
        insert: jest.fn((table: Record<string, unknown>) => ({
          values: (vals: Record<string, unknown>) => {
            inserted.push({ table: (table as any)[Symbol.for('drizzle:Name')], values: vals });
            return { returning: jest.fn().mockResolvedValue([{ id: 'rel-1', ...vals }]) };
          },
        })),
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([{ id: 'parent-1', projectId: 'proj-1', type: 'thought' }]),
        }),
      };
      const asUser = jest.fn((_u: string, cb: (tx: unknown) => Promise<unknown>) => cb(tx));
      const service = new ThoughtsService(
        { asUser } as unknown as DatabaseService,
        makeProjectsService(), makePipelineService(), makeWorkspaceEventsService(),
      );

      const result = await service.create('user-1', {
        id: 'client-uuid', projectId: 'proj-1', body: 'hi', parentId: 'parent-1',
      });

      expect(inserted.map((c) => c.table)).toEqual(['entities', 'thoughts', 'relationships']);
      expect(inserted[0].values.id).toBe('client-uuid');
      expect(inserted[2].values).toMatchObject({
        sourceId: 'client-uuid', targetId: 'parent-1', kind: 'hierarchy', projectId: 'proj-1',
      });
      expect(result).toMatchObject({ id: 'client-uuid', parentRelationshipId: 'rel-1' });
    });

    it('rejects a parentId that is not a thought in the same project', async () => {
      const entityRow = { id: 'entity-uuid', projectId: 'proj-1', type: 'thought' };
      const thoughtRow = { id: 'entity-uuid', projectId: 'proj-1', body: 'hi', title: '', color: null };
      const { tx } = makeTxMock(entityRow, thoughtRow); // select chain resolves [] → parent unknown
      const asUser = jest.fn((_u: string, cb: (tx: unknown) => Promise<unknown>) => cb(tx));
      const service = new ThoughtsService(
        { asUser } as unknown as DatabaseService,
        makeProjectsService(), makePipelineService(), makeWorkspaceEventsService(),
      );

      await expect(
        service.create('user-1', { projectId: 'proj-1', body: 'hi', parentId: 'ghost' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('maps a duplicate client id (23505 on the cause chain) to ConflictException', async () => {
      const dup = Object.assign(new Error('duplicate key'), { cause: { code: '23505' } });
      const tx = {
        insert: jest.fn(() => ({
          values: () => ({ returning: jest.fn().mockRejectedValue(dup) }),
        })),
      };
      const asUser = jest.fn((_u: string, cb: (tx: unknown) => Promise<unknown>) => cb(tx));
      const service = new ThoughtsService(
        { asUser } as unknown as DatabaseService,
        makeProjectsService(), makePipelineService(), makeWorkspaceEventsService(),
      );

      await expect(
        service.create('user-1', { id: 'taken', projectId: 'proj-1', body: 'hi' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ForbiddenException when assertOwnership rejects', async () => {
      const projectsService = makeProjectsService(() =>
        Promise.reject(new ForbiddenException('Project not found or access denied')),
      );
      const { dbService, asUser } = makeDbService();
      const service = new ThoughtsService(dbService, projectsService, makePipelineService(), makeWorkspaceEventsService());

      await expect(
        service.create('intruder', { projectId: 'proj-1', body: 'hack' }),
      ).rejects.toThrow(ForbiddenException);

      // DB must never be called
      expect(asUser).not.toHaveBeenCalled();
    });
  });

  // ── B3: findByProject() ─────────────────────────────────────────

  describe('findByProject', () => {
    // bypass: fallback — Jest example-based test; fast-check not installed in this workspace
    it('filters thoughts.projectId directly — does NOT innerJoin entities (AC2)', async () => {
      const rows = [
        { id: 'thought-1', projectId: 'proj-1', body: 'hello', title: '', color: null },
        { id: 'thought-2', projectId: 'proj-1', body: 'world', title: '', color: null },
      ];
      const selectChain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
      selectChain.from = jest.fn().mockReturnValue(selectChain);
      selectChain.innerJoin = jest.fn().mockReturnValue(selectChain);
      selectChain.where = jest.fn().mockResolvedValue(rows);
      selectChain.limit = jest.fn().mockResolvedValue(rows);

      const tx = {
        select: jest.fn().mockReturnValue(selectChain),
        update: jest.fn().mockReturnValue(makeUpdateChain([])),
        delete: jest.fn().mockReturnValue(makeDeleteChain()),
        insert: jest.fn(),
      };
      const asUser = jest.fn((_userId: string, cb: (tx: typeof tx) => Promise<unknown>) => cb(tx));
      const dbService = { asUser } as unknown as DatabaseService;
      const projectsService = makeProjectsService();
      const service = new ThoughtsService(dbService, projectsService, makePipelineService(), makeWorkspaceEventsService());

      const results = await service.findByProject('user-1', 'proj-1');

      // AC2: no innerJoin on entities for scope
      expect(selectChain.innerJoin).not.toHaveBeenCalled();
      // AC2: returns the rows from thoughts
      expect(results).toHaveLength(2);
    });
  });

  // ── B4 + B5: by-id methods read scope from thought row ──────────

  describe('update — color patch', () => {
    // bypass: fallback — Jest example-based test; fast-check not installed in this workspace
    it('resolves scope from thought row — no entities query first (AC3)', async () => {
      // update does two asUser calls: one select, one update
      const thoughtRow = { id: 'thought-1', projectId: 'proj-1', ownerId: 'user-1', body: 'content', title: '', color: null };
      const updatedRow = { ...thoughtRow, color: '#ff0000' };

      let asUserCallCount = 0;
      const tx = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([thoughtRow]),
        }),
        update: jest.fn().mockReturnValue(makeUpdateChain([updatedRow])),
        delete: jest.fn().mockReturnValue(makeDeleteChain()),
        insert: jest.fn(),
      };

      const asUser = jest.fn((_userId: string, cb: (tx: typeof tx) => Promise<unknown>) => {
        asUserCallCount++;
        return cb(tx);
      });
      const dbService = { asUser } as unknown as DatabaseService;
      const projectsService = makeProjectsService();
      const service = new ThoughtsService(dbService, projectsService, makePipelineService(), makeWorkspaceEventsService());

      const result = await service.update('user-1', 'thought-1', { color: '#ff0000' });

      // AC3: two asUser calls (select + update), not entities-then-thoughts N+1
      expect(asUserCallCount).toBe(2);
      // Step 04-01: assertOwnership removed from the color-update path (RLS enforces isolation).
      expect(projectsService.assertOwnership).not.toHaveBeenCalled();
      expect(result).toMatchObject({ color: '#ff0000' });
    });

    it('clears thoughts.color when patched with color: null', async () => {
      const thoughtRow = { id: 'thought-1', projectId: 'proj-1', ownerId: 'user-1', body: 'content', title: '', color: '#ff0000' };
      const updatedRow = { ...thoughtRow, color: null };

      const tx = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([thoughtRow]),
        }),
        update: jest.fn().mockReturnValue(makeUpdateChain([updatedRow])),
        delete: jest.fn().mockReturnValue(makeDeleteChain()),
        insert: jest.fn(),
      };
      const asUser = jest.fn((_userId: string, cb: (tx: typeof tx) => Promise<unknown>) => cb(tx));
      const dbService = { asUser } as unknown as DatabaseService;
      const projectsService = makeProjectsService();
      const service = new ThoughtsService(dbService, projectsService, makePipelineService(), makeWorkspaceEventsService());

      const result = await service.update('user-1', 'thought-1', { color: null });

      expect(result).toMatchObject({ color: null });
    });
  });

  // ── B7: update() — general partial patch (title/body/canvas) ─────

  describe('update', () => {
    function makeUpdateSetup(thoughtRow: Record<string, unknown>, updatedRow: Record<string, unknown>) {
      const setSpy = jest.fn();
      const updateChain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
      updateChain.set = jest.fn((vals: Record<string, unknown>) => {
        setSpy(vals);
        return updateChain;
      });
      updateChain.where = jest.fn().mockReturnValue(updateChain);
      updateChain.returning = jest.fn().mockResolvedValue([updatedRow]);

      const tx = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue(thoughtRow ? [thoughtRow] : []),
        }),
        update: jest.fn().mockReturnValue(updateChain),
        delete: jest.fn().mockReturnValue(makeDeleteChain()),
        insert: jest.fn(),
      };
      const asUser = jest.fn((_userId: string, cb: (tx: typeof tx) => Promise<unknown>) => cb(tx));
      const dbService = { asUser } as unknown as DatabaseService;
      return { dbService, setSpy };
    }

    it('patches only the provided fields and skips rechunk when body is unchanged', async () => {
      const thoughtRow = { id: 'thought-1', projectId: 'proj-1', ownerId: 'user-1', body: 'content', title: '', color: null };
      const updatedRow = { ...thoughtRow, title: 'New title', canvasX: 10 };
      const { dbService, setSpy } = makeUpdateSetup(thoughtRow, updatedRow);
      const pipeline = makePipelineService();
      const service = new ThoughtsService(dbService, makeProjectsService(), pipeline, makeWorkspaceEventsService());

      const result = await service.update('user-1', 'thought-1', { title: 'New title', canvasX: 10 });

      expect(setSpy).toHaveBeenCalledWith({ title: 'New title', canvasX: 10 });
      expect(pipeline.rechunk).not.toHaveBeenCalled();
      expect(result).toMatchObject({ title: 'New title', canvasX: 10 });
    });

    it('re-chunks via the pipeline when body actually changes', async () => {
      const thoughtRow = { id: 'thought-1', projectId: 'proj-1', ownerId: 'user-1', body: 'old body', title: '', color: null };
      const updatedRow = { ...thoughtRow, body: 'new body' };
      const { dbService } = makeUpdateSetup(thoughtRow, updatedRow);
      const pipeline = makePipelineService();
      const service = new ThoughtsService(dbService, makeProjectsService(), pipeline, makeWorkspaceEventsService());

      await service.update('user-1', 'thought-1', { body: 'new body' });

      expect(pipeline.rechunk).toHaveBeenCalledWith('proj-1', 'thought-1', 'new body', 'user-1');
    });

    it('throws NotFoundException when the thought is missing or RLS-invisible', async () => {
      const tx = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([]),
        }),
        update: jest.fn(),
        delete: jest.fn(),
        insert: jest.fn(),
      };
      const asUser = jest.fn((_userId: string, cb: (tx: typeof tx) => Promise<unknown>) => cb(tx));
      const dbService = { asUser } as unknown as DatabaseService;
      const service = new ThoughtsService(dbService, makeProjectsService(), makePipelineService(), makeWorkspaceEventsService());

      await expect(service.update('user-1', 'ghost', { title: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the thought belongs to another owner (read-only public graph)', async () => {
      // findOne succeeds because the thought is in a public graph the user can
      // read, but its ownerId is someone else's — the write must be rejected
      // rather than silently no-op under RLS.
      const foreignThought = { id: 'thought-1', projectId: 'pub-proj', ownerId: 'other-user', body: 'x', title: '', color: null };
      const updateSpy = jest.fn().mockReturnValue(makeUpdateChain([]));
      const tx = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([foreignThought]),
        }),
        update: updateSpy,
        delete: jest.fn(),
        insert: jest.fn(),
      };
      const asUser = jest.fn((_userId: string, cb: (tx: typeof tx) => Promise<unknown>) => cb(tx));
      const dbService = { asUser } as unknown as DatabaseService;
      const service = new ThoughtsService(dbService, makeProjectsService(), makePipelineService(), makeWorkspaceEventsService());

      await expect(service.update('user-1', 'thought-1', { body: 'hijack' })).rejects.toThrow(ForbiddenException);
      // The UPDATE must never be attempted for a read-only graph.
      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  // ── B6: NotFoundException from thought lookup ────────────────────

  describe('remove', () => {
    it('deletes from the entities table (not thoughts directly), relying on cascade', async () => {
      const thoughtRow = { id: 'thought-1', projectId: 'proj-1', ownerId: 'user-1', body: 'content', title: '', color: null };

      const deleteSpy = jest.fn().mockReturnValue(makeDeleteChain());
      const tx = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([thoughtRow]),
        }),
        update: jest.fn().mockReturnValue(makeUpdateChain([])),
        delete: deleteSpy,
        insert: jest.fn(),
      };
      const asUser = jest.fn((_userId: string, cb: (tx: typeof tx) => Promise<unknown>) => cb(tx));
      const dbService = { asUser } as unknown as DatabaseService;
      const projectsService = makeProjectsService();
      const service = new ThoughtsService(dbService, projectsService, makePipelineService(), makeWorkspaceEventsService());

      const result = await service.remove('user-1', 'thought-1');

      // delete must be called exactly once — on entities, not thoughts
      expect(deleteSpy).toHaveBeenCalledTimes(1);
      // The table argument must be the entities table (has 'projectId' column key)
      const deletedTable = deleteSpy.mock.calls[0][0] as Record<string, unknown>;
      expect(deletedTable).toHaveProperty('projectId');
      expect(result).toEqual({ deleted: true });
    });

    // bypass: fallback — Jest example-based test; fast-check not installed in this workspace
    it('throws NotFoundException when thought row does not exist (AC4 — scope from thought)', async () => {
      const tx = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([]),
        }),
        update: jest.fn(),
        delete: jest.fn(),
        insert: jest.fn(),
      };
      const asUser = jest.fn((_userId: string, cb: (tx: typeof tx) => Promise<unknown>) => cb(tx));
      const dbService = { asUser } as unknown as DatabaseService;
      const projectsService = makeProjectsService();
      const service = new ThoughtsService(dbService, projectsService, makePipelineService(), makeWorkspaceEventsService());

      await expect(service.remove('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
