/**
 * thought.schema.ts — thought subtype (Table-per-Type)
 *
 * id is simultaneously the PK and a FK to entities.id (TPT pattern).
 * Creating a thought requires a two-step transaction:
 *   1. INSERT into entities (type = 'thought')
 *   2. INSERT into thoughts with the same id
 *
 * project_id is a denormalized immutable copy of the entity's project scope,
 * carried directly on the row for efficient project-scoped queries without joins.
 * It mirrors the pattern used by chunk.schema.ts and relationship.schema.ts.
 *
 * owner_id is a denormalized immutable copy of the project's owner (mirrors
 * projectMeta.ownerId), carried locally on the row so RLS can enforce ownership
 * without joining project_meta.
 *
 * FK SEMANTIC RESTRICTION: project_id references entities.id at the database level,
 * which technically allows any entity type as a value. Semantically, project_id MUST
 * refer to a project-type entity only. This is the SOLE remaining app-layer
 * ownership-adjacent check: ProjectsService.assertOwnership() is still called on
 * create() paths to validate the project-type FK invariant (it queries project_meta,
 * a project-type-only table, and throws ForbiddenException for non-project ids).
 * Owner isolation for all read/update/delete paths is now enforced entirely by RLS
 * (thoughts_owner_isolation policy above). A CHECK constraint with a correlated
 * subquery was considered but deferred due to performance implications.
 *
 * Stripped vs legacy schema.ts:
 *   - No user_id (ownership flows through entities → project_meta → owner)
 *   - No parent_id (hierarchy lives in the relationships table, step 01-03)
 *   - No colorId FK (color is inline varchar(7))
 *   - No is_root (topology handled by relationships table)
 */
import { pgTable, uuid, varchar, text, integer, index, pgPolicy } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { entities } from './entities.schema';
import { users } from './users.schema';
import { appUser } from './app-user-role.schema';

export const thoughts = pgTable(
  'thoughts',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => entities.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    color: varchar('color', { length: 7 }),
    body: text('body').notNull().default(''),
    title: varchar('title', { length: 255 }).notNull().default(''),
    contentHash: varchar('content_hash', { length: 64 }),
    canvasX: integer('canvas_x'),
    canvasY: integer('canvas_y'),
    width: integer('width'),
    height: integer('height'),
  },
  (t) => [
    index('idx_thoughts_project_id').on(t.projectId),
    index('idx_thoughts_owner_id').on(t.ownerId),
    pgPolicy('thoughts_owner_isolation', {
      as: 'permissive',
      for: 'all',
      to: appUser,
      using: sql`${t.ownerId} = current_setting('app.current_user_id', true)::uuid`,
      withCheck: sql`${t.ownerId} = current_setting('app.current_user_id', true)::uuid`,
    }),
  ],
).enableRLS();

export const thoughtsRelations = relations(thoughts, ({ one }) => ({
  entity: one(entities, {
    fields: [thoughts.id],
    references: [entities.id],
  }),
}));
