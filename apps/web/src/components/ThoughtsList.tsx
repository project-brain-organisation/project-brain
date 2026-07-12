import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Thought } from '../hooks/useThoughts';
import { useThoughtLabels } from '../hooks/useLabels';
import { ThoughtCard } from './ThoughtCard';
import { LabelPicker } from './LabelPicker';
import './ThoughtsList.css';

const NODE_COLORS = [
  '#7b6bb5', '#e8a838', '#4caf50', '#e05555',
  '#5ba4cf', '#e88bb5', '#999999',
];

interface Props {
  thoughts: Thought[];
  activeNode?: Thought;
  nodeBorderColor: string;
  onNodeBorderColorChange: (color: string) => void;
  onCreateThought: (title: string, body: string) => Promise<Thought | void>;
  onUpdateThought: (id: string, title?: string, body?: string) => void;
  onDeleteThought: (id: string) => void;
  onNavigateToNode?: (id: string) => void;
}

export function ThoughtsList({
  thoughts,
  activeNode,
  nodeBorderColor,
  onNodeBorderColorChange,
  onCreateThought,
  onUpdateThought,
  onDeleteThought,
  onNavigateToNode,
}: Props) {
  const [newThoughtId, setNewThoughtId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [bodyDraft, setBodyDraft] = useState('');
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  // Labels only apply to real thoughts — the project root pseudo-node is not
  // a taggable entity in the v2 model.
  const isProjectRoot = !!activeNode?.isRoot;
  const { thoughtLabels, assignLabel, unassignLabel, refresh } = useThoughtLabels(
    isProjectRoot ? undefined : activeNode?.id,
    activeNode?.projectId,
  );

  useEffect(() => {
    if (!colorPickerOpen) return;
    function handleOutside(e: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setColorPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [colorPickerOpen]);

  function openPicker(labelId?: string) {
    setEditingLabelId(labelId ?? null);
    setPickerOpen(true);
  }

  function startEditTitle() {
    if (!activeNode) return;
    setTitleDraft(activeNode.title);
    setEditingTitle(true);
    setTimeout(() => titleInputRef.current?.focus(), 0);
  }

  function commitTitle() {
    setEditingTitle(false);
    if (!activeNode) return;
    const trimmed = titleDraft.trim();
    if (trimmed !== activeNode.title) {
      onUpdateThought(activeNode.id, trimmed, undefined);
    }
  }

  function startEditBody() {
    if (!activeNode) return;
    setBodyDraft(activeNode.body);
    setEditingBody(true);
    setTimeout(() => {
      if (bodyTextareaRef.current) {
        bodyTextareaRef.current.focus();
        bodyTextareaRef.current.style.height = 'auto';
        bodyTextareaRef.current.style.height = bodyTextareaRef.current.scrollHeight + 'px';
      }
    }, 0);
  }

  function commitBody() {
    setEditingBody(false);
    if (!activeNode) return;
    if (bodyDraft !== activeNode.body) {
      onUpdateThought(activeNode.id, undefined, bodyDraft);
    }
  }

  const handleCreate = useCallback(async () => {
    const result = await onCreateThought('', '');
    if (result && result.id) {
      setNewThoughtId(result.id);
    }
  }, [onCreateThought]);

  const handleUpdate = useCallback((id: string, data: { title?: string; body?: string }) => {
    onUpdateThought(id, data.title, data.body);
    if (id === newThoughtId) {
      setNewThoughtId(null);
    }
  }, [onUpdateThought, newThoughtId]);

  return (
    <div className="thoughts-list">
      <div className="thoughts-list-header">
        <div className="thoughts-list-header-text">
          <div className="thoughts-list-title-row">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                className="thoughts-list-title-input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitTitle();
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
              />
            ) : (
              <h2 onClick={startEditTitle} className="thoughts-list-title-editable">
                {activeNode?.title || 'Untitled'}
              </h2>
            )}
            <div className="node-color-picker" ref={colorPickerRef}>
              <button
                className="node-color-dot"
                style={{ background: nodeBorderColor }}
                onClick={() => setColorPickerOpen(!colorPickerOpen)}
                title="Node border color"
              />
              {colorPickerOpen && (
                <div className="node-color-swatches">
                  {NODE_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`node-color-swatch${c === nodeBorderColor ? ' node-color-swatch--active' : ''}`}
                      style={{ background: c }}
                      onClick={() => {
                        onNodeBorderColorChange(c);
                        setColorPickerOpen(false);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* The project root has no persistable body in the v2 model */}
          {!isProjectRoot && (editingBody ? (
            <textarea
              ref={bodyTextareaRef}
              className="thoughts-list-body-input"
              value={bodyDraft}
              onChange={(e) => {
                setBodyDraft(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              onBlur={commitBody}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingBody(false);
              }}
              rows={1}
            />
          ) : (
            <p
              className="thoughts-list-header-body thoughts-list-body-editable"
              onClick={startEditBody}
            >
              {activeNode?.body || 'Click to add a description...'}
            </p>
          ))}
          {activeNode && !isProjectRoot && (
            <div className="thoughts-list-header-labels">
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
          )}
        </div>
        <button
          className="thoughts-list-new"
          onClick={handleCreate}
          title="New thought"
        >
          +
        </button>
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

      <div className="thoughts-list-cards">
        {thoughts.length === 0 ? (
          <div className="thoughts-list-empty">No thoughts yet. Create one to get started.</div>
        ) : (
          thoughts.map((thought) => (
            <ThoughtCard
              key={thought.id}
              thought={thought}
              onUpdate={handleUpdate}
              onDelete={onDeleteThought}
              onNavigate={onNavigateToNode}
              autoFocusBody={thought.id === newThoughtId}
            />
          ))
        )}
      </div>
    </div>
  );
}
