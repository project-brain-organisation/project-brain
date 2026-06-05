/**
 * ownership-check-removal.spec.ts
 *
 * Step 04-01: "Remove RLS-redundant ownership checks; retain project-type FK invariant"
 *
 * Scenario: "Property: services drop RLS-redundant ownership checks yet still reject
 * non-project-type projectId on create"
 *
 * Test Budget: 3 distinct behaviors × 2 = 6 max unit tests
 * Behaviors:
 *   B1: create() still calls assertOwnership (project-type FK check) and propagates
 *       ForbiddenException when assertOwnership throws (non-project-type projectId)
 *   B2: read paths (findOne, findByProject) return data WITHOUT assertOwnership being
 *       called — the ownership guard is now provided by RLS at the DB layer
 *   B3: NotFoundException still fires on missing rows for read/update/delete paths
 *       (RLS makes unauthorized rows invisible, but missing rows still throw)
 *
 * // bypass: fallback — Jest example-based; fast-check is not installed in this workspace.
 * it.each covers 3–5 DTO variants for property-style coverage per AC5.
 *
 * DatabaseService and ProjectsService are mocked at the driven port boundary.
 * No mocks inside the hexagonal domain.
 *
 * review-revision: all db doubles updated from db.db.transaction/select to db.asUser()
 * to match the RLS-wrapping added in the review-revision pass.
 */

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ThoughtsService } from '../../src/workspace/thoughts/thoughts.service';
import { LabelsService } from '../../src/workspace/labels/labels.service';
import { RelationshipsService } from '../../src/workspace/relationships/relationships.service';
import type { DatabaseService } from '../../src/database/database.service';
import type { ProjectsService } from '../../src/projects/projects.service';
import type { PipelineService } from '../../src/workspace/pipeline/pipeline.service';
import type { WorkspaceEventsService } from '../../src/workspace/gateway/workspace-events.service';

// ── Shared doubles ─────────────────────────────────────────────────

function makePipeline(): PipelineService {
  return {
    chunkAndEmbed: jest.fn().mockResolvedValue(undefined),
    rechunk: jest.fn().mockResolvedValue(undefined),
    semanticSearch: jest.fn().mockResolvedValue([]),
  } as unknown as PipelineService;
}

function makeEvents(): WorkspaceEventsService {
  return { publish: jest.fn() } as unknown as WorkspaceEventsService;
}

function makeProjectsService(throws?: Error): ProjectsService {
  return {
    assertOwnership: jest
      .fn()
      .mockImplementation(throws ? () => Promise.reject(throws) : () => Promise.resolve()),
  } as unknown as ProjectsService;
}

// ── Drizzle tx chain helpers ─────────────────────────────────────

function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  chain.from = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.innerJoin = jest.fn().mockReturnValue(chain);
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

/** Build a tx for thoughts create — tracks insert calls to entities and thoughts tables. */
function makeTxForThought(entityRow: unknown, thoughtRow: unknown) {
  return {
    insert: jest.fn((table: Record<string, unknown>) => {
      const tableName = (table as any)[Symbol.for('drizzle:Name')] ?? 'unknown';
      const rows = tableName === 'entities' ? [entityRow] : [thoughtRow];
      const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
      chain.values = jest.fn().mockReturnValue(chain);
      chain.returning = jest.fn().mockResolvedValue(rows);
      return chain;
    }),
    select: jest.fn().mockReturnValue(makeSelectChain([])),
    update: jest.fn().mockReturnValue(makeUpdateChain([])),
    delete: jest.fn().mockReturnValue(makeDeleteChain()),
  };
}

/** Build a tx for labels create — identifies table by presence of 'name' column. */
function makeTxForLabel(labelRow: unknown) {
  return {
    insert: jest.fn((table: unknown) => {
      const tbl = table as Record<string, unknown>;
      const hasNameCol = tbl && typeof tbl === 'object' && 'name' in tbl;
      const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
      chain.values = jest.fn().mockReturnValue(chain);
      chain.returning = jest
        .fn()
        .mockResolvedValue(hasNameCol ? [labelRow] : [{ id: 'ent-uuid', projectId: 'proj-1' }]);
      return chain;
    }),
    select: jest.fn().mockReturnValue(makeSelectChain([])),
    update: jest.fn().mockReturnValue(makeUpdateChain([])),
    delete: jest.fn().mockReturnValue(makeDeleteChain()),
  };
}

/**
 * DatabaseService double for create() paths.
 * asUser() routes callback through the supplied tx double.
 * Exposes asUser spy so tests can assert it was NOT called when ownership check fails.
 */
function makeDbForCreate(tx: unknown): { db: DatabaseService; asUser: jest.Mock } {
  const asUser = jest.fn((_userId: string, cb: (tx: unknown) => Promise<unknown>) => cb(tx));
  return { db: { asUser } as unknown as DatabaseService, asUser };
}

/**
 * DatabaseService double for read/update/delete paths.
 * asUser() routes callback through a tx that has select/update/delete returning the given rows.
 */
function makeDbForRead(rows: unknown[]): DatabaseService {
  const tx = {
    select: jest.fn().mockReturnValue(makeSelectChain(rows)),
    update: jest.fn().mockReturnValue(makeUpdateChain(rows)),
    delete: jest.fn().mockReturnValue(makeDeleteChain()),
    execute: jest.fn().mockResolvedValue({ rows: [] }),
    insert: jest.fn(),
  };
  const asUser = jest.fn((_userId: string, cb: (tx: typeof tx) => Promise<unknown>) => cb(tx));
  return { asUser } as unknown as DatabaseService;
}

// ── B1: create() retains the project-type FK check via assertOwnership ──

describe('B1 — create() retains assertOwnership for project-type FK invariant', () => {
  // Parametrized over 4 DTO shapes to give property-style coverage (AC5).
  it.each([
    { projectId: 'non-project-uuid-1', body: 'hello', title: 'T1' },
    { projectId: 'non-project-uuid-2', body: 'world', title: undefined },
    { projectId: 'bad-proj-3', body: '' },
    { projectId: 'bad-proj-4', body: 'text', color: '#ff0000' },
  ])(
    'ThoughtsService.create() propagates ForbiddenException for non-project-type projectId %o',
    async (dto) => {
      const forbidden = new ForbiddenException('Project not found or access denied');
      const projectsService = makeProjectsService(forbidden);
      const entityRow = { id: 'ent', projectId: dto.projectId, type: 'thought' };
      const thoughtRow = { id: 'ent', projectId: dto.projectId, body: dto.body, title: '', color: null };
      const { db, asUser } = makeDbForCreate(makeTxForThought(entityRow, thoughtRow));

      const service = new ThoughtsService(db, projectsService, makePipeline(), makeEvents());

      await expect(service.create('user-1', dto)).rejects.toThrow(ForbiddenException);
      expect(projectsService.assertOwnership).toHaveBeenCalledWith('user-1', dto.projectId);
      // asUser must NOT have been called when ownership check fails
      expect(asUser).not.toHaveBeenCalled();
    },
  );

  it.each([
    { projectId: 'non-project-uuid-1', name: 'Tag1' },
    { projectId: 'non-project-uuid-2', name: 'Tag2', color: '#ff0000' },
    { projectId: 'bad-proj-3', name: 'Tag3', isEdge: true },
  ])(
    'LabelsService.create() propagates ForbiddenException for non-project-type projectId %o',
    async (dto) => {
      const forbidden = new ForbiddenException('Project not found or access denied');
      const projectsService = makeProjectsService(forbidden);
      const labelRow = { id: 'lbl', projectId: dto.projectId, name: dto.name, color: '#999999', isEdge: false };
      const { db } = makeDbForCreate(makeTxForLabel(labelRow));

      const service = new LabelsService(db, projectsService, makeEvents());

      await expect(service.create('user-1', dto)).rejects.toThrow(ForbiddenException);
      expect(projectsService.assertOwnership).toHaveBeenCalledWith('user-1', dto.projectId);
    },
  );
});

// ── B2: read paths return data WITHOUT calling assertOwnership ────────

describe('B2 — read paths do NOT call assertOwnership (RLS enforces isolation)', () => {
  const thoughtRow = {
    id: 'thought-1',
    projectId: 'proj-1',
    ownerId: 'owner-1',
    body: 'hello',
    title: '',
    color: null,
  };

  it('ThoughtsService.findOne() returns row without calling assertOwnership', async () => {
    const projectsService = makeProjectsService();
    (projectsService.assertOwnership as jest.Mock).mockResolvedValue(undefined);

    const db = makeDbForRead([thoughtRow]);
    const service = new ThoughtsService(db, projectsService, makePipeline(), makeEvents());

    const result = await service.findOne('user-1', 'thought-1');

    expect(result).toMatchObject({ id: 'thought-1', projectId: 'proj-1' });
    // assertOwnership must NOT be called on the read path after RLS removal
    expect(projectsService.assertOwnership).not.toHaveBeenCalled();
  });

  it('ThoughtsService.findByProject() returns rows without calling assertOwnership', async () => {
    const projectsService = makeProjectsService();
    (projectsService.assertOwnership as jest.Mock).mockResolvedValue(undefined);

    const selectChain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
    selectChain.from = jest.fn().mockReturnValue(selectChain);
    selectChain.where = jest.fn().mockResolvedValue([thoughtRow]);
    selectChain.limit = jest.fn().mockResolvedValue([thoughtRow]);

    const tx = {
      select: jest.fn().mockReturnValue(selectChain),
      update: jest.fn().mockReturnValue(makeUpdateChain([])),
      delete: jest.fn().mockReturnValue(makeDeleteChain()),
      insert: jest.fn(),
    };
    const asUser = jest.fn((_userId: string, cb: (tx: typeof tx) => Promise<unknown>) => cb(tx));
    const db = { asUser } as unknown as DatabaseService;
    const service = new ThoughtsService(db, projectsService, makePipeline(), makeEvents());

    await service.findByProject('user-1', 'proj-1');

    expect(projectsService.assertOwnership).not.toHaveBeenCalled();
  });

  const labelRow = {
    id: 'lbl-1',
    projectId: 'proj-1',
    ownerId: 'owner-1',
    name: 'Tag',
    color: '#000',
    isEdge: false,
  };

  it('LabelsService.findOne() returns row without calling assertOwnership', async () => {
    const projectsService = makeProjectsService();
    (projectsService.assertOwnership as jest.Mock).mockResolvedValue(undefined);

    const db = makeDbForRead([labelRow]);
    const service = new LabelsService(db, projectsService, makeEvents());

    const result = await service.findOne('user-1', 'lbl-1');

    expect(result).toMatchObject({ id: 'lbl-1' });
    expect(projectsService.assertOwnership).not.toHaveBeenCalled();
  });
});

// ── B3: NotFoundException still fires on missing rows ─────────────────

describe('B3 — NotFoundException still fires on missing rows (RLS makes unauthorized rows invisible)', () => {
  it('ThoughtsService.findOne() throws NotFoundException for genuinely missing thought', async () => {
    const projectsService = makeProjectsService();
    const db = makeDbForRead([]);

    const service = new ThoughtsService(db, projectsService, makePipeline(), makeEvents());

    await expect(service.findOne('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('ThoughtsService.remove() throws NotFoundException for missing thought', async () => {
    const projectsService = makeProjectsService();
    const db = makeDbForRead([]);

    const service = new ThoughtsService(db, projectsService, makePipeline(), makeEvents());

    await expect(service.remove('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('LabelsService.findOne() throws NotFoundException for genuinely missing label', async () => {
    const projectsService = makeProjectsService();
    const db = makeDbForRead([]);

    const service = new LabelsService(db, projectsService, makeEvents());

    await expect(service.findOne('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('RelationshipsService.findOne() throws NotFoundException for missing relationship', async () => {
    const projectsService = makeProjectsService();
    const db = makeDbForRead([]);
    const service = new RelationshipsService(db, projectsService, makeEvents());

    await expect(service.findOne('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
  });
});
