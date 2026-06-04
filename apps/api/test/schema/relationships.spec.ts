/**
 * Schema integration test: relationships unified edge table
 *
 * Verifies:
 * - Table name matches expected DB identifier
 * - relationshipKind pgEnum includes required values (hierarchy, tag, edge)
 * - relationships table is exported from the schema file
 *
 * EXEMPT FROM PBT PARADIGM: schema compilation check (single-example integration test)
 */

import {
  relationships,
  relationshipKind,
} from '../../src/database/schema/relationship.schema';

describe('relationships schema', () => {
  it('has table name relationships', () => {
    expect(relationships[Symbol.for('drizzle:Name')]).toBe('relationships');
  });

  it('exports relationshipKind enum with required values', () => {
    const enumValues: string[] = relationshipKind.enumValues;
    expect(enumValues).toContain('hierarchy');
    expect(enumValues).toContain('tag');
    expect(enumValues).toContain('edge');
  });
});
