import { useEffect, useState } from 'react';
import { onToast } from '../lib/toasts';
import './Toasts.css';

let nextId = 0;

/** Fixed bottom-right stack surfacing failed background mutations. */
export function Toasts() {
  const [toasts, setToasts] = useState<Array<{ id: number; msg: string }>>([]);

  useEffect(() => onToast((msg) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }), []);

  if (toasts.length === 0) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast"
          onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
