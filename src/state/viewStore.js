/**
 * Studio environment and visual guides (both modes). A separate store so
 * these toggles never touch the lighting reducer, the subject store or the
 * camera settings. None of these objects cast shadows or emit light: the
 * lighting on the subject is identical with every toggle on or off.
 */
import { useSyncExternalStore } from 'react';
import { ENVIRONMENT_DEFAULTS } from '../config/environmentConfig.js';

let state = { ...ENVIRONMENT_DEFAULTS };
const listeners = new Set();

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getViewState = () => state;
export const useViewState = () => useSyncExternalStore(subscribe, getViewState);

/** @param {keyof typeof ENVIRONMENT_DEFAULTS} key */
export function setViewToggle(key, value) {
  if (!(key in ENVIRONMENT_DEFAULTS) || state[key] === Boolean(value)) return;
  state = { ...state, [key]: Boolean(value) };
  for (const listener of listeners) listener();
}
