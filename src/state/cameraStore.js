/**
 * App mode ('lighting' | 'camera') and the photo-camera settings.
 *
 * A separate external store (useSyncExternalStore), not part of
 * LightingContext: switching modes or moving the camera never touches the
 * lighting reducer, the subject store or the scene graph, so lights, the
 * loaded model, shadow maps and the parabolic calculations are never reset
 * or recomputed. Setup JSON files stay lighting-only.
 *
 * Focus distances follow the depth-of-field pass: they are measured from
 * camera.position (the focal plane) ALONG the optical axis. The depth buffer
 * and a real lens both focus on a plane, so an off-center target at
 * straight-line distance d sits at the axial distance d·cos(angle off axis).
 */
import { useSyncExternalStore } from 'react';
import { SUBJECT_TARGET } from '../config/sceneConfig.js';
import {
  APP_MODES,
  CAMERA_DEFAULTS,
  CAMERA_LIMITS,
  CAMERA_OPTICS_CONFIG,
  FOCUS_MODES,
  getAspectById,
  getBodyById,
  getLensById,
} from '../config/cameraConfig.js';
import { axialDistanceM, cameraPose, clampFocusDistanceM, snapFNumber } from '../utils/cameraOptics.js';

const clamp = (value, { min, max }) => Math.min(Math.max(value, min), max);

/** Face surface estimate used until the scene measures the subject (AF rays). */
const ESTIMATED_FACE_POINT = Object.freeze([
  SUBJECT_TARGET[0],
  SUBJECT_TARGET[1],
  SUBJECT_TARGET[2] + CAMERA_OPTICS_CONFIG.faceSurfaceOffsetM,
]);

const isPoint = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const samePoint = (a, b) => (a === null && b === null) || (a && b && a.every((v, i) => Math.abs(v - b[i]) < 1e-6));

/** Point on the optical axis at `distanceM` from the camera (the MF focus point). */
function axisPoint(pose, distanceM) {
  const [px, py, pz] = pose.position;
  const direction = pose.target.map((t, i) => t - pose.position[i]);
  const length = Math.hypot(...direction) || 1;
  return [px, py, pz].map((p, i) => p + (direction[i] / length) * distanceM);
}

/** Derived values: target distances for the current pose, the focus distance and its world point. */
function withDerived(next) {
  const lens = getLensById(next.lensId);
  const pose = cameraPose(next);
  const facePoint = next.facePoint ?? ESTIMATED_FACE_POINT;
  const eyePoint = next.eyeTarget?.point ?? facePoint;
  const faceDistanceM = axialDistanceM(pose, facePoint);
  const eyeDistanceM = axialDistanceM(pose, eyePoint);
  // AF drives the focus distance; MF keeps the slider value (clamped to the lens).
  const wanted =
    next.focusMode === FOCUS_MODES.AF_EYE
      ? eyeDistanceM
      : next.focusMode === FOCUS_MODES.AF_FACE
        ? faceDistanceM
        : next.focusDistanceM;
  const focusDistanceM = clampFocusDistanceM(lens, wanted, CAMERA_LIMITS.focusDistanceM.max);
  const afTargetPoint =
    next.focusMode === FOCUS_MODES.AF_EYE
      ? eyePoint
      : next.focusMode === FOCUS_MODES.AF_FACE
        ? facePoint
        : axisPoint(pose, focusDistanceM);
  return {
    ...next,
    faceDistanceM,
    eyeDistanceM,
    focusDistanceM,
    // Keep the array identity while the point is unchanged (fewer re-renders).
    afTargetPoint: samePoint(afTargetPoint, next.afTargetPoint) ? next.afTargetPoint : afTargetPoint,
  };
}

let state = withDerived({
  appMode: APP_MODES.LIGHTING,
  ...CAMERA_DEFAULTS,
  focusMode: FOCUS_MODES.AF_EYE,
  focusDistanceM: CAMERA_DEFAULTS.shootingDistanceM,
  // Measured once per subject (AutofocusTargets.jsx). The camera always sits on
  // the +z axis, so any pose gets its distances by axial projection — no
  // raycast per slider move.
  facePoint: null,
  // { point, source, label, detail } from utils/eyeAutofocus.js, or null.
  eyeTarget: null,
  // Derived (withDerived).
  faceDistanceM: 0,
  eyeDistanceM: 0,
  afTargetPoint: null,
});
const listeners = new Set();

function setState(changes) {
  const next = withDerived({ ...state, ...changes });
  if (Object.keys(next).every((key) => next[key] === state[key])) return;
  state = next;
  for (const listener of listeners) listener();
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getCameraState = () => state;

/** Full camera state (panel, viewfinder, post-processing). */
export const useCameraState = () => useSyncExternalStore(subscribe, getCameraState);

/** Only the mode: components that don't care about camera settings don't re-render. */
const getAppMode = () => state.appMode;
export const useAppMode = () => useSyncExternalStore(subscribe, getAppMode);

/** Only the AF target point (the marker re-renders when it moves, nothing else). */
const getAfTargetPoint = () => state.afTargetPoint;
export const useAfTargetPoint = () => useSyncExternalStore(subscribe, getAfTargetPoint);

export const cameraActions = {
  setAppMode(appMode) {
    if (Object.values(APP_MODES).includes(appMode)) setState({ appMode });
  },
  setBody(bodyId) {
    setState({ bodyId: getBodyById(bodyId).id });
  },
  /** Output aspect ratio (a crop of the sensor), e.g. '2:3'. */
  setAspect(aspectId) {
    setState({ aspectId: getAspectById(aspectId).id });
  },
  /** Landscape ↔ portrait: swaps the ratio's width and height (2:3 ↔ 3:2). */
  toggleAspectOrientation() {
    setState({ aspectFlipped: !state.aspectFlipped });
  },
  /** A new lens keeps the aperture if it can, else snaps to the nearest offered stop. */
  setLens(lensId) {
    const lens = getLensById(lensId);
    setState({ lensId: lens.id, fNumber: snapFNumber(lens, state.fNumber) });
  },
  setFNumber(fNumber) {
    setState({ fNumber: snapFNumber(getLensById(state.lensId), fNumber) });
  },
  /** Moving the focus slider switches to manual focus. */
  setFocusDistance(focusDistanceM) {
    setState({ focusMode: FOCUS_MODES.MANUAL, focusDistanceM });
  },
  setFocusMode(focusMode) {
    if (Object.values(FOCUS_MODES).includes(focusMode)) setState({ focusMode });
  },
  setShootingDistance(value) {
    setState({ shootingDistanceM: clamp(value, CAMERA_LIMITS.shootingDistanceM) });
  },
  setCameraHeight(value) {
    setState({ cameraHeightM: clamp(value, CAMERA_LIMITS.cameraHeightM) });
  },
  setAimHeight(value) {
    setState({ aimHeightM: clamp(value, CAMERA_LIMITS.aimHeightM) });
  },
  /**
   * Written by the scene once per subject. `facePoint`: world point or null
   * (estimate). `eyeTarget`: result of findEyeTarget or null (face point used).
   */
  reportAfTargets({ facePoint, eyeTarget }) {
    const face = isPoint(facePoint) ? facePoint : null;
    const eye = eyeTarget && isPoint(eyeTarget.point) ? eyeTarget : null;
    const sameEye =
      (eye === null && state.eyeTarget === null) ||
      (eye && state.eyeTarget && samePoint(eye.point, state.eyeTarget.point) && eye.label === state.eyeTarget.label);
    if (samePoint(face, state.facePoint) && sameEye) return;
    setState({ facePoint: face, eyeTarget: eye });
  },
};
