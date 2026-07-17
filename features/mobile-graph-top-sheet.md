# Mobile graph view as a slide-down top sheet

Source: brain thought `61e9fccd` ("Mobile Graph View as Slide-Down Top Sheet",
To Do, FEATURE label). Replace the bottom-tab `/graph` screen with a top
sheet that slides down over the thoughts screen: graph in the top half,
thought list pushed to the bottom half (search bar intact), cross-filtering
identical to desktop. Biggest of the six To Do items — do it in phases, each
shippable.

Current mobile shape (see `features/mobile-ui.md`, [HomePage.tsx](../apps/web/src/components/HomePage.tsx)):
two-tab bottom bar routes `/` (Thoughts + create-FAB) and `/graph` (graph +
node-preview bottom sheet + "Add relationship" FAB); dismissible surfaces are
history-backed via [useHistoryFlag](../apps/web/src/hooks/useHistoryFlag.ts); the second top
bar is now empty since the project title moved.

## 1. The sheet itself

- [ ] New history-backed flag (`'graphSheet'` via useHistoryFlag) so the
      Android back gesture closes it — same pattern as drawer/sheet/dialog.
- [ ] Opener lives in the vacated second top bar: shrink that bar to a slim
      grab-handle strip ("show graph" affordance) instead of deleting it —
      the brain body explicitly offers this option; it also doubles as the
      sheet's drag handle when open.
- [ ] Sheet occupies the top ~50vh; the thoughts screen (search bar + list +
      FAB) compresses into the remainder. The list must keep its own scroll.
- [ ] NetworkView already handles container resizes (debounced refit) —
      mount it in the sheet and animate height with a transition; verify
      WebGL context behaves across open/close (keep the mount-not-CSS-hide
      rule from mobile-ui).

## 2. Unify focus/filter semantics with desktop

- [ ] The cross-filter already derives everything from `focusedNodeId`
      (HomePage `visibleNodes` / `nodesAround`) — reuse it; the list under
      the sheet is the ordinary ThoughtsList, not a new component.
- [ ] Required by the brief: focusing ANY node — including the root — shows
      all its relations (children included) in graph and list, identically
      on mobile and desktop. Today `handleSelectNode` treats a root click as
      "clear focus" ([HomePage.tsx:121-127](../apps/web/src/components/HomePage.tsx#L121-L127)), so the
      root can't be focused on desktop either. Make root focus a real state
      (root + its top-level children) distinct from "no focus" (whole graph).
      This is a shared-semantics change — touch desktop and mobile together.

## 3. Button roles

- [ ] FAB: with the sheet open it must still create a thought (as on `/`),
      not open the relationship editor. Kill the mode-switch entirely.
- [ ] Relationships editor moves to a "Relationships" button at the top
      right of the graph sheet, matching desktop.

## 4. Retire the old route

- [ ] Remove the `/graph` tab, the bottom TabBar's second tab, and the
      node-preview bottom sheet + anchored FAB that only existed for that
      screen. Update `features/mobile-ui.md` and the drill-navigation notes
      (back-gesture paths change: drill history + sheet flag must compose).
- [ ] Sweep for graph-tab-only code paths left dead.

## 5. Verify

- [ ] Mobile: open sheet → whole graph; tap node → graph + list filter to
      its relations; search still works; FAB creates a thought under the
      focused node; back gesture closes sheet, then drills up, in the right
      order.
- [ ] Desktop unchanged except root-focus now works.
- [ ] Rotation / keyboard-open resize while the sheet is open.
