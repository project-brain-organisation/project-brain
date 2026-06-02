import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { useAuth } from '../hooks/useAuth';
import { useThoughts } from '../hooks/useThoughts';
import { useMcpToolEvents } from '../hooks/useMcpToolEvents';
import { useSelectedRoot } from '../contexts/SelectedRootContext';
import { Login } from './Login';
import { McpDialog } from './McpDialog';
import './Shell.css';

export function Shell() {
  const { user, loading: authLoading, logout } = useAuth();
  const { roots, createRoot, removeThought, fetchRoots } = useThoughts();
  const { selectedRootId, setSelectedRootId } = useSelectedRoot();
  const [mcpOpen, setMcpOpen] = useState(false);

  useMcpToolEvents();

  const handleCreateProject = async () => {
    const project = await createRoot('');
    await fetchRoots();
    return project;
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
        roots={roots}
        selectedRootId={selectedRootId}
        onSelectRoot={setSelectedRootId}
        onCreateRoot={handleCreateProject}
        onDeleteRoot={removeThought}
        onMcpOpen={() => setMcpOpen(true)}
      />
      <main className="shell-main">
        <Outlet />
      </main>
      <McpDialog open={mcpOpen} onClose={() => setMcpOpen(false)} />
    </div>
  );
}
