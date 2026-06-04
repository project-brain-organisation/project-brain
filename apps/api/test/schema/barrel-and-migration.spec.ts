/**
 * Schema barrel acceptance test — step 01-05
 *
 * Verifies that the schema/index.ts barrel re-exports all required
 * table objects from the 8 schema files. Tests load through the barrel
 * import path, confirming the module resolves and all named exports exist.
 *
 * EXEMPT FROM PBT PARADIGM: barrel compilation / export-surface check
 * (single-example structural integration test, not a domain behaviour)
 */

import * as schema from '../../src/database/schema/index';

describe('full schema barrel exports all tables', () => {
  it('exports entities table', () => {
    expect(schema.entities).toBeDefined();
    expect(schema.entities[Symbol.for('drizzle:Name')]).toBe('entities');
  });

  it('exports projectMeta table', () => {
    expect(schema.projectMeta).toBeDefined();
    expect(schema.projectMeta[Symbol.for('drizzle:Name')]).toBe('project_meta');
  });

  it('exports thoughts table', () => {
    expect(schema.thoughts).toBeDefined();
    expect(schema.thoughts[Symbol.for('drizzle:Name')]).toBe('thoughts');
  });

  it('exports labels table', () => {
    expect(schema.labels).toBeDefined();
    expect(schema.labels[Symbol.for('drizzle:Name')]).toBe('labels');
  });

  it('exports relationships table', () => {
    expect(schema.relationships).toBeDefined();
    expect(schema.relationships[Symbol.for('drizzle:Name')]).toBe('relationships');
  });

  it('exports chunks table', () => {
    expect(schema.chunks).toBeDefined();
    expect(schema.chunks[Symbol.for('drizzle:Name')]).toBe('chunks');
  });

  it('exports users table', () => {
    expect(schema.users).toBeDefined();
    expect(schema.users[Symbol.for('drizzle:Name')]).toBe('users');
  });

  it('exports credentials table', () => {
    expect(schema.credentials).toBeDefined();
    expect(schema.credentials[Symbol.for('drizzle:Name')]).toBe('credentials');
  });

  it('exports mcpAuthCodes table', () => {
    expect(schema.mcpAuthCodes).toBeDefined();
    expect(schema.mcpAuthCodes[Symbol.for('drizzle:Name')]).toBe('mcp_auth_codes');
  });

  it('exports mcpRefreshTokens table', () => {
    expect(schema.mcpRefreshTokens).toBeDefined();
    expect(schema.mcpRefreshTokens[Symbol.for('drizzle:Name')]).toBe('mcp_refresh_tokens');
  });
});
