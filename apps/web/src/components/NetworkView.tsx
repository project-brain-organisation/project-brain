import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { forceCollide } from 'd3-force-3d';
import SpriteText from 'three-spritetext';
import { Group, Sprite, SpriteMaterial, CanvasTexture } from 'three';
import type { Thought, EdgeRelationship } from '../hooks/useThoughts';
import './NetworkView.css';

export type NetworkViewMode = 'mindmap' | 'graph';

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
  /** 'mindmap' (default): hierarchy edges, with explicit relationships overlaid faded.
   *  'graph': explicit directional relationship edges only. */
  mode?: NetworkViewMode;
  /** Explicit kind='edge' relationships, rendered as directed links in graph mode. */
  edgeRels?: EdgeRelationship[];
  /** Filter to this node plus its one-hop neighbours (parent, children,
   *  relationship neighbours) in either mode. */
  focusedNodeId?: string;
}

interface GraphNode {
  id: string;
  name: string;
  body: string;
  isRoot: boolean;
  hasTitle: boolean;
}

interface GraphLink {
  source: string;
  target: string;
  isLabelEdge?: boolean;
  isDirected?: boolean;
  labelName?: string;
  labelColor?: string;
}

export function NetworkView({
  thoughts,
  nodeColors = {},
  onSelectNode,
  onResetView,
  mode = 'mindmap',
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

  const graphData = useMemo(() => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
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

    if (mode === 'mindmap') {
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
    } else {
      // Graph mode: explicit directional relationships instead of hierarchy
      for (const rel of edgeRels) {
        if (!idSet.has(rel.sourceId) || !idSet.has(rel.targetId)) continue;
        links.push({
          source: rel.sourceId,
          target: rel.targetId,
          isDirected: true,
          labelName: rel.label?.name,
          labelColor: rel.label?.color,
        });
      }
    }

    // Selected node: filter to it + one-hop neighbours (either mode)
    if (focusedNodeId && idSet.has(focusedNodeId)) {
      const visible = new Set<string>([focusedNodeId]);
      for (const link of links) {
        if (link.source === focusedNodeId) visible.add(link.target);
        if (link.target === focusedNodeId) visible.add(link.source);
      }
      return {
        nodes: nodes.filter((n) => visible.has(n.id)),
        links: links.filter((l) => visible.has(l.source) && visible.has(l.target)),
      };
    }

    if (mode === 'graph') {
      // No selection: hide orphan nodes (no relationship edges at all)
      const linked = new Set<string>();
      for (const link of links) {
        linked.add(link.source);
        linked.add(link.target);
      }
      return { nodes: nodes.filter((n) => linked.has(n.id)), links };
    }

    return { nodes, links };
  }, [thoughts, mode, edgeRels, focusedNodeId]);

  // Zoom to fit after the data or the container changes: an early fit (the
  // simulation is still moving, but it kills the worst of the mismatch), then
  // a one-shot final fit once the force engine settles. Dimension changes
  // debounce via the effect cleanup (the mobile sheet resizes continuously).
  // Negative padding overshoots the fit: zoomToFit frames the 3D bounding
  // sphere, which over-bounds a flat-ish graph and leaves dead margin —
  // camera-only, node layout untouched.
  const fitGraph = useCallback(() => {
    const overshoot = -0.11 * Math.min(dimensions.width, dimensions.height);
    fgRef.current?.zoomToFit(400, overshoot);
  }, [dimensions]);

  // Local label de-overlap: each node's collision radius approximates its
  // label footprint, so only nodes whose labels would touch get pushed apart.
  // The layout is flattened to a plane (numDimensions=2), so world-space
  // separation maps 1:1 to the screen — radii can stay tight and the layout
  // compact, unlike in 3D where depth-axis separation bought nothing.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force('collide', forceCollide((node) => {
      const { isRoot, hasTitle, name } = node as GraphNode;
      const circle = isRoot ? 8 : 5.5;
      if (!hasTitle) return circle;
      const textHeight = isRoot ? ROOT_LABEL_HEIGHT : LABEL_HEIGHT;
      const widest = Math.max(...name.split('\n').map((l) => l.length));
      return Math.max(circle, widest * textHeight * 0.22);
    }));
  }, [graphData]);

  const needsFinalFit = useRef(false);
  useEffect(() => {
    needsFinalFit.current = true;
    const timer = setTimeout(fitGraph, 500);
    return () => clearTimeout(timer);
  }, [graphData, fitGraph]);

  const handleEngineStop = useCallback(() => {
    if (!needsFinalFit.current) return; // don't re-zoom after user node drags
    needsFinalFit.current = false;
    fitGraph();
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

  const nodeVal = useCallback((node: GraphNode) => {
    if (!node.hasTitle) return 0.5;
    if (node.isRoot) return 4;
    return 2;
  }, []);

  const linkColor = useCallback((link: GraphLink) => {
    // Graph mode: all relationship edges styled like mind-map hierarchy edges
    if (mode === 'graph') return '#222222';
    return link.isLabelEdge ? 'rgba(200, 200, 200, 0.35)' : '#222222';
  }, [mode]);

  const linkWidth = useCallback((link: GraphLink) => {
    if (mode === 'graph') return 0.4;
    return link.isLabelEdge ? 1 : 0.4;
  }, [mode]);

  const linkArrowLength = useCallback((link: GraphLink) => {
    return link.isDirected ? 4 : 0;
  }, []);

  // Graph mode: render the label name on the link itself
  const linkThreeObject = useCallback((link: GraphLink) => {
    if (mode !== 'graph' || !link.labelName) return new Group();
    const sprite = new SpriteText(link.labelName);
    sprite.color = link.labelColor || '#666666';
    sprite.fontFace = 'Syne, sans-serif';
    sprite.textHeight = 2;
    sprite.material.depthTest = false;
    sprite.renderOrder = 3;
    return sprite;
  }, [mode]);

  const linkPositionUpdate = useCallback((sprite: any, { start, end }: { start: any; end: any }) => {
    if (sprite) {
      sprite.position.set(
        (start.x + end.x) / 2,
        (start.y + end.y) / 2,
        (start.z + end.z) / 2,
      );
    }
  }, []);

  if (thoughts.length === 0) {
    return <div className="network-view-empty">No thoughts yet</div>;
  }

  if (mode === 'graph' && graphData.nodes.length === 0) {
    return <div className="network-view-empty">No relationships yet</div>;
  }

  return (
    <div className="network-view" ref={containerRef}>
      <ForceGraph3D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        numDimensions={2}
        graphData={graphData}
        nodeVal={nodeVal}
        nodeThreeObject={nodeThreeObject}
        onNodeClick={(node: GraphNode) => onSelectNode?.(node.id)}
        onBackgroundClick={() => onResetView?.()}
        onEngineStop={handleEngineStop}
        nodeLabel={() => ''}
        linkLabel={(link: GraphLink) => {
          if (!link.labelName) return '';
          const color = link.labelColor || '#999';
          return `<div class="graph-tooltip-label" style="border-color:${color};color:${color}"><span class="graph-tooltip-label-dot" style="background:${color}"></span>${link.labelName}</div>`;
        }}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkDirectionalArrowLength={linkArrowLength}
        linkDirectionalArrowRelPos={0.92}
        linkThreeObjectExtend={true}
        linkThreeObject={linkThreeObject}
        linkPositionUpdate={linkPositionUpdate}
        linkOpacity={0.4}
        backgroundColor="rgba(0,0,0,0)"
        showNavInfo={false}
      />
    </div>
  );
}
