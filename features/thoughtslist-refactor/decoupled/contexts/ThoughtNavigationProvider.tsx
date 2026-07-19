// Destination: apps/web/src/contexts/ThoughtNavigationProvider.tsx
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode,
} from 'react';
import type { Thought } from '../hooks/useThoughts';
import { useThoughts } from '../hooks/useThoughts';
import { useHistoryFlag } from '../hooks/useHistoryFlag';
import { useSelectedRoot } from './SelectedRootContext';
import { useCurrentProject } from '../hooks/useCurrentProject';

interface ThoughtNavigation {
  loading: boolean;
  /** Every thought in the project (not the visible subset) — the drag cycle
   *  guard and cross-links need the whole hierarchy. */
  allThoughts: Thought[];
  /** The node whose header/neighbourhood is shown: a drilled-into node or the root. */
  activeNode?: Thought;
  activeNodeId?: string;
  /** True while drilled below the project root (an empty stack = root). */
  drilled: boolean;
  /** The active node's neighbourhood (children + relationship neighbours), or —
   *  at the un-drilled root — every thought. */
  visibleThoughts: Thought[];
  /** Graph shape: active node first, top-level thoughts hung off the root. */
  networkThoughts: Thought[];
  /** Node id the graph should highlight (undefined when not drilled). */
  graphFocusId?: string;
  /** Per-node colours for the graph. */
  nodeColors: Record<string, string>;
  navigateToNode: (id: string) => void;
  navigateUp: () => void;
  navigateToRoot: () => void;
}

const Ctx = createContext<ThoughtNavigation | null>(null);

/** The single navigation stack shared by the list and the graph. History-backed,
 *  so the OS/browser Back gesture pops one level on both mobile and desktop. */
export function useThoughtNavigation(): ThoughtNavigation {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useThoughtNavigation must be used within ThoughtNavigationProvider');
  return ctx;
}

export function ThoughtNavigationProvider({ children }: { children: ReactNode }) {
  const { selectedRootId } = useSelectedRoot();
  const { project, rootNode } = useCurrentProject();
  const { thoughts, edgeRelationships, loading } = useThoughts(selectedRootId);

  // The drill stack; its tail is the active node. Stored in history so Back pops.
  const [drillPath, pushDrill, popDrill] = useHistoryFlag<string[]>('drill');
  const drillId = drillPath?.[drillPath.length - 1];

  const navigateToNode = useCallback((id: string) => {
    if (!id) return;
    const path = drillPath ?? [];
    if (path[path.length - 1] === id) return; // ignore no-op re-tap
    pushDrill([...path, id], { push: true });
  }, [drillPath, pushDrill]);

  const navigateUp = useCallback(() => {
    if (drillPath?.length) popDrill(1);
  }, [drillPath, popDrill]);

  const navigateToRoot = useCallback(() => {
    if (drillPath?.length) popDrill(drillPath.length);
  }, [drillPath, popDrill]);

  // Switching project invalidates navigation that pointed into the old graph.
  const prevRootId = useRef(selectedRootId);
  useEffect(() => {
    if (prevRootId.current === selectedRootId) return;
    prevRootId.current = selectedRootId;
    if (drillPath?.length) popDrill(drillPath.length);
  }, [selectedRootId, drillPath, popDrill]);

  // Self-heal a dangling tail (e.g. the node was deleted by an MCP client).
  useEffect(() => {
    if (loading || !drillId || drillId === selectedRootId) return;
    if (!thoughts.some((t) => t.id === drillId)) popDrill(1);
  }, [loading, drillId, thoughts, selectedRootId, popDrill]);

  const drilled = !!drillPath?.length;
  const activeNodeId =
    drillId && thoughts.some((t) => t.id === drillId) ? drillId : selectedRootId;
  const graphFocusId = drilled ? activeNodeId : undefined;

  const activeNode = activeNodeId === selectedRootId
    ? rootNode
    : thoughts.find((t) => t.id === activeNodeId);

  // A node's neighbourhood: direct children + relationship neighbours. Shared by
  // the list and graph so they always show the same set.
  const nodesAround = useCallback((id: string) => {
    if (id === selectedRootId) return thoughts.filter((t) => !t.parentId);
    const around = thoughts.filter((t) => t.parentId === id);
    const present = new Set(around.map((t) => t.id));
    present.add(id);
    for (const rel of edgeRelationships) {
      const otherId = rel.sourceId === id ? rel.targetId : rel.targetId === id ? rel.sourceId : null;
      if (!otherId || present.has(otherId)) continue;
      const other = thoughts.find((t) => t.id === otherId);
      if (!other) continue;
      around.push(other);
      present.add(otherId);
    }
    return around;
  }, [thoughts, edgeRelationships, selectedRootId]);

  const visibleThoughts = useMemo(() => {
    if (!selectedRootId) return [];
    if (drilled && activeNodeId) return nodesAround(activeNodeId);
    return thoughts;
  }, [thoughts, selectedRootId, drilled, activeNodeId, nodesAround]);

  const networkThoughts = useMemo(() => {
    if (!activeNode) return [];
    const withParents = visibleThoughts
      .filter((t) => t.id !== activeNode.id)
      .map((t) => (t.parentId ? t : { ...t, parentId: selectedRootId ?? null }));
    return [activeNode, ...withParents];
  }, [activeNode, visibleThoughts, selectedRootId]);

  const nodeColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of thoughts) if (t.color) map[t.id] = t.color;
    if (project?.color) map[project.id] = project.color;
    return map;
  }, [thoughts, project]);

  const value = useMemo<ThoughtNavigation>(() => ({
    loading, allThoughts: thoughts, activeNode, activeNodeId, drilled,
    visibleThoughts, networkThoughts, graphFocusId, nodeColors,
    navigateToNode, navigateUp, navigateToRoot,
  }), [
    loading, thoughts, activeNode, activeNodeId, drilled, visibleThoughts,
    networkThoughts, graphFocusId, nodeColors, navigateToNode, navigateUp, navigateToRoot,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
