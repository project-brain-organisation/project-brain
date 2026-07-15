import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { TabBar } from './TabBar';
import { useAuth } from '../hooks/useAuth';
import { useProjects } from '../hooks/useProjects';
import { useWorkspaceEvents } from '../hooks/useWorkspaceEvents';
import { useIsMobile } from '../hooks/useIsMobile';
import { useHistoryFlag } from '../hooks/useHistoryFlag';
import { useSelectedRoot } from '../contexts/SelectedRootContext';
import { Login } from './Login';
import { McpDialog } from './McpDialog';
import { DiscoverDialog } from './DiscoverDialog';
import { Toasts } from './Toasts';
import './Shell.css';

export function Shell() {
  const { user, loading: authLoading, logout } = useAuth();
  const { projects, createProject, cloneProject, removeProject, setProjectPublic, unsubscribeProject } = useProjects();
  const { selectedRootId, setSelectedRootId } = useSelectedRoot();
  const [mcpOpen, setMcpOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const isMobile = useIsMobile();
  const [drawerOpen, openDrawer, closeDrawer] = useHistoryFlag('drawer');

  useWorkspaceEvents();

  const handleCreateProject = async () => {
    return createProject();
  };

  const handleDeleteProject = async (id: string) => {
    await removeProject(id);
    if (selectedRootId === id) setSelectedRootId(undefined);
  };

  const handleSelectProject = (id: string) => {
    setSelectedRootId(id);
    if (isMobile) closeDrawer();
  };

  const handleCloneProject = async () => {
    if (!selectedRootId) return;
    const project = await cloneProject(selectedRootId);
    setSelectedRootId(project.id);
  };

  const handleMcpOpen = () => {
    if (isMobile) closeDrawer();
    setMcpOpen(true);
  };

  const handleDiscoverOpen = () => {
    if (isMobile) closeDrawer();
    setDiscoverOpen(true);
  };

  if (authLoading) {
    return (
      <div className="shell-loading">Loading...</div>
    );
  }

  if (!user) return <Login />;

  const selectedProject = projects.find((p) => p.id === selectedRootId);

  return (
    <div className={`shell${isMobile ? ' shell--mobile' : ''}`}>
      {isMobile && (
        <TopBar
          projectName={selectedProject?.name}
          onMenu={() => openDrawer()}
          onClone={selectedProject ? handleCloneProject : undefined}
        />
      )}
      {isMobile && drawerOpen && (
        <div className="shell-scrim" onClick={() => closeDrawer()} />
      )}
      <Sidebar
        drawerOpen={isMobile ? !!drawerOpen : undefined}
        username={user.username}
        onLogout={logout}
        projects={projects}
        selectedProjectId={selectedRootId}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        onDeleteProject={handleDeleteProject}
        onSetProjectPublic={setProjectPublic}
        onUnsubscribeProject={unsubscribeProject}
        onDiscoverOpen={handleDiscoverOpen}
        onMcpOpen={handleMcpOpen}
      />
      <main className="shell-main">
        <Outlet />
      </main>
      {isMobile && <TabBar />}
      <McpDialog open={mcpOpen} onClose={() => setMcpOpen(false)} />
      <DiscoverDialog
        open={discoverOpen}
        onClose={() => setDiscoverOpen(false)}
        onOpenProject={handleSelectProject}
      />
      <Toasts />
    </div>
  );
}
