import type { Thought } from '../hooks/useThoughts';

/** A thought plus all its descendants — the set that can't become its parent
 *  without creating a cycle. */
export function selfAndDescendants(thoughts: Thought[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const t of thoughts) {
    if (!t.parentId) continue;
    const kids = childrenOf.get(t.parentId);
    if (kids) kids.push(t.id);
    else childrenOf.set(t.parentId, [t.id]);
  }
  const set = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) {
    for (const kid of childrenOf.get(queue.pop()!) ?? []) {
      if (!set.has(kid)) {
        set.add(kid);
        queue.push(kid);
      }
    }
  }
  return set;
}
