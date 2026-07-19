// Destination: apps/web/src/components/ThoughtsList.tsx  (now ~120 lines incl. props)
import { useState, useCallback, useRef, useEffect } from 'react';
import type { Thought } from '../hooks/useThoughts';
import { useLabelFilter } from '../hooks/useLabelFilter';
import { ThoughtCard } from './ThoughtCard';
import { NodeHeader } from './NodeHeader';
import { SearchBar } from './SearchBar';
import { Fab } from './Fab';
import { ChevronDownIcon, PlusIcon } from './icons';
import './ThoughtsList.css';

interface Props {
  thoughts: Thought[];
  activeNode?: Thought;
  nodeBorderColor: string;
  onNodeBorderColorChange: (color: string) => void;
  onCreateThought: (title: string, body: string) => Promise<Thought | void>;
  onUpdateThought: (id: string, title?: string, body?: string) => void;
  onDeleteThought: (id: string) => void;
  onNavigateToNode?: (id: string) => void;
  /** Drilled into a node: step up one level in the hierarchy. */
  onNavigateUp?: () => void;
  /** Drilled into a node: jump straight back to the project root. */
  onNavigateToRoot?: () => void;
  /** Mobile: replace the header "+" with a FAB (the screen's primary action). */
  createFab?: boolean;
  /** Subscribed public graph: render content but no editing affordances. */
  readOnly?: boolean;
  /** Root only: show a "clone this graph" button on the header. */
  onClone?: () => Promise<void>;
  /** Full project thoughts + reparent, threaded to cards for drag-to-reparent. */
  allThoughts?: Thought[];
  onReparent?: (childId: string, parentId: string | null) => void;
}

export function ThoughtsList({
  thoughts, activeNode, nodeBorderColor, onNodeBorderColorChange,
  onCreateThought, onUpdateThought, onDeleteThought,
  onNavigateToNode, onNavigateUp, onNavigateToRoot,
  createFab, readOnly, onClone, allThoughts, onReparent,
}: Props) {
  const [newThoughtId, setNewThoughtId] = useState<string | null>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);

  const isProjectRoot = !!activeNode?.isRoot;
  // At the mobile root the TopBar already shows the project name, so the whole
  // header row is dead space and goes entirely.
  const hideHeader = !!createFab && isProjectRoot;
  const filter = useLabelFilter(activeNode?.projectId);

  // WhatsApp-style jump-to-latest: a sentinel after the last card tells us
  // whether the newest thought is in view; the margin stops boundary flicker.
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

  const handleCreate = useCallback(async () => {
    const result = await onCreateThought('', '');
    if (result && result.id) setNewThoughtId(result.id);
  }, [onCreateThought]);

  const handleUpdate = useCallback((id: string, data: { title?: string; body?: string }) => {
    onUpdateThought(id, data.title, data.body);
    if (id === newThoughtId) setNewThoughtId(null);
  }, [onUpdateThought, newThoughtId]);

  const visibleThoughts = filter.filter(thoughts);
  const emptyMessage = filter.labelFilter.size > 0
    ? 'No thoughts match the selected labels' + (filter.search.trim() ? ` and “${filter.search.trim()}”` : '') + '.'
    : `No thoughts match “${filter.search.trim()}”.`;

  return (
    <div className="thoughts-list">
      {!hideHeader && (
        <NodeHeader
          activeNode={activeNode}
          isProjectRoot={isProjectRoot}
          readOnly={readOnly}
          createFab={createFab}
          nodeBorderColor={nodeBorderColor}
          onNodeBorderColorChange={onNodeBorderColorChange}
          onUpdateThought={onUpdateThought}
          onDeleteThought={onDeleteThought}
          onNavigateToNode={onNavigateToNode}
          onNavigateUp={onNavigateUp}
          onNavigateToRoot={onNavigateToRoot}
          onClone={onClone}
          onNew={handleCreate}
        />
      )}

      {thoughts.length > 0 && <SearchBar filter={filter} />}

      <div className="thoughts-list-cards" ref={cardsRef}>
        {thoughts.length === 0 ? (
          <div className="thoughts-list-empty">No thoughts yet. Create one to get started.</div>
        ) : visibleThoughts.length === 0 ? (
          <div className="thoughts-list-empty">{emptyMessage}</div>
        ) : (
          visibleThoughts.map((thought) => (
            <ThoughtCard
              key={thought.id}
              thought={thought}
              onUpdate={handleUpdate}
              onDelete={onDeleteThought}
              onNavigate={onNavigateToNode}
              autoFocusBody={thought.id === newThoughtId}
              readOnly={readOnly}
              allThoughts={allThoughts}
              onReparent={onReparent}
            />
          ))
        )}
        <div className="thoughts-list-end" ref={endRef} />
      </div>

      {showJump && (
        <button
          className={`thoughts-list-jump${createFab && !readOnly ? ' thoughts-list-jump--above-fab' : ''}`}
          onClick={() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}
          title="Scroll to latest"
          aria-label="Scroll to latest"
        >
          <ChevronDownIcon />
        </button>
      )}
      {createFab && !readOnly && (
        <Fab className="thoughts-list-fab" ariaLabel="New thought" onClick={handleCreate} icon={<PlusIcon />} />
      )}
    </div>
  );
}
