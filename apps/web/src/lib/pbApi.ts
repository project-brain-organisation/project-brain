/**
 * pbApi.ts — typed client for the v2 backend surface.
 *
 * One function per endpoint, grouped by domain. All paths are relative and go
 * through the vite dev proxy (or same-origin in prod); auth rides on the
 * pb_token cookie via `credentials: 'include'` in lib/api.ts.
 *
 * Relationship semantics (mirrors RelationshipsService):
 *   - hierarchy: sourceId = child thought, targetId = parent thought
 *   - tag:       sourceId = thought, targetId = label
 *   - edge:      free-form, may carry labelId
 */
import { api } from './api';

// ── Types (mirror the drizzle rows the API returns) ────────────────

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  emoji: string | null;
  isPublic: boolean;
}

export interface Thought {
  id: string;
  projectId: string;
  ownerId: string;
  color: string | null;
  body: string;
  title: string;
  contentHash: string | null;
  canvasX: number | null;
  canvasY: number | null;
  width: number | null;
  height: number | null;
}

export interface Label {
  id: string;
  projectId: string;
  ownerId: string;
  name: string;
  color: string;
  isEdge: boolean;
}

export type RelationshipKind = 'hierarchy' | 'tag' | 'edge';

export interface Relationship {
  id: string;
  projectId: string;
  ownerId: string;
  sourceId: string;
  targetId: string;
  kind: RelationshipKind;
  labelId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Projects ────────────────────────────────────────────────────────

export const projectsApi = {
  list: () => api.get<Project[]>('/api/projects'),
  get: (id: string) => api.get<Project>(`/api/projects/${id}`),
  create: (data: { name: string; emoji?: string; isPublic?: boolean }) =>
    api.post<Project>('/api/projects', data),
  update: (id: string, data: Partial<{ name: string; emoji: string; isPublic: boolean }>) =>
    api.patch<Project>(`/api/projects/${id}`, data),
  remove: (id: string) => api.delete<{ deleted: boolean }>(`/api/projects/${id}`),
};

// ── Thoughts ────────────────────────────────────────────────────────

export interface CreateThoughtInput {
  projectId: string;
  body: string;
  title?: string;
  color?: string;
  canvasX?: number;
  canvasY?: number;
  width?: number;
  height?: number;
}

export type UpdateThoughtInput = Partial<{
  body: string;
  title: string;
  canvasX: number | null;
  canvasY: number | null;
  width: number | null;
  height: number | null;
}>;

export const thoughtsApi = {
  listByProject: (projectId: string) =>
    api.get<Thought[]>(`/api/workspace/thoughts?projectId=${projectId}`),
  get: (id: string) => api.get<Thought>(`/api/workspace/thoughts/${id}`),
  create: (data: CreateThoughtInput) => api.post<Thought>('/api/workspace/thoughts', data),
  update: (id: string, data: UpdateThoughtInput) =>
    api.patch<Thought>(`/api/workspace/thoughts/${id}`, data),
  setColor: (id: string, color: string) =>
    api.patch<Thought>(`/api/workspace/thoughts/${id}/color`, { color }),
  clearColor: (id: string) => api.delete<Thought>(`/api/workspace/thoughts/${id}/color`),
  remove: (id: string) => api.delete<{ deleted: boolean }>(`/api/workspace/thoughts/${id}`),
};

// ── Labels ──────────────────────────────────────────────────────────

export const labelsApi = {
  listByProject: (projectId: string) =>
    api.get<Label[]>(`/api/workspace/labels/project/${projectId}`),
  create: (data: { projectId: string; name: string; color?: string; isEdge?: boolean }) =>
    api.post<Label>('/api/workspace/labels', data),
  update: (id: string, data: Partial<{ name: string; color: string; isEdge: boolean }>) =>
    api.patch<Label>(`/api/workspace/labels/${id}`, data),
  remove: (id: string) => api.delete<{ deleted: boolean }>(`/api/workspace/labels/${id}`),
};

// ── Relationships ───────────────────────────────────────────────────

export const relationshipsApi = {
  listByProject: (projectId: string, kind?: RelationshipKind) =>
    api.get<Relationship[]>(
      `/api/workspace/relationships?projectId=${projectId}${kind ? `&kind=${kind}` : ''}`,
    ),
  create: (data: {
    projectId: string;
    sourceId: string;
    targetId: string;
    kind: RelationshipKind;
    labelId?: string;
  }) => api.post<Relationship>('/api/workspace/relationships', data),
  remove: (id: string) => api.delete<{ deleted: boolean }>(`/api/workspace/relationships/${id}`),
};
