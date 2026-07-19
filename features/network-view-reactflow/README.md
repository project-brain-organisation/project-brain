# NetworkView — React Flow rewrite, maximally out-of-the-box (read-only preview)

A from-scratch reimplementation on **React Flow** (`@xyflow/react` v12), following
React Flow's recommended conventions and leaning on built-in features. Not wired in;
lives outside `apps/web/src` so nothing compiles (the IDE flags unresolved
`@xyflow/react` / `react` / relative-hook imports — expected, they resolve on
relocation + `npm i`).

## Files → final location

| Draft | Final location | Kind |
|---|---|---|
| `useThoughtGraph.ts` | `apps/web/src/hooks/useThoughtGraph.ts` | hook — thoughts → nodes/edges, positioned (rooted at the focus; no dedup) |
| `ThoughtNode.tsx` | `apps/web/src/components/ThoughtNode.tsx` | custom node — HTML/CSS circle + label |
| `NetworkView.tsx` | `apps/web/src/components/NetworkView.tsx` | component — wires the hook into `<ReactFlow>` |
| `NetworkView.css` | `apps/web/src/components/NetworkView.css` | node/edge/controls visuals |

There is **no `graphModel.ts`** and **no `useFocus`**. Focus *filtering* is not the graph's
job — `HomePage` narrows `thoughts` to the focused neighbourhood (via `nodesAround`, shared
with the thought list so the two never diverge) and hands the graph an already-focused set.
So `useThoughtGraph` only builds + positions what it's given, using `focusedNodeId` solely to
root the layout at the focused node. The *layout* itself lives in one place,
`lib/mindMapLayout.ts` (d3-hierarchy + d3-force, unchanged).

## Conventions applied

- **Controlled state** — `useNodesState`/`useEdgesState` + `onNodesChange`/`onEdgesChange`,
  synced from the derived graph via `useEffect`.
- **Stock `<Controls>`** — zoom + fit-view; no hand-rolled recentre button.
- **`defaultEdgeOptions`** — `type: 'straight'` hoisted to module scope.
- **Read-only chrome off** — `elementsSelectable`/`nodesFocusable`/`edgesFocusable` false,
  `disableKeyboardA11y`. `onNodeClick` still fires, so drill/focus is unaffected.
- **`useNodesInitialized`-gated fit** — refit runs against measured nodes.
- **Stable identities** — `nodeTypes`, `defaultEdgeOptions`, `FIT` at module scope;
  handlers via `useCallback`; `ThoughtNode` in `React.memo`.

## Two design decisions (changed from earlier drafts)

1. **Edges are no longer deduplicated.** A pair joined by hierarchy + a relationship (or by
   several relationships) keeps every edge. The extra force-links pull that pair closer —
   "more relationships → closer" — and `forceCollide` in `mindMapLayout` already prevents
   any overlap, which was the only real reason dedup existed. *Caveat:* two straight edges
   between one pair overlap exactly, so multiplicity shows as closeness, not as visible
   parallel lines (bowed edges would need a custom edge component).

2. **Focus filtering stays in `HomePage`, not the graph.** `HomePage` already computes the
   focused neighbourhood once and shares it with both the list and the graph (`nodesAround`),
   so the graph never filters — it renders the set it's given and roots the layout at
   `focusedNodeId`. A `useFocus`/`hidden` layer inside the graph would have been redundant
   with that (and risked the two panes drifting apart), so it was removed.

## Layout decision (recorded)

**Keep `mindMapLayout.ts` (d3-hierarchy + d3-force).** React Flow ships no layouter of its
own; its Layouting docs delegate to exactly these libraries. Dagre / elkjs are alternatives
only for a different visual language.

## Dependency change

- **Add:** `@xyflow/react`
- **Remove:** `react-force-graph-3d`, `three`, `three-spritetext` (used only by the graph).
- **Keep:** `d3-hierarchy`, `d3-force-3d` (power `mindMapLayout`).

## Remaining caveats

- **Center-to-center edges** use two hidden, centred handles per node + stock straight
  edges (the most OOTB option). Floating edges are the alternative for perimeter attachment.
- **Edge-label chip** is simplified to React Flow's default coloured label.
- **Node pixel sizes are guesses** — `.tnode-*` sizes need tuning; labels clamp to two lines
  via CSS (`-webkit-line-clamp`), and `useThoughtGraph` keeps only a rough width estimate for
  layout since React Flow measures the true size after paint.
- **Wholesale `setNodes` on each data change** re-measures nodes (fine at our scale).
- **Recolour re-runs the layout** — `nodeColors` is a `useThoughtGraph` dependency, so a
  colour change re-runs `mindMapLayout` (deterministic, so positions don't move, but it's
  wasted work). Open optimisation: split the layout memo (`thoughts`/`edgeRels`/`focusedNodeId`)
  from a cheap colour-mapping memo (`nodeColors`).
- **DOM performance ceiling** — fine for tens–hundreds of nodes; WebGL would stay smoother
  in the low-thousands.
- **`HomePage.tsx` is unchanged** — props identical; the provider is wrapped inside.

## Reading order

1. `useThoughtGraph.ts` — thoughts → positioned nodes/edges (rooted at the focus).
2. `NetworkView.tsx` — how the hook feeds React Flow's controlled state.
3. `ThoughtNode.tsx` — the node, ~20 lines of JSX.
