import { useCallback, useMemo } from 'react';
import { labelsApi, relationshipsApi, type Label, type Relationship } from '../lib/pbApi';
import { useWorkspaceMutation, useWorkspaceQuery } from './query-utils';

export type { Label };

/**
 * A label assigned to a specific thought. In v2 the assignment is a tag
 * relationship (source = thought, target = label); relationshipId is what
 * gets deleted on unassign.
 *
 * Both hooks derive from the shared ['workspace', projectId] snapshot cache;
 * mutations patch it optimistically (rollback + toast on failure).
 */
export interface ThoughtLabel {
  id: string;
  name: string;
  color: string;
  isEdge: boolean;
  relationshipId: string;
}

const NO_LABELS: Label[] = [];

export function useLabels(projectId?: string) {
  const query = useWorkspaceQuery(projectId);
  const labels = query.data?.labels ?? NO_LABELS;

  const createMutation = useWorkspaceMutation(
    projectId,
    'Create label',
    (label: Label) => labelsApi.create({
      id: label.id, projectId: label.projectId, name: label.name, color: label.color,
    }),
    (snap, label) => ({ ...snap, labels: [...snap.labels, label] }),
  );

  const createLabel = useCallback(async (name: string, color?: string) => {
    if (!projectId) throw new Error('No project selected');
    const label: Label = {
      id: crypto.randomUUID(),
      projectId,
      ownerId: '',
      name,
      color: color ?? '#999999',
      isEdge: false,
    };
    createMutation.mutate(label);
    return label;
  }, [projectId, createMutation.mutate]);

  const updateMutation = useWorkspaceMutation(
    projectId,
    'Update label',
    ({ id, data }: { id: string; data: Partial<Label> }) => labelsApi.update(id, data),
    (snap, { id, data }) => ({
      ...snap,
      labels: snap.labels.map((l) => (l.id === id ? { ...l, ...data } : l)),
    }),
  );

  const updateLabel = useCallback(
    (id: string, data: { name?: string; color?: string; isEdge?: boolean }) =>
      updateMutation.mutate({ id, data }),
    [updateMutation.mutate],
  );

  const removeMutation = useWorkspaceMutation(
    projectId,
    'Delete label',
    (id: string) => labelsApi.remove(id),
    // Entity delete cascades to the label's relationships server-side.
    (snap, id) => ({
      ...snap,
      labels: snap.labels.filter((l) => l.id !== id),
      relationships: snap.relationships.filter((r) => r.targetId !== id && r.labelId !== id),
    }),
  );

  const removeLabel = useCallback((id: string) => removeMutation.mutate(id), [removeMutation.mutate]);

  return { labels, loading: !!projectId && query.isPending, fetchLabels: query.refetch, createLabel, removeLabel, updateLabel };
}

export function useThoughtLabels(thoughtId?: string, projectId?: string) {
  const query = useWorkspaceQuery(projectId);

  const thoughtLabels = useMemo(() => {
    const snap = query.data;
    if (!snap || !thoughtId) return [];
    const labelById = new Map(snap.labels.map((l) => [l.id, l]));
    return snap.relationships.flatMap((rel): ThoughtLabel[] => {
      if (rel.kind !== 'tag' || rel.sourceId !== thoughtId) return [];
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
  }, [query.data, thoughtId]);

  const assignMutation = useWorkspaceMutation(
    projectId,
    'Assign label',
    (rel: Relationship) => relationshipsApi.create({
      id: rel.id, projectId: rel.projectId, sourceId: rel.sourceId,
      targetId: rel.targetId, kind: 'tag',
    }),
    (snap, rel) => ({ ...snap, relationships: [...snap.relationships, rel] }),
  );

  const assignLabel = useCallback((labelId: string) => {
    if (!thoughtId || !projectId) return;
    assignMutation.mutate({
      id: crypto.randomUUID(), projectId, ownerId: '', sourceId: thoughtId,
      targetId: labelId, kind: 'tag', labelId: null, createdAt: '', updatedAt: '',
    });
  }, [thoughtId, projectId, assignMutation.mutate]);

  const unassignMutation = useWorkspaceMutation(
    projectId,
    'Remove label',
    (relationshipId: string) => relationshipsApi.remove(relationshipId),
    (snap, relationshipId) => ({
      ...snap,
      relationships: snap.relationships.filter((r) => r.id !== relationshipId),
    }),
  );

  const unassignLabel = useCallback((labelId: string) => {
    const assignment = thoughtLabels.find((tl) => tl.id === labelId);
    if (assignment) unassignMutation.mutate(assignment.relationshipId);
  }, [thoughtLabels, unassignMutation.mutate]);

  return {
    thoughtLabels,
    loading: !!projectId && query.isPending,
    assignLabel,
    unassignLabel,
    refresh: query.refetch,
  };
}
