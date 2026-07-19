# Decoupled architecture — target shape

Drafts only. Shows the three-layer split where `ThoughtCard`, `ThoughtsList`,
`NodeHeader` and `HomePage` depend **downward on a domain layer** instead of on
each other's prop shapes. This is the "depend on the abstraction, not the parent"
move — the 15-prop interface is what welds the components to HomePage today.

## The layers (dependencies point down only — no cycles)

```
Domain / state layer  (single source of truth: API, RLS, optimism, navigation)
  useThoughts(projectId)            data + mutations            (exists)
  useThoughtLabels(id, projectId)   a thought's labels/edges    (exists)
  useThoughtNavigation()            drill stack + derived view  ← ThoughtNavigationProvider  (new)
  useThoughtActions()               app write-policy            (new)
  useCurrentProject()               project / readOnly / root   (new)
  useConfirm()                      promise-based confirm       ← ConfirmProvider            (new)
        ▲                    ▲                         ▲
Components  (connect to the domain layer; never import each other's internals)
  ThoughtsList({ createFab? })      → renders NodeHeader + ThoughtCard[]
  NodeHeader({ onNew })             → the active node's header
  ThoughtCard({ thought, autoFocusBody? })
        ▲
Page
  HomePage()                        → mounts providers + does layout only
```

## Prop surfaces, before → after

| Component | Before | After |
|---|---|---|
| `ThoughtsList` | 15 props | `{ createFab? }` |
| `NodeHeader` | 13 props | `{ onNew }` |
| `ThoughtCard` | 8 props | `{ thought, autoFocusBody? }` |
| `HomePage` | 570 lines of wiring | providers + layout (~180) |

The props that survive are **composition**, not app wiring: `createFab` is a
layout intent; `onNew`/`autoFocusBody` are how the list coordinates "open the new
card in edit mode" with its header and cards. Everything domain-shaped
(navigation, mutations, readOnly, colours) comes from hooks.

## Why a provider (and not just hooks)

The graph and the list must read the **same** drill stack — two independent
`useThoughtNavigation()` instances could drift. So the navigation state lives in
`ThoughtNavigationProvider` (mounted once in HomePage), exactly like the existing
`SelectedRootContext`. `NetworkView` consumes the same hook, so tapping a node in
the graph and drilling in the list stay in lockstep for free.

## Files here

| File | Role |
|---|---|
| `lib/rootNode.ts` | `projectToRootNode` (moved out of HomePage) |
| `contexts/ThoughtNavigationProvider.tsx` | owns the drill stack + all view derivations; `useThoughtNavigation()` |
| `contexts/ConfirmProvider.tsx` | `useConfirm()` — replaces the delete-dialog prop drilling |
| `hooks/useCurrentProject.ts` | `{ project, readOnly, rootNode }` |
| `hooks/useThoughtActions.ts` | create / update / remove / reparent / setBorderColor / clone, with the app policy (root→rename, create-under-active, confirm-then-delete, colour routing) |
| `components/ThoughtsList.tsx` | connected, 1 prop |
| `components/NodeHeader.tsx` | connected, 1 prop |
| `components/ThoughtCard.tsx` | connected, 2 props |
| `components/HomePage.tsx` | providers + layout skeleton |

## A simplification this unlocks

The header's border colour was `nodeColors[activeNodeId] || DEFAULT`. But
`activeNode` is a `Thought` (or the root pseudo-node) and already carries
`.color`, so it's just `activeNode?.color ?? DEFAULT_NODE_COLOR` — the whole
`nodeColors` map is only needed by the graph now.

## What deliberately stays in HomePage

`RelationshipsDialog` wiring, the mobile graph-sheet drag mechanics, the
graph-preload effect, and the project empty-state/create form. These are page
layout and chrome, not part of the thought-list domain. `NetworkView`'s own
decoupling (consuming `useThoughtNavigation`) is sketched in the HomePage draft
but is a separate follow-up.

## Migration order (each step ships independently)

1. `ConfirmProvider` + `useConfirm` — mechanical, removes one prop, no behaviour change.
2. `useCurrentProject` — trivial, removes `readOnly`.
3. `ThoughtNavigationProvider` + `useThoughtNavigation` — lift the nav block I already
   unified in HomePage into the provider; point graph + list at it.
4. `useThoughtActions` — fold the create/update/colour/clone/delete policy in.
5. Slim the three components to their new signatures.
