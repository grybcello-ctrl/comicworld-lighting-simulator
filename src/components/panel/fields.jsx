/** Small, reusable form controls for the control panel. */

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
}) {
  return (
    <label className={`field ${disabled ? 'field--disabled' : ''}`}>
      <span className="field__row">
        <span className="field__label">{label}</span>
        <span className="field__value">{formatValue(value)}</span>
      </span>
      {hint && <span className="field__hint">{hint}</span>}
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
 * Select with optional grouping.
 * @param {{ key: string, label: string, items: { id: string, name: string }[] }[]} groups
 */
export function GroupedSelectField({ label, value, groups, onChange, disabled = false }) {
  return (
    <label className={`field ${disabled ? 'field--disabled' : ''}`}>
      <span className="field__label">{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {groups.map((group) => (
          <optgroup key={group.key} label={group.label}>
            {group.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

export function ToggleField({ label, checked, onChange, disabled = false, title }) {
  return (
    <label className={`toggle ${disabled ? 'toggle--disabled' : ''}`} title={title}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

/**
 * Section heading with an on/off checkbox, e.g. "Color temperature [x]".
 * Children are rendered (disabled) even when off, so values stay visible.
 */
export function ToggleSection({ label, checked, onChange, disabled = false, hint, children }) {
  return (
    <div className={`toggle-section ${checked ? 'toggle-section--on' : ''}`}>
      <ToggleField label={label} checked={checked} onChange={onChange} disabled={disabled} />
      {hint && <span className="field__hint">{hint}</span>}
      {children}
    </div>
  );
}

/**
 * Flat select. `null` option values are represented as an empty string.
 * @param {{ value: string | null, label: string }[]} options
 */
export function SelectField({ label, value, options, onChange }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
        {options.map((option) => (
          <option key={option.value ?? ''} value={option.value ?? ''}>
            {option.label}
          </option>
        ))}
      </select>
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
