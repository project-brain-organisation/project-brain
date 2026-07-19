# ThoughtsList / ThoughtCard refactor — proposed files

These are **drafts for review**, not wired into the app. Each file has a banner
comment naming its intended destination under `apps/web/src/`. The folder here
mirrors that structure so the mapping is obvious.

## What moves where

| New file | Destination | Replaces |
|---|---|---|
| `lib/autoGrow.ts` | `apps/web/src/lib/` | the 6 inline `el.style.height = 'auto'; …scrollHeight` copies |
| `hooks/useClickOutside.ts` | `apps/web/src/hooks/` | the 2 identical mousedown effects in ThoughtsList |
| `hooks/useInlineEdit.ts` | `apps/web/src/hooks/` | the 4 title/body edit state machines (draft + focus + commit/cancel) |
| `hooks/useLabelEditor.tsx` | `apps/web/src/hooks/` | `useThoughtLabels` + picker state + `openPicker`/`openEdgePicker` + the `createPortal(<LabelPicker/>)` block, in **both** files |
| `hooks/useLabelFilter.ts` | `apps/web/src/hooks/` | search + labelFilter + `labelledThoughtIds` + project-switch reset in ThoughtsList |
| `components/icons.tsx` | `apps/web/src/components/` | the 5 inline SVG icon components + the FAB/parent SVGs |
| `components/LabelRow.tsx` | `apps/web/src/components/` | the label+edge chip block duplicated in both files |
| `components/SearchBar.tsx` | `apps/web/src/components/` | the search/filter UI block in ThoughtsList |
| `components/ThoughtCard.tsx` | overwrites existing | 333 → ~185 lines |
| `components/ThoughtsList.tsx` | overwrites existing | 579 → ~250 lines |

## Deliberately left inline

- **The card's pointerdown swallow-click guard** (`EDITING_INPUTS` /
  `shouldSwallowClick`) and the **HTML5 drag-to-reparent** handlers stay in
  ThoughtCard — they're card-specific and don't duplicate anything.
- **The card's "Add title" placeholder chip** stays inline: its markup differs
  enough from the list's that folding it into `useInlineEdit` would add
  branches, not remove them. `useInlineEdit` owns the *editor*; each caller
  keeps its own display markup and placeholder.

## Suggested landing order

1. `autoGrow`, `useClickOutside`, `icons` — pure moves, zero behaviour change.
2. `LabelRow`, `useLabelEditor` — the biggest shared-code win, low risk.
3. `useInlineEdit` — touches the trickiest focus/blur paths; land it alone.
4. `useLabelFilter` + `SearchBar` — self-contained, ThoughtsList only.

## One behaviour normalisation to be aware of

Today the **list header** title editor does *not* restore the draft on Escape,
while the **card** title editor does. `useInlineEdit` makes both restore on
Escape (the card's behaviour). That's the intended, consistent version — flag it
if you'd rather keep them different.
