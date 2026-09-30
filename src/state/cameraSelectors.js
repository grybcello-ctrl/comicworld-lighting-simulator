/** Derived optics for the camera panel and the viewfinder (same numbers in both). */
import { CAMERA_LIMITS, getAspectById, getBodyById, getLensById } from '../config/cameraConfig.js';
import {
  anglesOfView,
  availableFNumbers,
  blurDiameterMm,
  cocLimitMm,
  cropFactor,
  cropFrame,
  depthOfField,
  lensState,
  minFocusDistanceM,
} from '../utils/cameraOptics.js';

/**
 * Image frame of the current aspect setting (mm), with its ratio label.
 * The 4:3 default is the full sensor, so nothing changes until a crop is chosen.
 */
export function selectCameraFrame(settings) {
  const body = getBodyById(settings.bodyId);
  const aspect = getAspectById(settings.aspectId);
  const [w, h] = settings.aspectFlipped ? [aspect.height, aspect.width] : [aspect.width, aspect.height];
  return { ...cropFrame(body.sensor, w / h), label: `${w}:${h}`, aspectId: aspect.id, flipped: Boolean(settings.aspectFlipped) };
}

export function selectCameraOptics(settings) {
  const body = getBodyById(settings.bodyId);
  const lens = getLensById(settings.lensId);
  const { sensor } = body;
  // Angles, equivalents, blur shares and the DoF criterion follow the image
  // frame (a crop has a smaller diagonal, i.e. a larger enlargement).
  const frame = selectCameraFrame(settings);
  const crop = cropFactor(frame);
  const optics = lensState({
    focalLengthMm: lens.focalLengthMm,
    fNumber: settings.fNumber,
    focusDistanceM: settings.focusDistanceM,
    sensor: frame,
  });
  const cocMm = cocLimitMm(frame);
  const dof = depthOfField(optics, cocMm);
  const { faceDistanceM, eyeDistanceM } = settings;
  const faceBlurMm = blurDiameterMm(optics, faceDistanceM);
  const eyeBlurMm = blurDiameterMm(optics, eyeDistanceM);
  const inFocus = (distanceM) => distanceM >= dof.nearM && distanceM <= dof.farM;
  const magnification = optics.imageDistanceMm / optics.objectDistanceMm;
  return {
    body,
    lens,
    sensor,
    frame,
    optics,
    dof,
    cocMm,
    crop,
    fNumbers: availableFNumbers(lens),
    angles: anglesOfView(frame, lens.focalLengthMm),
    equivalentFocalLengthMm: lens.focalLengthMm * crop,
    equivalentFNumber: settings.fNumber * crop,
    focusRangeM: { min: minFocusDistanceM(lens), max: CAMERA_LIMITS.focusDistanceM.max },
    faceDistanceM,
    faceBlurMm,
    faceInFocus: inFocus(faceDistanceM),
    eyeDistanceM,
    eyeBlurMm,
    eyeInFocus: inFocus(eyeDistanceM),
    magnification,
    // Frame size at the focus plane (m).
    fieldWidthM: frame.widthMm / magnification / 1000,
    fieldHeightM: frame.heightMm / magnification / 1000,
  };
}

export const formatMeters = (m, digits = 2) => (Number.isFinite(m) ? `${m.toFixed(digits)} m` : '∞');
export const formatFNumber = (n) => `f/${Number.isInteger(n) ? n : n.toFixed(1)}`;
