import { ChevronRight } from 'lucide-react';
import { useId } from 'react';

/**
 * Lightroom-style collapsible panel section. Clicking the header toggles the
 * body, which animates its height (CSS grid rows 0fr ↔ 1fr). The body stays
 * mounted while closed (state is kept) but is `inert`, so nothing inside can
 * be focused or clicked.
 *
 * `headerExtra` renders to the right of the title (e.g. a power readout) and
 * is not part of the toggle button.
 */
export function Accordion({ title, subtitle, open, onToggle, icon: Icon, leading, headerExtra, children, testId, className = '' }) {
  const bodyId = useId();
  return (
    <section className={`accordion ${open ? 'accordion--open' : ''} ${className}`} data-testid={testId}>
      <div className="accordion__header">
        <button type="button" className="accordion__toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          <ChevronRight size={14} className="accordion__chevron" aria-hidden="true" />
          {leading}
          {Icon && <Icon size={15} aria-hidden="true" className="accordion__icon" />}
          <span className="accordion__titles">
            <span className="accordion__title">{title}</span>
            {subtitle && <span className="accordion__subtitle">{subtitle}</span>}
          </span>
        </button>
        {headerExtra && <div className="accordion__extra">{headerExtra}</div>}
      </div>
      <div id={bodyId} className="accordion__body" inert={!open} aria-hidden={!open}>
        <div className="accordion__content">{children}</div>
      </div>
    </section>
  );
}
