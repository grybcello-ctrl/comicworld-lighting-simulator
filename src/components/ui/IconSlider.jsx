/**
 * Icon + slider + value on one line (right panel). The icon replaces the
 * text label; the full name is the slider's accessible name and the hover
 * tooltip. Double-clicking the icon resets to `defaultValue` (like
 * double-clicking a Lightroom slider label).
 */
export function IconSlider({
  icon: Icon,
  label,
  tooltip,
  value,
  min,
  max,
  step,
  onChange,
  formatValue = String,
  disabled = false,
  defaultValue,
  accent,
}) {
  const canReset = defaultValue !== undefined && !disabled && value !== defaultValue;
  return (
    <div className={`icon-slider ${disabled ? 'icon-slider--disabled' : ''}`} data-tooltip={tooltip ?? label}>
      <span
        className={`icon-slider__icon ${canReset ? 'icon-slider__icon--resettable' : ''}`}
        onDoubleClick={canReset ? () => onChange(defaultValue) : undefined}
        aria-hidden="true"
      >
        {Icon && <Icon size={15} strokeWidth={1.8} />}
      </span>
      <input
        type="range"
        className="icon-slider__range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        style={accent ? { accentColor: accent } : undefined}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="icon-slider__value">{formatValue(value)}</span>
    </div>
  );
}

/** Row of selectable chips (modifiers, gels, grids, bodies, lenses). */
export function ChipGroup({ label, children }) {
  return (
    <div className="chip-group" role="group" aria-label={label}>
      {children}
    </div>
  );
}

/** Small selectable chip; `swatch` shows a color dot (gels), `icon` a lucide icon. */
export function Chip({ label, tooltip, active = false, disabled = false, onClick, icon: Icon, swatch, testId }) {
  return (
    <button
      type="button"
      className={`chip ${active ? 'chip--active' : ''}`}
      aria-pressed={active}
      disabled={disabled}
      data-tooltip={tooltip}
      data-testid={testId}
      onClick={onClick}
    >
      {swatch && <span className="chip__swatch" style={{ background: swatch }} aria-hidden="true" />}
      {Icon && <Icon size={13} aria-hidden="true" />}
      <span>{label}</span>
    </button>
  );
}
