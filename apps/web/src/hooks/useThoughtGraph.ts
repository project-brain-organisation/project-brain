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

// Label footprint estimate (flow px). The label is centred on the node and
// wraps within *_MAX_PX; the layout reserves half its widest line so
// neighbours' labels don't collide. Tune these if labels sit too tight/loose.
const LEAF_CHAR_PX = 5;
const ROOT_CHAR_PX = 7;
const LABEL_MAX_PX = 120;
const ROOT_LABEL_MAX_PX = 150;
// Fraction of a label's widest line reserved on each side. 0.5 = no overlap;
// lower packs labels tighter (the denser mind-map look).
const LABEL_SPACING = 0.42;

export interface ThoughtNodeData {
  title: string;
  isRoot: boolean;
  hasTitle: boolean;
  color: string;
  // React Flow v12 requires node data to be an index-signature record.
  [key: string]: unknown;
}
export type ThoughtFlowNode = Node<ThoughtNodeData, 'thought'>;

/** Spacing footprint half-width, in flow pixels (same units as node.position).
 *  Titled nodes reserve half their label's widest line so centred labels don't
 *  collide. It's an estimate — React Flow measures the true dot size after
 *  paint, which is what edges connect to. */
function nodeRadius(title: string, isRoot: boolean, hasTitle: boolean): number {
  const circle = isRoot ? 21 : 14;
  if (!hasTitle) return circle;
  const charPx = isRoot ? ROOT_CHAR_PX : LEAF_CHAR_PX;
  const maxPx = isRoot ? ROOT_LABEL_MAX_PX : LABEL_MAX_PX;
  const widestLinePx = Math.min(title.length * charPx, maxPx);
  return Math.max(circle, widestLinePx * LABEL_SPACING);
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
          style: { stroke: '#333333', strokeWidth: 0.5 },
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
        // Colour per relationship (its label colour). Width + opacity live in CSS
        // (.rel-edge) so they tune instantly and aren't frozen into this memo.
        style: { stroke: rel.label?.color || '#999999' },
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
