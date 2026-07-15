# Task 16 — `app.module` wiring, cleanup, and full verify

**Read first:** `../backend-redesign-v2.md` §4, §7 (target tree).
**Depends on:** all prior tasks. **Blocks:** none (final).

## Goal
Finish wiring, delete every dropped/relocated module, and confirm the whole api builds,
migrates, and passes tests — matching the §7 target tree.

## Requirements
- Update `apps/api/src/app.module.ts` imports to the final set:
  - **Imports:** `DatabaseModule`, `AuthModule`, `UsersModule`, `ProjectsModule`,
    `WorkspaceModule`, `InternalMcpModule`.
  - **Removed:** `ThoughtsModule`, `LabelsModule`, `ChunkingModule`, `EmbeddingModule`,
    `ColorsModule`, `McpEventsModule` (their functionality now lives under workspace/projects).
- Delete the now-dead directories if any remain: `apps/api/src/thoughts/`,
  `apps/api/src/labels/`, `apps/api/src/chunking/`, `apps/api/src/embedding/`,
  `apps/api/src/colors/`, `apps/api/src/mcp-events/`. Confirm nothing imports them.
- Grep for stale references: `is_root`, `parent_id`, `thought_labels`, `colors`,
  `ColorsService`, `McpEventsService`, the old `database/schema.ts` path — none should remain
  (outside the planning docs).
- Verify the §7 target tree matches reality (folder for folder).

## Verification (must all pass)
1. `npm run build` (from `apps/api`) — clean.
2. `npm run lint` — clean (or no new errors).
3. `npx drizzle-kit generate` produces **no** unexpected diff against the applied schema
   (schema and migrations are in sync).
4. Migrate a fresh DB and smoke-test the core flow: create user → create project →
   create thought (with color) → tag it → create an edge → semantic search → delete project
   (verify cascade leaves no orphan entities/relationships/chunks).
5. MCP tool tests (`apps/mcp`) pass against the running api.

## Acceptance criteria
- `app.module.ts` imports exactly the six modules above.
- All dropped modules/dirs are gone with no dangling references.
- All five verification steps pass.

## Out of scope
- Frontend (`apps/web`) updates; new MCP relationship tools.
