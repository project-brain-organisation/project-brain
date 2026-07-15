# Task 07 — `ProjectsModule` (project_meta CRUD + create-project transaction)

**Read first:** `../backend-redesign-v2.md` §2.3 (scoping), §2.4 (create-project flow), §4.
**Depends on:** 05, 06. **Blocks:** 09.

## Goal
Own project lifecycle: create/list/rename/visibility, and the **ownership gate** used by
everything downstream. A project is created as an `entities` row that is its own root plus
a `project_meta` row, in one transaction.

## Requirements
Create `apps/api/src/projects/`:
- `projects.module.ts`, `projects.service.ts`, `projects.controller.ts`.
- **Create project** (single DB transaction, per §2.4):
  1. `INSERT entities (id = X, project_id = X, type = 'project')` — self-reference makes the
     project its own root. Generate `X` (uuid) up front so both rows share it.
  2. `INSERT project_meta (id = X, owner_id = <caller>, name, emoji?, is_public=false)`.
  Use Drizzle's `db.transaction(...)`. If either insert fails, both roll back.
- **List my projects:** `SELECT … FROM project_meta WHERE owner_id = <caller>` (joined to
  `entities` as needed). This is the only user-level query that matters.
- **Update / visibility:** rename, set `is_public`, set `emoji` — scoped to owner.
- **Ownership gate helper** (export it — tasks 09/10/11 reuse it):
  `assertOwnership(userId, projectId)` → `SELECT owner_id FROM project_meta WHERE id =
  projectId`; throw `ForbiddenException`/`NotFoundException` if missing or `owner_id !==
  userId`. This single check *is* the tenant boundary (§2.3).
- Controller endpoints guarded by `JwtAuthGuard`; resolve `userId` from `req.user`.

## Notes
- Deleting a project = delete its `entities` row; the self-referential cascade wipes all
  child entities, relationships, and chunks. Implement delete accordingly.
- The current notion of "project = root thought with `is_root=true`" is gone — projects are
  `type='project'` entities now.

## Acceptance criteria
- `npm run build` succeeds.
- Creating a project yields exactly one `entities` (type=project, project_id=self) + one
  `project_meta` row; failure rolls back both.
- `assertOwnership` is exported and rejects cross-user access.
- Deleting a project cascades to all its nodes.

## Out of scope
- Thoughts/labels/relationships (tasks 09–11).
