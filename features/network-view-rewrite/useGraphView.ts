// DRAFT — final: apps/web/src/hooks/useGraphView.ts
// All imperative wiring of the force-graph instance, in one place.

import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { BBox, GraphModel } from './graphModel';
import type { Size } from './useContainerSize';

/**
 * Frames the pre-settled graph's bbox exactly (perspective fit, not zoomToFit),
 * auto-refits only on identity change (project/focus) and never once the user
 * pans, disables rotation, clamps dolly, rebuilds node objects on recolour, and
 * pauses the render loop after one fresh frame. Returns a re-centre callback.
 *
 * `identity` = focus id, or a `root:`-prefixed root id so focusing the root
 * still counts as a change and zooms to fit.
 */
export function useGraphView(
  fgRef: MutableRefObject<any>,
  bbox: BBox,
  size: Size,
  identity: string,
  graphData: GraphModel['graphData'],
  nodeColors: Record<string, string>,
  paused: boolean | undefined,
) {
  const firstFit = useRef(true);
  const userNavigated = useRef(false);
  const prevIdentity = useRef<string | null>(null);

  const fitDistance = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return 0;
    const halfW = Math.max((bbox.maxX - bbox.minX) / 2, 20) * 1.05;
    const halfH = Math.max((bbox.maxY - bbox.minY) / 2, 20) * 1.05;
    const halfFov = ((fg.camera().fov / 2) * Math.PI) / 180;
    return Math.max(halfH, halfW / (size.width / size.height)) / Math.tan(halfFov);
  }, [bbox, size, fgRef]);

  const fitGraph = useCallback((animate = true) => {
    const fg = fgRef.current;
    if (!fg) return;
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    fg.cameraPosition({ x: cx, y: cy, z: fitDistance() }, { x: cx, y: cy, z: 0 }, animate ? 400 : 0);
  }, [bbox, fitDistance, fgRef]);

  // Refit on identity change (animated) or resize (snapped). Debounced so a
  // resize burst collapses to one fit and overlapping tweens can't flicker.
  useEffect(() => {
    const changed = prevIdentity.current !== identity;
    if (changed) { prevIdentity.current = identity; userNavigated.current = false; }
    if (userNavigated.current) return;
    const animate = changed && !firstFit.current;
    const timer = setTimeout(() => { fitGraph(animate); firstFit.current = false; }, changed ? 50 : 180);
    return () => clearTimeout(timer);
  }, [identity, fitGraph]);

  // Pan/zoom only (flat plane); any interaction takes the camera. Dolly clamped
  // to scale. Covers Trackball (noRotate) + Orbit (enableRotate).
  useEffect(() => {
    const controls = fgRef.current?.controls();
    if (!controls) return;
    controls.noRotate = true;
    controls.enableRotate = false;
    controls.minDistance = 15;
    controls.maxDistance = Math.max(fitDistance() * 2.5, 300);
    const mark = () => { userNavigated.current = true; };
    controls.addEventListener('start', mark);
    return () => controls.removeEventListener('start', mark);
  }, [fgRef, graphData, fitDistance]);

  // Rebuild node objects when colours change.
  useEffect(() => { fgRef.current?.refresh(); }, [fgRef, nodeColors]);

  // Live → run the loop. Paused → one fresh frame then stop, so the static scene
  // shows without a continuous redraw. Repaint on size/data change.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.resumeAnimation();
    if (!paused) return;
    const id = requestAnimationFrame(() => fg.pauseAnimation());
    return () => cancelAnimationFrame(id);
  }, [paused, size, graphData, fgRef]);

  return useCallback(() => { userNavigated.current = false; fitGraph(); }, [fitGraph]);
}
