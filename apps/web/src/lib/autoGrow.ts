
/** Resize a textarea to fit its content — the reset-then-measure dance that
 *  was copy-pasted into every inline body editor. Call on mount and onChange. */
export function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
