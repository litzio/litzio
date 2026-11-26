import { useId } from "react";

/**
 * A row of named palette colors as native radios: arrow keys move and choose, each color's name is its
 * accessible name and tooltip. The caller owns the value, its meaning and when it is saved.
 */
export function ColorSwatches<T extends string>({ colors, value, onChange, label, colorLabel, colorValue, testId, disabled = false }: {
  colors: readonly T[];
  /** null leaves every color unchosen. */
  value: T | null;
  onChange(color: T): void;
  label: string;
  colorLabel(color: T): string;
  /** A CSS color, normally a token variable. */
  colorValue(color: T): string;
  testId?: string;
  disabled?: boolean;
}) {
  const name = useId();
  return <div className="color-swatches" role="radiogroup" aria-label={label} data-testid={testId}>
    {colors.map(color => <label key={color} className="color-swatch" title={colorLabel(color)}>
      <input type="radio" name={name} value={color} checked={value === color} aria-label={colorLabel(color)} disabled={disabled}
        onChange={() => onChange(color)} />
      <span className="color-swatch-face">
        <span className="color-swatch-fill" style={{ backgroundColor: colorValue(color) }} aria-hidden="true" />
      </span>
    </label>)}
  </div>;
}
