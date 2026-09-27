/**
 * JSON export / import of the complete lighting setup.
 *
 * File format (version 1):
 * {
 *   "format": "studio-lighting-simulator/setup",
 *   "version": 1,
 *   "exportedAt": "2026-09-27T12:00:00.000Z",
 *   "lights": [ { label, enabled, strobeId, modifierId, gridId, innerDiffuser,
 *                 powerLevel, focusRod, colorTempEnabled, colorTempK,
 *                 gelEnabled, gelId, placement: { ... } } ]
 * }
 * Runtime ids are not exported; they are regenerated on import. Every imported
 * light goes through createLightInstance(), so catalog rules and slider ranges
 * are enforced exactly as for lights created in the UI.
 */
import {
  getGelById,
  getGridById,
  getModifierById,
  getStrobeById,
} from '../config/equipmentRegistry.js';
import { createLightInstance } from './LightingContext.jsx';

export const SETUP_FORMAT = 'studio-lighting-simulator/setup';
export const SETUP_VERSION = 1;

/** Persisted fields, in output order. */
const LIGHT_FIELDS = [
  'label',
  'enabled',
  'strobeId',
  'modifierId',
  'gridId',
  'innerDiffuser',
  'powerLevel',
  'focusRod',
  'colorTempEnabled',
  'colorTempK',
  'gelEnabled',
  'gelId',
  'placement',
];

const pick = (source, keys) => Object.fromEntries(keys.map((key) => [key, source[key]]));

/** @param {import('./LightingContext.jsx').LightInstance[]} lights */
export function serializeSetup(lights, now = new Date()) {
  return {
    format: SETUP_FORMAT,
    version: SETUP_VERSION,
    exportedAt: now.toISOString(),
    lights: lights.map((light) => ({ ...pick(light, LIGHT_FIELDS), placement: { ...light.placement } })),
  };
}

export const setupToJson = (lights, now) => JSON.stringify(serializeSetup(lights, now), null, 2);

/** File name like "lighting-setup-2026-09-27-1430.json" (local time). */
export function setupFileName(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `lighting-setup-${date}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
}

export class SetupImportError extends Error {}

/**
 * Parses and validates a setup file.
 * Unknown strobes skip the light; unknown modifier / grid / gel ids are replaced
 * or dropped by the normal catalog rules. All such changes are reported.
 * @param {string} text
 * @returns {{ lights: import('./LightingContext.jsx').LightInstance[], warnings: string[] }}
 * @throws {SetupImportError} when the file is not a usable setup at all.
 */
export function parseSetup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new SetupImportError(`Not valid JSON: ${error.message}`);
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.lights)) {
    throw new SetupImportError('Missing "lights" array.');
  }

  const warnings = [];
  if (data.format !== SETUP_FORMAT) {
    warnings.push(`Unexpected format "${data.format ?? 'none'}" — trying to import anyway.`);
  }
  if (typeof data.version === 'number' && data.version > SETUP_VERSION) {
    warnings.push(`File version ${data.version} is newer than supported (${SETUP_VERSION}).`);
  }

  const lights = [];
  data.lights.forEach((raw, index) => {
    const name = `Light ${index + 1}${raw?.label ? ` ("${raw.label}")` : ''}`;
    if (!raw || typeof raw !== 'object') {
      warnings.push(`${name}: not an object, skipped.`);
      return;
    }
    if (!getStrobeById(raw.strobeId)) {
      warnings.push(`${name}: unknown strobe "${raw.strobeId}", skipped.`);
      return;
    }
    const light = createLightInstance({
      ...raw,
      label: typeof raw.label === 'string' ? raw.label : undefined,
      gridId: raw.gridId ?? null,
      gelId: raw.gelId ?? null,
      placement: raw.placement && typeof raw.placement === 'object' ? raw.placement : undefined,
    });

    // Report anything the catalog rules had to change.
    if (raw.modifierId !== light.modifierId) {
      const reason = getModifierById(raw.modifierId) ? 'does not fit this strobe' : 'unknown';
      warnings.push(`${name}: modifier "${raw.modifierId}" ${reason}, using "${light.modifierId}".`);
    }
    if (raw.gridId && raw.gridId !== light.gridId) {
      warnings.push(`${name}: grid "${raw.gridId}" ${getGridById(raw.gridId) ? 'does not fit' : 'unknown'}, removed.`);
    }
    if (raw.gelId && raw.gelId !== light.gelId) {
      warnings.push(`${name}: gel "${raw.gelId}" ${getGelById(raw.gelId) ? 'does not fit' : 'unknown'}, removed.`);
    }
    lights.push(light);
  });

  if (lights.length === 0 && data.lights.length > 0) {
    throw new SetupImportError(`No usable lights. ${warnings.join(' ')}`);
  }
  return { lights, warnings };
}
