# Label picker — multi-select before Add

Source: brain thought `e2f1817a` ("Multi-select labels.", To Do, FEATURE label).
Select several labels in the picker, then press Add once; today
[LabelPicker.tsx](../apps/web/src/components/LabelPicker.tsx) holds a single
`selectedLabelId` (line ~41) and `handleAdd` writes exactly one assignment.

The picker's staging model already fits ("nothing is written until Add") —
this is widening the selection from one to many, not a redesign.

## 1. State: `selectedLabelId` → `selectedIds: Set<string>`

- [ ] Card click toggles membership instead of replacing the selection.
- [ ] Keep `targetByLabel` as is — edge labels each carry their own target.
      An edge label is *actionable* only when its target is chosen; choosing
      a target auto-adds it to the selection (today's `handleTargetChange`
      intent, line ~177).
- [ ] `handleCreate` adds the new label to the selection rather than
      replacing it.

## 2. Add applies the whole selection

- [ ] `handleAdd` iterates: plain tags → `onAssign(id)` (skip already
      assigned); edge labels with targets → `createEdgeRelationship`,
      skipping duplicates (reuse the `isDuplicateEdge` check per label, not
      just for one). All mutations are optimistic, so a simple loop is fine.
- [ ] `canAdd` = at least one actionable selection (assignable tag or
      complete non-duplicate edge). Selected-but-unactionable items (edge
      without target) don't block Add; they're just not applied — or better,
      show the target select highlighted as "needs a target".
- [ ] Replace-mode (`editingLabelId` set, opened from an existing chip):
      keep single-select semantics there — replacing one chip with several
      labels is ambiguous. Simplest: when `editingLabelId` is set, toggling
      clears the rest of the selection.

## 3. UI truthfulness

- [ ] `lp-card--selected` already exists; make multiple selected cards
      visually obvious and distinct from `lp-card--active` (assigned) —
      this overlaps the in-progress "Label selection unclear" issue
      (`f24afe9b`, steps 1-3: strengthen selected treatment, separate
      selected from assigned, tame hover). Land that styling work first or
      fold it in here; don't do it twice.
- [ ] Update the header copy (`lp-desc`) and the Add button label to count:
      "Add 3".

## 4. Verify

- [ ] Select two tags + one edge with target → Add → all three appear
      (chips + graph edge), one click.
- [ ] Already-assigned tag in the selection is skipped without error.
- [ ] Replace-mode still swaps a single chip. Mobile + desktop.
