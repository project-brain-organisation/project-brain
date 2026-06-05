/**
 * Schema integration test: owner_id denormalization across the four scoped subtype tables
 *
 * Scenario: "all four scoped tables expose immutable denormalized owner_id with
 * idx_<table>_owner_id index".
 *
 * Verifies, for thoughts / labels / relationships / chunks, that each table:
 *   - exports an ownerId column mapped to the 'owner_id' DB identifier
 *   - the column is uuid (PgUUID) and notNull
 *   - declares a single-column btree index named idx_<table>_owner_id on owner_id
 *
 * This mirrors projectMeta.ownerId exactly (uuid, notNull, FK users.id cascade,
 * single-column btree). owner_id is a denormalized immutable copy of the project's
 * owner, carried locally so RLS can enforce ownership without joining project_meta.
 *
 * EXEMPT FROM PBT PARADIGM (roadmap criterion 5): static schema metadata, not runtime
 * behavior. A single-example introspection assertion per table satisfies the scenario;
 * backfill-correctness is compensated by the property test at step 01-02.
 */

import { thoughts } from '../../src/database/schema/thought.schema';
import { labels } from '../../src/database/schema/label.schema';
import { relationships } from '../../src/database/schema/relationship.schema';
import { chunks } from '../../src/database/schema/chunk.schema';

type DrizzleTable = Record<symbol, unknown>;

function indexNames(table: DrizzleTable): string[] {
  const buildExtraConfig = (table as any)[
    Symbol.for('drizzle:ExtraConfigBuilder')
  ];
  const extraConfigColumns = (table as any)[
    Symbol.for('drizzle:ExtraConfigColumns')
  ];
  const config = buildExtraConfig(extraConfigColumns);
  const builders = Array.isArray(config) ? config : Object.values(config);
  return builders.map((builder: any) => builder.build(table).config.name);
}

const scopedTables: ReadonlyArray<{
  tableName: string;
  table: DrizzleTable;
  expectedIndex: string;
}> = [
  { tableName: 'thoughts', table: thoughts, expectedIndex: 'idx_thoughts_owner_id' },
  { tableName: 'labels', table: labels, expectedIndex: 'idx_labels_owner_id' },
  {
    tableName: 'relationships',
    table: relationships,
    expectedIndex: 'idx_relationships_owner_id',
  },
  { tableName: 'chunks', table: chunks, expectedIndex: 'idx_chunks_owner_id' },
];

describe('owner_id denormalization across scoped subtype tables', () => {
  describe.each(scopedTables)(
    '$tableName',
    ({ table, expectedIndex }) => {
      it('exposes ownerId as a notNull uuid mapped to owner_id', () => {
        const cols = (table as any)[Symbol.for('drizzle:Columns')] as Record<
          string,
          any
        >;
        expect(cols).toHaveProperty('ownerId');
        expect(cols['ownerId'].name).toBe('owner_id');
        expect(cols['ownerId'].columnType).toBe('PgUUID');
        expect(cols['ownerId'].notNull).toBe(true);
      });

      it(`declares the ${expectedIndex} index on owner_id`, () => {
        expect(indexNames(table)).toContain(expectedIndex);
      });
    },
  );
});
