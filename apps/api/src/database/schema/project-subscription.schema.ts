/**
 * project-subscription.schema.ts — "public graphs I added to my sidebar"
 *
 * A row means user_id follows the public project project_id. Content access
 * is NOT granted by this table — the *_public_read RLS policies on the
 * content tables key off project_meta.is_public alone, so a re-privatised
 * project instantly disappears for subscribers even if their row lingers.
 */
import { pgTable, uuid, timestamp, index, primaryKey, pgPolicy } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { entities } from './entities.schema';
import { users } from './users.schema';
import { appUser } from './app-user-role.schema';

export const projectSubscriptions = pgTable(
  'project_subscriptions',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.projectId] }),
    index('idx_project_subscriptions_project_id').on(t.projectId),
    pgPolicy('project_subscriptions_user_isolation', {
      as: 'permissive',
      for: 'all',
      to: appUser,
      using: sql`${t.userId} = current_setting('app.current_user_id', true)::uuid`,
      withCheck: sql`${t.userId} = current_setting('app.current_user_id', true)::uuid`,
    }),
  ],
).enableRLS();
