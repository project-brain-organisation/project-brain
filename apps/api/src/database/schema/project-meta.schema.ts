/**
 * project-meta.schema.ts — project subtype (Table-per-Type)
 *
 * id is simultaneously the PK and a FK to entities.id (TPT pattern).
 * Creating a project requires a two-step transaction:
 *   1. INSERT into entities (type = 'project')
 *   2. INSERT into project_meta with the same id
 */
import { pgTable, uuid, varchar, boolean, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { entities } from './entities.schema';
import { users } from './users.schema';

export const projectMeta = pgTable(
  'project_meta',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => entities.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    emoji: varchar('emoji', { length: 16 }),
    isPublic: boolean('is_public').notNull().default(false),
  },
  (t) => [index('idx_project_meta_owner_id').on(t.ownerId)],
);

export const projectMetaRelations = relations(projectMeta, ({ one }) => ({
  entity: one(entities, {
    fields: [projectMeta.id],
    references: [entities.id],
  }),
}));

export const entitiesRelations = relations(entities, ({ one }) => ({
  projectMeta: one(projectMeta, {
    fields: [entities.id],
    references: [projectMeta.id],
  }),
}));
