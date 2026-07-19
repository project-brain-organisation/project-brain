// Destination: apps/web/src/lib/rootNode.ts
import type { Thought } from '../hooks/useThoughts';

/** Present the selected project as a root pseudo-thought so the list/graph
 *  components can treat it like any other node. (Moved out of HomePage so the
 *  navigation provider and useCurrentProject can share it.) */
export function projectToRootNode(project: { id: string; name: string; color: string | null }): Thought {
  return {
    id: project.id,
    projectId: project.id,
    parentId: null,
    isRoot: true,
    title: project.name,
    body: '',
    color: project.color,
    contentHash: null,
    canvasX: null,
    canvasY: null,
    width: null,
    height: null,
    createdAt: '',
    updatedAt: '',
    parentRelationshipId: null,
  };
}
