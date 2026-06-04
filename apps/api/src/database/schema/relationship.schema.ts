/**
 * relationship.schema.ts — unified edge table (discriminated by kind enum)
 *
 * Direction convention:
 * | kind      | source_id      | target_id      | meaning                                    |
 * |-----------|----------------|----------------|---------------------------------------------|
 * | hierarchy | child thought  | parent thought | child points at its parent                 |
 * | tag       | thought        | label          | thought is tagged with label               |
 * | edge      | node           | node           | canvas edge, drawn source→target; label_id types it |
 *
 * Per-kind invariants enforced by partial unique indexes at the DB layer:
 *   - A thought has at most one parent   → UNIQUE (source_id) WHERE kind='hierarchy'
 *   - A thought can't carry a label twice → UNIQUE (source_id, target_id) WHERE kind='tag'
 *   - No duplicate canvas edges          → UNIQUE (source_id, target_id, label_id) WHERE kind='edge'
 */

import {
  pgTable,
  pgEnum,
  uuid,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { entities } from './entities.schema';

export const relationshipKind = pgEnum('relationship_kind', [
  'hierarchy',
  'tag',
  'edge',
]);

export const relationships = pgTable(
  'relationships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    kind: relationshipKind('kind').notNull(),
    labelId: uuid('label_id').references(() => entities.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    // Four regular indexes
    index('idx_relationships_project_id').on(t.projectId),
    index('idx_relationships_source_kind').on(t.sourceId, t.kind),
    index('idx_relationships_target_kind').on(t.targetId, t.kind),
    index('idx_relationships_label_id').on(t.labelId),
    // Three partial unique constraints (per-kind invariants)
    uniqueIndex('uq_relationship_hierarchy_source')
      .on(t.sourceId)
      .where(sql`kind = 'hierarchy'`),
    uniqueIndex('uq_relationship_tag_source_target')
      .on(t.sourceId, t.targetId)
      .where(sql`kind = 'tag'`),
    uniqueIndex('uq_relationship_edge_source_target_label')
      .on(t.sourceId, t.targetId, t.labelId)
      .where(sql`kind = 'edge'`),
  ],
);
