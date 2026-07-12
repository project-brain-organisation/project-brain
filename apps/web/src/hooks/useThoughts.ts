import { useState, useEffect, useCallback } from 'react';
import {
  thoughtsApi,
  relationshipsApi,
  labelsApi,
  type Thought as ApiThought,
  type Relationship,
  type Label,
} from '../lib/pbApi';
import { onThoughtsChanged, notifyThoughtsChanged } from '../lib/thoughtsEvents';

/**
 * Client-side thought shape.
 *
 * The v2 API stores hierarchy in the relationships table (source = child,
 * target = parent) and edge-labels as tag relationships onto isEdge labels.
 * This hook joins those back onto each thought so components keep the simple
 * v1-era shape (parentId, isRoot, edgeLabels).
 */
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

export function useThoughts(projectId?: string) {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!projectId) {
      setThoughts([]);
      setLoading(false);
      return [];
    }
    try {
      const [rows, hierarchyRels, tagRels, labels] = await Promise.all([
        thoughtsApi.listByProject(projectId),
        relationshipsApi.listByProject(projectId, 'hierarchy'),
        relationshipsApi.listByProject(projectId, 'tag'),
        labelsApi.listByProject(projectId),
      ]);

      const hierarchyBySource = new Map<string, Relationship>();
      for (const rel of hierarchyRels) hierarchyBySource.set(rel.sourceId, rel);

      const edgeLabelById = new Map<string, Label>();
      for (const label of labels) {
        if (label.isEdge) edgeLabelById.set(label.id, label);
      }
      const edgeLabelsByThought = new Map<string, Array<{ id: string; name: string; color: string }>>();
      for (const rel of tagRels) {
        const label = edgeLabelById.get(rel.targetId);
        if (!label) continue;
        let arr = edgeLabelsByThought.get(rel.sourceId);
        if (!arr) {
          arr = [];
          edgeLabelsByThought.set(rel.sourceId, arr);
        }
        arr.push({ id: label.id, name: label.name, color: label.color });
      }

      const data = rows.map((row) => toClientThought(row, hierarchyBySource, edgeLabelsByThought));
      setThoughts(data);
      return data;
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    fetchAll().catch((err) => console.error('Failed to load thoughts:', err));
  }, [fetchAll]);

  useEffect(() => {
    return onThoughtsChanged(() => {
      fetchAll().catch((err) => console.error('Failed to refresh thoughts:', err));
    });
  }, [fetchAll]);

  const createThought = useCallback(async (
    body: string,
    opts?: { canvasX?: number; canvasY?: number; title?: string; parentId?: string },
  ) => {
    if (!projectId) throw new Error('No project selected');

    const row = await thoughtsApi.create({
      projectId,
      body,
      title: opts?.title,
      canvasX: opts?.canvasX,
      canvasY: opts?.canvasY,
    });

    // A parent that is a real thought becomes a hierarchy edge (source = child).
    // The project id itself means "top level" — no edge.
    let parentId: string | null = null;
    let parentRelationshipId: string | null = null;
    if (opts?.parentId && opts.parentId !== projectId) {
      const rel = await relationshipsApi.create({
        projectId,
        sourceId: row.id,
        targetId: opts.parentId,
        kind: 'hierarchy',
      });
      parentId = opts.parentId;
      parentRelationshipId = rel.id;
    }

    const thought: Thought = {
      ...toClientThought(row, new Map(), new Map()),
      parentId,
      parentRelationshipId,
    };
    setThoughts((prev) => [thought, ...prev]);
    notifyThoughtsChanged();
    return thought;
  }, [projectId]);

  const updateThought = useCallback(async (
    id: string,
    data: { title?: string; body?: string; canvasX?: number; canvasY?: number; width?: number; height?: number },
  ) => {
    const row = await thoughtsApi.update(id, data);
    setThoughts((prev) => prev.map((t) => (t.id === id ? { ...t, ...row } : t)));
    notifyThoughtsChanged();
    return row;
  }, []);

  const setThoughtColor = useCallback(async (id: string, color: string) => {
    setThoughts((prev) => prev.map((t) => (t.id === id ? { ...t, color } : t)));
    await thoughtsApi.setColor(id, color);
    notifyThoughtsChanged();
  }, []);

  const removeThought = useCallback(async (id: string) => {
    await thoughtsApi.remove(id);
    setThoughts((prev) => prev.filter((t) => t.id !== id));
    notifyThoughtsChanged();
  }, []);

  return {
    thoughts,
    loading,
    createThought,
    updateThought,
    setThoughtColor,
    removeThought,
    refresh: fetchAll,
  };
}
