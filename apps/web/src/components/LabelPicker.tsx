import { useMemo, useState } from 'react';
import { useLabels } from '../hooks/useLabels';
import { useThoughts } from '../hooks/useThoughts';
import { useLabelSelection } from '../hooks/useLabelSelection';
import { useSelectedRoot } from '../contexts/SelectedRootContext';
import { useConfirm } from '../contexts/ConfirmProvider';
import { thoughtName } from '../lib/thoughtName';
import { PALETTE } from '../lib/palette';
import type { Label, ThoughtLabel } from '../hooks/useLabels';
import { Modal } from './Modal';
import { ColorDot } from './ColorDot';
import { LabelPickerCard } from './LabelPickerCard';
import './LabelPicker.css';

interface Props {
  thoughtLabels: ThoughtLabel[];
  /** The thought the picker was opened from — source of any edge relationship. */
  sourceThoughtId: string;
  onAssign: (labelId: string) => void;
  onUnassign: (labelId: string) => void;
  editingLabelId?: string | null;
  /** Set when the picker was opened from an edge-relationship chip — offers removal. */
  editingEdgeRelId?: string | null;
  onClose: () => void;
  onRefresh?: () => void;
}

export function LabelPicker({ thoughtLabels, sourceThoughtId, onAssign, onUnassign, editingLabelId, editingEdgeRelId, onClose, onRefresh }: Props) {
  const { selectedRootId } = useSelectedRoot();
  const { labels, createLabel, updateLabel, removeLabel } = useLabels(selectedRootId);
  const { thoughts, edgeRelationships, createEdgeRelationship, removeEdgeRelationship } = useThoughts(selectedRootId);
  const confirm = useConfirm();

  const assignedIds = useMemo(() => new Set(thoughtLabels.map((tl) => tl.id)), [thoughtLabels]);
  const { selectedIds, targetByLabel, selectLabel, toggleLabel, setTarget, clearTarget, actionable } =
    useLabelSelection({ labels, assignedIds, edgeRelationships, sourceThoughtId, replaceMode: Boolean(editingLabelId) });

  // Target options for an edge relationship: every other thought, sorted by name.
  const targetOptions = useMemo(
    () => thoughts
      .filter((t) => t.id !== sourceThoughtId)
      .sort((a, b) => thoughtName(a).localeCompare(thoughtName(b))),
    [thoughts, sourceThoughtId],
  );

  async function handleCreate(name: string, color: string) {
    // New labels are never edge labels, so this selects a plain tag ready to Add.
    const label = await createLabel(name, color);
    selectLabel(label.id);
  }

  function handleAdd() {
    if (actionable.length === 0) return;
    if (editingLabelId) onUnassign(editingLabelId);
    for (const label of actionable) {
      if (label.isEdge) {
        createEdgeRelationship(sourceThoughtId, targetByLabel[label.id], {
          id: label.id, name: label.name, color: label.color,
        });
      } else if (!assignedIds.has(label.id)) {
        onAssign(label.id);
      }
    }
    onClose();
  }

  async function handleDelete(labelId: string) {
    const ok = await confirm({
      message: 'Delete this label?',
      detail: 'It will be removed from all thoughts.',
    });
    if (!ok) return;
    removeLabel(labelId);
    onRefresh?.();
  }

  function handleEdgeToggle(label: Label) {
    updateLabel(label.id, { isEdge: !label.isEdge });
    // Now an edge label — select it so Add targets it; no longer one — drop its target.
    if (label.isEdge) clearTarget(label.id);
    else selectLabel(label.id);
  }

  function handleNone() {
    if (editingLabelId) onUnassign(editingLabelId);
    onClose();
  }

  function handleRemoveEdge() {
    if (editingEdgeRelId) removeEdgeRelationship(editingEdgeRelId);
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      className="lp"
      title="Labels"
      description="Select one or more labels, then press Add to attach them. For an
        edge label, pick a target thought to link to. Click a colour dot to change
        its colour."
    >
      {/* ── Existing label cards ────────────────────── */}
      <div className="lp-list">
        {editingLabelId && <ActionCard text="None (remove label)" onClick={handleNone} />}
        {editingEdgeRelId && <ActionCard text="Remove relationship" onClick={handleRemoveEdge} />}

        {labels.map((label) => (
          <LabelPickerCard
            key={label.id}
            label={label}
            isAssigned={assignedIds.has(label.id)}
            isSelected={selectedIds.has(label.id)}
            targetId={targetByLabel[label.id] ?? ''}
            targetOptions={targetOptions}
            onToggle={() => toggleLabel(label.id)}
            onColorPick={(color) => updateLabel(label.id, { color })}
            onEdgeToggle={() => handleEdgeToggle(label)}
            onTargetChange={(targetId) => setTarget(label.id, targetId)}
            onDelete={() => handleDelete(label.id)}
          />
        ))}
      </div>

      <NewLabelCard onCreate={handleCreate} />

      {/* ── Primary action ──────────────────────────── */}
      <div className="lp-footer">
        <button className="lp-add-primary" onClick={handleAdd} disabled={actionable.length === 0}>
          {actionable.length > 1 ? `Add ${actionable.length}` : 'Add'}
        </button>
      </div>
    </Modal>
  );
}

/** Dashed full-width card for the destructive shortcuts at the top of the list. */
function ActionCard({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button className="lp-card lp-card--none" onClick={onClick}>
      <span className="lp-dot lp-dot--none" />
      <span className="lp-card-name">{text}</span>
    </button>
  );
}

/** Bottom card: name + colour for a new label. Owns the keystroke state so
 *  typing doesn't re-render the label list. */
function NewLabelCard({ onCreate }: { onCreate: (name: string, color: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onCreate(trimmed, color);
    setName('');
    setColor(PALETTE[0]);
  }

  return (
    <div className="lp-new-card">
      <ColorDot className="lp-dot lp-dot--clickable" value={color} onPick={setColor} title="Pick a colour" />
      <input
        className="lp-new-input"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        placeholder="New label name"
        maxLength={100}
      />
      <button className="lp-new-add" onClick={handleCreate}>Create</button>
    </div>
  );
}
