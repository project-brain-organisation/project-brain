# Task 15 — Rewire `internal-mcp` controllers to the new services

**Read first:** `../backend-redesign-v2.md` §4 (InternalMcpModule), §6 (sidecar unchanged).
**Depends on:** 09, 10, 11, 12, 14. **Blocks:** 16.

## Goal
Keep the `/api/internal/mcp/*` HTTP contract that the `apps/mcp` sidecar calls, but point
every handler at the new projects/workspace services. The sidecar and its `api-client.ts`
do **not** change.

## Requirements
Rewire `apps/api/src/internal-mcp/internal-mcp.controller.ts` (keep the `McpInternalGuard`
and `x-mcp-user-id` header handling):
- `list-projects` / `create-project` → `ProjectsService` (no more "root thought"; projects
  are `type='project'` entities). `create-project` now needs to create the entity+meta txn.
- `create-thought` / `edit-thought` / `remove-thought` / `thought/:id` / `list-thoughts`
  → workspace `ThoughtsService`. `list-thoughts` filtering by project uses `project_id`.
- `list-labels` / `create-label` / `update-label` / `remove-label` / `set-label-edge`
  → workspace `LabelsService`.
- `add-label-to-thought` / `remove-label-from-thought` / `thought-labels/:id`
  → relationships service as **`kind='tag'`** operations (no `thought_labels`).
- `set-thought-color` / `clear-thought-color` → `ThoughtsService` (inline color; the old
  `ColorsService` is gone).
- `remember` / `elaborate` / `thought-to-prompt` → pipeline + workspace read paths
  (project-scoped, ownership-gated). `thought-to-prompt` assembles parent/children via the
  relationships hierarchy queries (task 11) and tags via `kind='tag'`.
- **Remove the `emit(...)` calls** — the workspace services now publish events (task 14).
  Where the MCP path needs `source='mcp'`, ensure the service emit reflects that (e.g. pass
  a source flag through, or set it in the service based on call context).
- Apply the shared drizzle-zod schemas (task 13) to validate incoming payloads so MCP and UI
  obey identical rules.

## Tests
- The sidecar has tool tests under `apps/mcp/src/tools/*.test.ts`. After rewiring, run the
  MCP tool flow and confirm create/list/edit/remove for projects, thoughts, labels, tagging,
  color, and `remember` still succeed end-to-end against the rewired endpoints.

## Acceptance criteria
- `npm run build` succeeds; `apps/mcp` is untouched.
- Every `/api/internal/mcp/*` endpoint delegates to a new service; none reference removed
  modules (`ColorsService`, `thought_labels`, root-thought projects, `McpEventsService`).
- MCP tool tests pass.

## Out of scope
- Final app wiring/cleanup (task 16); new relationship MCP tools (later follow-up).
