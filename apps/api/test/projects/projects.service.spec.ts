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

import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ProjectsService, READ_ONLY_GRAPH_MESSAGE } from '../../src/projects/projects.service';
import type { DatabaseService } from '../../src/database/database.service';
import type { WorkspaceEventsService } from '../../src/workspace/gateway/workspace-events.service';

function makeWorkspaceEventsService() {
  return { publish: jest.fn(), emit: jest.fn() } as unknown as WorkspaceEventsService;
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
    it('throws a read-only ForbiddenException when the project is visible but not owned (public graph)', async () => {
      // A public project is visible to non-owners via project_meta_public_read,
      // so the message must say "read-only", not "not found".
      const meta = { id: 'proj-1', ownerId: 'owner-abc', name: 'Test', emoji: null, isPublic: true };
      const { dbService } = makeDbService([meta]);
      const service = new ProjectsService(dbService, makeWorkspaceEventsService());

      await expect(service.assertOwnership('different-user', 'proj-1')).rejects.toThrow(
        READ_ONLY_GRAPH_MESSAGE,
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

      // Graphs are public by default (the sidebar lock toggle makes them private).
      const metaInsert = txInsertCalls.find((c) => c.tableName === 'project_meta');
      expect((metaInsert?.values as { isPublic: boolean }).isPublic).toBe(true);
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

  describe('clone', () => {
    // A tx double that returns per-table rows on reads and records every insert,
    // so we can assert the id remap + owner stamping without a live DB.
    function makeCloneDb(
      source: Record<string, unknown> | undefined,
      content: {
        thoughts: Record<string, unknown>[];
        labels: Record<string, unknown>[];
        relationships: Record<string, unknown>[];
        chunks: Record<string, unknown>[];
      },
    ) {
      const inserts: Array<{ table: string; values: any }> = [];
      const nameOf = (table: any) =>
        (table[Symbol.for('drizzle:Name')] as string) ?? 'unknown';
      const rowsFor = (name: string) => {
        if (name === 'project_meta') return source ? [source] : [];
        if (name === 'thoughts') return content.thoughts;
        if (name === 'labels') return content.labels;
        if (name === 'relationships') return content.relationships;
        if (name === 'chunks') return content.chunks;
        return [];
      };

      const tx = {
        select: jest.fn(() => ({
          from: jest.fn((table: any) => {
            const rows = rowsFor(nameOf(table));
            // Content selects await .where() directly; the project_meta lookup
            // chains .limit() — so .where() is both thenable and chainable.
            const where = jest.fn(() => {
              const p: any = Promise.resolve(rows);
              p.limit = jest.fn().mockResolvedValue(rows);
              return p;
            });
            return { where };
          }),
        })),
        insert: jest.fn((table: any) => ({
          values: jest.fn((vals: unknown) => {
            const name = nameOf(table);
            inserts.push({ table: name, values: vals });
            const p: any = Promise.resolve(undefined);
            p.returning = jest
              .fn()
              .mockResolvedValue([{ ...(vals as object) }]);
            return p;
          }),
        })),
      };

      const asUser = jest.fn((_u: string, cb: (tx: typeof tx) => Promise<unknown>) => cb(tx));
      return { dbService: { asUser } as unknown as DatabaseService, inserts };
    }

    it('throws NotFoundException when the source is not readable (RLS-invisible)', async () => {
      const { dbService } = makeCloneDb(undefined, {
        thoughts: [], labels: [], relationships: [], chunks: [],
      });
      const service = new ProjectsService(dbService, makeWorkspaceEventsService());
      await expect(service.clone('caller', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('deep-copies content with remapped ids, caller ownership, and a private clone', async () => {
      const source = { id: 'src', ownerId: 'owner-2', name: 'Source', emoji: '🧠', color: '#fff', isPublic: true };
      const content = {
        thoughts: [
          { id: 't1', projectId: 'src', ownerId: 'owner-2', color: null, body: 'a', title: 'A', contentHash: null, canvasX: 1, canvasY: 2, width: 3, height: 4 },
          { id: 't2', projectId: 'src', ownerId: 'owner-2', color: null, body: 'b', title: 'B', contentHash: null, canvasX: null, canvasY: null, width: null, height: null },
        ],
        labels: [
          { id: 'l1', projectId: 'src', ownerId: 'owner-2', name: 'tag', color: '#999999', isEdge: false },
        ],
        relationships: [
          { id: 'r1', projectId: 'src', ownerId: 'owner-2', sourceId: 't2', targetId: 't1', kind: 'hierarchy', labelId: null },
          { id: 'r2', projectId: 'src', ownerId: 'owner-2', sourceId: 't1', targetId: 'l1', kind: 'tag', labelId: null },
          { id: 'r3', projectId: 'src', ownerId: 'owner-2', sourceId: 't1', targetId: 't2', kind: 'edge', labelId: 'l1' },
        ],
        // vector round-trips as a string through the driver — must be re-parsed.
        chunks: [
          { id: 'c1', thoughtId: 't1', projectId: 'src', ownerId: 'owner-2', body: 'a', chunkIndex: 0, vectorEmbedding: '[0.1,0.2,0.3]' },
        ],
      };
      const { dbService, inserts } = makeCloneDb(source, content);
      const service = new ProjectsService(dbService, makeWorkspaceEventsService());

      const result = await service.clone('caller', 'src');

      const metaInsert = inserts.find((i) => i.table === 'project_meta')!.values;
      const newProjectId = metaInsert.id;
      expect(metaInsert).toMatchObject({ ownerId: 'caller', name: 'Source', isPublic: false });
      expect(result).toMatchObject({ role: 'owner' });

      const thoughtRows = inserts.find((i) => i.table === 'thoughts')!.values as any[];
      const labelRows = inserts.find((i) => i.table === 'labels')!.values as any[];
      const relRows = inserts.find((i) => i.table === 'relationships')!.values as any[];
      const chunkRows = inserts.find((i) => i.table === 'chunks')!.values as any[];

      // Every copied row is stamped with the caller's id + the new project scope.
      for (const rows of [thoughtRows, labelRows, relRows, chunkRows]) {
        for (const row of rows) {
          expect(row.ownerId).toBe('caller');
          expect(row.projectId).toBe(newProjectId);
        }
      }

      // Ids are remapped, and relationships point at the *new* ids.
      const newThoughtIds = thoughtRows.map((t) => t.id);
      const newLabelId = labelRows[0].id;
      expect(newThoughtIds).not.toContain('t1');
      const hierarchy = relRows.find((r) => r.kind === 'hierarchy');
      expect(newThoughtIds).toContain(hierarchy.sourceId);
      expect(newThoughtIds).toContain(hierarchy.targetId);
      const edge = relRows.find((r) => r.kind === 'edge');
      expect(edge.labelId).toBe(newLabelId);

      // Chunk vector was normalised back to a number[] and thoughtId remapped.
      expect(chunkRows[0].vectorEmbedding).toEqual([0.1, 0.2, 0.3]);
      expect(newThoughtIds).toContain(chunkRows[0].thoughtId);
    });
  });

  describe('subscribe', () => {
    // subscribe() reads project_meta filtered to (id, isPublic=true) then inserts.
    // The select chain here stands in for that RLS-scoped lookup.
    function makeSubscribeDb(metaRow: unknown | undefined) {
      const insertChain = { values: jest.fn().mockReturnValue({ onConflictDoNothing: jest.fn().mockResolvedValue(undefined) }) };
      const tx = {
        select: jest.fn().mockReturnValue(makeSelectChain(metaRow ? [metaRow] : [])),
        insert: jest.fn().mockReturnValue(insertChain),
      };
      const asUser = jest.fn((_u: string, cb: (tx: typeof tx) => Promise<unknown>) => cb(tx));
      return { dbService: { asUser } as unknown as DatabaseService, insertChain };
    }

    it('throws NotFoundException when the target is not a visible public project', async () => {
      const { dbService } = makeSubscribeDb(undefined);
      const service = new ProjectsService(dbService, makeWorkspaceEventsService());
      await expect(service.subscribe('user-1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the caller already owns the project', async () => {
      const { dbService } = makeSubscribeDb({ id: 'proj-1', ownerId: 'user-1', isPublic: true });
      const service = new ProjectsService(dbService, makeWorkspaceEventsService());
      await expect(service.subscribe('user-1', 'proj-1')).rejects.toThrow(BadRequestException);
    });

    it('inserts a subscription and returns the project as a subscriber role', async () => {
      const { dbService, insertChain } = makeSubscribeDb({ id: 'proj-1', ownerId: 'owner-2', isPublic: true });
      const service = new ProjectsService(dbService, makeWorkspaceEventsService());
      const result = await service.subscribe('user-1', 'proj-1');
      expect(insertChain.values).toHaveBeenCalledWith({ userId: 'user-1', projectId: 'proj-1' });
      expect(result).toMatchObject({ id: 'proj-1', role: 'subscriber' });
    });
  });
});
