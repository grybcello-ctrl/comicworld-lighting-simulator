/**
 * Lighting setups built from catalog ids. Add new presets by appending here.
 * Placement is spherical around the subject's head:
 *   azimuthDeg   0 = in front of the subject (camera side), +90 = subject's left
 *   elevationDeg 0 = eye level, positive = above
 *   distance     meters from the head
 */
export const LIGHTING_PRESETS = [
  {
    id: 'rembrandt',
    name: 'Rembrandt (Key + Fill)',
    lights: [
      {
        label: 'Key',
        strobeId: 'monolight-600',
        modifierId: 'octabox-120',
        powerStops: -3,
        placement: { azimuthDeg: 45, elevationDeg: 35, distance: 1.8 },
      },
      {
        label: 'Fill',
        strobeId: 'monolight-400',
        modifierId: 'umbrella-white-105',
        powerStops: -5,
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
        powerStops: -3.5,
        placement: { azimuthDeg: 0, elevationDeg: 40, distance: 1.3 },
      },
      {
        label: 'Bottom',
        strobeId: 'monolight-400',
        modifierId: 'stripbox-30x120',
        powerStops: -5,
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
        powerStops: -3,
        placement: { azimuthDeg: 40, elevationDeg: 25, distance: 1.8 },
      },
      {
        label: 'Fill',
        strobeId: 'monolight-400',
        modifierId: 'umbrella-white-105',
        powerStops: -5.5,
        placement: { azimuthDeg: -50, elevationDeg: 10, distance: 2.5 },
      },
      {
        label: 'Rim',
        strobeId: 'speedlight-76',
        modifierId: 'speedlight-softbox-40',
        powerStops: -1,
        placement: { azimuthDeg: -150, elevationDeg: 30, distance: 1.6 },
      },
    ],
  },
];

export const DEFAULT_PRESET_ID = LIGHTING_PRESETS[0].id;

export const getPresetById = (id) => LIGHTING_PRESETS.find((preset) => preset.id === id) ?? null;
