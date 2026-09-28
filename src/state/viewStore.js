/**
 * Studio environment and visual guides (both modes). A separate store so
 * these settings never touch the lighting reducer, the subject store or the
 * camera settings. None of these objects cast shadows or emit light: the
 * lighting on the subject is identical with every setting.
 */
import { useSyncExternalStore } from 'react';
import {
  ENVIRONMENT_ADJUST_DEFAULTS,
  ENVIRONMENT_ADJUST_LIMITS,
  ENVIRONMENT_DEFAULTS,
} from '../config/environmentConfig.js';

let state = { ...ENVIRONMENT_DEFAULTS, ...ENVIRONMENT_ADJUST_DEFAULTS };
const listeners = new Set();

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getViewState = () => state;
export const useViewState = () => useSyncExternalStore(subscribe, getViewState);

function update(changes) {
  if (Object.keys(changes).every((key) => state[key] === changes[key])) return;
  state = { ...state, ...changes };
  for (const listener of listeners) listener();
}

/** @param {keyof typeof ENVIRONMENT_DEFAULTS} key */
export function setViewToggle(key, value) {
  if (key in ENVIRONMENT_DEFAULTS) update({ [key]: Boolean(value) });
}

/** Numeric adjustment, clamped to its slider range. @param {keyof typeof ENVIRONMENT_ADJUST_DEFAULTS} key */
export function setViewValue(key, value) {
  const limits = ENVIRONMENT_ADJUST_LIMITS[key];
  if (!limits || !Number.isFinite(value)) return;
  update({ [key]: Math.min(Math.max(value, limits.min), limits.max) });
}

export function resetBokehOffset() {
  const { bokehOffsetX, bokehOffsetY, bokehOffsetZ } = ENVIRONMENT_ADJUST_DEFAULTS;
  update({ bokehOffsetX, bokehOffsetY, bokehOffsetZ });
}
