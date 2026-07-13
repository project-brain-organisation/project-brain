# Feature: UI latency — Tier 1: optimistic mutations

**Status:** implemented 2026-07-13, then superseded same-day by
[Tier 3](ui-latency-tier3-tanstack-query.md) — the API enablers (client ids, composite
create, 409 mapping) live on; the useState-based optimistic hooks were replaced by
TanStack Query cache patches. See Tier 3's Outcome for verification.
**Created:** 2026-07-13
**Why:** Most mutations in the web app `await` the network round trip before updating
local state, so every button press stalls for the full API+Neon RTT (hundreds of ms
against Railway). `setThoughtColor` and `setProjectColor` already do it the right way —
state first, network after — and feel instant. This tier extends that pattern to all
frequent mutations.

**Relationship to other tiers:** independent of
[Tier 2 (refetch reduction)](ui-latency-tier2-refetch-reduction.md) — both can land in
either order. **Superseded by [Tier 3 (TanStack Query)](ui-latency-tier3-tanstack-query.md)**,
which delivers the same optimistic behaviour through `useMutation`; if Tier 3 is the
target (it is, per 2026-07-13 discussion), skip this tier unless a quick interim win is
wanted.

## Current behaviour (the problem)

In [useThoughts.ts](../apps/web/src/hooks/useThoughts.ts):

- `createThought` (L147): `await` POST /thoughts → `await` POST /relationships
  (hierarchy edge) → *then* insert into state. Two **sequential** RTTs before the new
  card appears — the most common action in the app pays double latency.
- `updateThought` (L186): `await` PATCH → then patch state.
- `removeThought` (L202): `await` DELETE → then filter state.
- `setThoughtColor` (L196): **already optimistic** — the template to copy.

In [useLabels.ts](../apps/web/src/hooks/useLabels.ts):

- `assignLabel` (L113): `await` create rel → `await` full `fetchThoughtLabels()` refetch
  → dispatch `labels-changed` (which triggers *another* identical refetch).
- `unassignLabel` (L125): already state-first after the await — make fully optimistic.
- `createLabel` / `updateLabel` / `removeLabel`: all await-first.

In [RelationshipsDialog.tsx](../apps/web/src/components/RelationshipsDialog.tsx):
`handleAdd` / `handleDelete` await, then `notifyThoughtsChanged()`. The dialog's `busy`
state blocks the Add button for the whole RTT.

Server fact that shapes the design: thought ids are `crypto.randomUUID()` generated in
[thoughts.service.ts:25](../apps/api/src/workspace/thoughts/thoughts.service.ts#L25) — the
client cannot know the id of a created thought until the response arrives, and
[ThoughtsList.tsx:108-111](../apps/web/src/components/ThoughtsList.tsx#L108-L111) needs
that id immediately to focus the new blank card.

## Design decisions

1. **Client-supplied UUIDs for creates** (small API addition) rather than temp-id
   reconciliation. The PKs are uuids; letting the client send one kills the whole
   "swap temp id for real id" problem (selection state, React keys, force-graph node
   identity all stay stable). Temp-id reconciliation is the fallback if we want this
   strictly frontend-only.
2. **Composite create**: `POST /api/workspace/thoughts` accepts an optional `parentId`,
   creating the hierarchy relationship in the same transaction. Collapses create's two
   sequential RTTs into one *and* removes the failure mode where the thought lands but
   the hierarchy edge doesn't.
3. **Rollback on error**: every optimistic mutation snapshots the previous state and
   restores it in `catch`, then surfaces the error (console + the small toast pattern
   below). No silent divergence from the server.
4. Keep the existing `notifyThoughtsChanged()` calls as-is — removing the redundant
   refetches is Tier 2's job. Optimistic state + a trailing refetch coexist fine (the
   refetch merely confirms).

## Delivery steps

Work top-to-bottom; each step leaves the app runnable.

### 1. API — client id + parentId on thought create
- [ ] Extend `createThoughtSchema`
      ([thought.schema.ts](../apps/api/src/workspace/validation/thought.schema.ts)) with
      optional `id: z.string().uuid()` and `parentId: z.string().uuid()`.
- [ ] `ThoughtsService.create`: use `dto.id ?? crypto.randomUUID()`; when `parentId` is
      present, insert the hierarchy relationship inside the same `asUser` transaction
      (reuse the same-project validation RelationshipsService does; RLS covers ownership).
      Return the relationship id alongside the thought row (extend the response shape:
      `{ ...thought, parentRelationshipId }` or a wrapper — pick whichever keeps the
      existing response backward-compatible).
- [ ] Duplicate-id insert (23505 on entities PK) → 409, walking the `DrizzleQueryError`
      cause chain like RelationshipsService does.
- **Check:** API tests for create-with-parent (rel row exists, same tx), create with
  client id (row has that id), duplicate id → 409. Existing thoughts suite green.

### 2. useThoughts — optimistic create
- [ ] `createThought`: generate `crypto.randomUUID()` client-side, build the `Thought`
      object locally, `setThoughts` immediately, return it synchronously to the caller
      (keep the async signature). Fire `thoughtsApi.create({ id, parentId, ... })` in the
      background; on failure remove the optimistic thought and surface the error.
- [ ] Update `pbApi.ts` `CreateThoughtInput` with `id` / `parentId`; drop the separate
      `relationshipsApi.create` call from the hook.
- [ ] Patch in `parentRelationshipId` from the response when it resolves (needed later
      for unparenting; it's the only field the client can't invent).
- **Check:** new card appears instantly and is focused for editing
  ([ThoughtsList.tsx:107](../apps/web/src/components/ThoughtsList.tsx#L107) path);
  kill the API mid-create → card disappears + error surfaced.

### 3. useThoughts — optimistic update/remove
- [ ] `updateThought`: snapshot prev thought → patch state → PATCH in background →
      rollback on error. (Note [HomePage.tsx:108](../apps/web/src/components/HomePage.tsx#L108)
      already calls it fire-and-forget, so errors must be handled *inside* the hook.)
- [ ] `removeThought`: snapshot → filter state → DELETE in background → restore on error.
- [ ] `setThoughtColor`: add the missing rollback (it's optimistic today but never
      reverts on failure).
- **Check:** edits/deletes reflect instantly; with the API stopped, state reverts and an
  error is shown.

### 4. useLabels / useThoughtLabels — optimistic label ops
- [ ] `assignLabel`: build the `ThoughtLabel` locally from the already-loaded label,
      update state immediately, create the rel in background, patch in `relationshipId`
      from the response (needed for unassign; block unassign of a still-pending
      assignment or queue it behind the create promise). Drop the full
      `fetchThoughtLabels()` await; keep the single `labels-changed` dispatch.
- [ ] `unassignLabel` / `createLabel` / `updateLabel` / `removeLabel`: state-first with
      rollback, same pattern.
- **Check:** label chips toggle instantly in LabelPicker; edge-label changes reflect in
  the graph after the trailing refetch.

### 5. RelationshipsDialog — optimistic add/delete
- [ ] `handleAdd`: dialog owns no rel state ([RelationshipsDialog.tsx](../apps/web/src/components/RelationshipsDialog.tsx)
      renders `edgeRels` from props), so optimism lives in `useThoughts`: add
      `createEdgeRelationship` / `removeEdgeRelationship` functions there that update
      `edgeRelationships` state optimistically (client uuid for the rel id is *not*
      needed — the dialog only deletes by id, so patch the real id in on response, or
      have the API accept a client id like step 1). Dialog calls those instead of
      `relationshipsApi` directly, clears its selects immediately, drops `busy` gating
      on the whole RTT. Keep the client-side duplicate check (it already pre-empts the
      409).
- [ ] Rel delete: optimistic removal from `edgeRelationships` + rollback.
- **Check:** added rel appears in the list and as a graph edge immediately; 409 from a
  race (dup created via MCP) rolls back with the inline error.

### 6. Error surfacing
- [ ] Minimal toast/banner for rolled-back mutations (there is currently no global error
      UI; console-only is not acceptable once errors happen *after* the user moved on).
      One small fixed-position component in [Shell](../apps/web/src/components/Shell.tsx)
      or App level, fed by a tiny module-level pub/sub like
      [thoughtsEvents.ts](../apps/web/src/lib/thoughtsEvents.ts). Style per app chrome
      (mono font, `var(--surface)`, 1px `var(--border2)`).
- **Check:** stop the API, perform each mutation type → every one reverts + toasts.

### 7. Verification
- [ ] `npm run build:web` + typecheck clean; API suite green.
- [ ] Manual latency pass with devtools throttling (Slow 3G): create / edit / delete /
      label / relationship all update the UI in <50ms perceived.
- [ ] Offline-rollback pass per step 6.
- [ ] MCP-sourced SSE refresh unregressed (create a thought via MCP tool → appears
      without interaction).

## Out of scope

- Removing the redundant post-mutation refetches → Tier 2.
- Query caching / dedupe / library adoption → Tier 3.
- Offline queueing or retry of failed mutations (rollback only).
- Optimistic project create/rename/delete (rare actions; `setProjectColor` is already
  optimistic).
