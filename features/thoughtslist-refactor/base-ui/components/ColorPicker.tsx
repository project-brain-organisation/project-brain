// Destination: apps/web/src/components/ColorPicker.tsx
import { Popover } from '@base-ui-components/react/popover';

const NODE_COLORS = [
  '#7b6bb5', '#e8a838', '#4caf50', '#e05555',
  '#5ba4cf', '#e88bb5', '#999999',
];

/**
 * The node-border colour swatch popover from the ThoughtsList header. Base UI's
 * Popover owns open/close, outside-click, Escape and positioning; each swatch is
 * a Popover.Close so picking a colour commits and dismisses in one click — no
 * local state, ref, or useClickOutside.
 */
export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        className="node-color-dot"
        style={{ background: value }}
        title="Node border color"
      />
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start">
          <Popover.Popup className="node-color-swatches">
            {NODE_COLORS.map((c) => (
              <Popover.Close
                key={c}
                className={`node-color-swatch${c === value ? ' node-color-swatch--active' : ''}`}
                style={{ background: c }}
                onClick={() => onChange(c)}
              />
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
