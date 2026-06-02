import { useState, useRef, useEffect } from 'react';
import { useLabels } from '../hooks/useLabels';
import { useSelectedRoot } from '../contexts/SelectedRootContext';
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
  onAssign: (labelId: string) => void;
  onUnassign: (labelId: string) => void;
  editingLabelId?: string | null;
  onClose: () => void;
  onRefresh?: () => void;
}

export function LabelPicker({ thoughtLabels, onAssign, onUnassign, editingLabelId, onClose, onRefresh }: Props) {
  const { selectedRootId } = useSelectedRoot();
  const { labels, createLabel, updateLabel, removeLabel } = useLabels(selectedRootId);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [swatchTarget, setSwatchTarget] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const swatchRef = useRef<HTMLDivElement>(null);

  const assignedIds = new Set(thoughtLabels.map((tl) => tl.id));

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

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const label = await createLabel(trimmed, newColor);
    onAssign(label.id);
    setNewName('');
    setNewColor(PRESET_COLORS[0]);
    onClose();
  }

  function handleSelect(labelId: string) {
    if (editingLabelId) {
      onUnassign(editingLabelId);
    }
    if (!assignedIds.has(labelId)) {
      onAssign(labelId);
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
              Select a label to assign it to this thought, or create a
              new one below. Click a colour dot to change its colour.
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

          {labels.map((label) => {
            const isAssigned = assignedIds.has(label.id);
            return (
              <div key={label.id} className="lp-card-wrap">
                <button
                  className={`lp-card ${isAssigned ? 'lp-card--active' : ''}`}
                  onClick={() => handleSelect(label.id)}
                >
                  <span
                    className="lp-dot lp-dot--clickable"
                    style={{ background: label.color }}
                    onClick={(e) => handleDotClick(e, label.id)}
                    title="Change colour"
                  />
                  <span className="lp-card-name">{label.name}</span>
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
                </button>
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
            <button className="lp-new-add" onClick={handleCreate}>Add</button>
          </div>
          {swatchTarget === '__new__' && renderSwatchPopover()}
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
