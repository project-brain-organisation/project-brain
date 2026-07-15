import { useState } from 'react';
import './TopBar.css';

interface Props {
  projectName?: string;
  onMenu: () => void;
  /** Clone the current graph into a project the user owns (any graph, incl. read-only). */
  onClone?: () => Promise<void>;
}

/** Mobile top app bar: leading hamburger + centered project name + clone action.
 *  Branding lives in the drawer header (the Sidebar logo). */
export function TopBar({ projectName, onMenu, onClone }: Props) {
  const [cloning, setCloning] = useState(false);
  return (
    <header className="top-bar">
      <button className="top-bar-menu" onClick={onMenu} aria-label="Open menu">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>
      <h1 className="top-bar-title">{projectName || 'Project Brain'}</h1>
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
