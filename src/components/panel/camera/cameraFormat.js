/** Shared camera-mode text helpers (bottom panel rows, details popover, HUD). */
import { FOCUS_MODES } from '../../../config/cameraConfig.js';
import { cameraPose } from '../../../utils/cameraOptics.js';

export const FOCUS_MODE_LABELS = {
  [FOCUS_MODES.AF_EYE]: 'AF-Eye',
  [FOCUS_MODES.AF_FACE]: 'AF-Face',
  [FOCUS_MODES.MANUAL]: 'MF',
};

export function focusStatus(distanceM, inFocus, focusDistanceM) {
  const offsetM = distanceM - focusDistanceM;
  if (inFocus) return `In focus ✓ (${offsetM >= 0 ? '+' : '−'}${Math.abs(offsetM * 1000).toFixed(0)} mm)`;
  return `${offsetM > 0 ? 'Behind' : 'In front of'} the DoF (${Math.abs(offsetM * 100).toFixed(1)} cm from focus)`;
}

/** Straight-line distance camera.position → point (the axial one is what focuses). */
export function lineOfSightM(settings, point) {
  if (!point) return null;
  const { position } = cameraPose(settings);
  return Math.hypot(...point.map((v, i) => v - position[i]));
}
