import { useCallback } from 'react';
import { useThoughts } from './useThoughts';
import { useProjects } from './useProjects';
import { useSelectedRoot } from '../contexts/SelectedRootContext';
import { useThoughtNavigation } from '../contexts/ThoughtNavigationProvider';
import { useConfirm } from '../contexts/ConfirmProvider';
import { thoughtName } from '../lib/thoughtName';

/**
 * The write operations with their app policy — the logic that used to be
 * HomePage's handle* callbacks. Components call this instead of receiving a
 * bag of mutation props:
 *   - create()   → a blank thought under the active node
 *   - update()   → root-aware (rename the project vs. edit a thought)
 *   - remove()   → confirm, then delete (nav self-heals the stack)
 *   - reparent() → move under a new parent
 *   - setBorderColor() → colour the active node (project vs. thought)
 *   - clone()    → clone the current project and switch to it
 */
export function useThoughtActions() {
  const { selectedRootId, setSelectedRootId } = useSelectedRoot();
  const { activeNodeId, allThoughts } = useThoughtNavigation();
  const { createThought, updateThought, setThoughtColor, setParent, removeThought } =
    useThoughts(selectedRootId);
  const { renameProject, setProjectColor, cloneProject } = useProjects();
  const confirm = useConfirm();

  const create = useCallback(async () => {
    if (!activeNodeId) return;
    return createThought('', { title: '', parentId: activeNodeId });
  }, [activeNodeId, createThought]);

  const update = useCallback((id: string, data: { title?: string; body?: string }) => {
    // The root pseudo-node is the project itself: title = project name, no body.
    if (id === selectedRootId) {
      if (data.title !== undefined) renameProject(id, data.title);
      return;
    }
    updateThought(id, data);
  }, [selectedRootId, renameProject, updateThought]);

  const remove = useCallback(async (id: string) => {
    const target = allThoughts.find((t) => t.id === id);
    const childCount = allThoughts.filter((t) => t.parentId === id).length;
    const ok = await confirm({
      message: `Delete "${thoughtName(target)}"?`,
      // Children aren't deleted — they lose their edge and float to the top level.
      detail: childCount > 0
        ? `${childCount} subthought${childCount === 1 ? '' : 's'} will move to the top level.`
        : undefined,
    });
    if (!ok) return;
    removeThought(id);
    // No manual nav fix-up: deleting the active node leaves a dangling tail,
    // which the navigation provider's self-heal effect pops.
  }, [allThoughts, confirm, removeThought]);

  const setBorderColor = useCallback((color: string) => {
    if (!activeNodeId) return;
    if (activeNodeId === selectedRootId) setProjectColor(activeNodeId, color);
    else setThoughtColor(activeNodeId, color);
  }, [activeNodeId, selectedRootId, setProjectColor, setThoughtColor]);

  const clone = useCallback(async () => {
    if (!selectedRootId) return;
    const project = await cloneProject(selectedRootId);
    setSelectedRootId(project.id); // the nav provider resets the stack on switch
  }, [selectedRootId, cloneProject, setSelectedRootId]);

  return { create, update, remove, reparent: setParent, setBorderColor, clone };
}
