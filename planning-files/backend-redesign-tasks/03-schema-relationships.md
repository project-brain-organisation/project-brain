# Task 03 — Schema: `relationships` (unified edge table)

**Read first:** `../backend-redesign-v2.md` §2.2 (the `relationships` block + direction
conventions table + per-kind invariants).
**Depends on:** 01, 02. **Blocks:** 11.

## Goal
Define the single edge table that governs **every** relationship between entities:
the feed hierarchy, label tagging, and canvas edges — discriminated by a `kind` column.

## Requirements
Create `apps/api/src/database/schema/relationship.schema.ts` — table `relationships`:
- `id` uuid PK `defaultRandom()`
- `project_id` uuid NOT NULL → `entities.id`, `onDelete: 'cascade'`
- `source_id` uuid NOT NULL → `entities.id`, `onDelete: 'cascade'`
- `target_id` uuid NOT NULL → `entities.id`, `onDelete: 'cascade'`
- `kind` — pg enum `relationship_kind` with values `('hierarchy','tag','edge')`, NOT NULL
- `label_id` uuid null → `entities.id`, `onDelete: 'set null'`  *(typed-edge attribute;
  only meaningful when `kind='edge'`)*
- `created_at`, `updated_at` timestamps NOT NULL

**Indexes & partial unique constraints** (these enforce the per-kind invariants — do not skip):
- index on `project_id`, on `(source_id, kind)`, on `(target_id, kind)`, on `label_id`
- partial unique: `UNIQUE (source_id) WHERE kind = 'hierarchy'`  (one parent per thought)
- partial unique: `UNIQUE (source_id, target_id) WHERE kind = 'tag'`  (no duplicate tags)
- partial unique: `UNIQUE (source_id, target_id, label_id) WHERE kind = 'edge'`  (no dup edges)

Use Drizzle's partial-index support (`.where(sql\`...\`)` on `uniqueIndex(...)`).

Export the `relationshipKind` pgEnum for reuse by validators/services.

## Direction conventions (document in a comment in the file)
| kind | source_id | target_id |
|------|-----------|-----------|
| hierarchy | child thought | parent thought |
| tag | thought | label |
| edge | node | node (`label_id` optionally types it) |

## Notes
- `relationships` connects **entities only**. `chunks` are not entities and never appear here.
- Endpoint-*type* validation (e.g. a `tag` target must be a label) is **service-layer**
  work (task 11), not a DB constraint. This task only defines the table + structural
  uniqueness.

## Acceptance criteria
- File compiles with tasks 01–02.
- All three partial unique indexes exist and are kind-scoped.
- `kind` is a NOT NULL enum; `label_id` is nullable.

## Out of scope
- The relationships service/controller and its validation (task 11).
