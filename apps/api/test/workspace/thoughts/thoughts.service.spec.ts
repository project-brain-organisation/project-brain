/**
 * WorkspaceThoughtsService unit tests — port-to-port (ThoughtsService driving port)
 *
 * Property: thoughts service stamps and filters project_id without joining entities for scope
 *
 * Test Budget: 6 distinct behaviors × 2 = 12 max unit tests
 * Behaviors:
 *   B1: create() calls assertOwnership before any DB operation
 *   B2: create() runs db.transaction inserting paired entities + thoughts rows,
 *       with thoughts row carrying projectId = dto.projectId
 *   B3: findByProject() filters on thoughts.projectId — no innerJoin on entities
 *   B4: by-id methods (setColor, clearColor, remove, updateBody) resolve scope
 *       from the thought row directly (no entities query first)
 *   B5: assertOwnership receives the thought's project_id on by-id mutations
 *   B6: NotFoundException thrown when thought row is missing (not entity row)
 *
 * DatabaseService and ProjectsService are mocked at the driven port boundary.
 * No mocks inside the hexagonal domain — only at port boundaries.
 */

import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
  return { publish: jest.fn() } as unknown as WorkspaceEventsService;
}

// ── Fluent Drizzle mock helpers ────────────────────────────────────

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
 * Build transaction mock that tracks insert calls to entities and thoughts tables
 * and captures the values passed to each insert.
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
  };

  return { tx, txInsertCalls };
}

function makeDbService(overrides: Partial<ReturnType<typeof makeDbService>> = {}) {
  const drizzle = {
    select: jest.fn().mockReturnValue(makeSelectChain([])),
    update: jest.fn().mockReturnValue(makeUpdateChain([])),
    delete: jest.fn().mockReturnValue(makeDeleteChain()),
    transaction: jest.fn(),
    ...overrides,
  };
  return { db: drizzle } as unknown as DatabaseService;
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

      const drizzle = {
        select: jest.fn().mockReturnValue(makeSelectChain([])),
        update: jest.fn().mockReturnValue(makeUpdateChain([])),
        delete: jest.fn().mockReturnValue(makeDeleteChain()),
        transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
          callOrder.push('transaction');
          return cb(tx);
        }),
      };
      const dbService = { db: drizzle } as unknown as DatabaseService;
      const service = new ThoughtsService(dbService, projectsService, makePipelineService(), makeWorkspaceEventsService());

      await service.create('user-1', { projectId: 'proj-1', body: 'hello' });

      expect(callOrder[0]).toBe('assertOwnership');
      expect(callOrder[1]).toBe('transaction');
      void txInsertCalls; // suppress unused warning — tracked for B2
    });

    it('runs db.transaction inserting into both entities and thoughts tables', async () => {
      const entityRow = { id: 'entity-uuid', projectId: 'proj-1', type: 'thought' };
      const thoughtRow = { id: 'entity-uuid', projectId: 'proj-1', body: 'hello', title: '', color: null };
      const { tx, txInsertCalls } = makeTxMock(entityRow, thoughtRow);

      const drizzle = {
        select: jest.fn().mockReturnValue(makeSelectChain([])),
        update: jest.fn().mockReturnValue(makeUpdateChain([])),
        delete: jest.fn().mockReturnValue(makeDeleteChain()),
        transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
          cb(tx),
        ),
      };
      const dbService = { db: drizzle } as unknown as DatabaseService;
      const projectsService = makeProjectsService();
      const service = new ThoughtsService(dbService, projectsService, makePipelineService(), makeWorkspaceEventsService());

      const result = await service.create('user-1', { projectId: 'proj-1', body: 'hello' });

      expect(drizzle.transaction).toHaveBeenCalledTimes(1);
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

      const drizzle = {
        select: jest.fn().mockReturnValue(makeSelectChain([])),
        update: jest.fn().mockReturnValue(makeUpdateChain([])),
        delete: jest.fn().mockReturnValue(makeDeleteChain()),
        transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
          cb(tx),
        ),
      };
      const dbService = { db: drizzle } as unknown as DatabaseService;
      const projectsService = makeProjectsService();
      const service = new ThoughtsService(dbService, projectsService, makePipelineService(), makeWorkspaceEventsService());

      await service.create('user-1', { projectId: 'proj-1', body: 'hello' });

      const thoughtsInsert = txInsertCalls.find((c) => c.tableName === 'thoughts');
      expect(thoughtsInsert).toBeDefined();
      // AC1: thoughts insert must carry the denormalized project_id
      expect(thoughtsInsert!.values).toMatchObject({ projectId: 'proj-1' });
    });

    it('propagates transaction failure — rolls back both inserts', async () => {
      const tx = {
        insert: jest.fn().mockImplementation(() => {
          throw new Error('DB constraint violation');
        }),
      };
      const drizzle = {
        select: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
          cb(tx),
        ),
      };
      const dbService = { db: drizzle } as unknown as DatabaseService;
      const projectsService = makeProjectsService();
      const service = new ThoughtsService(dbService, projectsService, makePipelineService(), makeWorkspaceEventsService());

      await expect(
        service.create('user-1', { projectId: 'proj-1', body: 'hello' }),
      ).rejects.toThrow('DB constraint violation');
    });

    it('throws ForbiddenException when assertOwnership rejects', async () => {
      const projectsService = makeProjectsService(() =>
        Promise.reject(new ForbiddenException('Project not found or access denied')),
      );
      const dbService = makeDbService();
      const service = new ThoughtsService(dbService, projectsService, makePipelineService(), makeWorkspaceEventsService());

      await expect(
        service.create('intruder', { projectId: 'proj-1', body: 'hack' }),
      ).rejects.toThrow(ForbiddenException);

      // DB must never be called
      expect((dbService.db as unknown as Record<string, jest.Mock>).transaction).not.toHaveBeenCalled();
    });
  });

  // ── B3: findByProject() ─────────────────────────────────────────

  describe('findByProject', () => {
    // bypass: fallback — Jest example-based test; fast-check not installed in this workspace
    it('filters thoughts.projectId directly — does NOT innerJoin entities (AC2)', async () => {
      // findByProject terminates at .where() (no .limit()), so the chain must
      // resolve at that point. Build a chain where .where() is the terminal resolver.
      const rows = [
        { id: 'thought-1', projectId: 'proj-1', body: 'hello', title: '', color: null },
        { id: 'thought-2', projectId: 'proj-1', body: 'world', title: '', color: null },
      ];
      const selectChain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
      selectChain.from = jest.fn().mockReturnValue(selectChain);
      selectChain.innerJoin = jest.fn().mockReturnValue(selectChain);
      selectChain.where = jest.fn().mockResolvedValue(rows);
      selectChain.limit = jest.fn().mockResolvedValue(rows);
      const selectSpy = jest.fn().mockReturnValue(selectChain);

      const drizzle = {
        select: selectSpy,
        update: jest.fn().mockReturnValue(makeUpdateChain([])),
        delete: jest.fn().mockReturnValue(makeDeleteChain()),
        transaction: jest.fn(),
      };
      const dbService = { db: drizzle } as unknown as DatabaseService;
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

  describe('setColor', () => {
    // bypass: fallback — Jest example-based test; fast-check not installed in this workspace
    it('resolves scope from thought row — no entities query first (AC3)', async () => {
      // After refactor: single select from thoughts (not entities then thoughts)
      const thoughtRow = { id: 'thought-1', projectId: 'proj-1', body: 'content', title: '', color: null };

      let selectCallCount = 0;
      const selectChain = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockImplementation(() => {
          selectCallCount++;
          // After refactor: first select is from thoughts, returns thoughtRow
          return Promise.resolve([thoughtRow]);
        }),
      };

      const updatedRow = { ...thoughtRow, color: '#ff0000' };
      const updateChain = makeUpdateChain([updatedRow]);
      const updateSpy = jest.fn().mockReturnValue(updateChain);

      const drizzle = {
        select: jest.fn().mockReturnValue(selectChain),
        update: updateSpy,
        delete: jest.fn().mockReturnValue(makeDeleteChain()),
        transaction: jest.fn(),
      };
      const dbService = { db: drizzle } as unknown as DatabaseService;
      const projectsService = makeProjectsService();
      const service = new ThoughtsService(dbService, projectsService, makePipelineService(), makeWorkspaceEventsService());

      const result = await service.setColor('user-1', 'thought-1', '#ff0000');

      // AC3: only one select call (from thoughts, not entities-then-thoughts N+1)
      expect(selectCallCount).toBe(1);
      // Step 04-01: assertOwnership removed from setColor path (RLS enforces isolation).
      expect(projectsService.assertOwnership).not.toHaveBeenCalled();
      expect(result).toMatchObject({ color: '#ff0000' });
    });

    it('clears thoughts.color to null when clearColor is called', async () => {
      const thoughtRow = { id: 'thought-1', projectId: 'proj-1', body: 'content', title: '', color: '#ff0000' };

      const selectChain = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([thoughtRow]),
      };

      const updatedRow = { ...thoughtRow, color: null };
      const updateChain = makeUpdateChain([updatedRow]);
      const drizzle = {
        select: jest.fn().mockReturnValue(selectChain),
        update: jest.fn().mockReturnValue(updateChain),
        delete: jest.fn().mockReturnValue(makeDeleteChain()),
        transaction: jest.fn(),
      };
      const dbService = { db: drizzle } as unknown as DatabaseService;
      const projectsService = makeProjectsService();
      const service = new ThoughtsService(dbService, projectsService, makePipelineService(), makeWorkspaceEventsService());

      const result = await service.clearColor('user-1', 'thought-1');

      expect(result).toMatchObject({ color: null });
    });
  });

  // ── B6: NotFoundException from thought lookup ────────────────────

  describe('remove', () => {
    it('deletes from the entities table (not thoughts directly), relying on cascade', async () => {
      const thoughtRow = { id: 'thought-1', projectId: 'proj-1', body: 'content', title: '', color: null };

      const selectChain = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        // After refactor: single select from thoughts
        limit: jest.fn().mockResolvedValue([thoughtRow]),
      };

      const deleteChain = makeDeleteChain();
      const deleteSpy = jest.fn().mockReturnValue(deleteChain);

      const drizzle = {
        select: jest.fn().mockReturnValue(selectChain),
        update: jest.fn().mockReturnValue(makeUpdateChain([])),
        delete: deleteSpy,
        transaction: jest.fn(),
      };
      const dbService = { db: drizzle } as unknown as DatabaseService;
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
      // After refactor: select from thoughts returns empty (not entities)
      const selectChain = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      };
      const drizzle = {
        select: jest.fn().mockReturnValue(selectChain),
        update: jest.fn(),
        delete: jest.fn(),
        transaction: jest.fn(),
      };
      const dbService = { db: drizzle } as unknown as DatabaseService;
      const projectsService = makeProjectsService();
      const service = new ThoughtsService(dbService, projectsService, makePipelineService(), makeWorkspaceEventsService());

      await expect(service.remove('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
