# Task 01 — Schema: `entities` + `project_meta`

**Read first:** `../backend-redesign-v2.md` §2 (data model), §2.4 (create-project flow).
**Depends on:** none. **Blocks:** everything.

## Goal
Create the Entity Supertype base table and the project subtype, as the first two files of
the new `apps/api/src/database/schema/` directory.

## Requirements
Create `apps/api/src/database/schema/entities.schema.ts`:
- Table `entities`:
  - `id` uuid PK, `defaultRandom()`
  - `project_id` uuid **NOT NULL**, self-FK → `entities.id`, `onDelete: 'cascade'`
    (use Drizzle's self-reference pattern, e.g. `references((): any => entities.id, …)`)
  - `type` — a pg enum `entity_type` with values `('project','thought','label')`, NOT NULL
  - `created_at`, `updated_at` timestamps, `defaultNow().notNull()`
  - index on `project_id`
- Export the `entityType` pgEnum so other files/validators can reuse it.

Create `apps/api/src/database/schema/project-meta.schema.ts`:
- Table `project_meta`:
  - `id` uuid PK → `entities.id`, `onDelete: 'cascade'` (PK *is* the FK — Table-per-Type)
  - `owner_id` uuid NOT NULL → `users.id`, `onDelete: 'cascade'`
    *(import the `users` table; it will be defined in task 04 — if it does not exist yet,
    add a minimal `users` stub in `users.schema.ts` with just `id`, to be fleshed out in 04)*
  - `name` varchar(255) NOT NULL
  - `emoji` varchar(16) null
  - `is_public` boolean NOT NULL default false
  - index on `owner_id`
- Add Drizzle `relations()` for `project_meta` ↔ `entities` (one-to-one on id).

## Notes
- Do **not** create the barrel `index.ts` yet (task 05 assembles it). It's fine to import
  across these two files directly for now.
- Don't worry about migrations yet (task 05).

## Acceptance criteria
- Both files compile (`npm run build` from `apps/api` — barrel may not exist yet, so a
  temporary direct import is acceptable; flag if build needs the barrel).
- `entities` has a working self-referential `project_id` FK with cascade.
- `project_meta.id` is simultaneously PK and FK to `entities.id`.

## Out of scope
- thoughts/labels/relationships/chunks tables (tasks 02–04), barrel + migrations (05).
