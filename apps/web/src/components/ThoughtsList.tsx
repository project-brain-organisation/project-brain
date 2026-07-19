import { useState, useCallback, useRef, useEffect } from 'react';
import { useThoughtNavigation } from '../contexts/ThoughtNavigationProvider';
import { useThoughtActions } from '../hooks/useThoughtActions';
import { useLabelFilter } from '../hooks/useLabelFilter';
import { ThoughtCard } from './ThoughtCard';
import { NodeHeader } from './NodeHeader';
import { SearchBar } from './SearchBar';
import { Fab } from './Fab';
import { ChevronDownIcon, PlusIcon } from './icons';
import './ThoughtsList.css';

/** `createFab` is the only prop — a layout intent (mobile uses a FAB instead of
 *  the header "+"). Everything else comes from the domain layer. */
export function ThoughtsList({ createFab = false }: { createFab?: boolean }) {
  const { activeNode, visibleThoughts } = useThoughtNavigation();
  const { create } = useThoughtActions();
  const filter = useLabelFilter(activeNode?.projectId);

  const [newThoughtId, setNewThoughtId] = useState<string | null>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);

  const isProjectRoot = !!activeNode?.isRoot;
  // At the mobile root the TopBar shows the project name, so the header is dead
  // space — and the FAB (createFab) is the mobile tell.
  const hideHeader = createFab && isProjectRoot;

  useEffect(() => {
    const root = cardsRef.current;
    const target = endRef.current;
    if (!root || !target) return;
    const io = new IntersectionObserver(
      ([entry]) => setShowJump(!entry.isIntersecting),
      { root, rootMargin: '0px 0px 120px 0px' },
    );
    io.observe(target);
    return () => io.disconnect();
  }, []);

  // The list owns create-and-focus: it remembers the new id so the card mounts
  // in edit mode. Both the header "+" and the FAB call this.
  const handleCreate = useCallback(async () => {
    const result = await create();
    if (result && result.id) setNewThoughtId(result.id);
  }, [create]);

  const all = visibleThoughts;
  const visible = filter.filter(all);
  const emptyMessage = filter.labelFilter.size > 0
    ? 'No thoughts match the selected labels' + (filter.search.trim() ? ` and “${filter.search.trim()}”` : '') + '.'
    : `No thoughts match “${filter.search.trim()}”.`;

  return (
    <div className="thoughts-list">
      <div className="thoughts-list-scroll" ref={cardsRef}>
        {all.length > 0 && <SearchBar filter={filter} />}

        {!hideHeader && <NodeHeader onNew={handleCreate} />}

        <div className="thoughts-list-cards">
          {all.length === 0 ? (
            <div className="thoughts-list-empty">No thoughts yet. Create one to get started.</div>
          ) : visible.length === 0 ? (
            <div className="thoughts-list-empty">{emptyMessage}</div>
          ) : (
            visible.map((thought) => (
              <ThoughtCard key={thought.id} thought={thought} autoFocusBody={thought.id === newThoughtId} />
            ))
          )}
          <div className="thoughts-list-end" ref={endRef} />
        </div>
      </div>

      {showJump && (
        <button
          className={`thoughts-list-jump${createFab ? ' thoughts-list-jump--above-fab' : ''}`}
          onClick={() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}
          title="Scroll to latest"
          aria-label="Scroll to latest"
        >
          <ChevronDownIcon />
        </button>
      )}
      {createFab && (
        <Fab className="thoughts-list-fab" ariaLabel="New thought" onClick={handleCreate} icon={<PlusIcon />} />
      )}
    </div>
  );
}
