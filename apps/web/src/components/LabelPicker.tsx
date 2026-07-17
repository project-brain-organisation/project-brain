import { useState, useRef, useEffect, useMemo } from 'react';
import { useLabels } from '../hooks/useLabels';
import { useThoughts } from '../hooks/useThoughts';
import { useSelectedRoot } from '../contexts/SelectedRootContext';
import { thoughtName } from '../lib/thoughtName';
import type { ThoughtLabel } from '../hooks/useLabels';
import './LabelPicker.css';

const PRESET_COLORS = [
  '#7b6bb5', // purple
  '#e8a838', // amber
  '#4caf50', // green
  '#e05555', // red
  '#5ba4cf', // blue
  '#e88bb5', // pink
  '#999999', // grey
];

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
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [swatchTarget, setSwatchTarget] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Nothing is written until Add: selecting labels just highlights them.
  // Replace-mode (opened from an existing chip) stays single-select — swapping
  // one chip for several labels is ambiguous.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  // Each edge label keeps its own chosen target, since every edge row shows a picker.
  const [targetByLabel, setTargetByLabel] = useState<Record<string, string>>({});
  const dialogRef = useRef<HTMLDivElement>(null);
  const swatchRef = useRef<HTMLDivElement>(null);

  const assignedIds = new Set(thoughtLabels.map((tl) => tl.id));

  // Target options for an edge relationship: every other thought, sorted by name.
  const targetOptions = useMemo(
    () => thoughts
      .filter((t) => t.id !== sourceThoughtId)
      .sort((a, b) => thoughtName(a).localeCompare(thoughtName(b))),
    [thoughts, sourceThoughtId],
  );

  // The selected labels Add will actually write: plain tags not already on the
  // thought (any tag while replacing), and edge labels with a target that isn't
  // already an edge (the DB has a unique (source, target, label) index).
  const actionable = labels.filter((l) => {
    if (!selectedIds.has(l.id)) return false;
    if (!l.isEdge) return editingLabelId ? true : !assignedIds.has(l.id);
    const target = targetByLabel[l.id];
    return Boolean(target) && !edgeRelationships.some(
      (r) => r.sourceId === sourceThoughtId && r.targetId === target && r.label?.id === l.id,
    );
  });
  const canAdd = actionable.length > 0;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    if (!swatchTarget) return;
    function handleSwatchOutside(e: MouseEvent) {
      if (swatchRef.current && !swatchRef.current.contains(e.target as Node)) {
        setSwatchTarget(null);
      }
    }
    document.addEventListener('mousedown', handleSwatchOutside);
    return () => document.removeEventListener('mousedown', handleSwatchOutside);
  }, [swatchTarget]);

  /** Add `labelId` to the selection — replacing it entirely in replace-mode. */
  function selectLabel(labelId: string) {
    setSelectedIds((prev) =>
      editingLabelId ? new Set([labelId]) : new Set(prev).add(labelId));
  }

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    // New labels are never edge labels, so this selects a plain tag ready to Add.
    const label = await createLabel(trimmed, newColor);
    selectLabel(label.id);
    setNewName('');
    setNewColor(PRESET_COLORS[0]);
  }

  function handleSelect(labelId: string) {
    setSelectedIds((prev) => {
      if (prev.has(labelId)) {
        const next = new Set(prev);
        next.delete(labelId);
        return next;
      }
      return editingLabelId ? new Set([labelId]) : new Set(prev).add(labelId);
    });
  }

  function handleAdd() {
    if (!canAdd) return;
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

  function handleRemove(e: React.MouseEvent, labelId: string) {
    e.stopPropagation();
    setConfirmDelete(labelId);
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    await removeLabel(confirmDelete);
    setConfirmDelete(null);
    onRefresh?.();
  }

  function handleNone() {
    if (editingLabelId) {
      onUnassign(editingLabelId);
    }
    onClose();
  }

  function handleRemoveEdge() {
    if (editingEdgeRelId) removeEdgeRelationship(editingEdgeRelId);
    onClose();
  }

  function handleDotClick(e: React.MouseEvent, targetId: string) {
    e.stopPropagation();
    setSwatchTarget(swatchTarget === targetId ? null : targetId);
  }

  async function handleSwatchPick(color: string) {
    if (!swatchTarget) return;
    if (swatchTarget === '__new__') {
      setNewColor(color);
    } else {
      await updateLabel(swatchTarget, { color });
    }
    setSwatchTarget(null);
  }

  function handleEdgeToggle(e: React.MouseEvent, labelId: string, currentIsEdge: boolean) {
    e.stopPropagation();
    updateLabel(labelId, { isEdge: !currentIsEdge });
    if (!currentIsEdge) {
      // Now an edge label — select it so Add targets it.
      selectLabel(labelId);
    } else {
      // No longer an edge label — drop any target it held.
      setTargetByLabel((prev) => {
        const { [labelId]: _, ...rest } = prev;
        return rest;
      });
    }
  }

  function handleTargetChange(labelId: string, value: string) {
    setTargetByLabel((prev) => ({ ...prev, [labelId]: value }));
    // Choosing a target expresses intent to add this edge — select its label.
    selectLabel(labelId);
  }

  function renderSwatchPopover() {
    const activeColor = swatchTarget === '__new__'
      ? newColor
      : labels.find((l) => l.id === swatchTarget)?.color;

    return (
      <div className="lp-swatch-popover" ref={swatchRef}>
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            className={`lp-swatch ${activeColor === c ? 'lp-swatch--active' : ''}`}
            style={{ background: c }}
            onClick={() => handleSwatchPick(c)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="lp-overlay">
      <div className="lp" ref={dialogRef}>

        {/* ── Header ──────────────────────────────────── */}
        <div className="lp-header">
          <div className="lp-header-text">
            <h2 className="lp-title">Labels</h2>
            <p className="lp-desc">
              Select one or more labels, then press Add to attach them. For an
              edge label, pick a target thought to link to. Click a colour dot
              to change its colour.
            </p>
          </div>
          <button className="lp-close" onClick={onClose}>&times;</button>
        </div>

        {/* ── Existing label cards ────────────────────── */}
        <div className="lp-list">
          {editingLabelId && (
            <button className="lp-card lp-card--none" onClick={handleNone}>
              <span
                className="lp-dot"
                style={{ background: 'var(--border2)', border: '1px dashed var(--muted)' }}
              />
              <span className="lp-card-name">None (remove label)</span>
            </button>
          )}

          {editingEdgeRelId && (
            <button className="lp-card lp-card--none" onClick={handleRemoveEdge}>
              <span
                className="lp-dot"
                style={{ background: 'var(--border2)', border: '1px dashed var(--muted)' }}
              />
              <span className="lp-card-name">Remove relationship</span>
            </button>
          )}

          {labels.map((label) => {
            const isAssigned = assignedIds.has(label.id);
            const isSelected = selectedIds.has(label.id);
            return (
              <div key={label.id} className="lp-card-wrap">
                <div
                  className={`lp-card ${isAssigned ? 'lp-card--active' : ''} ${isSelected ? 'lp-card--selected' : ''}`}
                  onClick={() => handleSelect(label.id)}
                >
                  <div className="lp-card-row">
                    <span
                      className="lp-dot lp-dot--clickable"
                      style={{ background: label.color }}
                      onClick={(e) => handleDotClick(e, label.id)}
                      title="Change colour"
                    />
                    <span className="lp-card-name">{label.name}</span>
                    {isAssigned && <span className="lp-card-check" title="Already on this thought">✓</span>}
                    <button
                      className={`lp-edge-toggle ${label.isEdge ? 'lp-edge-toggle--on' : ''}`}
                      onClick={(e) => handleEdgeToggle(e, label.id, label.isEdge)}
                      title={label.isEdge ? 'Edge label (click to disable)' : 'Not an edge label (click to enable)'}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="4" cy="4" r="2" fill="currentColor" />
                        <circle cx="12" cy="4" r="2" fill="currentColor" />
                        <circle cx="8" cy="12" r="2" fill="currentColor" />
                        <line x1="4" y1="4" x2="12" y2="4" stroke="currentColor" strokeWidth="1.2" />
                        <line x1="4" y1="4" x2="8" y2="12" stroke="currentColor" strokeWidth="1.2" />
                        <line x1="12" y1="4" x2="8" y2="12" stroke="currentColor" strokeWidth="1.2" />
                      </svg>
                    </button>
                    <span
                      className="lp-card-remove"
                      onClick={(e) => handleRemove(e, label.id)}
                      title="Delete label"
                    >
                      &times;
                    </span>
                  </div>
                  {label.isEdge && (
                    <select
                      className="lp-target-select"
                      value={targetByLabel[label.id] ?? ''}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleTargetChange(label.id, e.target.value)}
                    >
                      <option value="">Target…</option>
                      {targetOptions.map((t) => (
                        <option key={t.id} value={t.id}>{thoughtName(t)}</option>
                      ))}
                    </select>
                  )}
                </div>
                {swatchTarget === label.id && renderSwatchPopover()}
              </div>
            );
          })}
        </div>

        {/* ── New label card ──────────────────────────── */}
        <div className="lp-card-wrap">
          <div className="lp-new-card">
            <span
              className="lp-dot lp-dot--clickable"
              style={{ background: newColor }}
              onClick={(e) => handleDotClick(e, '__new__')}
              title="Pick a colour"
            />
            <input
              className="lp-new-input"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="New label name"
              maxLength={100}
            />
            <button className="lp-new-add" onClick={handleCreate}>Create</button>
          </div>
          {swatchTarget === '__new__' && renderSwatchPopover()}
        </div>

        {/* ── Primary action ──────────────────────────── */}
        <div className="lp-footer">
          <button className="lp-add-primary" onClick={handleAdd} disabled={!canAdd}>
            {actionable.length > 1 ? `Add ${actionable.length}` : 'Add'}
          </button>
        </div>

        {/* ── Delete confirmation ──────────────────────── */}
        {confirmDelete && (
          <div className="lp-confirm">
            <p className="lp-confirm-text">
              Delete this label? It will be removed from all thoughts.
            </p>
            <div className="lp-confirm-actions">
              <button className="lp-confirm-cancel" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="lp-confirm-delete" onClick={handleConfirmDelete}>Delete</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
