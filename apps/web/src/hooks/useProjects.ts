import { useState, useEffect, useCallback } from 'react';
import { projectsApi, type Project } from '../lib/pbApi';
import { onThoughtsChanged, notifyThoughtsChanged } from '../lib/thoughtsEvents';

export type { Project };

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await projectsApi.list();
      setProjects(data);
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects().catch((err) => console.error('Failed to load projects:', err));
  }, [fetchProjects]);

  useEffect(() => {
    return onThoughtsChanged(() => {
      fetchProjects().catch((err) => console.error('Failed to refresh projects:', err));
    });
  }, [fetchProjects]);

  const createProject = useCallback(async (name?: string) => {
    const project = await projectsApi.create({ name: name?.trim() || 'Untitled Project' });
    setProjects((prev) => [...prev, project]);
    notifyThoughtsChanged();
    return project;
  }, []);

  const renameProject = useCallback(async (id: string, name: string) => {
    const project = await projectsApi.update(id, { name });
    setProjects((prev) => prev.map((p) => (p.id === id ? project : p)));
    notifyThoughtsChanged();
    return project;
  }, []);

  const setProjectColor = useCallback(async (id: string, color: string) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, color } : p)));
    const project = await projectsApi.update(id, { color });
    setProjects((prev) => prev.map((p) => (p.id === id ? project : p)));
    notifyThoughtsChanged();
    return project;
  }, []);

  const removeProject = useCallback(async (id: string) => {
    await projectsApi.remove(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    notifyThoughtsChanged();
  }, []);

  return { projects, loading, createProject, renameProject, setProjectColor, removeProject, refresh: fetchProjects };
}
