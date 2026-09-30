/**
 * Pure UI state of the Lightroom-style layout: which accordion sections are
 * open and whether the side panels are shown. Kept apart from the lighting,
 * camera and view stores so layout changes can never affect the scene.
 */
import { useSyncExternalStore } from 'react';

const NARROW_WINDOW_PX = 1100;

let state = {
  // Section id → open. Missing ids use the section's own default.
  open: {},
  // Narrow windows start with the info panel hidden (the controls matter most).
  showLeft: typeof window === 'undefined' || window.innerWidth >= NARROW_WINDOW_PX,
  showRight: true,
};
const listeners = new Set();
let selectionFromAccordion = null;

function setState(changes) {
  state = { ...state, ...changes };
  for (const listener of listeners) listener();
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getPanelState = () => state;
export const usePanelState = () => useSyncExternalStore(subscribe, getPanelState);

export const isSectionOpen = (id, fallback = false) => state.open[id] ?? fallback;

export const panelActions = {
  toggleSection(id, fallback = false) {
    setState({ open: { ...state.open, [id]: !isSectionOpen(id, fallback) } });
  },
  openSection(id) {
    if (state.open[id] !== true) setState({ open: { ...state.open, [id]: true } });
  },
  /**
   * A light accordion header was clicked: it toggles itself and selects its
   * light. Remembered so the "open the selected light" effect does not
   * immediately re-open an accordion the user just closed.
   */
  noteSelectionFromAccordion(lightId) {
    selectionFromAccordion = lightId;
  },
  /** True once for a selection that came from an accordion header. */
  consumeSelectionFromAccordion(lightId) {
    const fromAccordion = selectionFromAccordion === lightId;
    selectionFromAccordion = null;
    return fromAccordion;
  },
  toggleLeft() {
    setState({ showLeft: !state.showLeft });
  },
  toggleRight() {
    setState({ showRight: !state.showRight });
  },
};
