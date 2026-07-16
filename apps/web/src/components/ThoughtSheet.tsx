import { useRef, type ReactNode } from 'react';
import type { Thought } from '../hooks/useThoughts';
import { ThoughtCard } from './ThoughtCard';
import './ThoughtSheet.css';

export type SheetState = 'closed' | 'peek' | 'expanded';

/** Must match --sheet-peek / the expanded height in ThoughtSheet.css.
 *  Heights are relative to the sheet's flex container (the graph screen). */
function peekHeight(containerH: number): number {
  return Math.min(320, containerH * 0.5);
}
function expandedHeight(containerH: number): number {
  return containerH * 0.85;
}

interface Props {
  thought?: Thought;
  state: SheetState;
  onStateChange: (state: SheetState) => void;
  /** The rest of the focused subgraph (parent, children, relationship
   *  neighbours), listed under the card; tapping one refocuses the sheet. */
  neighbours?: Thought[];
  onSelectNeighbour?: (id: string) => void;
  onUpdate: (id: string, data: { title?: string; body?: string }) => void;
  onDelete: (id: string) => void;
  /** Anchored FAB: rendered as a child so it rides the sheet's top edge —
   *  docked above the container bottom when closed, pinned above the sheet
   *  at peek, scaled out at expanded (all in CSS). */
  fab?: ReactNode;
  /** Subscribed public graph: render the card read-only. */
  readOnly?: boolean;
}

/** Mobile standard bottom sheet previewing the node tapped in the graph.
 *  In-flow (not an overlay): its height pushes the graph area up, so the
 *  graph is never covered. No scrim — Material reserves scrims for modal
 *  sheets. */
export function ThoughtSheet({ thought, state, onStateChange, neighbours, onSelectNeighbour, onUpdate, onDelete, fab, readOnly }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startHeight: number; containerH: number; moved: boolean } | null>(null);
  // The click event fires after pointerup has cleared `drag`; remember whether
  // that gesture was a drag so the tap-toggle can ignore it.
  const lastGestureWasDrag = useRef(false);

  function dragHeight(d: NonNullable<typeof drag.current>, clientY: number): number {
    const h = d.startHeight + (d.startY - clientY);
    return Math.min(Math.max(h, 0), expandedHeight(d.containerH));
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const sheet = sheetRef.current;
    if (!sheet || state === 'closed') return;
    drag.current = {
      startY: e.clientY,
      startHeight: sheet.getBoundingClientRect().height,
      containerH: sheet.parentElement!.clientHeight,
      moved: false,
    };
    lastGestureWasDrag.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    sheet.classList.add('thought-sheet--dragging');
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const sheet = sheetRef.current;
    if (!d || !sheet) return;
    if (Math.abs(e.clientY - d.startY) > 5) d.moved = true;
    sheet.style.height = `${dragHeight(d, e.clientY)}px`;
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const sheet = sheetRef.current;
    drag.current = null;
    if (!d || !sheet) return;
    sheet.classList.remove('thought-sheet--dragging');
    sheet.style.height = '';
    if (!d.moved) return; // plain tap → handled by onClick toggle
    lastGestureWasDrag.current = true;
    const h = dragHeight(d, e.clientY);
    const peek = peekHeight(d.containerH);
    const expanded = expandedHeight(d.containerH);
    if (h < peek / 2) onStateChange('closed');
    else if (h < (peek + expanded) / 2) onStateChange('peek');
    else onStateChange('expanded');
  }

  function handlePointerCancel() {
    const sheet = sheetRef.current;
    drag.current = null;
    lastGestureWasDrag.current = true;
    if (!sheet) return;
    sheet.classList.remove('thought-sheet--dragging');
    sheet.style.height = ''; // snap back to the current state's height
  }

  function handleTap() {
    if (lastGestureWasDrag.current) {
      lastGestureWasDrag.current = false;
      return;
    }
    if (state === 'peek') onStateChange('expanded');
    else if (state === 'expanded') onStateChange('peek');
  }

  return (
    <div ref={sheetRef} className="thought-sheet" data-state={state}>
      {fab}
      <div className="thought-sheet-panel">
        <div
          className="thought-sheet-handle"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onClick={handleTap}
          aria-label={state === 'expanded' ? 'Collapse preview' : 'Expand preview'}
        >
          <span className="thought-sheet-handle-pill" />
        </div>
        <div className="thought-sheet-body">
          {thought && (
            <ThoughtCard thought={thought} onUpdate={onUpdate} onDelete={onDelete} readOnly={readOnly} />
          )}
          {thought && neighbours && neighbours.length > 0 && (
            <div className="thought-sheet-neighbours">
              <div className="thought-sheet-neighbours-title">Connected</div>
              {neighbours.map((n) => (
                <button
                  key={n.id}
                  className="thought-sheet-neighbour"
                  onClick={() => onSelectNeighbour?.(n.id)}
                >
                  {n.title || n.body || 'Untitled'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
