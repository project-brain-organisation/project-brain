// DRAFT — final: apps/web/src/hooks/useContainerSize.ts

import { useCallback, useRef, useState } from 'react';

export interface Size { width: number; height: number; }

/** Container pixel size via ResizeObserver, seeded from the initial rect. The
 *  returned callback ref attaches it; elRef is exposed for raycasting. */
export function useContainerSize(initial: Size = { width: 400, height: 400 }) {
  const [size, setSize] = useState(initial);
  const elRef = useRef<HTMLDivElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    elRef.current = el;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height });
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    ro.observe(el);
    roRef.current = ro;
  }, []);

  return { ref, elRef, size };
}
