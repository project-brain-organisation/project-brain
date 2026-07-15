import { useEffect, useState } from 'react';
import './CoachMark.css';

const SEEN_KEY = 'pb-coach-graph';

/** One-time gesture hint on first visit to the mobile graph screen.
 *  Non-blocking (pointer-events: none) — the first touch anywhere both
 *  reaches the graph and dismisses the hint. */
export function CoachMark() {
  const [visible, setVisible] = useState(() => !localStorage.getItem(SEEN_KEY));

  useEffect(() => {
    if (!visible) return;
    const dismiss = () => {
      localStorage.setItem(SEEN_KEY, '1');
      setVisible(false);
    };
    document.addEventListener('pointerdown', dismiss, { once: true, capture: true });
    return () => document.removeEventListener('pointerdown', dismiss, { capture: true });
  }, [visible]);

  if (!visible) return null;
  return (
    <div className="coach-mark">
      Drag to rotate · Pinch to zoom · Tap a node to preview
    </div>
  );
}
