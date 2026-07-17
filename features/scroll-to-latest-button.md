# Scroll-to-latest button in the thought list

Source: brain thought `432f0153` ("Scroll to bottom button", To Do, Bug label).
A WhatsApp-style jump-to-latest affordance: a small, unobtrusive button just
above the FAB that appears once you've scrolled up away from the newest
thought, on mobile AND desktop. (The brain body's "voting action button" /
"what set button" are dictation slips for *floating action button* /
*WhatsApp button*.)

Depends on the in-progress "Thought Ordering" issue (`f741072d`): newest at
the bottom is what makes "scroll to bottom" mean "scroll to latest". Land
ordering first or together.

## 1. Find the real scroll container

- [ ] [ThoughtsList.tsx](../apps/web/src/components/ThoughtsList.tsx) renders the cards and,
      on mobile, the `thoughts-list-fab` (line ~529). Establish which element
      actually scrolls in each layout (mobile single-screen page vs desktop
      panel) — the listener must attach to the right node, and they may differ.

## 2. Visibility state

- [ ] Prefer an `IntersectionObserver` on a 1px sentinel after the last card
      over a scroll listener: `showJump = !sentinelVisible`. No rAF throttling
      needed, works regardless of which ancestor scrolls.
- [ ] Add a small threshold (sentinel `rootMargin` ~100px) so the button
      doesn't flicker at the boundary.

## 3. The button

- [ ] Small circular button (chevron-down glyph), fixed just above the FAB on
      mobile; same position desktop (bottom-right of the list panel, where the
      FAB would sit). Reuse [Fab.css](../apps/web/src/components/Fab.css) sizing tokens at
      ~60-70% scale; `--surface` background, subtle border — unobtrusive per
      the brief.
- [ ] Click → `sentinel.scrollIntoView({ behavior: 'smooth' })` (scrolls
      whatever the container is). Button unmounts once the sentinel is visible.
- [ ] Fade in/out (opacity + transform transition), matching the FAB's
      hide-while-editing behaviour so they never overlap awkwardly.

## 4. Verify

- [ ] Mobile: long list, scroll up → button appears above FAB; tap → smooth
      scroll to newest; button disappears. Keyboard open/editing: FAB hides —
      confirm the jump button hides with it.
- [ ] Desktop: same behaviour in the list panel.
- [ ] Short list (no overflow): button never shows.
