import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { useAuth } from '../hooks/useAuth';
import { useProjects } from '../hooks/useProjects';
import { useWorkspaceEvents } from '../hooks/useWorkspaceEvents';
import { useSelectedRoot } from '../contexts/SelectedRootContext';
import { Login } from './Login';
import { McpDialog } from './McpDialog';
import { Toasts } from './Toasts';
import './Shell.css';

export function Shell() {
  const { user, loading: authLoading, logout } = useAuth();
  const { projects, createProject, removeProject } = useProjects();
  const { selectedRootId, setSelectedRootId } = useSelectedRoot();
  const [mcpOpen, setMcpOpen] = useState(false);

  useWorkspaceEvents();

  const handleCreateProject = async () => {
    return createProject();
  };

  const handleDeleteProject = async (id: string) => {
    await removeProject(id);
    if (selectedRootId === id) setSelectedRootId(undefined);
  };

  if (authLoading) {
    return (
      <div className="shell-loading">Loading...</div>
    );
  }

  if (!user) return <Login />;

  return (
    <div className="shell">
      <Sidebar
        username={user.username}
        onLogout={logout}
        projects={projects}
        selectedProjectId={selectedRootId}
        onSelectProject={setSelectedRootId}
        onCreateProject={handleCreateProject}
        onDeleteProject={handleDeleteProject}
        onMcpOpen={() => setMcpOpen(true)}
      />
      <main className="shell-main">
        <Outlet />
      </main>
      <McpDialog open={mcpOpen} onClose={() => setMcpOpen(false)} />
      <Toasts />
    </div>
  );
}
