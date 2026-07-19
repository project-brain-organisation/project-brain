import { useCallback, useMemo, useState } from 'react';
import type { Thought } from './useThoughts';
import { useLabels } from './useLabels';
import { useWorkspaceQuery } from './query-utils';

/**
 * Text-search + label-filter state for a project's thought list, plus a `filter`
 * that applies both (text ANDs against label membership; multiple labels OR).
 * Owns the project-switch reset via the adjust-during-render pattern — an effect
 * would cascade an extra render.
 */
export function useLabelFilter(projectId?: string) {
  const [search, setSearch] = useState('');
  const [labelFilter, setLabelFilter] = useState<ReadonlySet<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);

  const { labels } = useLabels(projectId);
  const snapshot = useWorkspaceQuery(projectId).data;

  // Switching projects invalidates the selection.
  const [filterProjectId, setFilterProjectId] = useState(projectId);
  if (filterProjectId !== projectId) {
    setFilterProjectId(projectId);
    setLabelFilter(new Set());
    setMenuOpen(false);
  }

  // null = no label filter; otherwise ids of thoughts carrying ANY selected label.
  const labelledThoughtIds = useMemo(() => {
    if (!snapshot || labelFilter.size === 0) return null;
    const ids = new Set<string>();
    for (const rel of snapshot.relationships) {
      if (rel.kind === 'tag' && labelFilter.has(rel.targetId)) ids.add(rel.sourceId);
    }
    return ids;
  }, [snapshot, labelFilter]);

  const toggleLabel = useCallback((id: string) => {
    setLabelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSearch('');
    setLabelFilter(new Set());
  }, []);

  const query = search.trim().toLowerCase();
  const filter = useCallback(
    (thoughts: Thought[]) =>
      thoughts.filter(
        (t) =>
          (!query ||
            t.title.toLowerCase().includes(query) ||
            t.body.toLowerCase().includes(query)) &&
          (!labelledThoughtIds || labelledThoughtIds.has(t.id)),
      ),
    [query, labelledThoughtIds],
  );

  return {
    search, setSearch,
    labels, labelFilter, toggleLabel,
    menuOpen, setMenuOpen,
    filter, clear,
    filtersActive: !!query || labelFilter.size > 0,
  };
}
