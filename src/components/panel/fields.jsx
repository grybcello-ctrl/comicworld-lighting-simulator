/** Small, reusable form controls for the control panel. */

/**
 * Range slider with a label/value row. `compact` (bottom panel rows): fixed
 * width, the hint moves into the hover tooltip so the row keeps one height.
 */
export function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  formatValue = String,
  hint,
  disabled = false,
  compact = false,
  tooltip,
}) {
  const tip = tooltip ?? (compact && hint ? `${label} — ${hint}` : undefined);
  return (
    <label
      className={`field ${compact ? 'field--compact' : ''} ${disabled ? 'field--disabled' : ''}`}
      data-tooltip={tip}
    >
      <span className="field__row">
        <span className="field__label">{label}</span>
        <span className="field__value">{formatValue(value)}</span>
      </span>
      {hint && !compact && <span className="field__hint">{hint}</span>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

/**
 * Checkbox toggle. With `icon` it renders as a pill ("toggle chip") for the
 * bottom panel's option row; the checkbox stays the accessible control.
 */
export function ToggleField({ label, checked, onChange, disabled = false, title, icon: Icon, className = '' }) {
  return (
    <label
      className={`toggle ${Icon ? 'toggle-chip' : ''} ${checked ? 'toggle--checked' : ''} ${disabled ? 'toggle--disabled' : ''} ${className}`}
      data-tooltip={title}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {Icon && <Icon size={15} aria-hidden="true" />}
      <span>{label}</span>
    </label>
  );
}

/** Read-only key/value list, e.g. computed beam parameters. */
export function ReadoutList({ items }) {
  return (
    <dl className="readout">
      {items.map(({ label, value }) => (
        <div key={label} className="readout__row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Small color chip for previews. */
export function ColorSwatch({ color }) {
  return <span className="color-swatch" style={{ background: color }} aria-hidden="true" />;
}
