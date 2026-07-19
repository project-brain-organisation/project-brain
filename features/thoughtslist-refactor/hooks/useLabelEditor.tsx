// Destination: apps/web/src/hooks/useLabelEditor.tsx  (.tsx — returns an element)
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useThoughtLabels } from './useLabels';
import { LabelPicker } from '../components/LabelPicker';

/**
 * A thought's labels/edges + the LabelPicker it opens, as one unit. Bundles the
 * picker state machine and the portal that both ThoughtCard and the ThoughtsList
 * header used to carry identically. Render `pickerElement` once; wire chips to
 * `openPicker(labelId)` / `openEdgePicker(edgeRelId)`.
 *
 * Pass `thoughtId = undefined` (e.g. at the project root) to get empty lists and
 * a no-op picker.
 */
export function useLabelEditor(thoughtId?: string, projectId?: string) {
  const { thoughtLabels, edgeRelationships, assignLabel, unassignLabel, refresh } =
    useThoughtLabels(thoughtId, projectId);

  const [open, setOpen] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);

  function openPicker(labelId?: string) {
    setEditingLabelId(labelId ?? null);
    setEditingEdgeId(null);
    setOpen(true);
  }

  function openEdgePicker(edgeRelId: string) {
    setEditingLabelId(null);
    setEditingEdgeId(edgeRelId);
    setOpen(true);
  }

  const pickerElement = open && createPortal(
    <LabelPicker
      thoughtLabels={thoughtLabels}
      sourceThoughtId={thoughtId ?? ''}
      onAssign={assignLabel}
      onUnassign={unassignLabel}
      editingLabelId={editingLabelId}
      editingEdgeRelId={editingEdgeId}
      onClose={() => setOpen(false)}
      onRefresh={refresh}
    />,
    document.body,
  );

  return { thoughtLabels, edgeRelationships, openPicker, openEdgePicker, pickerElement };
}
