type Listener = (msg: string) => void;
const listeners = new Set<Listener>();

export function onToast(fn: Listener) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function toastError(msg: string) {
  console.error(msg);
  listeners.forEach((fn) => fn(msg));
}

/** The API throws Error(responseBody); pull Nest's message out if it's JSON. */
export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.message === 'string') return parsed.message;
  } catch {
    // not JSON — fall through
  }
  return raw || 'Something went wrong';
}
