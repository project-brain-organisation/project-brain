# Task 12 — Workspace: pipeline (chunking + embedding) relocation

**Read first:** `../backend-redesign-v2.md` §2.2 (chunks), §4 (pipeline).
**Depends on:** 09. **Blocks:** 15 (the `remember`/`elaborate` MCP paths).

## Goal
Relocate the existing chunking and embedding services into `workspace/pipeline/` and adapt
them to the new project-scoped `chunks` table (chunks now carry `project_id`, not `user_id`).

## Requirements
- Move `apps/api/src/chunking/` → `apps/api/src/workspace/pipeline/chunking.service.ts`
  and `apps/api/src/embedding/` → `apps/api/src/workspace/pipeline/embedding.service.ts`.
  Preserve the existing logic (text splitting, embedding calls); only change persistence.
- When chunks are (re)generated for a thought, write `project_id` = the thought's entity
  `project_id` (look it up / pass it in), and `thought_id` = the thought id. Drop all
  `user_id` writes/filters on chunks.
- Wire the pipeline into the thoughts flow: creating/updating a thought's body triggers
  re-chunking + re-embedding (match current behaviour — keep it async/background as it is now).
- Semantic search (`remember`) and `elaborate` read paths: update their queries to scope by
  `project_id` (and gate by ownership through the project) instead of `user_id`. These are
  consumed by the internal-mcp controller (task 15) — keep the service methods here and have
  task 15 call them.
- Register the pipeline providers in `WorkspaceModule`.

## Notes
- Remove the old top-level `ChunkingModule` / `EmbeddingModule` once nothing imports them
  (final cleanup is task 16, but you may remove here if the build stays green).
- Keep the `vector(768)` type usage identical to the schema definition (task 04).

## Acceptance criteria
- `npm run build` succeeds.
- Chunks are written with `project_id` and no `user_id`.
- Creating/editing a thought still produces chunks + embeddings.
- Semantic search returns results scoped to the owning project.

## Out of scope
- internal-mcp endpoint rewiring (task 15).
