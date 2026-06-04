/**
 * mcp-tokens.schema.ts — MCP OAuth auth codes and refresh tokens
 *
 * Ported verbatim from apps/api/src/database/schema.ts.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';

// ── Tables ───────────────────────────────────────────────────────

export const mcpAuthCodes = pgTable(
  'mcp_auth_codes',
  {
    code: varchar('code', { length: 64 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: varchar('client_id', { length: 255 }).notNull(),
    codeChallenge: varchar('code_challenge', { length: 128 }),
    codeChallengeMethod: varchar('code_challenge_method', { length: 10 }).default(
      'S256',
    ),
    redirectUri: text('redirect_uri').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    used: boolean('used').notNull().default(false),
    consumedAt: timestamp('consumed_at'),
  },
  (t) => [
    index('idx_mcp_auth_codes_expires_at').on(t.expiresAt),
    index('idx_mcp_auth_codes_user_client').on(t.userId, t.clientId),
  ],
);

export const mcpRefreshTokens = pgTable(
  'mcp_refresh_tokens',
  {
    token: varchar('token', { length: 64 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: varchar('client_id', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    revoked: boolean('revoked').notNull().default(false),
    rotatedFrom: varchar('rotated_from', { length: 64 }),
  },
  (t) => [
    index('idx_mcp_refresh_tokens_expires_at').on(t.expiresAt),
    index('idx_mcp_refresh_tokens_user_client').on(t.userId, t.clientId),
  ],
);
