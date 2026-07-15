# Task 10 — Workspace: labels service + controller

**Read first:** `../backend-redesign-v2.md` §2.2 (labels), §2.3.
**Depends on:** 08. **Blocks:** 11, 13, 15.

## Goal
Reimplement label CRUD against the new subtype schema, relocated under `workspace`. A label
is an `entities` row (`type='label'`) + a `labels` row.

## Requirements
Create `apps/api/src/workspace/labels/` (`labels.service.ts`, `labels.controller.ts`).
Port from the current `apps/api/src/labels/` but adapt:

- **Create:** input `{ projectId, name, color?, isEdge? }`.
  1. `assertOwnership(userId, projectId)`.
  2. Transaction: `INSERT entities (id=X, project_id=projectId, type='label')` then
     `INSERT labels (id=X, name, color, is_edge)`.
- **Read:** `findByProject(userId, projectId)` (filter by `entities.project_id`).
- **Update:** name/color/`is_edge`.
- **Delete:** delete the `entities` row (cascade removes the subtype row and any
  relationships referencing the label — tags via `kind='tag'`, edge typing via `label_id`
  set null).
- Controller guarded by `JwtAuthGuard`; ownership-gated.

## Notes
- **Tagging (assign/unassign a label to a thought) does NOT live here** — it is a
  `kind='tag'` relationship handled by the relationships service (task 11). Do not recreate
  `thought_labels` or an `assignLabel`/`unassignLabel` here. If the current labels service
  has those methods, they move to task 11.
- Leave validation light for now (task 13). Mark a TODO where a mutation would emit a
  real-time event (task 14).

## Acceptance criteria
- `npm run build` succeeds.
- Label create writes paired `entities` + `labels` rows in one transaction.
- No tagging/`thought_labels` logic remains in the labels service.

## Out of scope
- Tag/edge relationships (11), validation (13), gateway (14).
