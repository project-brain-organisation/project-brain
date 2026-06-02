import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import { Group, Sprite, SpriteMaterial, CanvasTexture } from 'three';
import type { Thought } from '../hooks/useThoughts';
import type { EdgeAssignment } from '../hooks/useLabels';
import './NetworkView.css';

interface Props {
  thoughts: Thought[];
  nodeColors?: Record<string, string>;
  edgeAssignments?: EdgeAssignment[];
  onSelectNode?: (id: string) => void;
  onResetView?: () => void;
}

interface GraphNode {
  id: string;
  name: string;
  parentId?: string;
  isRoot: boolean;
  hasTitle: boolean;
  x?: number;
  y?: number;
  z?: number;
}

interface GraphLink {
  source: string;
  target: string;
  isLabelEdge?: boolean;
  weight?: number;
}

export function NetworkView({ thoughts, nodeColors = {}, edgeAssignments = [], onSelectNode, onResetView }: Props) {
  const [dimensions, setDimensions] = useState({ width: 400, height: 400 });
  const fgRef = useRef<any>(null);

  // Use a callback ref so the ResizeObserver re-attaches when the DOM element appears
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

  // Stable key that changes only when the set of thought IDs changes
  const thoughtKey = useMemo(() => thoughts.map((t) => t.id).sort().join(','), [thoughts]);

  const graphData = useMemo(() => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const idSet = new Set(thoughts.map((t) => t.id));
    const parentMap = new Map<string, string>();

    for (const thought of thoughts) {
      nodes.push({
        id: thought.id,
        name: thought.title || '',
        parentId: thought.parentId ?? undefined,
        isRoot: thought.isRoot,
        hasTitle: !!thought.title,
        // Seed positions so d3 doesn't start everything at origin
        x: (Math.random() - 0.5) * 100,
        y: (Math.random() - 0.5) * 100,
        z: (Math.random() - 0.5) * 100,
      });
      if (thought.parentId && idSet.has(thought.parentId)) {
        links.push({ source: thought.parentId, target: thought.id });
      }
      if (thought.parentId) {
        parentMap.set(thought.id, thought.parentId);
      }
    }

    // Build label-based edges between thoughts whose children share is_edge labels.
    // Group edge assignments by labelId.
    if (edgeAssignments.length > 0) {
      const byLabel = new Map<string, string[]>();
      for (const ea of edgeAssignments) {
        if (!idSet.has(ea.thoughtId)) continue;
        let arr = byLabel.get(ea.labelId);
        if (!arr) {
          arr = [];
          byLabel.set(ea.labelId, arr);
        }
        arr.push(ea.thoughtId);
      }

      // For each label, connect the parents of thoughts that share it.
      // Weight accumulates when two parents share multiple labels.
      const edgeWeights = new Map<string, number>();
      for (const [, thoughtIds] of byLabel) {
        // Collect unique parent IDs for thoughts with this label
        const parents = new Set<string>();
        for (const tid of thoughtIds) {
          const pid = parentMap.get(tid);
          if (pid) parents.add(pid);
        }
        const parentArr = Array.from(parents);
        for (let i = 0; i < parentArr.length; i++) {
          for (let j = i + 1; j < parentArr.length; j++) {
            const key = parentArr[i] < parentArr[j]
              ? `${parentArr[i]}:${parentArr[j]}`
              : `${parentArr[j]}:${parentArr[i]}`;
            edgeWeights.set(key, (edgeWeights.get(key) || 0) + 1);
          }
        }
      }

      for (const [key, weight] of edgeWeights) {
        const [src, tgt] = key.split(':');
        links.push({ source: src, target: tgt, isLabelEdge: true, weight });
      }
    }

    return { nodes, links };
  }, [thoughts, edgeAssignments]);

  // Set of node IDs that have at least one child
  const parentIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of thoughts) {
      if (t.parentId) s.add(t.parentId);
    }
    return s;
  }, [thoughts]);

  // Configure d3 link force after mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!fgRef.current) return;
      fgRef.current.d3Force('link')?.strength((link: GraphLink) => {
        if (link.isLabelEdge) return 0.05 * (link.weight || 1);
        return 0.3;
      });
      fgRef.current.cameraPosition({ x: 0, y: 0, z: 200 }, { x: 0, y: 0, z: 0 }, 500);
    }, 300);
    return () => clearTimeout(timer);
  }, [thoughtKey]);

  const handleBackgroundClick = useCallback(() => {
    onResetView?.();
  }, [onResetView]);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      onSelectNode?.(node.id);
    },
    [onSelectNode],
  );

  const nodeThreeObject = useCallback((node: GraphNode) => {
    // Determine this node's border color:
    // 1. If this node has a color assigned directly, use it
    // 2. If this node is a leaf (no children) and its parent has a color, use the parent's
    // 3. Otherwise, default
    const isLeaf = !parentIds.has(node.id);
    let borderColor = nodeColors[node.id];
    if (!borderColor && isLeaf && node.parentId) {
      borderColor = nodeColors[node.parentId];
    }
    borderColor = borderColor || '#e8a838';

    // Derive a very light tint of the border color for the fill
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
      label.textHeight = node.isRoot ? 4 : 3;
      label.material.depthTest = false;
      label.renderOrder = 2;
      group.add(label);
    }

    return group;
  }, [nodeColors, parentIds]);

  const nodeVal = useCallback((node: GraphNode) => {
    if (!node.hasTitle) return 0.5;
    if (node.isRoot) return 4;
    return 2;
  }, []);

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
        key={thoughtKey}
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeVal={nodeVal}
        nodeThreeObject={nodeThreeObject}
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={0.4}
        backgroundColor="rgba(0,0,0,0)"
        showNavInfo={false}
        warmupTicks={50}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
      />
    </div>
  );
}
