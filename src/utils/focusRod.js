import { FOCUS_ROD_LIMITS } from '../config/sceneConfig.js';
import { clamp } from './lightMath.js';

/** Normalized focusing-rod position: 0 = spot (head deep inside), 1 = flood (head out). */
export const focusRodToT = (focusRod) =>
  clamp(focusRod ?? FOCUS_ROD_LIMITS.default, FOCUS_ROD_LIMITS.min, FOCUS_ROD_LIMITS.max) /
  FOCUS_ROD_LIMITS.max;
