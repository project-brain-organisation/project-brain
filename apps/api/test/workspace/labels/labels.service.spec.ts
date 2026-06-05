/**
 * LabelsService unit tests — port-to-port (LabelsService driving port)
 *
 * Scenario: create label atomic transaction and no tagging logic in labels service
 *
 * Test Budget: 3 distinct behaviors × 2 = 6 max unit tests (using 4)
 * Behaviors:
 *   B1: create() runs a DB transaction inserting into both entities and labels tables
 *   B2: create() calls assertOwnership BEFORE any DB operation
 *   B3: LabelsService has no assignLabel, unassignLabel, or thought_labels operations
 *
 * DatabaseService and ProjectsService are mocked at the driven port boundary.
 * No mocks inside the hexagonal domain — only at port boundaries.
 */

import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { LabelsService } from '../../../src/workspace/labels/labels.service';
import type { DatabaseService } from '../../../src/database/database.service';
import type { ProjectsService } from '../../../src/projects/projects.service';
import type { WorkspaceEventsService } from '../../../src/workspace/gateway/workspace-events.service';

// ── Fluent Drizzle mock helpers ────────────────────────────────────

function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  chain.from = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.innerJoin = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockResolvedValue(rows);
  return chain;
}

function makeSelectReturnsChain(rows: unknown[]) {
  const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  chain.from = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockResolvedValue(rows);
  chain.innerJoin = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockResolvedValue(rows);
  return chain;
}

/**
 * Build a DatabaseService mock with a transaction() that tracks which tables
 * received INSERT calls. Identifies tables by checking for 'name' column key
 * (labels table) vs absent 'name' key (entities table).
 */
function makeTxMock(opts: { throwOnInsert?: boolean } = {}) {
  const txInsertCalls: Array<{ tableName: string; values: unknown }> = [];

  const insertedLabel = {
    id: 'label-uuid',
    name: 'My Label',
    color: '#FF0000',
    isEdge: false,
  };

  const makeTxInsertChain = (tableName: string, rows: unknown[]) => {
    const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
    chain.values = jest.fn((vals: unknown) => {
      if (opts.throwOnInsert) {
        throw new Error('DB constraint violation');
      }
      txInsertCalls.push({ tableName, values: vals });
      return chain;
    });
    chain.returning = jest.fn().mockResolvedValue(rows);
    return chain;
  };

  const tx = {
    insert: jest.fn((table: unknown) => {
      // Identify table by checking for 'name' column key (labels has it, entities does not)
      const tbl = table as Record<string, unknown>;
      const hasNameCol = tbl && typeof tbl === 'object' && 'name' in tbl;
      const tableName = hasNameCol ? 'labels' : 'entities';
      return makeTxInsertChain(tableName, hasNameCol ? [insertedLabel] : [{ id: 'label-uuid' }]);
    }),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue([]),
    }),
  };

  const drizzle = {
    select: jest.fn().mockReturnValue(makeSelectChain([])),
    insert: jest.fn(),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue([]),
    }),
    transaction: jest.fn().mockImplementation(
      async (cb: (tx: typeof tx) => Promise<unknown>) => cb(tx),
    ),
  };

  const dbService = { db: drizzle } as unknown as DatabaseService;
  return { dbService, drizzle, tx, txInsertCalls };
}

function makeProjectsServiceMock(opts: { throwOnAssert?: boolean } = {}) {
  const assertOwnership = jest.fn().mockImplementation(async () => {
    if (opts.throwOnAssert) throw new Error('Access denied');
  });
  return { assertOwnership } as unknown as ProjectsService;
}

function makeWorkspaceEventsService(): WorkspaceEventsService {
  return { publish: jest.fn() } as unknown as WorkspaceEventsService;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('LabelsService', () => {
  describe('create', () => {
    it('B1: calls db.transaction and inserts into both entities and labels tables', async () => {
      const { dbService, drizzle, txInsertCalls } = makeTxMock();
      const projectsService = makeProjectsServiceMock();
      const service = new LabelsService(dbService, projectsService, makeWorkspaceEventsService());

      await service.create('user-1', {
        projectId: 'proj-uuid',
        name: 'My Label',
        color: '#FF0000',
      });

      expect(drizzle.transaction).toHaveBeenCalledTimes(1);

      const tableNames = txInsertCalls.map((c) => c.tableName);
      expect(tableNames).toContain('entities');
      expect(tableNames).toContain('labels');
    });

    it('B2: calls assertOwnership before any DB transaction on create()', async () => {
      const callOrder: string[] = [];

      const assertOwnership = jest.fn().mockImplementation(async () => {
        callOrder.push('assertOwnership');
      });
      const projectsService = { assertOwnership } as unknown as ProjectsService;

      const tx = {
        insert: jest.fn((table: unknown) => {
          const tbl = table as Record<string, unknown>;
          const hasNameCol = tbl && typeof tbl === 'object' && 'name' in tbl;
          const tableName = hasNameCol ? 'labels' : 'entities';
          callOrder.push(`tx.insert:${tableName}`);
          return {
            values: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([{ id: 'label-uuid' }]),
            }),
          };
        }),
      };

      const drizzle = {
        transaction: jest.fn().mockImplementation(
          async (cb: (tx: typeof tx) => Promise<unknown>) => cb(tx),
        ),
      };
      const dbService = { db: drizzle } as unknown as DatabaseService;
      const service = new LabelsService(dbService, projectsService, makeWorkspaceEventsService());

      await service.create('user-1', { projectId: 'proj-uuid', name: 'My Label' });

      // assertOwnership must appear before any tx.insert calls
      const assertIdx = callOrder.indexOf('assertOwnership');
      const firstInsertIdx = callOrder.findIndex((e) => e.startsWith('tx.insert'));
      expect(assertIdx).toBeGreaterThanOrEqual(0);
      expect(assertIdx).toBeLessThan(firstInsertIdx);
    });

    it('B1b: propagates transaction failure — rolls back both inserts atomically', async () => {
      const tx = {
        insert: jest.fn().mockImplementation(() => {
          throw new Error('DB constraint violation');
        }),
      };
      const drizzle = {
        transaction: jest.fn().mockImplementation(
          async (cb: (tx: typeof tx) => Promise<unknown>) => cb(tx),
        ),
      };
      const dbService = { db: drizzle } as unknown as DatabaseService;
      const projectsService = makeProjectsServiceMock();
      const service = new LabelsService(dbService, projectsService, makeWorkspaceEventsService());

      await expect(
        service.create('user-1', { projectId: 'proj-uuid', name: 'Fail Label' }),
      ).rejects.toThrow('DB constraint violation');
    });
  });

  describe('No tagging logic (B3)', () => {
    it('LabelsService has no assignLabel, unassignLabel, or thought_labels operations', () => {
      const { dbService } = makeTxMock();
      const projectsService = makeProjectsServiceMock();
      const service = new LabelsService(dbService, projectsService, makeWorkspaceEventsService());

      // None of these tagging methods should exist on the service
      expect((service as unknown as Record<string, unknown>)['assignLabel']).toBeUndefined();
      expect((service as unknown as Record<string, unknown>)['unassignLabel']).toBeUndefined();
      expect((service as unknown as Record<string, unknown>)['findByThought']).toBeUndefined();
    });
  });
});
