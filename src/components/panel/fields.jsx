/** Small, reusable form controls for the control panel. */

/**
 * Checkbox toggle. With `icon` it renders as a pill ("toggle chip"); the
 * checkbox stays the accessible control.
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
