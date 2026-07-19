import { useMemo, useRef, useState } from 'react';
import { useThoughts, type Thought } from '../hooks/useThoughts';
import { thoughtName } from '../lib/thoughtName';
import { selfAndDescendants } from '../lib/descendants';
import { Modal } from './Modal';
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
  const searchRef = useRef<HTMLInputElement>(null);

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

  return (
    <Modal
      open
      onClose={onClose}
      className="pp-box"
      title={`Parent for “${thoughtName(thought)}”`}
      initialFocus={searchRef}
    >
      <input
        ref={searchRef}
        className="pp-search"
        placeholder="Search thoughts…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
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
    </Modal>
  );
}
