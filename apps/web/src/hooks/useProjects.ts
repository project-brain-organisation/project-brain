import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi, type Project } from '../lib/pbApi';
import { queryKeys } from '../lib/queryClient';
import { useOptimisticMutation } from './query-utils';

export type { Project };

const NO_PROJECTS: Project[] = [];

/**
 * Project list backed by the shared ['projects'] query — every mounted
 * instance (Shell, HomePage) reads the same cache, so a mutation in one is
 * instantly visible in the others.
 */
export function useProjects() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.projects, queryFn: projectsApi.list });
  const projects = query.data ?? NO_PROJECTS;

  // Create is the one non-optimistic mutation: it's rare, sits behind a form,
  // and callers need the server row to select the new project.
  const createProject = useCallback(async (name?: string) => {
    const project = await projectsApi.create({ name: name?.trim() || 'Untitled Project' });
    queryClient.setQueryData<Project[]>(queryKeys.projects, (list) => [...(list ?? []), project]);
    return project;
  }, [queryClient]);

  const updateMutation = useOptimisticMutation<Project[], { id: string; data: Parameters<typeof projectsApi.update>[1] }>(
    queryKeys.projects,
    'Update project',
    ({ id, data }) => projectsApi.update(id, data),
    (list, { id, data }) => list.map((p) => (p.id === id ? { ...p, ...data } : p)),
  );

  const renameProject = useCallback(
    (id: string, name: string) => updateMutation.mutate({ id, data: { name } }),
    [updateMutation.mutate],
  );

  const setProjectColor = useCallback(
    (id: string, color: string) => updateMutation.mutate({ id, data: { color } }),
    [updateMutation.mutate],
  );

  const removeMutation = useOptimisticMutation<Project[], string>(
    queryKeys.projects,
    'Delete project',
    (id) => projectsApi.remove(id),
    (list, id) => list.filter((p) => p.id !== id),
  );

  // Errors are already rolled back + toasted; resolve regardless so callers
  // can sequence UI cleanup without a catch.
  const removeProject = useCallback(
    (id: string) => removeMutation.mutateAsync(id).catch(() => {}).then(() => {}),
    [removeMutation.mutateAsync],
  );

  return {
    projects,
    loading: query.isPending,
    createProject,
    renameProject,
    setProjectColor,
    removeProject,
    refresh: query.refetch,
  };
}
