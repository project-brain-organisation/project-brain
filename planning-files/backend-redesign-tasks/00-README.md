# Backend Redesign — Task Breakdown

These files are **standalone prompts for coding agents**. Each implements one small slice
of the redesign described in [`../backend-redesign-v2.md`](../backend-redesign-v2.md).
Every agent should read that plan first — it is the source of truth; these files only scope
the work and define acceptance criteria.

## Ground rules for every task

- Target app: `apps/api` (NestJS 11, Drizzle ORM, Neon Postgres). Run commands from `apps/api`.
- **There is no live data and no users.** Destructive schema changes are fine; do not write
  data migrations. We regenerate Drizzle migrations from scratch (task 05).
- Match existing code style (see neighbouring files). Don't introduce new libraries without
  a reason stated in the PR/commit.
- After your change, the api must still build: `npm run build` (from `apps/api`).
- Keep each task's scope tight. If you discover work that belongs to another task, note it,
  don't do it.

## Schema lives in `database/schema/`

All Drizzle table definitions live under `apps/api/src/database/schema/` (a folder of
per-table files + an `index.ts` barrel) that **replaces** today's single
`src/database/schema.ts`. The global `DatabaseModule` owns it; every other module imports
tables from the barrel. (Rationale: shared tables like `users` aren't workspace-owned, and
Drizzle needs one unified schema graph.)

## Execution order & dependencies

Do them roughly in number order; explicit deps are listed in each file.

| # | Task | Depends on |
|---|------|-----------|
| 01 | Schema: `entities` + `project_meta` | — |
| 02 | Schema: `thoughts` + `labels` subtypes | 01 |
| 03 | Schema: `relationships` (unified edge table) | 01, 02 |
| 04 | Schema: `chunks` + shared tables (users/credentials/mcp-tokens), drop `colors` | 01, 02 |
| 05 | Schema barrel + regenerate migrations + wire `DatabaseModule`/`drizzle.config` | 01–04 |
| 06 | `UsersModule` (profile CRUD) | 05 |
| 07 | `ProjectsModule` (`project_meta` CRUD + create-project transaction) | 05, 06 |
| 08 | `WorkspaceModule` scaffold | 05 |
| 09 | Workspace: thoughts service/controller | 07, 08 |
| 10 | Workspace: labels service/controller | 08 |
| 11 | Workspace: relationships service/controller | 09, 10 |
| 12 | Workspace: pipeline (chunking + embedding) relocation | 09 |
| 13 | Validation: drizzle-zod + `ZodValidationPipe`; remove class-validator DTOs | 09, 10, 11 |
| 14 | Workspace gateway (real-time); remove `mcp-events` | 09, 10, 11 |
| 15 | Rewire `internal-mcp` controllers to new services | 09–12, 14 |
| 16 | `app.module` wiring + cleanup + full build/test verify | all |

## What is NOT in this breakdown

- The `apps/mcp` sidecar is unchanged (it already matches the target). New
  `create_relationship` / `list_relationships` MCP tools are a later, optional follow-up.
- The `apps/web` frontend is out of scope, except where a task flags a contract change the
  web app will later need to follow (e.g. color now inline on thoughts; tags/edges via the
  relationships endpoint).
