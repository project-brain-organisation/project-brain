// Destination: apps/web/src/components/Editable.tsx
import type { ElementType, ReactNode, KeyboardEvent } from 'react';
import { useInlineEdit } from '../hooks/useInlineEdit';

type InlineEdit<E extends HTMLInputElement | HTMLTextAreaElement> = ReturnType<typeof useInlineEdit<E>>;

interface Props<E extends HTMLInputElement | HTMLTextAreaElement> {
  edit: InlineEdit<E>;
  value: string;
  as: ElementType;          // display tag: 'h2' | 'p' | 'span' | 'div' …
  multiline?: boolean;      // render <textarea> vs <input> while editing
  readOnly?: boolean;
  className: string;        // display element class
  editClassName: string;    // editor element class
  placeholder?: ReactNode;  // clickable prompt shown when empty & editable
  emptyText?: ReactNode;    // shown when empty & readOnly
}

/**
 * Display half of the inline-edit pair. Renders the editor while editing,
 * otherwise a click-to-edit (or static, when readOnly) element of tag `as`.
 * Collapses the editing / readOnly / editable ternary that was hand-written for
 * every title and body.
 */
export function Editable<E extends HTMLInputElement | HTMLTextAreaElement>({
  edit, value, as, multiline, readOnly, className, editClassName, placeholder = '', emptyText = '',
}: Props<E>) {
  if (edit.editing) {
    // inputProps.ref is typed to E; the tag is chosen by `multiline`, so cast
    // once here rather than threading the element type through every caller.
    const props = edit.inputProps as React.ComponentProps<'input'> & React.ComponentProps<'textarea'>;
    return multiline
      ? <textarea className={editClassName} rows={1} {...props} />
      : <input className={editClassName} {...props} />;
  }
  const Tag = as;
  if (readOnly) {
    return <Tag className={className}>{value || emptyText}</Tag>;
  }
  // Keyboard-reachable click-to-edit (WAI-ARIA button pattern): the display
  // element is focusable and Enter/Space open the editor, not just a mouse click.
  return (
    <Tag
      className={className}
      role="button"
      tabIndex={0}
      onClick={edit.start}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); edit.start(); }
      }}
    >
      {value || placeholder}
    </Tag>
  );
}
