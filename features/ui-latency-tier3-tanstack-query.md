# Feature: UI latency — Tier 3: TanStack Query data layer

**Status:** implemented 2026-07-13 — see Outcome at the bottom
**Created:** 2026-07-13
**Why:** The hand-rolled hooks ([useThoughts](../apps/web/src/hooks/useThoughts.ts),
[useLabels](../apps/web/src/hooks/useLabels.ts), [useProjects](../apps/web/src/hooks/useProjects.ts))
re-implement caching, cross-component sync (two ad-hoc buses: `thoughtsEvents` +
`labels-changed` window events), and refetching — badly: every mutation blocks on the
network RTT, then triggers ~6 redundant GETs via a blanket "something changed" broadcast.
TanStack Query replaces all of that with a shared cache, targeted invalidation, request
dedupe, and first-class optimistic mutations with rollback.

**Relationship to other tiers:** standalone — does **not** require
[Tier 1](ui-latency-tier1-optimistic-mutations.md) or
[Tier 2](ui-latency-tier2-refetch-reduction.md); it *supersedes* both (delivers optimistic
updates via `useMutation` and kills the refetch storm via invalidation scoping). The two
backend items from those tiers are transport-level wins that help any client, so they're
folded in here as §1 (do them regardless).

## Current architecture (what gets replaced)

```
component → useThoughts/useLabels/useProjects (useState + fetch-on-mount)
          → mutation fns: await pbApi call → hand-patch useState
          → notifyThoughtsChanged() → every subscribed hook refetches everything
SSE (useWorkspaceEvents) → mcp-sourced events → same blanket notify
```

Per-hook-instance state means the same data is fetched once per mounted instance
(`useLabels` is mounted by both LabelPicker and RelationshipsDialog), and the buses exist
only to paper over the lack of a shared cache.

## Design decisions

1. **Library:** `@tanstack/react-query` v5 (`QueryClientProvider` in
   [main.tsx](../apps/web/src/main.tsx)). Devtools in dev only.
2. **Query keys** (single source of truth, `lib/queryKeys.ts`):
   - `['projects']`
   - `['workspace', projectId]` — the whole per-project workspace as **one query**
     (thoughts + relationships + labels). One query, not four: the client-side joins in
     `useThoughts.fetchAll` need all pieces at once, they invalidate together (a
     relationship create changes thought `parentId`s), and one key keeps invalidation
     dead simple. Revisit only if profiling shows over-invalidation hurts.
3. **Keep the hooks' external API.** `useThoughts(projectId)` still returns
   `{ thoughts, edgeRelationships, loading, createThought, updateThought, setThoughtColor,
   removeThought, refresh }` — internally `useQuery(['workspace', projectId], select: ...)`
   + `useMutation`s. Components ([HomePage](../apps/web/src/components/HomePage.tsx),
   [ThoughtsList](../apps/web/src/components/ThoughtsList.tsx), LabelPicker,
   RelationshipsDialog) change minimally or not at all.
4. **Optimistic writes via cache, not invalidation.** Mutations use
   `onMutate` (cancel queries → snapshot → `setQueryData` patch) /
   `onError` (restore snapshot) / `onSettled` (no-op for self-writes — the optimistic
   patch already matches what the server did; invalidate only where the server generates
   data the client can't know). Client-generated UUIDs (§1) make the patch exact.
5. **SSE becomes targeted invalidation.** `useWorkspaceEvents` maps mcp-sourced events →
   `queryClient.invalidateQueries(['workspace', event.projectId])` (or `['projects']`),
   replacing both ad-hoc buses.
6. **Sane defaults:** `staleTime: 30s`, `refetchOnWindowFocus: true`,
   `retry: 1` for queries / `retry: 0` for mutations. SSE already covers external
   changes, so aggressive refetching buys nothing.

## Delivery steps

Work top-to-bottom; each step leaves the app runnable. Steps 3–6 migrate one domain at a
time — the old buses keep working for not-yet-migrated hooks until §7 removes them.

### 1. Backend enablers (client-independent; do first)
- [ ] `createThoughtSchema` ([thought.schema.ts](../apps/api/src/workspace/validation/thought.schema.ts)):
      optional `id: z.string().uuid()` + `parentId: z.string().uuid()`.
      `ThoughtsService.create` uses `dto.id ?? crypto.randomUUID()`
      ([thoughts.service.ts:25](../apps/api/src/workspace/thoughts/thoughts.service.ts#L25))
      and, when `parentId` present, inserts the hierarchy relationship **in the same
      transaction**, returning `parentRelationshipId` with the row. Duplicate id (23505)
      → 409 via the `DrizzleQueryError` cause-chain walk RelationshipsService uses.
- [ ] Same optional client `id` on relationship + label create (the dialog and
      LabelPicker then get exact optimistic patches too).
- [ ] `GET /api/workspace/snapshot?projectId=` → `{ thoughts, relationships, labels }`
      from one `db.asUser` transaction. This is the `['workspace', projectId]` query fn.
- **Check:** API tests — create-with-parent atomicity, client-id round-trip, duplicate-id
  409, snapshot equals the 3 individual endpoints, cross-tenant snapshot returns empties.

### 2. Query infrastructure
- [ ] `npm i @tanstack/react-query` (+ devtools, dev-only import) in `apps/web`.
- [ ] `QueryClientProvider` in [main.tsx](../apps/web/src/main.tsx) with the §6 defaults.
- [ ] `lib/queryKeys.ts` with the two key factories; `pbApi.snapshotApi.get(projectId)`.
- **Check:** app builds and runs unchanged (nothing consumes it yet).

### 3. Migrate reads
- [ ] `useThoughts`: replace `useState`/`fetchAll` with
      `useQuery({ queryKey: ['workspace', projectId], queryFn: snapshot, enabled: !!projectId })`
      and move the existing join logic (hierarchy map, edge-label map, edge-rel label
      join — [useThoughts.ts:98-129](../apps/web/src/hooks/useThoughts.ts#L98-L129)) into
      a memoized `select`. `loading` = `isPending`, `refresh` = `refetch`.
- [ ] `useLabels` / `useThoughtLabels`: derive from the same `['workspace', projectId]`
      cache with `select` (labels; tag-rels filtered by thoughtId). The double-mount
      duplicate fetch (LabelPicker + RelationshipsDialog) disappears via dedupe.
- [ ] `useProjects`: `useQuery(['projects'])`.
- **Check:** app renders identically; network tab shows exactly 1 snapshot GET + 1
  projects GET per project switch, regardless of how many components mount the hooks.

### 4. Migrate thought mutations (optimistic)
- [ ] `createThought`: client `crypto.randomUUID()`; `onMutate` inserts the full client
      shape (incl. `parentId`/`parentRelationshipId` from the composite create) into the
      snapshot cache; returns the thought synchronously so
      [ThoughtsList.tsx:108-111](../apps/web/src/components/ThoughtsList.tsx#L108-L111)
      can focus the new card instantly. `onError` removes it. No `onSettled` invalidate
      (patch is exact); the fire-and-forget chunk/embed pipeline changes nothing the UI
      shows.
- [ ] `updateThought` / `removeThought` / `setThoughtColor` / `clearColor`: snapshot →
      `setQueryData` patch → rollback on error. Note
      [HomePage.tsx:108](../apps/web/src/components/HomePage.tsx#L108) calls update
      fire-and-forget: errors must surface from inside the mutation (see §8 toast).
- [ ] Concurrent-edit safety: `onMutate` does `cancelQueries(['workspace', projectId])`
      so an in-flight snapshot can't clobber the optimistic patch.
- **Check:** with Slow-3G throttling, create/edit/delete/color all reflect in <50ms;
  kill the API → each mutation rolls back visibly.

### 5. Migrate label + relationship mutations (optimistic)
- [ ] Label CRUD + assign/unassign: `setQueryData` patches on the workspace cache
      (assign = insert tag rel; unassign = remove by relationshipId). Client ids from §1
      make assign exact; otherwise patch the returned id in `onSuccess`.
- [ ] Edge relationships: RelationshipsDialog's add/delete become mutations patching the
      workspace cache; the dialog's `busy`-gated RTT wait and `notifyThoughtsChanged()`
      calls go away. Keep the client-side duplicate pre-check; a raced 409 rolls back
      with the existing inline error.
- [ ] Delete both ad-hoc buses' *usages* in these paths (`labels-changed` window events,
      `notifyThoughtsChanged`).
- **Check:** label chips and dialog rows update instantly; graph edges appear/disappear
  without a refetch (cache patch only).

### 6. Rewire SSE
- [ ] [useWorkspaceEvents.ts](../apps/web/src/hooks/useWorkspaceEvents.ts): on mcp-sourced
      events, `invalidateQueries({ queryKey: event.projectId ? ['workspace', event.projectId] : ['workspace'] })`;
      `project*` events also invalidate `['projects']`. Needs `queryClient` from
      `useQueryClient` — the hook must be rendered inside the provider (it is, via App).
- **Check:** MCP tool creates a thought → browser updates within a beat; a `user`-sourced
  SSE event (own action echo) triggers **no** refetch.

### 7. Delete the old plumbing
- [ ] Remove [thoughtsEvents.ts](../apps/web/src/lib/thoughtsEvents.ts), all
      `labels-changed` window-event code, and any leftover manual `useState` caches in
      the three hooks. Grep for `notifyThoughtsChanged|onThoughtsChanged|labels-changed`
      → zero hits.
- **Check:** typecheck + build clean; no orphaned exports.

### 8. Error surfacing
- [ ] Global mutation error handler on the `QueryClient`
      (`mutationCache: new MutationCache({ onError })`) feeding one small toast/banner
      component (mono font, `var(--surface)`, 1px `var(--border2)` — app chrome
      vocabulary). Rollbacks must be *visible*, not console-only.
- **Check:** API stopped → every mutation type reverts + toasts.

### 9. Verification
- [ ] `npm run build:web` + typecheck; API suite green.
- [ ] Manual latency pass (Slow 3G): full action list — create/edit/delete thought,
      color, label create/assign/unassign, rel add/delete, project rename — all <50ms
      perceived; record before/after request counts in this file.
- [ ] Force-graph stability: self-mutations no longer re-layout the graph (no wholesale
      data replacement).
- [ ] SSE cross-source pass per §6; multi-tab pass (two tabs, same user: tab A's writes
      reach tab B via SSE… only for `mcp` source today — unchanged behaviour, note it).
- [ ] Headless-browser smoke (playwright-core + dev-JWT cookie, as used for the
      knowledge-graph feature): both views render, dialog works.

## Out of scope

- SSE payload-based incremental cache patching (invalidate-and-refetch on MCP events is
  correct and simple; revisit if MCP write volume grows).
- Broadcasting `user`-sourced SSE events to *other* tabs of the same user (server
  behaviour, unchanged).
- LISTEN/NOTIFY cross-instance SSE (separate known issue).
- Offline mutation queueing / retry; persistence (`persistQueryClient`).
- Pagination or partial workspace loading (snapshot is fine at current data sizes).

## Outcome (implemented 2026-07-13, all three tiers landed same day in order)

**What shipped** (deviations from plan are minor):

- API: optional client `id` on thought/label/relationship create, `parentId` composite
  thought-create (hierarchy rel in the same tx, returns `parentRelationshipId`),
  duplicate → 409 via shared [pg-errors.ts](../apps/api/src/database/pg-errors.ts),
  `GET /api/workspace/snapshot` ([snapshot.controller.ts](../apps/api/src/workspace/snapshot.controller.ts)).
- Web: `@tanstack/react-query` v5; [queryClient.ts](../apps/web/src/lib/queryClient.ts)
  (30s staleTime, MutationCache onError → toast), [query-utils.ts](../apps/web/src/hooks/query-utils.ts)
  (`useWorkspaceQuery` + generic `useOptimisticMutation` snapshot/patch/rollback factory).
  All three hooks migrated; external APIs kept, components mostly untouched
  (RelationshipsDialog now takes `onAdd`/`onRemove` from useThoughts; toast stack in Shell).
  Both event buses (`thoughtsEvents`, `labels-changed`) deleted — the shared cache made
  them redundant. SSE → targeted `invalidateQueries`.
- The one client-uninventable field, the composite create's hierarchy-rel id, uses a
  temp id swapped in `onSuccess`.

**Verified** (headless Chrome + dev JWT, local API + Neon):

- Jest: workspace suite green (the one pre-existing failure, `pipeline.service.spec.ts`
  semanticSearch SQL scoping, was a stale test — its SQL-text extraction didn't descend
  into the nested conditional project-filter fragment; fixed same day, service was
  correct); +6 new tests (composite create, client id, dup-409, snapshot controller ×2,
  unscoped search). Builds + tsc clean.
- REST smoke: client-id create, composite create → `parentRelationshipId`, dup → 409,
  bad parent → 400, snapshot returns all three collections in one request.
- Browser drive: project switch = **1 GET** (was 5); thought create = press→card
  **~120 ms** with **1 background POST / 0 GETs** (was 2 blocking POSTs + ~6 GETs).
- Rollback: create POST aborted at the network layer → card reverts, toast
  "Create thought failed — Failed to fetch". Relationships dialog opens and renders.

**Not yet verified** (needs a human/second actor): MCP-sourced SSE → invalidation
refresh in a live browser; Slow-3G feel test; multi-tab behaviour. Pre-existing issue
noticed (untouched): HomePage's render-time auto-select triggers a React
"setState during render" warning — predates this work.
