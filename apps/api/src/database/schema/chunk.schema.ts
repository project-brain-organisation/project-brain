/**
 * chunk.schema.ts — text chunks with vector embeddings (project-scoped)
 *
 * Key changes from legacy schema.ts chunks table:
 *   - project_id replaces user_id (chunks are project-scoped, not user-scoped)
 *   - project_id FK → entities.id (cascade)
 *   - vector(768) customType preserved verbatim from legacy schema.ts
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  customType,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { entities } from './entities.schema';
import { thoughts } from './thought.schema';

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
    body: text('body').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    vectorEmbedding: vector('vector_embedding'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_chunks_thought_id').on(t.thoughtId),
    index('idx_chunks_project_id').on(t.projectId),
  ],
);

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
