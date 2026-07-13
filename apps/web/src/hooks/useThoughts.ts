import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  thoughtsApi,
  relationshipsApi,
  type Thought as ApiThought,
  type Relationship,
  type WorkspaceSnapshot,
} from '../lib/pbApi';
import { queryKeys } from '../lib/queryClient';
import { useWorkspaceMutation, useWorkspaceQuery } from './query-utils';

/**
 * Client-side thought shape.
 *
 * The v2 API stores hierarchy in the relationships table (source = child,
 * target = parent) and edge-labels as tag relationships onto isEdge labels.
 * This hook joins those back onto each thought so components keep the simple
 * v1-era shape (parentId, isRoot, edgeLabels).
 *
 * All state lives in the shared ['workspace', projectId] snapshot cache;
 * mutations patch it optimistically (rollback + toast on failure).
 */
/** An explicit directional relationship (kind='edge') joined with its label. */
export interface EdgeRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  label: { id: string; name: string; color: string } | null;
}

export interface Thought {
  id: string;
  projectId: string;
  /** Hierarchy parent (thought id), or null for project-top-level thoughts. */
  parentId: string | null;
  /** True only for the synthesized project-root pseudo-node (see HomePage). */
  isRoot: boolean;
  title: string;
  body: string;
  color: string | null;
  contentHash: string | null;
  canvasX: number | null;
  canvasY: number | null;
  width: number | null;
  height: number | null;
  /** Not returned by the v2 thoughts endpoint (lives on entities); '' when unknown. */
  createdAt: string;
  updatedAt: string;
  edgeLabels: Array<{ id: string; name: string; color: string }>;
  /** Hierarchy relationship id linking this thought to its parent, if any. */
  parentRelationshipId: string | null;
}

function toClientThought(
  row: ApiThought,
  hierarchyBySource: Map<string, Relationship>,
  edgeLabelsByThought: Map<string, Array<{ id: string; name: string; color: string }>>,
): Thought {
  const parentRel = hierarchyBySource.get(row.id);
  return {
    id: row.id,
    projectId: row.projectId,
    parentId: parentRel ? parentRel.targetId : null,
    isRoot: false,
    title: row.title,
    body: row.body,
    color: row.color,
    contentHash: row.contentHash,
    canvasX: row.canvasX,
    canvasY: row.canvasY,
    width: row.width,
    height: row.height,
    createdAt: '',
    updatedAt: '',
    edgeLabels: edgeLabelsByThought.get(row.id) ?? [],
    parentRelationshipId: parentRel ? parentRel.id : null,
  };
}

const EMPTY = { thoughts: [] as Thought[], edgeRelationships: [] as EdgeRelationship[] };

function deriveViews(snap?: WorkspaceSnapshot) {
  if (!snap) return EMPTY;

  const hierarchyBySource = new Map<string, Relationship>();
  for (const rel of snap.relationships) {
    if (rel.kind === 'hierarchy') hierarchyBySource.set(rel.sourceId, rel);
  }

  const labelById = new Map(snap.labels.map((l) => [l.id, l]));
  const edgeLabelsByThought = new Map<string, Array<{ id: string; name: string; color: string }>>();
  const edgeRelationships: EdgeRelationship[] = [];
  for (const rel of snap.relationships) {
    if (rel.kind === 'tag') {
      const label = labelById.get(rel.targetId);
      if (!label?.isEdge) continue;
      let arr = edgeLabelsByThought.get(rel.sourceId);
      if (!arr) {
        arr = [];
        edgeLabelsByThought.set(rel.sourceId, arr);
      }
      arr.push({ id: label.id, name: label.name, color: label.color });
    } else if (rel.kind === 'edge') {
      const label = rel.labelId ? labelById.get(rel.labelId) : undefined;
      edgeRelationships.push({
        id: rel.id,
        sourceId: rel.sourceId,
        targetId: rel.targetId,
        label: label ? { id: label.id, name: label.name, color: label.color } : null,
      });
    }
  }

  return {
    thoughts: snap.thoughts.map((row) => toClientThought(row, hierarchyBySource, edgeLabelsByThought)),
    edgeRelationships,
  };
}

export function useThoughts(projectId?: string) {
  const queryClient = useQueryClient();
  const query = useWorkspaceQuery(projectId);
  const { thoughts, edgeRelationships } = useMemo(() => deriveViews(query.data), [query.data]);

  const createMutation = useWorkspaceMutation(
    projectId,
    'Create thought',
    async ({ row, parentId, tempRelId }: { row: ApiThought; parentId?: string; tempRelId: string }) => {
      const created = await thoughtsApi.create({
        id: row.id,
        projectId: row.projectId,
        body: row.body,
        title: row.title,
        canvasX: row.canvasX ?? undefined,
        canvasY: row.canvasY ?? undefined,
        parentId,
      });
      // Swap the placeholder hierarchy-rel id for the server-generated one —
      // the only piece of a create the client can't generate itself.
      if (created.parentRelationshipId) {
        queryClient.setQueryData<WorkspaceSnapshot>(queryKeys.workspace(row.projectId), (snap) => snap && {
          ...snap,
          relationships: snap.relationships.map((r) =>
            r.id === tempRelId ? { ...r, id: created.parentRelationshipId! } : r),
        });
      }
    },
    (snap, { row, parentId, tempRelId }) => ({
      ...snap,
      thoughts: [row, ...snap.thoughts],
      relationships: parentId
        ? [...snap.relationships, {
            id: tempRelId, projectId: row.projectId, ownerId: row.ownerId,
            sourceId: row.id, targetId: parentId, kind: 'hierarchy' as const,
            labelId: null, createdAt: '', updatedAt: '',
          }]
        : snap.relationships,
    }),
  );

  const createThought = useCallback(async (
    body: string,
    opts?: { canvasX?: number; canvasY?: number; title?: string; parentId?: string },
  ) => {
    if (!projectId) throw new Error('No project selected');
    // A parent that is a real thought becomes a hierarchy edge (created
    // server-side in the same tx). The project id itself means "top level".
    const parentId = opts?.parentId && opts.parentId !== projectId ? opts.parentId : undefined;
    const row: ApiThought = {
      id: crypto.randomUUID(),
      projectId,
      ownerId: '',
      color: null,
      body,
      title: opts?.title ?? '',
      contentHash: null,
      canvasX: opts?.canvasX ?? null,
      canvasY: opts?.canvasY ?? null,
      width: null,
      height: null,
    };
    createMutation.mutate({ row, parentId, tempRelId: crypto.randomUUID() });
    return { ...toClientThought(row, new Map(), new Map()), parentId: parentId ?? null };
  }, [projectId, createMutation.mutate]);

  const updateMutation = useWorkspaceMutation(
    projectId,
    'Update thought',
    ({ id, data }: { id: string; data: Partial<ApiThought> }) => thoughtsApi.update(id, data),
    (snap, { id, data }) => ({
      ...snap,
      thoughts: snap.thoughts.map((t) => (t.id === id ? { ...t, ...data } : t)),
    }),
  );

  const updateThought = useCallback((
    id: string,
    data: { title?: string; body?: string; canvasX?: number; canvasY?: number; width?: number; height?: number },
  ) => updateMutation.mutate({ id, data }), [updateMutation.mutate]);

  const colorMutation = useWorkspaceMutation(
    projectId,
    'Set colour',
    ({ id, color }: { id: string; color: string }) => thoughtsApi.setColor(id, color),
    (snap, { id, color }) => ({
      ...snap,
      thoughts: snap.thoughts.map((t) => (t.id === id ? { ...t, color } : t)),
    }),
  );

  const setThoughtColor = useCallback(
    (id: string, color: string) => colorMutation.mutate({ id, color }),
    [colorMutation.mutate],
  );

  const removeMutation = useWorkspaceMutation(
    projectId,
    'Delete thought',
    (id: string) => thoughtsApi.remove(id),
    // Entity delete cascades to relationships server-side; mirror it in the cache.
    (snap, id) => ({
      ...snap,
      thoughts: snap.thoughts.filter((t) => t.id !== id),
      relationships: snap.relationships.filter((r) => r.sourceId !== id && r.targetId !== id),
    }),
  );

  const removeThought = useCallback((id: string) => removeMutation.mutate(id), [removeMutation.mutate]);

  const addRelMutation = useWorkspaceMutation(
    projectId,
    'Add relationship',
    (rel: Relationship) => relationshipsApi.create({
      id: rel.id, projectId: rel.projectId, sourceId: rel.sourceId,
      targetId: rel.targetId, kind: 'edge', labelId: rel.labelId ?? undefined,
    }),
    (snap, rel) => ({ ...snap, relationships: [...snap.relationships, rel] }),
  );

  const createEdgeRelationship = useCallback((
    sourceId: string,
    targetId: string,
    label: { id: string; name: string; color: string },
  ) => {
    if (!projectId) return;
    addRelMutation.mutate({
      id: crypto.randomUUID(), projectId, ownerId: '', sourceId, targetId,
      kind: 'edge', labelId: label.id, createdAt: '', updatedAt: '',
    });
  }, [projectId, addRelMutation.mutate]);

  const removeRelMutation = useWorkspaceMutation(
    projectId,
    'Remove relationship',
    (id: string) => relationshipsApi.remove(id),
    (snap, id) => ({ ...snap, relationships: snap.relationships.filter((r) => r.id !== id) }),
  );

  const removeEdgeRelationship = useCallback(
    (id: string) => removeRelMutation.mutate(id),
    [removeRelMutation.mutate],
  );

  return {
    thoughts,
    edgeRelationships,
    loading: !!projectId && query.isPending,
    createThought,
    updateThought,
    setThoughtColor,
    removeThought,
    createEdgeRelationship,
    removeEdgeRelationship,
    refresh: query.refetch,
  };
}
