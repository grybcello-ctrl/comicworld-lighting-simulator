/**
 * Text of the screenshot HUD: camera, focus and every light that is on.
 * Pure data (lines + styles); drawn by utils/screenshotExport.js.
 */
import { APP_MODES, FOCUS_MODES } from '../config/cameraConfig.js';
import { getGridById, getModifierById, getStrobeById } from '../config/equipmentRegistry.js';
import { SUBJECT_TYPES } from '../config/sceneConfig.js';
import { formatFNumber, formatMeters } from '../state/cameraSelectors.js';
import { getLightColorInputs, selectFixturePose, selectLightColor } from '../state/lightSelectors.js';
import { formatPowerLevel, formatWs, powerLevelToWs } from './lightMath.js';

const FOCUS_MODE_LABELS = {
  [FOCUS_MODES.AF_EYE]: 'AF-Eye',
  [FOCUS_MODES.AF_FACE]: 'AF-Face',
  [FOCUS_MODES.MANUAL]: 'MF',
};

const pad = (n) => String(n).padStart(2, '0');
export const formatTimestamp = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
// HUD text uses only glyphs every system font has (no ≈ → −): it is drawn on a canvas.
const signed = (value, digits = 2) => `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(digits)}`;

function lightLines(light) {
  const strobe = getStrobeById(light.strobeId);
  const modifier = getModifierById(light.modifierId);
  const grid = getGridById(light.gridId);
  const pose = selectFixturePose(light);
  const color = selectLightColor(light);
  const { kelvin, gel } = getLightColorInputs(light);
  const { azimuthDeg, elevationDeg, distance, shiftX, shiftY, shiftZ, tiltDeg, panDeg, rollDeg } = light.placement;
  const equipment = [strobe?.name, modifier?.name, grid?.name, light.innerDiffuser ? 'inner diffuser' : null]
    .filter(Boolean)
    .join(' + ');
  const colorText = [kelvin ? `${kelvin} K` : 'neutral white', gel ? `gel ${gel.name}` : null].filter(Boolean).join(' · ');
  const offsets = [
    shiftX || shiftY || shiftZ ? `shift ${signed(shiftX)} / ${signed(shiftY)} / ${signed(shiftZ)} m` : null,
    tiltDeg || panDeg || rollDeg ? `tilt ${tiltDeg}° pan ${panDeg}° roll ${rollDeg}°` : null,
  ].filter(Boolean);
  const [x, y, z] = pose.position;
  return [
    { text: `${light.label} — ${equipment}`, style: 'item', swatch: color.displayHex },
    {
      text: `Power ${formatPowerLevel(light.powerLevel)} (${strobe ? formatWs(powerLevelToWs(strobe.maxWs, light.powerLevel)) : '—'}) · ${colorText}`,
      style: 'detail',
    },
    {
      text: `Az ${azimuthDeg}° · El ${elevationDeg}° · ${distance.toFixed(2)} m, XYZ (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) m${offsets.length ? ` · ${offsets.join(' · ')}` : ''}`,
      style: 'detail',
    },
  ];
}

/**
 * @param {{ appMode: string, lights: Object[], subject: Object, camera: Object,
 *   optics: ReturnType<import('../state/cameraSelectors.js').selectCameraOptics>,
 *   orbitFovDeg: number, date: Date }} input
 * @returns {{ title: string, lines: { text: string, style: string, swatch?: string }[] }}
 */
export function buildSetupHud({ appMode, lights, subject, camera, optics, orbitFovDeg, date }) {
  const { body, lens, angles, dof } = optics;
  const isCameraView = appMode === APP_MODES.CAMERA;
  const subjectName =
    subject.subjectType === SUBJECT_TYPES.CUSTOM && subject.model.info
      ? subject.model.info.fileName
      : 'Mannequin (1.725 m)';
  const target =
    camera.focusMode === FOCUS_MODES.AF_EYE && camera.eyeTarget ? ` · ${camera.eyeTarget.label}` : '';
  const enabled = lights.filter((light) => light.enabled);

  const lines = [
    { text: `${formatTimestamp(date)} · ${isCameraView ? 'Camera view' : 'Lighting view'} · Subject: ${subjectName}`, style: 'muted' },
    { text: 'Camera', style: 'heading' },
    { text: `${body.name} · ${lens.name}`, style: 'item' },
    {
      text: `${lens.focalLengthMm} mm (~${Math.round(optics.equivalentFocalLengthMm)} mm FF) · AoV ${angles.horizontalDeg.toFixed(1)}° × ${angles.verticalDeg.toFixed(1)}° (diag. ${angles.diagonalDeg.toFixed(1)}°)`,
      style: 'detail',
    },
    {
      text: `${formatFNumber(camera.fNumber)} · ${FOCUS_MODE_LABELS[camera.focusMode]} ${formatMeters(camera.focusDistanceM)}${target}`,
      style: 'detail',
    },
    {
      text: `DoF ${formatMeters(dof.nearM)} – ${formatMeters(dof.farM)} · camera z ${formatMeters(camera.shootingDistanceM)}, height ${formatMeters(camera.cameraHeightM)}, aim ${formatMeters(camera.aimHeightM)}`,
      style: 'detail',
    },
  ];
  if (!isCameraView) {
    lines.push({ text: `This image: orbit view, vertical FOV ${orbitFovDeg.toFixed(0)}° (no depth of field)`, style: 'detail' });
  }
  lines.push({ text: `Lights on: ${enabled.length} of ${lights.length}`, style: 'heading' });
  if (enabled.length === 0) lines.push({ text: 'No light is on.', style: 'detail' });
  for (const light of enabled) lines.push(...lightLines(light));

  return { title: 'Studio Lighting Simulator — setup', lines };
}
