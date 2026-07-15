import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 768px)';

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** True below the mobile breakpoint. Drives conditional mounting (not CSS
 *  hiding) so the 3D graph's render loop never runs behind another screen. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
