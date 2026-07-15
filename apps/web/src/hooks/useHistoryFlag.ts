import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** A dismissible-surface flag (drawer, sheet, dialog) stored in history state,
 *  so the mobile back button/gesture closes the surface instead of leaving the
 *  app. Opening pushes an entry; closing pops it. Re-opening while already open
 *  replaces the entry rather than stacking — unless `push` is set, which always
 *  stacks a new entry (so a stored drill path can be climbed one back-step per
 *  level). `close(steps)` pops several entries at once to unwind the whole path. */
export function useHistoryFlag<T = true>(
  key: string,
): [T | undefined, (value?: T, opts?: { push?: boolean }) => void, (steps?: number) => void] {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? {}) as Record<string, unknown>;
  const value = state[key] as T | undefined;

  const open = useCallback(
    (v: T = true as T, opts?: { push?: boolean }) => {
      navigate(location.pathname, {
        state: { ...(location.state ?? {}), [key]: v },
        replace: opts?.push ? false : state[key] !== undefined,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, key, location.pathname, location.state],
  );

  const close = useCallback(
    (steps = 1) => {
      if (state[key] === undefined) return;
      // The flag was pushed, so back pops it — unless this is the first entry
      // (page reloaded with the flag set), where we strip it in place instead.
      const idx = (window.history.state?.idx ?? 0) as number;
      if (idx > 0) {
        navigate(-Math.min(steps, idx));
      } else {
        const { [key]: _removed, ...rest } = state;
        navigate(location.pathname, { state: rest, replace: true });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, key, location.pathname, location.state],
  );

  return [value, open, close];
}
