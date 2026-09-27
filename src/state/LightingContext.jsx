import { createContext, useContext, useMemo, useReducer } from 'react';
import {
  getCompatibleModifiers,
  getStrobeById,
  isGelCompatible,
  isGridCompatible,
  isModifierCompatible,
} from '../config/equipmentRegistry.js';
import { DEFAULT_PRESET_ID, getPresetById } from '../config/lightingPresets.js';
import { FOCUS_ROD_LIMITS } from '../config/sceneConfig.js';
import { clamp, snapPowerLevel } from '../utils/lightMath.js';

/**
 * A light instance placed in the scene. It only stores catalog *ids*;
 * specs are always resolved from the equipment registry.
 * @typedef {Object} LightInstance
 * @property {string} id
 * @property {string} label
 * @property {string} strobeId
 * @property {string} modifierId
 * @property {string | null} gridId  Grid fitted to the modifier, if any.
 * @property {string | null} gelId   Color gel on the strobe head, if any.
 * @property {boolean} enabled
 * @property {number} powerLevel     Connect-style scale: 10.0 = full, -1.0 = -1 stop.
 * @property {number} focusRod       Parabolic focusing rod, 0 = spot .. 100 = flood.
 * @property {number} colorTempK     Source color temperature (3200K–6500K).
 * @property {{ azimuthDeg: number, elevationDeg: number, distance: number }} placement
 */

let lightIdCounter = 0;
const createLightId = () => `light-${++lightIdCounter}`;

const DEFAULT_PLACEMENT = { azimuthDeg: 30, elevationDeg: 20, distance: 2 };
const DEFAULT_POWER_LEVEL = 7;

/**
 * Enforces catalog invariants: modifier fits the strobe, grid fits the
 * modifier, gel fits the strobe, and all numeric values are within range.
 */
function normalizeLight(light) {
  const strobe = getStrobeById(light.strobeId);
  if (!strobe) return light;
  const modifierId = isModifierCompatible(light.strobeId, light.modifierId)
    ? light.modifierId
    : getCompatibleModifiers(light.strobeId)[0]?.id;
  return {
    ...light,
    modifierId,
    gridId: light.gridId && isGridCompatible(modifierId, light.gridId) ? light.gridId : null,
    gelId: light.gelId && isGelCompatible(light.strobeId, light.gelId) ? light.gelId : null,
    colorTempK: clamp(light.colorTempK, strobe.colorTempRange.minK, strobe.colorTempRange.maxK),
    powerLevel: snapPowerLevel(light.powerLevel, strobe.powerLevelRange),
    focusRod: clamp(Math.round(light.focusRod), FOCUS_ROD_LIMITS.min, FOCUS_ROD_LIMITS.max),
  };
}

/** Builds a valid LightInstance, filling defaults from the strobe spec. */
export function createLightInstance({
  strobeId,
  modifierId,
  gridId = null,
  gelId = null,
  colorTempK,
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
    gelId,
    enabled: true,
    powerLevel,
    focusRod,
    colorTempK: colorTempK ?? strobe.colorTempK,
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
  };
}

/** Swapping strobes resets color temperature to the new unit's native value. */
function applyStrobeChange(light, nextStrobeId) {
  const strobe = getStrobeById(nextStrobeId);
  if (!strobe) return light;
  return { ...light, strobeId: nextStrobeId, colorTempK: strobe.colorTempK };
}

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
            ? { ...light, placement: { ...light.placement, ...action.changes } }
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
      return { ...state, lights: action.lights, selectedLightId: action.lights[0]?.id ?? null };

    case 'view/setShowFixtures':
      return { ...state, showFixtures: action.visible };

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
      loadPreset: (presetId) =>
        dispatch({ type: 'preset/load', lights: buildLightsFromPreset(presetId) }),
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
