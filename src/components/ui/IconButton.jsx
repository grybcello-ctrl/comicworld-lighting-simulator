import { forwardRef } from 'react';

/**
 * Button with a lucide-react icon. `label` is the accessible name and the
 * hover tooltip (full equipment name); `caption` is an optional short text
 * under the icon.
 */
export const IconButton = forwardRef(function IconButton(
  { icon: Icon, label, tooltip, caption, active = false, disabled = false, onClick, className = '', swatch, testId, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`icon-button ${caption ? 'icon-button--captioned' : ''} ${active ? 'icon-button--active' : ''} ${className}`}
      aria-label={label}
      aria-pressed={active}
      data-tooltip={tooltip ?? label}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      {swatch ? (
        <span className="icon-button__swatch" style={{ background: swatch }} aria-hidden="true" />
      ) : (
        Icon && <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
      )}
      {caption && <span className="icon-button__caption">{caption}</span>}
    </button>
  );
});

/** Labelled group of controls inside a bottom-panel row. */
export function RowGroup({ title, children, className = '' }) {
  return (
    <div className={`row-group ${className}`} role="group" aria-label={title}>
      <span className="row-group__title">{title}</span>
      <div className="row-group__items">{children}</div>
    </div>
  );
}
