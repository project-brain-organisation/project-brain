// Destination: apps/web/src/components/ThoughtCard.tsx  (overwrites existing, 333 → ~185 lines)
import { useRef, useState } from 'react';
import { type Thought } from '../hooks/useThoughts';
import { useLabelEditor } from '../hooks/useLabelEditor';
import { useInlineEdit } from '../hooks/useInlineEdit';
import { LabelRow } from './LabelRow';
import { ParentPicker } from './ParentPicker';
import { ReparentIcon } from './icons';
import { selfAndDescendants } from '../lib/descendants';
import './ThoughtCard.css';

interface Props {
  thought: Thought;
  onUpdate?: (id: string, data: { title?: string; body?: string }) => void;
  onDelete?: (id: string) => void;
  onNavigate?: (id: string) => void;
  autoFocusBody?: boolean;
  /** Subscribed public graph: render content but no editing affordances. */
  readOnly?: boolean;
  /** Full project thoughts (not just the visible subset) — the drag cycle
   *  guard must see the whole hierarchy. Passed down rather than subscribed
   *  per-card: a hook here multiplies its cost by the number of cards. */
  allThoughts?: Thought[];
  onReparent?: (childId: string, parentId: string | null) => void;
}

/* Any inline editor currently focused, card or header. While one of these is
 * active, the click that blur-commits it must not also start a new edit:
 * first click deselects, second click edits. */
const EDITING_INPUTS =
  '.thought-card-tag--editing, .thought-card-text--editing, .thoughts-list-title-input, .thoughts-list-body-input';

/* One drag at a time per window: the dragged thought and its cycle-blocked
 * set (itself + descendants). dragover can't read dataTransfer payloads, so
 * eligibility lives here instead. */
const dragState: { id: string | null; blocked: Set<string> } = { id: null, blocked: new Set() };

function formatTime(iso: string): string {
  // The root pseudo-node has no timestamp; render nothing, not "Invalid Date".
  if (!iso) return '';
  const d = new Date(iso);
  const day   = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-GB', { month: 'short' });
  const time  = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${month} ${time}`;
}

export function ThoughtCard({ thought, onUpdate, onDelete, onNavigate, autoFocusBody, readOnly, allThoughts, onReparent }: Props) {
  const { thoughtLabels, edgeRelationships, openPicker, openEdgePicker, pickerElement } =
    useLabelEditor(thought.id, thought.projectId);

  const title = useInlineEdit<HTMLInputElement>(
    thought.title, (v) => onUpdate?.(thought.id, { title: v }),
  );
  const body = useInlineEdit<HTMLTextAreaElement>(
    thought.body, (v) => onUpdate?.(thought.id, { body: v }),
    { multiline: true, autoFocus: !!autoFocusBody },
  );

  const [dropHover, setDropHover] = useState(false);
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const swallowClick = useRef(false);

  // Runs before the browser blurs the active editor, so activeElement still
  // tells us whether this click is the one dismissing an edit elsewhere.
  function guardPointerDown() {
    const ae = document.activeElement;
    swallowClick.current =
      !!ae && ae.matches(EDITING_INPUTS) && !rootRef.current?.contains(ae);
  }
  function shouldSwallowClick() {
    const s = swallowClick.current;
    swallowClick.current = false;
    return s;
  }

  const hasActions = !!onNavigate || !!(onDelete && !readOnly) || (!readOnly && !thought.isRoot);
  const editing = (title.editing || body.editing) && !readOnly;

  // Drag a card onto another card (or the root card) to reparent it there.
  // Touch devices never fire HTML5 drag events — the parent picker stays
  // the mobile path.
  const dragValidTarget = () =>
    !readOnly && !!onReparent && dragState.id !== null && !dragState.blocked.has(thought.id);

  return (
    <div
      className={`thought-card${dropHover ? ' thought-card--drop' : ''}`}
      ref={rootRef}
      draggable={!readOnly && !thought.isRoot && !editing && !!onReparent}
      onDragStart={(e) => {
        dragState.id = thought.id;
        dragState.blocked = selfAndDescendants(allThoughts ?? [], thought.id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', thought.id);
      }}
      onDragEnd={() => { dragState.id = null; }}
      onDragOver={(e) => {
        if (!dragValidTarget()) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropHover(true);
      }}
      onDragLeave={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) setDropHover(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDropHover(false);
        if (dragValidTarget()) onReparent!(dragState.id!, thought.isRoot ? null : thought.id);
        dragState.id = null;
      }}
    >
      {(thought.title || editing || hasActions) && (
      <div className="thought-card-top">
        {title.editing ? (
          <input className="thought-card-tag thought-card-tag--editing" {...title.inputProps} />
        ) : thought.title ? (
          <span
            className="thought-card-tag"
            onPointerDown={guardPointerDown}
            onClick={() => !shouldSwallowClick() && !readOnly && title.start()}
          >
            {thought.title}
          </span>
        ) : readOnly ? null : body.editing ? (
          <span
            className="thought-card-tag thought-card-tag--placeholder"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => title.start()}
          >
            Add title
          </span>
        ) : null}
        {hasActions && (
          <div className="thought-card-actions">
            {/* The root pseudo-node has no parent to set. */}
            {!readOnly && !thought.isRoot && (
              <button
                className="thought-card-action thought-card-action--parent"
                onClick={() => setParentPickerOpen(true)}
                title="Set parent thought"
              >
                <ReparentIcon />
              </button>
            )}
            {onNavigate && (
              <button className="thought-card-action thought-card-action--nav" onClick={() => onNavigate(thought.id)} title="View as node">
                →
              </button>
            )}
            {onDelete && !readOnly && !thought.isRoot && (
              <button className="thought-card-action thought-card-action--delete" onClick={() => onDelete(thought.id)} title="Remove">
                ×
              </button>
            )}
          </div>
        )}
      </div>
      )}

      {body.editing ? (
        <textarea className="thought-card-text thought-card-text--editing" rows={1} {...body.inputProps} />
      ) : (
        // The root pseudo-node has no persistable body in the v2 model.
        !thought.isRoot && (
        <div
          className="thought-card-text"
          onPointerDown={guardPointerDown}
          onClick={() => !shouldSwallowClick() && !readOnly && body.start()}
        >
          {thought.body || (readOnly ? null : <span className="thought-card-placeholder">Click to add text...</span>)}
        </div>
        )
      )}

      {!thought.isRoot && (
      <div className="thought-card-labels">
        <div className="thought-card-label-wrap">
          <LabelRow
            thoughtLabels={thoughtLabels}
            edgeRelationships={edgeRelationships}
            readOnly={readOnly}
            onNavigate={onNavigate}
            onEditLabel={openPicker}
            onEditEdge={openEdgePicker}
            onAdd={() => openPicker()}
          />
        </div>
        {formatTime(thought.updatedAt) && (
          <span className="thought-card-time">{formatTime(thought.updatedAt)}</span>
        )}
      </div>
      )}
      {parentPickerOpen && (
        <ParentPicker thought={thought} onClose={() => setParentPickerOpen(false)} />
      )}
      {pickerElement}
    </div>
  );
}
