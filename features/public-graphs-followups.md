# Public graphs — follow-ups: MCP parity & graph cloning

Two deferred pieces from `features/public-graphs.md`. They share a theme:
extending public/subscribed graphs beyond the web read-only view. Independent of
each other — ship either first.

## 1. MCP tool parity for public / subscribed graphs

**Problem.** The MCP surface is deliberately owned-only right now:
`InternalMcpController.listProjects` calls
`findAllByUser(userId, { includeSubscribed: false })`, so an MCP client (claude.ai)
never sees the graphs a user added via Discover, and cannot search or read them.
The web app can browse a subscribed public graph but an assistant acting for the
same user cannot — an inconsistency users will notice once they rely on public
graphs.

**Goal.** Let an MCP client list, read, and semantically search the user's
subscribed public graphs (and, optionally, discover new public graphs), while
keeping writes owner-only exactly as RLS already enforces.

### Design

- **List.** Flip `listProjects` to include subscribed graphs (drop the
  `includeSubscribed:false`), returning the `role` field so the client/tool
  description can mark which are read-only. Alternatively add a separate
  `list_public_projects` tool mapping to `GET /api/projects/public`.
- **Read + search already work at the data layer.** `remember` (semantic search),
  `elaborate`, `get_thought`, `list_thoughts`, `list_relationships`,
  `list_labels` all run through `db.asUser`, and the `*_public_read` RLS policies
  already expose public-project content to any authenticated user. So most read
  tools light up for subscribed graphs **with no API change** once the project id
  is reachable — the main work is confirming each internal endpoint scopes by
  `projectId` (not `ownerId`) and doesn't re-filter to owned.
  - Audit the internal-mcp controller's queries for any residual
    `where ownerId = …` that would exclude public content (RLS is the gate; app
    filters should not narrow further).
  - `remember` across *all* accessible projects vs. a chosen project: decide
    whether search spans subscribed graphs by default (probably opt-in via a
    `projectId` arg to avoid surprising cross-graph results).
- **Writes stay blocked.** Create/edit/remove tools already fail against a
  non-owned project because RLS rejects the write (and `assertOwnership` on
  create paths throws `ForbiddenException`). Improve the **error surface**: today
  the client may get an opaque RLS error / empty result. Return a clear
  "this graph is read-only (added, not owned)" message from the tool layer when
  the target project's `role` is `subscriber`.
- **Subscribe from MCP (optional).** A `add_public_project` / `remove_public_project`
  tool mapping to the subscription endpoints, so an assistant can curate the
  user's sidebar. Lower priority.

### Touch points

- `apps/api/src/internal-mcp/internal-mcp.controller.ts` — `listProjects` flag;
  audit per-tool queries for owner-narrowing; read-only error messaging.
- `apps/mcp/src/tools/project-tools.ts` (+ `retrieval-tools.ts`) — tool
  descriptions noting read-only graphs; optional new tools + Zod schemas via
  `defineTool`.
- Per-tool `.test.ts` under `apps/mcp/src/tools/`.

### Checklist

- [x] `list_projects` includes subscribed graphs with a read-only marker
      (controller drops `includeSubscribed:false`; `role` flows through; tool
      description explains owner vs. subscriber)
- [x] Audit internal-mcp read queries: scope by `projectId`, never re-filter to
      `ownerId` (let RLS gate) — read paths (`findByProject`/`findOne` in
      thoughts/labels/relationships, `elaborate`, `thought_to_prompt`) already
      scope by id/projectId only; no owner-narrowing found
- [x] Decide `remember` scope — **default = owned only**; searching a subscribed
      public graph requires passing its `projectId`. Without this the
      `chunks_public_read` policy would fold *every* public project platform-wide
      into an unscoped search. Fixed in `PipelineService.semanticSearch`
      (omitted projectId → `c.owner_id = userId`).
- [x] Write tools return a clear "read-only graph" error, not a raw RLS failure /
      silent no-op — `READ_ONLY_GRAPH_MESSAGE` thrown from `assertOwnership`
      (create paths) and from an `ownerId` guard on thoughts/labels/relationships
      `update`/`remove` (previously RLS silently affected 0 rows; `remove-thought`
      even reported `{deleted:true}` falsely)
- [x] Read-only rejection covered by unit tests (thoughts update; assertOwnership
      message); RLS integration proves public read + zero-row write at the DB
      layer (16/16 in `features/public-graphs.md`)
- [ ] (Optional) `add_public_project` / `remove_public_project` tools — deferred
- [x] Update `features/codebase-overview.md` (MCP section)

### Status (2026-07-14) — DELIVERED (Part 1)

MCP clients now see subscribed public graphs in `list_projects` (tagged
`role`), can read and `remember`-search them (search opt-in per `projectId`),
and get a clear read-only error on any write attempt. API builds; web/mcp build;
API service specs 43/43, MCP tool tests 71/71. No new MCP tools added (the two
optional subscribe tools stay deferred). Not yet exercised against a live
claude.ai session — worth a manual smoke once a public graph is subscribed.

## 2. Graph cloning ("fork" a public graph into an editable copy)

**Problem.** A subscribed public graph is strictly read-only and tracks the
owner's future edits. Users will want to take a public graph as a *starting
point* — copy it into a project they own and edit freely — without their changes
affecting the original or vanishing if the owner re-privatises it.

**Goal.** "Clone" / "Duplicate to my projects" on any public (or subscribed)
graph: deep-copy the project and all its content into a new project owned by the
caller, fully editable, decoupled from the source.

### Design

- **New endpoint** `POST /api/projects/:id/clone` → creates a new project owned
  by the caller and deep-copies the source graph's thoughts, labels,
  relationships, and (re-embedded or copied) chunks. Source must be readable by
  the caller (own or public — RLS enforces this on the read side).
- **Id remapping is the crux.** Everything is keyed by UUID and cross-references
  by id (relationships point at thought/label ids; thoughts carry `projectId`;
  chunks carry `thoughtId`/`projectId`). Build an old→new id map for every
  entity first, then rewrite all references through it:
  1. New project entity + `project_meta` (owner = caller, `isPublic:false`).
  2. For each source thought/label: new `entities` row + subtype row, record
     `oldId → newId`.
  3. Relationships: insert with `sourceId`/`targetId`/`labelId` remapped; keep
     `kind`. Preserve the per-kind unique invariants (they hold automatically if
     the source was valid).
  4. Chunks: either copy `body` + re-run the embedding pipeline for the new
     thought ids (simplest, reuses `PipelineService`), or copy the stored
     `vector_embedding` directly with remapped ids (faster, no OpenRouter cost).
     Prefer copying vectors to avoid re-embedding cost; fall back to re-embed if
     the source has no chunks yet.
  - All in **one `db.asUser(callerId, tx => …)` transaction** so a failure rolls
    back cleanly and RLS stamps `owner_id = caller` on every inserted row
    (withCheck passes because the caller owns the new rows).
- **`ownerId` denormalization.** Every content row copies the *caller's* id into
  `ownerId` (not the source owner's) — that's what makes the clone theirs and
  what RLS keys on. Easy to get wrong; assert it in a test.
- **Canvas geometry & colors** copy verbatim (they're plain columns).
- **Scale guard.** A large source graph = many inserts. Batch inserts; consider a
  size cap or async job if graphs get big. Fine to start synchronous.

### UX

- "Duplicate to my projects" action in the **Discover dialog** row and/or on a
  subscribed graph's read-only header (next to the "view only" chip). On success,
  select the new owned project. A subtle "Cloned from {owner}" provenance note is
  optional (store a `clonedFromId` column if we want lineage; omit for v1).

### Touch points

- `apps/api/src/projects/projects.service.ts` — `clone(userId, sourceId)`; likely
  a new `cloneGraph` helper coordinating the id remap.
- `apps/api/src/projects/projects.controller.ts` — `POST :id/clone`.
- `apps/api/src/workspace/pipeline/pipeline.service.ts` — reuse for re-embed path
  if chosen.
- `apps/web/src/lib/pbApi.ts` + `useProjects` — `cloneProject` mutation.
- `DiscoverDialog.tsx` / read-only header — the action.
- Integration test: clone a multi-node public graph; assert new ids, caller
  `ownerId` everywhere, relationships remapped and intact, source untouched, and
  the clone is editable while the source stays read-only.

### Checklist

- [x] `POST /api/projects/:id/clone` deep-copies entities/thoughts/labels/
      relationships/chunks with a full old→new id remap in one RLS transaction
- [x] Every cloned row carries the caller's `ownerId`; new project `isPublic:false`
- [x] Chunk strategy chosen (copy vectors vs. re-embed) and implemented — **copy
      vectors** verbatim; `normalizeVector` re-parses the pgvector string so the
      customType re-encodes it on insert
- [x] Relationship references (source/target/label) remapped; invariants hold
      (the one id map spans thoughts *and* labels)
- [x] Web: clone button next to the project name — desktop (`ThoughtsList` header,
      at project root) + mobile (`TopBar`); available on **any** graph (own or
      read-only), selects the new project on success
- [~] Integration test: clone integrity proven at the unit layer (id remap, caller
      ownership on every row, `isPublic:false`, vector normalisation) in
      `projects.service.spec.ts`; a live-DB integration test (source isolation +
      clone editability) is still worth adding
- [ ] (Optional) `clonedFromId` provenance column — deferred
- [x] Update `features/codebase-overview.md` (data model + projects routes)

### Status (2026-07-14) — DELIVERED (Part 2)

Clone endpoint deep-copies any readable graph into a fresh caller-owned project in
one RLS transaction (copy-vectors, full id remap across thoughts+labels). A "Clone"
button sits next to the project name in both the desktop (`ThoughtsList` header) and
mobile (`TopBar`) UI, for own **and** read-only graphs, and selects the new project on
success. Separately per this session's request: **new projects (web + MCP) now default
to public** (`ProjectsService.create` default flipped to `isPublic:true`; sidebar toggle
still makes them private), and the desktop "View only" chip **no longer shows the author**.
API + web build; API service specs 12/12 (2 new clone tests), internal-mcp 2/2. Not yet
driven against a live session — clone is a DB write and localhost points at the prod DB,
so a manual smoke on the dev DB is the safe next step.
