import { useState } from 'react';
import type { Thought } from '../hooks/useThoughts';
import './Sidebar.css';

interface Props {
  username: string;
  onLogout: () => void;
  roots: Thought[];
  selectedRootId?: string;
  onSelectRoot?: (id: string) => void;
  onCreateRoot: () => Promise<Thought>;
  onDeleteRoot: (id: string) => void;
  onMcpOpen: () => void;
}

export function Sidebar({
  username,
  onLogout,
  roots,
  selectedRootId,
  onSelectRoot,
  onCreateRoot,
  onDeleteRoot,
  onMcpOpen,
}: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState('');

  const confirmTarget = confirmDeleteId ? roots.find((r) => r.id === confirmDeleteId) : null;
  const nameMatches = confirmTarget && confirmName.trim().toLowerCase() === (confirmTarget.title || '').trim().toLowerCase();

  const handleCreate = async () => {
    const project = await onCreateRoot();
    onSelectRoot?.(project.id);
  };

  const handleConfirmDelete = () => {
    if (!confirmDeleteId || !nameMatches) return;
    onDeleteRoot(confirmDeleteId);
    setConfirmDeleteId(null);
    setConfirmName('');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-logo" />

        <div className="sidebar-projects">
          <div className="sidebar-section-label">
            PROJECTS
            <button className="sidebar-add-btn" onClick={handleCreate}>+</button>
          </div>
          {roots.map((root) => (
            <div key={root.id} className="sidebar-project-row">
              <button
                className={`sidebar-project-btn ${root.id === selectedRootId ? 'active' : ''}`}
                onClick={() => onSelectRoot?.(root.id)}
              >
                {root.title || root.body.slice(0, 30) || '(untitled)'}
              </button>
              <button
                className="sidebar-project-delete"
                onClick={() => { setConfirmDeleteId(root.id); setConfirmName(''); }}
                title="Delete project"
              >
                &times;
              </button>
            </div>
          ))}
          {roots.length === 0 && <div className="sidebar-empty">No projects yet</div>}
        </div>
      </div>

      {confirmDeleteId && confirmTarget && (
        <div className="sidebar-delete-confirm">
          <p className="sidebar-delete-confirm-text">
            Type <strong>{confirmTarget.title || '(untitled)'}</strong> to delete
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
