# Mobile UI

Adapt the workspace for phone-sized screens, following Material/iOS conventions
throughout. Desktop keeps the current three-zone layout (sidebar / thoughts /
graph); mobile replaces it with a top bar, bottom tab navigation, and two
full-screen views.

## Design

**Breakpoint:** `max-width: 768px`, detected in JS with a `useIsMobile` hook
(`window.matchMedia`), because the mobile layout must *conditionally mount*
components — hiding `NetworkView` with CSS would leave the three.js render loop
running behind the thoughts screen.

**Top bar** (replaces the sidebar):
- Hamburger (☰) leading, left; current project name as the centered headline.
  The logo moves into the **drawer header** (Material's home for branding —
  the top bar's leading slot belongs to the nav icon).
- The hamburger opens a **left-side navigation drawer** rendering the existing
  [Sidebar](../apps/web/src/components/Sidebar.tsx) content — logo header, then
  project list with create/delete-confirm, MCP button, account row + logout.
  Dismiss via scrim tap, back, or selecting a project. No custom edge-swipe to
  open: on mobile web the left edge belongs to the browser's back gesture.

**Bottom tab bar** — two tabs, always visible: **Thoughts** | **Graph**.
Current tab highlighted; safe-area padding below. Destination changes use
**fade-through** motion, not slides (tabs are peers, not hierarchy). Note:
Material specs 3–5 destinations for a nav bar; two is a deliberate, widely
shipped deviation — a future third destination (e.g. search) lands us in spec.

**Thoughts screen** (default tab):
- `ThoughtsList` as a scrolling list of the project's thoughts. **Drill-down**
  (added 2026-07-14): the `→` on a card drills into that node — the header shows
  it with **up-one-level** and **back-to-root** buttons, the list shows its
  children — and a **back-swipe drills up one level**. Backed by a history stack
  under a `'drill'` flag (see `features/thought-canvas-drill-navigation.md`);
  independent of the graph screen's node sheet.
- **FAB bottom-right** (docked above the tab bar, safe-area aware) = **new
  thought**, opening the composer (child of the drilled-into node).

Each tab has its own FAB for its primary constructive action (Material pattern:
the FAB changes with the destination).

**Graph screen:**
- `NetworkView` full-bleed between top bar and tab bar.
- ~~Mind map / Graph mode toggle~~ — removed 2026-07-16; mind map is the only
  view now (see [drop-graph-mode note in knowledge-graph-view.md](knowledge-graph-view.md)).
- **FAB bottom-right** = **"Add relationship"**: a plain round `+` FAB (user
  preference over the extended icon+label form), opening `RelationshipsDialog`
  as a **full-screen dialog** (Material's mobile pattern for create/edit tasks).
- The FAB is **anchored to the node bottom sheet** (Google Maps pattern) so
  nothing ever overlaps it: resting, it docks above the tab bar; when the sheet
  opens at peek height the FAB translates up with it, pinned ~16px above the
  sheet's top edge; when the sheet is dragged to expanded the FAB scales out,
  and scales back in on return to peek/dismiss. FAB and sheet share a
  positioning context — the FAB's offset is driven by the sheet's height with
  the same transition.
- Selecting a node **filters the graph to its one-hop neighbourhood** (parent,
  children, label/relationship neighbours — both view modes); dismissing the
  sheet restores the full graph. Implemented by hoisting `NetworkView`'s
  graph-mode `focusedNodeId` filter to cover mind-map mode and passing the
  sheet's node id on mobile (desktop drill-down semantics unchanged).
- Tapping a node opens a **standard (in-flow) bottom sheet** with that
  thought's card: the sheet's height **pushes the graph area up** (the WebGL
  canvas resizes live) instead of covering it, so the graph is never occluded.
  Pill **drag handle** at top (M3 requires it), drag between peek/expanded,
  swipe down / background tap / back to dismiss and deselect. **No scrim** —
  Material reserves scrims for modal sheets; this one coexists with content. No cross-screen interaction — selection never changes the Thoughts
  tab.

**Routing & back button:**
- Tabs are routes (`/` = Thoughts, `/graph` = Graph) so Android back and
  browser history work: back from Graph returns to Thoughts, not app exit.
- Drawer and bottom sheet push a history state so back closes them first.
- Thoughts-screen drill-down encodes its path as a history stack (`'drill'`
  flag), so a back-swipe pops one level (drill up). Desktop keeps the in-memory
  `focusedNodeId` state.

**Gesture conflicts — containment + coaching:**
- `touch-action: none` on the graph canvas container (library consumes raw
  pointer events; browser never scrolls/zooms the page from it).
- `overscroll-behavior: none` on the app shell — kills pull-to-refresh and
  scroll chaining; shell is fixed (`100dvh`, `overflow: hidden`), only the
  thoughts list scrolls internally.
- OS edge-swipe-back can't be suppressed in a browser; routing above makes an
  accidental swipe a harmless tab change instead of an app exit.

Deferred: graph remount cost / camera reset on tab switches, and a 2D fallback
for low-end phones — revisit if real users hit it.

## Touch points

- [Shell.tsx](../apps/web/src/components/Shell.tsx) — on mobile render
  `<TopBar>` + drawer + `<TabBar>` instead of inline `<Sidebar>`; owns drawer
  state alongside `mcpOpen`.
- [HomePage.tsx](../apps/web/src/components/HomePage.tsx) — on mobile render the
  route-active screen; desktop path untouched.
- `Sidebar` reused as drawer content; only container styling moves.
- [ThoughtCard](../apps/web/src/components/ThoughtCard.tsx) reused inside the
  bottom sheet.

## Checklist

- [x] `useIsMobile` hook (matchMedia, SSR-safe default false)
- [x] Routes: `/` (Thoughts) and `/graph`; tab bar drives navigation
- [x] `TopBar`: hamburger leading, centered project name
- [x] Drawer: left-side panel + scrim wrapping `Sidebar` with logo header;
      closes on project select and on back (history state)
- [x] `TabBar`: two tabs, active state, safe-area padding
- [x] Thoughts screen: flat list + FAB (new thought), FAB docked above tab bar
- [x] Graph screen: full-bleed `NetworkView` (mode toggle since removed, 2026-07-16)
- [x] "Add relationship" extended FAB anchored to the bottom sheet (rides peek
      height, scales out at full expansion)
- [x] `RelationshipsDialog` responsive pass: full-screen dialog on mobile
- [x] Node bottom sheet: drag handle, peek/expand/dismiss, closes on back,
      reuses ThoughtCard
- [x] Fade-through motion on tab switches
- [x] Toasts/snackbars render above the FAB and tab bar (never behind either)
- [x] Gesture containment: `touch-action: none` on canvas,
      `overscroll-behavior: none` + fixed `100dvh` shell
- [x] ~~Coach mark overlay on first Graph visit (localStorage flag)~~ —
      removed 2026-07-15: rotation is force-disabled in `NetworkView`, so the
      hint's first instruction was impossible
- [x] Keyboard handling: `interactive-widget=resizes-content` viewport meta,
      FAB scales out while a text field has focus
- [x] Layout hygiene: `viewport-fit=cover` meta, ≥48px touch targets on new
      chrome; card actions always visible (no hover) on touch
- [ ] Verify 3D graph touch interaction (pinch/tap) on a real phone — rotation
      is deliberately disabled in `NetworkView`
- [ ] Verify drawer delete-project confirm flow on mobile
- [x] Update `features/codebase-overview.md` (web section) once landed

## Implementation notes (2026-07-14)

- Back-button behavior is one hook: `useHistoryFlag(key)` stores each
  dismissible surface (drawer / node sheet / relationships dialog) in router
  history state — opening pushes an entry, back pops it, reopening replaces.
- The anchored FAB is a **child of the sheet element** (`fab` prop on
  `ThoughtSheet`), so it rides every sheet transform — snaps *and* finger
  drags — with zero coordination code. Closed sheet = `translateY(100%)`,
  which parks the FAB 16px above the container bottom.
- The sheet is **in-flow** (flex-column sibling of the graph area), animating
  `height` between 0 / `min(320px, 50%)` / 85% — heights duplicated as
  `peekHeight()`/`expandedHeight()` (ThoughtSheet.tsx) and the state rules in
  ThoughtSheet.css; keep them in sync. `NetworkView`'s ResizeObserver resizes
  the canvas as the sheet moves.
- **No scrollbar tracks anywhere on mobile** (`* { scrollbar-width: none }` in
  the global mobile media query) — native mobile uses transient overlay
  scrollbars; visible tracks only appear in desktop emulation.
- New files: `useIsMobile.ts`, `useHistoryFlag.ts`, `TopBar`, `TabBar`,
  `Fab`, `ThoughtSheet` (+ CSS each).
