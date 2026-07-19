import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useHistoryFlag } from './useHistoryFlag';

/**
 * State for the mobile graph top sheet: a history-backed open flag (so the
 * back gesture closes it), an idle-time graph preload, and the drag handle's
 * pointer logic. Dragging resizes the sheet directly (inline flex-basis,
 * transition off) and release snaps open/closed; a no-move release is a tap
 * and toggles. State only marks "dragging" — height stays in the DOM so moves
 * never re-render React.
 */
export function useOverlay() {
  const [openFlag, openFlagPush, closeFlagPop] = useHistoryFlag('graph');
  const graphOpen = !!openFlag;

  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startH: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const maxHeight = () => window.innerHeight * 0.46;

  // A drill inside the open graph lands on top of the open-graph history entry,
  // so record the index from just before the sheet opened; closing pops straight
  // back to it — sheet plus any in-sheet drills — in one tap.
  const openBaseIdx = useRef(0);
  const historyIdx = () => (window.history.state?.idx as number | undefined) ?? 0;
  const open = useCallback(() => {
    openBaseIdx.current = historyIdx();
    openFlagPush();
  }, [openFlagPush]);
  const close = useCallback(() => {
    closeFlagPop(Math.max(1, historyIdx() - openBaseIdx.current));
  }, [closeFlagPop]);

  // Front-load the graph: mount it (paused, clipped to zero height) shortly
  // after first paint so the WebGL init + layout is done before the first open.
  const [preloaded, setPreloaded] = useState(false);
  useEffect(() => {
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const id = w.requestIdleCallback
      ? w.requestIdleCallback(() => setPreloaded(true), { timeout: 2000 })
      : window.setTimeout(() => setPreloaded(true), 500);
    return () => (w.cancelIdleCallback ? w.cancelIdleCallback(id) : clearTimeout(id));
  }, []);

  // Latch-mount the graph on first interaction, then keep it mounted and
  // merely paused when the sheet is shut, so reopening is instant.
  const everOpened = useRef(false);
  if (graphOpen || dragging) everOpened.current = true;
  const mountGraph = graphOpen || dragging || everOpened.current || preloaded;

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      startY: e.clientY,
      startH: sheetRef.current?.getBoundingClientRect().height ?? 0,
      moved: false,
    };
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    const sheet = sheetRef.current;
    if (!d || !sheet) return;
    const dy = e.clientY - d.startY;
    if (!d.moved) {
      if (Math.abs(dy) <= 6) return; // ignore sub-threshold jitter; keep it a tap
      d.moved = true;
      sheet.style.transition = 'none';
      setDragging(true);
    }
    sheet.style.flexBasis = `${Math.min(Math.max(d.startH + dy, 0), maxHeight())}px`;
  }, []);

  const onPointerUp = useCallback(() => {
    const d = drag.current;
    const sheet = sheetRef.current;
    drag.current = null;
    if (!d || !sheet) { setDragging(false); return; }
    if (!d.moved) {
      // A tap toggles.
      setDragging(false);
      if (graphOpen) close();
      else open();
      return;
    }
    const shouldOpen = sheet.getBoundingClientRect().height > maxHeight() / 2;
    sheet.style.transition = 'flex-basis 240ms cubic-bezier(0.22, 1, 0.36, 1)';
    void sheet.offsetHeight; // commit the transition before changing the target
    sheet.style.flexBasis = shouldOpen ? `${maxHeight()}px` : '0px';
    const finishSnap = () => {
      sheet.style.transition = '';
      sheet.style.flexBasis = '';
    };
    sheet.addEventListener('transitionend', finishSnap, { once: true });
    window.setTimeout(finishSnap, 320); // fallback if no size change → no event
    if (shouldOpen && !graphOpen) open();
    else if (!shouldOpen && graphOpen) close();
    setDragging(false);
  }, [graphOpen, open, close]);

  return {
    sheetRef,
    graphOpen,
    dragging,
    mountGraph,
    handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
