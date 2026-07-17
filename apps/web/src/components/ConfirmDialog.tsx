import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './ConfirmDialog.css';

interface Props {
  message: string;
  /** Secondary line, e.g. what happens to subthoughts. */
  detail?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Small modal confirm for destructive actions. */
export function ConfirmDialog({ message, detail, confirmLabel = 'Delete', onConfirm, onCancel }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-box" role="alertdialog" onClick={(e) => e.stopPropagation()}>
        <p className="confirm-message">{message}</p>
        {detail && <p className="confirm-detail">{detail}</p>}
        <div className="confirm-actions">
          <button className="confirm-cancel" onClick={onCancel}>Cancel</button>
          <button className="confirm-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
