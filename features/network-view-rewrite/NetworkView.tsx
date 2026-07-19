// DRAFT — final: apps/web/src/components/NetworkView.tsx
// Thin orchestrator: derive the graph model, wire three hooks, render.

import { useCallback, useMemo, useRef } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import type { Thought, EdgeRelationship } from '../hooks/useThoughts';
import { buildGraph, type GraphNode, type GraphLink } from '../lib/graphModel';
import { makeNodeObject, DEFAULT_NODE_COLOR } from '../lib/graphNode';
import { useContainerSize } from '../hooks/useContainerSize';
import { useGraphView } from '../hooks/useGraphView';
import { useTapSelection } from '../hooks/useTapSelection';
import './NetworkView.css';

interface Props {
  thoughts: Thought[];
  nodeColors?: Record<string, string>;
  onSelectNode?: (id: string) => void;
  onResetView?: () => void;
  /** Explicit kind='edge' relationships, overlaid as faded labelled links. */
  edgeRels?: EdgeRelationship[];
  /** Filter to this node plus its one-hop neighbours. */
  focusedNodeId?: string;
  /** Halt the render loop (hidden mobile sheet) without unmounting. */
  paused?: boolean;
}

const linkColor = (l: GraphLink) => (l.isLabelEdge ? 'rgba(200, 200, 200, 0.35)' : '#222222');
const linkWidth = (l: GraphLink) => (l.isLabelEdge ? 1 : 0.4);
const linkLabel = (l: GraphLink) => {
  if (!l.labelName) return '';
  const c = l.labelColor || '#999';
  return `<div class="graph-tooltip-label" style="border-color:${c};color:${c}"><span class="graph-tooltip-label-dot" style="background:${c}"></span>${l.labelName}</div>`;
};

export function NetworkView({
  thoughts, nodeColors = {}, onSelectNode, onResetView, edgeRels = [], focusedNodeId, paused,
}: Props) {
  const fgRef = useRef<any>(null);
  const { ref, elRef, size } = useContainerSize();

  const { graphData, bbox } = useMemo(
    () => buildGraph(thoughts, edgeRels, focusedNodeId),
    [thoughts, edgeRels, focusedNodeId],
  );

  // Refit key: focus id, else the root id PREFIXED so focusing the root still
  // reads as an identity change and zooms to fit like any other node.
  const identity = focusedNodeId ?? `root:${thoughts.find((t) => t.isRoot)?.id ?? ''}`;
  const recentre = useGraphView(fgRef, bbox, size, identity, graphData, nodeColors, paused);
  const tapHandlers = useTapSelection(fgRef, elRef, onSelectNode, onResetView);

  const nodeThreeObject = useCallback(
    (node: GraphNode) => makeNodeObject(node, nodeColors[node.id] || DEFAULT_NODE_COLOR),
    [nodeColors],
  );

  if (thoughts.length === 0) return <div className="network-view-empty">No thoughts yet</div>;

  return (
    <div className="network-view" ref={ref} {...tapHandlers}>
      <ForceGraph3D
        ref={fgRef}
        width={size.width}
        height={size.height}
        numDimensions={2}
        cooldownTicks={0}
        enableNodeDrag={false}
        graphData={graphData}
        nodeThreeObject={nodeThreeObject}
        linkHoverPrecision={4}
        nodeLabel={() => ''}
        linkLabel={linkLabel}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={0.4}
        backgroundColor="rgba(0,0,0,0)"
        showNavInfo={false}
      />
      <button className="network-recentre" onClick={recentre} title="Re-centre graph" aria-label="Re-centre graph">
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
