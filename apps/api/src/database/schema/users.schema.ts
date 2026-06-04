/**
 * users.schema.ts — users and credentials tables
 *
 * Ported verbatim from apps/api/src/database/schema.ts.
 * Replaces the minimal stub created in step 01-01.
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ── Tables ───────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const credentials = pgTable(
  'credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 50 }).notNull(),
    providerId: varchar('provider_id', { length: 255 }).notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [unique('uq_provider_provider_id').on(t.provider, t.providerId)],
);

// ── Relations ────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  credentials: many(credentials),
}));

export const credentialsRelations = relations(credentials, ({ one }) => ({
  user: one(users, { fields: [credentials.userId], references: [users.id] }),
}));
