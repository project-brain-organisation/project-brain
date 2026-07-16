# Feature: Knowledge graph view + relationship dialog

**Status:** implemented 2026-07-13; **graph mode REMOVED 2026-07-16** — the graph/mind-map
toggle and the pure-relationship view below are gone (the view wasn't working well).
Mind map is the only view; it kept the relationship overlay edges. Their label names
briefly rendered at the link midpoint, but that proved too busy (user, 2026-07-16) —
labels now show only in the desktop hover tooltip. The RelationshipsDialog is
untouched. The rest of this doc is historical.
**Created:** 2026-07-13
**Why:** The network diagram only shows the hierarchy mind map (solid edges) with label
co-occurrence overlaid as grey edges. There is no way to see the graph as a pure
knowledge graph (relationships only), and no way to define an explicit, directional,
labelled relationship between two nodes — the `kind='edge'` relationship type exists in
the DB/API but nothing in the UI creates or renders it.

## What exists already (no backend work needed)

The API surface is complete for this feature:

- `relationships` table has `kind='edge'` with an optional `labelId`
  ([relationship.schema.ts](../apps/api/src/database/schema/relationship.schema.ts)).
  Directionality is inherent: `sourceId → targetId`.
- `RelationshipsService.create` places **no endpoint-type restriction** on `edge` kind
  ([relationships.service.ts:14](../apps/api/src/workspace/relationships/relationships.service.ts#L14)),
  validates same-project endpoints, and emits `relationship.created` on the SSE bus.
- Duplicate protection at the DB layer: `UNIQUE (source_id, target_id, label_id) WHERE kind='edge'`
  → service maps 23505 to a 409 `ConflictException` ("Relationship already exists").
- Client already wraps it all: `relationshipsApi.create/listByProject(projectId, 'edge')/remove`
  in [pbApi.ts](../apps/web/src/lib/pbApi.ts).
- Labels expose `isEdge` ([useLabels.ts](../apps/web/src/hooks/useLabels.ts)); the
  LabelPicker already has the toggle that sets it.

So this is a **frontend-only** feature: `apps/web` changes, zero API/schema changes.

## Design decisions (confirmed with user 2026-07-13)

1. **Knowledge graph view edge set** = explicit `kind='edge'` relationships (new,
   directional, arrowed, coloured by their label) **plus** the existing grey
   label-co-occurrence edges (thoughts sharing an `isEdge` label). Hierarchy edges are
   excluded entirely. Mind map view stays exactly as it is today.
2. **Knowledge graph view scope** = *all* thoughts in the selected project, with **no
   root pseudo-node**. When a node is selected (left list or graph click), the graph
   filters to that node **plus its one-hop neighbours** (any node connected by a single
   relationship edge); background click clears the filter back to the full graph.
3. **Dialog creates `kind='edge'` relationships with a required `labelId`** chosen from
   the project's `isEdge = true` labels only. Source/target pickers list only thoughts
   (not the project or labels), showing title or a body snippet for untitled thoughts.
4. **View state persists** across sessions via localStorage (`pb-network-view-mode`).

## Delivery steps

Work top-to-bottom; each step leaves the app runnable.

### 1. Data plumbing — expose edge relationships to the UI
- [x] Extend [useThoughts](../apps/web/src/hooks/useThoughts.ts) `fetchAll` to also fetch
      `relationshipsApi.listByProject(projectId, 'edge')` in the existing `Promise.all`,
      and return a new `edgeRelationships` array from the hook: each item joined with its
      label (`{ id, sourceId, targetId, label: { id, name, color } | null }`).
      It already refetches on `thoughtsEvents`, so SSE + dialog mutations ride the same
      refresh path for free.
- **Check:** typecheck; log the array in HomePage against a project with a manually
  inserted edge rel.

### 2. NetworkView — two modes
- [x] Add props to [NetworkView](../apps/web/src/components/NetworkView.tsx):
      `mode: 'mindmap' | 'graph'` and `edgeRels` (the joined shape from step 1).
- [x] `graphData` memo branches on mode:
      - **mindmap:** unchanged (hierarchy links + label co-occurrence links).
      - **graph:** no hierarchy links. Links = explicit edge rels
        (`{ source, target, isDirected: true, labelName, labelColor }`) + the existing
        co-occurrence links (reuse the current `byLabel`/`edgeWeights` logic as-is).
        Filter rels whose endpoints aren't in the visible thought set.
- [x] Directional rendering for explicit edges: `linkDirectionalArrowLength` /
      `linkDirectionalArrowRelPos` (arrow only when `isDirected`), link colour = label
      colour at higher opacity than co-occurrence grey. Reuse the existing `linkLabel`
      tooltip (`.graph-tooltip-label`) so hovering shows the label name.
- **Check:** toggle a hard-coded `mode="graph"` and confirm hierarchy edges vanish,
  arrows render, tooltips show label names.

### 3. HomePage — view toggle + graph-mode node set
- [x] `viewMode` state in [HomePage](../apps/web/src/components/HomePage.tsx).
- [x] `networkThoughts` memo: in graph mode return **all** `thoughts` (no root
      pseudo-node, ignore `focusedNodeId`); mind map path unchanged.
- [x] Node click in graph mode: still `handleSelectNode` (drives the left list);
      background click still resets focus.
- **Check:** switching views back and forth keeps the left panel coherent.

### 4. Network area controls (top-right overlay)
- [x] New control cluster absolutely positioned top-right inside `.home-page-network`
      (already `position: relative`): a two-option segmented toggle
      (**Mind map | Graph**) + a **Relationships** button that opens the dialog.
- [x] Styling consistent with the app's chrome: `var(--font-mono)`, ~9–11px uppercase
      + letter-spacing, `var(--surface)` background, `1px solid var(--border2)`,
      2px radius — same vocabulary as `.graph-tooltip-label` and the LabelPicker cards.
      Active segment gets the accent treatment used elsewhere (`--accent`).
- **Check:** controls sit above the canvas (z-index), don't intercept graph drag except
  on the buttons themselves.

### 5. RelationshipsDialog
- [x] New `RelationshipsDialog.tsx` + CSS. Reuse the [McpDialog](../apps/web/src/components/McpDialog.tsx)
      pattern: `createPortal` to body, overlay click closes, `×` close button, same
      header/title/subtitle classes structure. Card/list styling borrowed from
      [LabelPicker](../apps/web/src/components/LabelPicker.css)'s `.lp-card` vocabulary.
- [x] **Existing relationships list** — three columns per row:
      `source thought · label chip (colour dot + name, cf. .graph-tooltip-label) · target thought`,
      with a directional glyph (→) between columns and a `×` delete per row →
      `relationshipsApi.remove(id)`.
- [x] **Add row** at the bottom: three selects — source thought, label
      (**only `isEdge === true` labels** from `useLabels(selectedRootId)`), target
      thought — plus an Add button → `relationshipsApi.create({ projectId, sourceId,
      targetId, kind: 'edge', labelId })`.
      Thought options display `title || body-snippet`. Disable Add until all three are
      chosen; block source === target client-side.
- [x] Error handling: 409 → inline "relationship already exists"; other errors surface
      the message. On success call `notifyThoughtsChanged()` so the graph and any other
      open views refresh (step 1 made edge rels part of that fetch).
- [x] Empty states: no edge labels → hint that labels must be marked as edge labels in
      the label picker (the triangle toggle); no relationships yet → short explainer.
- **Check:** create a relationship in the dialog → it appears in the list and (in graph
  view) as an arrowed edge without manual refresh; delete removes it live.

### 6. Verification
- [x] `npm run build:web` + typecheck clean.
- [x] Headless-browser pass (playwright-core + system Chrome, dev-JWT cookie): both views
      render, orphan hiding works, one-hop focus filter verified (Billing at 2 hops
      disappears when Rate limiter is focused), dialog lists relationships with the
      three-column layout + add row.
- [ ] Manual pass: dialog create/delete, duplicate-409 message, SSE refresh.
- [x] Mind map view unregressed (hierarchy edges + root pseudo-node render as before).

## Alterations (user feedback 2026-07-13, all implemented)

1. Graph view hides orphan nodes (no relationship edges). Empty state: "No relationships yet".
2. Relationship edges render bold (width 2, opacity 0.85, label-coloured) with the label
   name displayed on the link itself (SpriteText at the midpoint), not just on hover.
3. **Bugfix (backend):** the global `ValidationPipe({ whitelist: true })` in main.ts
   stripped every property from class-based DTOs with no class-validator decorators —
   `PATCH /api/workspace/labels/:id` always 500'd ("No values to set"), which is why the
   edge toggle in LabelPicker did nothing (also broke label rename/recolour). Fixed by
   Zod-validating the update path (`updateLabelSchema`), matching the create paths.
   Labels suite green (8/8).
4. No blue accents: view toggle active state and dialog Add button use the black/white
   `.lp-new-add` treatment from the labels dialog.

## MCP support (added 2026-07-13)

Claude can now create these relationships. Previously the "relationships" it made were
label co-occurrence (tagging two thoughts with the same edge label); explicit
`kind='edge'` rows had no MCP surface.

- **API:** `POST /api/internal/mcp/create-relationship` (validates the label is
  `isEdge = true` and same-project, then creates `kind='edge'` as source `'mcp'` so SSE
  refreshes open browsers) + `POST /api/internal/mcp/list-relationships` (optional
  `kind` filter). [internal-mcp.controller.ts](../apps/api/src/internal-mcp/internal-mcp.controller.ts)
- **Sidecar:** `create_relationship` + `list_relationships` tools in
  [relationship-tools.ts](../apps/mcp/src/tools/relationship-tools.ts), registered in the
  tool registry; ApiClient methods added. Unit tests in `relationship-tools.test.ts`
  (suite 71/71 green).
- **Bugfix found during verification:** duplicate edge inserts returned 500, not 409 —
  drizzle wraps driver errors in `DrizzleQueryError`, so the service's `err.code === '23505'`
  check never matched; it now walks the `cause` chain. Affected the web dialog path too.
- **Deploy note:** claude.ai talks to the Railway-hosted MCP; these tools only appear
  there after the V2 MCP + API deploy (see `features/deploy-mcp-v2.md`).

## Out of scope (noted for later)

- Rendering explicit `edge` relationships in **mind map** view (kept untouched per spec).
- Creating relationships by direct interaction on the canvas (drag node→node).
- Editing an existing relationship's label (delete + re-add covers it for now).
- Persisting the selected view mode.
