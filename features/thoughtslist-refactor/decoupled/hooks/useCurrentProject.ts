// Destination: apps/web/src/hooks/useCurrentProject.ts
import { useProjects } from './useProjects';
import { useSelectedRoot } from '../contexts/SelectedRootContext';
import { projectToRootNode } from '../lib/rootNode';

/** The currently selected project as a domain fact: the project row, whether the
 *  viewer may edit it, and its root pseudo-node. Replaces the `readOnly` prop and
 *  the inline `projectToRootNode` in HomePage. */
export function useCurrentProject() {
  const { selectedRootId } = useSelectedRoot();
  const { projects } = useProjects();
  const project = projects.find((p) => p.id === selectedRootId);
  return {
    project,
    // Subscribed public graphs are read-only: browse but not mutate.
    readOnly: project?.role === 'subscriber',
    rootNode: project ? projectToRootNode(project) : undefined,
  };
}
