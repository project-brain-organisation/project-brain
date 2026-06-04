/**
 * entities.schema.ts — global node registry (supertype)
 *
 * The entities table is the root of the Table-per-Type hierarchy.
 * Every node (project, thought, label) has a corresponding row here.
 * project_id is a self-referential FK allowing nodes to be scoped
 * to a project entity.
 */
import { pgTable, uuid, timestamp, index, pgEnum } from 'drizzle-orm/pg-core';

export const entityType = pgEnum('entity_type', ['project', 'thought', 'label']);

export const entities = pgTable(
  'entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references((): any => entities.id, { onDelete: 'cascade' }),
    type: entityType('type').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('idx_entities_project_id').on(t.projectId)],
);
