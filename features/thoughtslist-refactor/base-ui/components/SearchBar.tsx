// Destination: apps/web/src/components/SearchBar.tsx  (replaces the extraction-refactor draft)
import { Menu } from '@base-ui-components/react/menu';
import { Search, ChevronDown } from 'lucide-react';
import type { useLabelFilter } from '../hooks/useLabelFilter';

/**
 * Search input + active-filter chips + label-filter dropdown. The dropdown is a
 * Base UI Menu of CheckboxItems with closeOnClick={false}, so it multi-selects
 * and stays open — replacing the hand-rolled open state, ref, and click-outside.
 */
export function SearchBar({ filter }: { filter: ReturnType<typeof useLabelFilter> }) {
  const { search, setSearch, labels, labelFilter, toggleLabel, clear, filtersActive } = filter;

  return (
    <div className="thoughts-list-search">
      <Search size={14} />
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
      <Menu.Root>
        {/* data-popup-open replaces the old --open modifier class (see README CSS notes) */}
        <Menu.Trigger className="thoughts-list-filter-toggle" title="Filter by label">
          <ChevronDown size={14} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={6} align="end">
            <Menu.Popup className="thoughts-list-filter-menu">
              {labels.length === 0 ? (
                <div className="thoughts-list-filter-empty">No labels in this project yet.</div>
              ) : (
                labels.map((l) => (
                  <Menu.CheckboxItem
                    key={l.id}
                    checked={labelFilter.has(l.id)}
                    onCheckedChange={() => toggleLabel(l.id)}
                    closeOnClick={false}
                    className="thoughts-list-filter-item"
                  >
                    <span className="thought-card-label-dot" style={{ background: l.color }} />
                    <span className="thoughts-list-filter-item-name">{l.name}</span>
                    <Menu.CheckboxItemIndicator className="thoughts-list-filter-item-check">
                      ✓
                    </Menu.CheckboxItemIndicator>
                  </Menu.CheckboxItem>
                ))
              )}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
