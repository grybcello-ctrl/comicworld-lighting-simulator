import { X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const EDGE_PX = 8;

/**
 * Detail panel that opens above its anchor button (readouts that do not fit
 * a one-line row). Rendered on <body> so the scrolling rows cannot clip it.
 * Closes on Escape, the close button, or a pointer press outside.
 */
export function Popover({ anchorRef, open, onClose, title, width = 560, children, testId }) {
  const panelRef = useRef(null);
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const place = () => {
      const rect = anchorRef.current.getBoundingClientRect();
      const panelWidth = Math.min(width, window.innerWidth - 2 * EDGE_PX);
      setPosition({
        left: Math.min(Math.max(rect.left, EDGE_PX), window.innerWidth - panelWidth - EDGE_PX),
        bottom: window.innerHeight - rect.top + EDGE_PX,
        width: panelWidth,
        maxHeight: Math.max(rect.top - 2 * EDGE_PX, 160),
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, anchorRef, width]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointer = (event) => {
      if (panelRef.current?.contains(event.target) || anchorRef.current?.contains(event.target)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !position) return null;
  return createPortal(
    <div
      ref={panelRef}
      className="popover"
      role="dialog"
      aria-label={title}
      data-testid={testId}
      style={{ left: position.left, bottom: position.bottom, width: position.width, maxHeight: position.maxHeight }}
    >
      <header className="popover__header">
        <strong>{title}</strong>
        <button type="button" className="icon-button icon-button--plain" aria-label="Close" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <div className="popover__body">{children}</div>
    </div>,
    document.body,
  );
}

/** Open/close state plus the anchor ref for a Popover. */
export function usePopover() {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((value) => !value), []);
  const close = useCallback(() => setOpen(false), []);
  return { anchorRef, open, toggle, close };
}
