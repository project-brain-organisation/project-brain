type Listener = () => void;
const listeners = new Set<Listener>();

export function onThoughtsChanged(fn: Listener) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function notifyThoughtsChanged() {
  listeners.forEach((fn) => fn());
}
