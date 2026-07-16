import { useRef, useState } from 'react';
import './TopBar.css';

interface Props {
  projectName?: string;
  onMenu: () => void;
  /** Clone the current graph into a project the user owns (any graph, incl. read-only). */
  onClone?: () => Promise<void>;
  /** Owned graphs only: makes the title tap-to-edit. This is the sole rename
   *  path on mobile — the ThoughtsList title is hidden at the project root. */
  onRename?: (name: string) => void;
}

/** Mobile top app bar: leading hamburger + centered project name + clone action.
 *  Branding lives in the drawer header (the Sidebar logo). */
export function TopBar({ projectName, onMenu, onClone, onRename }: Props) {
  const [cloning, setCloning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(projectName ?? '');
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== projectName) onRename?.(trimmed);
  }

  return (
    <header className="top-bar">
      <button className="top-bar-menu" onClick={onMenu} aria-label="Open menu">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>
      {editing ? (
        <input
          ref={inputRef}
          className="top-bar-title-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <h1
          className={`top-bar-title${onRename ? ' top-bar-title--editable' : ''}`}
          onClick={onRename ? startEdit : undefined}
        >
          {projectName || 'Project Brain'}
        </h1>
      )}
      {onClone ? (
        <button
          className="top-bar-clone"
          disabled={cloning}
          aria-label="Clone this graph"
          title="Clone this graph into a project you own"
          onClick={async () => {
            setCloning(true);
            try { await onClone(); } finally { setCloning(false); }
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
        </button>
      ) : (
        <span className="top-bar-spacer" aria-hidden="true" />
      )}
    </header>
  );
}
