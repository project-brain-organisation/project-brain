# ThoughtCard improvements (applied to the drafts)

Research-backed changes now reflected in `components/ThoughtCard.tsx` and
`../components/Editable.tsx`.

## 1. Accessibility

- **Icon buttons got `aria-label`s** (`Set parent thought` / `View as node` /
  `Remove thought`). `title` alone isn't a reliable accessible name.
- **Click-to-edit is now keyboard-reachable.** The display title/body get
  `role="button"`, `tabIndex={0}`, and Enter/Space handlers (WAI-ARIA button
  pattern), so keyboard users can enter edit mode — previously mouse-only.
  Implemented once in `Editable` (covers the header) and via a small
  `editTrigger()` helper in `ThoughtCard` (its title/body are hand-rolled because
  of the pointer-down swallow-click guard). Omitted entirely when `readOnly`.

## 2. Drag-and-drop → `@atlaskit/pragmatic-drag-and-drop`

Replaces native HTML5 DnD and the module-global `dragState`.

```bash
npm i @atlaskit/pragmatic-drag-and-drop --workspace apps/web
```

What changed and why:

- **The module-global is gone.** The cycle-blocked set (`selfAndDescendants`)
  now travels *with* the drag as `source.data.blocked`, so each drop target reads
  it directly in `canDrop`. No shared mutable singleton across card instances.
- **Touch drag now works** (native HTML5 DnD never fired touch events — that's why
  the code routed touch to the `ParentPicker`). The ParentPicker stays as the
  single-pointer / a11y fallback, satisfying **WCAG 2.5.7 (Dragging Movements)**.
- **Fewer browser quirks / no `dataTransfer` plumbing.** `draggable` +
  `dropTargetForElements` are registered imperatively in one `useEffect`, combined
  with `combine()`; a `live` ref feeds them fresh state so we register once per
  element instead of re-binding on every render.
- The `draggable` DOM attribute is removed — the library sets it internally.

Still **not** keyboard-accessible *dragging* (only the ParentPicker path is). If
you want keyboard drag too, that's `@atlaskit/pragmatic-drag-and-drop` +
its optional keyboard support, or `dnd-kit` — a further step, not done here.

## 3. `formatTime`

- Computed **once** per render (`const time = …`) instead of twice (guard + JSX).
- Caches a single module-level `Intl.DateTimeFormat` instead of building one per
  call.

## CSS follow-up (not code)

Add a visible focus ring for the newly-focusable edit triggers, e.g.
`.thought-card-tag:focus-visible, .thought-card-text:focus-visible { outline: … }`
— keyboard focus now lands on them, so they need a focus style.
