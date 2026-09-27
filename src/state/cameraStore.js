/**
 * App mode ('lighting' | 'camera') and the photo-camera settings.
 *
 * A separate external store (useSyncExternalStore), not part of
 * LightingContext: switching modes or moving the camera never touches the
 * lighting reducer, the subject store or the scene graph, so lights, the
 * loaded model, shadow maps and the parabolic calculations are never reset
 * or recomputed. Setup JSON files stay lighting-only.
 */
import { useSyncExternalStore } from 'react';
import { SUBJECT_TARGET } from '../config/sceneConfig.js';
import {
  APP_MODES,
  CAMERA_DEFAULTS,
  CAMERA_LIMITS,
  CAMERA_OPTICS_CONFIG,
  FOCUS_MODES,
  getBodyById,
  getLensById,
} from '../config/cameraConfig.js';
import { axialDistanceM, cameraPose, clampFocusDistanceM, snapFNumber } from '../utils/cameraOptics.js';

const clamp = (value, { min, max }) => Math.min(Math.max(value, min), max);

/** Face surface estimate used until the scene measures the subject (AF ray). */
const ESTIMATED_FACE_POINT = Object.freeze([
  SUBJECT_TARGET[0],
  SUBJECT_TARGET[1],
  SUBJECT_TARGET[2] + CAMERA_OPTICS_CONFIG.faceSurfaceOffsetM,
]);

/** Derived values: face distance for the current pose, and the AF/MF focus distance. */
function withDerived(next) {
  const lens = getLensById(next.lensId);
  const faceDistanceM = axialDistanceM(cameraPose(next), next.facePoint ?? ESTIMATED_FACE_POINT);
  // AF drives the focus distance; MF keeps the slider value (clamped to the lens).
  const wanted = next.focusMode === FOCUS_MODES.AF ? faceDistanceM : next.focusDistanceM;
  return {
    ...next,
    faceDistanceM,
    focusDistanceM: clampFocusDistanceM(lens, wanted, CAMERA_LIMITS.focusDistanceM.max),
  };
}

let state = withDerived({
  appMode: APP_MODES.LIGHTING,
  ...CAMERA_DEFAULTS,
  focusMode: FOCUS_MODES.AF,
  focusDistanceM: CAMERA_DEFAULTS.shootingDistanceM,
  // World point of the face surface, measured once per subject by a ray from
  // the front (CameraPostFX). The camera always sits on the +z axis, so the
  // face distance for any pose is an axial projection, no raycast per drag.
  facePoint: null,
  // Derived: axial distance (m, from the focal plane) of the face.
  faceDistanceM: 0,
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

export const cameraActions = {
  setAppMode(appMode) {
    if (Object.values(APP_MODES).includes(appMode)) setState({ appMode });
  },
  setBody(bodyId) {
    setState({ bodyId: getBodyById(bodyId).id });
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
  /** Written by the scene (AF ray against the subject); null = use the estimate. */
  reportFacePoint(point) {
    const valid = Array.isArray(point) && point.length === 3 && point.every(Number.isFinite);
    const facePoint = valid ? point : null;
    const same = facePoint && state.facePoint && facePoint.every((v, i) => Math.abs(v - state.facePoint[i]) < 1e-6);
    if (!same) setState({ facePoint });
  },
};
