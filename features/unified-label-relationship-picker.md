# Feature: Unified label + relationship picker

**Status:** implemented 2026-07-15 — typecheck clean; manual/app verification pending
**Created:** 2026-07-14
**Why:** The label picker and the relationships dialog are two disconnected flows for what
is really one concept — attaching a labelled connection to a thought. A *tag* label is
"this thought is X"; an *edge* label is "this thought relates to that thought via X". Today
you assign tags in the thought's LabelPicker, but to create an edge relationship you must
open the separate RelationshipsDialog and re-pick the source thought you were already
looking at. This feature folds edge-relationship creation into the thought's own
LabelPicker so both live in one place, and fixes the surprising "click = instant assign"
behaviour along the way.

## Scope

Frontend-only (`apps/web`). No API or schema changes — every mutation this needs already
exists:

- Tag assign/unassign: `useThoughtLabels().assignLabel / unassignLabel`
  ([useLabels.ts:106-137](../apps/web/src/hooks/useLabels.ts#L106-L137)).
- Edge relationship create: `useThoughts().createEdgeRelationship(sourceId, targetId, label)`
  ([useThoughts.ts:241-251](../apps/web/src/hooks/useThoughts.ts#L241-L251)).
- `label.isEdge` and the edge toggle already exist in LabelPicker
  ([LabelPicker.tsx:113-116](../apps/web/src/components/LabelPicker.tsx#L113-L116)).

Both hooks read the same shared `['workspace', projectId]` snapshot cache, so pulling
thoughts + `createEdgeRelationship` into the picker costs no extra fetch.

## Current behaviour (what changes)

1. **Click-to-assign.** Clicking an existing label card calls `handleSelect` which assigns
   the label and closes the dialog immediately
   ([LabelPicker.tsx:69-77](../apps/web/src/components/LabelPicker.tsx#L69-L77), invoked at
   [:171](../apps/web/src/components/LabelPicker.tsx#L171)). There is no "select then
   confirm" step; the only explicit **Add** button belongs to the *new-label* card
   ([:226](../apps/web/src/components/LabelPicker.tsx#L226)).
2. **Edge toggle does nothing but flip a flag.** The triangle toggle only sets
   `label.isEdge` ([:113-116](../apps/web/src/components/LabelPicker.tsx#L113-L116)); the
   picker has no concept of a relationship target.
3. **Edge relationships are created elsewhere** — in `RelationshipsDialog`, whose target
   picker is the model we replicate
   ([RelationshipsDialog.tsx:141-152](../apps/web/src/components/RelationshipsDialog.tsx#L141-L152)).

## Target behaviour

### 1. Select-before-Add

Clicking a label card **selects** it (visual highlight) instead of assigning it. A single
primary **Add** button commits the current selection. Nothing is written to the workspace
until Add is pressed.

- New `selectedLabelId` state.
- `handleSelect` becomes "set selection", not "assign + close".
- The `editingLabelId` reassign path (clicking the `+`/chip on the card opens the picker to
  swap a label) is preserved: on **Add**, if `editingLabelId` is set, unassign it first,
  then assign the newly selected label — the current logic at
  [:70-76](../apps/web/src/components/LabelPicker.tsx#L70-L76), just moved behind Add.
- "None (remove label)" keeps working as an immediate action (it has no target to pick).
- Add is disabled when no label is selected.

### 2. Inline target picker for edge labels

When the selected label **is an edge label** (`isEdge === true`), render a target-node
`<select>` **inside that label's row, between the label name and the edge toggle button**.
It is the same control as the RelationshipsDialog target picker:

- Options = all thoughts in the project, sorted by display name, self excluded
  (`disabled` / filtered on `sourceThoughtId`). Reuse the `thoughtName()` helper and the
  sort from [RelationshipsDialog.tsx:20-40](../apps/web/src/components/RelationshipsDialog.tsx#L20-L40)
  — extract it to a small shared module (e.g. `apps/web/src/lib/thoughtName.ts`) rather than
  duplicating.
- New `targetId` state, reset whenever the selection changes.
- **Add is greyed out until a target is chosen** for edge labels (`disabled={!targetId}`).

On **Add** with an edge label selected:
`createEdgeRelationship(sourceThoughtId, targetId, { id, name, color })`, then close.
On **Add** with a tag (non-edge) label selected: `assignLabel(labelId)` as today, then close.

Guard against duplicates the same way RelationshipsDialog does (unique
`source+target+label`): block Add / show a hint if the edge relationship already exists
(compare against `edgeRelationships` from `useThoughts`), mirroring
[RelationshipsDialog.tsx:46-53](../apps/web/src/components/RelationshipsDialog.tsx#L46-L53).

### 3. New-label card

Keep the new-label create row. Its **Add** now creates the label and *selects* it (does not
close). Because a freshly created label is never an edge label (`isEdge:false`,
[useLabels.ts:46](../apps/web/src/hooks/useLabels.ts#L46)), the create → select → Add flow
stays a single obvious tag path. (Alternatively keep create+assign+close — see Open
decisions.)

## Data flow / wiring

`LabelPicker` needs three new inputs. Recommended: pass the source thought id as a prop and
pull the rest from hooks the picker already mirrors.

- **Prop** `sourceThoughtId: string` from `ThoughtCard` (`thought.id`,
  [ThoughtCard.tsx:182-190](../apps/web/src/components/ThoughtCard.tsx#L182-L190)).
- Inside LabelPicker: `const { thoughts, edgeRelationships, createEdgeRelationship } =
  useThoughts(selectedRootId)` — mirrors the existing `useLabels(selectedRootId)` call at
  [LabelPicker.tsx:27-28](../apps/web/src/components/LabelPicker.tsx#L27-L28).

No change to `ThoughtCard`'s hooks beyond passing the id.

## Files to touch

- [apps/web/src/components/LabelPicker.tsx](../apps/web/src/components/LabelPicker.tsx) —
  selection state, inline target `<select>`, Add-gating, edge-vs-tag commit, duplicate guard.
- [apps/web/src/components/LabelPicker.css](../apps/web/src/components/LabelPicker.css) —
  selected-card highlight, inline select layout within `.lp-card`, footer Add button styling.
- [apps/web/src/components/ThoughtCard.tsx](../apps/web/src/components/ThoughtCard.tsx) —
  pass `sourceThoughtId={thought.id}`.
- New `apps/web/src/lib/thoughtName.ts` (+ import in RelationshipsDialog) — shared
  `thoughtName()` + sorted-thoughts helper.

## Checklist

- [x] Extract `thoughtName()` to a shared module; RelationshipsDialog imports it.
- [x] LabelPicker: add `sourceThoughtId` prop; call `useThoughts(selectedRootId)`.
- [x] LabelPicker: `selectedLabelId` + `targetId` state; `handleSelect` sets selection
      instead of assigning; reset `targetId` on selection change.
- [x] LabelPicker: render target `<select>` below the selected edge label's row.
- [x] LabelPicker: single footer Add button — disabled unless (label selected) AND (tag, OR
      edge with a target chosen and not a duplicate).
- [x] LabelPicker: Add commits — edge → `createEdgeRelationship`; tag → `assignLabel`
      (with `editingLabelId` unassign-first preserved); then `onClose()`.
- [x] "None (remove label)" and the new-label create row still work.
- [x] Edge-relationship chips on the thought card with navigating target chip.
- [x] Remove label co-occurrence edges from NetworkView; drop dead `edgeLabels`.
- [x] CSS: selected-card highlight; below-row target select; edge chips; theme-aware.
- [ ] Verify in the running app: select a tag label → Add assigns it; toggle a label to
      edge → target dropdown appears below the row, Add stays greyed until a target is
      picked, Add creates the edge relationship and it shows on the card + graph; duplicate
      edge is blocked.

## Resolved decisions (confirmed 2026-07-15)

1. **One primary Add button** in the picker footer commits the current selection. Selecting
   a label just highlights it; the new-label row's button is now **Create** (creates +
   selects, stays open) so there is exactly one "Add".
2. **Edge relationships now appear as chips** on the thought card: the edge-label chip plus
   a secondary **target chip** that navigates to the target thought (`onNavigate`).
   `useThoughtLabels` gained an `edgeRelationships` view (outgoing `kind='edge'` rels joined
   with target name) for this. Clicking the edge-label chip opens the picker in an edit mode
   (`editingEdgeRelId`) that offers a **Remove relationship** action
   (`removeEdgeRelationship`); the target chip navigates instead.
3. **Label co-occurrence edges removed.** This feature replaces the old behaviour where
   NetworkView drew edges between thoughts sharing an `isEdge` label. That block is gone from
   [NetworkView.tsx](../apps/web/src/components/NetworkView.tsx), and the now-dead
   `Thought.edgeLabels` derivation was cleaned out of
   [useThoughts.ts](../apps/web/src/hooks/useThoughts.ts) (+ its default in HomePage).
4. **Target picker placement & visibility** — sits **below** the label row (full width),
   not inline between the name and buttons, and is shown for **every** edge label at all
   times (not only the selected one). Each edge label keeps its own chosen target
   (`targetByLabel` map); choosing a target selects that label so the single Add commits it.

## Delivered surface

- `apps/web/src/lib/thoughtName.ts` (new) — shared display-name helper; RelationshipsDialog
  and useLabels both use it.
- `LabelPicker.tsx` / `.css` — `sourceThoughtId` prop; `useThoughts(selectedRootId)`;
  select-before-Add with `selectedLabelId`/`targetId`; inline (below-row) target `<select>`
  for the selected edge label; single footer **Add** gated by `canAdd` (tag: not already
  assigned / editing; edge: target chosen and not a duplicate).
- `ThoughtCard.tsx` / `.css` — passes `sourceThoughtId`; renders edge-relationship chips
  with a navigating target chip.
- `useLabels.ts` — `ThoughtEdge` type + `edgeRelationships` from `useThoughtLabels`.
- `NetworkView.tsx` — co-occurrence edge logic and `weight` link field removed.
- `useThoughts.ts` / `HomePage.tsx` — `Thought.edgeLabels` field and its derivation removed.
