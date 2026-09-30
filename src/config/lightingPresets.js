/**
 * Lighting setups built from catalog ids. Add new presets by appending here.
 * Placement is spherical around the subject's head:
 *   azimuthDeg   0 = in front of the subject (camera side), +90 = subject's left
 *   elevationDeg 0 = eye level, positive = above
 *   distance     meters from the head
 * powerLevel uses the Connect-style scale (10.0 = full, -1.0 = one stop).
 * Optional: colorTempK (3200–6500), gelId (OCF gels, B10-series strobes only),
 * gridId, innerDiffuser, and placement shiftX/Y/Z (m) + tiltDeg/panDeg/rollDeg.
 */
export const LIGHTING_PRESETS = [
  {
    // Default scene: a classic key + fill with the two B10-series heads.
    id: 'key-fill',
    name: 'Key + Fill (B10X Plus + B10)',
    lights: [
      {
        label: 'Key Light',
        strobeId: 'profoto-b10x-plus',
        modifierId: 'parabolix-35d',
        powerLevel: 7,
        focusRod: 30,
        placement: { azimuthDeg: 35, elevationDeg: 30, distance: 1.8 },
      },
      {
        label: 'Fill Light',
        strobeId: 'profoto-b10',
        modifierId: 'profoto-ocf-softbox-1x4',
        powerLevel: 5,
        placement: { azimuthDeg: -45, elevationDeg: 5, distance: 2.2 },
      },
    ],
  },
  {
    id: 'para-fashion',
    name: 'Para Fashion (Para 133HR + Strip Rim)',
    lights: [
      {
        label: 'Key',
        strobeId: 'profoto-b10x-plus',
        modifierId: 'broncolor-para-133hr',
        powerLevel: 7.2,
        focusRod: 25,
        placement: { azimuthDeg: 20, elevationDeg: 25, distance: 2.2 },
      },
      {
        label: 'Rim',
        strobeId: 'profoto-b10',
        modifierId: 'profoto-ocf-softbox-1x4',
        powerLevel: 6,
        placement: { azimuthDeg: -135, elevationDeg: 10, distance: 1.5 },
      },
    ],
  },
  {
    id: 'parabolix-beauty',
    name: 'Parabolix 35D Beauty (Diffuser + Shifted Kicker)',
    lights: [
      {
        label: 'Key',
        strobeId: 'profoto-b10x-plus',
        modifierId: 'parabolix-35d',
        innerDiffuser: true,
        powerLevel: 6.7,
        focusRod: 70,
        placement: { azimuthDeg: 15, elevationDeg: 20, distance: 1.4 },
      },
      {
        label: 'Kicker',
        strobeId: 'profoto-b10-plus',
        modifierId: 'profoto-zoom-reflector-white',
        gridId: 'profoto-grid-20-white',
        powerLevel: 6.5,
        // Moved back and up without re-aiming, then tilted down onto the hair/shoulder.
        placement: { azimuthDeg: -140, elevationDeg: 25, distance: 1.8, shiftY: 0.3, tiltDeg: -8 },
      },
    ],
  },
  {
    id: 'gel-split',
    name: 'Gel Split (Scarlet × Peacock Blue + ½ CTO Key)',
    lights: [
      {
        label: 'Key',
        strobeId: 'profoto-b10x-plus',
        modifierId: 'profoto-ocf-beauty-dish-white-2',
        gelId: 'ocf-gel-cto-half',
        powerLevel: 5.5,
        placement: { azimuthDeg: 10, elevationDeg: 30, distance: 1.6 },
      },
      {
        label: 'Left edge',
        strobeId: 'profoto-b10-plus',
        modifierId: 'profoto-ocf-softbox-1x4',
        gelId: 'ocf-gel-scarlet',
        powerLevel: 8,
        placement: { azimuthDeg: 110, elevationDeg: 0, distance: 1.4 },
      },
      {
        label: 'Right edge',
        strobeId: 'profoto-b10-plus',
        modifierId: 'profoto-ocf-softbox-1x4',
        gelId: 'ocf-gel-peacock-blue',
        powerLevel: 7.5,
        placement: { azimuthDeg: -110, elevationDeg: 0, distance: 1.4 },
      },
    ],
  },
  {
    id: 'grid-spot-drama',
    name: 'Grid Spot Drama (10° Grid + Octa Fill)',
    lights: [
      {
        label: 'Spot',
        strobeId: 'profoto-b10-plus',
        modifierId: 'profoto-zoom-reflector-white',
        gridId: 'profoto-grid-10-white',
        powerLevel: 6,
        placement: { azimuthDeg: 50, elevationDeg: 30, distance: 2 },
      },
      {
        label: 'Fill',
        strobeId: 'profoto-b10',
        modifierId: 'profoto-rfi-octa-3',
        powerLevel: 4,
        placement: { azimuthDeg: -30, elevationDeg: 5, distance: 2.4 },
      },
    ],
  },
  {
    id: 'rembrandt',
    name: 'Rembrandt (Key + Fill)',
    lights: [
      {
        label: 'Key',
        strobeId: 'monolight-600',
        modifierId: 'octabox-120',
        powerLevel: 7.0,
        placement: { azimuthDeg: 45, elevationDeg: 35, distance: 1.8 },
      },
      {
        label: 'Fill',
        strobeId: 'monolight-400',
        modifierId: 'umbrella-white-105',
        powerLevel: 5.0,
        placement: { azimuthDeg: -40, elevationDeg: 5, distance: 2.4 },
      },
    ],
  },
  {
    id: 'clamshell',
    name: 'Clamshell Beauty',
    lights: [
      {
        label: 'Top',
        strobeId: 'monolight-600',
        modifierId: 'beauty-dish-55',
        powerLevel: 6.5,
        placement: { azimuthDeg: 0, elevationDeg: 40, distance: 1.3 },
      },
      {
        label: 'Bottom',
        strobeId: 'monolight-400',
        modifierId: 'stripbox-30x120',
        powerLevel: 5.0,
        placement: { azimuthDeg: 0, elevationDeg: -20, distance: 1.2 },
      },
    ],
  },
  {
    id: 'three-point',
    name: 'Three-Point',
    lights: [
      {
        label: 'Key',
        strobeId: 'monolight-600',
        modifierId: 'softbox-60x90',
        powerLevel: 7.0,
        placement: { azimuthDeg: 40, elevationDeg: 25, distance: 1.8 },
      },
      {
        label: 'Fill',
        strobeId: 'monolight-400',
        modifierId: 'umbrella-white-105',
        powerLevel: 4.5,
        placement: { azimuthDeg: -50, elevationDeg: 10, distance: 2.5 },
      },
      {
        label: 'Rim',
        strobeId: 'speedlight-76',
        modifierId: 'speedlight-softbox-40',
        powerLevel: 9.0,
        placement: { azimuthDeg: -150, elevationDeg: 30, distance: 1.6 },
      },
    ],
  },
];

export const DEFAULT_PRESET_ID = LIGHTING_PRESETS[0].id;

export const getPresetById = (id) => LIGHTING_PRESETS.find((preset) => preset.id === id) ?? null;
