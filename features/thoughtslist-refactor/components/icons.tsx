// Destination: apps/web/src/components/icons.tsx
//
// The inline SVGs that were scattered across ThoughtsList, ThoughtCard and the
// FAB. Shared stroke attrs live in one spread; each icon takes an optional size.
import type { ReactNode } from 'react';

interface IconProps { size?: number }

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function Svg({ size = 15, children }: IconProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...STROKE}>
      {children}
    </svg>
  );
}

export const CloneIcon = ({ size }: IconProps) => (
  <Svg size={size}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </Svg>
);

export const ChevronUpIcon = ({ size }: IconProps) => (
  <Svg size={size}><path d="m18 15-6-6-6 6" /></Svg>
);

export const ChevronDownIcon = ({ size = 14 }: IconProps) => (
  <Svg size={size}><path d="m6 9 6 6 6-6" /></Svg>
);

export const SearchIcon = ({ size = 14 }: IconProps) => (
  <Svg size={size}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </Svg>
);

export const HomeIcon = ({ size }: IconProps) => (
  <Svg size={size}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20h14V9.5" />
  </Svg>
);

/** Up-arrow-to-bar: "set parent thought" on the card. */
export const ReparentIcon = ({ size = 13 }: IconProps) => (
  <Svg size={size}>
    <path d="M12 19V9" />
    <path d="m7 13 5-5 5 5" />
    <path d="M5 5h14" />
  </Svg>
);

export const PlusIcon = ({ size = 24 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
