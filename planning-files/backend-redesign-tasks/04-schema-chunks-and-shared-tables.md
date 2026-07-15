# Task 04 — Schema: `chunks` + shared tables; drop `colors`

**Read first:** `../backend-redesign-v2.md` §2.2 (chunks, KEEP tables, colors DROP).
**Depends on:** 01, 02. **Blocks:** 05.

## Goal
Define the project-scoped `chunks` table, port the kept auth/user tables into the new
schema directory unchanged, and drop the `colors` table.

## Requirements

`apps/api/src/database/schema/chunk.schema.ts` — table `chunks` (**REPLACE**):
- `id` uuid PK `defaultRandom()`
- `thought_id` uuid NOT NULL → `thoughts.id`, `onDelete: 'cascade'`
- `project_id` uuid NOT NULL → `entities.id`, `onDelete: 'cascade'`  *(NEW — scoping)*
- `body` text NOT NULL
- `chunk_index` integer NOT NULL
- `vector_embedding` — the existing custom `vector(768)` pgvector type (copy the
  `customType` definition from the current `src/database/schema.ts`)
- index on `thought_id`, on `project_id`
- **Drop** the old `user_id` column.

`apps/api/src/database/schema/users.schema.ts` — **KEEP** (port verbatim from current
`src/database/schema.ts`): `users`, `credentials`, plus their `relations()`. If task 01
left a minimal `users` stub here, flesh it out to the full definition now.

`apps/api/src/database/schema/mcp-tokens.schema.ts` — **KEEP** (port verbatim):
`mcp_auth_codes`, `mcp_refresh_tokens` with their indexes.

**Drop `colors`:** do not create a `colors` table or carry over the `colors` /
`thought_labels` tables. (`thought_labels` is replaced by `relationships` kind='tag';
`colors` is replaced by inline `thoughts.color`.)

## Acceptance criteria
- `chunks` has `project_id`, no `user_id`, and the working `vector(768)` type.
- `users`, `credentials`, `mcp_auth_codes`, `mcp_refresh_tokens` are present and unchanged
  in shape from the current schema.
- No `colors` or `thought_labels` table anywhere in `database/schema/`.

## Out of scope
- Barrel `index.ts` and migration generation (task 05).
