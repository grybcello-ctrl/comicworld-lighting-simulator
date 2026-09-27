/**
 * Equipment catalog — the single source of truth for all lighting gear.
 *
 * To add new equipment, append an entry to STROBES, MODIFIERS, GRIDS or GELS.
 * No component code needs to change as long as the entry uses an existing
 * `body.shape` (strobes), `geometry.shape` (modifiers) and `lighting.model`.
 * A brand-new visual shape only requires registering one renderer in
 * `src/components/scene/fixtures/index.js`; a new light model requires a
 * resolver in `src/utils/beamModel.js`.
 *
 * Physical values marked "approx." are estimates derived from manufacturer
 * sizes and typical behavior, not measured photometric data.
 */

/** Physical mount standards used to check strobe/modifier compatibility. */
export const MOUNT_TYPES = Object.freeze({
  BOWENS: 'bowens',
  PROFOTO: 'profoto',
  PROFOTO_OCF: 'profotoOcf',
  ELINCHROM: 'elinchrom',
  SPEEDLIGHT: 'speedlight',
});

/** Strobe categories (used for grouping in the UI). */
export const STROBE_CATEGORIES = Object.freeze({
  profotoB10: { label: 'Profoto B10 Series' },
  monolight: { label: 'Monolights' },
  packHead: { label: 'Pack & Head' },
  speedlight: { label: 'Speedlights' },
});

/** Modifier categories (used for grouping in the UI). */
export const MODIFIER_CATEGORIES = Object.freeze({
  parabolic: { label: 'Parabolics' },
  softbox: { label: 'Softboxes' },
  hard: { label: 'Hard Lights (Dish / Reflector)' },
  bare: { label: 'Bare / Reflectors' },
  umbrella: { label: 'Umbrellas' },
  dish: { label: 'Beauty Dishes' },
});

/**
 * How a modifier is turned into three.js lights (see src/utils/beamModel.js).
 * - spot:      one SpotLight; optional angular beam profile and grid support.
 * - parabolic: SpotLight whose angle/penumbra/profile follow the focusing rod.
 * - area:      RectAreaLight sized to the diffuser + a soft shadow-proxy SpotLight.
 */
export const LIGHT_MODELS = Object.freeze({
  SPOT: 'spot',
  PARABOLIC: 'parabolic',
  AREA: 'area',
});

/** Every mount type — handy for universal modifiers. */
const ALL_MOUNTS = Object.values(MOUNT_TYPES);
/** Studio-size modifiers that are sold with (or adapt to) the common speedrings. */
const STUDIO_MOUNTS = [MOUNT_TYPES.BOWENS, MOUNT_TYPES.PROFOTO, MOUNT_TYPES.ELINCHROM];

/**
 * Power scale shared by all strobes, modeled on the Profoto Connect Pro remote:
 * 10.0 = full power, each -1.0 = one f-stop (half the energy), 0.1 steps.
 * Strobes may narrow `min` if they cannot go that low.
 */
const PROFOTO_POWER_SCALE = Object.freeze({ min: 1.0, max: 10.0, step: 0.1 });

/** Color temperature slider range shared by all strobes (tungsten .. D65). */
export const STUDIO_COLOR_TEMP_RANGE = Object.freeze({ minK: 3200, maxK: 6500, stepK: 50 });

/**
 * @typedef {Object} StrobeDefinition
 * @property {string} id                 Unique, stable identifier.
 * @property {string} name               Display name.
 * @property {keyof STROBE_CATEGORIES} category
 * @property {string} mount              Native mount (one of MOUNT_TYPES).
 * @property {string[]} [adapterMounts]  Extra mounts usable via an official adapter.
 * @property {number} maxWs              Full-power flash energy in watt-seconds.
 * @property {{ min: number, max: number, step: number }} powerLevelRange
 *           Connect-style power levels. Energy = maxWs * 2^(level - 10).
 * @property {number} colorTempK         Native color temperature in Kelvin.
 * @property {{ minK: number, maxK: number, stepK: number }} colorTempRange
 * @property {{ shape: string, color: string, [key: string]: any }} body
 */

/** @type {StrobeDefinition[]} */
export const STROBES = [
  // --- Profoto B10 family (OCF mount; standard Profoto tools via OCF Adapter) ---
  {
    id: 'profoto-b10',
    name: 'Profoto B10 (250Ws)',
    category: 'profotoB10',
    mount: MOUNT_TYPES.PROFOTO_OCF,
    adapterMounts: [MOUNT_TYPES.PROFOTO],
    maxWs: 250, // 10 f-stops, 0.5–250 Ws
    powerLevelRange: PROFOTO_POWER_SCALE,
    colorTempK: 5600,
    colorTempRange: STUDIO_COLOR_TEMP_RANGE,
    body: { shape: 'cylinder', length: 0.175, radius: 0.05, color: '#1c1c1c' },
  },
  {
    id: 'profoto-b10-plus',
    name: 'Profoto B10 Plus (500Ws)',
    category: 'profotoB10',
    mount: MOUNT_TYPES.PROFOTO_OCF,
    adapterMounts: [MOUNT_TYPES.PROFOTO],
    maxWs: 500, // 10 f-stops, 1–500 Ws
    powerLevelRange: PROFOTO_POWER_SCALE,
    colorTempK: 5600,
    colorTempRange: STUDIO_COLOR_TEMP_RANGE,
    body: { shape: 'cylinder', length: 0.215, radius: 0.05, color: '#1c1c1c' },
  },
  {
    id: 'profoto-b10x-plus',
    name: 'Profoto B10X Plus (500Ws)',
    category: 'profotoB10',
    mount: MOUNT_TYPES.PROFOTO_OCF,
    adapterMounts: [MOUNT_TYPES.PROFOTO],
    // Same flash energy as the B10 Plus per Profoto's spec; the X upgrade is
    // faster recycling and a brighter LED modeling light, not more Ws.
    maxWs: 500,
    powerLevelRange: PROFOTO_POWER_SCALE,
    colorTempK: 5600,
    colorTempRange: STUDIO_COLOR_TEMP_RANGE,
    body: { shape: 'cylinder', length: 0.215, radius: 0.052, color: '#101010' },
  },

  // --- Generic Phase 1 units (min level = their shortest stop range) ---
  {
    id: 'monolight-400',
    name: 'Monolight 400Ws',
    category: 'monolight',
    mount: MOUNT_TYPES.BOWENS,
    maxWs: 400,
    powerLevelRange: { ...PROFOTO_POWER_SCALE, min: 3.0 },
    colorTempK: 5600,
    colorTempRange: STUDIO_COLOR_TEMP_RANGE,
    body: { shape: 'cylinder', length: 0.28, radius: 0.065, color: '#2b2b2b' },
  },
  {
    id: 'monolight-600',
    name: 'Monolight 600Ws',
    category: 'monolight',
    mount: MOUNT_TYPES.BOWENS,
    maxWs: 600,
    powerLevelRange: { ...PROFOTO_POWER_SCALE, min: 2.0 },
    colorTempK: 5600,
    colorTempRange: STUDIO_COLOR_TEMP_RANGE,
    body: { shape: 'cylinder', length: 0.32, radius: 0.075, color: '#1f1f1f' },
  },
  {
    id: 'pack-head-1200',
    name: 'Pack & Head 1200Ws',
    category: 'packHead',
    mount: MOUNT_TYPES.PROFOTO,
    maxWs: 1200,
    powerLevelRange: PROFOTO_POWER_SCALE,
    colorTempK: 5500,
    colorTempRange: STUDIO_COLOR_TEMP_RANGE,
    body: { shape: 'cylinder', length: 0.22, radius: 0.06, color: '#3a3a3a' },
  },
  {
    id: 'speedlight-76',
    name: 'Speedlight 76Ws',
    category: 'speedlight',
    mount: MOUNT_TYPES.SPEEDLIGHT,
    maxWs: 76,
    powerLevelRange: { ...PROFOTO_POWER_SCALE, min: 3.0 },
    colorTempK: 5600,
    colorTempRange: STUDIO_COLOR_TEMP_RANGE,
    body: { shape: 'box', width: 0.075, height: 0.14, depth: 0.1, color: '#151515' },
  },
];

/**
 * Angular beam profile, evaluated over r = θ / halfAngle (0 = axis, 1 = cone edge).
 * Rendered as a SpotLight `map` (see src/utils/beamProfileTexture.js).
 *   value(r) = [(1 - hotspotGain) + hotspotGain * exp(-(r / hotspotRadius)^2)]
 *            * [1 - centerDip * exp(-(r / 0.2)^2)]
 *            * [1 - smoothstep(edgeStart, 1, r)]
 * @typedef {Object} BeamProfile
 * @property {number} [hotspotRadius=1]  Width of the hot center (fraction of the cone).
 * @property {number} [hotspotGain=0]    0 = flat beam, 1 = all energy in the hot spot.
 * @property {number} [centerDip=0]      Center loss, e.g. head/rod shadowing the reflector apex.
 * @property {number} [edgeStart=1]      Where the extra edge cut begins (< 1 = harder edge).
 */

/**
 * Shared optical parameters (all optional unless noted).
 * @typedef {Object} BeamOptics
 * @property {number} beamAngleDeg          Full cone angle.
 * @property {number} penumbra              0 (hard edge) .. 1 (fully feathered).
 * @property {number} [centerGainStops=0]   On-axis gain from concentrating the beam.
 * @property {number} [virtualSourceOffsetM=0]
 *           Apparent source distance behind the fixture. 0 = point source (inverse
 *           square, decay 2); larger = collimated "throw" (slower falloff).
 * @property {number} shadowSoftness        Shadow blur radius.
 * @property {BeamProfile} [profile]
 */

/**
 * @typedef {Object} ModifierDefinition
 * @property {string} id
 * @property {string} name
 * @property {keyof MODIFIER_CATEGORIES} category
 * @property {string[]} mounts           Compatible MOUNT_TYPES.
 * @property {{ shape: string, [key: string]: any }} geometry  Sizes in meters.
 * @property {Object} lighting
 * @property {string} [lighting.model='spot']   One of LIGHT_MODELS.
 * @property {number} lighting.lightLossStops   Output loss caused by the modifier.
 * spot:      BeamOptics fields directly on `lighting`.
 * parabolic: `lighting.focus = { spot: BeamOptics, flood: BeamOptics }`
 *            (focusing rod 0 = spot, 100 = flood, linear in between).
 * area:      emitter size is derived from `geometry`; BeamOptics fields
 *            configure the soft shadow proxy.
 * @property {string[]} [gridIds]        GRIDS that can be fitted to this modifier.
 */

/** @type {ModifierDefinition[]} */
export const MODIFIERS = [
  // --- Parabolics ---------------------------------------------------------
  {
    id: 'broncolor-para-133hr',
    name: 'Broncolor Para 133HR',
    category: 'parabolic',
    mounts: STUDIO_MOUNTS, // via Broncolor Para adapters
    // 24-segment deep parabola. focalLength = r^2 / (4 * depth) ≈ 0.22 m.
    geometry: { shape: 'parabolic', diameter: 1.33, depth: 0.5, segments: 24, color: '#d9d9d9' },
    lighting: {
      model: LIGHT_MODELS.PARABOLIC,
      lightLossStops: 0.3, // highly reflective textile
      focus: {
        // Head at the focal point: near-collimated, punchy, crisp speculars.
        spot: {
          beamAngleDeg: 16,
          penumbra: 0.15,
          centerGainStops: 1.5,
          virtualSourceOffsetM: 1.2,
          shadowSoftness: 1.5,
          profile: { hotspotRadius: 0.35, hotspotGain: 0.8, centerDip: 0 },
        },
        // Head pulled back to the apex: wide, enveloping light, center shadowed by the head.
        flood: {
          beamAngleDeg: 72,
          penumbra: 0.75,
          centerGainStops: 0,
          virtualSourceOffsetM: 0.15,
          shadowSoftness: 9,
          profile: { hotspotRadius: 0.9, hotspotGain: 0.3, centerDip: 0.25 },
        },
      },
    },
  },
  {
    id: 'parabolix-35d',
    name: 'Parabolix 35D',
    category: 'parabolic',
    mounts: STUDIO_MOUNTS, // via Parabolix cage-mount adapters
    // 35" wide, 25" deep ("D" = deep). focalLength ≈ 0.08 m.
    geometry: { shape: 'parabolic', diameter: 0.89, depth: 0.635, segments: 16, color: '#cfcfcf' },
    lighting: {
      model: LIGHT_MODELS.PARABOLIC,
      lightLossStops: 0.4,
      focus: {
        spot: {
          beamAngleDeg: 12,
          penumbra: 0.12,
          centerGainStops: 1.7,
          virtualSourceOffsetM: 0.9,
          shadowSoftness: 1.2,
          profile: { hotspotRadius: 0.3, hotspotGain: 0.85, centerDip: 0 },
        },
        // Deep dish: stronger head occlusion when flooded.
        flood: {
          beamAngleDeg: 60,
          penumbra: 0.7,
          centerGainStops: 0,
          virtualSourceOffsetM: 0.1,
          shadowSoftness: 7,
          profile: { hotspotRadius: 0.85, hotspotGain: 0.35, centerDip: 0.3 },
        },
      },
    },
  },

  // --- Softboxes (area lights) --------------------------------------------
  {
    id: 'profoto-ocf-softbox-1x4',
    name: "Profoto OCF Softbox 1×4'",
    category: 'softbox',
    mounts: [MOUNT_TYPES.PROFOTO_OCF],
    geometry: { shape: 'rectSoftbox', width: 0.3, height: 1.2, depth: 0.25, color: '#111111' },
    lighting: {
      model: LIGHT_MODELS.AREA,
      lightLossStops: 1.3,
      beamAngleDeg: 80,
      penumbra: 0.9,
      shadowSoftness: 7,
    },
  },
  {
    id: 'profoto-rfi-octa-3',
    name: "Profoto RFi Octa 3'",
    category: 'softbox',
    mounts: [MOUNT_TYPES.PROFOTO], // RFi speedring
    geometry: { shape: 'octaSoftbox', diameter: 0.9, depth: 0.45, color: '#111111' },
    lighting: {
      model: LIGHT_MODELS.AREA,
      lightLossStops: 1.5,
      beamAngleDeg: 85,
      penumbra: 1,
      shadowSoftness: 10,
    },
  },

  // --- Hard lights (with inverse-square decay and hot center) ---------------
  {
    id: 'profoto-ocf-beauty-dish-white-2',
    name: "Profoto OCF Beauty Dish White 2'",
    category: 'hard',
    mounts: [MOUNT_TYPES.PROFOTO_OCF],
    geometry: { shape: 'beautyDish', diameter: 0.56, depth: 0.17, color: '#f0f0f0' },
    lighting: {
      model: LIGHT_MODELS.SPOT,
      beamAngleDeg: 65,
      penumbra: 0.45,
      lightLossStops: 0.8,
      centerGainStops: 0.3,
      // Compact source: pure inverse-square (decay 2) -> crisp, contrasty fall-off.
      virtualSourceOffsetM: 0,
      shadowSoftness: 3,
      // White interior: a defined but creamy center, softer than the silver version.
      profile: { hotspotRadius: 0.45, hotspotGain: 0.55 },
    },
  },
  {
    id: 'profoto-zoom-reflector-white',
    name: 'Profoto Zoom Reflector White',
    category: 'hard',
    mounts: [MOUNT_TYPES.PROFOTO],
    geometry: { shape: 'reflector', diameter: 0.18, depth: 0.14, color: '#f2f2f2' },
    lighting: {
      model: LIGHT_MODELS.SPOT,
      beamAngleDeg: 55,
      penumbra: 0.3,
      lightLossStops: 0.1,
      centerGainStops: 0.5,
      virtualSourceOffsetM: 0.3,
      shadowSoftness: 1.2,
      profile: { hotspotRadius: 0.35, hotspotGain: 0.75 },
    },
    gridIds: ['profoto-grid-10-white', 'profoto-grid-20-white'],
  },

  // --- Generic Phase 1 modifiers ------------------------------------------
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
    mounts: STUDIO_MOUNTS,
    geometry: { shape: 'reflector', diameter: 0.18, depth: 0.12, color: '#b9b9b9' },
    lighting: { beamAngleDeg: 55, penumbra: 0.3, lightLossStops: 0, shadowSoftness: 1.5 },
  },
  {
    id: 'softbox-60x90',
    name: 'Rect Softbox 60×90',
    category: 'softbox',
    mounts: STUDIO_MOUNTS,
    geometry: { shape: 'rectSoftbox', width: 0.6, height: 0.9, depth: 0.4, color: '#111111' },
    lighting: {
      model: LIGHT_MODELS.AREA,
      beamAngleDeg: 75,
      penumbra: 0.85,
      lightLossStops: 1.5,
      shadowSoftness: 8,
    },
  },
  {
    id: 'stripbox-30x120',
    name: 'Stripbox 30×120',
    category: 'softbox',
    mounts: STUDIO_MOUNTS,
    geometry: { shape: 'rectSoftbox', width: 0.3, height: 1.2, depth: 0.35, color: '#111111' },
    lighting: {
      model: LIGHT_MODELS.AREA,
      beamAngleDeg: 65,
      penumbra: 0.8,
      lightLossStops: 1.7,
      shadowSoftness: 6,
    },
  },
  {
    id: 'octabox-120',
    name: 'Octabox 120cm',
    category: 'softbox',
    mounts: STUDIO_MOUNTS,
    geometry: { shape: 'octaSoftbox', diameter: 1.2, depth: 0.5, color: '#111111' },
    lighting: {
      model: LIGHT_MODELS.AREA,
      beamAngleDeg: 85,
      penumbra: 1,
      lightLossStops: 1.5,
      shadowSoftness: 12,
    },
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
    mounts: STUDIO_MOUNTS,
    geometry: { shape: 'beautyDish', diameter: 0.55, depth: 0.16, color: '#e8e8e8' },
    lighting: { beamAngleDeg: 60, penumbra: 0.5, lightLossStops: 0.7, shadowSoftness: 4 },
  },
  {
    id: 'speedlight-softbox-40',
    name: 'Speedlight Softbox 40×40',
    category: 'softbox',
    mounts: [MOUNT_TYPES.SPEEDLIGHT],
    geometry: { shape: 'rectSoftbox', width: 0.4, height: 0.4, depth: 0.3, color: '#111111' },
    lighting: {
      model: LIGHT_MODELS.AREA,
      beamAngleDeg: 70,
      penumbra: 0.75,
      lightLossStops: 1.3,
      shadowSoftness: 5,
    },
  },
];

/**
 * Honeycomb grids. A grid *strictly* replaces the host modifier's beam:
 * the SpotLight angle is set to exactly `beamAngleDeg`, with a near-zero
 * penumbra and an edge cut in the beam profile (hard edge).
 * @typedef {Object} GridDefinition
 * @property {string} id
 * @property {string} name
 * @property {number} beamAngleDeg     Full beam angle enforced by the grid.
 * @property {number} penumbra         Kept tiny for a hard edge.
 * @property {number} lightLossStops   Light absorbed by the honeycomb.
 * @property {number} shadowSoftness
 * @property {BeamProfile} profile
 * @property {{ thickness: number, color: string }} geometry
 */

/** @type {GridDefinition[]} */
export const GRIDS = [
  {
    id: 'profoto-grid-10-white',
    name: '10° Grid (White)',
    beamAngleDeg: 10,
    penumbra: 0.03,
    lightLossStops: 1.3,
    shadowSoftness: 1,
    // Flat-ish core with a steep cut starting at 90 % of the cone.
    profile: { hotspotRadius: 0.6, hotspotGain: 0.3, edgeStart: 0.9 },
    geometry: { thickness: 0.025, color: '#e6e6e6' },
  },
  {
    id: 'profoto-grid-20-white',
    name: '20° Grid (White)',
    beamAngleDeg: 20,
    penumbra: 0.05,
    lightLossStops: 1.0,
    shadowSoftness: 1,
    profile: { hotspotRadius: 0.6, hotspotGain: 0.35, edgeStart: 0.88 },
    geometry: { thickness: 0.02, color: '#e6e6e6' },
  },
];

/** Gel categories (used for grouping in the UI). */
export const GEL_CATEGORIES = Object.freeze({
  colorCorrection: { label: 'OCF Color Correction' },
  colorEffects: { label: 'OCF Color Effects' },
});

/**
 * Profoto OCF color gels (snap onto the B10-series head, so they work under
 * any modifier). The light color is computed spectrally:
 * black body(T) × gel T(λ) -> CIE XYZ -> linear sRGB (see utils/colorTemperature.js).
 *
 * filter.type 'mired':    color conversion; `miredShift` is the spectral shape
 *   parameter, calibrated so 5600K + gel lands on the nominal rating
 *   (`nominalMiredShift`) along the Planckian locus.
 * filter.type 'bandpass': effect colors; logistic cut-on/cut-off edges (nm).
 * Curves are approx. fits to typical Rosco/LEE equivalents (dominant hue and
 * photopic transmission), not manufacturer-measured spectra.
 * @typedef {Object} GelDefinition
 * @property {string} id
 * @property {string} name
 * @property {keyof GEL_CATEGORIES} category
 * @property {string[]} mounts            Strobe mounts the gel physically fits.
 * @property {number} [nominalMiredShift] Published mired shift (conversion gels).
 * @property {{ type: 'mired' | 'bandpass', [key: string]: number }} filter
 */

/** @type {GelDefinition[]} */
export const GELS = [
  {
    id: 'ocf-gel-cto-full',
    name: 'Full CTO',
    category: 'colorCorrection',
    mounts: [MOUNT_TYPES.PROFOTO_OCF],
    nominalMiredShift: 159, // 5600K -> ~2960K, ~56% transmission (−0.8 EV)
    filter: { type: 'mired', miredShift: 172.5, peak: 0.86 },
  },
  {
    id: 'ocf-gel-cto-half',
    name: '1/2 CTO',
    category: 'colorCorrection',
    mounts: [MOUNT_TYPES.PROFOTO_OCF],
    nominalMiredShift: 81, // 5600K -> ~3850K, ~71% transmission (−0.5 EV)
    filter: { type: 'mired', miredShift: 85.5, peak: 0.88 },
  },
  {
    id: 'ocf-gel-scarlet',
    name: 'Scarlet',
    category: 'colorEffects',
    mounts: [MOUNT_TYPES.PROFOTO_OCF],
    // Long-pass red with an orange bias; blocks everything below ~590 nm.
    filter: { type: 'bandpass', cutOnNm: 596, cutOnWidthNm: 9, peak: 0.85, floor: 0.004 },
  },
  {
    id: 'ocf-gel-peacock-blue',
    name: 'Peacock Blue',
    category: 'colorEffects',
    mounts: [MOUNT_TYPES.PROFOTO_OCF],
    // Turquoise: passes blue-cyan (~430–545 nm), blocks red.
    filter: {
      type: 'bandpass',
      cutOnNm: 428,
      cutOnWidthNm: 12,
      cutOffNm: 545,
      cutOffWidthNm: 14,
      peak: 0.66,
      floor: 0.02,
    },
  },
  {
    id: 'ocf-gel-jade',
    name: 'Jade',
    category: 'colorEffects',
    mounts: [MOUNT_TYPES.PROFOTO_OCF],
    // Blue-green: narrow pass band ~470–550 nm.
    filter: {
      type: 'bandpass',
      cutOnNm: 470,
      cutOnWidthNm: 10,
      cutOffNm: 550,
      cutOffWidthNm: 12,
      peak: 0.42,
      floor: 0.015,
    },
  },
];

/** Aggregated export, convenient for passing the whole catalog around. */
export const equipmentConfig = Object.freeze({
  strobes: STROBES,
  modifiers: MODIFIERS,
  grids: GRIDS,
  gels: GELS,
  mountTypes: MOUNT_TYPES,
  lightModels: LIGHT_MODELS,
  strobeCategories: STROBE_CATEGORIES,
  modifierCategories: MODIFIER_CATEGORIES,
  gelCategories: GEL_CATEGORIES,
});
