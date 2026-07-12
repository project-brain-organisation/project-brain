import { useState, useEffect, useCallback } from 'react';
import { labelsApi, relationshipsApi, type Label } from '../lib/pbApi';

export type { Label };

/**
 * A label assigned to a specific thought. In v2 the assignment is a tag
 * relationship (source = thought, target = label); relationshipId is what
 * gets deleted on unassign.
 */
export interface ThoughtLabel {
  id: string;
  name: string;
  color: string;
  isEdge: boolean;
  relationshipId: string;
}

export function useLabels(projectId?: string) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLabels = useCallback(async () => {
    if (!projectId) {
      setLabels([]);
      setLoading(false);
      return [];
    }
    try {
      const data = await labelsApi.listByProject(projectId);
      setLabels(data);
      return data;
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchLabels().catch((err) => console.error('Failed to load labels:', err));
  }, [fetchLabels]);

  const createLabel = useCallback(async (name: string, color?: string) => {
    if (!projectId) throw new Error('No project selected');
    const label = await labelsApi.create({ projectId, name, color });
    setLabels((prev) => [...prev, label]);
    return label;
  }, [projectId]);

  const removeLabel = useCallback(async (id: string) => {
    await labelsApi.remove(id);
    setLabels((prev) => prev.filter((l) => l.id !== id));
    window.dispatchEvent(new Event('labels-changed'));
  }, []);

  const updateLabel = useCallback(async (id: string, data: { name?: string; color?: string; isEdge?: boolean }) => {
    const label = await labelsApi.update(id, data);
    setLabels((prev) => prev.map((l) => (l.id === id ? label : l)));
    window.dispatchEvent(new Event('labels-changed'));
    return label;
  }, []);

  return { labels, loading, fetchLabels, createLabel, removeLabel, updateLabel };
}

export function useThoughtLabels(thoughtId?: string, projectId?: string) {
  const [thoughtLabels, setThoughtLabels] = useState<ThoughtLabel[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchThoughtLabels = useCallback(async () => {
    if (!thoughtId || !projectId) {
      setThoughtLabels([]);
      setLoading(false);
      return [];
    }
    try {
      const [labels, tagRels] = await Promise.all([
        labelsApi.listByProject(projectId),
        relationshipsApi.listByProject(projectId, 'tag'),
      ]);
      const labelById = new Map(labels.map((l) => [l.id, l]));
      const data: ThoughtLabel[] = tagRels
        .filter((rel) => rel.sourceId === thoughtId)
        .flatMap((rel) => {
          const label = labelById.get(rel.targetId);
          if (!label) return [];
          return [{
            id: label.id,
            name: label.name,
            color: label.color,
            isEdge: label.isEdge,
            relationshipId: rel.id,
          }];
        });
      setThoughtLabels(data);
      return data;
    } finally {
      setLoading(false);
    }
  }, [thoughtId, projectId]);

  useEffect(() => {
    fetchThoughtLabels().catch((err) => console.error('Failed to load thought labels:', err));
  }, [fetchThoughtLabels]);

  useEffect(() => {
    function onLabelsChanged() {
      fetchThoughtLabels().catch((err) => console.error('Failed to refresh thought labels:', err));
    }
    window.addEventListener('labels-changed', onLabelsChanged);
    return () => window.removeEventListener('labels-changed', onLabelsChanged);
  }, [fetchThoughtLabels]);

  const assignLabel = useCallback(async (labelId: string) => {
    if (!thoughtId || !projectId) return;
    await relationshipsApi.create({
      projectId,
      sourceId: thoughtId,
      targetId: labelId,
      kind: 'tag',
    });
    await fetchThoughtLabels();
    window.dispatchEvent(new Event('labels-changed'));
  }, [thoughtId, projectId, fetchThoughtLabels]);

  const unassignLabel = useCallback(async (labelId: string) => {
    const assignment = thoughtLabels.find((tl) => tl.id === labelId);
    if (!assignment) return;
    await relationshipsApi.remove(assignment.relationshipId);
    setThoughtLabels((prev) => prev.filter((tl) => tl.id !== labelId));
    window.dispatchEvent(new Event('labels-changed'));
  }, [thoughtLabels]);

  return { thoughtLabels, loading, assignLabel, unassignLabel, refresh: fetchThoughtLabels };
}
