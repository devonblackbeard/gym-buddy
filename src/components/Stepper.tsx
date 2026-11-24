import { useEffect, useState, type ReactNode } from "react";
import { fmtWeight, haptic } from "../lib/format";
import { Minus, Plus } from "./Icons";

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
  max: number;
  integer?: boolean;
  children?: ReactNode; // rendered under the value, e.g. a unit toggle
}

/** Big thumb-sized −/+ control with a tappable, typeable value in the middle. */
export function Stepper({ label, value, onChange, step, max, integer, children }: Props) {
  const [text, setText] = useState(fmtWeight(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(fmtWeight(value));
  }, [value, focused]);

  const clamp = (n: number) => {
    const bounded = Math.min(max, Math.max(0, n));
    return integer ? Math.round(bounded) : Math.round(bounded * 100) / 100;
  };

  const bump = (dir: 1 | -1) => {
    // Snap to the step grid so 137 → 135 / 140 rather than 132 / 142.
    const snapped = dir > 0 ? Math.floor(value / step) * step + step : Math.ceil(value / step) * step - step;
    onChange(clamp(snapped));
    haptic(8);
  };

  const parse = (raw: string) => Number.parseFloat(raw.replace(",", "."));

  return (
    <div className="stepper">
      <div className="stepper-label">{label}</div>
      <div className="stepper-row">
        <button type="button" className="step-btn" onClick={() => bump(-1)} aria-label={`Decrease ${label}`}>
          <Minus />
        </button>
        <div className="stepper-value">
          <input
            aria-label={label}
            inputMode={integer ? "numeric" : "decimal"}
            enterKeyHint="done"
            value={text}
            onFocus={(e) => {
              setFocused(true);
              e.target.select();
            }}
            onChange={(e) => {
              setText(e.target.value);
              const n = parse(e.target.value);
              if (Number.isFinite(n)) onChange(clamp(n));
            }}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          {children}
        </div>
        <button type="button" className="step-btn" onClick={() => bump(1)} aria-label={`Increase ${label}`}>
          <Plus />
        </button>
      </div>
    </div>
  );
}
