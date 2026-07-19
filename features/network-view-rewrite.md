# NetworkView rewrite — full decomposition

Split the ~425-line `apps/web/src/components/NetworkView.tsx` monolith into a thin
orchestrator over pure functions and focused hooks. **No behavior change** — the
public props and every guarantee below stay identical. Algorithms (`mindMapLayout`,
`graphNode`) are already clean and stay as-is. Preserve the load-bearing comments;
they document real bugs.

## Contract (frozen)

Props consumed by both `HomePage.tsx` call sites — do not change:
`thoughts, nodeColors?, onSelectNode?, onResetView?, edgeRels?, focusedNodeId?, paused?`.

## Features to preserve

- **Graph model:** thought → node (`id`, 2-line truncated `name`, `body`, `isRoot`,
  `hasTitle`); hierarchy links from `parentId` (in-set only); `edgeRels` overlaid as
  faded labelled links, deduped against hierarchy pairs (undirected key); focus mode
  filters to node + one-hop neighbours.
- **Label math:** `truncateLabel` (word-wrap ≤2 lines, hard-break long words, ellipsis),
  `nodeRadius` (label-footprint half-width).
- **Layout:** deterministic radial seed + offline force polish, rooted at focus-or-root;
  positions pinned (`fx/fy/fz`), live engine never runs; yields bbox.
- **Sizing:** ResizeObserver → `{width,height}`, seeded from initial rect.
- **Camera:** exact bbox fit (perspective W/H, not zoomToFit); auto-refit only on
  identity change (project root / focus) — animated; snapped + debounced on resize
  bursts; `root:`-prefixed identity key; `userNavigated` locks camera after pan/zoom;
  re-centre button re-arms; rotation disabled (Trackball + Orbit); dolly clamped to scale.
- **Render lifecycle:** recolor → `refresh()`; pause = one fresh frame then stop loop,
  repaint only on size/data change.
- **Interaction:** custom tap detect (8px + 500ms tolerance, pinch-aware) + direct
  raycast → `onSelectNode`; empty tap → `onResetView`.
- **Render config:** ForceGraph3D (2D, cooldown 0, drag off, transparent), custom node
  objects, link color/width/opacity by edge type, HTML tooltip for labelled edges,
  empty state.

## New structure

- [ ] `lib/graphModel.ts` — pure `buildGraph(thoughts, edgeRels, focusedNodeId) → {graphData, bbox}`.
      Absorbs `truncateLabel`, `nodeRadius`, node/link build, focus filter, layout call, bbox.
      No React. Unit-testable.
- [ ] `hooks/useContainerSize.ts` — ResizeObserver → `{ref, width, height}`.
- [ ] `hooks/useGraphCamera.ts` — fit math, identity auto-refit effect, `userNavigated`,
      controls (no-rotate + dolly limits), returns `recentre()`. Takes `fgRef, bbox, dimensions, identity`.
- [ ] `hooks/usePausableRender.ts` — one-frame-then-pause; deps `paused, dimensions, graphData`.
- [ ] `hooks/useTapSelection.ts` — pointer handlers + raycast; returns `{onPointerDown, onPointerUp, onPointerCancel}`.
- [ ] `NetworkView.tsx` — wires the above, renders ForceGraph3D + recentre button; keeps
      `nodeThreeObject`/link styling/tooltip local. Target ~80 lines.
- [ ] Keep `graphNode.ts`, `mindMapLayout.ts`, `NetworkView.css` unchanged.

## Verify (both paths, running app)

- [ ] Desktop: load a project — settled on first frame, framed; select node → focus +
      one-hop; re-centre; pan then edit → camera stays; recolor updates.
- [ ] Mobile sheet: open/close/drag — paused graph shows a fresh frame, no stale frame,
      no continuous redraw; tap selects; empty tap resets.
- [ ] Labelled edges render faded with hover tooltip; empty state shows.
- [ ] `npm run build:web` clean.
