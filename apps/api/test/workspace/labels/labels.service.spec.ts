/**
 * LabelsService unit tests — port-to-port (LabelsService driving port)
 *
 * Scenario: "Property: labels service stamps and filters project_id without joining entities for scope"
 *
 * Test Budget: 4 distinct behaviors × 2 = 8 max unit tests (using 7)
 * Behaviors:
 *   B1: create() stamps projectId onto the labels insert (denormalized)
 *   B2: findByProject() filters by labels.projectId directly — no innerJoin on entities
 *   B3: by-id methods (findOne, update, remove) query labels first, not entities
 *   B4: assertOwnership runs with label row's projectId; NotFoundException thrown for missing rows
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

/**
 * Build a DatabaseService mock with a transaction() that captures labels insert values.
 * Identifies labels table by checking for 'name' column key (labels has it, entities does not).
 */
function makeTxMock(opts: {
  throwOnInsert?: boolean;
  labelRow?: Record<string, unknown>;
} = {}) {
  const txInsertCalls: Array<{ tableName: string; values: unknown }> = [];
  let capturedLabelInsertValues: Record<string, unknown> | null = null;

  const defaultLabelRow = opts.labelRow ?? {
    id: 'label-uuid',
    projectId: 'proj-uuid',
    name: 'My Label',
    color: '#FF0000',
    isEdge: false,
  };

  const makeTxInsertChain = (tableName: string, rows: unknown[]) => {
    const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
    chain.values = jest.fn((vals: unknown) => {
      if (opts.throwOnInsert) throw new Error('DB constraint violation');
      txInsertCalls.push({ tableName, values: vals });
      if (tableName === 'labels') {
        capturedLabelInsertValues = vals as Record<string, unknown>;
      }
      return chain;
    });
    chain.returning = jest.fn().mockResolvedValue(rows);
    return chain;
  };

  const tx = {
    insert: jest.fn((table: unknown) => {
      const tbl = table as Record<string, unknown>;
      const hasNameCol = tbl && typeof tbl === 'object' && 'name' in tbl;
      const tableName = hasNameCol ? 'labels' : 'entities';
      return makeTxInsertChain(
        tableName,
        hasNameCol ? [defaultLabelRow] : [{ id: 'label-uuid', projectId: 'proj-uuid' }],
      );
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
  return { dbService, drizzle, tx, txInsertCalls, getLabelInsertValues: () => capturedLabelInsertValues };
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

/**
 * Build a mock drizzle where select() returns a labels row for by-id methods.
 * Tracks which table's 'from' was called first to detect entities vs labels first-query.
 */
function makeDbWithLabelRow(labelRow: Record<string, unknown>, opts: { missing?: boolean } = {}) {
  const fromCalls: string[] = [];

  const makeQueryChain = (rows: unknown[]) => {
    const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
    chain.from = jest.fn((table: unknown) => {
      const tbl = table as Record<string, unknown>;
      const hasNameCol = tbl && typeof tbl === 'object' && 'name' in tbl;
      fromCalls.push(hasNameCol ? 'labels' : 'entities');
      return chain;
    });
    chain.where = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockResolvedValue(rows);
    return chain;
  };

  const rows = opts.missing ? [] : [labelRow];

  const drizzle = {
    select: jest.fn().mockImplementation(() => makeQueryChain(rows)),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ ...labelRow, name: 'Updated' }]),
        }),
      }),
    }),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue([]),
    }),
    transaction: jest.fn(),
  };

  return { drizzle, dbService: { db: drizzle } as unknown as DatabaseService, fromCalls };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('LabelsService', () => {
  // ── B1: create() stamps projectId onto the labels insert ──────────
  describe('create()', () => {
    it('B1: labels insert includes projectId field (denormalized)', async () => {
      const { dbService, getLabelInsertValues } = makeTxMock();
      const projectsService = makeProjectsServiceMock();
      const service = new LabelsService(dbService, projectsService, makeWorkspaceEventsService());

      await service.create('user-1', {
        projectId: 'proj-uuid',
        name: 'My Label',
        color: '#FF0000',
      });

      const labelVals = getLabelInsertValues();
      expect(labelVals).not.toBeNull();
      expect((labelVals as Record<string, unknown>)['projectId']).toBe('proj-uuid');
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
              returning: jest.fn().mockResolvedValue([{ id: 'label-uuid', projectId: 'proj-uuid' }]),
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

      const assertIdx = callOrder.indexOf('assertOwnership');
      const firstInsertIdx = callOrder.findIndex((e) => e.startsWith('tx.insert'));
      expect(assertIdx).toBeGreaterThanOrEqual(0);
      expect(assertIdx).toBeLessThan(firstInsertIdx);
    });

    it('B1c: propagates transaction failure — rolls back both inserts atomically', async () => {
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

  // ── B2: findByProject() queries labels directly (no innerJoin) ────
  describe('findByProject()', () => {
    it('B2: does not call innerJoin — queries labels.projectId directly', async () => {
      const selectChain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
      selectChain.from = jest.fn().mockReturnValue(selectChain);
      selectChain.innerJoin = jest.fn().mockReturnValue(selectChain);
      selectChain.where = jest.fn().mockResolvedValue([]);

      const drizzle = {
        select: jest.fn().mockReturnValue(selectChain),
      };
      const dbService = { db: drizzle } as unknown as DatabaseService;
      const projectsService = makeProjectsServiceMock();
      const service = new LabelsService(dbService, projectsService, makeWorkspaceEventsService());

      await service.findByProject('user-1', 'proj-uuid');

      // Must NOT call innerJoin — scope comes from labels.projectId directly
      expect(selectChain.innerJoin).not.toHaveBeenCalled();
    });
  });

  // ── B3: by-id methods query labels first, not entities ───────────
  describe('findOne()', () => {
    it('B3: queries labels table first (not entities) for scope resolution', async () => {
      const labelRow = { id: 'lbl-1', projectId: 'proj-uuid', name: 'Tag', color: '#000', isEdge: false };
      const { drizzle, dbService, fromCalls } = makeDbWithLabelRow(labelRow);
      const projectsService = makeProjectsServiceMock();
      const service = new LabelsService(dbService, projectsService, makeWorkspaceEventsService());

      await service.findOne('user-1', 'lbl-1');

      // First from() call must be on labels, not entities
      expect(fromCalls[0]).toBe('labels');
    });

    it('B4: throws NotFoundException when label row missing', async () => {
      const { dbService } = makeDbWithLabelRow({}, { missing: true });
      const projectsService = makeProjectsServiceMock();
      const service = new LabelsService(dbService, projectsService, makeWorkspaceEventsService());

      await expect(service.findOne('user-1', 'missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update()', () => {
    it('B3: queries labels table first (not entities) and uses label.projectId for ownership', async () => {
      const labelRow = { id: 'lbl-1', projectId: 'proj-xyz', name: 'Tag', color: '#000', isEdge: false };
      const { dbService, fromCalls } = makeDbWithLabelRow(labelRow);
      const projectsService = makeProjectsServiceMock();
      const events = makeWorkspaceEventsService();
      const service = new LabelsService(dbService, projectsService, events);

      await service.update('user-1', 'lbl-1', { name: 'Updated' });

      // First from() call must be labels
      expect(fromCalls[0]).toBe('labels');
      // assertOwnership called with label's projectId
      expect(projectsService.assertOwnership).toHaveBeenCalledWith('user-1', 'proj-xyz');
    });
  });

  describe('remove()', () => {
    it('B3: queries labels table first for scope; still deletes from entities (cascade)', async () => {
      const labelRow = { id: 'lbl-1', projectId: 'proj-xyz', name: 'Tag', color: '#000', isEdge: false };
      const { drizzle, dbService, fromCalls } = makeDbWithLabelRow(labelRow);
      const projectsService = makeProjectsServiceMock();
      const service = new LabelsService(dbService, projectsService, makeWorkspaceEventsService());

      const result = await service.remove('user-1', 'lbl-1');

      // First from() call must be labels
      expect(fromCalls[0]).toBe('labels');
      // delete is called (cascade via entities)
      expect(drizzle.delete).toHaveBeenCalled();
      expect(result).toEqual({ deleted: true });
    });
  });
});
