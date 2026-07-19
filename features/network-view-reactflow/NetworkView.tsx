// DRAFT (React Flow, maximally OOTB) — final: apps/web/src/components/NetworkView.tsx
//
// Wires useThoughtGraph (build + layout, rooted at the focus) into React Flow's
// controlled state. Focus *filtering* is HomePage's job — it narrows `thoughts`
// to the focused neighbourhood, shared with the thought list — so this component
// only renders what it's given and refits when focus changes. Conventions:
//  - controlled state via useNodesState/useEdgesState + onNodesChange/onEdgesChange
//      https://reactflow.dev/api-reference/hooks/use-nodes-state
//  - nodeTypes / defaultEdgeOptions at module scope (stable identity)
//  - stock <Controls> for zoom + fit-view
//  - fit gated on useNodesInitialized so it fits measured nodes, not points

import { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  useReactFlow,
  useNodesState,
  useEdgesState,
  useNodesInitialized,
  type Edge,
  type NodeMouseHandler,
  type FitViewOptions,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Thought, EdgeRelationship } from '../hooks/useThoughts';
import { useThoughtGraph, type ThoughtFlowNode } from '../hooks/useThoughtGraph';
import { ThoughtNode } from './ThoughtNode';
import './NetworkView.css';

const nodeTypes = { thought: ThoughtNode };
const defaultEdgeOptions = { type: 'straight' as const };
const FIT: FitViewOptions = { padding: 0.15, duration: 400 };

interface Props {
  thoughts: Thought[];
  nodeColors?: Record<string, string>;
  onSelectNode?: (id: string) => void;
  onResetView?: () => void;
  /** Explicit kind='edge' relationships, overlaid as faded labelled links. */
  edgeRels?: EdgeRelationship[];
  /** The focused node. HomePage has already narrowed `thoughts` to its
   *  neighbourhood; here it only roots the layout and triggers a refit. */
  focusedNodeId?: string;
  /** Accepted for API parity — inert here: a DOM graph has no render loop to
   *  halt, and the viewport is preserved across mounts for free. */
  paused?: boolean;
}

function NetworkGraph({
  thoughts,
  nodeColors = {},
  onSelectNode,
  onResetView,
  edgeRels = [],
  focusedNodeId,
}: Props) {
  // Build + lay out the graph HomePage handed us, rooted at the focused node.
  const graph = useThoughtGraph(thoughts, edgeRels, nodeColors, focusedNodeId);

  // Reflect the derived graph into React Flow's controlled state.
  const [nodes, setNodes, onNodesChange] = useNodesState<ThoughtFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph, setNodes, setEdges]);

  // Re-fit only when the graph's identity changes (project/focus), and only once
  // nodes are measured — so the fit runs *after* the new hidden flags land and
  // frames exactly the visible set. React Flow keeps the viewport across plain
  // data ticks on its own.
  const { fitView } = useReactFlow();
  const initialized = useNodesInitialized();
  const identity = focusedNodeId ?? `root:${thoughts.find((t) => t.isRoot)?.id ?? ''}`;
  const prevIdentity = useRef<string | null>(null);
  useEffect(() => {
    if (!initialized) return;
    if (prevIdentity.current === identity) return;
    const first = prevIdentity.current === null;
    prevIdentity.current = identity;
    if (!first) fitView(FIT); // first paint is handled by the `fitView` prop
  }, [initialized, identity, fitView]);

  const onNodeClick: NodeMouseHandler<ThoughtFlowNode> = useCallback(
    (_, node) => onSelectNode?.(node.id),
    [onSelectNode],
  );
  const onPaneClick = useCallback(() => onResetView?.(), [onResetView]);

  if (thoughts.length === 0) return <div className="network-view-empty">No thoughts yet</div>;

  return (
    <ReactFlow
      className="network-view"
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      nodeOrigin={[0.5, 0.5]}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      /* Read-only: no editing, no selection/keyboard chrome. */
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      disableKeyboardA11y
      minZoom={0.2}
      maxZoom={2.5}
      fitView
      fitViewOptions={FIT}
      proOptions={{ hideAttribution: true }}
    >
      {/* Stock zoom + fit-view buttons replace the hand-rolled recentre button. */}
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}

// useReactFlow()/useNodesInitialized() need a provider ancestor; wrap so callers
// keep the identical NetworkView API.
export function NetworkView(props: Props) {
  return (
    <ReactFlowProvider>
      <NetworkGraph {...props} />
    </ReactFlowProvider>
  );
}
