// Custom node — the documented extension point for node appearance:
//   https://reactflow.dev/learn/customization/custom-nodes
// The whole node is plain HTML/CSS: no Three.js sprite, no canvas texture.
// Wrapped in React.memo per React Flow's performance guidance:
//   https://reactflow.dev/learn/advanced-use/performance

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ThoughtFlowNode } from '../hooks/useThoughtGraph';

/** Lighten a hex colour toward white (the old sprite's 82% fill tint). */
function tint(hex: string): string {
  const h = hex.replace('#', '');
  const mix = (c: number) => Math.round(c + (255 - c) * 0.82);
  const r = mix(parseInt(h.slice(0, 2), 16));
  const g = mix(parseInt(h.slice(2, 4), 16));
  const b = mix(parseInt(h.slice(4, 6), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

export const ThoughtNode = memo(({ data }: NodeProps<ThoughtFlowNode>) => {
  const { title, isRoot, hasTitle, color } = data;
  return (
    <div className={`tnode${isRoot ? ' tnode--root' : ''}`}>
      <span className="tnode-dot" style={{ borderColor: color, background: tint(color) }} />
      {/* Label centred over the dot. Absolute, so it doesn't change the node's
          measured size — edges still connect at the dot centre. */}
      {hasTitle && <span className="tnode-label">{title}</span>}
      {/* Default edges connect handle-to-handle. Two hidden, centred handles let
          edges run node-centre to node-centre with stock straight edges — no
          custom edge component. (Alternative for perimeter attachment: the
          Floating Edges example, https://reactflow.dev/examples/edges/floating-edges) */}
      <Handle type="target" position={Position.Top} className="tnode-handle" isConnectable={false} />
      <Handle type="source" position={Position.Top} className="tnode-handle" isConnectable={false} />
    </div>
  );
});
