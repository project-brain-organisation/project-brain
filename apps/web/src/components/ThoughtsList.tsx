import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Thought } from '../hooks/useThoughts';
import { useThoughtLabels } from '../hooks/useLabels';
import { ThoughtCard } from './ThoughtCard';
import { LabelPicker } from './LabelPicker';
import { Fab } from './Fab';
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
  /** Drilled into a node: step up one level in the hierarchy. */
  onNavigateUp?: () => void;
  /** Drilled into a node: jump straight back to the project root. */
  onNavigateToRoot?: () => void;
  /** Mobile: replace the header "+" with a FAB (the screen's primary action). */
  createFab?: boolean;
  /** Subscribed public graph: render content but no editing affordances. */
  readOnly?: boolean;
  /** When set and viewing the project root, show a "clone this graph" button
   *  next to the project name (works on own and read-only graphs alike). */
  onClone?: () => Promise<void>;
}

function CloneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
    </svg>
  );
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
  onNavigateUp,
  onNavigateToRoot,
  createFab,
  readOnly,
  onClone,
}: Props) {
  const [newThoughtId, setNewThoughtId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cloning, setCloning] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
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
  // At the mobile root the TopBar already shows the project name — drop the
  // duplicate title here (rename lives on the TopBar title instead). Read-only
  // roots also lose the colour dot, leaving nothing: drop the whole header.
  const hideRootTitle = !!createFab && isProjectRoot;
  const hideHeader = hideRootTitle && !!readOnly;
  const { thoughtLabels, edgeRelationships, assignLabel, unassignLabel, refresh } = useThoughtLabels(
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
    setEditingEdgeId(null);
    setPickerOpen(true);
  }

  function openEdgePicker(edgeRelId: string) {
    setEditingLabelId(null);
    setEditingEdgeId(edgeRelId);
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

  const query = search.trim().toLowerCase();
  const visibleThoughts = query
    ? thoughts.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          t.body.toLowerCase().includes(query),
      )
    : thoughts;

  return (
    <div className="thoughts-list">
      {!hideHeader && (
      <div className="thoughts-list-header">
        <div className="thoughts-list-header-text">
          <div className="thoughts-list-title-row">
            {!hideRootTitle && (editingTitle ? (
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
            ) : readOnly ? (
              <h2 className="thoughts-list-title">{activeNode?.title || 'Untitled'}</h2>
            ) : (
              <h2 onClick={startEditTitle} className="thoughts-list-title-editable">
                {activeNode?.title || 'Untitled'}
              </h2>
            ))}
            {!readOnly && (
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
            )}
            {!isProjectRoot && onNavigateUp && onNavigateToRoot && (
              <div className="thoughts-list-nav-group">
                <button
                  className="thoughts-list-nav"
                  title="Up one level"
                  onClick={onNavigateUp}
                >
                  <ChevronUpIcon />
                </button>
                <button
                  className="thoughts-list-nav"
                  title="Back to project root"
                  onClick={onNavigateToRoot}
                >
                  <HomeIcon />
                </button>
              </div>
            )}
            {isProjectRoot && onClone && (
              <button
                className="thoughts-list-clone"
                disabled={cloning}
                title="Clone this graph into a project you own"
                onClick={async () => {
                  setCloning(true);
                  try { await onClone(); } finally { setCloning(false); }
                }}
              >
                <CloneIcon />
                <span>{cloning ? 'Cloning…' : 'Clone'}</span>
              </button>
            )}
          </div>
          {/* The project root has no persistable body in the v2 model */}
          {!isProjectRoot && readOnly ? (
            <p className="thoughts-list-header-body">{activeNode?.body}</p>
          ) : !isProjectRoot && (editingBody ? (
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
                    onClick={() => onNavigateToNode?.(er.targetId)}
                    disabled={!onNavigateToNode}
                    title={`Go to ${er.targetName}`}
                  >
                    → {er.targetName}
                  </button>
                </span>
              ))}
              {!readOnly && <button className="thought-card-label-add" onClick={() => openPicker()}>+</button>}
            </div>
          )}
        </div>
        {!createFab && !readOnly && (
          <button
            className="thoughts-list-new"
            onClick={handleCreate}
            title="New thought"
          >
            +
          </button>
        )}
      </div>
      )}
      {pickerOpen && createPortal(
        <LabelPicker
          thoughtLabels={thoughtLabels}
          sourceThoughtId={activeNode?.id ?? ''}
          onAssign={assignLabel}
          onUnassign={unassignLabel}
          editingLabelId={editingLabelId}
          editingEdgeRelId={editingEdgeId}
          onClose={() => setPickerOpen(false)}
          onRefresh={refresh}
        />,
        document.body,
      )}

      {thoughts.length > 0 && (
        <div className="thoughts-list-search">
          <SearchIcon />
          <input
            type="text"
            className="thoughts-list-search-input"
            placeholder="Search thoughts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="thoughts-list-search-clear"
              title="Clear search"
              onClick={() => setSearch('')}
            >
              ×
            </button>
          )}
        </div>
      )}

      <div className="thoughts-list-cards">
        {thoughts.length === 0 ? (
          <div className="thoughts-list-empty">No thoughts yet. Create one to get started.</div>
        ) : visibleThoughts.length === 0 ? (
          <div className="thoughts-list-empty">No thoughts match “{search.trim()}”.</div>
        ) : (
          visibleThoughts.map((thought) => (
            <ThoughtCard
              key={thought.id}
              thought={thought}
              onUpdate={handleUpdate}
              onDelete={onDeleteThought}
              onNavigate={onNavigateToNode}
              autoFocusBody={thought.id === newThoughtId}
              readOnly={readOnly}
            />
          ))
        )}
      </div>
      {createFab && !readOnly && (
        <Fab
          className="thoughts-list-fab"
          ariaLabel="New thought"
          hideWhileTyping
          onClick={handleCreate}
          icon={
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          }
        />
      )}
    </div>
  );
}
