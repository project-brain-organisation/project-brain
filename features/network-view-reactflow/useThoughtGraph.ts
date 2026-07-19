// DRAFT (React Flow) — final: apps/web/src/hooks/useThoughtGraph.ts
//
// Turns thoughts into React Flow nodes & edges and positions them. It does NOT
// filter: HomePage already narrows `thoughts` to the focused neighbourhood (via
// nodesAround, shared with the thought list so they never diverge). This hook
// uses `focusedNodeId` only to root the layout so the focused node sits at the
// centre. The layout itself lives in one place, mindMapLayout (d3-hierarchy +
// d3-force); this hook just feeds it and packages the result:
//   https://reactflow.dev/learn/layouting/layouting
//
// Edges are NOT deduplicated. A pair joined by both hierarchy and a
// relationship (or by several relationships) keeps every edge, so the extra
// force-links pull that pair closer. forceCollide in mindMapLayout still
// guarantees nodes never overlap, so duplicates can't stack them.

import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { Thought, EdgeRelationship } from './useThoughts';
import { mindMapLayout } from '../lib/mindMapLayout';

export const DEFAULT_NODE_COLOR = '#e8a838';

// Label wraps to at most this many chars/line in CSS; used here only to bound
// the layout footprint estimate.
const LABEL_MAX_CHARS = 20;
const LABEL_HEIGHT = 2.5;
const ROOT_LABEL_HEIGHT = 4.5;

export interface ThoughtNodeData {
  title: string;
  isRoot: boolean;
  hasTitle: boolean;
  color: string;
  // React Flow v12 requires node data to be an index-signature record.
  [key: string]: unknown;
}
export type ThoughtFlowNode = Node<ThoughtNodeData, 'thought'>;

/** Rough half-width of a node's footprint, in layout units. An estimate: the
 *  label clamps to LABEL_MAX_CHARS/line in CSS and React Flow measures the true
 *  size after paint, so this only needs to seed the initial spacing. */
function nodeRadius(title: string, isRoot: boolean, hasTitle: boolean): number {
  const circle = isRoot ? 8 : 5.5;
  if (!hasTitle) return circle;
  const th = isRoot ? ROOT_LABEL_HEIGHT : LABEL_HEIGHT;
  const chars = Math.min(title.length, LABEL_MAX_CHARS);
  return Math.max(circle, chars * th * 0.22);
}

export function useThoughtGraph(
  thoughts: Thought[],
  edgeRels: EdgeRelationship[],
  nodeColors: Record<string, string>,
  focusedNodeId: string | undefined,
): { nodes: ThoughtFlowNode[]; edges: Edge[] } {
  return useMemo(() => {
    const idSet = new Set(thoughts.map((t) => t.id));
    const edges: Edge[] = [];
    const links: { source: string; target: string }[] = [];

    // Hierarchy edges first, so the layout's spanning tree follows the hierarchy.
    for (const t of thoughts) {
      if (t.parentId && idSet.has(t.parentId)) {
        edges.push({
          id: `h:${t.parentId}:${t.id}`,
          source: t.parentId,
          target: t.id,
          style: { stroke: '#222222', strokeWidth: 1 },
        });
        links.push({ source: t.parentId, target: t.id });
      }
    }
    // Every relationship, duplicates included. Index keeps edge ids unique.
    edgeRels.forEach((rel, i) => {
      if (!idSet.has(rel.sourceId) || !idSet.has(rel.targetId)) return;
      edges.push({
        id: `r${i}:${rel.sourceId}:${rel.targetId}`,
        source: rel.sourceId,
        target: rel.targetId,
        label: rel.label?.name,
        labelStyle: { fill: rel.label?.color || '#999', fontSize: 9, letterSpacing: 0.8 },
        style: { stroke: 'rgba(200,200,200,0.6)', strokeWidth: 1 },
        className: 'rel-edge',
      });
      links.push({ source: rel.sourceId, target: rel.targetId });
    });

    // Root at the focused node (HomePage centres the graph on it); otherwise the
    // project root, falling back to the first thought.
    const rootId =
      (focusedNodeId && idSet.has(focusedNodeId) ? focusedNodeId : undefined) ??
      (thoughts.find((t) => t.isRoot) ?? thoughts[0])?.id ??
      '';
    const positions = mindMapLayout(
      thoughts.map((t) => ({
        id: t.id,
        radius: nodeRadius(t.title || '', t.isRoot, !!t.title),
      })),
      links,
      rootId,
    );

    const nodes: ThoughtFlowNode[] = thoughts.map((t) => ({
      id: t.id,
      type: 'thought',
      position: positions.get(t.id) ?? { x: 0, y: 0 },
      data: {
        title: t.title || '',
        isRoot: t.isRoot,
        hasTitle: !!t.title,
        color: nodeColors[t.id] || DEFAULT_NODE_COLOR,
      },
    }));

    return { nodes, edges };
  }, [thoughts, edgeRels, nodeColors, focusedNodeId]);
}
