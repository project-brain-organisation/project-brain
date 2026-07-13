# Feature: UI latency — Tier 2: refetch reduction

**Status:** implemented 2026-07-13, then superseded same-day by
[Tier 3](ui-latency-tier3-tanstack-query.md) — the snapshot endpoint lives on as the
`['workspace', projectId]` query fn; the scoped event buses were deleted entirely once
the shared query cache made them redundant. §3 (merge relationship fetches) was skipped
as moot — §4's snapshot endpoint subsumes it. Measured: project load 5 GETs → 1;
mutations ~6 redundant GETs → 0.
**Created:** 2026-07-13
**Why:** Every mutation in the web app calls `notifyThoughtsChanged()`, which triggers a
full workspace refetch — `useThoughts.fetchAll` fires **5 parallel GETs** (thoughts,
hierarchy rels, tag rels, edge rels, labels) *and* `useProjects` refetches the project
list — even though the mutating hook already patched local state by hand. That's ~6
redundant requests per keystroke-level action, each one its own RLS transaction against
Neon, plus a wholesale `setThoughts` replacement that hands the 3D force graph all-new
object identities.

**Relationship to other tiers:** independent of
[Tier 1 (optimistic mutations)](ui-latency-tier1-optimistic-mutations.md) — this tier
cuts wasted work whether or not mutations are optimistic. **Superseded by
[Tier 3 (TanStack Query)](ui-latency-tier3-tanstack-query.md)**, whose targeted query
invalidation replaces the blanket notify; if Tier 3 is the target (it is, per
2026-07-13 discussion), only the API-side steps here (§3–4) carry over — they help any
client.

## Current behaviour (the problem)

- [thoughtsEvents.ts](../apps/web/src/lib/thoughtsEvents.ts) is a single global "something
  changed" channel. Listeners: `useThoughts` (→ `fetchAll`, 5 GETs) and `useProjects`
  (→ project list GET).
- Every mutation in [useThoughts.ts](../apps/web/src/hooks/useThoughts.ts) (L182, L192,
  L199, L205) and [useProjects.ts](../apps/web/src/hooks/useProjects.ts) (L34, L41, L49,
  L56) fires it **after already updating its own state** — so a thought edit refetches
  the project list, and a project rename refetches the entire workspace.
- [useWorkspaceEvents.ts](../apps/web/src/hooks/useWorkspaceEvents.ts) fires the same
  channel for MCP-sourced SSE events — the one case where refetching is genuinely needed.
- `fetchAll` makes 3 separate calls to the *same endpoint* for the 3 relationship kinds
  ([useThoughts.ts:90-96](../apps/web/src/hooks/useThoughts.ts#L90-L96)); the API's list
  endpoint already returns all kinds when `kind` is omitted
  ([pbApi.ts:125-128](../apps/web/src/lib/pbApi.ts#L125-L128)).
- `useThoughtLabels.assignLabel` ([useLabels.ts:113-123](../apps/web/src/hooks/useLabels.ts#L113-L123))
  awaits a full labels+tag-rels refetch, then dispatches `labels-changed`, which triggers
  a **second identical refetch** in the same hook.

## Design decisions

1. **Self-mutations stop broadcasting.** A hook that just patched its own state doesn't
   need to be told to refetch. The notify channel becomes what it was meant to be:
   cross-source sync (MCP/SSE, RelationshipsDialog writing state owned by `useThoughts`).
2. **Scope the channel.** Split the single `thoughtsEvents` bus into scoped events
   (`workspace-changed` vs `projects-changed`) so a thought edit can never refetch the
   project list. Keep the same tiny pub/sub implementation.
3. **One snapshot request.** Add `GET /api/workspace/snapshot?projectId=` returning
   `{ thoughts, relationships, labels }` from a single `asUser` transaction — 5 requests
   → 1, 5 RLS transactions → 1. The unfiltered-relationships merge (5→3) is the zero-API
   fallback if the endpoint is deferred.
4. **Don't touch SSE semantics.** MCP-sourced events keep triggering a full refetch —
   correctness first; SSE payload-based patching is out of scope.

## Delivery steps

Work top-to-bottom; each step leaves the app runnable.

### 1. Scope the event bus
- [ ] Extend [thoughtsEvents.ts](../apps/web/src/lib/thoughtsEvents.ts) to two channels:
      `notifyWorkspaceChanged()` / `onWorkspaceChanged()` (thoughts + rels + labels) and
      `notifyProjectsChanged()` / `onProjectsChanged()`. Keep old names as aliases during
      the migration, delete at the end of this step.
- [ ] `useThoughts` subscribes to workspace only; `useProjects` to projects only.
- [ ] [useWorkspaceEvents.ts](../apps/web/src/hooks/useWorkspaceEvents.ts): map SSE event
      types → the right channel (`project*` → projects, everything else → workspace;
      keep the existing `labels-changed` window event dispatch).
- **Check:** MCP-sourced thought create still live-refreshes the graph; MCP project
  create still refreshes the sidebar list.

### 2. Stop self-notify after local mutations
- [ ] Remove `notifyThoughtsChanged()` from `useThoughts.updateThought`,
      `setThoughtColor`, `removeThought` — their `setThoughts` patch is already complete.
- [ ] `createThought`: state patch is complete too (builds the full client shape) —
      remove the notify. If anything still depends on a post-create refetch (e.g.
      `createdAt` is empty in the client shape, [useThoughts.ts:70](../apps/web/src/hooks/useThoughts.ts#L70)),
      note it here rather than keeping the blanket refetch — nothing renders
      `createdAt` today.
- [ ] `useProjects`: `createProject` / `renameProject` / `setProjectColor` /
      `removeProject` stop notifying the workspace channel entirely; they patch their
      own list. Exception: `removeProject` **should** notify workspace (cascade deletes
      the project's thoughts; `useThoughts` may be mounted on it — though HomePage
      switches `selectedRootId` away, which already refetches via the `projectId` dep).
      Verify and keep only what's needed.
- [ ] [RelationshipsDialog.tsx](../apps/web/src/components/RelationshipsDialog.tsx)
      (L77, L89): keeps notifying workspace — it mutates relationship state owned by
      `useThoughts` and has no setter of its own. (If Tier 1 landed, its
      `createEdgeRelationship`/`removeEdgeRelationship` hook functions patch state
      directly and the notify goes away.)
- **Check:** network tab shows **zero** GETs after editing/deleting/creating a thought,
  changing colors, renaming projects; exactly one workspace refetch after a dialog
  relationship add/delete.

### 3. Merge the relationship fetches (zero-API fallback for §4)
- [ ] `fetchAll`: replace the 3 kind-filtered `relationshipsApi.listByProject` calls with
      one unfiltered call; partition by `kind` client-side. 5 GETs → 3.
- **Check:** hierarchy parents, edge-label chips, and graph edges all render as before.

### 4. Workspace snapshot endpoint (optional but recommended)
- [ ] API: `GET /api/workspace/snapshot?projectId=` → `{ thoughts, relationships, labels }`
      in one `db.asUser` transaction (3 selects, one round-trip session to Neon). New
      thin controller/service in workspace module; Zod-validate the query param;
      RLS scopes everything, same as the individual endpoints.
- [ ] Web: `pbApi.snapshotApi.get(projectId)`; `fetchAll` becomes one request.
- [ ] `useThoughtLabels.fetchThoughtLabels` can reuse it or keep its 2 calls — its
      double-fetch is fixed in §5 regardless.
- **Check:** API test (snapshot matches the 3 individual endpoints for a seeded
  project; cross-tenant returns empty arrays); devtools shows 1 GET per workspace load.

### 5. Fix the assignLabel double-fetch
- [ ] [useLabels.ts:113-123](../apps/web/src/hooks/useLabels.ts#L113-L123): drop the
      explicit `await fetchThoughtLabels()` — the `labels-changed` dispatch on the next
      line already triggers exactly that refetch via the listener (L105-L111). One
      refetch, not two.
- **Check:** assigning a label fires one labels GET + one tag-rels GET, not two of each.

### 6. Verification
- [ ] `npm run build:web` + typecheck; API suite green (if §4 landed).
- [ ] Manual pass, network tab open: baseline action list (create/edit/delete thought,
      color, label assign/unassign, rel add/delete, project rename) — record request
      counts before/after in this file.
- [ ] SSE cross-source pass: MCP tool create → browser updates; force-graph doesn't
      visibly re-layout on self-mutations anymore (object identities preserved because
      no wholesale `setThoughts` refetch).

## Out of scope

- Optimistic mutations (mutations still await before patching state) → Tier 1.
- Query caching / dedupe / library adoption → Tier 3.
- SSE payload-based incremental patching (refetch-on-MCP-event stays).
- LISTEN/NOTIFY cross-instance SSE (tracked in `project_sse_live_updates` memory /
  known-issues review).
