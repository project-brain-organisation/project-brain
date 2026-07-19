# NetworkView rewrite — draft code (read-only preview)

Not wired into the app: these live outside `apps/web/src`, so Vite/TSC won't
compile them. Read them, then I relocate + wire on your go-ahead.

**400 lines across 5 files** (was one 425-line `NetworkView.tsx`).

## Files → final location

| Draft | Final location | Lines | Kind |
|---|---|---|---|
| `graphModel.ts` | `apps/web/src/lib/graphModel.ts` | 140 | pure — data → nodes/links/bbox |
| `useContainerSize.ts` | `apps/web/src/hooks/useContainerSize.ts` | 30 | hook — ResizeObserver |
| `useGraphView.ts` | `apps/web/src/hooks/useGraphView.ts` | 88 | hook — all fgRef wiring (fit/refit/controls/recolour/pause) |
| `useTapSelection.ts` | `apps/web/src/hooks/useTapSelection.ts` | 52 | hook — tap + raycast |
| `NetworkView.tsx` | `apps/web/src/components/NetworkView.tsx` | 90 | component — orchestrator |

Unchanged, not copied here: `lib/graphNode.ts`, `lib/mindMapLayout.ts`, `NetworkView.css`.

## What changes at relocation time

Drafts are colocated, so cross-imports are `./`. Once split across `lib/` and
`hooks/`: in `useGraphView.ts` change `./graphModel` → `../lib/graphModel`.
Everything else already uses final paths.

## Reading order

1. `graphModel.ts` — the pure core; all the hard logic.
2. `NetworkView.tsx` — ~90 lines, mostly JSX props.
3. `useGraphView.ts` → `useTapSelection.ts` → `useContainerSize.ts`.

Behaviour is intended **identical** to the current component. Cuts applied vs the
first draft: comment prose trimmed to one-liners; camera + pause + recolour merged
into `useGraphView`; dead `GraphNode.body` field dropped (written, never read);
hook return types inferred; `truncateLabel` tightened.
