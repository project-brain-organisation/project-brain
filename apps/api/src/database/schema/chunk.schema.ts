/**
 * chunk.schema.ts — text chunks with vector embeddings (project-scoped)
 *
 * Key changes from legacy schema.ts chunks table:
 *   - project_id replaces user_id (chunks are project-scoped, not user-scoped)
 *   - project_id FK → entities.id (cascade)
 *   - vector(768) customType preserved verbatim from legacy schema.ts
 *
 * owner_id is a denormalized immutable copy of the project's owner (mirrors
 * projectMeta.ownerId), carried locally on the row so RLS can enforce ownership
 * without joining project_meta.
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  customType,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { entities } from './entities.schema';
import { thoughts } from './thought.schema';
import { users } from './users.schema';
import { appUser } from './app-user-role.schema';

// ── Custom pgvector type ─────────────────────────────────────────
const vector = customType<{ data: number[] }>({
  dataType() {
    return 'vector(768)';
  },
  toDriver(value: number[]) {
    return JSON.stringify(value);
  },
  fromDriver(value: unknown) {
    return value as number[];
  },
});

// ── Table ────────────────────────────────────────────────────────

export const chunks = pgTable(
  'chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    thoughtId: uuid('thought_id')
      .notNull()
      .references(() => thoughts.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    vectorEmbedding: vector('vector_embedding'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_chunks_thought_id').on(t.thoughtId),
    index('idx_chunks_project_id').on(t.projectId),
    index('idx_chunks_owner_id').on(t.ownerId),
    pgPolicy('chunks_owner_isolation', {
      as: 'permissive',
      for: 'all',
      to: appUser,
      using: sql`${t.ownerId} = current_setting('app.current_user_id', true)::uuid`,
      withCheck: sql`${t.ownerId} = current_setting('app.current_user_id', true)::uuid`,
    }),
  ],
).enableRLS();

// ── Relations ────────────────────────────────────────────────────

export const chunksRelations = relations(chunks, ({ one }) => ({
  thought: one(thoughts, {
    fields: [chunks.thoughtId],
    references: [thoughts.id],
  }),
  project: one(entities, {
    fields: [chunks.projectId],
    references: [entities.id],
  }),
}));
