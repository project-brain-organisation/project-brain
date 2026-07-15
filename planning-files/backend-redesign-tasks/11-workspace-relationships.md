# Task 11 — Workspace: relationships service + controller

**Read first:** `../backend-redesign-v2.md` §2.2 (relationships + direction conventions +
per-kind invariants), §2.3 (cross-project edge invariant).
**Depends on:** 09, 10. **Blocks:** 13, 15.

## Goal
Implement the service over the unified `relationships` table covering all three kinds:
`hierarchy` (feed tree), `tag` (thought↔label), and `edge` (canvas connections). This is
where the kind-specific, stateful validation lives (entity-type lookups can't be done in Zod).

## Requirements
Create `apps/api/src/workspace/relationships/` (`relationships.service.ts`,
`relationships.controller.ts`).

**Common rules for every write:**
- `assertOwnership(userId, projectId)` first.
- **Cross-project invariant (§2.3):** load `source`, `target` (and `label_id` if present)
  entities and assert their `project_id` all equal the request `projectId`. Reject otherwise.
- `source_id !== target_id` (reject self-loops for `hierarchy`/`edge`).

**Per-kind endpoint-type rules (service-layer, not DB):**
- `hierarchy`: source and target must both be `type='thought'`. Relies on the DB partial
  unique `(source_id) WHERE kind='hierarchy'` to keep one parent per thought; surface a
  clean error on conflict.
- `tag`: source must be `thought`, target must be `label`.
- `edge`: source/target are nodes; `label_id`, if given, must reference a `label` in the
  same project.

**Methods (suggested):**
- `setParent(userId, projectId, childId, parentId)` / `clearParent(...)` (hierarchy)
- `addTag(userId, projectId, thoughtId, labelId)` / `removeTag(...)` (tag)
- `createEdge(userId, projectId, sourceId, targetId, labelId?)` / `removeEdge(...)` (edge)
- `listByProject(userId, projectId, kind?)` and helpers like `childrenOf`, `tagsOf`,
  `edgesOf` for the read paths the web app + internal-mcp need.
- For deep feed traversal, provide a recursive-CTE query (`WITH RECURSIVE`) over
  `kind='hierarchy'` rows.

- Controller guarded by `JwtAuthGuard`; ownership-gated. Mark TODO emit hooks for task 14.

## Acceptance criteria
- `npm run build` succeeds.
- Each kind enforces its endpoint-type rule and the cross-project invariant.
- Duplicate tag / duplicate edge / second parent are rejected (DB unique + clean error).
- A recursive children/descendants query exists for the feed.

## Out of scope
- Zod schemas (13), real-time emit (14), MCP wiring (15).
