/**
 * RelationshipsService unit tests — port-to-port (RelationshipsService driving port)
 *
 * Test Budget: 5 distinct behaviors × 2 = 10 max unit tests (using 7)
 * Behaviors:
 *   B1: create() rejects with BadRequestException for cross-project invariant violation
 *   B2: create() rejects with BadRequestException for invalid endpoint types
 *   B3: create() throws ConflictException when DB returns unique constraint violation (23505)
 *   B4: create() succeeds and returns inserted relationship when all preconditions pass
 *   B5: assertOwnership is called before any DB access on create()
 *
 * DatabaseService and ProjectsService are mocked at the driven port boundary.
 * No mocks inside the hexagonal domain — only at port boundaries.
 */

import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RelationshipsService } from '../../../src/workspace/relationships/relationships.service';
import type { DatabaseService } from '../../../src/database/database.service';
import type { ProjectsService } from '../../../src/projects/projects.service';

// ── Fluent Drizzle mock helpers ────────────────────────────────────

function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  chain.from = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.innerJoin = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockResolvedValue(rows);
  return chain;
}

function makeInsertChain(rows: unknown[], throwErr?: unknown) {
  const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  chain.values = jest.fn().mockReturnValue(chain);
  chain.returning = throwErr
    ? jest.fn().mockRejectedValue(throwErr)
    : jest.fn().mockResolvedValue(rows);
  return chain;
}

function makeDeleteChain() {
  const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  chain.where = jest.fn().mockResolvedValue(undefined);
  return chain;
}

/**
 * Build a DatabaseService mock. selectResponses is a list of row arrays
 * returned in order for successive select() calls.
 */
function makeDbService(opts: {
  selectResponses?: unknown[][];
  insertRows?: unknown[];
  insertError?: unknown;
} = {}): DatabaseService {
  const { selectResponses = [], insertRows = [{ id: 'rel-uuid' }], insertError } = opts;
  let selectCallIndex = 0;

  const drizzle = {
    select: jest.fn().mockImplementation(() => {
      const rows = selectResponses[selectCallIndex] ?? [];
      selectCallIndex++;
      return makeSelectChain(rows);
    }),
    insert: jest.fn().mockReturnValue(makeInsertChain(insertRows, insertError)),
    delete: jest.fn().mockReturnValue(makeDeleteChain()),
    execute: jest.fn().mockResolvedValue({ rows: [] }),
  };

  return { db: drizzle } as unknown as DatabaseService;
}

function makeProjectsService(assertImpl?: () => Promise<void>): ProjectsService {
  return {
    assertOwnership: jest.fn().mockImplementation(assertImpl ?? (() => Promise.resolve())),
  } as unknown as ProjectsService;
}

// ── Entity row factories ───────────────────────────────────────────

const thoughtInProj1 = { id: 'src-uuid', projectId: 'proj-1', type: 'thought' };
const thoughtInProj2 = { id: 'tgt-uuid', projectId: 'proj-2', type: 'thought' };
const thoughtInProj1b = { id: 'tgt-uuid', projectId: 'proj-1', type: 'thought' };
const labelInProj1 = { id: 'lbl-uuid', projectId: 'proj-1', type: 'label' };

// ── Tests ──────────────────────────────────────────────────────────

describe('RelationshipsService', () => {
  // ── B1: Cross-project invariant ────────────────────────────────

  describe('B1 — cross-project invariant', () => {
    it('rejects create() when source and target belong to different projects', async () => {
      // source in proj-1, target in proj-2 → cross-project violation
      const db = makeDbService({
        selectResponses: [[thoughtInProj1], [thoughtInProj2]],
      });
      const projectsService = makeProjectsService();
      const service = new RelationshipsService(db, projectsService);

      await expect(
        service.create('user-1', {
          projectId: 'proj-1',
          sourceId: 'src-uuid',
          targetId: 'tgt-uuid',
          kind: 'edge',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── B2: Endpoint-type validation ───────────────────────────────

  describe('B2 — endpoint-type validation', () => {
    it.each([
      {
        desc: 'hierarchy rejects thought→label endpoints',
        source: thoughtInProj1,
        target: labelInProj1,
        kind: 'hierarchy' as const,
      },
      {
        desc: 'tag rejects thought→thought endpoints',
        source: thoughtInProj1,
        target: thoughtInProj1b,
        kind: 'tag' as const,
      },
    ])('$desc', async ({ source, target, kind }) => {
      const db = makeDbService({ selectResponses: [[source], [target]] });
      const projectsService = makeProjectsService();
      const service = new RelationshipsService(db, projectsService);

      await expect(
        service.create('user-1', {
          projectId: 'proj-1',
          sourceId: source.id,
          targetId: target.id,
          kind,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── B3: Conflict handling ──────────────────────────────────────

  describe('B3 — conflict handling', () => {
    it('throws ConflictException (not raw DB error) when insert returns code 23505', async () => {
      const pgUniqueErr = Object.assign(new Error('duplicate key value'), { code: '23505' });
      const db = makeDbService({
        selectResponses: [[thoughtInProj1], [thoughtInProj1b]],
        insertError: pgUniqueErr,
      });
      const projectsService = makeProjectsService();
      const service = new RelationshipsService(db, projectsService);

      await expect(
        service.create('user-1', {
          projectId: 'proj-1',
          sourceId: thoughtInProj1.id,
          targetId: thoughtInProj1b.id,
          kind: 'hierarchy',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('re-throws non-23505 DB errors as-is', async () => {
      const unexpectedErr = new Error('connection refused');
      const db = makeDbService({
        selectResponses: [[thoughtInProj1], [thoughtInProj1b]],
        insertError: unexpectedErr,
      });
      const projectsService = makeProjectsService();
      const service = new RelationshipsService(db, projectsService);

      await expect(
        service.create('user-1', {
          projectId: 'proj-1',
          sourceId: thoughtInProj1.id,
          targetId: thoughtInProj1b.id,
          kind: 'hierarchy',
        }),
      ).rejects.toThrow('connection refused');
    });
  });

  // ── B4: Successful insert ──────────────────────────────────────

  describe('B4 — successful create', () => {
    it('inserts relationship and returns the record when all preconditions pass', async () => {
      const newRel = {
        id: 'rel-uuid',
        projectId: 'proj-1',
        sourceId: thoughtInProj1.id,
        targetId: thoughtInProj1b.id,
        kind: 'hierarchy',
        labelId: null,
      };
      const db = makeDbService({
        selectResponses: [[thoughtInProj1], [thoughtInProj1b]],
        insertRows: [newRel],
      });
      const projectsService = makeProjectsService();
      const service = new RelationshipsService(db, projectsService);

      const result = await service.create('user-1', {
        projectId: 'proj-1',
        sourceId: thoughtInProj1.id,
        targetId: thoughtInProj1b.id,
        kind: 'hierarchy',
      });

      expect(result).toMatchObject({ id: 'rel-uuid', kind: 'hierarchy' });
    });

    it('throws NotFoundException when source entity does not exist', async () => {
      const db = makeDbService({ selectResponses: [[]] }); // empty → not found
      const projectsService = makeProjectsService();
      const service = new RelationshipsService(db, projectsService);

      await expect(
        service.create('user-1', {
          projectId: 'proj-1',
          sourceId: 'missing-uuid',
          targetId: 'tgt-uuid',
          kind: 'edge',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── B5: assertOwnership ordering ──────────────────────────────

  describe('B5 — assertOwnership called before DB access', () => {
    it('calls assertOwnership before any DB select on create()', async () => {
      const callOrder: string[] = [];

      const projectsService = {
        assertOwnership: jest.fn().mockImplementation(async () => {
          callOrder.push('assertOwnership');
        }),
      } as unknown as ProjectsService;

      let selectCallCount = 0;
      const drizzle = {
        select: jest.fn().mockImplementation(() => {
          callOrder.push(`select:${selectCallCount++}`);
          const rows = selectCallCount === 1 ? [thoughtInProj1] : [thoughtInProj1b];
          return makeSelectChain(rows);
        }),
        insert: jest.fn().mockReturnValue(makeInsertChain([{ id: 'rel-uuid' }])),
        delete: jest.fn().mockReturnValue(makeDeleteChain()),
        execute: jest.fn().mockResolvedValue({ rows: [] }),
      };
      const db = { db: drizzle } as unknown as DatabaseService;
      const service = new RelationshipsService(db, projectsService);

      await service.create('user-1', {
        projectId: 'proj-1',
        sourceId: thoughtInProj1.id,
        targetId: thoughtInProj1b.id,
        kind: 'hierarchy',
      });

      expect(callOrder[0]).toBe('assertOwnership');
      expect(callOrder.some((e) => e.startsWith('select'))).toBe(true);
    });
  });
});
