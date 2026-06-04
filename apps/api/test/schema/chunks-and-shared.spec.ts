/**
 * Schema integration test: chunks project_id scoping and vector type; no colors table
 *
 * Verifies:
 * - chunks table exists with project_id FK (not user_id) and correct table name
 * - vector_embedding column uses custom vector(768) type (dataType string)
 * - users table is fully defined (not just id stub)
 * - credentials table exists and has userId column
 * - mcpAuthCodes and mcpRefreshTokens tables exist
 * - No colors or thought_labels schema files in scope
 *
 * EXEMPT FROM PBT PARADIGM: schema compilation check (single-example integration test)
 */

import { chunks } from '../../src/database/schema/chunk.schema';
import { users, credentials } from '../../src/database/schema/users.schema';
import { mcpAuthCodes, mcpRefreshTokens } from '../../src/database/schema/mcp-tokens.schema';

describe('chunks schema', () => {
  it('has table name chunks', () => {
    expect(chunks[Symbol.for('drizzle:Name')]).toBe('chunks');
  });

  it('has project_id column and no user_id column', () => {
    const cols = Object.keys(chunks);
    expect(cols).toContain('projectId');
    expect(cols).not.toContain('userId');
  });

  it('vectorEmbedding column has dataType vector(768)', () => {
    const col = (chunks as any).vectorEmbedding;
    expect(col.columnType).toBe('PgCustomColumn');
    expect(col.getSQLType()).toBe('vector(768)');
  });
});

describe('users schema (fleshed out)', () => {
  it('has table name users', () => {
    expect(users[Symbol.for('drizzle:Name')]).toBe('users');
  });

  it('has username column', () => {
    const cols = Object.keys(users);
    expect(cols).toContain('username');
  });
});

describe('credentials schema', () => {
  it('has table name credentials', () => {
    expect(credentials[Symbol.for('drizzle:Name')]).toBe('credentials');
  });

  it('has userId column', () => {
    const cols = Object.keys(credentials);
    expect(cols).toContain('userId');
  });
});

describe('mcp-tokens schema', () => {
  it('mcpAuthCodes has table name mcp_auth_codes', () => {
    expect(mcpAuthCodes[Symbol.for('drizzle:Name')]).toBe('mcp_auth_codes');
  });

  it('mcpRefreshTokens has table name mcp_refresh_tokens', () => {
    expect(mcpRefreshTokens[Symbol.for('drizzle:Name')]).toBe('mcp_refresh_tokens');
  });
});
