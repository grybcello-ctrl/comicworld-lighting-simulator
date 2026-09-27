import { createContext, useContext, useMemo, useReducer } from 'react';
import {
  getCompatibleModifiers,
  getStrobeById,
  isModifierCompatible,
} from '../config/equipmentRegistry.js';
import { DEFAULT_PRESET_ID, getPresetById } from '../config/lightingPresets.js';
import { clamp } from '../utils/lightMath.js';

/**
 * A light instance placed in the scene. It only stores catalog *ids*;
 * specs are always resolved from the equipment registry.
 * @typedef {Object} LightInstance
 * @property {string} id
 * @property {string} label
 * @property {string} strobeId
 * @property {string} modifierId
 * @property {boolean} enabled
 * @property {number} powerStops      0 = full, negative = reduced.
 * @property {number} colorTempK
 * @property {{ azimuthDeg: number, elevationDeg: number, distance: number }} placement
 */

let lightIdCounter = 0;
const createLightId = () => `light-${++lightIdCounter}`;

const DEFAULT_PLACEMENT = { azimuthDeg: 30, elevationDeg: 20, distance: 2 };

/** Builds a valid LightInstance, filling defaults from the strobe spec. */
export function createLightInstance({ strobeId, modifierId, label, powerStops, placement }) {
  const strobe = getStrobeById(strobeId);
  if (!strobe) throw new Error(`Unknown strobe id: "${strobeId}"`);

  const resolvedModifierId = isModifierCompatible(strobeId, modifierId)
    ? modifierId
    : getCompatibleModifiers(strobeId)[0]?.id;

  return {
    id: createLightId(),
    label: label ?? strobe.name,
    strobeId,
    modifierId: resolvedModifierId,
    enabled: true,
    powerStops: clamp(powerStops ?? -3, strobe.powerRange.minStops, strobe.powerRange.maxStops),
    colorTempK: strobe.colorTempK,
    placement: { ...DEFAULT_PLACEMENT, ...placement },
  };
}

const buildLightsFromPreset = (presetId) =>
  (getPresetById(presetId)?.lights ?? []).map(createLightInstance);

function createInitialState() {
  const lights = buildLightsFromPreset(DEFAULT_PRESET_ID);
  return { lights, selectedLightId: lights[0]?.id ?? null };
}

/** Keeps a light consistent after its strobe has been swapped. */
function applyStrobeChange(light, nextStrobeId) {
  const strobe = getStrobeById(nextStrobeId);
  if (!strobe) return light;
  return {
    ...light,
    strobeId: nextStrobeId,
    modifierId: isModifierCompatible(nextStrobeId, light.modifierId)
      ? light.modifierId
      : getCompatibleModifiers(nextStrobeId)[0]?.id,
    powerStops: clamp(light.powerStops, strobe.powerRange.minStops, strobe.powerRange.maxStops),
    colorTempK: strobe.colorTempK,
  };
}

function lightingReducer(state, action) {
  switch (action.type) {
    case 'light/add':
      return {
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
          return { ...withStrobe, ...otherChanges };
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
      return { lights, selectedLightId };
    }

    case 'light/select':
      return { ...state, selectedLightId: action.id };

    case 'preset/load':
      return { lights: action.lights, selectedLightId: action.lights[0]?.id ?? null };

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
