// Destination: apps/web/src/components/ColorPicker.tsx
// Extraction-layer version (no new deps). base-ui/ColorPicker.tsx is the
// drop-in Base UI replacement that removes the state + useClickOutside.
import { useRef, useState } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';

const NODE_COLORS = [
  '#7b6bb5', '#e8a838', '#4caf50', '#e05555',
  '#5ba4cf', '#e88bb5', '#999999',
];

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  return (
    <div className="node-color-picker" ref={ref}>
      <button
        className="node-color-dot"
        style={{ background: value }}
        onClick={() => setOpen(!open)}
        title="Node border color"
      />
      {open && (
        <div className="node-color-swatches">
          {NODE_COLORS.map((c) => (
            <button
              key={c}
              className={`node-color-swatch${c === value ? ' node-color-swatch--active' : ''}`}
              style={{ background: c }}
              onClick={() => { onChange(c); setOpen(false); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
