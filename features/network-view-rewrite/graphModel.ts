// DRAFT — final: apps/web/src/lib/graphModel.ts
// Pure, React-free: thoughts + edges + focus → laid-out nodes/links + bbox.

import type { Thought, EdgeRelationship } from '../hooks/useThoughts';
import { mindMapLayout } from './mindMapLayout';
import { LABEL_HEIGHT, ROOT_LABEL_HEIGHT } from './graphNode';

const LABEL_MAX_CHARS = 20;
const LABEL_MAX_LINES = 2;

export interface GraphNode {
  id: string;
  name: string;
  isRoot: boolean;
  hasTitle: boolean;
  x?: number; y?: number; fx?: number; fy?: number; fz?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  isLabelEdge?: boolean;
  labelName?: string;
  labelColor?: string;
}

export interface BBox { minX: number; minY: number; maxX: number; maxY: number; }

export interface GraphModel {
  graphData: { nodes: GraphNode[]; links: GraphLink[] };
  bbox: BBox;
}

/** Word-wrap a title to ≤2 lines of 20 chars, hard-breaking over-long words and
 *  ellipsizing the overflow — full text lives in the card/sheet. */
export function truncateLabel(title: string): string {
  const lines: string[] = [];
  let cur = '';
  const flush = () => { if (cur) { lines.push(cur); cur = ''; } };
  for (let word of title.split(/\s+/).filter(Boolean)) {
    while (word.length > LABEL_MAX_CHARS) {
      flush();
      lines.push(word.slice(0, LABEL_MAX_CHARS));
      word = word.slice(LABEL_MAX_CHARS);
    }
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= LABEL_MAX_CHARS) cur += ' ' + word;
    else { flush(); cur = word; }
  }
  flush();
  if (lines.length <= LABEL_MAX_LINES) return lines.join('\n');
  const last = lines[LABEL_MAX_LINES - 1];
  const clipped = (last.length >= LABEL_MAX_CHARS ? last.slice(0, LABEL_MAX_CHARS - 1) : last).trimEnd();
  return [...lines.slice(0, LABEL_MAX_LINES - 1), clipped + '…'].join('\n');
}

/** Half-width of a node's rendered footprint (circle or label), world units. */
export function nodeRadius(node: GraphNode): number {
  const circle = node.isRoot ? 8 : 5.5;
  if (!node.hasTitle) return circle;
  const textHeight = node.isRoot ? ROOT_LABEL_HEIGHT : LABEL_HEIGHT;
  const widest = Math.max(...node.name.split('\n').map((l) => l.length));
  return Math.max(circle, widest * textHeight * 0.22);
}

const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** Hierarchy links precede overlay edges, so the layout's spanning tree follows
 *  the real hierarchy. Positions are pinned (fx/fy/fz) — the graph is settled on
 *  the first frame and the live engine never runs. */
export function buildGraph(
  thoughts: Thought[],
  edgeRels: EdgeRelationship[],
  focusedNodeId: string | undefined,
): GraphModel {
  let nodes: GraphNode[] = thoughts.map((t) => ({
    id: t.id,
    name: truncateLabel(t.title || ''),
    isRoot: t.isRoot,
    hasTitle: !!t.title,
  }));
  let links: GraphLink[] = [];
  const idSet = new Set(thoughts.map((t) => t.id));

  const existingEdges = new Set<string>();
  for (const t of thoughts) {
    if (t.parentId && idSet.has(t.parentId)) {
      links.push({ source: t.parentId, target: t.id });
      existingEdges.add(pairKey(t.parentId, t.id));
    }
  }
  // Explicit relationships overlay as faded, labelled edges; skip hierarchy dupes.
  for (const rel of edgeRels) {
    if (!idSet.has(rel.sourceId) || !idSet.has(rel.targetId)) continue;
    const key = pairKey(rel.sourceId, rel.targetId);
    if (existingEdges.has(key)) continue;
    links.push({
      source: rel.sourceId,
      target: rel.targetId,
      isLabelEdge: true,
      labelName: rel.label?.name,
      labelColor: rel.label?.color,
    });
    existingEdges.add(key);
  }

  // Focus: keep the node plus its one-hop neighbours.
  if (focusedNodeId && idSet.has(focusedNodeId)) {
    const visible = new Set<string>([focusedNodeId]);
    for (const l of links) {
      if (l.source === focusedNodeId) visible.add(l.target);
      if (l.target === focusedNodeId) visible.add(l.source);
    }
    nodes = nodes.filter((n) => visible.has(n.id));
    links = links.filter((l) => visible.has(l.source) && visible.has(l.target));
  }

  const rootId =
    focusedNodeId && idSet.has(focusedNodeId)
      ? focusedNodeId
      : (nodes.find((n) => n.isRoot) ?? nodes[0])?.id ?? '';
  const positions = mindMapLayout(
    nodes.map((n) => ({ id: n.id, radius: nodeRadius(n) })),
    links,
    rootId,
  );

  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  for (const node of nodes) {
    const pos = positions.get(node.id);
    if (!pos) continue;
    node.x = node.fx = pos.x;
    node.y = node.fy = pos.y;
    node.fz = 0;
    const r = nodeRadius(node);
    minX = Math.min(minX, pos.x - r); maxX = Math.max(maxX, pos.x + r);
    minY = Math.min(minY, pos.y - r); maxY = Math.max(maxY, pos.y + r);
  }
  return { graphData: { nodes, links }, bbox: { minX, minY, maxX, maxY } };
}
