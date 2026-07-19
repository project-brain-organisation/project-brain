# HomePage split: mobile/desktop files + useOverlay hook

[HomePage.tsx](../apps/web/src/components/HomePage.tsx) (295 lines) does two
jobs: project selection (`HomePage`, fine as-is) and `HomeSurface`, which
carries ~90 lines of mobile-only sheet-drag machinery that desktop renders
never use. Split by platform; extract the imperative drag/history/preload
logic into a hook. Everything already flows through context/hooks
(`useSelectedRoot`, `useThoughtNavigation`, `useCurrentProject`,
`useThoughts`), so leaf components read their own data — no prop-drilling.

Target shape (behavior identical, no visual change):

| File | Contents | ~Lines |
| --- | --- | --- |
| `HomePage.tsx` | `HomePage` + thin `HomeSurface`: loading gate, then `isMobile ? <MobileHome/> : <DesktopHome/>` | 100 |
| `MobileHome.tsx` | Mobile JSX: sheet, handle, ThoughtsList, RelationshipsDialog (history-backed) | 70 |
| `DesktopHome.tsx` | Desktop split view: ThoughtsList + NetworkView + RelationshipsDialog (`useState`-backed) | 45 |
| `hooks/useOverlay.ts` | Graph top-sheet state: history flags, idle preload, pointer drag + snap, latch-mount | 100 |

## 1. Extract `useOverlay`

- [x] Move from `HomeSurface` into `apps/web/src/hooks/useOverlay.ts`:
      `useHistoryFlag('graph')`, `graphOpenBaseIdx` open/close wrappers,
      the idle-callback graph preload, `sheetRef`/`sheetDrag`/`sheetDragging`,
      the three pointer handlers, and the `mountGraph` latch.
- [x] Return a small surface: `{ sheetRef, graphOpen, sheetDragging,
      mountGraph, handleProps (onPointerDown/Move/Up/Cancel), closeGraphSheet }`.
- [x] Keep the DOM-first drag invariant (height lives in inline styles, moves
      never re-render React) — carry the existing comments over.

## 2. `MobileHome.tsx`

- [x] Mobile branch of today's `HomeSurface` JSX, consuming `useOverlay()`.
- [x] Keeps `useHistoryFlag('rel')` for the RelationshipsDialog (back-button
      closes it — intentionally different from desktop).
- [x] Reads `nav`, `edgeRelationships`, `readOnly` via the existing hooks.

## 3. `DesktopHome.tsx`

- [x] Desktop branch verbatim: readonly chip, ThoughtsList, NetworkView,
      `useState`-backed RelationshipsDialog.
- [x] No sheet/drag/preload imports — that's the point of the split.

## 4. Slim `HomePage.tsx`

- [x] `HomePage` (project selection + create form) unchanged.
- [x] `HomeSurface` shrinks to: providers already wrap it; `nav.loading`
      gate; `useIsMobile()` fork to the two leaf components.
- [x] Update the doc comments to describe the new shape.

## 5. Verify

- [x] `npm run build:web` clean; no unused imports left in HomePage.
- [ ] Desktop: split view, node focus/cross-filter, Relationships dialog
      open/close, view-only chip on a read-only project.
- [ ] Mobile: tap handle toggles sheet; drag resizes then snaps; back
      gesture closes sheet (and pops in-sheet drills in one go); reopening
      is instant (latch + preload intact); Relationships via back gesture.
