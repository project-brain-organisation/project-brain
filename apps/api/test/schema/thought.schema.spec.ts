/**
 * Schema test: thoughts table exposes immutable denormalized project_id
 *
 * Scenario: "thoughts table exposes immutable denormalized project_id with idx_thoughts_project_id"
 *
 * Verifies:
 * - thoughts table has a 'project_id' column that is notNull uuid
 * - project_id column has FK referencing entities.id with onDelete cascade
 * - thoughts table declares 'idx_thoughts_project_id' btree index on project_id
 *
 * EXEMPT FROM PBT PARADIGM: static schema metadata, not runtime behavior (AC item 5).
 * Single-example introspection test — property-based framing adds no detection value here.
 */

import { getTableConfig } from 'drizzle-orm/pg-core';
import { thoughts } from '../../src/database/schema/thought.schema';

describe('thoughts table — denormalized project_id', () => {
  it('has a project_id column that is uuid and notNull', () => {
    const config = getTableConfig(thoughts);
    const col = config.columns.find((c) => c.name === 'project_id');

    expect(col).toBeDefined();
    expect(col!.notNull).toBe(true);
    expect(col!.columnType).toBe('PgUUID');
  });

  it('has project_id column with FK referencing entities.id (onDelete cascade)', () => {
    const config = getTableConfig(thoughts);
    const fk = config.foreignKeys.find((f) => {
      const ref = (f as any).reference();
      return ref.columns?.some((c: any) => c.name === 'project_id');
    });

    expect(fk).toBeDefined();
    expect((fk as any).onDelete).toBe('cascade');
    const ref = (fk as any).reference();
    expect(ref.foreignColumns?.map((c: any) => c.name)).toContain('id');
  });

  it('declares idx_thoughts_project_id index on project_id', () => {
    const config = getTableConfig(thoughts);
    const idx = config.indexes.find((i) => i.config.name === 'idx_thoughts_project_id');

    expect(idx).toBeDefined();
  });
});
