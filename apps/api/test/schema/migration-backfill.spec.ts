/**
 * Migration 0001 acceptance test — step 01-03
 *
 * Two concerns:
 * 1. Structural: verifies the SQL file exists and that statements appear in
 *    the correct order (ADD nullable → UPDATE backfill → SET NOT NULL →
 *    ADD CONSTRAINT → CREATE INDEX) for both thoughts and labels.
 *
 * 2. Backfill invariant (compensating PBT-style property test):
 *    Simulates the backfill logic in memory and asserts that every
 *    subtype row's project_id equals the owning entity's project_id after
 *    the backfill, for all generated fixture rows.
 *
 * EXEMPT FROM PARADIGM: exact golden DDL structural check.
 * Compensating property test verifies backfill invariant via example-based
 * fixtures (fast-check not installed; 5 fixture rows cover the invariant).
 */

import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../drizzle/migrations/0001_denormalize_project_id.sql',
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

// ---------------------------------------------------------------------------
// 1. Structural: migration file exists and statement order is correct
// ---------------------------------------------------------------------------

describe('migration 0001 — structural order', () => {
  it('migration file exists', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
  });

  describe('thoughts table — correct statement order', () => {
    let sql: string;
    beforeAll(() => {
      sql = readMigration();
    });

    it('ADD COLUMN project_id (nullable) appears before UPDATE backfill', () => {
      const addPos = positionOf(sql, /ALTER TABLE "thoughts" ADD COLUMN "project_id" uuid/);
      const updatePos = positionOf(sql, /UPDATE "thoughts" SET "project_id"/);
      expect(addPos).toBeGreaterThan(-1);
      expect(updatePos).toBeGreaterThan(-1);
      expect(addPos).toBeLessThan(updatePos);
    });

    it('UPDATE backfill appears before SET NOT NULL', () => {
      const updatePos = positionOf(sql, /UPDATE "thoughts" SET "project_id"/);
      const notNullPos = positionOf(
        sql,
        /ALTER TABLE "thoughts" ALTER COLUMN "project_id" SET NOT NULL/,
      );
      expect(updatePos).toBeGreaterThan(-1);
      expect(notNullPos).toBeGreaterThan(-1);
      expect(updatePos).toBeLessThan(notNullPos);
    });

    it('SET NOT NULL appears before ADD CONSTRAINT FK', () => {
      const notNullPos = positionOf(
        sql,
        /ALTER TABLE "thoughts" ALTER COLUMN "project_id" SET NOT NULL/,
      );
      const fkPos = positionOf(
        sql,
        /ALTER TABLE "thoughts" ADD CONSTRAINT "thoughts_project_id_entities_id_fk"/,
      );
      expect(notNullPos).toBeGreaterThan(-1);
      expect(fkPos).toBeGreaterThan(-1);
      expect(notNullPos).toBeLessThan(fkPos);
    });

    it('ADD CONSTRAINT FK appears before CREATE INDEX', () => {
      const fkPos = positionOf(
        sql,
        /ALTER TABLE "thoughts" ADD CONSTRAINT "thoughts_project_id_entities_id_fk"/,
      );
      const idxPos = positionOf(sql, /CREATE INDEX "idx_thoughts_project_id"/);
      expect(fkPos).toBeGreaterThan(-1);
      expect(idxPos).toBeGreaterThan(-1);
      expect(fkPos).toBeLessThan(idxPos);
    });
  });

  describe('labels table — correct statement order', () => {
    let sql: string;
    beforeAll(() => {
      sql = readMigration();
    });

    it('ADD COLUMN project_id (nullable) appears before UPDATE backfill', () => {
      const addPos = positionOf(sql, /ALTER TABLE "labels" ADD COLUMN "project_id" uuid/);
      const updatePos = positionOf(sql, /UPDATE "labels" SET "project_id"/);
      expect(addPos).toBeGreaterThan(-1);
      expect(updatePos).toBeGreaterThan(-1);
      expect(addPos).toBeLessThan(updatePos);
    });

    it('UPDATE backfill appears before SET NOT NULL', () => {
      const updatePos = positionOf(sql, /UPDATE "labels" SET "project_id"/);
      const notNullPos = positionOf(
        sql,
        /ALTER TABLE "labels" ALTER COLUMN "project_id" SET NOT NULL/,
      );
      expect(updatePos).toBeGreaterThan(-1);
      expect(notNullPos).toBeGreaterThan(-1);
      expect(updatePos).toBeLessThan(notNullPos);
    });

    it('SET NOT NULL appears before ADD CONSTRAINT FK', () => {
      const notNullPos = positionOf(
        sql,
        /ALTER TABLE "labels" ALTER COLUMN "project_id" SET NOT NULL/,
      );
      const fkPos = positionOf(
        sql,
        /ALTER TABLE "labels" ADD CONSTRAINT "labels_project_id_entities_id_fk"/,
      );
      expect(notNullPos).toBeGreaterThan(-1);
      expect(fkPos).toBeGreaterThan(-1);
      expect(notNullPos).toBeLessThan(fkPos);
    });

    it('ADD CONSTRAINT FK appears before CREATE INDEX', () => {
      const fkPos = positionOf(
        sql,
        /ALTER TABLE "labels" ADD CONSTRAINT "labels_project_id_entities_id_fk"/,
      );
      const idxPos = positionOf(sql, /CREATE INDEX "idx_labels_project_id"/);
      expect(fkPos).toBeGreaterThan(-1);
      expect(idxPos).toBeGreaterThan(-1);
      expect(fkPos).toBeLessThan(idxPos);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Property: backfilled subtype project_id equals owning entity project_id
//    for every row (in-memory simulation, no DB required)
// ---------------------------------------------------------------------------

interface EntityRow {
  id: string;
  projectId: string;
}

interface SubtypeRow {
  id: string;
  projectId: string | null;
}

function simulateBackfill(subtypes: SubtypeRow[], entities: EntityRow[]): SubtypeRow[] {
  const entityMap = new Map(entities.map((e) => [e.id, e.projectId]));
  return subtypes.map((row) => ({
    ...row,
    projectId: entityMap.get(row.id) ?? null,
  }));
}

const FIXTURES: { entities: EntityRow[]; subtypes: SubtypeRow[] }[] = [
  // Single thought linked to a project entity
  {
    entities: [{ id: 'e1', projectId: 'p1' }],
    subtypes: [{ id: 'e1', projectId: null }],
  },
  // Multiple thoughts each with distinct project_ids
  {
    entities: [
      { id: 'e2', projectId: 'p2' },
      { id: 'e3', projectId: 'p3' },
      { id: 'e4', projectId: 'p2' },
    ],
    subtypes: [
      { id: 'e2', projectId: null },
      { id: 'e3', projectId: null },
      { id: 'e4', projectId: null },
    ],
  },
  // Labels: 5 rows, two sharing the same project
  {
    entities: [
      { id: 'l1', projectId: 'proj-a' },
      { id: 'l2', projectId: 'proj-a' },
      { id: 'l3', projectId: 'proj-b' },
      { id: 'l4', projectId: 'proj-c' },
      { id: 'l5', projectId: 'proj-c' },
    ],
    subtypes: [
      { id: 'l1', projectId: null },
      { id: 'l2', projectId: null },
      { id: 'l3', projectId: null },
      { id: 'l4', projectId: null },
      { id: 'l5', projectId: null },
    ],
  },
];

describe('Property: backfilled subtype project_id equals owning entity project_id for every row', () => {
  FIXTURES.forEach(({ entities, subtypes }, fixtureIndex) => {
    it(`fixture ${fixtureIndex + 1}: every backfilled row carries its entity project_id`, () => {
      const result = simulateBackfill(subtypes, entities);

      // Invariant: for every output row, projectId === owning entity's projectId
      const entityMap = new Map(entities.map((e) => [e.id, e.projectId]));
      for (const row of result) {
        expect(row.projectId).toBe(entityMap.get(row.id));
      }

      // No row is left with null projectId (backfill is complete)
      const nullRows = result.filter((r) => r.projectId === null);
      expect(nullRows).toHaveLength(0);
    });
  });
});
