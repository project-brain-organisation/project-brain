import { useMemo, useRef, useState } from 'react';
import { useProjects, usePublicProjects } from '../hooks/useProjects';
import { Modal } from './Modal';
import './DiscoverDialog.css';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Select a graph after adding it (jump straight into the new subscription). */
  onOpenProject?: (id: string) => void;
}

/** Browse every public graph on the platform and add it to your sidebar.
 *  Adding subscribes (read-only) — the graph appears under "ADDED". */
export function DiscoverDialog({ open, onClose, onOpenProject }: Props) {
  const { projects } = useProjects();
  const { publicProjects, loading, subscribe } = usePublicProjects(open);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // A graph is "added" if it's already in the sidebar cache (as a subscription).
  const subscribedIds = useMemo(
    () => new Set(projects.filter((p) => p.role === 'subscriber').map((p) => p.id)),
    [projects],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return publicProjects;
    return publicProjects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.ownerName.toLowerCase().includes(q),
    );
  }, [publicProjects, query]);

  const handleAdd = async (id: string) => {
    await subscribe(id);
    onOpenProject?.(id);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="discover-dialog"
      title="Discover public graphs"
      description="Browse knowledge graphs shared by others and add them to your
        sidebar. Added graphs are read-only."
      initialFocus={searchRef}
    >
      <input
        ref={searchRef}
        className="discover-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or author"
      />

      <div className="discover-list">
        {loading ? (
          <div className="discover-empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="discover-empty">
            {publicProjects.length === 0 ? 'No public graphs yet' : 'No matches'}
          </div>
        ) : (
          filtered.map((p) => {
            const added = subscribedIds.has(p.id);
            return (
              <div key={p.id} className="discover-row">
                <div className="discover-row-info">
                  <span className="discover-row-name">
                    {p.emoji ? `${p.emoji} ` : ''}{p.name || '(untitled)'}
                  </span>
                  <span className="discover-row-owner">by {p.ownerName}</span>
                </div>
                <button
                  className={`discover-add-btn${added ? ' discover-add-btn--added' : ''}`}
                  disabled={added}
                  onClick={() => handleAdd(p.id)}
                >
                  {added ? 'Added ✓' : 'Add'}
                </button>
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}
