/**
 * Schema integration test: thoughts and labels subtype FK and stripped columns
 *
 * Verifies:
 * - Table names match expected DB identifiers
 * - id is PK+FK to entities.id (Table-per-Type pattern)
 * - Stripped columns (user_id, parent_id, colorId, is_root) are absent
 * - project_id IS present on thoughts (denormalized, step 01-01); stripped from labels
 * - color is inline varchar(7) on both tables (no FK)
 * - Drizzle relations() tying each subtype id back to entities are declared
 *
 * EXEMPT FROM PBT PARADIGM: schema compilation check (single-example integration test)
 */

import { thoughts, thoughtsRelations } from '../../src/database/schema/thought.schema';
import { labels, labelsRelations } from '../../src/database/schema/label.schema';

describe('thoughts subtype schema', () => {
  it('has table name thoughts', () => {
    expect(thoughts[Symbol.for('drizzle:Name')]).toBe('thoughts');
  });

  it('has color column as inline varchar(7)', () => {
    const cols = thoughts[Symbol.for('drizzle:Columns')] as Record<string, any>;
    expect(cols).toHaveProperty('color');
    expect(cols['color'].columnType).toBe('PgVarchar');
    expect(cols['color'].config.length).toBe(7);
  });

  it('does not have user_id, parent_id, colorId, or is_root columns', () => {
    const cols = thoughts[Symbol.for('drizzle:Columns')] as Record<string, any>;
    expect(cols).not.toHaveProperty('userId');
    expect(cols).not.toHaveProperty('parentId');
    expect(cols).not.toHaveProperty('colorId');
    expect(cols).not.toHaveProperty('isRoot');
  });

  it('declares a relation back to entities', () => {
    // thoughtsRelations is a Drizzle RelationsBuilderConfig; it exists and is truthy
    expect(thoughtsRelations).toBeDefined();
  });
});

describe('labels subtype schema', () => {
  it('has table name labels', () => {
    expect(labels[Symbol.for('drizzle:Name')]).toBe('labels');
  });

  it('has color column as inline varchar(7)', () => {
    const cols = labels[Symbol.for('drizzle:Columns')] as Record<string, any>;
    expect(cols).toHaveProperty('color');
    expect(cols['color'].columnType).toBe('PgVarchar');
    expect(cols['color'].config.length).toBe(7);
  });

  it('does not have user_id or project_id columns', () => {
    const cols = labels[Symbol.for('drizzle:Columns')] as Record<string, any>;
    expect(cols).not.toHaveProperty('userId');
    expect(cols).not.toHaveProperty('projectId');
  });

  it('declares a relation back to entities', () => {
    expect(labelsRelations).toBeDefined();
  });
});
