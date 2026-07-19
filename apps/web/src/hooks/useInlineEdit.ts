import {
  useCallback, useEffect, useRef, useState,
  type ChangeEvent, type KeyboardEvent,
} from 'react';
import { autoGrow } from '../lib/autoGrow';

interface Options {
  /** textarea semantics: no trim on commit, Cmd/Ctrl+Enter commits, autogrow.
   *  false (default) = single-line input: trims on commit, Enter commits. */
  multiline?: boolean;
  /** Start already in edit mode (e.g. the body of a freshly created card). */
  autoFocus?: boolean;
}

/**
 * The click-to-edit lifecycle shared by every inline title/body field: a draft,
 * focus-with-caret-at-end on entry, commit-on-blur, Enter to commit, Escape to
 * cancel. Owns only the *editor* — the caller keeps its own display markup and
 * spreads `inputProps` onto the <input>/<textarea>.
 *
 * `E` is the editor element type so the returned ref matches the tag:
 *   const title = useInlineEdit<HTMLInputElement>(t.title, save);
 *   const body  = useInlineEdit<HTMLTextAreaElement>(t.body, save, { multiline: true });
 */
export function useInlineEdit<E extends HTMLInputElement | HTMLTextAreaElement>(
  value: string,
  onCommit: (next: string) => void,
  { multiline = false, autoFocus = false }: Options = {},
) {
  const [editing, setEditing] = useState(autoFocus);
  const [draft, setDraft] = useState(value);
  const ref = useRef<E>(null);

  const start = useCallback(() => {
    setDraft(value);
    setEditing(true);
  }, [value]);

  const commit = useCallback(() => {
    setEditing(false);
    const next = multiline ? draft : draft.trim();
    if (next !== value) onCommit(next);
  }, [draft, value, multiline, onCommit]);

  const cancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  // Focus + caret-to-end (+ size the textarea) whenever we enter edit mode.
  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
    if (multiline) autoGrow(el as HTMLTextAreaElement);
  }, [editing, multiline]);

  const inputProps = {
    ref,
    value: draft,
    onChange: (e: ChangeEvent<E>) => {
      setDraft(e.target.value);
      if (multiline) autoGrow(e.target as HTMLTextAreaElement);
    },
    onBlur: commit,
    onKeyDown: (e: KeyboardEvent<E>) => {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      else if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        commit();
      }
    },
  };

  return { editing, draft, start, commit, cancel, inputProps };
}
