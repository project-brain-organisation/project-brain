import { useState } from 'react';
import type { TreeThought } from '../hooks/useTreeData';
import './IdeaHierarchy.css';

interface Props {
  node: TreeThought;
  depth: number;
  isRoot?: boolean;
  onSelect: (id: string) => void;
}

export function IdeaHierarchy({ node, depth, isRoot, onSelect }: Props) {
  const [expanded, setExpanded] = useState(depth < 2);

  // Filter children to only those that themselves have children
  const visibleChildren = node.children.filter((c) => c.children.length > 0);
  const hasVisibleChildren = visibleChildren.length > 0;
  const label = node.title || '(untitled)';

  return (
    <div className="tree-node" style={{ paddingLeft: `${depth * 14}px` }}>
      <div className="tree-node-row">
        {hasVisibleChildren ? (
          <button className="tree-node-chevron" onClick={() => setExpanded(!expanded)}>
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="tree-node-chevron tree-node-chevron--leaf" />
        )}
        <button
          className="tree-node-label"
          onClick={() => onSelect(node.id)}
        >
          {label}
        </button>
      </div>
      {expanded && hasVisibleChildren && (
        <div className="tree-node-children">
          {visibleChildren.map((child) => (
            <IdeaHierarchy key={child.id} node={child} depth={depth + 1} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
