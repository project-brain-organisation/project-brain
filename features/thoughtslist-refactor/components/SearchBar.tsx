// Destination: apps/web/src/components/SearchBar.tsx
import { useRef } from 'react';
import type { useLabelFilter } from '../hooks/useLabelFilter';
import { useClickOutside } from '../hooks/useClickOutside';
import { SearchIcon, ChevronDownIcon } from './icons';

/** The search input + active-filter chips + label-filter dropdown. Driven
 *  entirely by a `useLabelFilter` instance, passed in whole. */
export function SearchBar({ filter }: { filter: ReturnType<typeof useLabelFilter> }) {
  const {
    search, setSearch, labels, labelFilter, toggleLabel,
    menuOpen, setMenuOpen, clear, filtersActive,
  } = filter;

  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, menuOpen, () => setMenuOpen(false));

  return (
    <div className="thoughts-list-search">
      <SearchIcon />
      {[...labelFilter].map((id) => {
        const label = labels.find((l) => l.id === id);
        return label && (
          <button
            key={id}
            className="thoughts-list-filter-chip"
            style={{ borderColor: label.color, color: label.color }}
            title="Remove this label filter"
            onClick={() => toggleLabel(id)}
          >
            <span className="thought-card-label-dot" style={{ background: label.color }} />
            {label.name}
          </button>
        );
      })}
      <input
        type="text"
        className="thoughts-list-search-input"
        placeholder="Search thoughts…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {filtersActive && (
        <button className="thoughts-list-search-clear" title="Clear search and filters" onClick={clear}>
          ×
        </button>
      )}
      <div className="thoughts-list-filter" ref={menuRef}>
        <button
          className={`thoughts-list-filter-toggle${menuOpen ? ' thoughts-list-filter-toggle--open' : ''}`}
          title="Filter by label"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <ChevronDownIcon />
        </button>
        {menuOpen && (
          <div className="thoughts-list-filter-menu">
            {labels.length === 0 ? (
              <div className="thoughts-list-filter-empty">No labels in this project yet.</div>
            ) : (
              labels.map((l) => (
                <button
                  key={l.id}
                  className={`thoughts-list-filter-item${labelFilter.has(l.id) ? ' thoughts-list-filter-item--on' : ''}`}
                  onClick={() => toggleLabel(l.id)}
                >
                  <span className="thought-card-label-dot" style={{ background: l.color }} />
                  <span className="thoughts-list-filter-item-name">{l.name}</span>
                  {labelFilter.has(l.id) && <span className="thoughts-list-filter-item-check">✓</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
