import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Thought } from '../hooks/useThoughts';
import { useThoughtLabels } from '../hooks/useLabels';
import { LabelPicker } from './LabelPicker';
import { ParentPicker } from './ParentPicker';
import './ThoughtCard.css';

interface Props {
  thought: Thought;
  onUpdate?: (id: string, data: { title?: string; body?: string }) => void;
  onDelete?: (id: string) => void;
  onNavigate?: (id: string) => void;
  autoFocusBody?: boolean;
  /** Subscribed public graph: render content but no editing affordances. */
  readOnly?: boolean;
}

function formatTime(iso: string): string {
  // The root pseudo-node has no timestamp; render nothing, not "Invalid Date".
  if (!iso) return '';
  const d = new Date(iso);
  const day   = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-GB', { month: 'short' });
  const time  = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${month} ${time}`;
}

export function ThoughtCard({ thought, onUpdate, onDelete, onNavigate, autoFocusBody, readOnly }: Props) {
  const { thoughtLabels, edgeRelationships, assignLabel, unassignLabel, refresh } = useThoughtLabels(thought.id, thought.projectId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [editingBody, setEditingBody] = useState(!!autoFocusBody);
  const [titleDraft, setTitleDraft] = useState(thought.title);
  const [bodyDraft, setBodyDraft] = useState(thought.body);

  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocusBody && bodyRef.current) {
      const el = bodyRef.current;
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, [autoFocusBody]);

  useEffect(() => {
    if (editingTitle && titleRef.current) {
      const el = titleRef.current;
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;
    }
  }, [editingTitle]);

  useEffect(() => {
    if (editingBody && bodyRef.current) {
      const el = bodyRef.current;
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
      if (!autoFocusBody) {
        el.focus();
        el.selectionStart = el.selectionEnd = el.value.length;
      }
    }
  }, [editingBody, autoFocusBody]);

  function commitTitle() {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed !== thought.title && onUpdate) {
      onUpdate(thought.id, { title: trimmed });
    }
  }

  function commitBody() {
    setEditingBody(false);
    if (bodyDraft !== thought.body && onUpdate) {
      onUpdate(thought.id, { body: bodyDraft });
    }
  }

  function openPicker(labelId?: string) {
    setEditingLabelId(labelId ?? null);
    setEditingEdgeId(null);
    setPickerOpen(true);
  }

  function openEdgePicker(edgeRelId: string) {
    setEditingLabelId(null);
    setEditingEdgeId(edgeRelId);
    setPickerOpen(true);
  }

  const hasActions = !!onNavigate || !!(onDelete && !readOnly) || (!readOnly && !thought.isRoot);
  const editing = (editingTitle || editingBody) && !readOnly;

  return (
    <div className={`thought-card${hasActions ? ' thought-card--has-actions' : ''}${editing ? ' thought-card--editing' : ''}`}>
      {hasActions && (
      <div className="thought-card-actions">
        {/* The root pseudo-node has no parent to set. */}
        {!readOnly && !thought.isRoot && (
          <button
            className="thought-card-action thought-card-action--parent"
            onClick={() => setParentPickerOpen(true)}
            title="Set parent thought"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V9" />
              <path d="m7 13 5-5 5 5" />
              <path d="M5 5h14" />
            </svg>
          </button>
        )}
        {onNavigate && (
          <button
            className="thought-card-action thought-card-action--nav"
            onClick={() => onNavigate(thought.id)}
            title="View as node"
          >
            →
          </button>
        )}
        {onDelete && !readOnly && !thought.isRoot && (
          <button
            className="thought-card-action thought-card-action--delete"
            onClick={() => onDelete(thought.id)}
            title="Remove"
          >
            ×
          </button>
        )}
      </div>
      )}
      <div className="thought-card-top">
        {editingTitle ? (
          <input
            ref={titleRef}
            className="thought-card-tag thought-card-tag--editing"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle();
              if (e.key === 'Escape') { setTitleDraft(thought.title); setEditingTitle(false); }
            }}
          />
        ) : (
          thought.title ? (
            <span className="thought-card-tag" onClick={() => !readOnly && setEditingTitle(true)}>
              {thought.title}
            </span>
          ) : readOnly ? null : editingBody ? (
            <span
              className="thought-card-tag thought-card-tag--placeholder"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setEditingTitle(true)}
            >
              Add title
            </span>
          ) : null
        )}
        {formatTime(thought.updatedAt) && (
          <span className="thought-card-time">{formatTime(thought.updatedAt)}</span>
        )}
      </div>

      {editingBody ? (
        <textarea
          ref={bodyRef}
          className="thought-card-text thought-card-text--editing"
          value={bodyDraft}
          onChange={(e) => {
            setBodyDraft(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
          }}
          onBlur={commitBody}
          rows={1}
        />
      ) : (
        // The root pseudo-node has no persistable body in the v2 model.
        !thought.isRoot && (
        <div
          className="thought-card-text"
          onClick={() => !readOnly && setEditingBody(true)}
        >
          {thought.body || (readOnly ? null : <span className="thought-card-placeholder">Click to add text...</span>)}
        </div>
        )
      )}

      {!thought.isRoot && (
      <div className="thought-card-labels">
        {thoughtLabels.map((tl) => (
          <button
            key={tl.id}
            className="thought-card-label"
            style={{ borderColor: tl.color, color: tl.color }}
            onClick={() => !readOnly && openPicker(tl.id)}
          >
            <span className="thought-card-label-dot" style={{ background: tl.color }} />
            {tl.name}
          </button>
        ))}
        {edgeRelationships.map((er) => (
          <span key={er.id} className="thought-card-edge">
            <button
              className="thought-card-label thought-card-label--edge"
              style={er.label ? { borderColor: er.label.color, color: er.label.color } : undefined}
              onClick={() => !readOnly && openEdgePicker(er.id)}
            >
              {er.label && <span className="thought-card-label-dot" style={{ background: er.label.color }} />}
              {er.label?.name ?? 'edge'}
            </button>
            <button
              className="thought-card-edge-target"
              onClick={() => onNavigate?.(er.targetId)}
              disabled={!onNavigate}
              title={`Go to ${er.targetName}`}
            >
              → {er.targetName}
            </button>
          </span>
        ))}
        {!readOnly && <button className="thought-card-label-add" onClick={() => openPicker()}>+</button>}
      </div>
      )}
      {editing && (
        <button
          className="thought-card-commit"
          title="Done"
          aria-label="Finish editing"
          // preventDefault keeps the field focused through mousedown so blur
          // doesn't commit-and-unmount this button before the click lands.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (editingTitle) commitTitle();
            if (editingBody) commitBody();
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>
      )}
      {parentPickerOpen && (
        <ParentPicker thought={thought} onClose={() => setParentPickerOpen(false)} />
      )}
      {pickerOpen && createPortal(
        <LabelPicker
          thoughtLabels={thoughtLabels}
          sourceThoughtId={thought.id}
          onAssign={assignLabel}
          onUnassign={unassignLabel}
          editingLabelId={editingLabelId}
          editingEdgeRelId={editingEdgeId}
          onClose={() => setPickerOpen(false)}
          onRefresh={refresh}
        />,
        document.body,
      )}
    </div>
  );
}
