import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi, type Project, type PublicProject } from '../lib/pbApi';
import { queryKeys } from '../lib/queryClient';
import { useOptimisticMutation } from './query-utils';

export type { Project, PublicProject };

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

  // Clone is non-optimistic like create: it's rare, deep-copies server-side,
  // and callers need the returned row to select the new project.
  const cloneProject = useCallback(async (id: string) => {
    const project = await projectsApi.clone(id);
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

  const setProjectPublic = useCallback(
    (id: string, isPublic: boolean) => updateMutation.mutate({ id, data: { isPublic } }),
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

  // Unsubscribe drops a subscribed public graph from the sidebar (non-destructive
  // — the graph itself is untouched). Same optimistic filter as delete.
  const unsubscribeMutation = useOptimisticMutation<Project[], string>(
    queryKeys.projects,
    'Remove graph',
    (id) => projectsApi.unsubscribe(id),
    (list, id) => list.filter((p) => p.id !== id),
  );

  const unsubscribeProject = useCallback(
    (id: string) => unsubscribeMutation.mutateAsync(id).catch(() => {}).then(() => {}),
    [unsubscribeMutation.mutateAsync],
  );

  return {
    projects,
    loading: query.isPending,
    createProject,
    cloneProject,
    renameProject,
    setProjectColor,
    setProjectPublic,
    removeProject,
    unsubscribeProject,
    refresh: query.refetch,
  };
}

/**
 * The Discover feed: all public graphs except the caller's own, each flagged
 * with whether it's already in the sidebar. Subscribing appends the returned
 * row (role 'subscriber') to the shared ['projects'] cache so the sidebar
 * updates instantly, and flips the flag here.
 */
export function usePublicProjects(enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.publicProjects,
    queryFn: projectsApi.listPublic,
    enabled,
  });

  const subscribeMutation = useOptimisticMutation<PublicProject[], string>(
    queryKeys.publicProjects,
    'Add graph',
    async (id) => {
      const project = await projectsApi.subscribe(id);
      queryClient.setQueryData<Project[]>(queryKeys.projects, (list) =>
        list?.some((p) => p.id === project.id) ? list : [...(list ?? []), project],
      );
      return project;
    },
    // No cache shape change for the public list itself; the subscribed flag is
    // derived from the ['projects'] cache by the dialog, so nothing to patch.
    (list) => list,
  );

  return {
    publicProjects: query.data ?? [],
    loading: query.isPending,
    subscribe: (id: string) => subscribeMutation.mutateAsync(id).catch(() => {}),
  };
}
