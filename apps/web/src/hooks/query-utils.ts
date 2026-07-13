import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workspaceApi, type WorkspaceSnapshot } from '../lib/pbApi';
import { queryKeys } from '../lib/queryClient';

/** The per-project snapshot (thoughts + relationships + labels) every workspace hook derives from. */
export function useWorkspaceQuery(projectId?: string) {
  return useQuery({
    queryKey: queryKeys.workspace(projectId ?? ''),
    queryFn: () => workspaceApi.snapshot(projectId!),
    enabled: !!projectId,
  });
}

/**
 * Optimistic mutation against a single query key: the cache is patched
 * immediately, restored on error (the MutationCache surfaces the toast), and
 * left as-is on success — client-generated ids make the patch exact, so no
 * invalidation round trip is needed.
 */
export function useOptimisticMutation<TData, TVars>(
  queryKey: readonly unknown[] | undefined,
  verb: string,
  mutationFn: (vars: TVars) => Promise<unknown>,
  patch: (data: TData, vars: TVars) => TData,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: { verb },
    onMutate: async (vars: TVars) => {
      if (!queryKey) return {};
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TData>(queryKey);
      queryClient.setQueryData<TData>(queryKey, (data) => data && patch(data, vars));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (queryKey && ctx?.previous !== undefined) {
        queryClient.setQueryData(queryKey, ctx.previous);
      }
    },
  });
}

export function useWorkspaceMutation<TVars>(
  projectId: string | undefined,
  verb: string,
  mutationFn: (vars: TVars) => Promise<unknown>,
  patch: (snap: WorkspaceSnapshot, vars: TVars) => WorkspaceSnapshot,
) {
  return useOptimisticMutation<WorkspaceSnapshot, TVars>(
    projectId ? queryKeys.workspace(projectId) : undefined,
    verb,
    mutationFn,
    patch,
  );
}
