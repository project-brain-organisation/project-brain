import { hierarchy, tree } from 'd3-hierarchy';

/** Minimum world-unit gap between depth rings. */
const MIN_RING = 34;
/** Tidy trees give each subtree its own sector rather than packing the
 *  circle evenly, so rings need slack beyond the raw label demand. */
const SECTOR_SLACK = 1.6;

export interface RadialNode {
  id: string;
  /** Half-width of the node's rendered footprint (circle or label), world units. */
  radius: number;
}

interface TreeDatum extends RadialNode {
  children: TreeDatum[];
}

/**
 * Deterministic radial tidy-tree layout: root at the origin, each depth on a
 * concentric ring sized so its labels have room. The tree is a BFS spanning
 * tree from rootId — link order matters, so pass hierarchy links before
 * overlay edges. Unreachable nodes (shouldn't exist) hang off the root.
 */
export function radialTreeLayout(
  nodes: RadialNode[],
  links: { source: string; target: string }[],
  rootId: string,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const byId = new Map<string, TreeDatum>(
    nodes.map((n) => [n.id, { ...n, children: [] }]),
  );
  const root = byId.get(rootId) ?? byId.values().next().value;
  if (!root) return positions;

  const adjacency = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    const list = adjacency.get(a);
    if (list) list.push(b);
    else adjacency.set(a, [b]);
  };
  for (const { source, target } of links) {
    if (!byId.has(source) || !byId.has(target)) continue;
    link(source, target);
    link(target, source);
  }

  const depthOf = new Map<string, number>([[root.id, 0]]);
  const queue = [root];
  while (queue.length) {
    const node = queue.shift()!;
    for (const nextId of adjacency.get(node.id) ?? []) {
      if (depthOf.has(nextId)) continue;
      depthOf.set(nextId, depthOf.get(node.id)! + 1);
      const child = byId.get(nextId)!;
      node.children.push(child);
      queue.push(child);
    }
  }
  for (const node of byId.values()) {
    if (!depthOf.has(node.id)) {
      depthOf.set(node.id, 1);
      root.children.push(node);
    }
  }

  const maxDepth = Math.max(...depthOf.values());
  if (maxDepth === 0) {
    positions.set(root.id, { x: 0, y: 0 });
    return positions;
  }

  // Ring spacing: the busiest ring must fit its labels around its circumference.
  const ringDemand = new Map<number, number>();
  for (const [id, depth] of depthOf) {
    if (depth === 0) continue;
    ringDemand.set(depth, (ringDemand.get(depth) ?? 0) + byId.get(id)!.radius * 2);
  }
  let ring = MIN_RING;
  for (const [depth, demand] of ringDemand) {
    ring = Math.max(ring, (demand * SECTOR_SLACK) / (2 * Math.PI) / depth);
  }

  // Angle 0 and 2π are the same direction; leave one leaf-slot of seam so the
  // first and last leaves don't land on top of each other.
  let leaves = 0;
  for (const node of byId.values()) if (node.children.length === 0) leaves++;
  const sweep = 2 * Math.PI * (1 - 1 / Math.max(leaves, 8));

  const layout = tree<TreeDatum>()
    .size([sweep, ring * maxDepth])
    .separation((a, b) => (a.data.radius + b.data.radius || 1) / Math.max(a.depth, 1));
  for (const point of layout(hierarchy(root, (d) => d.children)).descendants()) {
    const angle = point.x - Math.PI / 2;
    positions.set(point.data.id, {
      x: point.y * Math.cos(angle),
      y: point.y * Math.sin(angle),
    });
  }
  return positions;
}
