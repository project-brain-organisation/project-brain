# Task 05 — Schema barrel, migrations, and DatabaseModule wiring

**Read first:** `../backend-redesign-v2.md` §2, §4 ("Schema location"), §8 step 1–2.
**Depends on:** 01–04. **Blocks:** all module tasks.

## Goal
Assemble the schema barrel, repoint Drizzle config + `DatabaseService` at it, delete the
old single-file schema, and regenerate migrations from scratch against a fresh database.

## Requirements

1. **Barrel** — create `apps/api/src/database/schema/index.ts` that re-exports every table
   and every `relations()` from the files made in tasks 01–04 (`entities`, `project_meta`,
   `thoughts`, `labels`, `relationships`, `chunks`, `users`, `credentials`, `mcp_auth_codes`,
   `mcp_refresh_tokens`). Drizzle's `drizzle(pool, { schema })` needs all of them exported
   from one place.

2. **Delete** the old `apps/api/src/database/schema.ts` (single file). Confirm nothing
   imports it except via the new barrel. `DatabaseService` imports `* as schema from
   './schema'` — with the new `schema/` folder + `index.ts`, that path now resolves to the
   barrel, so the import line should not need changing (verify).

3. **Drizzle config** — update `apps/api/drizzle.config.ts` `schema` from
   `'./src/database/schema.ts'` to `'./src/database/schema'` (the directory/barrel).

4. **Regenerate migrations from scratch** (no live data — destructive is fine):
   - Delete the contents of `apps/api/drizzle/migrations/` (old SQL + `meta/`).
   - Delete the now-obsolete ad-hoc runners in `apps/api/scripts/`
     (`run-migration-colors.js`, `run-migration-is-edge.js`, `run-migration-scoping.js`,
     `apply-migration-0005.mjs`). Keep `test-oauth-flow.mjs`.
   - Run `npx drizzle-kit generate` to produce a single fresh initial migration.
   - Ensure the generated SQL creates the `vector` and (if needed) enum types, and the
     pgvector extension. Add a `CREATE EXTENSION IF NOT EXISTS vector;` to the migration or
     a documented pre-step if drizzle-kit doesn't emit it.

5. **Apply** against a fresh/empty database (`npx drizzle-kit migrate` or `push`) and
   confirm it applies cleanly. Document the command in the task PR/commit message.

## Acceptance criteria
- `npm run build` succeeds from `apps/api`.
- A single fresh migration generates and applies to an empty DB without error.
- `DatabaseService` boots and exposes `db` typed with the full schema.
- No references remain to the deleted `schema.ts` or deleted script files.

## Out of scope
- Any module/service logic.
