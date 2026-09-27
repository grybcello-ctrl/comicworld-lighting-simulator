/**
 * Equipment catalog — the single source of truth for all lighting gear.
 *
 * To add new equipment, append an entry to STROBES or MODIFIERS.
 * No component code needs to change as long as the entry uses an existing
 * `body.shape` (strobes) or `geometry.shape` (modifiers). A brand-new shape
 * only requires registering one renderer in
 * `src/components/scene/fixtures/index.js`.
 */

/** Physical mount standards used to check strobe/modifier compatibility. */
export const MOUNT_TYPES = Object.freeze({
  BOWENS: 'bowens',
  PROFOTO: 'profoto',
  ELINCHROM: 'elinchrom',
  SPEEDLIGHT: 'speedlight',
});

/** Strobe categories (used for grouping in the UI). */
export const STROBE_CATEGORIES = Object.freeze({
  monolight: { label: 'Monolights' },
  packHead: { label: 'Pack & Head' },
  speedlight: { label: 'Speedlights' },
});

/** Modifier categories (used for grouping in the UI). */
export const MODIFIER_CATEGORIES = Object.freeze({
  bare: { label: 'Bare / Reflectors' },
  softbox: { label: 'Softboxes' },
  umbrella: { label: 'Umbrellas' },
  dish: { label: 'Beauty Dishes' },
});

/** Every mount type — handy for universal modifiers. */
const ALL_MOUNTS = Object.values(MOUNT_TYPES);

/**
 * @typedef {Object} StrobeDefinition
 * @property {string} id                 Unique, stable identifier.
 * @property {string} name               Display name.
 * @property {keyof STROBE_CATEGORIES} category
 * @property {string} mount              One of MOUNT_TYPES.
 * @property {number} maxPowerWs         Full-power output in watt-seconds.
 * @property {{ minStops: number, maxStops: number, stepStops: number }} powerRange
 *           Power adjustment range in stops relative to full power (0 = full).
 * @property {number} colorTempK         Native color temperature in Kelvin.
 * @property {{ minK: number, maxK: number }} colorTempRange
 * @property {{ shape: string, color: string, [key: string]: any }} body
 *           Visual description; `shape` selects a registered body renderer.
 */

/** @type {StrobeDefinition[]} */
export const STROBES = [
  {
    id: 'monolight-400',
    name: 'Monolight 400Ws',
    category: 'monolight',
    mount: MOUNT_TYPES.BOWENS,
    maxPowerWs: 400,
    powerRange: { minStops: -7, maxStops: 0, stepStops: 0.1 },
    colorTempK: 5600,
    colorTempRange: { minK: 5000, maxK: 6000 },
    body: { shape: 'cylinder', length: 0.28, radius: 0.065, color: '#2b2b2b' },
  },
  {
    id: 'monolight-600',
    name: 'Monolight 600Ws',
    category: 'monolight',
    mount: MOUNT_TYPES.BOWENS,
    maxPowerWs: 600,
    powerRange: { minStops: -8, maxStops: 0, stepStops: 0.1 },
    colorTempK: 5600,
    colorTempRange: { minK: 5000, maxK: 6000 },
    body: { shape: 'cylinder', length: 0.32, radius: 0.075, color: '#1f1f1f' },
  },
  {
    id: 'pack-head-1200',
    name: 'Pack & Head 1200Ws',
    category: 'packHead',
    mount: MOUNT_TYPES.PROFOTO,
    maxPowerWs: 1200,
    powerRange: { minStops: -9, maxStops: 0, stepStops: 0.1 },
    colorTempK: 5500,
    colorTempRange: { minK: 5000, maxK: 6000 },
    body: { shape: 'cylinder', length: 0.22, radius: 0.06, color: '#3a3a3a' },
  },
  {
    id: 'speedlight-76',
    name: 'Speedlight 76Ws',
    category: 'speedlight',
    mount: MOUNT_TYPES.SPEEDLIGHT,
    maxPowerWs: 76,
    powerRange: { minStops: -7, maxStops: 0, stepStops: 0.3 },
    colorTempK: 5600,
    colorTempRange: { minK: 5200, maxK: 6000 },
    body: { shape: 'box', width: 0.075, height: 0.14, depth: 0.1, color: '#151515' },
  },
];

/**
 * @typedef {Object} ModifierDefinition
 * @property {string} id
 * @property {string} name
 * @property {keyof MODIFIER_CATEGORIES} category
 * @property {string[]} mounts           Compatible MOUNT_TYPES.
 * @property {{ shape: string, [key: string]: any }} geometry
 *           Visual description; `shape` selects a registered modifier renderer.
 *           All sizes are in meters.
 * @property {Object} lighting           How the modifier shapes the light.
 * @property {number} lighting.beamAngleDeg   Full cone angle of the emitted light.
 * @property {number} lighting.penumbra       0 (hard edge) .. 1 (fully feathered).
 * @property {number} lighting.lightLossStops Output loss caused by the modifier.
 * @property {number} lighting.shadowSoftness Shadow blur radius (larger = softer).
 */

/** @type {ModifierDefinition[]} */
export const MODIFIERS = [
  {
    id: 'bare-bulb',
    name: 'Bare Bulb',
    category: 'bare',
    mounts: ALL_MOUNTS,
    geometry: { shape: 'none' },
    lighting: { beamAngleDeg: 150, penumbra: 0.2, lightLossStops: 0, shadowSoftness: 1 },
  },
  {
    id: 'standard-reflector-18',
    name: 'Standard Reflector 18cm',
    category: 'bare',
    mounts: [MOUNT_TYPES.BOWENS, MOUNT_TYPES.PROFOTO, MOUNT_TYPES.ELINCHROM],
    geometry: { shape: 'reflector', diameter: 0.18, depth: 0.12, color: '#b9b9b9' },
    lighting: { beamAngleDeg: 55, penumbra: 0.3, lightLossStops: 0, shadowSoftness: 1.5 },
  },
  {
    id: 'softbox-60x90',
    name: 'Rect Softbox 60×90',
    category: 'softbox',
    mounts: [MOUNT_TYPES.BOWENS, MOUNT_TYPES.PROFOTO, MOUNT_TYPES.ELINCHROM],
    geometry: { shape: 'rectSoftbox', width: 0.6, height: 0.9, depth: 0.4, color: '#111111' },
    lighting: { beamAngleDeg: 75, penumbra: 0.85, lightLossStops: 1.5, shadowSoftness: 8 },
  },
  {
    id: 'stripbox-30x120',
    name: 'Stripbox 30×120',
    category: 'softbox',
    mounts: [MOUNT_TYPES.BOWENS, MOUNT_TYPES.PROFOTO, MOUNT_TYPES.ELINCHROM],
    geometry: { shape: 'rectSoftbox', width: 0.3, height: 1.2, depth: 0.35, color: '#111111' },
    lighting: { beamAngleDeg: 65, penumbra: 0.8, lightLossStops: 1.7, shadowSoftness: 6 },
  },
  {
    id: 'octabox-120',
    name: 'Octabox 120cm',
    category: 'softbox',
    mounts: [MOUNT_TYPES.BOWENS, MOUNT_TYPES.PROFOTO, MOUNT_TYPES.ELINCHROM],
    geometry: { shape: 'octaSoftbox', diameter: 1.2, depth: 0.5, color: '#111111' },
    lighting: { beamAngleDeg: 85, penumbra: 1, lightLossStops: 1.5, shadowSoftness: 12 },
  },
  {
    id: 'umbrella-white-105',
    name: 'White Umbrella 105cm',
    category: 'umbrella',
    mounts: ALL_MOUNTS,
    geometry: { shape: 'umbrella', diameter: 1.05, depth: 0.3, color: '#f2f2f2' },
    lighting: { beamAngleDeg: 100, penumbra: 0.9, lightLossStops: 1, shadowSoftness: 9 },
  },
  {
    id: 'beauty-dish-55',
    name: 'Beauty Dish 55cm (White)',
    category: 'dish',
    mounts: [MOUNT_TYPES.BOWENS, MOUNT_TYPES.PROFOTO, MOUNT_TYPES.ELINCHROM],
    geometry: { shape: 'beautyDish', diameter: 0.55, depth: 0.16, color: '#e8e8e8' },
    lighting: { beamAngleDeg: 60, penumbra: 0.5, lightLossStops: 0.7, shadowSoftness: 4 },
  },
  {
    id: 'speedlight-softbox-40',
    name: 'Speedlight Softbox 40×40',
    category: 'softbox',
    mounts: [MOUNT_TYPES.SPEEDLIGHT],
    geometry: { shape: 'rectSoftbox', width: 0.4, height: 0.4, depth: 0.3, color: '#111111' },
    lighting: { beamAngleDeg: 70, penumbra: 0.75, lightLossStops: 1.3, shadowSoftness: 5 },
  },
];

/** Aggregated export, convenient for passing the whole catalog around. */
export const equipmentConfig = Object.freeze({
  strobes: STROBES,
  modifiers: MODIFIERS,
  mountTypes: MOUNT_TYPES,
  strobeCategories: STROBE_CATEGORIES,
  modifierCategories: MODIFIER_CATEGORIES,
});
