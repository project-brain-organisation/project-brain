# Task 08 — `WorkspaceModule` scaffold

**Read first:** `../backend-redesign-v2.md` §4 (WorkspaceModule internals + rationale).
**Depends on:** 05. **Blocks:** 09–14.

## Goal
Create the empty `WorkspaceModule` umbrella and its sub-folders so the domain services
(tasks 09–14) drop into a known structure. No business logic yet — just the module shell
and wiring.

## Requirements
Create `apps/api/src/workspace/`:
- `workspace.module.ts` — a NestJS module that:
  - imports `DatabaseModule` (global, but be explicit if the codebase is) and `ProjectsModule`
    (for the ownership gate / `assertOwnership`).
  - will register providers/controllers for thoughts, labels, relationships, pipeline,
    gateway as those tasks land. For now it can be near-empty with TODO markers.
- Create empty sub-folders (with a `.gitkeep` or a stub file) so later tasks have a home:
  - `thoughts/`, `labels/`, `relationships/`, `pipeline/`, `gateway/`, `validation/`
- Register `WorkspaceModule` in `app.module.ts` imports (the old `ThoughtsModule`,
  `LabelsModule`, `ChunkingModule`, `EmbeddingModule`, `ColorsModule`, `McpEventsModule`
  will be removed in their respective tasks — leave them for now if removing them breaks the
  build; note the intended end state).

## Rationale (from the plan)
thoughts ⇄ labels ⇄ relationships ⇄ chunks reference each other constantly; bundling them
as internal sub-services of one module avoids cross-module circular-import friction while
staying decoupled at the real seams (auth, projects, users, database).

## Acceptance criteria
- `npm run build` succeeds with `WorkspaceModule` registered.
- The six sub-folders exist.
- No domain logic added yet.

## Out of scope
- All services/controllers (subsequent tasks).
