import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import { Group, Sprite, SpriteMaterial, CanvasTexture } from 'three';
import type { Thought, EdgeRelationship } from '../hooks/useThoughts';
import { mindMapLayout } from '../lib/mindMapLayout';
import './NetworkView.css';

const LABEL_HEIGHT = 2.5;
const ROOT_LABEL_HEIGHT = 4.5;
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
}: Props) {
  const [dimensions, setDimensions] = useState({ width: 400, height: 400 });
  const fgRef = useRef<any>(null);

  const roRef = useRef<ResizeObserver | null>(null);
  const containerRef = useCallback((el: HTMLDivElement | null) => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
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
  const fitGraph = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const halfW = Math.max((bbox.maxX - bbox.minX) / 2, 20) * 1.05;
    const halfH = Math.max((bbox.maxY - bbox.minY) / 2, 20) * 1.05;
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    const aspect = dimensions.width / dimensions.height;
    const halfFov = ((fg.camera().fov / 2) * Math.PI) / 180;
    const dist = Math.max(halfH, halfW / aspect) / Math.tan(halfFov);
    fg.cameraPosition({ x: cx, y: cy, z: dist }, { x: cx, y: cy, z: 0 }, firstFit.current ? 0 : 400);
    firstFit.current = false;
  }, [bbox, dimensions]);

  // Refit on data or container changes; the short debounce coalesces the
  // mobile sheet's continuous resizes.
  useEffect(() => {
    const timer = setTimeout(fitGraph, 50);
    return () => clearTimeout(timer);
  }, [fitGraph]);

  // Force node object re-creation when colors change
  useEffect(() => {
    if (!fgRef.current) return;
    fgRef.current.refresh();
  }, [nodeColors]);

  // Disable camera rotation on drag — pan/zoom only, layout is a flat plane.
  // Covers both control flavours: TrackballControls (noRotate) and
  // OrbitControls (enableRotate).
  useEffect(() => {
    const controls = fgRef.current?.controls();
    if (!controls) return;
    controls.noRotate = true;
    controls.enableRotate = false;
  }, [graphData]);

  const nodeThreeObject = useCallback((node: GraphNode) => {
    const borderColor = nodeColors[node.id] || '#e8a838';

    const hex = borderColor.replace('#', '');
    const rb = parseInt(hex.substring(0, 2), 16);
    const gb = parseInt(hex.substring(2, 4), 16);
    const bb = parseInt(hex.substring(4, 6), 16);
    const fillColor = `rgb(${Math.round(rb + (255 - rb) * 0.82)}, ${Math.round(gb + (255 - gb) * 0.82)}, ${Math.round(bb + (255 - bb) * 0.82)})`;

    const group = new Group();
    group.renderOrder = 10;

    const res = 128;
    const canvas = document.createElement('canvas');
    canvas.width = res;
    canvas.height = res;
    const ctx = canvas.getContext('2d')!;
    const cx = res / 2;
    const cy = res / 2;
    const r = res / 2 - 6;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = borderColor;
    ctx.stroke();

    const texture = new CanvasTexture(canvas);
    const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const circle = new Sprite(material);
    const scale = node.isRoot ? 14 : 9;
    circle.scale.set(scale, scale, 1);
    circle.renderOrder = 1;
    group.add(circle);

    if (node.hasTitle) {
      const label = new SpriteText(node.name);
      label.color = '#111111';
      label.fontFace = 'Syne, sans-serif';
      label.textHeight = node.isRoot ? ROOT_LABEL_HEIGHT : LABEL_HEIGHT;
      label.material.depthTest = false;
      label.renderOrder = 2;
      group.add(label);
    }

    return group;
  }, [nodeColors]);

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
    <div className="network-view" ref={containerRef}>
      <ForceGraph3D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        numDimensions={2}
        cooldownTicks={0}
        graphData={graphData}
        nodeThreeObject={nodeThreeObject}
        onNodeClick={(node: GraphNode) => onSelectNode?.(node.id)}
        linkHoverPrecision={4}
        onBackgroundClick={() => onResetView?.()}
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
    </div>
  );
}
