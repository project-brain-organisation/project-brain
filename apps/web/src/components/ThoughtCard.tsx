import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { type Thought } from '../hooks/useThoughts';
import { useThoughtNavigation } from '../contexts/ThoughtNavigationProvider';
import { useThoughtActions } from '../hooks/useThoughtActions';
import { useCurrentProject } from '../hooks/useCurrentProject';
import { useLabelEditor } from '../hooks/useLabelEditor';
import { useInlineEdit } from '../hooks/useInlineEdit';
import { LabelRow } from './LabelRow';
import { ParentPicker } from './ParentPicker';
import { ReparentIcon } from './icons';
import { selfAndDescendants } from '../lib/descendants';
import './ThoughtCard.css';

const EDITING_INPUTS =
  '.thought-card-tag--editing, .thought-card-text--editing, .thoughts-list-title-input, .thoughts-list-body-input';

// Cache one formatter instead of building a new Intl object per render.
const TIME_FMT = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
function formatTime(iso: string): string {
  if (!iso) return ''; // the root pseudo-node has no timestamp
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-GB', { month: 'short' });
  return `${day} ${month} ${TIME_FMT.format(d)}`;
}

/** Drag payload carried between cards. Replaces the old module-global: the
 *  cycle-blocked set travels WITH the drag, so drop targets read it directly. */
interface DragData {
  type: 'thought';
  id: string;
  blocked: Set<string>;
}

/**
 * Only the thought to render, plus a transient hint to open a freshly created
 * card in edit mode. Navigation, mutations, readOnly and labels come from the
 * domain layer — the card is no longer wired by its parent.
 */
export function ThoughtCard({ thought, autoFocusBody }: { thought: Thought; autoFocusBody?: boolean }) {
  const { navigateToNode, allThoughts } = useThoughtNavigation();
  const { update, remove, reparent } = useThoughtActions();
  const { readOnly } = useCurrentProject();
  const { thoughtLabels, edgeRelationships, openPicker, openEdgePicker, pickerElement } =
    useLabelEditor(thought.id, thought.projectId);

  const title = useInlineEdit<HTMLInputElement>(thought.title, (v) => update(thought.id, { title: v }));
  const body = useInlineEdit<HTMLTextAreaElement>(
    thought.body, (v) => update(thought.id, { body: v }), { multiline: true, autoFocus: !!autoFocusBody },
  );

  const [dropHover, setDropHover] = useState(false);
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const swallowClick = useRef(false);

  const editing = (title.editing || body.editing) && !readOnly;

  // Latest values for the imperative DnD callbacks, so we register once (per
  // element) yet always act on fresh state rather than a stale closure.
  const live = useRef({ thought, allThoughts, editing, readOnly, reparent });
  useEffect(() => {
    live.current = { thought, allThoughts, editing, readOnly, reparent };
  });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    return combine(
      draggable({
        element: el,
        canDrag: () => {
          const s = live.current;
          return !s.readOnly && !s.thought.isRoot && !s.editing;
        },
        getInitialData: () => {
          const s = live.current;
          const data: DragData = { type: 'thought', id: s.thought.id, blocked: selfAndDescendants(s.allThoughts, s.thought.id) };
          return { ...data };
        },
      }),
      dropTargetForElements({
        element: el,
        // Reject read-only drops, non-thought drags, and anything that would
        // create a cycle (self or a descendant of the dragged node).
        canDrop: ({ source }) => {
          const s = live.current;
          const data = source.data as unknown as DragData;
          return !s.readOnly && data.type === 'thought' && !data.blocked.has(s.thought.id);
        },
        onDragEnter: () => setDropHover(true),
        onDragLeave: () => setDropHover(false),
        onDrop: ({ source }) => {
          setDropHover(false);
          const s = live.current;
          const data = source.data as unknown as DragData;
          // Dropping onto the root card reparents to the top level (null).
          s.reparent(data.id, s.thought.isRoot ? null : s.thought.id);
        },
      }),
    );
  }, []);

  // Runs before the browser blurs the active editor, so activeElement still
  // tells us whether this click is the one dismissing an edit elsewhere.
  function guardPointerDown() {
    const ae = document.activeElement;
    swallowClick.current = !!ae && ae.matches(EDITING_INPUTS) && !rootRef.current?.contains(ae);
  }
  function shouldSwallowClick() {
    const s = swallowClick.current;
    swallowClick.current = false;
    return s;
  }

  // Keyboard-reachable click-to-edit; omitted entirely when read-only.
  const editTrigger = (start: () => void) =>
    readOnly
      ? {}
      : {
          role: 'button' as const,
          tabIndex: 0,
          onKeyDown: (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); }
          },
        };

  const time = formatTime(thought.updatedAt);
  const hasActions = !readOnly || !thought.isRoot;

  return (
    <div className={`thought-card${dropHover ? ' thought-card--drop' : ''}`} ref={rootRef}>
      {(thought.title || editing || hasActions) && (
        <div className="thought-card-top">
          {title.editing ? (
            <input className="thought-card-tag thought-card-tag--editing" {...title.inputProps} />
          ) : thought.title ? (
            <span
              className="thought-card-tag"
              onPointerDown={guardPointerDown}
              onClick={() => !shouldSwallowClick() && !readOnly && title.start()}
              {...editTrigger(title.start)}
            >
              {thought.title}
            </span>
          ) : readOnly ? null : body.editing ? (
            <span
              className="thought-card-tag thought-card-tag--placeholder"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => title.start()}
              {...editTrigger(title.start)}
            >
              Add title
            </span>
          ) : null}
          <div className="thought-card-actions">
            {!readOnly && !thought.isRoot && (
              <button
                className="thought-card-action thought-card-action--parent"
                onClick={() => setParentPickerOpen(true)}
                aria-label="Set parent thought"
                title="Set parent thought"
              >
                <ReparentIcon />
              </button>
            )}
            <button
              className="thought-card-action thought-card-action--nav"
              onClick={() => navigateToNode(thought.id)}
              aria-label="View as node"
              title="View as node"
            >
              →
            </button>
            {!readOnly && !thought.isRoot && (
              <button
                className="thought-card-action thought-card-action--delete"
                onClick={() => remove(thought.id)}
                aria-label="Remove thought"
                title="Remove"
              >
                ×
              </button>
            )}
          </div>
        </div>
      )}

      {body.editing ? (
        <textarea className="thought-card-text thought-card-text--editing" rows={1} {...body.inputProps} />
      ) : (
        !thought.isRoot && (
          <div
            className="thought-card-text"
            onPointerDown={guardPointerDown}
            onClick={() => !shouldSwallowClick() && !readOnly && body.start()}
            {...editTrigger(body.start)}
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
              onNavigate={navigateToNode}
              onEditLabel={openPicker}
              onEditEdge={openEdgePicker}
              onAdd={() => openPicker()}
            />
          </div>
          {time && <span className="thought-card-time">{time}</span>}
        </div>
      )}
      {parentPickerOpen && <ParentPicker thought={thought} onClose={() => setParentPickerOpen(false)} />}
      {pickerElement}
    </div>
  );
}
