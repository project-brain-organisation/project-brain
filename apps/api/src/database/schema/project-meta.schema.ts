/**
 * project-meta.schema.ts — project subtype (Table-per-Type)
 *
 * id is simultaneously the PK and a FK to entities.id (TPT pattern).
 * Creating a project requires a two-step transaction:
 *   1. INSERT into entities (type = 'project')
 *   2. INSERT into project_meta with the same id
 */
import { pgTable, uuid, varchar, boolean, index, pgPolicy } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { entities } from './entities.schema';
import { users } from './users.schema';
import { appUser } from './app-user-role.schema';

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
    // Root-node color in the graph; inline varchar(7) hex like thoughts.color
    color: varchar('color', { length: 7 }),
    isPublic: boolean('is_public').notNull().default(false),
  },
  (t) => [
    index('idx_project_meta_owner_id').on(t.ownerId),
    pgPolicy('project_meta_owner_isolation', {
      as: 'permissive',
      for: 'all',
      to: appUser,
      using: sql`${t.ownerId} = current_setting('app.current_user_id', true)::uuid`,
      withCheck: sql`${t.ownerId} = current_setting('app.current_user_id', true)::uuid`,
    }),
    pgPolicy('project_meta_public_read', {
      as: 'permissive',
      for: 'select',
      to: appUser,
      using: sql`${t.isPublic} = true`,
    }),
  ],
).enableRLS();

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
