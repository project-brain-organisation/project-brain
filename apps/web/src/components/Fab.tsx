import { useEffect, useState, type ReactNode } from 'react';
import './Fab.css';

/** Height of the on-screen keyboard covering the layout viewport, in px.
 *  0 on desktop and whenever the keyboard is down. Keeps the FAB reachable
 *  while typing instead of buried under (or hidden from) the keyboard. */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () =>
      setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}

interface Props {
  icon: ReactNode;
  /** Present = extended FAB (icon + text). */
  label?: string;
  ariaLabel?: string;
  onClick: () => void;
  className?: string;
}

/** Material floating action button; positioned by the caller via className.
 *  Rides above the on-screen keyboard automatically. */
export function Fab({ icon, label, ariaLabel, onClick, className }: Props) {
  const inset = useKeyboardInset();
  return (
    <button
      className={`fab${label ? ' fab--extended' : ''}` + (className ? ` ${className}` : '')}
      style={inset ? { transform: `translateY(-${inset}px)` } : undefined}
      onClick={onClick}
      aria-label={ariaLabel ?? label}
    >
      {icon}
      {label && <span className="fab-label">{label}</span>}
    </button>
  );
}
