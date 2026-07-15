import { MutationCache, QueryClient } from '@tanstack/react-query';
import { errorMessage, toastError } from './toasts';

export const queryKeys = {
  projects: ['projects'] as const,
  publicProjects: ['public-projects'] as const,
  workspace: (projectId: string) => ['workspace', projectId] as const,
};

/**
 * SSE covers external changes, so queries can stay fresh for a while without
 * aggressive refetching. Mutations are optimistic: each one rolls its cache
 * patch back in its own onError; the cache-level handler surfaces the toast.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
    mutations: { retry: 0 },
  },
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      toastError(`${String(mutation.meta?.verb ?? 'Update')} failed — ${errorMessage(err)}`);
    },
  }),
});
