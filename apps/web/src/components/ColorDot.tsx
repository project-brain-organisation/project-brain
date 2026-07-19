import { Popover } from '@base-ui/react/popover';
import { PALETTE } from '../lib/palette';
import './ColorDot.css';

interface Props {
  value: string;
  onPick: (color: string) => void;
  /** Skin for the trigger dot, e.g. `node-color-dot` or `lp-dot lp-dot--clickable`. */
  className?: string;
  title?: string;
}

/** A colour dot that opens a swatch-palette popover. Uncontrolled — Base UI
 *  owns the open state, outside-press dismissal, and positioning. */
export function ColorDot({ value, onPick, className, title = 'Change colour' }: Props) {
  return (
    <Popover.Root>
      <Popover.Trigger
        className={className}
        style={{ background: value }}
        title={title}
        onClick={(e) => e.stopPropagation()}
      />
      <Popover.Portal>
        <Popover.Positioner className="swatch-positioner" sideOffset={6}>
          <Popover.Popup className="swatch-popup">
            {PALETTE.map((c) => (
              <Popover.Close
                key={c}
                className={`swatch${c === value ? ' swatch--active' : ''}`}
                style={{ background: c }}
                onClick={() => onPick(c)}
              />
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
