/**
 * label.schema.ts — label subtype (Table-per-Type)
 *
 * id is simultaneously the PK and a FK to entities.id (TPT pattern).
 * Creating a label requires a two-step transaction:
 *   1. INSERT into entities (type = 'label')
 *   2. INSERT into labels with the same id
 *
 * project_id is a denormalized immutable copy of the entity's project scope,
 * carried directly on the row for efficient project-scoped queries without joins.
 * It mirrors the pattern used by chunk.schema.ts and relationship.schema.ts.
 *
 * Stripped vs legacy schema.ts:
 *   - No user_id (ownership flows through entities → project_meta → owner)
 *   - color is inline varchar(7) with a default (no FK to a colors table)
 */
import { pgTable, uuid, varchar, boolean, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { entities } from './entities.schema';

export const labels = pgTable(
  'labels',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => entities.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    color: varchar('color', { length: 7 }).notNull().default('#999999'),
    isEdge: boolean('is_edge').notNull().default(false),
  },
  (t) => [
    index('idx_labels_project_id').on(t.projectId),
  ],
);

export const labelsRelations = relations(labels, ({ one }) => ({
  entity: one(entities, {
    fields: [labels.id],
    references: [entities.id],
  }),
}));
