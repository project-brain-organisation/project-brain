# Project Brain — Backend Architecture Redesign (v2)

Status: draft for review. This supersedes `Back-end-architecture-redesign.md`.

This plan assumes **no live data and no users** — we are free to drop and recreate
the schema. There is no migration phase; we regenerate Drizzle migrations from the
new schema. Every section is tagged so the boundary between old and new is explicit:

- **KEEP** — exists today, carried over unchanged (or only relocated).
- **REPLACE** — exists today, but is restructured by this plan.
- **NEW** — does not exist today.

---

## 1. Goals and non-goals

**Goals**
- Adopt the Entity Supertype (Table-per-Type) data model for graph nodes — chosen for
  modelling elegance and a single global node registry, **not** for read performance
  (it costs an extra join per node read; we accept that).
- Scope every graph node to a project; relate every project to a user.
- First-class **relationships (edges)** table for the canvas graph.
- Consolidate validation on **drizzle-zod** with business-rule refinements.
- Group volatile graph features under one `workspace` domain module to avoid the
  circular-dependency churn of table-by-table modules.

**Non-goals (explicitly dropped from v1)**
- ❌ Composite multi-tenant foreign keys / composite unique constraints. They are more
  machinery than this stage needs. Project scoping is enforced by single-column FKs +
  the service layer, which is simpler and remains extensible (we can add composite FKs
  later without a redesign).
- ❌ The v1 claim that this schema "eliminates join overhead." It does not.

---

## 2. Data model

### 2.1 Shape

Entity Supertype: one central `entities` registry row per node, plus one subtype row
holding that node's concrete payload. The three node types are **project**, **thought**,
and **label**. A project is the literal root node of its own graph (its entity row's
`project_id` points at itself).

```
                         ┌────────────────────┐
        users ───1:N───► │  project_meta      │  (subtype: owner, name, isPublic)
          ▲              └─────────┬──────────┘
          │ owner_id               │ id = entities.id (PK = FK)
          │              ┌─────────▼──────────┐
          │              │     entities       │  (supertype registry: id, project_id, type)
          │              └───┬───────────┬────┘
          │   id=entities.id │           │ id=entities.id
          │           ┌──────▼─────┐ ┌───▼────────┐
          │           │  thoughts  │ │   labels   │   (subtypes)
          │           └──────┬─────┘ └────────────┘
          │           1:N    │ thought_id
          │           ┌──────▼─────┐
          └───────────┤   chunks   │            (vector fragments, project-scoped)
                      └────────────┘

   relationships (edges):  source_id ─► target_id, discriminated by `kind`
                           (hierarchy | tag | edge), optional label_id typing an edge
```

### 2.2 Tables

**`entities`** — **NEW** (supertype / global node registry)
- `id` uuid PK
- `project_id` uuid NOT NULL → `entities.id` ON DELETE CASCADE *(self-reference; a
  project node points at itself, which is how a whole project cascades on delete)*
- `type` enum(`project`,`thought`,`label`) NOT NULL
- `created_at`, `updated_at`
- index on `project_id`

**`project_meta`** — **REPLACE** *(today a project is a `thoughts` row with `is_root=true`)*
- `id` uuid PK → `entities.id` ON DELETE CASCADE
- `owner_id` uuid NOT NULL → `users.id` ON DELETE CASCADE  *(projects relate to users)*
- `name` varchar
- `emoji` varchar(16) null
- `is_public` boolean NOT NULL default false
- index on `owner_id`

**`thoughts`** — **REPLACE** *(becomes a subtype; loses `user_id`, `project_id`,
`is_root` — those move to `entities`/`type`)*
- `id` uuid PK → `entities.id` ON DELETE CASCADE
- `color` varchar(7) null  *(hex stored inline, same as `labels.color` — no FK table)*
- *(no `parent_id` — the feed hierarchy now lives in `relationships`, `kind='hierarchy'`)*
- `body` text, `title` varchar, `content_hash` varchar
- `canvas_x`, `canvas_y`, `width`, `height` integer null

**`labels`** — **REPLACE** *(becomes a subtype; loses `user_id`/`project_id`)*
- `id` uuid PK → `entities.id` ON DELETE CASCADE
- `name` varchar, `color` varchar default `#999999`, `is_edge` boolean default false

**`relationships`** — **NEW** *(the single, unified edge table governing every
relationship between every entity. Replaces all three of today's relationship mechanisms:
`thoughts.parent_id`, the `thought_labels` join, and the faked `labels.is_edge` edges.)*
- `id` uuid PK
- `project_id` uuid NOT NULL → `entities.id` ON DELETE CASCADE  *(scoping)*
- `source_id` uuid NOT NULL → `entities.id` ON DELETE CASCADE
- `target_id` uuid NOT NULL → `entities.id` ON DELETE CASCADE
- `kind` enum(`hierarchy`,`tag`,`edge`) NOT NULL  *(the discriminator)*
- `label_id` uuid null → `entities.id` ON DELETE SET NULL  *(typed-edge attribute; only
  meaningful when `kind='edge'` — the label that types the connection)*
- `created_at`, `updated_at`

**Direction conventions** (must be documented and enforced, or the table becomes ambiguous):
| `kind` | `source_id` | `target_id` | meaning |
|---|---|---|---|
| `hierarchy` | child thought | parent thought | feed tree: child points at its parent |
| `tag` | thought | label | thought is tagged with label |
| `edge` | node | node | canvas edge, drawn source→target; `label_id` types it |

**Indexes & per-kind invariants** (partial unique indexes are what keep one table from
getting sloppy):
- index on `project_id`, on `(source_id, kind)`, on `(target_id, kind)`, on `label_id`
- `UNIQUE (source_id) WHERE kind='hierarchy'` — a thought has at most one parent
- `UNIQUE (source_id, target_id) WHERE kind='tag'` — a thought can't carry a label twice
- `UNIQUE (source_id, target_id, label_id) WHERE kind='edge'` — no duplicate canvas edges

**Scope note:** `relationships` connects *entities* (project/thought/label nodes) only.
`chunks` are **not** entities (they're a thought's semantic fragments), so they keep their
own `thought_id` FK and do **not** go through this table.

*(There is no separate `thought_labels` table any more — tagging is `kind='tag'` here.)*

**`chunks`** — **REPLACE** *(adds `project_id` for scoping; drops `user_id`)*
- `id` uuid PK, `thought_id` → `thoughts.id` CASCADE
- `project_id` uuid NOT NULL → `entities.id` ON DELETE CASCADE
- `body` text, `chunk_index` integer, `vector_embedding` vector(768)

**Auth / user-scoped tables — KEEP unchanged** (these are not graph nodes; they stay
user-scoped, not project-scoped):
- `users` — **KEEP**
- `credentials` — **KEEP**
- `mcp_auth_codes` — **KEEP**
- `mcp_refresh_tokens` — **KEEP**
- `colors` — **DROP**. A hex is a value, not an entity; normalizing it behind a UUID FK
  costs a join + a find-or-create per write to save 7 bytes. Store the hex inline on the
  thought (§2.2), matching `labels.color`. A "used colors" palette, if ever needed, is a
  `SELECT DISTINCT color` query, not a table.

### 2.3 Tenant isolation (point 3: simplest extensible form)

There are exactly two links between a user and graph data:

- **`project_meta.owner_id → users.id`** — the *only* user↔data link. A project belongs to
  one user (the vertical scope: which user owns the workspace).
- **`entities.project_id → entities.id`** — every node carries its project root's id; a
  project node's `project_id` points at itself (the horizontal scope: everything in one
  workspace shares it). Thoughts/labels inherit `id` from `entities` and read `project_id`
  off that row; `relationships` and `chunks` carry their own `project_id` column for direct
  filtering. No composite FKs.

**How a request is scoped** (e.g. "user U writes in project X"), enforced once in the
projects/workspace services — never scattered per query:

1. **Ownership gate (once per request):** `SELECT owner_id FROM project_meta WHERE id = X`;
   reject if `owner_id ≠ U`. This single check *is* the tenant boundary.
2. **Scoped access:** everything after the gate filters by / writes `project_id = X`. No
   per-row user check is needed — membership in the project is the authorization.

**Cross-project edge invariant:** because a `relationship` joins two arbitrary entities,
every relationship write asserts `source.project_id == target.project_id == X`. This is the
guarantee v1 pushed into composite FKs; we enforce it at the single service chokepoint
instead. Extensible: composite FKs can be layered on later without changing this model.

### 2.4 Create-project flow

Creating a project is a single transaction:
1. `INSERT entities (id=X, project_id=X, type='project')` *(self-reference makes X its own root)*
2. `INSERT project_meta (id=X, owner_id=caller, name, …)`

Creating a thought/label is the same two-step (entity row + subtype row) in a transaction,
with `project_id` set to the target project's id.

---

## 3. Validation (drizzle-zod)

**REPLACE** the current `class-validator` DTOs with drizzle-zod schemas. Three layers,
each doing only what it is good at:

1. **Boundary (Zod):** `createInsertSchema(table)` gives a base schema inferred from the
   table shape; `.extend()/.refine()/.superRefine()` add *intrinsic* business rules
   (non-empty trimmed title, hex regex, `source_id !== target_id`, length caps). Because
   a create-thought request spans two tables, the request schema is *composed* from the
   `entities` + `thoughts` inferred schemas — it is not a raw single-table insert schema.
   Enforced by a NestJS `ZodValidationPipe`.
2. **Service:** stateful checks that need the DB — ownership/tenant, `parent_id` exists in
   the same project, uniqueness. These cannot live in Zod (async, stateful) and must not.
3. **Postgres:** FK / NOT NULL / unique constraints as the final backstop.

drizzle-zod keeps layer 1 auto-synced to the schema. It does **not** replace layers 2–3.

---

## 4. Module architecture (NestJS)

| Module | Disposition | Responsibility |
|---|---|---|
| `DatabaseModule` | **KEEP** | Global Drizzle client / pool. |
| `AuthModule` | **KEEP** | Google OAuth, JWT, MCP token strategies & guards, `credentials`, `mcp_auth_codes`, `mcp_refresh_tokens`. |
| `UsersModule` | **NEW** | Profile CRUD over `users` (split out of auth). |
| `ProjectsModule` | **NEW** | `project_meta` CRUD + visibility; owns the create-project transaction (entity root + meta). Left sidebar. |
| `WorkspaceModule` | **NEW (umbrella)** | Bundles the volatile graph domain — see below. |
| `ColorsModule` | **DROP** | Color becomes a field on the thought; set/clear is an ordinary thought update handled in the workspace `thoughts` service. |
| `InternalMcpModule` | **KEEP (rewired)** | The controllers the sidecar calls; now delegates to projects/workspace services. `set-thought-color`/`clear-thought-color` call the thoughts service. |
| `McpEventsModule` | **REPLACE** | Absorbed into the workspace gateway (§5). |

**`WorkspaceModule` internals:**
- `thoughts/` — **REPLACE** (existing thoughts module, adapted to the subtype schema)
- `labels/` — **KEEP** logic, relocated under workspace
- `relationships/` — **NEW** (the unified edge table: hierarchy, tags, and canvas edges;
  enforces kind-specific endpoint-type rules — e.g. `tag` requires a label target — since
  those are stateful entity-type lookups they live in this service, not in Zod)
- `pipeline/` — **KEEP** logic, relocated: `chunking.service`, `embedding.service`
  (today top-level modules, folded in here as the async vector pipeline)
- `gateway/` — **NEW** `workspace.gateway` (§5)
- `validation/` — **NEW** drizzle-zod schemas + refinements (§3)

**Schema location:** the Drizzle schema is *not* owned by `workspace`. Because `users`,
`credentials`, and the MCP-token tables are shared (not workspace-specific) and Drizzle
needs one unified schema graph passed to `drizzle()`, all table definitions live under the
global **`database/schema/`** directory (a folder of per-table files + an `index.ts`
barrel) that replaces today's single `database/schema.ts`. Every module imports table
definitions from there.

Rationale for the umbrella: thoughts ⇄ labels ⇄ relationships ⇄ chunks reference each
other constantly. As separate modules that means a web of cross-module imports and
circular-dependency friction; as one domain module with internal sub-services it stays
decoupled at the seams that matter (auth, projects, users, database) without ceremony
inside the domain.

---

## 5. Real-time (workspace gateway)

**REPLACE** `mcp-events`. Today `McpEventsService` is a per-user RxJS `Subject` → SSE bus
that `InternalMcpController` pushes to *after AI mutations only*, so the web UI refreshes
when an agent changes data. The redesign **keeps that per-user-bus pattern** but
generalizes it: every mutation (human edit *and* AI edit) publishes a typed event, so the
feed and canvas panels stay in sync regardless of source.

- Keep: per-user event bus, heartbeat, SSE transport (it already works and is auth-simple).
- Change: the publisher moves from the internal-MCP controller into the workspace services
  (thoughts/labels/relationships), so a single emit covers both UI- and MCP-originated writes.
- Event payload gains `source: 'user' | 'mcp'` and the entity `type`/ids already present.
- WebSockets are **not** adopted now — SSE + REST writes is sufficient for one-way panel
  sync and avoids socket auth complexity. Revisit only if we need client→client presence.

---

## 6. MCP sidecar — **KEEP (already matches the target)**

`apps/mcp` already is what v1 described as the goal: a pure protocol translator with no DB
access that forwards `tools/call` to internal NestJS controllers over HTTP
(`apps/mcp/src/main.ts`, `api-client.ts`). No structural change.

- The sidecar's calls into `/api/internal/mcp/*` stay the same contract; only the API-side
  handlers are rewired to the new projects/workspace services.
- **NEW (later, optional):** `create_relationship` / `list_relationships` tools once the
  edges table lands, so agents can build canvas edges, not just hierarchy + tags.

---

## 7. Target repository tree

```
apps/
  api/
    src/
      app.module.ts                       # KEEP (rewired imports)
      database/                           # KEEP
        database.module.ts                # KEEP
        database.service.ts               # KEEP (points at schema/ barrel)
        schema/                           # REPLACE (was single schema.ts)
          index.ts                        #   barrel re-exporting every table + relations
          entities.schema.ts              #   NEW
          project-meta.schema.ts          #   REPLACE
          thought.schema.ts               #   REPLACE
          label.schema.ts                 #   REPLACE
          relationship.schema.ts          #   NEW
          chunk.schema.ts                 #   REPLACE
          users.schema.ts                 #   KEEP (users, credentials)
          mcp-tokens.schema.ts            #   KEEP (mcp_auth_codes, mcp_refresh_tokens)
      auth/                               # KEEP (+ credentials, mcp token tables)
      users/                              # NEW
      projects/                           # NEW  (project_meta, create-project txn)
      internal-mcp/                       # KEEP (rewired to new services)
      workspace/                          # NEW umbrella
        workspace.module.ts
        thoughts/                         # REPLACE
        labels/                           # KEEP (relocated)
        relationships/                    # NEW
        pipeline/                         # KEEP (relocated: chunking, embedding)
        gateway/                          # NEW (replaces mcp-events)
        validation/                       # NEW (drizzle-zod + refinements)
  mcp/                                    # KEEP (already the target design)
  web/                                    # (out of scope for this plan)
```

---

## 8. Build order (suggested)

1. New schema in `database/schema/` (entities, subtypes, relationships, chunks) +
   regenerate Drizzle migrations against a fresh DB.
2. `DatabaseModule` stays; wire schema.
3. `UsersModule` + `ProjectsModule` (create-project transaction).
4. `WorkspaceModule`: thoughts → labels → relationships → pipeline.
5. `validation/` drizzle-zod schemas; swap in `ZodValidationPipe`; delete class-validator DTOs.
6. `gateway/`; move event emits into workspace services; delete `mcp-events`.
7. Rewire `internal-mcp` controllers to the new services; run the existing MCP tool tests.

---

## 9. Settled decisions

1. **`owner_id` stays on `project_meta` only — not denormalized onto `entities`.** The
   user-level query that matters ("list my projects") is served directly by
   `project_meta.owner_id`; within a project everything filters by `project_id`.
   Denormalizing would only fold the ownership gate into the data query (a marginal saving
   — cache the owner in request context if it ever runs hot) while making project ownership
   transfer a bulk update of every node and adding a standing consistency burden. Normalized
   wins on both simplicity and mutability.
```
