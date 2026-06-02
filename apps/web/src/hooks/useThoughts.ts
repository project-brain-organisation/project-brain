import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { onThoughtsChanged, notifyThoughtsChanged } from '../lib/thoughtsEvents';

export interface Thought {
  id: string;
  userId: string;
  parentId: string | null;
  isRoot: boolean;
  title: string;
  body: string;
  contentHash: string | null;
  canvasX: number | null;
  canvasY: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
  edgeLabels: Array<{ id: string; name: string; color: string }>;
}

export function useThoughts(rootId?: string) {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [roots, setRoots] = useState<Thought[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoots = useCallback(async () => {
    const data = await api.get<Thought[]>('/api/thoughts/roots');
    setRoots(data);
    return data;
  }, []);

  const fetchTree = useCallback(async (rid?: string) => {
    const url = rid ? `/api/thoughts/tree?rootId=${rid}` : '/api/thoughts';
    const data = await api.get<Thought[]>(url);
    setThoughts(data);
    return data;
  }, []);

  useEffect(() => {
    setLoading(true);
    const load = async () => {
      await fetchRoots();
      if (rootId) {
        await fetchTree(rootId);
      } else {
        setThoughts([]);
      }
      setLoading(false);
    };
    load();
  }, [rootId, fetchRoots, fetchTree]);

  useEffect(() => {
    return onThoughtsChanged(() => {
      fetchRoots();
      if (rootId) fetchTree(rootId);
    });
  }, [rootId, fetchRoots, fetchTree]);

  const createThought = useCallback(async (
    body: string,
    opts?: { canvasX?: number; canvasY?: number; title?: string; parentId?: string; isRoot?: boolean },
  ) => {
    const thought = await api.post<Thought>('/api/thoughts', {
      body,
      title: opts?.title,
      parentId: opts?.parentId ?? rootId,
      isRoot: opts?.isRoot,
      canvasX: opts?.canvasX,
      canvasY: opts?.canvasY,
    });
    setThoughts((prev) => [thought, ...prev]);
    notifyThoughtsChanged();
    return thought;
  }, [rootId]);

  const createRoot = useCallback(async (title: string) => {
    const thought = await api.post<Thought>('/api/thoughts', { title, isRoot: true });
    setRoots((prev) => [...prev, thought]);
    notifyThoughtsChanged();
    return thought;
  }, []);

  const updateThought = useCallback(async (
    id: string,
    data: { title?: string; body?: string; parentId?: string; canvasX?: number; canvasY?: number; width?: number; height?: number },
  ) => {
    const updated = await api.patch<Thought>(`/api/thoughts/${id}`, data);
    setThoughts((prev) => prev.map((t) => (t.id === id ? updated : t)));
    setRoots((prev) => prev.map((r) => (r.id === id ? updated : r)));
    notifyThoughtsChanged();
    return updated;
  }, []);

  const removeThought = useCallback(async (id: string) => {
    await api.delete(`/api/thoughts/${id}`);
    setThoughts((prev) => prev.filter((t) => t.id !== id));
    setRoots((prev) => prev.filter((r) => r.id !== id));
    notifyThoughtsChanged();
  }, []);

  return {
    thoughts,
    roots,
    loading,
    createThought,
    createRoot,
    updateThought,
    removeThought,
    fetchRoots,
    fetchTree,
    refresh: fetchTree,
  };
}
