# Parent picker — overlap bug, missing X, drag-to-reparent

Source: brain thought `ac252dcf` ("Add to parent dialogue. Node list overlaps
and is not visible.", To Do, UI label). Three asks: (1) the candidate list
renders with all items overlapping/illegible, (2) the dialog lacks the X
close button the other dialogs have, (3) drag a card onto another card to
reparent.

Component: [ParentPicker.tsx](../apps/web/src/components/ParentPicker.tsx) +
[ParentPicker.css](../apps/web/src/components/ParentPicker.css). Note this issue's sibling —
the in-progress reparent feature (`784df3e1` "Add subthought after creation")
whose step 3 already floats drag-and-drop reparenting as a decision. Don't
build DnD twice; resolve it here.

## 1. Root-cause the overlap

- [ ] The component's own CSS is sane (plain flex column, scrolling
      `.pp-list`), so the bug is contextual. Reproduce first — mobile and
      desktop, from the card actions row and from the focused-node editor.
      Suspects, in order: a global `button` style overriding `.pp-item`
      (height/position), a parent `transform`/`contain` affecting the portal
      (it portals to `document.body`, so more likely a global stylesheet
      collision), or a competing `.pp-*` class name.
- [ ] Fix at the source; add whatever explicit `display:block`/height reset
      `.pp-item` needs to be robust against global button styling.

## 2. Dialog chrome parity

- [ ] Add the X close button top-right, same look as LabelPicker's
      `lp-close`. Keep overlay-click and Escape (already wired on the search
      input — move the key handler to the dialog so it works without focus).

## 3. Drag card onto card to reparent

- [ ] Desktop: HTML5 drag on ThoughtCard (drag handle or whole card —
      decide; whole card risks fighting text selection and click-to-edit).
      Drop target = another card; on drop call the existing `setParent`
      (used by the picker) with the same descendant-cycle guard — lift
      ParentPicker's `blocked`-set BFS into a shared helper so both paths
      refuse cycles identically.
- [ ] Visual affordance: highlight valid drop targets while dragging; dim
      blocked ones (self + descendants).
- [ ] Mobile: skip for now (long-press drag vs scroll is a tar pit); the
      picker remains the mobile path. Note the decision in the brain when
      the graph is next updated.

## 4. Verify

- [ ] Picker: list legible and scrollable with 100+ thoughts, X closes,
      search filters, current parent highlighted, cycle candidates absent.
- [ ] Drag: reparent top-level → nested, nested → top level ("Top level"
      remains picker-only), attempt a cycle → refused visually, not just
      silently.
