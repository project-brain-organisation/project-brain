/**
 * thought.schema.ts — thought subtype (Table-per-Type)
 *
 * id is simultaneously the PK and a FK to entities.id (TPT pattern).
 * Creating a thought requires a two-step transaction:
 *   1. INSERT into entities (type = 'thought')
 *   2. INSERT into thoughts with the same id
 *
 * Stripped vs legacy schema.ts:
 *   - No user_id (ownership flows through entities → project_meta → owner)
 *   - No project_id (scoping flows through entities.projectId)
 *   - No parent_id (hierarchy lives in the relationships table, step 01-03)
 *   - No colorId FK (color is inline varchar(7))
 *   - No is_root (topology handled by relationships table)
 */
import { pgTable, uuid, varchar, text, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { entities } from './entities.schema';

export const thoughts = pgTable('thoughts', {
  id: uuid('id')
    .primaryKey()
    .references(() => entities.id, { onDelete: 'cascade' }),
  color: varchar('color', { length: 7 }),
  body: text('body').notNull().default(''),
  title: varchar('title', { length: 255 }).notNull().default(''),
  contentHash: varchar('content_hash', { length: 64 }),
  canvasX: integer('canvas_x'),
  canvasY: integer('canvas_y'),
  width: integer('width'),
  height: integer('height'),
});

export const thoughtsRelations = relations(thoughts, ({ one }) => ({
  entity: one(entities, {
    fields: [thoughts.id],
    references: [entities.id],
  }),
}));
