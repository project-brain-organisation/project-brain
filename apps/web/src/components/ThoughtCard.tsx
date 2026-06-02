import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Thought } from '../hooks/useThoughts';
import { useThoughtLabels } from '../hooks/useLabels';
import { LabelPicker } from './LabelPicker';
import './ThoughtCard.css';

interface Props {
  thought: Thought;
  onUpdate?: (id: string, data: { title?: string; body?: string }) => void;
  onDelete?: (id: string) => void;
  onNavigate?: (id: string) => void;
  autoFocusBody?: boolean;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const day   = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-GB', { month: 'short' });
  const time  = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${month} ${time}`;
}

export function ThoughtCard({ thought, onUpdate, onDelete, onNavigate, autoFocusBody }: Props) {
  const { thoughtLabels, assignLabel, unassignLabel, refresh } = useThoughtLabels(thought.id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);

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
    setPickerOpen(true);
  }

  return (
    <div className="thought-card">
      <div className="thought-card-actions">
        {onNavigate && (
          <button
            className="thought-card-action thought-card-action--nav"
            onClick={() => onNavigate(thought.id)}
            title="View as node"
          >
            →
          </button>
        )}
        {onDelete && (
          <button
            className="thought-card-action thought-card-action--delete"
            onClick={() => onDelete(thought.id)}
            title="Remove"
          >
            ×
          </button>
        )}
      </div>
      <div className="thought-card-top">
        <span className="thought-card-time">{formatTime(thought.createdAt)}</span>
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
            <span className="thought-card-tag" onClick={() => setEditingTitle(true)}>
              {thought.title}
            </span>
          ) : editingBody ? (
            <span
              className="thought-card-tag thought-card-tag--placeholder"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setEditingTitle(true)}
            >
              Add title
            </span>
          ) : null
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
        <div
          className="thought-card-text"
          onClick={() => setEditingBody(true)}
        >
          {thought.body || <span className="thought-card-placeholder">Click to add text...</span>}
        </div>
      )}

      <div className="thought-card-labels">
        {thoughtLabels.map((tl) => (
          <button
            key={tl.id}
            className="thought-card-label"
            style={{ borderColor: tl.color, color: tl.color }}
            onClick={() => openPicker(tl.id)}
          >
            <span className="thought-card-label-dot" style={{ background: tl.color }} />
            {tl.name}
          </button>
        ))}
        <button className="thought-card-label-add" onClick={() => openPicker()}>+</button>
      </div>
      {pickerOpen && createPortal(
        <LabelPicker
          thoughtLabels={thoughtLabels}
          onAssign={assignLabel}
          onUnassign={unassignLabel}
          editingLabelId={editingLabelId}
          onClose={() => setPickerOpen(false)}
          onRefresh={refresh}
        />,
        document.body,
      )}
    </div>
  );
}
