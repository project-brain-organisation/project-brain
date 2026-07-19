# Base UI + lucide layer — proposed changes

Layers on top of the extraction refactor (`../hooks`, `../components`). This pass
swaps the three hand-rolled overlays for **Base UI** headless primitives and the
inline SVGs for **lucide-react**, then deletes the code that becomes dead.

Drafts only — nothing here is wired into the app.

## Dependencies to add

```bash
npm i @base-ui-components/react lucide-react --workspace apps/web
```

> Package/import-root caveat: Base UI's docs site currently shows the shorter
> `@base-ui/react/...` import root, while the published package has been
> `@base-ui-components/react`. Confirm with `npm view @base-ui-components/react`
> (and `npm view @base-ui/react`) and use whichever matches what you install.
> Everything below uses `@base-ui-components/react/<component>`.

## Files DELETED (become dead)

| File | Why |
|---|---|
| `../components/icons.tsx` | every icon now imports from `lucide-react` |
| `../hooks/useClickOutside.ts` | both remaining callers (color picker, filter menu) move to Base UI, which owns outside-click itself |

## Files ADDED / REWRITTEN (in this folder)

| File | What |
|---|---|
| `components/ColorPicker.tsx` | new — the header color swatch popover, on Base UI `Popover`. Encapsulates `NODE_COLORS`, which leaves ThoughtsList. |
| `components/SearchBar.tsx` | rewrite — filter dropdown on Base UI `Menu.CheckboxItem` (multi-select, stays open), icons from lucide. No more `menuOpen`/ref/click-outside. |

## Edits to existing extraction-refactor files (diffs below)

### `../hooks/useLabelFilter.ts` — drop the menu-open bookkeeping

Base UI's `Menu.Root` owns its own open state, so the hook no longer tracks it:

```diff
-  const [menuOpen, setMenuOpen] = useState(false);
   ...
   if (filterProjectId !== projectId) {
     setFilterProjectId(projectId);
     setLabelFilter(new Set());
-    setMenuOpen(false);
   }
   ...
   return {
     search, setSearch,
     labels, labelFilter, toggleLabel,
-    menuOpen, setMenuOpen,
     filter, clear,
     filtersActive: !!query || labelFilter.size > 0,
   };
```

### `../components/ThoughtsList.tsx`

```diff
-import { useState, useCallback, useRef, useEffect } from 'react';
+import { useState, useCallback, useRef, useEffect } from 'react';
 ...
-import { useClickOutside } from '../hooks/useClickOutside';
 ...
-import { CloneIcon, ChevronUpIcon, ChevronDownIcon, HomeIcon, PlusIcon } from './icons';
+import { Copy, ChevronUp, ChevronDown, Home, Plus } from 'lucide-react';
+import { ColorPicker } from './ColorPicker';
 ...
-const NODE_COLORS = [ ... ];   // moves into ColorPicker.tsx
 ...
-  const [colorPickerOpen, setColorPickerOpen] = useState(false);
-  const colorPickerRef = useRef<HTMLDivElement>(null);
 ...
-  useClickOutside(colorPickerRef, colorPickerOpen, () => setColorPickerOpen(false));
```

The whole `node-color-picker` block in the title row collapses to one line:

```diff
-            {!readOnly && (
-            <div className="node-color-picker" ref={colorPickerRef}>
-              <button className="node-color-dot" style={{ background: nodeBorderColor }}
-                onClick={() => setColorPickerOpen(!colorPickerOpen)} title="Node border color" />
-              {colorPickerOpen && (
-                <div className="node-color-swatches">
-                  {NODE_COLORS.map((c) => ( ...swatch buttons... ))}
-                </div>
-              )}
-            </div>
-            )}
+            {!readOnly && (
+              <ColorPicker value={nodeBorderColor} onChange={onNodeBorderColorChange} />
+            )}
```

Remaining icon element swaps (lucide takes `size`, default strokeWidth 2 already matches):

```diff
-                  <ChevronUpIcon />           →  <ChevronUp size={15} />
-                  <HomeIcon />                →  <Home size={15} />
-                <CloneIcon />                 →  <Copy size={15} />
-          <ChevronDownIcon />   (jump btn)   →  <ChevronDown size={14} />
-          icon={<PlusIcon />}   (Fab)        →  icon={<Plus size={24} />}
```

### `../components/ThoughtCard.tsx`

```diff
-import { ReparentIcon } from './icons';
+import { ArrowUpToLine } from 'lucide-react';
 ...
-                <ReparentIcon />              →  <ArrowUpToLine size={13} />
```

## CSS follow-ups (small)

Base UI portals the popup and positions it for you, and exposes state via data
attributes instead of the `--open`/`--on` modifier classes:

- `.node-color-swatches` — drop its `position:absolute`/`top`/`left` rules; keep
  the visual (padding, grid, background). Base UI's `Positioner` places it.
- `.thoughts-list-filter-menu` — same: drop the absolute positioning.
- `.thoughts-list-filter-toggle--open { … }` → `.thoughts-list-filter-toggle[data-popup-open] { … }`
- `.thoughts-list-filter-item--on { … }` → `.thoughts-list-filter-item[data-checked] { … }`
- The `.node-color-picker` wrapper is no longer an anchor; keep it only if the
  title-row flex layout needs it, otherwise delete.

## Net effect

- Deletes `icons.tsx` (~70 lines) and `useClickOutside.ts` (~18 lines).
- Removes ~30 lines of overlay state/markup from ThoughtsList and SearchBar.
- The three overlays get focus management, Escape, ARIA roles, and collision-aware
  positioning for free — behaviour we weren't hand-rolling before.
- Two dependencies added; no styled kit, no inline-edit library (that stays the
  `useInlineEdit` hook, which the research confirmed is the idiomatic approach).
