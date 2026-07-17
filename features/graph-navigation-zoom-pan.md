# Graph navigation — zoom and pan that sticks

Source: brain thought `79045014` ("Graph Navigation", To Do, FEATURE label).
"I want to be able to navigate large graphs by zooming and scrolling."

## What's actually wrong

Zoom (wheel/pinch dolly) and pan already work — [NetworkView.tsx:240-245](../apps/web/src/components/NetworkView.tsx#L240-L245)
only disables *rotation*. The navigation-killer is the auto-fit:
[fitGraph](../apps/web/src/components/NetworkView.tsx#L210-L229) re-frames the camera on **every**
`bbox`/`dimensions` change via the debounced effect at lines 226-229. Any
snapshot refetch (SSE invalidation, optimistic mutation echo, resize) yanks
the camera back to full-frame, so on a large graph you can never *stay*
zoomed into a region.

## 1. Refit only on identity changes

- [ ] Split "the graph I'm looking at changed" (projectId / focusedNodeId
      transition — refit) from "the same graph's data ticked" (keep the
      user's camera). Track the previous identity in a ref; the fit effect
      refits only when identity changes or on first mount.
- [ ] Container resize: keep refit (mobile sheet resizes need it), but only
      if the user hasn't navigated since the last fit (see next step).

## 2. Respect user intent

- [ ] Listen for the controls' `start`/`change` events to flag
      `userNavigated`. Once set, suppress non-identity refits; clear the flag
      on identity change.
- [ ] Add a small "re-centre" button overlaying the graph (target/crosshair
      icon) that calls `fitGraph()` manually — the escape hatch once refit
      stops being automatic.

## 3. Comfortable limits

- [ ] Clamp dolly distance (`controls.minDistance` / `maxDistance` derived
      from the bbox) so users can't zoom through the plane or lose the graph
      to a speck.
- [ ] Verify panning is enabled in both control flavours (`noPan` /
      `enablePan`) and that pinch-to-zoom works on mobile inside the graph
      surface without scrolling the page behind it (`touch-action` on the
      canvas container).

## 4. Verify

- [ ] Large graph (the bugs project itself, 100+ thoughts): zoom into a
      cluster, trigger a data change (edit a thought elsewhere / MCP write) —
      camera must not move.
- [ ] Switch project or focus a node — camera refits.
- [ ] Mobile: pinch zoom + drag pan inside the graph; page doesn't scroll.

Coordinate with `features/mobile-graph-top-sheet.md` — the top-sheet layout
re-hosts NetworkView, and these camera rules must survive that move.
