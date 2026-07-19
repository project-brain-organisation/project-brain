import type { ReactNode, RefObject } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import './Modal.css';

interface Props {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Muted intro paragraph under the title. */
  description?: ReactNode;
  /** Extra class on the popup — per-dialog sizing/skin overrides hang off it. */
  className?: string;
  /** Element to focus when the dialog opens (defaults to the first tabbable). */
  initialFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/** Shared modal chrome: backdrop, centered popup, title row with a close
 *  button. Base UI supplies the portal, focus trap, scroll lock, Escape and
 *  outside-press dismissal, and the aria wiring. */
export function Modal({ open, onClose, title, description, className, initialFocus, children }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="modal-backdrop" />
        <Dialog.Popup className={`modal${className ? ` ${className}` : ''}`} initialFocus={initialFocus}>
          <div className="modal-header">
            <Dialog.Title className="modal-title">{title}</Dialog.Title>
            <Dialog.Close className="modal-close" aria-label="Close">&times;</Dialog.Close>
          </div>
          {description && <Dialog.Description className="modal-desc">{description}</Dialog.Description>}
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
