import { AlertDialog } from '@base-ui/react/alert-dialog';
import './ConfirmDialog.css';

interface Props {
  message: string;
  /** Secondary line, e.g. what happens to subthoughts. */
  detail?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Small modal confirm for destructive actions. Rendered only while pending
 *  (see ConfirmProvider), so it mounts open; Escape cancels. */
export function ConfirmDialog({ message, detail, confirmLabel = 'Delete', onConfirm, onCancel }: Props) {
  return (
    <AlertDialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="confirm-backdrop" />
        <AlertDialog.Popup className="confirm-box">
          <AlertDialog.Title className="confirm-message">{message}</AlertDialog.Title>
          {detail && <AlertDialog.Description className="confirm-detail">{detail}</AlertDialog.Description>}
          <div className="confirm-actions">
            <AlertDialog.Close className="confirm-cancel">Cancel</AlertDialog.Close>
            <button className="confirm-danger" onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
