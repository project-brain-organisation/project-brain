# Stale node focus survives project switch — empty graph/list/title

Source: brain thought `ed0b0c15` ("No data when navigating away from filtered
graph", To Do, Bug label). Focus a node (graph filtered), switch project in
the sidebar while still focused → new project shows nothing: no thoughts, no
graph, not even a title. The user's presumption is right: the old filter is
still active against the new project.

## Root cause (confirmed in code)

`focusedNodeId` lives in [HomePage.tsx:52](../apps/web/src/components/HomePage.tsx#L52) and is
only reset by explicit navigation and by `handleCloneProject` — **nothing
clears it when `selectedRootId` changes** via the sidebar. After a switch,
`focusedNodeId` points at a thought of the *old* project; `visibleNodes`
(`nodesAround(focusedNodeId)`, lines ~245-250) finds no such node in the new
snapshot → empty graph and list, and the list header shows the (missing)
focused thought instead of the project title.

The same class of staleness can occur without switching: an MCP-side delete
of the currently focused thought.

## 1. Reset navigation state on project change

- [ ] Clear `focusedNodeId` whenever `selectedRootId` changes. Cleanest is
      at the source: wherever the sidebar's select lands (the
      `setSelectedRootId` path / SelectedRootContext), or an effect in
      HomePage keyed on `selectedRootId`. Prefer the handler over an effect
      if the restored-selection boot path (lines 86-92) makes the effect
      fire on first load.
- [ ] Mobile: the drill path (`drillPath` in router history) and any open
      sheet are project-scoped too — clear/pop them on switch so the back
      stack doesn't replay old-project drills.

## 2. Self-heal dangling focus

- [ ] Belt-and-braces: if `focusedNodeId` is set but absent from `thoughts`
      (and the snapshot isn't still loading), fall back to root view instead
      of rendering empty. Covers external deletion of the focused node, and
      makes the bug class unreproducible rather than just this instance.
      Guard against firing during the initial fetch — only heal on a loaded,
      node-missing snapshot.

## 3. Verify

- [ ] Focus a node → switch project: full new graph + list + title, no
      residue. Switch back: old project at root view (focus not restored —
      acceptable).
- [ ] Mobile: drill two levels → switch project → list at new project root;
      back gesture doesn't resurrect old-project drill state.
- [ ] Delete the focused thought via MCP (second client) → view heals to
      root instead of blanking.
