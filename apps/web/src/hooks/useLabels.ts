import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

export interface Label {
  id: string;
  name: string;
  color: string;
  isEdge: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ThoughtLabel {
  id: string;
  name: string;
  color: string;
  isEdge: boolean;
  thoughtLabelId: string;
  createdAt: string;
  updatedAt: string;
}

export function useLabels(projectId?: string) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLabels = useCallback(async () => {
    const url = projectId ? `/api/labels?projectId=${projectId}` : '/api/labels';
    const data = await api.get<Label[]>(url);
    setLabels(data);
    setLoading(false);
    return data;
  }, [projectId]);

  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  const createLabel = useCallback(async (name: string, color?: string) => {
    const label = await api.post<Label>('/api/labels', { name, color, projectId });
    setLabels((prev) => [...prev, label]);
    return label;
  }, [projectId]);

  const removeLabel = useCallback(async (id: string) => {
    await api.delete(`/api/labels/${id}`);
    setLabels((prev) => prev.filter((l) => l.id !== id));
    window.dispatchEvent(new Event('labels-changed'));
  }, []);

  const updateLabel = useCallback(async (id: string, data: { name?: string; color?: string; isEdge?: boolean }) => {
    const label = await api.patch<Label>(`/api/labels/${id}`, data);
    setLabels((prev) => prev.map((l) => (l.id === id ? label : l)));
    return label;
  }, []);

  return { labels, loading, fetchLabels, createLabel, removeLabel, updateLabel };
}

export function useThoughtLabels(thoughtId: string) {
  const [thoughtLabels, setThoughtLabels] = useState<ThoughtLabel[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchThoughtLabels = useCallback(async () => {
    const data = await api.get<ThoughtLabel[]>(`/api/labels/thought/${thoughtId}`);
    setThoughtLabels(data);
    setLoading(false);
    return data;
  }, [thoughtId]);

  useEffect(() => {
    fetchThoughtLabels();
  }, [fetchThoughtLabels]);

  useEffect(() => {
    function onLabelsChanged() { fetchThoughtLabels(); }
    window.addEventListener('labels-changed', onLabelsChanged);
    return () => window.removeEventListener('labels-changed', onLabelsChanged);
  }, [fetchThoughtLabels]);

  const assignLabel = useCallback(async (labelId: string) => {
    await api.post(`/api/labels/thought/${thoughtId}`, { labelId });
    await fetchThoughtLabels();
  }, [thoughtId, fetchThoughtLabels]);

  const unassignLabel = useCallback(async (labelId: string) => {
    await api.delete(`/api/labels/thought/${thoughtId}/${labelId}`);
    setThoughtLabels((prev) => prev.filter((tl) => tl.id !== labelId));
  }, [thoughtId]);

  return { thoughtLabels, loading, assignLabel, unassignLabel, refresh: fetchThoughtLabels };
}

export interface EdgeAssignment {
  thoughtId: string;
  labelId: string;
}

export function useEdgeAssignments() {
  const [assignments, setAssignments] = useState<EdgeAssignment[]>([]);

  const fetch = useCallback(async () => {
    const data = await api.get<EdgeAssignment[]>('/api/labels/edges');
    setAssignments(data);
    return data;
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    function onChanged() { fetch(); }
    window.addEventListener('labels-changed', onChanged);
    return () => window.removeEventListener('labels-changed', onChanged);
  }, [fetch]);

  return { assignments, refresh: fetch };
}
