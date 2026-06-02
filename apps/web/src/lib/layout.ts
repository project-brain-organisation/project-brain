import { hierarchy, tree } from 'd3-hierarchy';
import type { Node, Edge } from '@xyflow/react';

export interface IdeaInput {
  id: string;
  parentId: string | null;
  name: string;
  isRoot?: boolean;
}

interface HierarchyDatum {
  id: string;
  name: string;
  isRoot: boolean;
  children: HierarchyDatum[];
}

export function computeRadialLayout(
  ideas: IdeaInput[],
  _width: number,
  _height: number,
): { nodes: Node[]; edges: Edge[] } {
  if (ideas.length === 0) return { nodes: [], edges: [] };

  const map = new Map<string, HierarchyDatum>();
  for (const idea of ideas) {
    map.set(idea.id, { id: idea.id, name: idea.name, isRoot: !!idea.isRoot, children: [] });
  }

  let rootDatum: HierarchyDatum | undefined;
  for (const idea of ideas) {
    const node = map.get(idea.id)!;
    if (idea.parentId && map.has(idea.parentId)) {
      map.get(idea.parentId)!.children.push(node);
    } else if (!idea.parentId) {
      rootDatum = node;
    }
  }

  if (!rootDatum) rootDatum = map.values().next().value!;

  const root = hierarchy(rootDatum);

  // Radial tree: distribute nodes in a full circle
  const levelRadius = 250;
  const RADIAL_JITTER = 60; // max ±px offset per node along radial axis
  const treeLayout = tree<HierarchyDatum>()
    .size([2 * Math.PI, Math.max(root.height, 1) * levelRadius])
    .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth);
  treeLayout(root);

  // Deterministic hash for stable jitter per node
  function jitterFor(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) {
      h = ((h << 5) - h + id.charCodeAt(i)) | 0;
    }
    return (Math.abs(h % 1000) / 1000) * 2 - 1; // -1..1
  }

  // Node sizing: shrinks with depth, jittered per node
  const BASE_DIAMETER = 67;   // root size
  const DECAY = 0.75;         // multiplier per depth level
  const SIZE_JITTER = 4;      // max ±px diameter jitter
  function diameterFor(depth: number, id: string): number {
    const base = BASE_DIAMETER * Math.pow(DECAY, depth);
    return Math.max(24, base + jitterFor(id) * SIZE_JITTER);
  }

  // Project polar → cartesian (root stays at origin) with radial jitter
  const nodes: Node[] = root.descendants().map((d) => {
    const angle = (d as any).x as number;
    const radius = (d as any).y as number;
    const jitteredRadius = d.depth === 0 ? 0 : radius + jitterFor(d.data.id) * RADIAL_JITTER;
    const diameter = diameterFor(d.depth, d.data.id);
    return {
      id: d.data.id,
      type: 'idea',
      position: {
        x: d.depth === 0 ? 0 : jitteredRadius * Math.cos(angle - Math.PI / 2),
        y: d.depth === 0 ? 0 : jitteredRadius * Math.sin(angle - Math.PI / 2),
      },
      data: { label: d.data.name, isRoot: d.data.isRoot, nodeId: d.data.id, depth: d.depth, diameter },
    };
  });

  // Lookup for node center positions
  const posMap = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    posMap.set(n.id, n.position);
  }

  const edges: Edge[] = root.links().map((link) => {
    const srcPos = posMap.get(link.source.data.id)!;
    const tgtPos = posMap.get(link.target.data.id)!;
    return {
      id: `e-${link.source.data.id}-${link.target.data.id}`,
      source: link.source.data.id,
      target: link.target.data.id,
      type: 'tree',
      data: {
        sourceDepth: link.source.depth,
        targetDepth: link.target.depth,
        srcDiameter: diameterFor(link.source.depth, link.source.data.id),
        tgtDiameter: diameterFor(link.target.depth, link.target.data.id),
        srcCx: srcPos.x,
        srcCy: srcPos.y,
        tgtCx: tgtPos.x,
        tgtCy: tgtPos.y,
      },
    };
  });

  return { nodes, edges };
}
