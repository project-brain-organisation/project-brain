# Public knowledge graphs

Let users publish a knowledge graph to the whole platform and browse/add other
users' public graphs to their own sidebar (read-only). Two UI surfaces: a
**Discover dialog** for finding and adding public graphs, and a per-project
**visibility toggle icon** in the sidebar for making an owned graph public or
private again.

## What already exists

The groundwork is half-built — `project_meta.isPublic` is live end-to-end:

- Column + `project_meta_public_read` RLS policy (SELECT of public rows for
  `app_user`) in [project-meta.schema.ts](../apps/api/src/database/schema/project-meta.schema.ts).
- `PATCH /api/projects/:id` accepts `isPublic` (service → DTO → `pbApi.projects.update`).
- `assertOwnership` already rejects writes to public projects you don't own.

What's missing: the **contents** of a public project are still invisible to
non-owners (thoughts/labels/relationships/chunks have owner-only policies), there
is no way to list public projects, no persistence of "graphs I added", and no UI
for any of it.

## Design

### Data model

- **Public-read policies on content tables.** Add a `FOR SELECT` policy to
  `thoughts`, `labels`, `relationships`, `chunks`:
  `EXISTS (SELECT 1 FROM project_meta pm WHERE pm.id = project_id AND pm.is_public)`.
  The existing `project_meta_public_read` policy makes that subquery work under
  `app_user`. Writes stay owner-only — the owner-isolation policies' `withCheck`
  is untouched, so RLS itself enforces read-only access for everyone else.
- **`project_subscriptions` table** — `userId` (FK users, cascade), `projectId`
  (FK entities, cascade — owner deleting the project cleans up subscribers),
  composite PK, `createdAt`. RLS: `user_id = current_setting(...)` for all — a
  user only ever sees/edits their own subscriptions. New drizzle migration for
  this table + the four policies.

### API

- `GET /api/projects/public` — list public projects (id, name, emoji, color,
  owner display name, subscribed-already flag). Simple `where isPublic = true`
  under `asUser` (RLS permits it); optional `?q=` name filter. Exclude the
  caller's own projects.
- `POST /api/projects/:id/subscription` / `DELETE /api/projects/:id/subscription`
  — add/remove. Insert validates the target is public and not self-owned
  (`insert ... select` guarded by the same public check; RLS on the target's
  `project_meta` makes a private/unknown id look nonexistent → 404).
- `findAllByUser` → **owned ∪ subscribed**, each row tagged
  `role: 'owner' | 'subscriber'`. Subscribed rows join `project_meta` (public
  policy makes them visible) — a graph the owner re-privatised drops out of the
  join and silently disappears from the subscriber's sidebar; stale
  subscription rows are harmless and cleaned up lazily on unsubscribe/delete.
- **Snapshot & search work for free** once the content policies land:
  `GET /api/workspace/snapshot?projectId=` and pipeline search run under RLS,
  which now reveals public rows. Mutations against a subscribed graph are
  rejected by RLS/`assertOwnership` — but the client shouldn't offer them (below).

### Web UI

- **Discover dialog** — opened from a globe/compass button beside the `+` in the
  sidebar's PROJECTS header. Search field, list of public graphs (emoji, name,
  owner), an **Add** button per row (→ subscribe, appears in sidebar, dialog
  stays open) or **Added ✓** state. Modeled on `McpDialog` for shell/styling.
- **Sidebar** — owned projects keep the current section; a second **ADDED**
  section lists subscriptions. Owned rows gain a visibility icon between the
  name and the delete ×: lock (private, default) / globe (public). Click
  toggles via the existing update mutation; going public asks a one-line
  confirm ("Everyone on Project Brain will be able to view this graph").
  Subscribed rows swap the delete × for an **unsubscribe** action (no
  type-name confirm — it's non-destructive) and never show the visibility icon.
- **Read-only mode** for a selected subscribed graph: `role` flows from
  `useProjects` into `HomePage`/mobile screens — hide the new-thought composer
  and FAB, thought edit/delete actions, label editing, relationship creation,
  and drag-to-move persistence. Graph view, drill-down, list, and search all
  work as normal. A small "view only · by {owner}" chip in the top bar/header.
- **Query layer** — `['projects']` cache now holds both roles; subscribe/
  unsubscribe are optimistic mutations via the existing `useOptimisticMutation`
  factory. `['public-projects']` query for the dialog (no optimism needed
  beyond the subscribed flag).

### Out of scope (note, don't build)

- Live updates for subscribers: SSE bus is keyed by owner userId, so
  subscribers never get events — acceptable; snapshot refetch on focus covers it.
- MCP tool parity (`list_projects` showing subscribed graphs) — follow-up.
- Cloning a public graph into an editable copy; per-user sharing/ACLs.

## Touch points

- [project-meta.schema.ts](../apps/api/src/database/schema/project-meta.schema.ts) et al —
  new policies; new `project-subscription.schema.ts` + migration
- [projects.service.ts](../apps/api/src/projects/projects.service.ts) /
  [projects.controller.ts](../apps/api/src/projects/projects.controller.ts) — public list,
  subscribe/unsubscribe, `findAllByUser` union
- [pbApi.ts](../apps/web/src/lib/pbApi.ts), [useProjects.ts](../apps/web/src/hooks/useProjects.ts) —
  new endpoints, `role` on `Project`
- [Sidebar.tsx](../apps/web/src/components/Sidebar.tsx) — visibility icon, ADDED
  section, unsubscribe, Discover entry point
- New `DiscoverDialog.tsx` (+ CSS)
- [HomePage.tsx](../apps/web/src/components/HomePage.tsx) + mobile screens — read-only gating

## Checklist

- [x] Migration: `project_subscriptions` table (+ RLS) and public-read SELECT
      policies on thoughts / labels / relationships / chunks
      (`drizzle/migrations/0007_public_graphs.sql`) — **applied to prod
      2026-07-14** (user-approved; table + 4 public_read policies verified)
- [x] RLS integration test: user B reads public project contents, cannot write
      (0 rows updated); private content stays hidden; subscriptions per-user
      isolated — 16/16 pass against the branch with the migration applied
- [x] `GET /api/projects/public` (+ `q` filter client-side, excludes own)
- [x] `POST` / `DELETE /api/projects/:id/subscription` (public-only, not own,
      idempotent via `onConflictDoNothing`)
- [x] `findAllByUser` returns owned ∪ still-public subscribed with `role`
      (`includeSubscribed:false` keeps the MCP surface owned-only)
- [x] pbApi + query hooks: publicProjects, subscribe/unsubscribe (optimistic),
      `role` on Project type
- [x] Sidebar: lock/globe toggle on owned rows (confirm on going public)
- [x] Sidebar: ADDED section, unsubscribe action, Discover button
- [x] `DiscoverDialog`: search, list, Add/Added states
- [x] Read-only mode when `role === 'subscriber'` (desktop + mobile: no
      composer/FAB/edit/delete/relationship-create), "view only" chip
- [ ] Verify e2e with two accounts: publish → discover → add → browse →
      re-privatise → disappears (migration now applied; ready to test)
- [x] Update `features/codebase-overview.md` (data model + projects routes)

## Status (2026-07-14)

Code complete and **migration applied to prod**; API + web both build; unit
(8/8) + RLS integration (16/16) tests green. The RLS suite ran against a
throwaway Neon branch carrying the migration, as `app_user`, so real policy
enforcement is proven. New web files: `DiscoverDialog.tsx` (+ CSS).

Regression note: shipping the `findAllByUser` union before the prod migration
briefly broke `GET /api/projects` (query referenced the not-yet-existing
`project_subscriptions` table) — the fix was applying the migration. Lesson:
schema must lead code for any query touching a new table. Remaining: the
two-account browser e2e, and delete the temp Neon branch
`br-cool-dawn-ajxmg9s0` used for test validation.
