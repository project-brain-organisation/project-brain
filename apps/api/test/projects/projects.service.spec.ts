/**
 * ProjectsService unit tests — port-to-port (ProjectsService driving port)
 *
 * Test Budget: 3 distinct behaviors × 2 = 6 max unit tests
 * Behaviors:
 *   B1: assertOwnership throws ForbiddenException when owner_id does not match
 *   B2: assertOwnership resolves when owner matches
 *   B3: create runs under asUser(userId) inserting into both entities and
 *       project_meta so RLS sees app.current_user_id for the whole transaction
 *
 * DatabaseService is mocked at the driven port boundary.
 * No mocks inside the hexagonal domain — only at port boundaries.
 */

import { ForbiddenException } from '@nestjs/common';
import { ProjectsService } from '../../src/projects/projects.service';
import type { DatabaseService } from '../../src/database/database.service';
import type { WorkspaceEventsService } from '../../src/workspace/gateway/workspace-events.service';

function makeWorkspaceEventsService() {
  return { publish: jest.fn() } as unknown as WorkspaceEventsService;
}

// ── Fluent Drizzle tx mock helpers ─────────────────────────────────

function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  chain.from = jest.fn().mockReturnValue(chain);
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
 * Build a DatabaseService mock where asUser() routes the callback through a
 * tx double — mirrors the real DatabaseService.asUser() shape (callback
 * receives a tx handle inside a tenant-scoped transaction).
 */
function makeDbService(selectRows: unknown[] = []) {
  const tx = {
    select: jest.fn().mockReturnValue(makeSelectChain(selectRows)),
    update: jest.fn().mockReturnValue(makeUpdateChain([])),
    delete: jest.fn().mockReturnValue(makeDeleteChain()),
    insert: jest.fn(),
  };

  const asUser = jest.fn(
    (_userId: string, cb: (tx: typeof tx) => Promise<unknown>) => cb(tx),
  );

  return { asUser, tx, dbService: { asUser } as unknown as DatabaseService };
}

/**
 * tx mock for create(): tracks insert calls for entities and project_meta.
 */
function makeCreateTxMock() {
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
    insert: jest.fn((table: Record<string, unknown>) => {
      const tableName =
        ((table as any)[Symbol.for('drizzle:Name')] as string) ?? 'unknown';
      const rows = tableName === 'project_meta' ? [insertedMeta] : [{}];
      return makeTxInsertChain(tableName, rows);
    }),
  };

  const asUser = jest.fn(
    (_userId: string, cb: (tx: typeof tx) => Promise<unknown>) => cb(tx),
  );

  const dbService = { asUser } as unknown as DatabaseService;
  return { dbService, asUser, tx, txInsertCalls };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('ProjectsService', () => {
  describe('assertOwnership', () => {
    it('throws ForbiddenException when owner_id does not match requesting user', async () => {
      const meta = { id: 'proj-1', ownerId: 'owner-abc', name: 'Test', emoji: null, isPublic: false };
      const { dbService } = makeDbService([meta]);
      const service = new ProjectsService(dbService, makeWorkspaceEventsService());

      await expect(service.assertOwnership('different-user', 'proj-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('resolves without error when owner_id matches requesting user', async () => {
      const meta = { id: 'proj-1', ownerId: 'user-123', name: 'Test', emoji: null, isPublic: false };
      const { dbService, asUser } = makeDbService([meta]);
      const service = new ProjectsService(dbService, makeWorkspaceEventsService());

      await expect(service.assertOwnership('user-123', 'proj-1')).resolves.toBeUndefined();
      expect(asUser).toHaveBeenCalledWith('user-123', expect.any(Function));
    });

    it('throws ForbiddenException when project row does not exist (or is RLS-invisible)', async () => {
      const { dbService } = makeDbService([]);
      const service = new ProjectsService(dbService, makeWorkspaceEventsService());

      await expect(service.assertOwnership('any-user', 'nonexistent')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('create', () => {
    it('runs under asUser(userId) and inserts into both entities and project_meta tables', async () => {
      const { dbService, asUser, txInsertCalls } = makeCreateTxMock();
      const service = new ProjectsService(dbService, makeWorkspaceEventsService());

      const result = await service.create('user-1', { name: 'My Project' });

      // Tenant-scoped transaction was invoked for the requesting user
      expect(asUser).toHaveBeenCalledTimes(1);
      expect(asUser).toHaveBeenCalledWith('user-1', expect.any(Function));

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
      const asUser = jest.fn(
        (_userId: string, cb: (tx: unknown) => Promise<unknown>) => cb(tx),
      );
      const dbService = { asUser } as unknown as DatabaseService;
      const service = new ProjectsService(dbService, makeWorkspaceEventsService());

      await expect(service.create('user-1', { name: 'Fail Project' })).rejects.toThrow(
        'DB constraint violation',
      );
    });
  });
});
