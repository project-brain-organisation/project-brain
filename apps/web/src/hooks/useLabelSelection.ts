import { useState } from 'react';
import type { Label } from './useLabels';
import type { EdgeRelationship } from './useThoughts';

interface Args {
  labels: Label[];
  /** Label ids already on the thought as plain tags. */
  assignedIds: ReadonlySet<string>;
  edgeRelationships: EdgeRelationship[];
  sourceThoughtId: string;
  /** Opened from an existing chip: single-select, and Add swaps the chip. */
  replaceMode: boolean;
}

/**
 * The LabelPicker's selection state machine. Nothing is written until Add:
 * selecting labels just highlights them. Replace-mode stays single-select —
 * swapping one chip for several labels is ambiguous. Each edge label keeps
 * its own chosen target, since every edge row shows a picker.
 */
export function useLabelSelection({ labels, assignedIds, edgeRelationships, sourceThoughtId, replaceMode }: Args) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [targetByLabel, setTargetByLabel] = useState<Record<string, string>>({});

  /** Add `labelId` to the selection — replacing it entirely in replace-mode. */
  const selectLabel = (labelId: string) =>
    setSelectedIds((prev) => (replaceMode ? new Set([labelId]) : new Set(prev).add(labelId)));

  const toggleLabel = (labelId: string) => {
    if (!selectedIds.has(labelId)) return selectLabel(labelId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(labelId);
      return next;
    });
  };

  /** Choosing a target expresses intent to add this edge — select its label. */
  const setTarget = (labelId: string, targetId: string) => {
    setTargetByLabel((prev) => ({ ...prev, [labelId]: targetId }));
    selectLabel(labelId);
  };

  const clearTarget = (labelId: string) =>
    setTargetByLabel((prev) => {
      const next = { ...prev };
      delete next[labelId];
      return next;
    });

  // The selected labels Add will actually write: plain tags not already on the
  // thought (any tag while replacing), and edge labels with a target that isn't
  // already an edge (the DB has a unique (source, target, label) index).
  const actionable = labels.filter((l) => {
    if (!selectedIds.has(l.id)) return false;
    if (!l.isEdge) return replaceMode || !assignedIds.has(l.id);
    const target = targetByLabel[l.id];
    return Boolean(target) && !edgeRelationships.some(
      (r) => r.sourceId === sourceThoughtId && r.targetId === target && r.label?.id === l.id,
    );
  });

  return { selectedIds, targetByLabel, selectLabel, toggleLabel, setTarget, clearTarget, actionable };
}
