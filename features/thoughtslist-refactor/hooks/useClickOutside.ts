// Destination: apps/web/src/hooks/useClickOutside.ts
import { useEffect, type RefObject } from 'react';

/** Call `onClose` when a mousedown lands outside `ref`, but only while `open`.
 *  Replaces the two identical dismiss-on-outside-click effects in ThoughtsList. */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [ref, open, onClose]);
}
