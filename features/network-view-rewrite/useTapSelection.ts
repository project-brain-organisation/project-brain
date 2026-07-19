// DRAFT — final: apps/web/src/hooks/useTapSelection.ts

import { useCallback, useRef } from 'react';
import type { MutableRefObject, PointerEvent } from 'react';
import { Raycaster, Vector2 } from 'three';

/**
 * Deterministic tap-to-select on mouse and touch. force-graph's own click bails
 * on >1px movement (finger taps wiggle) and raycasts on animation frames (misses
 * between-frame taps); we track the pointer and raycast on pointerup within a
 * finger-sized tolerance. Node hit → select; empty tap → reset.
 */
export function useTapSelection(
  fgRef: MutableRefObject<any>,
  elRef: MutableRefObject<HTMLDivElement | null>,
  onSelectNode?: (id: string) => void,
  onResetView?: () => void,
) {
  const tap = useRef<{ x: number; y: number; t: number; id: number } | null>(null);

  const onPointerDown = useCallback((e: PointerEvent) => {
    // A second concurrent pointer (pinch) is never a tap.
    tap.current = tap.current ? null : { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
  }, []);

  const onPointerUp = useCallback((e: PointerEvent) => {
    const t = tap.current;
    tap.current = null;
    if (!t || t.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > 8 || Date.now() - t.t > 500) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const fg = fgRef.current, el = elRef.current;
    if (!fg || !el) return;
    const rect = el.getBoundingClientRect();
    const ndc = new Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new Raycaster();
    raycaster.setFromCamera(ndc, fg.camera());
    for (const hit of raycaster.intersectObjects(fg.scene().children, true)) {
      let obj: any = hit.object;
      while (obj && obj.__graphObjType === undefined) obj = obj.parent;
      if (obj?.__graphObjType === 'node') { onSelectNode?.(obj.__data.id); return; }
    }
    onResetView?.();
  }, [fgRef, elRef, onSelectNode, onResetView]);

  const onPointerCancel = useCallback(() => { tap.current = null; }, []);

  return { onPointerDown, onPointerUp, onPointerCancel };
}
