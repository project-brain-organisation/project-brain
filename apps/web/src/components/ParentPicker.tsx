import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useThoughts, type Thought } from '../hooks/useThoughts';
import { thoughtName } from '../lib/thoughtName';
import { selfAndDescendants } from '../lib/descendants';
import './ParentPicker.css';

interface Props {
  thought: Thought;
  onClose: () => void;
}

/** Modal picker that re-parents a thought. The thought itself and its
 *  descendants are excluded — parenting into your own subtree is a cycle. */
export function ParentPicker({ thought, onClose }: Props) {
  const { thoughts, setParent } = useThoughts(thought.projectId);
  const [search, setSearch] = useState('');

  const blocked = useMemo(
    () => selfAndDescendants(thoughts, thought.id),
    [thoughts, thought.id],
  );

  const query = search.trim().toLowerCase();
  const candidates = thoughts.filter(
    (t) => !blocked.has(t.id) && (!query || thoughtName(t).toLowerCase().includes(query)),
  );

  function pick(parentId: string | null) {
    setParent(thought.id, parentId);
    onClose();
  }

  return createPortal(
    <div className="pp-overlay" onClick={onClose}>
      <div
        className="pp-box"
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="pp-header">
          <div className="pp-title">Parent for “{thoughtName(thought)}”</div>
          <button className="pp-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <input
          className="pp-search"
          placeholder="Search thoughts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <div className="pp-list">
          <button
            className={`pp-item pp-item--top${thought.parentId === null ? ' pp-item--current' : ''}`}
            onClick={() => pick(null)}
          >
            Top level
          </button>
          {candidates.map((t) => (
            <button
              key={t.id}
              className={`pp-item${t.id === thought.parentId ? ' pp-item--current' : ''}`}
              onClick={() => pick(t.id)}
            >
              {thoughtName(t)}
            </button>
          ))}
          {candidates.length === 0 && <div className="pp-empty">No matching thoughts.</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
