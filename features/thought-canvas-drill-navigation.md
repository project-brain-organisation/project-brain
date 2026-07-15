# Feature: Drill-up / return-to-root navigation in the thought list

**Status:** planned
**Created:** 2026-07-14
**Why:** Once you drill into a node (click it → the graph filters to it + one-hop, the
list shows its children), the only way back out is a background click on the graph, which
jumps straight to the project root. There's no way to step *up one level* in a deep
hierarchy, and the "back to root" gesture is undiscoverable (hidden in the graph, not the
list). Add two explicit buttons beside the drilled-in node's title in the thought list.

## Scope

Frontend-only, **desktop-only** — `apps/web`, zero API/schema changes. Drill-down
(`focusedNodeId`) is already desktop-only ([codebase-overview.md](codebase-overview.md);
mobile has no drill-down), so these controls live only in the desktop `ThoughtsList` render
path in [HomePage](../apps/web/src/components/HomePage.tsx).

## What exists already

- Drill state is a single `focusedNodeId` in [HomePage.tsx:56](../apps/web/src/components/HomePage.tsx#L56).
  `undefined` = project-root view; a thought id = drilled into that node.
- [`handleSelectNode`](../apps/web/src/components/HomePage.tsx#L107) sets it (drill in);
  [`handleResetView`](../apps/web/src/components/HomePage.tsx#L102) clears it to `undefined`
  (**this is already "return to root"** — just not surfaced as a list button).
- `activeNode` = the focused thought (or `rootNode`); its `parentId` gives the level above.
  Top-level thoughts have `parentId === null` (parent is the project root).
- **Graph filtering already follows `focusedNodeId` for free:** both `visibleThoughts` and
  `networkThoughts` ([HomePage.tsx:161-184](../apps/web/src/components/HomePage.tsx#L161-L184))
  re-derive from it, and `NetworkView` re-applies its one-hop filter whenever `focusedNodeId`
  changes. So any navigation implemented as "set `focusedNodeId`" keeps mind-map **and** graph
  mode consistent with no extra work. The whole task reduces to computing the right target id.

## Design

Two buttons in the `ThoughtsList` header title row, immediately after the node title (to the
right of the existing color dot), rendered **only when drilled in** (`!isProjectRoot` and the
nav handlers are present). Not gated on `readOnly` — browsing a subscribed public graph should
still navigate.

1. **Up one level** (↑ / chevron-up icon) — go to the parent of the drilled-in node.
2. **Return to root** (⌂ / home icon) — go straight to the project root.

## Changes

### 1. HomePage — two handlers

```ts
// Up one level: parent of the focused node; null parent means the parent IS the
// project root, so clear the focus.
const handleNavigateUp = useCallback(() => {
  if (!focusedNodeId) return;
  const focused = thoughts.find((t) => t.id === focusedNodeId);
  setFocusedNodeId(focused?.parentId ?? undefined);
}, [focusedNodeId, thoughts]);

// Return to root == the existing reset. Reuse handleResetView directly.
```

Pass to the **desktop** `<ThoughtsList>` only:

```tsx
onNavigateUp={focusedNodeId ? handleNavigateUp : undefined}
onNavigateToRoot={focusedNodeId ? handleResetView : undefined}
```

Passing `undefined` at the root keeps the buttons absent there. The mobile `<ThoughtsList>`
render path passes neither (its `activeNode` is always `rootNode` anyway).

### 2. ThoughtsList — props + render

- Add to `Props`:
  ```ts
  onNavigateUp?: () => void;
  onNavigateToRoot?: () => void;
  ```
- In the `.thoughts-list-title-row`, after the color picker and before the clone button,
  render the pair only when `!isProjectRoot && onNavigateUp && onNavigateToRoot`:
  ```tsx
  <button className="thoughts-list-nav" title="Up one level" onClick={onNavigateUp}>
    <ChevronUpIcon />
  </button>
  <button className="thoughts-list-nav" title="Back to project root" onClick={onNavigateToRoot}>
    <HomeIcon />
  </button>
  ```
- Two small inline SVG icon components (match the existing `CloneIcon` style: 15px,
  `stroke="currentColor"`, `strokeWidth="2"`).

### 3. ThoughtsList.css — one button style

Reuse the icon-button look already established by `.thoughts-list-new` /
`.thoughts-list-clone` (transparent, `1px solid var(--border)`, muted → text on hover):

```css
.thoughts-list-nav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--muted);
  transition: border-color 0.15s, color 0.15s;
}
.thoughts-list-nav:hover {
  border-color: var(--border2);
  color: var(--text);
}
```

## Notes / edge cases

- When drilled into a **top-level** thought (`parentId === null`), "up one level" and "return
  to root" both land on the root — expected and harmless. Both buttons still show, for
  consistent placement; no need to conditionally hide "up".
- Deleting the drilled-in node while focused is a pre-existing concern out of scope here — the
  handlers read `thoughts` live, so a missing focused id resolves `focused` to `undefined` and
  "up" falls back to root, which is the safe outcome.

## Mobile — drill-down on the Thoughts screen (back-swipe = up one level)

Added 2026-07-14. The mobile Thoughts tab was a flat list of every thought with no
drill-down (`focusedNodeId` is desktop component state, unused on mobile). It now mirrors
the desktop drill: the `→` on a card drills into that node (header shows it + the up/root
buttons above; list shows its children), and **a back-swipe drills up one level**. The
graph screen is unchanged and independent (its node-sheet focus is a separate concern).

Mechanism — a **history-backed drill stack**, so the OS/browser back gesture pops a level
for free (no popstate interception):

- [`useHistoryFlag`](../apps/web/src/hooks/useHistoryFlag.ts) gained `open(v, { push })`
  (force a new history entry instead of replacing) and `close(steps)` (pop several entries
  to unwind the whole path, clamped to the app's own history depth).
- [HomePage](../apps/web/src/components/HomePage.tsx) stores the drill path under a **new
  `'drill'` flag** (distinct from the graph's `'node'` sheet — the two never interact). The
  focused node is the tail; `drillInto` pushes, `drillUp` pops one, `drillToRoot` unwinds all.
  The mobile Thoughts `ThoughtsList` is fed the focused node's children, its header node,
  and create/color/nav handlers targeting the focused node. Back-swipe pops the entry → the
  path shortens → the list re-renders one level up.
- Because the list only ever shows the focus's direct children, every drill-in is into a
  child, so the history stack is a true ancestry chain: back-swipe and the "up" button both
  land on the parent; "root" and a full swipe-unwind both land on the project root.

Reused the same header up/root buttons and `ThoughtsList` props from the desktop work; only
the handlers differ (history-stack pops vs. desktop's `focusedNodeId`/`parentId`).

## Verification checklist

- [ ] Drill root → A → A.child; each level shows the two buttons beside the title.
- [ ] "Up one level" from A.child lands on A (list = A's children, graph filtered to A + one-hop).
- [ ] "Up one level" from a top-level node lands on the root.
- [ ] "Return to root" from any depth lands on the project root (list = all thoughts, graph unfiltered).
- [ ] Same behaviour in **both** mind-map and graph view modes.
- [ ] Buttons absent at the project root and on mobile.
- [ ] Buttons present and functional on a read-only (subscribed) graph.

**Mobile Thoughts screen:**
- [ ] `→` on a card drills in; header shows the node + up/root buttons; list shows its children.
- [ ] **Back-swipe drills up one level** (parent), not straight to root.
- [ ] "Root" button and a swipe from any depth return to the full top-level list.
- [ ] New thought / color / title-edit at a drilled level target the focused node.
- [ ] Drilling on Thoughts never changes the Graph screen (and vice-versa).
- [ ] At the top level, back-swipe leaves the screen as before (no drill entries to pop).
