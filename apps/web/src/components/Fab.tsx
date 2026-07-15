import { useEffect, useState, type ReactNode } from 'react';
import './Fab.css';

/** True while a text field has focus — i.e. the on-screen keyboard is likely up. */
function useTypingFocus(): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const check = () => {
      const el = document.activeElement;
      setTyping(!!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'));
    };
    // focusout fires before the next element gains focus — defer so moving
    // between fields doesn't flash the FAB.
    const deferredCheck = () => setTimeout(check, 0);
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', deferredCheck);
    return () => {
      document.removeEventListener('focusin', check);
      document.removeEventListener('focusout', deferredCheck);
    };
  }, []);
  return typing;
}

interface Props {
  icon: ReactNode;
  /** Present = extended FAB (icon + text). */
  label?: string;
  ariaLabel?: string;
  onClick: () => void;
  /** Scale out while the on-screen keyboard is up. */
  hideWhileTyping?: boolean;
  className?: string;
}

/** Material floating action button; positioned by the caller via className. */
export function Fab({ icon, label, ariaLabel, onClick, hideWhileTyping, className }: Props) {
  const typing = useTypingFocus();
  const hidden = hideWhileTyping && typing;
  return (
    <button
      className={
        `fab${label ? ' fab--extended' : ''}${hidden ? ' fab--hidden' : ''}` +
        (className ? ` ${className}` : '')
      }
      onClick={onClick}
      aria-label={ariaLabel ?? label}
    >
      {icon}
      {label && <span className="fab-label">{label}</span>}
    </button>
  );
}
