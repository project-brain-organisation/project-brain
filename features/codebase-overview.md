# Project Brain V2 — Codebase Overview

> Orientation doc for starting fresh work. Load this instead of re-researching the
> whole tree. Verify anything load-bearing against the actual file before relying on it.

## What it is

A personal knowledge-graph app. Users create **projects** containing **thoughts** (notes),
connect them with **relationships** (hierarchy / tag / edge), tag them with **labels**, and
retrieve them by semantic search. Thoughts are chunked + embedded into vectors for
similarity search. An MCP sidecar exposes the same operations to claude.ai as tools.

## Monorepo layout

```
project-brain/
├── apps/
│   ├── api/    NestJS backend (REST + SSE + internal MCP endpoints)
│   ├── mcp/    Express MCP sidecar (OAuth-gated JSON-RPC bridge to the API)
│   └── web/    React 19 + Vite SPA (3D force-graph UI)
├── features/       Lightweight feature planning docs (this folder)
├── code-review/    Review reports
├── docs/           nWave workflow artifacts (mostly legacy tooling)
└── Dockerfile.api  Prod image; bundles the web build into the API (same-origin)
```

Root `package.json` has convenience scripts: `npm run api|mcp|web` and `build:api|mcp|web`.
Each app has its own `package.json`.

## Tech stack

| Layer    | Stack |
|----------|-------|
| API      | NestJS 11, Drizzle ORM 0.45, Neon serverless Postgres (pgvector), Passport (JWT + Google OAuth), Zod 3 |
| MCP      | Express 5, `jose` for JWT verification, Zod 3 (tool schemas) |
| Web      | React 19, Vite 8, `react-force-graph-3d` + `three` |
| Embeddings | OpenRouter API (`all-mpnet-base-v2`, 768-dim vectors) |

---

## API (`apps/api`)

NestJS module-per-domain. Entry: [main.ts](../apps/api/src/main.ts) → [app.module.ts](../apps/api/src/app.module.ts).

### Data model (Table-per-Type)

`entities` is the supertype registry — every node (project / thought / label) has a row here
carrying `project_id` and `type`. Subtype tables share the same `id` as PK+FK:

- **entities** — supertype; `id`, `project_id` (self-FK), `type` enum
- **project_meta** — project subtype; `name`, `emoji`, `color`, `isPublic`, `ownerId`
- **thoughts** — `body`, `title`, `color`, canvas geometry (`canvasX/Y`, `width`, `height`), `ownerId`
- **labels** — `name`, `color`, `isEdge`, `ownerId`
- **relationships** — unified edge table, discriminated by `kind` (`hierarchy` | `tag` | `edge`)
  - hierarchy: source = child thought, target = parent thought
  - tag: source = thought, target = label
  - edge: canvas edge, may carry `labelId`
  - Per-kind invariants enforced by partial unique indexes
- **chunks** — text chunks + `vector(768)` embedding; scoped by `projectId`, `thoughtId`, `ownerId`
- **project_subscriptions** — `(userId, projectId)` PK; "public graphs I added to my
  sidebar" (see `features/public-graphs.md`). RLS: user sees only their own rows.
- **users** / **credentials** / **mcp_auth_codes** / **mcp_refresh_tokens** — auth tables

**Public graphs:** `project_meta.isPublic` + a `project_meta_public_read` policy make a
project's row world-readable; matching `*_public_read` SELECT policies on thoughts / labels /
relationships / chunks (keyed on the parent project's `is_public`) expose its *contents* to
any authenticated user, read-only (no write policy for non-owners, so RLS blocks mutations
at the DB layer). Subscribing never grants access on its own — access is purely a function of
`is_public`, so re-privatising instantly hides a graph from subscribers.

Schema lives in [src/database/schema/](../apps/api/src/database/schema/). Creating a thought/label/
project is a **two-step insert** (entities row, then subtype row) inside one transaction.

**Cloning** (`ProjectsService.clone`) deep-copies a whole graph in one `asUser(caller)`
transaction: reads land through the caller's owner/`*_public_read` policies, every inserted row
is stamped `owner_id = caller` (so withCheck passes and the clone is decoupled from the source),
and a single old→new id map spanning thoughts + labels rewrites every relationship
`source/target/label` reference. Chunk vectors are copied verbatim (no re-embed). The clone
starts private regardless of the source's visibility.

### Multi-tenancy — RLS + AsyncLocalStorage (important)

Ownership isolation is enforced by **Postgres Row-Level Security**, not app-layer checks.
Every tenant table has an `owner_id` (denormalized from the project owner) and an RLS policy:
`owner_id = current_setting('app.current_user_id')::uuid` for both `using` and `withCheck`.

- [DatabaseService](../apps/api/src/database/database.service.ts) exposes `asUser(userId, cb)` — runs `cb`
  in a transaction that first does `SELECT set_config('app.current_user_id', userId, true)` so RLS
  sees the tenant. Also `asSystem(cb)` for context-free work (JWT validation, credential lookup).
- `db.db` runs as the restricted `app_user` role (DML only); `db.ownerDb` is owner-privileged,
  for migrations only. Falls back to `DATABASE_URL` when `DATABASE_URL_APP` is unset (local dev).
- [tenant-context.ts](../apps/api/src/database/tenant-context.ts) holds the shared ALS store.
- [TenantContextInterceptor](../apps/api/src/auth/interceptors/tenant-context.interceptor.ts) populates
  the ALS store per request by wrapping `next.handle()` in `tenantStorage.run()`. **This is the
  correct wiring** — an earlier guard-based approach was broken because `req.user` is undefined when
  the guard reads it (Passport validates async).

**Rule of thumb:** all runtime DB access goes through `db.asUser(userId, ...)`. Reads rely on RLS
to hide other tenants (so a bad projectId returns `[]`, not 403). `assertOwnership` in
[ProjectsService](../apps/api/src/projects/projects.service.ts) still guards create paths (validates the
project-type FK and rejects writes to public projects you don't own).

### Auth

- **Web users:** Google OAuth ([google.strategy](../apps/api/src/auth/strategies/google.strategy.ts)) →
  signed JWT in an httpOnly `pb_token` cookie. [JwtStrategy](../apps/api/src/auth/strategies/jwt.strategy.ts)
  extracts from cookie or `Authorization: Bearer`. `req.user = { userId }`.
- **MCP clients (claude.ai):** OAuth 2.0 + PKCE (S256). [AuthController](../apps/api/src/auth/auth.controller.ts)
  implements `/auth/mcp/authorize` + `/auth/mcp/token` (authorization_code + refresh_token grants).
  [AuthService](../apps/api/src/auth/auth.service.ts) issues short-lived JWT access tokens + rotating
  opaque refresh tokens. Well-known discovery + dynamic client registration are in `main.ts`.
- **Internal MCP calls:** [McpInternalGuard](../apps/api/src/internal-mcp/mcp-internal.guard.ts) checks a
  shared `MCP_INTERNAL_KEY` (constant-time) + an `x-mcp-user-id` header.

### Domains / routes

- **projects** — CRUD, `/api/projects`. Also `GET /api/projects/public` (all public graphs
  bar your own), `POST`/`DELETE /api/projects/:id/subscription` (add/remove a public graph),
  `POST /api/projects/:id/clone` (deep-copy any *readable* graph — own or public — into a
  new project the caller owns; see below), and `findAllByUser` returns owned ∪ subscribed rows
  tagged `role: 'owner' | 'subscriber'` (the internal MCP path passes `includeSubscribed:false`
  to stay owned-only). **New projects default to `isPublic:true`** (public-by-default; the
  sidebar lock/globe toggle makes them private) — clones are the exception, starting private.
- **workspace/thoughts** — CRUD + color, `/api/workspace/thoughts`
- **workspace/labels** — CRUD, `/api/workspace/labels`
- **workspace/relationships** — create/list/remove + recursive-CTE descendants
- **workspace/snapshot** — `GET /api/workspace/snapshot?projectId=` returns
  `{ thoughts, relationships, labels }` in one RLS transaction; the SPA's single read path.
  Create endpoints accept an optional client-generated `id` (duplicate → 409), and thought
  create takes an optional `parentId` (hierarchy rel created in the same tx) — both exist
  for the web app's optimistic mutations.
- **workspace/pipeline** — [ChunkingService](../apps/api/src/workspace/pipeline/chunking.service.ts)
  (3-tier splitter, 200-char chunks) + [EmbeddingService](../apps/api/src/workspace/pipeline/embedding.service.ts)
  (OpenRouter) + [PipelineService](../apps/api/src/workspace/pipeline/pipeline.service.ts)
  (chunk→embed→store, semantic search). Chunk/embed is **fire-and-forget** off create/update.
- **workspace/gateway** — SSE. [WorkspaceEventsService](../apps/api/src/workspace/gateway/workspace-events.service.ts)
  is an **in-memory** RxJS bus keyed by userId; clients subscribe at `/api/workspace/events`. Note:
  in-memory means a Railway-routed MCP write on another instance won't reach a browser on this one
  (cross-instance needs LISTEN/NOTIFY).
- **internal/mcp** — [InternalMcpController](../apps/api/src/internal-mcp/internal-mcp.controller.ts): the
  flat endpoint surface the sidecar calls (list/create/edit thoughts, labels, remember, elaborate,
  thought-to-prompt, etc.).

### Validation

Zod schemas in [workspace/validation/](../apps/api/src/workspace/validation/) via `ZodValidationPipe`,
composed from drizzle-zod inferred schemas. **Create paths are Zod-validated; update paths currently
use plain DTO classes** (see code review finding 4).

### Request flow

```
HTTP → JwtAuthGuard (Passport validates, sets req.user)
     → TenantContextInterceptor (ALS store = userId)
     → Controller (reads req.user.userId, Zod-validates body)
     → Service (db.asUser(userId, tx => ...) — RLS scopes the tx)
     → emit SSE event on the in-memory bus
```

---

## MCP sidecar (`apps/mcp`)

Standalone Express server bridging claude.ai ↔ the API. Entry: [main.ts](../apps/mcp/src/main.ts).

- Speaks MCP JSON-RPC over `/mcp` (POST for calls, GET for SSE keep-alive). Handles `initialize`,
  `tools/list`, `tools/call`, `ping`.
- **Auth:** a request is authorized by either the shared server key OR a per-user OAuth bearer JWT
  (verified in [auth.ts](../apps/mcp/src/auth.ts) with `jose`). `tools/call` always requires the bearer
  (needs a real user identity). RFC 9728 `WWW-Authenticate` challenge on 401 drives claude.ai discovery.
- **Tools:** registry in [tools/index.ts](../apps/mcp/src/tools/index.ts); grouped into
  [thought-tools](../apps/mcp/src/tools/thought-tools.ts), [label-tools](../apps/mcp/src/tools/label-tools.ts),
  [project-tools](../apps/mcp/src/tools/project-tools.ts), [retrieval-tools](../apps/mcp/src/tools/retrieval-tools.ts).
  Each tool is a single Zod schema → JSON Schema (advertised) + typed `execute` via
  [defineTool](../apps/mcp/src/tools/tool-contract.ts), so schema and handler can't drift.
- **[ApiClient](../apps/mcp/src/api-client.ts):** thin fetch wrapper; forwards `x-mcp-internal-key` +
  `x-mcp-user-id` (+ scope) to `/api/internal/mcp/*`.
- **Public/subscribed graphs:** `list_projects` returns subscribed public graphs too, each tagged
  `role: 'owner' | 'subscriber'`. Read + `remember` work on them via RLS `*_public_read`; writes
  throw `READ_ONLY_GRAPH_MESSAGE` (from `assertOwnership` and the `ownerId` guard on
  thoughts/labels/relationships `update`/`remove`). `remember` defaults to owned-only — pass a
  subscribed graph's `projectId` to search it (avoids folding all platform-public chunks into an
  unscoped search). See `features/public-graphs-followups.md`.
- Config validated at startup in [config.ts](../apps/mcp/src/config.ts).

---

## Web (`apps/web`)

React 19 SPA. Entry [main.tsx](../apps/web/src/main.tsx) → [App.tsx](../apps/web/src/App.tsx).

- **API access:** [lib/api.ts](../apps/web/src/lib/api.ts) (fetch wrapper, `credentials: 'include'`) +
  [lib/pbApi.ts](../apps/web/src/lib/pbApi.ts) (typed one-function-per-endpoint client, mirrors drizzle rows).
- **State is TanStack Query** (since 2026-07-13, see `features/ui-latency-tier3-tanstack-query.md`).
  Two query keys in [lib/queryClient.ts](../apps/web/src/lib/queryClient.ts): `['projects']` and
  `['workspace', projectId]` (the snapshot endpoint). All mutations are **optimistic** via the
  `useOptimisticMutation` factory in [query-utils.ts](../apps/web/src/hooks/query-utils.ts) —
  client-generated uuids, immediate cache patch, rollback + toast ([Toasts](../apps/web/src/components/Toasts.tsx),
  wired through the queryClient's MutationCache) on failure.
- **Hooks keep their v1-era APIs:** [useThoughts](../apps/web/src/hooks/useThoughts.ts) (derives flat
  thoughts with `parentId`/`edgeLabels` + `edgeRelationships` from the snapshot), [useProjects](../apps/web/src/hooks/useProjects.ts),
  [useLabels](../apps/web/src/hooks/useLabels.ts) / `useThoughtLabels`, [useAuth](../apps/web/src/hooks/useAuth.ts).
- **Live updates:** [useWorkspaceEvents](../apps/web/src/hooks/useWorkspaceEvents.ts) subscribes to the SSE
  stream and `invalidateQueries` the affected key when an `mcp`-sourced event arrives; own `user`
  events are ignored (already patched optimistically). There are no ad-hoc event buses.
- **Components:** [HomePage](../apps/web/src/components/HomePage.tsx) is the main view (presents the project
  as a synthesized root pseudo-node, drill-down by focus), [NetworkView](../apps/web/src/components/NetworkView.tsx)
  (mind map rendered with `react-force-graph-3d`, but laid out deterministically before render by
  [mindMapLayout](../apps/web/src/lib/mindMapLayout.ts) — radial-tree seed + offline force polish —
  with every node pinned; the live engine never runs), [ThoughtsList](../apps/web/src/components/ThoughtsList.tsx),
  [ThoughtCard](../apps/web/src/components/ThoughtCard.tsx), [LabelPicker](../apps/web/src/components/LabelPicker.tsx),
  [Sidebar](../apps/web/src/components/Sidebar.tsx), [Shell](../apps/web/src/components/Shell.tsx),
  [McpDialog](../apps/web/src/components/McpDialog.tsx), [Login](../apps/web/src/components/Login.tsx).
- **Mobile (≤768px):** a separate single-screen layout, conditionally *mounted* via
  [useIsMobile](../apps/web/src/hooks/useIsMobile.ts) (never CSS-hidden — keeps the WebGL loop off).
  Top bar + the Sidebar as a left nav drawer + a two-tab bottom bar routed at `/` (Thoughts, with a
  new-thought FAB) and `/graph` (graph + node-preview bottom sheet with an anchored "Add relationship"
  FAB). Dismissible surfaces (drawer / sheet / relationships dialog) live in router history state via
  [useHistoryFlag](../apps/web/src/hooks/useHistoryFlag.ts) so the Android back gesture closes them.
  The mobile **Thoughts** screen has its own drill-down — a history-backed `'drill'` path so a
  back-swipe drills up one level (see `features/thought-canvas-drill-navigation.md`); desktop keeps
  the in-memory `focusedNodeId` state. Details and rationale: `features/mobile-ui.md`.

---

## Deployment

- Hosted on **Railway** behind a reverse proxy (`trust proxy` set; `X-Forwarded-Proto` honored).
- Prod image [Dockerfile.api](../Dockerfile.api) bundles the web build into the API, served **same-origin**
  under `../client` — non-`/api`, non-`/.well-known` GETs fall through to the SPA's `index.html`.
- Key env vars: `DATABASE_URL`, `DATABASE_URL_APP`, `JWT_SECRET`, `MCP_ACCESS_TOKEN_SECRET`,
  `MCP_INTERNAL_KEY`, `MCP_SERVER_SECRET`, `GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL`, `OPENROUTER_API_KEY`,
  `FRONTEND_URL`, `MCP_PUBLIC_API_URL`, `NODE_ENV`.

## Testing

API tests live in [apps/api/test/](../apps/api/test/) (Jest) — schema specs, RLS cross-tenant integration,
service specs, full smoke. MCP has per-tool `.test.ts` files under [apps/mcp/src/tools/](../apps/mcp/src/tools/).

## Known issues

See [code-review/2026-07-13-full-app-review.md](../code-review/2026-07-13-full-app-review.md) for the
current findings (fail-open `NODE_ENV` gate, 50mb body limit, unvalidated update paths, N+1 queries in
the internal MCP controller, in-memory SSE bus not cross-instance, etc.).
