import type { Label } from '../hooks/useLabels';
import type { Thought } from '../hooks/useThoughts';
import { thoughtName } from '../lib/thoughtName';
import { ColorDot } from './ColorDot';
import { EdgeIcon } from './icons';

interface Props {
  label: Label;
  isAssigned: boolean;
  isSelected: boolean;
  targetId: string;
  /** Candidate edge targets, pre-sorted; shown only under edge labels. */
  targetOptions: Thought[];
  onToggle: () => void;
  onColorPick: (color: string) => void;
  onEdgeToggle: () => void;
  onTargetChange: (targetId: string) => void;
  onDelete: () => void;
}

/** One row in the LabelPicker list: dot, name, assigned check, edge toggle,
 *  delete, and — for edge labels — the target-thought select. Clicking the
 *  card toggles selection; the inner controls stop propagation. */
export function LabelPickerCard({
  label, isAssigned, isSelected, targetId, targetOptions,
  onToggle, onColorPick, onEdgeToggle, onTargetChange, onDelete,
}: Props) {
  return (
    <div
      className={`lp-card ${isAssigned ? 'lp-card--active' : ''} ${isSelected ? 'lp-card--selected' : ''}`}
      onClick={onToggle}
    >
      <div className="lp-card-row">
        <ColorDot className="lp-dot lp-dot--clickable" value={label.color} onPick={onColorPick} />
        <span className="lp-card-name">{label.name}</span>
        {isAssigned && <span className="lp-card-check" title="Already on this thought">✓</span>}
        <button
          className={`lp-edge-toggle ${label.isEdge ? 'lp-edge-toggle--on' : ''}`}
          onClick={(e) => { e.stopPropagation(); onEdgeToggle(); }}
          title={label.isEdge ? 'Edge label (click to disable)' : 'Not an edge label (click to enable)'}
        >
          <EdgeIcon />
        </button>
        <button
          className="lp-card-remove"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete label"
        >
          &times;
        </button>
      </div>
      {label.isEdge && (
        <select
          className="lp-target-select"
          value={targetId}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onTargetChange(e.target.value)}
        >
          <option value="">Target…</option>
          {targetOptions.map((t) => (
            <option key={t.id} value={t.id}>{thoughtName(t)}</option>
          ))}
        </select>
      )}
    </div>
  );
}
