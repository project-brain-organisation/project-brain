/**
 * ProjectsService unit tests — port-to-port (ProjectsService driving port)
 *
 * Test Budget: 3 distinct behaviors × 2 = 6 max unit tests
 * Behaviors:
 *   B1: assertOwnership throws ForbiddenException when owner_id does not match
 *   B2: assertOwnership resolves when owner matches
 *   B3: create runs a DB transaction inserting into both entities and project_meta
 *
 * DatabaseService is mocked at the driven port boundary.
 * No mocks inside the hexagonal domain — only at port boundaries.
 */

import { ForbiddenException } from '@nestjs/common';
import { ProjectsService } from '../../src/projects/projects.service';
import type { DatabaseService } from '../../src/database/database.service';

// ── Fluent Drizzle mock helpers ────────────────────────────────────

function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  chain.from = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockResolvedValue(rows);
  return chain;
}

function makeInsertChain(rows: unknown[]) {
  const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  chain.values = jest.fn().mockReturnValue(chain);
  chain.returning = jest.fn().mockResolvedValue(rows);
  return chain;
}

function makeDeleteChain() {
  const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  chain.from = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockResolvedValue(undefined);
  return chain;
}

/**
 * Build a DatabaseService mock whose db exposes a transaction() that
 * delegates to an async callback receiving a transaction handle (tx).
 * The tx handle itself tracks insert calls for both tables.
 */
function makeTxMock() {
  const txInsertCalls: Array<{ tableName: string; values: unknown }> = [];

  const insertedMeta = {
    id: 'proj-uuid',
    ownerId: 'user-1',
    name: 'My Project',
    emoji: null,
    isPublic: false,
  };

  const makeTxInsertChain = (tableName: string, rows: unknown[]) => {
    const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
    chain.values = jest.fn((vals: unknown) => {
      txInsertCalls.push({ tableName, values: vals });
      return chain;
    });
    chain.returning = jest.fn().mockResolvedValue(rows);
    return chain;
  };

  const tx = {
    insert: jest.fn((table: { _: { name: string } } | unknown) => {
      // Identify which table is being inserted into by checking its structure.
      // We use the table reference identity — projectMeta has 'ownerId' column key.
      const tbl = table as Record<string, unknown>;
      const hasOwnerId = tbl && typeof tbl === 'object' && 'ownerId' in tbl;
      const tableName = hasOwnerId ? 'project_meta' : 'entities';
      return makeTxInsertChain(tableName, hasOwnerId ? [insertedMeta] : [{}]);
    }),
  };

  const drizzle = {
    select: jest.fn().mockReturnValue(makeSelectChain([])),
    insert: jest.fn().mockReturnValue(makeInsertChain([])),
    delete: jest.fn().mockReturnValue(makeDeleteChain()),
    transaction: jest.fn().mockImplementation(async (cb: (tx: typeof tx) => Promise<unknown>) => {
      return cb(tx);
    }),
  };

  const dbService = { db: drizzle } as unknown as DatabaseService;
  return { dbService, drizzle, tx, txInsertCalls };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('ProjectsService', () => {
  describe('assertOwnership', () => {
    it('throws ForbiddenException when owner_id does not match requesting user', async () => {
      const meta = { id: 'proj-1', ownerId: 'owner-abc', name: 'Test', emoji: null, isPublic: false };
      const selectChain = makeSelectChain([meta]);
      const drizzle = {
        select: jest.fn().mockReturnValue(selectChain),
        insert: jest.fn(),
        delete: jest.fn(),
        transaction: jest.fn(),
      };
      const dbService = { db: drizzle } as unknown as DatabaseService;
      const service = new ProjectsService(dbService);

      await expect(service.assertOwnership('different-user', 'proj-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('resolves without error when owner_id matches requesting user', async () => {
      const meta = { id: 'proj-1', ownerId: 'user-123', name: 'Test', emoji: null, isPublic: false };
      const selectChain = makeSelectChain([meta]);
      const drizzle = {
        select: jest.fn().mockReturnValue(selectChain),
        insert: jest.fn(),
        delete: jest.fn(),
        transaction: jest.fn(),
      };
      const dbService = { db: drizzle } as unknown as DatabaseService;
      const service = new ProjectsService(dbService);

      await expect(service.assertOwnership('user-123', 'proj-1')).resolves.toBeUndefined();
    });

    it('throws ForbiddenException when project row does not exist', async () => {
      const selectChain = makeSelectChain([]);
      const drizzle = {
        select: jest.fn().mockReturnValue(selectChain),
        insert: jest.fn(),
        delete: jest.fn(),
        transaction: jest.fn(),
      };
      const dbService = { db: drizzle } as unknown as DatabaseService;
      const service = new ProjectsService(dbService);

      await expect(service.assertOwnership('any-user', 'nonexistent')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('create', () => {
    it('calls db.transaction and inserts into both entities and project_meta tables', async () => {
      const { dbService, drizzle, txInsertCalls } = makeTxMock();
      const service = new ProjectsService(dbService);

      const result = await service.create('user-1', { name: 'My Project' });

      // Transaction was invoked
      expect(drizzle.transaction).toHaveBeenCalledTimes(1);

      // Both tables received an insert
      const tableNames = txInsertCalls.map((c) => c.tableName);
      expect(tableNames).toContain('entities');
      expect(tableNames).toContain('project_meta');

      // Returned meta from the second insert
      expect(result).toMatchObject({ name: 'My Project', ownerId: 'user-1' });
    });

    it('propagates transaction failure (rolls back atomically)', async () => {
      const tx = {
        insert: jest.fn().mockImplementation(() => {
          throw new Error('DB constraint violation');
        }),
      };
      const drizzle = {
        select: jest.fn(),
        insert: jest.fn(),
        delete: jest.fn(),
        transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
          return cb(tx);
        }),
      };
      const dbService = { db: drizzle } as unknown as DatabaseService;
      const service = new ProjectsService(dbService);

      await expect(service.create('user-1', { name: 'Fail Project' })).rejects.toThrow(
        'DB constraint violation',
      );
    });
  });
});
