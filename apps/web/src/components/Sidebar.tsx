import { useState } from 'react';
import type { Project } from '../lib/pbApi';
import './Sidebar.css';

interface Props {
  /** Mobile drawer mode: true/false slides it in/out; undefined = static desktop sidebar. */
  drawerOpen?: boolean;
  username: string;
  onLogout: () => void;
  projects: Project[];
  selectedProjectId?: string;
  onSelectProject?: (id: string) => void;
  onCreateProject: () => Promise<Project>;
  onDeleteProject: (id: string) => void;
  onSetProjectPublic: (id: string, isPublic: boolean) => void;
  onUnsubscribeProject: (id: string) => void;
  onDiscoverOpen: () => void;
  onMcpOpen: () => void;
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

export function Sidebar({
  drawerOpen,
  username,
  onLogout,
  projects,
  selectedProjectId,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onSetProjectPublic,
  onUnsubscribeProject,
  onDiscoverOpen,
  onMcpOpen,
}: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [confirmPublicId, setConfirmPublicId] = useState<string | null>(null);

  const owned = projects.filter((p) => p.role === 'owner');
  const subscribed = projects.filter((p) => p.role === 'subscriber');

  const confirmTarget = confirmDeleteId ? projects.find((p) => p.id === confirmDeleteId) : null;
  const nameMatches = confirmTarget && confirmName.trim().toLowerCase() === confirmTarget.name.trim().toLowerCase();

  const handleCreate = async () => {
    const project = await onCreateProject();
    onSelectProject?.(project.id);
  };

  const handleConfirmDelete = () => {
    if (!confirmDeleteId || !nameMatches) return;
    onDeleteProject(confirmDeleteId);
    setConfirmDeleteId(null);
    setConfirmName('');
  };

  const handleToggleVisibility = (project: Project) => {
    if (project.isPublic) {
      onSetProjectPublic(project.id, false);
    } else {
      // Going public is a broadcast — confirm before exposing it to everyone.
      setConfirmPublicId(project.id);
    }
  };

  return (
    <aside className={`sidebar${drawerOpen ? ' sidebar--open' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo" />
      </div>

      <div className="sidebar-top">
        <div className="sidebar-projects">
          <div className="sidebar-section-label">
            PROJECTS
            <div className="sidebar-section-actions">
              <button className="sidebar-icon-btn" onClick={onDiscoverOpen} title="Discover public graphs">
                <GlobeIcon />
              </button>
              <button className="sidebar-add-btn" onClick={handleCreate} title="New project">+</button>
            </div>
          </div>
          {owned.map((project) => (
            <div key={project.id} className="sidebar-project-row">
              <button
                className={`sidebar-project-btn ${project.id === selectedProjectId ? 'active' : ''}`}
                onClick={() => onSelectProject?.(project.id)}
              >
                {project.emoji ? `${project.emoji} ` : ''}{project.name || '(untitled)'}
              </button>
              <button
                className={`sidebar-project-visibility${project.isPublic ? ' sidebar-project-visibility--public' : ''}`}
                onClick={() => handleToggleVisibility(project)}
                title={project.isPublic ? 'Public — click to make private' : 'Private — click to make public'}
              >
                {project.isPublic ? <GlobeIcon /> : <LockIcon />}
              </button>
              <button
                className="sidebar-project-delete"
                onClick={() => { setConfirmDeleteId(project.id); setConfirmName(''); }}
                title="Delete project"
              >
                &times;
              </button>
            </div>
          ))}
          {owned.length === 0 && <div className="sidebar-empty">No projects yet</div>}
        </div>

        {subscribed.length > 0 && (
          <div className="sidebar-projects">
            <div className="sidebar-section-label">PUBLIC</div>
            {subscribed.map((project) => (
              <div key={project.id} className="sidebar-project-row">
                <button
                  className={`sidebar-project-btn ${project.id === selectedProjectId ? 'active' : ''}`}
                  onClick={() => onSelectProject?.(project.id)}
                >
                  {project.emoji ? `${project.emoji} ` : ''}{project.name || '(untitled)'}
                </button>
                <button
                  className="sidebar-project-delete"
                  onClick={() => onUnsubscribeProject(project.id)}
                  title="Remove from my graphs"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmPublicId && (
        <div className="sidebar-delete-confirm">
          <p className="sidebar-delete-confirm-text">
            Everyone on Project Brain will be able to view this graph.
          </p>
          <div className="sidebar-delete-confirm-actions">
            <button
              className="sidebar-delete-confirm-cancel"
              onClick={() => setConfirmPublicId(null)}
            >
              Cancel
            </button>
            <button
              className="sidebar-delete-confirm-btn"
              onClick={() => { onSetProjectPublic(confirmPublicId, true); setConfirmPublicId(null); }}
            >
              Make public
            </button>
          </div>
        </div>
      )}

      {confirmDeleteId && confirmTarget && (
        <div className="sidebar-delete-confirm">
          <p className="sidebar-delete-confirm-text">
            Type <strong>{confirmTarget.name || '(untitled)'}</strong> to delete
          </p>
          <input
            className="sidebar-delete-confirm-input"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirmDelete()}
            placeholder="Project name"
            autoFocus
          />
          <div className="sidebar-delete-confirm-actions">
            <button
              className="sidebar-delete-confirm-cancel"
              onClick={() => { setConfirmDeleteId(null); setConfirmName(''); }}
            >
              Cancel
            </button>
            <button
              className="sidebar-delete-confirm-btn"
              disabled={!nameMatches}
              onClick={handleConfirmDelete}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="pb-sidebar-footer">
        <button
          type="button"
          className="pb-mcp-btn"
          onClick={onMcpOpen}
        >
          MCP
        </button>
        <div className="pb-account-row">
          <div className="pb-account-identity">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
            </svg>
            <span className="pb-account-name">{username}</span>
          </div>
          <button
            type="button"
            className="pb-logout-btn"
            onClick={onLogout}
          >
            Log out
          </button>
        </div>
      </div>
    </aside>
  );
}
