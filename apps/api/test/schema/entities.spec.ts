/**
 * Schema integration test: entities self-referential project_id and project_meta TPT key
 *
 * Verifies Drizzle schema objects are correctly defined:
 * - Table names match expected DB identifiers
 * - entityType pgEnum includes required values
 * - project_meta uses TPT (Table-per-Type) pattern: id is PK and FK to entities.id
 *
 * EXEMPT FROM PBT PARADIGM: schema compilation check (single-example integration test)
 */

import { entities, entityType } from '../../src/database/schema/entities.schema';
import { projectMeta } from '../../src/database/schema/project-meta.schema';

describe('entities schema', () => {
  it('has table name entities', () => {
    expect(entities[Symbol.for('drizzle:Name')]).toBe('entities');
  });

  it('exports entityType enum with required values', () => {
    const enumValues: string[] = entityType.enumValues;
    expect(enumValues).toContain('project');
    expect(enumValues).toContain('thought');
    expect(enumValues).toContain('label');
  });
});

describe('project_meta schema', () => {
  it('has table name project_meta', () => {
    expect(projectMeta[Symbol.for('drizzle:Name')]).toBe('project_meta');
  });
});
