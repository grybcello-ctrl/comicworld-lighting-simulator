/** Derived optics for the camera panel and the viewfinder (same numbers in both). */
import { CAMERA_LIMITS, getBodyById, getLensById } from '../config/cameraConfig.js';
import {
  anglesOfView,
  availableFNumbers,
  blurDiameterMm,
  cocLimitMm,
  cropFactor,
  depthOfField,
  lensState,
  minFocusDistanceM,
} from '../utils/cameraOptics.js';

export function selectCameraOptics(settings) {
  const body = getBodyById(settings.bodyId);
  const lens = getLensById(settings.lensId);
  const { sensor } = body;
  const crop = cropFactor(sensor);
  const optics = lensState({
    focalLengthMm: lens.focalLengthMm,
    fNumber: settings.fNumber,
    focusDistanceM: settings.focusDistanceM,
    sensor,
  });
  const cocMm = cocLimitMm(sensor);
  const dof = depthOfField(optics, cocMm);
  const faceDistanceM = settings.faceDistanceM;
  const faceBlurMm = blurDiameterMm(optics, faceDistanceM);
  const magnification = optics.imageDistanceMm / optics.objectDistanceMm;
  return {
    body,
    lens,
    sensor,
    optics,
    dof,
    cocMm,
    crop,
    fNumbers: availableFNumbers(lens),
    angles: anglesOfView(sensor, lens.focalLengthMm),
    equivalentFocalLengthMm: lens.focalLengthMm * crop,
    equivalentFNumber: settings.fNumber * crop,
    focusRangeM: { min: minFocusDistanceM(lens), max: CAMERA_LIMITS.focusDistanceM.max },
    faceDistanceM,
    faceBlurMm,
    faceInFocus: faceDistanceM >= dof.nearM && faceDistanceM <= dof.farM,
    magnification,
    // Frame size at the focus plane (m).
    fieldWidthM: sensor.widthMm / magnification / 1000,
    fieldHeightM: sensor.heightMm / magnification / 1000,
  };
}

export const formatMeters = (m, digits = 2) => (Number.isFinite(m) ? `${m.toFixed(digits)} m` : '∞');
export const formatFNumber = (n) => `f/${Number.isInteger(n) ? n : n.toFixed(1)}`;
