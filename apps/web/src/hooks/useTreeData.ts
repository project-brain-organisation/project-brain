import { useMemo } from 'react';
import type { Thought } from './useThoughts';

export interface TreeThought extends Thought {
  children: TreeThought[];
}

export function buildTree(thoughts: Thought[]): TreeThought[] {
  const map = new Map<string, TreeThought>();
  for (const thought of thoughts) {
    map.set(thought.id, { ...thought, children: [] });
  }
  const roots: TreeThought[] = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else if (!node.parentId) {
      roots.push(node);
    }
  }
  return roots;
}

export function useTreeData(thoughts: Thought[]): TreeThought[] {
  return useMemo(() => buildTree(thoughts), [thoughts]);
}
