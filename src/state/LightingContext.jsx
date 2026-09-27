import { createContext, useContext, useMemo, useReducer } from 'react';
import {
  getCompatibleGels,
  getCompatibleModifiers,
  getModifierById,
  getStrobeById,
  isGelCompatible,
  isGridCompatible,
  isModifierCompatible,
} from '../config/equipmentRegistry.js';
import { DEFAULT_PRESET_ID, getPresetById } from '../config/lightingPresets.js';
import { CAMERA_VIEWS, FOCUS_ROD_LIMITS, PLACEMENT_LIMITS } from '../config/sceneConfig.js';
import { clamp, snapPowerLevel } from '../utils/lightMath.js';

/**
 * A light instance placed in the scene. It only stores catalog *ids*;
 * specs are always resolved from the equipment registry.
 * @typedef {Object} LightInstance
 * @property {string} id
 * @property {string} label
 * @property {string} strobeId
 * @property {string} modifierId
 * @property {string | null} gridId      Grid fitted to the modifier, if any.
 * @property {boolean} innerDiffuser     Inner diffuser fitted (modifiers that offer one).
 * @property {boolean} enabled
 * @property {number} powerLevel         Connect-style scale: 10.0 = full, -1.0 = -1 stop.
 * @property {number} focusRod           Parabolic focusing rod, 0 = spot .. 100 = flood.
 * @property {boolean} colorTempEnabled  false = neutral white, colorTempK is kept.
 * @property {number} colorTempK         Source color temperature (3200K–6500K).
 * @property {boolean} gelEnabled        false = no gel, gelId is kept.
 * @property {string | null} gelId       Selected OCF gel.
 * @property {Placement} placement
 */

/**
 * @typedef {Object} Placement
 * @property {number} azimuthDeg   Orbit around the subject (re-aims).
 * @property {number} elevationDeg
 * @property {number} distance     Orbit radius in meters.
 * @property {number} shiftX       World-space translation in meters (no re-aim).
 * @property {number} shiftY
 * @property {number} shiftZ
 * @property {number} tiltDeg      Aim offsets in degrees (see computeFixturePose).
 * @property {number} panDeg
 * @property {number} rollDeg
 */

let lightIdCounter = 0;
const createLightId = () => `light-${++lightIdCounter}`;

export const DEFAULT_PLACEMENT = Object.freeze({
  azimuthDeg: 30,
  elevationDeg: 20,
  distance: 2,
  shiftX: 0,
  shiftY: 0,
  shiftZ: 0,
  tiltDeg: 0,
  panDeg: 0,
  rollDeg: 0,
});
const DEFAULT_POWER_LEVEL = 7;

/** Clamps every placement field to PLACEMENT_LIMITS; non-numbers fall back to defaults. */
function normalizePlacement(placement) {
  const result = {};
  for (const [key, fallback] of Object.entries(DEFAULT_PLACEMENT)) {
    const value = Number(placement?.[key]);
    const limits = PLACEMENT_LIMITS[key];
    result[key] = Number.isFinite(value) ? clamp(value, limits.min, limits.max) : fallback;
  }
  return result;
}

/**
 * Enforces catalog invariants: modifier fits the strobe, grid/diffuser fit the
 * modifier, gel fits the strobe, and all numeric values are within range.
 */
export function normalizeLight(light) {
  const strobe = getStrobeById(light.strobeId);
  if (!strobe) return light;
  const modifierId = isModifierCompatible(light.strobeId, light.modifierId)
    ? light.modifierId
    : getCompatibleModifiers(light.strobeId)[0]?.id;
  const modifier = getModifierById(modifierId);

  // Gel: keep a compatible selection; enabling without a selection picks the first gel.
  const compatibleGels = getCompatibleGels(light.strobeId);
  let gelId = light.gelId && isGelCompatible(light.strobeId, light.gelId) ? light.gelId : null;
  if (light.gelEnabled && !gelId) gelId = compatibleGels[0]?.id ?? null;

  return {
    ...light,
    modifierId,
    gridId: light.gridId && isGridCompatible(modifierId, light.gridId) ? light.gridId : null,
    innerDiffuser: Boolean(light.innerDiffuser && modifier?.accessories?.innerDiffuser),
    enabled: light.enabled !== false,
    colorTempEnabled: light.colorTempEnabled !== false,
    colorTempK: clamp(
      Number(light.colorTempK) || strobe.colorTempK,
      strobe.colorTempRange.minK,
      strobe.colorTempRange.maxK,
    ),
    gelEnabled: Boolean(light.gelEnabled && gelId),
    gelId,
    powerLevel: snapPowerLevel(Number(light.powerLevel) || DEFAULT_POWER_LEVEL, strobe.powerLevelRange),
    focusRod: clamp(
      Math.round(Number.isFinite(Number(light.focusRod)) ? Number(light.focusRod) : FOCUS_ROD_LIMITS.default),
      FOCUS_ROD_LIMITS.min,
      FOCUS_ROD_LIMITS.max,
    ),
    placement: normalizePlacement(light.placement),
  };
}

/** Builds a valid LightInstance, filling defaults from the strobe spec. */
export function createLightInstance({
  strobeId,
  modifierId,
  gridId = null,
  innerDiffuser = false,
  gelId = null,
  gelEnabled = gelId != null,
  colorTempEnabled = true,
  colorTempK,
  enabled = true,
  label,
  powerLevel = DEFAULT_POWER_LEVEL,
  focusRod = FOCUS_ROD_LIMITS.default,
  placement,
}) {
  const strobe = getStrobeById(strobeId);
  if (!strobe) throw new Error(`Unknown strobe id: "${strobeId}"`);

  return normalizeLight({
    id: createLightId(),
    label: label ?? strobe.name,
    strobeId,
    modifierId,
    gridId,
    innerDiffuser,
    enabled,
    powerLevel,
    focusRod,
    colorTempEnabled,
    colorTempK: colorTempK ?? strobe.colorTempK,
    gelEnabled,
    gelId,
    placement: { ...DEFAULT_PLACEMENT, ...placement },
  });
}

const buildLightsFromPreset = (presetId) =>
  (getPresetById(presetId)?.lights ?? []).map(createLightInstance);

function createInitialState() {
  const lights = buildLightsFromPreset(DEFAULT_PRESET_ID);
  return {
    lights,
    selectedLightId: lights[0]?.id ?? null,
    // View options; fixtures hidden = meshes invisible, light still emitted.
    showFixtures: true,
    // `requestId` changes on every click so re-selecting a view resets the camera.
    cameraView: { id: 'fullBody', requestId: 0 },
  };
}

/** Swapping strobes resets color temperature to the new unit's native value. */
function applyStrobeChange(light, nextStrobeId) {
  const strobe = getStrobeById(nextStrobeId);
  if (!strobe) return light;
  return { ...light, strobeId: nextStrobeId, colorTempK: strobe.colorTempK };
}

const replaceLights = (state, lights) => ({
  ...state,
  lights,
  selectedLightId: lights[0]?.id ?? null,
});

function lightingReducer(state, action) {
  switch (action.type) {
    case 'light/add':
      return {
        ...state,
        lights: [...state.lights, action.light],
        selectedLightId: action.light.id,
      };

    case 'light/update':
      return {
        ...state,
        lights: state.lights.map((light) => {
          if (light.id !== action.id) return light;
          const { strobeId, ...otherChanges } = action.changes;
          const withStrobe =
            strobeId && strobeId !== light.strobeId ? applyStrobeChange(light, strobeId) : light;
          return normalizeLight({ ...withStrobe, ...otherChanges });
        }),
      };

    case 'light/updatePlacement':
      return {
        ...state,
        lights: state.lights.map((light) =>
          light.id === action.id
            ? { ...light, placement: normalizePlacement({ ...light.placement, ...action.changes }) }
            : light,
        ),
      };

    case 'light/remove': {
      const lights = state.lights.filter((light) => light.id !== action.id);
      const selectedLightId =
        state.selectedLightId === action.id ? (lights[0]?.id ?? null) : state.selectedLightId;
      return { ...state, lights, selectedLightId };
    }

    case 'light/select':
      return { ...state, selectedLightId: action.id };

    case 'preset/load':
    case 'setup/import':
      return replaceLights(state, action.lights);

    case 'view/setShowFixtures':
      return { ...state, showFixtures: action.visible };

    case 'view/setCamera':
      return CAMERA_VIEWS[action.viewId]
        ? { ...state, cameraView: { id: action.viewId, requestId: state.cameraView.requestId + 1 } }
        : state;

    default:
      throw new Error(`Unhandled lighting action: ${action.type}`);
  }
}

const LightingStateContext = createContext(null);
const LightingActionsContext = createContext(null);

export function LightingProvider({ children }) {
  const [state, dispatch] = useReducer(lightingReducer, undefined, createInitialState);

  // Stable action creators; ids are generated here so the reducer stays pure.
  const actions = useMemo(
    () => ({
      addLight: (params) => dispatch({ type: 'light/add', light: createLightInstance(params) }),
      updateLight: (id, changes) => dispatch({ type: 'light/update', id, changes }),
      updatePlacement: (id, changes) => dispatch({ type: 'light/updatePlacement', id, changes }),
      removeLight: (id) => dispatch({ type: 'light/remove', id }),
      selectLight: (id) => dispatch({ type: 'light/select', id }),
      setShowFixtures: (visible) => dispatch({ type: 'view/setShowFixtures', visible }),
      setCameraView: (viewId) => dispatch({ type: 'view/setCamera', viewId }),
      loadPreset: (presetId) =>
        dispatch({ type: 'preset/load', lights: buildLightsFromPreset(presetId) }),
      /** Replaces all lights with already-validated instances (see setupSerializer.js). */
      importLights: (lights) => dispatch({ type: 'setup/import', lights }),
    }),
    [],
  );

  return (
    <LightingStateContext.Provider value={state}>
      <LightingActionsContext.Provider value={actions}>{children}</LightingActionsContext.Provider>
    </LightingStateContext.Provider>
  );
}

export function useLightingState() {
  const context = useContext(LightingStateContext);
  if (!context) throw new Error('useLightingState must be used inside <LightingProvider>');
  return context;
}

export function useLightingActions() {
  const context = useContext(LightingActionsContext);
  if (!context) throw new Error('useLightingActions must be used inside <LightingProvider>');
  return context;
}
