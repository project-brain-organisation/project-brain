# DELIVER — Upstream Issues & Resolutions (row-level-security)

## UI-1 — Fire-and-forget pipeline writes vs. chunks RLS withCheck (RESOLVED)

**Discovered:** Phase 1 orchestrator review (2026-06-05), confirmed against live code
(`apps/api/src/workspace/thoughts/thoughts.service.ts`,
`apps/api/src/workspace/pipeline/pipeline.service.ts`).

**Contradiction in roadmap:**
- `ThoughtsService.create()` / `updateBody()` call `pipelineService.chunkAndEmbed()` /
  `rechunk()` **fire-and-forget** (`.catch()`, no `await`) — they run *after* the HTTP
  response, *outside* the request transaction.
- Roadmap step **02-02** states fire-and-forget pipeline work runs under **`asSystem`**
  (no `app.current_user_id` set).
- Roadmap step **03-02** adds an `owner_isolation` policy to `chunks` with
  `withCheck: owner_id = current_setting('app.current_user_id', true)::uuid`.
- Under `asSystem` as the non-owner `app_user`, `current_setting('app.current_user_id', true)`
  returns NULL → the `chunks` INSERT/UPDATE is **rejected by RLS**.
- Because `chunkAndEmbed` failures are swallowed by `.catch()` → a `logger.warn`, this would
  fail **silently**: chunks never persist, semantic search returns nothing. The 03-03
  cross-tenant integration test (which only exercises `asUser`) would NOT catch it.
- Roadmap step **01-02** separately says chunks are stamped "within the existing transaction"
  (implying the request's `asUser` context), which itself contradicts 02-02's fire-and-forget
  `asSystem` framing.

**Resolution (user decision, 2026-06-05): Run pipeline under `asUser(resolvedOwnerId)`.**
- `chunkAndEmbed()` / `rechunk()` resolve the owning project's `owner_id` (already required to
  stamp `chunks.owner_id`) and wrap their DB writes in `DatabaseService.asUser(ownerId, cb)`.
- RLS stays **fully enforced** for background jobs (defense-in-depth, no owner-role bypass).
- `app.current_user_id` is set to the project owner, so the `chunks` `owner_isolation`
  withCheck passes and the stamped `owner_id` matches the tenant context.
- `asSystem` is retained per 02-02 for genuinely tenant-less operations that do NOT write
  RLS-protected tables (e.g. gateway event broadcasts). It must NOT be used for chunk writes.

**Affected steps:** 02-02 (define asUser/asSystem + wire pipeline under asUser-of-owner),
01-02 (owner_id stamping done by the pipeline within an `asUser(owner)` transaction),
04-01 (pipeline ownership-check slimming must preserve the owner-resolution needed for asUser).

**Back-propagation note:** roadmap 02-02 wording ("fire-and-forget pipeline … runs under
asSystem") is superseded by this resolution for the chunk-write path. Crafters receive this
correction via DESIGN_CONTEXT.
