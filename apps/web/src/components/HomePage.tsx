import { useState, useCallback, useEffect } from 'react';
import { useProjects } from '../hooks/useProjects';
import { useIsMobile } from '../hooks/useIsMobile';
import { useSelectedRoot } from '../contexts/SelectedRootContext';
import { ConfirmProvider } from '../contexts/ConfirmProvider';
import { ThoughtNavigationProvider, useThoughtNavigation } from '../contexts/ThoughtNavigationProvider';
import { DesktopHome } from './DesktopHome';
import { MobileHome } from './MobileHome';
import './HomePage.css';

/**
 * Project selection + the create-project empty state. Once a project is
 * selected it mounts the providers (confirm dialog + navigation stack) and
 * hands off to HomeSurface — so navigation, mutations and the thought list
 * are all driven by the domain layer, not prop-drilled from here.
 */
export function HomePage() {
  const { selectedRootId, setSelectedRootId } = useSelectedRoot();
  const { projects, loading: projectsLoading, createProject } = useProjects();
  const [creating, setCreating] = useState(false);
  const [projectName, setProjectName] = useState('');

  // Keep the restored selection if it still exists; otherwise fall back to the
  // first project (and self-heal if the selected project is later deleted).
  useEffect(() => {
    if (projectsLoading || projects.length === 0) return;
    if (!projects.some((p) => p.id === selectedRootId)) {
      setSelectedRootId(projects[0].id);
    }
  }, [projectsLoading, projects, selectedRootId, setSelectedRootId]);

  const handleCreateProject = useCallback(async () => {
    const trimmed = projectName.trim();
    if (!trimmed) return;
    const project = await createProject(trimmed);
    setProjectName('');
    setCreating(false);
    setSelectedRootId(project.id);
  }, [projectName, createProject, setSelectedRootId]);

  if (projectsLoading) {
    return <div className="home-page-loading">Loading...</div>;
  }

  if (!selectedRootId) {
    return (
      <div className="home-page-empty">
        {creating ? (
          <div className="home-page-create-form">
            <input
              className="home-page-create-input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateProject();
                if (e.key === 'Escape') {
                  setCreating(false);
                  setProjectName('');
                }
              }}
              placeholder="Project name"
              autoFocus
            />
          </div>
        ) : (
          <button className="home-page-create" onClick={() => setCreating(true)}>
            <span className="home-page-create-icon">+</span>
            <span>Create project</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <ConfirmProvider>
      <ThoughtNavigationProvider>
        <HomeSurface />
      </ThoughtNavigationProvider>
    </ConfirmProvider>
  );
}

/** The selected project's surface: a loading gate, then the platform layout. */
function HomeSurface() {
  const isMobile = useIsMobile();
  const { loading } = useThoughtNavigation();
  if (loading) return <div className="home-page-loading">Loading...</div>;
  return isMobile ? <MobileHome /> : <DesktopHome />;
}
