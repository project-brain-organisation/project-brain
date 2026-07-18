import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { Raycaster, Vector2 } from 'three';
import type { Thought, EdgeRelationship } from '../hooks/useThoughts';
import { mindMapLayout } from '../lib/mindMapLayout';
import {
  makeNodeObject,
  DEFAULT_NODE_COLOR,
  LABEL_HEIGHT,
  ROOT_LABEL_HEIGHT,
} from '../lib/graphNode';
import './NetworkView.css';

const LABEL_MAX_CHARS = 20;
const LABEL_MAX_LINES = 2;

/** Long titles blow up label footprints; full text lives in the card/sheet.
 *  Word-wrap to at most two lines of LABEL_MAX_CHARS, truncating the overflow. */
function truncateLabel(title: string): string {
  const words = title.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    let w = word;
    // Hard-break any single word wider than a line.
    while (w.length > LABEL_MAX_CHARS) {
      if (current) { lines.push(current); current = ''; }
      lines.push(w.slice(0, LABEL_MAX_CHARS));
      w = w.slice(LABEL_MAX_CHARS);
    }
    if (!current) current = w;
    else if (current.length + 1 + w.length <= LABEL_MAX_CHARS) current += ' ' + w;
    else { lines.push(current); current = w; }
  }
  if (current) lines.push(current);

  if (lines.length <= LABEL_MAX_LINES) return lines.join('\n');

  const kept = lines.slice(0, LABEL_MAX_LINES);
  const last = kept[LABEL_MAX_LINES - 1];
  kept[LABEL_MAX_LINES - 1] =
    (last.length >= LABEL_MAX_CHARS ? last.slice(0, LABEL_MAX_CHARS - 1) : last).trimEnd() + '…';
  return kept.join('\n');
}

interface Props {
  thoughts: Thought[];
  nodeColors?: Record<string, string>;
  onSelectNode?: (id: string) => void;
  onResetView?: () => void;
  /** Explicit kind='edge' relationships, overlaid on the hierarchy as faded
   *  labelled links. */
  edgeRels?: EdgeRelationship[];
  /** Filter to this node plus its one-hop neighbours (parent, children,
   *  relationship neighbours). */
  focusedNodeId?: string;
  /** Halt the render loop (hidden mobile sheet) without unmounting, so
   *  reopening is instant — no WebGL re-init, no layout recompute. */
  paused?: boolean;
}

interface GraphNode {
  id: string;
  name: string;
  body: string;
  isRoot: boolean;
  hasTitle: boolean;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
  fz?: number;
}

/** Half-width of a node's rendered footprint (circle or label), world units. */
function nodeRadius(node: GraphNode): number {
  const circle = node.isRoot ? 8 : 5.5;
  if (!node.hasTitle) return circle;
  const textHeight = node.isRoot ? ROOT_LABEL_HEIGHT : LABEL_HEIGHT;
  const widest = Math.max(...node.name.split('\n').map((l) => l.length));
  return Math.max(circle, widest * textHeight * 0.22);
}

interface GraphLink {
  source: string;
  target: string;
  isLabelEdge?: boolean;
  labelName?: string;
  labelColor?: string;
}


export function NetworkView({
  thoughts,
  nodeColors = {},
  onSelectNode,
  onResetView,
  edgeRels = [],
  focusedNodeId,
  paused,
}: Props) {
  const [dimensions, setDimensions] = useState({ width: 400, height: 400 });
  const fgRef = useRef<any>(null);
  const containerEl = useRef<HTMLDivElement | null>(null);

  const roRef = useRef<ResizeObserver | null>(null);
  const containerRef = useCallback((el: HTMLDivElement | null) => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    containerEl.current = el;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setDimensions({ width: rect.width, height: rect.height });
    }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });
    ro.observe(el);
    roRef.current = ro;
  }, []);

  const { graphData, bbox } = useMemo(() => {
    let nodes: GraphNode[] = [];
    let links: GraphLink[] = [];
    const idSet = new Set(thoughts.map((t) => t.id));

    for (const thought of thoughts) {
      nodes.push({
        id: thought.id,
        name: truncateLabel(thought.title || ''),
        body: thought.body || '',
        isRoot: thought.isRoot,
        hasTitle: !!thought.title,
      });
    }

    // Pairs already linked (hierarchy or explicit edges) — co-occurrence skips them
    const existingEdges = new Set<string>();

    for (const thought of thoughts) {
      if (thought.parentId && idSet.has(thought.parentId)) {
        links.push({ source: thought.parentId, target: thought.id });
        const a = thought.parentId < thought.id ? thought.parentId : thought.id;
        const b = thought.parentId < thought.id ? thought.id : thought.parentId;
        existingEdges.add(`${a}:${b}`);
      }
    }
    // Explicit relationships overlay as faded edges (same look as co-occurrence)
    for (const rel of edgeRels) {
      if (!idSet.has(rel.sourceId) || !idSet.has(rel.targetId)) continue;
      const a = rel.sourceId < rel.targetId ? rel.sourceId : rel.targetId;
      const b = rel.sourceId < rel.targetId ? rel.targetId : rel.sourceId;
      const key = `${a}:${b}`;
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

    // Selected node: filter to it + one-hop neighbours
    if (focusedNodeId && idSet.has(focusedNodeId)) {
      const visible = new Set<string>([focusedNodeId]);
      for (const link of links) {
        if (link.source === focusedNodeId) visible.add(link.target);
        if (link.target === focusedNodeId) visible.add(link.source);
      }
      nodes = nodes.filter((n) => visible.has(n.id));
      links = links.filter((l) => visible.has(l.source) && visible.has(l.target));
    }

    // Deterministic layout (radial-tree seed + offline force polish), rooted
    // at the focused node when there is one. Computed before render and
    // pinned, so the graph appears settled on the first frame and the live
    // engine never runs. Hierarchy links precede overlay edges in `links`,
    // so the spanning tree follows the real hierarchy.
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
      minX = Math.min(minX, pos.x - r);
      maxX = Math.max(maxX, pos.x + r);
      minY = Math.min(minY, pos.y - r);
      maxY = Math.max(maxY, pos.y + r);
    }
    return { graphData: { nodes, links }, bbox: { minX, minY, maxX, maxY } };
  }, [thoughts, edgeRels, focusedNodeId]);

  // Frame the graph exactly: the layout is known ahead of render, so position
  // the camera to fit its bounding box (perspective height/width fit) instead
  // of zoomToFit's bounding-sphere guesswork. Instant on first render,
  // animated on later data/size changes.
  const firstFit = useRef(true);
  const fitDistance = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return 0;
    const halfW = Math.max((bbox.maxX - bbox.minX) / 2, 20) * 1.05;
    const halfH = Math.max((bbox.maxY - bbox.minY) / 2, 20) * 1.05;
    const aspect = dimensions.width / dimensions.height;
    const halfFov = ((fg.camera().fov / 2) * Math.PI) / 180;
    return Math.max(halfH, halfW / aspect) / Math.tan(halfFov);
  }, [bbox, dimensions]);

  const fitGraph = useCallback((animate = true) => {
    const fg = fgRef.current;
    if (!fg) return;
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    fg.cameraPosition({ x: cx, y: cy, z: fitDistance() }, { x: cx, y: cy, z: 0 }, animate ? 400 : 0);
  }, [bbox, fitDistance]);

  // Once the user has zoomed/panned, data ticks (SSE invalidations, edits,
  // resizes) must not yank the camera back to full frame. Auto-refit only
  // when the graph's identity changes — a different project root or focus —
  // which also re-arms auto-fit.
  const userNavigated = useRef(false);
  // Refit key. When unfocused it tracks the root id (so a project switch
  // refits) but PREFIXED, so it never collides with the focused-on-root case
  // where focusedNodeId IS the root id — otherwise focusing the root reads as
  // "no identity change" and never zooms to fit like other nodes do.
  const identity = focusedNodeId ?? `root:${thoughts.find((t) => t.isRoot)?.id ?? ''}`;
  const prevIdentity = useRef<string | null>(null);

  // Refit when identity changes (project/focus) — animated — or when the
  // container resizes (sheet open/close, drag, window resize) — snapped, no
  // tween. Resizes arrive as a burst of ResizeObserver ticks, each rescheduling
  // this timer; the trailing debounce collapses the burst into ONE fit so
  // overlapping camera tweens can't fight each other into a flickering zoom.
  useEffect(() => {
    const identityChanged = prevIdentity.current !== identity;
    if (identityChanged) {
      prevIdentity.current = identity;
      userNavigated.current = false;
    }
    if (userNavigated.current) return;
    const animate = identityChanged && !firstFit.current;
    const timer = setTimeout(() => {
      fitGraph(animate);
      firstFit.current = false;
    }, identityChanged ? 50 : 180);
    return () => clearTimeout(timer);
  }, [identity, fitGraph]);

  const handleRecentre = useCallback(() => {
    userNavigated.current = false;
    fitGraph();
  }, [fitGraph]);

  // Force node object re-creation when colors change
  useEffect(() => {
    if (!fgRef.current) return;
    fgRef.current.refresh();
  }, [nodeColors]);

  // Disable camera rotation on drag — pan/zoom only, layout is a flat plane.
  // Covers both control flavours: TrackballControls (noRotate) and
  // OrbitControls (enableRotate). Any user interaction ('start' fires on
  // drag, wheel and touch) marks the camera as user-owned.
  useEffect(() => {
    const controls = fgRef.current?.controls();
    if (!controls) return;
    controls.noRotate = true;
    controls.enableRotate = false;
    const markNavigated = () => { userNavigated.current = true; };
    controls.addEventListener('start', markNavigated);
    return () => controls.removeEventListener('start', markNavigated);
  }, [graphData]);

  // Dolly limits: don't zoom through the plane or shrink the graph to a
  // speck. Derived from the current fit distance so they scale with the graph.
  useEffect(() => {
    const controls = fgRef.current?.controls();
    if (!controls) return;
    controls.minDistance = 15;
    controls.maxDistance = Math.max(fitDistance() * 2.5, 300);
  }, [fitDistance]);

  // When live, run the render loop. When paused (hidden/dragging mobile sheet),
  // paint ONE fresh frame then stop: the scene is static, so the clipped reveal
  // shows that frame without paying a continuous redraw — heavy on large graphs,
  // where every transparent sprite re-sorts each frame. Repaint only when the
  // size or data actually change, so a paused graph never shows a stale frame.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    if (!paused) {
      fg.resumeAnimation();
      return;
    }
    fg.resumeAnimation();
    const id = requestAnimationFrame(() => fg.pauseAnimation());
    return () => cancelAnimationFrame(id);
  }, [paused, dimensions, graphData]);

  // Node selection via our own tap detection instead of force-graph's:
  // its click handler bails on any >1px pointer movement (finger taps always
  // wiggle) and resolves the target from a hover raycast done on animation
  // frames (misses when a tap lands between frames). A pointerup within
  // finger-sized tolerance plus a direct raycast is deterministic on both
  // mouse and touch.
  const tapRef = useRef<{ x: number; y: number; t: number; id: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // A second concurrent pointer (pinch zoom) is never a tap.
    tapRef.current = tapRef.current
      ? null
      : { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const tap = tapRef.current;
    tapRef.current = null;
    if (!tap || tap.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8 || Date.now() - tap.t > 500) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const fg = fgRef.current;
    const el = containerEl.current;
    if (!fg || !el) return;
    const rect = el.getBoundingClientRect();
    const ndc = new Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new Raycaster();
    raycaster.setFromCamera(ndc, fg.camera());
    for (const hit of raycaster.intersectObjects(fg.scene().children, true)) {
      let obj: any = hit.object;
      while (obj && obj.__graphObjType === undefined) obj = obj.parent;
      if (obj?.__graphObjType === 'node') {
        onSelectNode?.(obj.__data.id);
        return;
      }
    }
    onResetView?.();
  }, [onSelectNode, onResetView]);

  const nodeThreeObject = useCallback(
    (node: GraphNode) => makeNodeObject(node, nodeColors[node.id] || DEFAULT_NODE_COLOR),
    [nodeColors],
  );

  const linkColor = useCallback((link: GraphLink) => {
    return link.isLabelEdge ? 'rgba(200, 200, 200, 0.35)' : '#222222';
  }, []);

  const linkWidth = useCallback((link: GraphLink) => {
    return link.isLabelEdge ? 1 : 0.4;
  }, []);

  if (thoughts.length === 0) {
    return <div className="network-view-empty">No thoughts yet</div>;
  }

  return (
    <div
      className="network-view"
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { tapRef.current = null; }}
    >
      <ForceGraph3D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        numDimensions={2}
        cooldownTicks={0}
        enableNodeDrag={false}
        graphData={graphData}
        nodeThreeObject={nodeThreeObject}
        linkHoverPrecision={4}
        nodeLabel={() => ''}
        linkLabel={(link: GraphLink) => {
          if (!link.labelName) return '';
          const color = link.labelColor || '#999';
          return `<div class="graph-tooltip-label" style="border-color:${color};color:${color}"><span class="graph-tooltip-label-dot" style="background:${color}"></span>${link.labelName}</div>`;
        }}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={0.4}
        backgroundColor="rgba(0,0,0,0)"
        showNavInfo={false}
      />
      <button
        className="network-recentre"
        onClick={handleRecentre}
        title="Re-centre graph"
        aria-label="Re-centre graph"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="12" cy="12" r="6.5" />
          <line x1="12" y1="1.5" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="22.5" />
          <line x1="1.5" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="22.5" y2="12" />
        </svg>
      </button>
    </div>
  );
}
