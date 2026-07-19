import { Popover } from '@base-ui/react/popover';
import type { useLabelFilter } from '../hooks/useLabelFilter';
import { SearchIcon, ChevronDownIcon } from './icons';

/** The search input + active-filter chips + label-filter dropdown. Driven
 *  entirely by a `useLabelFilter` instance, passed in whole. */
export function SearchBar({ filter }: { filter: ReturnType<typeof useLabelFilter> }) {
  const {
    search, setSearch, labels, labelFilter, toggleLabel,
    menuOpen, setMenuOpen, clear, filtersActive,
  } = filter;

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
      <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Popover.Trigger
          className={`thoughts-list-filter-toggle${menuOpen ? ' thoughts-list-filter-toggle--open' : ''}`}
          title="Filter by label"
        >
          <ChevronDownIcon />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className="thoughts-list-filter-positioner" align="end" sideOffset={6}>
            <Popover.Popup className="thoughts-list-filter-menu">
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
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
