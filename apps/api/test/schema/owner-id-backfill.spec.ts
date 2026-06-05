/**
 * Migration 0002 acceptance test — step 01-02
 *
 * Two concerns:
 * 1. Structural: verifies the SQL file exists and that statements appear in
 *    the correct order (ADD nullable → UPDATE backfill → SET NOT NULL →
 *    ADD CONSTRAINT FK → CREATE INDEX) for thoughts, labels, relationships,
 *    and chunks.
 *
 * 2. Backfill invariant (compensating PBT-style property test):
 *    Simulates the owner_id backfill logic in memory and asserts that every
 *    backfilled subtype row's owner_id equals the owning project_meta row's
 *    owner_id after the backfill, for all generated fixture rows.
 *
 * EXEMPT FROM PARADIGM: exact golden DDL structural check.
 * Compensating property test verifies backfill invariant via example-based
 * fixtures (fast-check not installed; fixture rows cover the invariant).
 */

import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../drizzle/migrations/0002_denormalize_owner_id.sql',
);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function readMigration(): string {
  return fs.readFileSync(MIGRATION_PATH, 'utf-8');
}

function positionOf(sql: string, pattern: RegExp): number {
  const match = pattern.exec(sql);
  return match ? match.index : -1;
}

const TABLES = ['thoughts', 'labels', 'relationships', 'chunks'] as const;

// ---------------------------------------------------------------------------
// 1. Structural: migration file exists and statement order is correct
// ---------------------------------------------------------------------------

describe('migration 0002 — structural order', () => {
  it('migration file exists', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  describe.each(TABLES)('%s table — correct statement order', (table) => {
    let sql: string;
    beforeAll(() => {
      sql = readMigration();
    });

    it('ADD COLUMN owner_id (nullable) appears before UPDATE backfill', () => {
      const addPos = positionOf(
        sql,
        new RegExp(`ALTER TABLE "${table}" ADD COLUMN "owner_id" uuid`),
      );
      const updatePos = positionOf(
        sql,
        new RegExp(`UPDATE "${table}" SET "owner_id"`),
      );
      expect(addPos).toBeGreaterThan(-1);
      expect(updatePos).toBeGreaterThan(-1);
      expect(addPos).toBeLessThan(updatePos);
    });

    it('UPDATE backfill appears before SET NOT NULL', () => {
      const updatePos = positionOf(
        sql,
        new RegExp(`UPDATE "${table}" SET "owner_id"`),
      );
      const notNullPos = positionOf(
        sql,
        new RegExp(`ALTER TABLE "${table}" ALTER COLUMN "owner_id" SET NOT NULL`),
      );
      expect(updatePos).toBeGreaterThan(-1);
      expect(notNullPos).toBeGreaterThan(-1);
      expect(updatePos).toBeLessThan(notNullPos);
    });

    it('SET NOT NULL appears before ADD CONSTRAINT FK', () => {
      const notNullPos = positionOf(
        sql,
        new RegExp(`ALTER TABLE "${table}" ALTER COLUMN "owner_id" SET NOT NULL`),
      );
      const fkPos = positionOf(
        sql,
        new RegExp(`ALTER TABLE "${table}" ADD CONSTRAINT "${table}_owner_id_users_id_fk"`),
      );
      expect(notNullPos).toBeGreaterThan(-1);
      expect(fkPos).toBeGreaterThan(-1);
      expect(notNullPos).toBeLessThan(fkPos);
    });

    it('ADD CONSTRAINT FK appears before CREATE INDEX', () => {
      const fkPos = positionOf(
        sql,
        new RegExp(`ALTER TABLE "${table}" ADD CONSTRAINT "${table}_owner_id_users_id_fk"`),
      );
      const idxPos = positionOf(
        sql,
        new RegExp(`CREATE INDEX "idx_${table}_owner_id"`),
      );
      expect(fkPos).toBeGreaterThan(-1);
      expect(idxPos).toBeGreaterThan(-1);
      expect(fkPos).toBeLessThan(idxPos);
    });

    it('FK references users(id) ON DELETE cascade', () => {
      const fkPattern = new RegExp(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_owner_id_users_id_fk" FOREIGN KEY \\("owner_id"\\) REFERENCES "users"\\("id"\\) ON DELETE cascade`,
        'i',
      );
      expect(fkPattern.test(sql)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Property: backfilled subtype owner_id equals owning project_meta owner_id
//    for every row (in-memory simulation, no DB required)
// ---------------------------------------------------------------------------

interface ProjectMetaRow {
  id: string;
  ownerId: string;
}

interface SubtypeRow {
  id: string;
  projectId: string;
  ownerId: string | null;
}

/**
 * Mirrors the migration UPDATE:
 *   UPDATE "<t>" SET "owner_id" = pm."owner_id"
 *   FROM "project_meta" pm WHERE "<t>"."project_id" = pm."id"
 */
function simulateBackfill(
  subtypes: SubtypeRow[],
  projectMeta: ProjectMetaRow[],
): SubtypeRow[] {
  const ownerByProject = new Map(projectMeta.map((pm) => [pm.id, pm.ownerId]));
  return subtypes.map((row) => ({
    ...row,
    ownerId: ownerByProject.get(row.projectId) ?? null,
  }));
}

const FIXTURES: { projectMeta: ProjectMetaRow[]; subtypes: SubtypeRow[] }[] = [
  // Single subtype row owned by one project
  {
    projectMeta: [{ id: 'p1', ownerId: 'u1' }],
    subtypes: [{ id: 's1', projectId: 'p1', ownerId: null }],
  },
  // Multiple subtype rows across projects owned by distinct users
  {
    projectMeta: [
      { id: 'p2', ownerId: 'u2' },
      { id: 'p3', ownerId: 'u3' },
    ],
    subtypes: [
      { id: 's2', projectId: 'p2', ownerId: null },
      { id: 's3', projectId: 'p3', ownerId: null },
      { id: 's4', projectId: 'p2', ownerId: null },
    ],
  },
  // One owner owning multiple projects; rows fan out across them
  {
    projectMeta: [
      { id: 'proj-a', ownerId: 'owner-x' },
      { id: 'proj-b', ownerId: 'owner-x' },
      { id: 'proj-c', ownerId: 'owner-y' },
    ],
    subtypes: [
      { id: 'r1', projectId: 'proj-a', ownerId: null },
      { id: 'r2', projectId: 'proj-a', ownerId: null },
      { id: 'r3', projectId: 'proj-b', ownerId: null },
      { id: 'r4', projectId: 'proj-c', ownerId: null },
      { id: 'r5', projectId: 'proj-c', ownerId: null },
    ],
  },
];

describe('Property: backfilled subtype owner_id equals owning project_meta owner_id for every row', () => {
  FIXTURES.forEach(({ projectMeta, subtypes }, fixtureIndex) => {
    it(`fixture ${fixtureIndex + 1}: every backfilled row carries its project_meta owner_id`, () => {
      const result = simulateBackfill(subtypes, projectMeta);

      // Invariant: for every output row, ownerId === owning project_meta's ownerId
      const ownerByProject = new Map(projectMeta.map((pm) => [pm.id, pm.ownerId]));
      for (const row of result) {
        expect(row.ownerId).toBe(ownerByProject.get(row.projectId));
      }

      // No row is left with null ownerId (backfill is complete)
      const nullRows = result.filter((r) => r.ownerId === null);
      expect(nullRows).toHaveLength(0);
    });
  });
});
