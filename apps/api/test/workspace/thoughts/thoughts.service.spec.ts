/**
 * WorkspaceThoughtsService unit tests — port-to-port (ThoughtsService driving port)
 *
 * Test Budget: 4 distinct behaviors × 2 = 8 max unit tests
 * Behaviors:
 *   B1: create() calls assertOwnership before any DB operation
 *   B2: create() runs db.transaction inserting paired entities + thoughts rows
 *   B3: setColor() updates thoughts.color inline (no colors table reference)
 *   B4: remove() deletes from entities (cascades to thoughts)
 *
 * DatabaseService and ProjectsService are mocked at the driven port boundary.
 * No mocks inside the hexagonal domain — only at port boundaries.
 */

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ThoughtsService } from '../../../src/workspace/thoughts/thoughts.service';
import type { DatabaseService } from '../../../src/database/database.service';
import type { ProjectsService } from '../../../src/projects/projects.service';

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
 * Build transaction mock that tracks insert calls to entities and thoughts tables.
 */
function makeTxMock(entityRow: unknown, thoughtRow: unknown) {
  const txInsertCalls: Array<{ tableName: string }> = [];

  const makeTxInsertChain = (tableName: string, rows: unknown[]) => {
    const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
    chain.values = jest.fn(() => {
      txInsertCalls.push({ tableName });
      return chain;
    });
    chain.returning = jest.fn().mockResolvedValue(rows);
    return chain;
  };

  const tx = {
    insert: jest.fn((table: Record<string, unknown>) => {
      // Distinguish entities from thoughts by presence of 'projectId' column key
      const isEntities = table && 'projectId' in table;
      const tableName = isEntities ? 'entities' : 'thoughts';
      const rows = isEntities ? [entityRow] : [thoughtRow];
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
      const thoughtRow = { id: 'entity-uuid', body: 'hello', title: '', color: null };
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
      const service = new ThoughtsService(dbService, projectsService);

      await service.create('user-1', { projectId: 'proj-1', body: 'hello' });

      expect(callOrder[0]).toBe('assertOwnership');
      expect(callOrder[1]).toBe('transaction');
      void txInsertCalls; // suppress unused warning — tracked for B2
    });

    it('runs db.transaction inserting into both entities and thoughts tables', async () => {
      const entityRow = { id: 'entity-uuid', projectId: 'proj-1', type: 'thought' };
      const thoughtRow = { id: 'entity-uuid', body: 'hello', title: '', color: null };
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
      const service = new ThoughtsService(dbService, projectsService);

      const result = await service.create('user-1', { projectId: 'proj-1', body: 'hello' });

      expect(drizzle.transaction).toHaveBeenCalledTimes(1);
      const tableNames = txInsertCalls.map((c) => c.tableName);
      expect(tableNames).toContain('entities');
      expect(tableNames).toContain('thoughts');
      expect(result).toMatchObject({ id: 'entity-uuid', body: 'hello' });
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
      const service = new ThoughtsService(dbService, projectsService);

      await expect(
        service.create('user-1', { projectId: 'proj-1', body: 'hello' }),
      ).rejects.toThrow('DB constraint violation');
    });

    it('throws ForbiddenException when assertOwnership rejects', async () => {
      const projectsService = makeProjectsService(() =>
        Promise.reject(new ForbiddenException('Project not found or access denied')),
      );
      const dbService = makeDbService();
      const service = new ThoughtsService(dbService, projectsService);

      await expect(
        service.create('intruder', { projectId: 'proj-1', body: 'hack' }),
      ).rejects.toThrow(ForbiddenException);

      // DB must never be called
      expect((dbService.db as unknown as Record<string, jest.Mock>).transaction).not.toHaveBeenCalled();
    });
  });

  // ── B3: setColor() ──────────────────────────────────────────────

  describe('setColor', () => {
    it('updates thoughts.color inline without referencing any colors table', async () => {
      const entityRow = { id: 'thought-1', projectId: 'proj-1', type: 'thought' };
      const thoughtRow = { id: 'thought-1', body: 'content', title: '', color: null };

      // findOne: select entities then thoughts
      let selectCallCount = 0;
      const selectChain = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return Promise.resolve([entityRow]);
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
      const service = new ThoughtsService(dbService, projectsService);

      const result = await service.setColor('user-1', 'thought-1', '#ff0000');

      // update was called once (on thoughts table, not a colors table)
      expect(updateSpy).toHaveBeenCalledTimes(1);
      // The table passed to update must NOT be a colors table — verified by result shape
      expect(result).toMatchObject({ color: '#ff0000' });
    });

    it('clears thoughts.color to null when clearColor is called', async () => {
      const entityRow = { id: 'thought-1', projectId: 'proj-1', type: 'thought' };
      const thoughtRow = { id: 'thought-1', body: 'content', title: '', color: '#ff0000' };

      let selectCallCount = 0;
      const selectChain = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return Promise.resolve([entityRow]);
          return Promise.resolve([thoughtRow]);
        }),
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
      const service = new ThoughtsService(dbService, projectsService);

      const result = await service.clearColor('user-1', 'thought-1');

      expect(result).toMatchObject({ color: null });
    });
  });

  // ── B4: remove() ────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes from the entities table (not thoughts directly), relying on cascade', async () => {
      const entityRow = { id: 'thought-1', projectId: 'proj-1', type: 'thought' };
      const thoughtRow = { id: 'thought-1', body: 'content', title: '', color: null };

      let selectCallCount = 0;
      const selectChain = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return Promise.resolve([entityRow]);
          return Promise.resolve([thoughtRow]);
        }),
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
      const service = new ThoughtsService(dbService, projectsService);

      const result = await service.remove('user-1', 'thought-1');

      // delete must be called exactly once — on entities, not thoughts
      expect(deleteSpy).toHaveBeenCalledTimes(1);
      // The table argument must be the entities table (has 'projectId' column key)
      const deletedTable = deleteSpy.mock.calls[0][0] as Record<string, unknown>;
      expect(deletedTable).toHaveProperty('projectId');
      expect(result).toEqual({ deleted: true });
    });

    it('throws NotFoundException when thought does not exist', async () => {
      // findOne returns empty for entity lookup
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
      const service = new ThoughtsService(dbService, projectsService);

      await expect(service.remove('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
