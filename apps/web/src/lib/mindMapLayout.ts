import { hierarchy, tree } from 'd3-hierarchy';
import { forceSimulation, forceLink, forceManyBody, forceCollide } from 'd3-force-3d';

/** World-unit gap between depth rings in the seed layout. */
const MIN_RING = 22;
/** Slack over raw label demand when sizing seed rings — the force polish
 *  resolves residual overlaps, so the seed can start tight. */
const SECTOR_SLACK = 1.15;
/** Synchronous polish ticks. The sim runs on the main thread, so scale the
 *  budget down for large graphs — the final ticks barely move a big layout but
 *  cost the most. Small graphs get the full budget for a clean relax. */
const MAX_SETTLE_TICKS = 120;
const MIN_SETTLE_TICKS = 40;
const settleTicks = (nodeCount: number) =>
  Math.min(MAX_SETTLE_TICKS, Math.max(MIN_SETTLE_TICKS, Math.round(6000 / nodeCount)));

export interface LayoutNode {
  id: string;
  /** Half-width of the node's rendered footprint (circle or label), world units. */
  radius: number;
}

interface TreeDatum extends LayoutNode {
  children: TreeDatum[];
}

/**
 * Deterministic mind-map layout: a radial tidy-tree seed (root at the origin,
 * depths on concentric rings) relaxed by a short offline force simulation —
 * links pull related nodes together, label-footprint collision keeps text
 * readable, so the result is organic and as dense as the labels allow. Both
 * stages are deterministic, so the same graph always gets the same picture.
 *
 * The spanning tree is BFS from rootId — link order matters, so pass
 * hierarchy links before overlay edges.
 */
export function mindMapLayout(
  nodes: LayoutNode[],
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
  const presentLinks = links.filter((l) => byId.has(l.source) && byId.has(l.target));
  for (const { source, target } of presentLinks) {
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

  // Seed ring spacing: the busiest ring should roughly fit its labels.
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

  const seed = tree<TreeDatum>()
    .size([sweep, ring * maxDepth])
    .separation((a, b) => (a.data.radius + b.data.radius || 1) / Math.max(a.depth, 1));
  const seeded = new Map<string, { x: number; y: number }>();
  for (const point of seed(hierarchy(root, (d) => d.children)).descendants()) {
    const angle = point.x - Math.PI / 2;
    seeded.set(point.data.id, {
      x: point.y * Math.cos(angle),
      y: point.y * Math.sin(angle),
    });
  }

  // Offline polish: relax the seed into an organic, compact layout. The root
  // stays pinned at the origin; collide (label footprints) is what ultimately
  // guarantees readable, non-overlapping text.
  const simNodes = nodes.map((n) => ({
    ...n,
    ...seeded.get(n.id)!,
    ...(n.id === root.id ? { fx: 0, fy: 0 } : null),
  }));
  const simLinks = presentLinks.map((l) => ({ ...l }));
  forceSimulation(simNodes, 2)
    .force(
      'link',
      forceLink(simLinks)
        .id((d: LayoutNode) => d.id)
        .distance((l: any) => l.source.radius + l.target.radius),
    )
    .force('charge', forceManyBody().strength(-10))
    .force('collide', forceCollide().radius((d: LayoutNode) => d.radius + 1).iterations(2))
    .stop()
    .tick(settleTicks(simNodes.length));
  for (const node of simNodes) positions.set(node.id, { x: node.x, y: node.y });
  return positions;
}
