import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const GAP_PX = 8;
const EDGE_PX = 6;

/**
 * One tooltip for the whole app: any element with a `data-tooltip` attribute
 * shows it on hover or keyboard focus. Rendered in a fixed layer on <body>,
 * so it is never clipped by the bottom panel's horizontally scrolling rows
 * (overflow-x: auto clips vertically as well).
 */
export function TooltipLayer() {
  const [tip, setTip] = useState(null);
  const tipRef = useRef(null);

  useEffect(() => {
    let current = null;
    const showFor = (node) => {
      const element = node instanceof Element ? node.closest('[data-tooltip]') : null;
      if (element === current) return;
      current = element;
      const text = element?.getAttribute('data-tooltip');
      if (!element || !text) {
        setTip(null);
        return;
      }
      setTip({ text, rect: element.getBoundingClientRect() });
    };
    const onOver = (event) => showFor(event.target);
    const onOut = (event) => {
      if (!event.relatedTarget) showFor(null);
    };
    const hide = () => {
      current = null;
      setTip(null);
    };
    // A scrolled row moves the element: follow it (hide once it leaves the window).
    const onScroll = () => {
      if (!current) return;
      const rect = current.getBoundingClientRect();
      if (!current.isConnected || rect.right < 0 || rect.left > window.innerWidth) hide();
      else setTip((tip) => (tip ? { ...tip, rect } : tip));
    };
    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    document.addEventListener('focusin', onOver);
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('focusin', onOver);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('pointerdown', hide);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  // Above the element (below if there is no room), kept inside the window.
  useLayoutEffect(() => {
    const node = tipRef.current;
    if (!node || !tip) return;
    const { width, height } = node.getBoundingClientRect();
    const { rect } = tip;
    const above = rect.top - GAP_PX - height >= EDGE_PX;
    const top = above ? rect.top - GAP_PX - height : rect.bottom + GAP_PX;
    const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, EDGE_PX), window.innerWidth - width - EDGE_PX);
    node.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    node.style.visibility = 'visible';
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div ref={tipRef} className="tooltip" role="tooltip" style={{ visibility: 'hidden' }}>
      {tip.text}
    </div>,
    document.body,
  );
}
