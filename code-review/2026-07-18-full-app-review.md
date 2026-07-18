# Full-app code review — 2026-07-18

Scope: whole codebase, frontend + backend. Focus per request: verbosity/readability
(especially the network diagram and the main page), backend service verbosity
(`thoughts.service.ts` and peers), and any other anti-patterns. **Primary goal right
now: UI performance on large network diagrams.**

## Verdict

The foundations are healthy and idiomatic — RLS multi-tenancy, the optimistic-mutation
factory (`useWorkspaceMutation`), the deterministic offline graph layout, and TanStack
Query are all good choices. The problems are almost entirely **verbosity and
concern-mixing in a handful of large files**, plus a few concrete performance levers in
the graph. Nothing here is architectural rot; all of it is behaviour-preserving
refactoring.

---

## Part 1 — UI performance (priority)

Two levers dominate the sluggishness on large graphs. Both live in the graph render path.

### P1. Node textures are re-rasterized per node on every refresh `[biggest win]`

**File:** [NetworkView.tsx](../apps/web/src/components/NetworkView.tsx#L349-L397) — `nodeThreeObject`

Every node builds a fresh 128×128 `<canvas>`, paints a circle, and wraps it in a new
`CanvasTexture` + `SpriteMaterial`. This runs:

- once per node on initial build, and
- again for **every** node whenever `nodeColors` changes, because the effect at
  [NetworkView.tsx:272-275](../apps/web/src/components/NetworkView.tsx#L272-L275) calls
  `fgRef.current.refresh()`, which re-invokes `nodeThreeObject` for the whole graph.

For a 500-node graph, a single recolor rasterizes ~500 canvases and uploads ~500 GPU
textures. That is the stall.

**Fix:** the circle sprite depends only on `borderColor` (+ `isRoot` scale), and there are
only ~7 palette colors. Cache the texture/material by a `${color}` key in a module-level
`Map` and reuse it; only the `SpriteText` label is per-node. This turns hundreds of
rasterizations into ~7. Sprites can share a material safely (scale lives on the sprite,
not the material).

```ts
const circleTextureCache = new Map<string, CanvasTexture>();
function circleTexture(borderColor: string): CanvasTexture {
  const cached = circleTextureCache.get(borderColor);
  if (cached) return cached;
  // ...existing canvas painting...
  circleTextureCache.set(borderColor, texture);
  return texture;
}
```

Also consider gating the `refresh()` effect: it currently fires on any `nodeColors`
identity change even if no visible color actually changed.

### P2. The layout force-sim runs synchronously on the main thread

**File:** [mindMapLayout.ts](../apps/web/src/lib/mindMapLayout.ts#L119-L129) —
`SETTLE_TICKS = 120`

`mindMapLayout` runs a 120-tick `forceSimulation(...).tick(120)` **synchronously**, inside
the render-path `useMemo` at
[NetworkView.tsx:127-209](../apps/web/src/components/NetworkView.tsx#L127-L209). It re-runs
on every change to `thoughts`, `edgeRels`, or `focusedNodeId`. On large graphs this is a
visible main-thread block on each focus/data tick.

Options, cheapest first:

1. **Scale ticks to graph size** — small graphs don't need 120; large graphs pay the most
   and benefit least from the last 60. e.g. `Math.min(120, Math.round(4000 / nodeCount))`.
2. **Move it to a Web Worker.** The function is already pure and deterministic (no DOM, no
   React) — an ideal worker candidate. The graph already renders pinned/settled, so an
   async layout that resolves a beat later is invisible to the user. This is the real fix
   if graphs keep growing.

### P3. Secondary perf notes

- `buildGraphData` (the big `useMemo`) recomputes nodes+links+bbox+full layout on every
  `edgeRels` change even when only positions matter; splitting derivation from layout
  (see F3) lets you memoize them independently.
- Everything else in the render path is already well-optimized: the live force engine
  never runs (`cooldownTicks={0}`, all nodes pinned), node drag is disabled, and the
  resize refit is debounced. Good.

**Suggested order:** P1 first (largest win, lowest risk), then P2 step 1 (tick scaling),
then P2 step 2 (worker) only if still needed.

---

## Part 2 — Frontend verbosity & structure

### F1. `HomePage.tsx` (573 lines) is a god component `[high value]`

[HomePage.tsx](../apps/web/src/components/HomePage.tsx) holds at least seven distinct
responsibilities: project CRUD, desktop focus-nav, mobile drill-nav, the graph-sheet
pointer-drag gesture (~90 lines of DOM math,
[99-156](../apps/web/src/components/HomePage.tsx#L99-L156)), the idle-preload effect,
delete-confirm, color logic, **and two complete render trees** (mobile + desktop).

Extract, in payoff order:

- `useGraphSheet()` — the drag/pointer/history-index block
  ([62-156](../apps/web/src/components/HomePage.tsx#L62-L156)). ~100 lines out.
- `useDrillNavigation()` and `useFocusNavigation()` — the two nav state machines + their
  self-heal effects.
- `usePreloadGraph()` — the `requestIdleCallback` mount
  ([72-82](../apps/web/src/components/HomePage.tsx#L72-L82)).
- Split render into `<DesktopHome>` / `<MobileHome>` over a shared `useHomeState()`.

### F2. Graph-thoughts shaping is duplicated `[DRY / drift risk]`

Desktop `networkThoughts` ([371-377](../apps/web/src/components/HomePage.tsx#L371-L377))
and mobile `graphThoughts` ([426-433](../apps/web/src/components/HomePage.tsx#L426-L433))
build the same "focused node first, top-level nodes reparented onto the project root"
shape with different code; ditto `nodesAround`. Pull both into `lib/neighbourhood.ts` as
pure functions used by both layouts.

### F3. `NetworkView.tsx` (457 lines) mixes five concerns `[high value; also enables P1/P2]`

It's simultaneously a React component, a three.js renderer, a graph-data builder, a camera
controller, and a hit-tester. Extract (all pure/testable):

- `lib/truncateLabel.ts` — word-wrap ([16-41](../apps/web/src/components/NetworkView.tsx#L16-L41)).
- `lib/buildGraphData.ts` — the nodes/links/bbox/positions `useMemo`
  ([127-209](../apps/web/src/components/NetworkView.tsx#L127-L209)).
- `lib/graphNode.ts` — the `nodeThreeObject` factory
  ([349-397](../apps/web/src/components/NetworkView.tsx#L349-L397)) — **this is also where
  the P1 texture cache lands.**
- `useGraphCamera()` — fit/refit ([215-298](../apps/web/src/components/NetworkView.tsx#L215-L298)).
- `useTapSelect()` — raycast tap detection ([313-347](../apps/web/src/components/NetworkView.tsx#L313-L347)).

`NetworkView` becomes a ~80-line shell. Doing F3 first makes P1/P2 cleaner to land.

### F4. `ThoughtsList.tsx` (579 lines) — three components in one

- Six inline SVG icons ([41-82](../apps/web/src/components/ThoughtsList.tsx#L41-L82));
  NetworkView also defines its own inline SVGs. Move all to `components/icons.tsx`.
- Extract `<ListHeader>` (title/body inline-edit + labels + nav) and `<ListFilterBar>`
  (search + label menu).
- The **click-outside-to-close** effect is written 3× here
  ([148-157](../apps/web/src/components/ThoughtsList.tsx#L148-L157),
  [173-182](../apps/web/src/components/ThoughtsList.tsx#L173-L182)) and elsewhere → a
  `useClickOutside(ref, onClose)` hook.

### F5. `useThoughts.ts` is the model to copy

The `useWorkspaceMutation` factory keeps the six mutations uniform and terse. Leave it;
replicate the pattern elsewhere.

### Cross-cutting

- `#e8a838` default node color is hardcoded in three places (HomePage `DEFAULT_NODE_COLOR`,
  NetworkView [350](../apps/web/src/components/NetworkView.tsx#L350),
  [397](../apps/web/src/components/NetworkView.tsx#L397)) → one shared constant.
- `NODE_COLORS` palette lives in `ThoughtsList` but is graph-domain data → move to `lib/`.

---

## Part 3 — Backend verbosity & anti-patterns

### B1. N+1 query loops in the internal MCP controller `[perf + verbosity]`

[internal-mcp.controller.ts](../apps/api/src/internal-mcp/internal-mcp.controller.ts):

- `thoughtToPrompt` ([206](../apps/api/src/internal-mcp/internal-mcp.controller.ts#L206))
  and `elaborate` ([159](../apps/api/src/internal-mcp/internal-mcp.controller.ts#L159))
  fetch children/siblings by calling `findOne` **in a loop**, each opening its own `asUser`
  transaction. 20 children = 20 round trips + 20 RLS transactions.
- `getThoughtLabels` ([345](../apps/api/src/internal-mcp/internal-mcp.controller.ts#L345))
  and `thoughtToPrompt` ([211](../apps/api/src/internal-mcp/internal-mcp.controller.ts#L211))
  contain the identical "for each tag rel, `select` the label one at a time" loop — N+1 and
  copy-pasted.

Fix: single `inArray(...)` fetch or a join inside one `asUser` tx.

### B2. The controller does data access it shouldn't `[structural]`

`elaborate` / `thoughtToPrompt` / `getThoughtLabels` / `removeLabelFromThought` reach
directly into `this.db` and schema tables. Move that logic into a `RetrievalService` (or
the relevant labels/relationships services). Fixes B1 in passing and drops the controller
from 440 → ~200 lines of pure routing.

### B3. Repeated `userIdFromHeaders(req)` in ~25 handlers `[idiomatic]`

Replace with a custom Nest param decorator:

```ts
export const McpUserId = createParamDecorator((_, ctx) => {
  const id = ctx.switchToHttp().getRequest().header('x-mcp-user-id');
  if (!id) throw new UnauthorizedException('Missing x-mcp-user-id header');
  return id;
});
```

Then `listProjects(@McpUserId() userId: string)`.

### B4. Duplicated write-guard + SSE-emit boilerplate `[DRY]`

The pattern
```ts
const x = await this.findOne(userId, id);
if (x.ownerId !== userId) throw new ForbiddenException(READ_ONLY_GRAPH_MESSAGE);
```
is copy-pasted across thoughts/relationships/labels
([thoughts.service.ts:258](../apps/api/src/workspace/thoughts/thoughts.service.ts#L258),
[:336](../apps/api/src/workspace/thoughts/thoughts.service.ts#L336),
[relationships.service.ts:248](../apps/api/src/workspace/relationships/relationships.service.ts#L248)),
and the emit literal `{ source, resourceId, projectId }` recurs ~10×. Extract
`assertWritable(entity, userId)` and give `WorkspaceEventsService` a typed
`emit(userId, type, resourceId, projectId, source)` signature.

### B5. `thoughts.service.ts` — `create` and `createBatch` are the same op twice `[flagged file]`

`create` ([29](../apps/api/src/workspace/thoughts/thoughts.service.ts#L29)) is essentially
`createBatch` of one, reimplemented. Improve readability by:

- moving batch-hierarchy validation
  ([123-156](../apps/api/src/workspace/thoughts/thoughts.service.ts#L123-L156): dup-ref,
  parentRef/parentId exclusivity, cycle detection) into a **pure helper**
  `resolveBatchRefs(items)` — separate validation from the DB transaction.
- sharing the "parent must be a thought in the same project" check, currently written twice
  ([66](../apps/api/src/workspace/thoughts/thoughts.service.ts#L66),
  [168](../apps/api/src/workspace/thoughts/thoughts.service.ts#L168)).

### B6. Update paths still unvalidated (pre-existing finding #4)

Create paths are Zod-validated; `update` takes a plain `patch` object. Worth closing.

---

## Priority table

| # | Item | Effort | Payoff |
|---|------|--------|--------|
| **P1** | **Cache node textures by color** | **S** | **Direct fix for sluggishness** |
| **P2** | **Scale layout ticks / move to worker** | **S–M** | **Main-thread stalls on large graphs** |
| F3 | Extract NetworkView into pure modules | M | Readability + unblocks P1/P2 cleanly |
| B1/B2 | Fix MCP N+1 + move logic to service | M | Perf + big line drop |
| F1 | Break up HomePage into hooks + 2 views | M | Readability |
| F4 | Shared `useClickOutside` + `icons.tsx` | S | DRY |
| B3/B4 | `@McpUserId` decorator + `assertWritable` | S | Boilerplate |
| B5 | Split validation from DB work in thoughts.service | S | Flagged file |

All items are behaviour-preserving. Given the current priority, the recommended start is
**P1 → P2**, optionally preceded by **F3** so the texture cache and layout call land in
clean, single-purpose modules.
