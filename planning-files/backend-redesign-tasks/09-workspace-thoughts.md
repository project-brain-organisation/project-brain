# Task 09 — Workspace: thoughts service + controller

**Read first:** `../backend-redesign-v2.md` §2.2 (thoughts), §2.3 (scoping), §2.4 (subtype
create txn).
**Depends on:** 07, 08. **Blocks:** 11, 12, 13, 15.

## Goal
Reimplement thought CRUD against the new subtype schema. A thought is an `entities` row
(`type='thought'`) + a `thoughts` row, created together in a transaction and scoped to a
project the caller owns.

## Requirements
Create `apps/api/src/workspace/thoughts/` (`thoughts.service.ts`, `thoughts.controller.ts`).
Port relevant logic from the current `apps/api/src/thoughts/` but adapt to the new model:

- **Create:** input `{ projectId, body, title?, color? }` (+ optional initial parent —
  but the parent link is a `relationships` row, created via task 11's service, not a column).
  1. `assertOwnership(userId, projectId)` (from `ProjectsModule`).
  2. In a transaction: `INSERT entities (id=X, project_id=projectId, type='thought')` then
     `INSERT thoughts (id=X, body, title, color)`.
- **Read:** `findOne(userId, id)` (gate via the entity's `project_id` → ownership),
  `findByProject(userId, projectId)` returning the project's thoughts. Reads filter by
  `entities.project_id`.
- **Update:** body/title/canvas geometry (`canvas_x/y`, `width`, `height`)/`color`.
- **Color set/clear** (absorbs the dropped ColorsModule): setting color is just
  `UPDATE thoughts SET color = … WHERE id = …`; clearing sets it null. No `colors` table,
  no FK.
- **Delete:** delete the `entities` row (cascade removes the subtype row, its chunks, and
  any relationships referencing it).
- Controller guarded by `JwtAuthGuard`; `userId` from `req.user`; every mutation calls the
  ownership gate.

## Notes
- Do **not** reintroduce `parent_id`. Hierarchy is a `kind='hierarchy'` relationship (task 11).
- Leave input validation as light DTOs/inline for now; task 13 swaps in drizzle-zod.
- Emit of real-time events is added in task 14 — leave a clearly marked hook/TODO where a
  mutation would publish, so task 14 can slot in.

## Acceptance criteria
- `npm run build` succeeds.
- Creating a thought writes paired `entities` + `thoughts` rows in one transaction.
- All reads/writes are project-scoped and ownership-gated.
- Color is read/written inline on the thought.

## Out of scope
- Hierarchy/tag/edge relationships (11), chunk pipeline (12), zod validation (13), gateway (14).
