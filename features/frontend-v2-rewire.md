# Feature: Rewire web frontend to the v2 backend API

**Status:** implemented 2026-07-10 — awaiting browser verification (steps 3–7 checks below done via API smoke + typecheck + build; in-browser pass pending)
**Created:** 2026-07-10
**Why:** The backend-redesign-v2 roadmap rebuilt the API (`/api/projects` + `/api/workspace/*`, entity-supertype model) but never touched `apps/web`. The frontend still calls the v1 surface (`/api/thoughts`, `/api/labels`, `/api/colors`, `/api/mcp/events`) — every call 404s, so the UI hangs on infinite loading after login.

## Domain model shift

The UI's mental model must change, not just its URLs:

| v1 (what the UI assumes) | v2 (what the backend has) |
|---|---|
| "Projects" are root thoughts (`isRoot: true`) | Projects are first-class (`project_meta` via `/api/projects`) |
| `GET /api/thoughts/roots` for the sidebar | `GET /api/projects` |
| `GET /api/thoughts/tree?rootId=` for the graph | thoughts by project + `relationships` (kind=`hierarchy`) edges |
| Label→thought assignment via `/api/labels/thought/:id` | relationship edge with kind=`tag` |
| Colors in a separate `/api/colors` table | `color` column on the thought (`PATCH /api/workspace/thoughts/:id/color`) |
| SSE at `/api/mcp/events`, event `mcp.tool.used` | SSE at `/api/workspace/events`, event `workspace.event` (+ `workspace.heartbeat`) |

## v2 endpoints available today

- `GET|POST /api/projects`, `GET|PATCH|DELETE /api/projects/:id`
- `POST /api/workspace/thoughts`, `GET /:id`, `PATCH /:id/color`, `DELETE /:id/color`, `DELETE /:id`
- `POST /api/workspace/labels`, `GET /project/:projectId`, `GET|PATCH|DELETE /:id`
- `POST /api/workspace/relationships`, `GET ?projectId=&kind=`, `GET /descendants/:thoughtId`, `GET|DELETE /:id`
- `GET /api/workspace/events` (SSE, JWT cookie auth)

## Known backend gaps (small, must be added first)

1. **List thoughts by project** — `ThoughtsService.findByProject(userId, projectId)` exists but has no route. Add `GET /api/workspace/thoughts?projectId=`.
2. **General thought update** — the UI edits `title`, `body`, `canvasX/Y`, `width/height`; the service only has `updateBody`. Add an `update` service method + `PATCH /api/workspace/thoughts/:id` (zod-validated, partial).

Everything else the UI needs already exists.

---

## Delivery steps

Work top-to-bottom; each step leaves the app runnable. Check off as we go.

### 1. Backend gap-fill
- [x] `GET /api/workspace/thoughts?projectId=` → `findByProject` (asUser, RLS does the scoping)
- [x] `PATCH /api/workspace/thoughts/:id` accepting partial `{title, body, canvasX, canvasY, width, height}`; body changes re-trigger the embedding pipeline like `updateBody` does
- [x] Unit tests for both, matching the existing asUser mock style
- [x] (drive-by) create() now persists canvasX/Y/width/height — schema accepted them but the service silently dropped them
- **Check:** curl both routes with a real JWT; suites green.

### 2. Typed API layer (`apps/web/src/lib/`)
- [x] Added `lib/pbApi.ts`: v2 types + `projectsApi`/`thoughtsApi`/`labelsApi`/`relationshipsApi`
- [x] Hooks use try/finally so failures can't wedge loading states
- **Check:** ✅ typecheck passes.

### 3. Projects in the sidebar
- [x] New `useProjects` hook: list/create/rename/delete via `/api/projects`
- [x] `Shell` + `Sidebar` rewired to `Project[]` (name + emoji); `SelectedRootContext` unchanged (still just holds an id)
- [x] The + button → `POST /api/projects` with default name "Untitled Project"
- **Check:** ✅ via API smoke; browser pass pending.

### 4. Thoughts + hierarchy per project
- [x] `useThoughts(projectId)` fetches thoughts + hierarchy rels + tag rels + labels in parallel, joins `parentId`/`edgeLabels` client-side
- [x] Child thought = create + hierarchy relationship (source=child, target=parent); top-level = no edge, drawn hanging off the project pseudo-root
- [x] `HomePage` synthesizes the project root pseudo-node; root title edit = project rename; root body editor hidden (project_meta has no body)
- **Check:** ✅ via API smoke (create/nest/list/patch); browser pass pending.

### 5. Labels + colors
- [x] `useLabels(projectId)` via `/api/workspace/labels`; assignment = tag relationships tracked by `relationshipId`
- [x] `useNodeColors` deleted; colors read from thought rows, written via `PATCH :id/color`
- [x] Fixed pre-existing v2 bug: color route's `UpdateThoughtDto` had no class-validator decorators, so the global whitelist pipe stripped `color` → drizzle "No values to set" 500. Replaced with zod `setThoughtColorSchema`.
- **Check:** ✅ set + clear color verified live.

### 6. Real-time events
- [x] `useMcpToolEvents` → `useWorkspaceEvents` on `/api/workspace/events`; refreshes only on `source: 'mcp'` events (own-tab actions already update state)
- **Check:** browser + MCP pass pending.

### 7. Cleanup + full smoke
- [x] Deleted dead code: `useNodeColors`, `useTreeData`, `useMcpToolEvents`, `IdeaHierarchy.tsx/.css`, `NetworkView.backup.tsx`, `lib/layout.ts`, `lib/geometry.ts`, `useEdgeAssignments`, `UpdateThoughtDto`
- [x] Fixed pre-existing build breakers: stray trailing `}` in HomePage/ThoughtCard/ThoughtsList CSS (vite prod build failed); missing `@types/three`; `ReactNode` type-only import
- [x] API smoke: full project→thought→hierarchy→label→tag→color→delete pass, no failures
- [ ] **Browser pass (user):** login → create project → thoughts → nest → labels → colors → delete
- [ ] Cross-tenant sanity with a second Google account
- **Check:** ✅ `tsc -b` clean, `vite build` succeeds, all API unit suites green (226 passed).

## Out of scope
- Visual redesign, new features — this is a like-for-like rewire.
- MCP sidecar changes (already on the v2 internal API).
- Prod deploy of the backend (separate decision; prod still runs v1).

## Risks / notes
- `canvasX/canvasY/width/height` exist on the thought row but v1 stored positions differently — verify the graph layout still reads sensible values on first load (may all be null → layout must fall back gracefully).
- Label assignment via tag-relationships needs `DELETE /api/workspace/relationships/:id` — the UI must track the relationship id per assignment (v1 used `(thoughtId, labelId)` pairs).
- The SSE endpoint authenticates via the `pb_token` cookie; `EventSource` sends it as long as `withCredentials: true` is kept and we stay same-origin through the vite proxy.
