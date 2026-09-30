/**
 * Studio environment, visual guides and screenshot export (units: meters).
 * Nothing here casts shadows or emits light, so the lighting on the subject
 * is identical with every environment toggle on or off.
 */

/** Initial toggle states (state/viewStore.js). */
export const ENVIRONMENT_DEFAULTS = Object.freeze({
  showBackground: true,
  showBokehSpheres: true,
  showFloorGrid: false,
  showAngleGuide: false,
  showAfTarget: false,
});

/**
 * Environment adjustments (state/viewStore.js), with slider limits.
 * backgroundBrightness scales the cyc's linear reflectance (0.184 × value):
 * 0 = black, 1 = 18% gray, 2 = +1 EV, 3 = 55% reflectance.
 * bokehOffset moves the whole group of bokeh spheres (m, world axes).
 */
export const ENVIRONMENT_ADJUST_DEFAULTS = Object.freeze({
  backgroundBrightness: 1,
  // Subject (z = 0) → background wall, meters. The wall sits at z = −distance.
  backgroundDistanceM: 3,
  bokehOffsetX: 0,
  bokehOffsetY: 0,
  bokehOffsetZ: 0,
});

export const ENVIRONMENT_ADJUST_LIMITS = Object.freeze({
  backgroundBrightness: { min: 0, max: 3, step: 0.05 },
  backgroundDistanceM: { min: 1, max: 50, step: 0.1 },
  bokehOffsetX: { min: -2, max: 2, step: 0.01 },
  bokehOffsetY: { min: -1, max: 1.5, step: 0.01 },
  // + = towards the camera, − = back towards (or past) a distant background.
  bokehOffsetZ: { min: -45, max: 3, step: 0.01 },
});

/**
 * 18% gray cyclorama behind the subject (who faces +Z at the origin):
 * a floor apron, a cove (quarter circle) and a vertical wall.
 */
export const CYCLORAMA_CONFIG = Object.freeze({
  // #767676 = sRGB 118 → linear 0.184: an 18% reflectance "middle gray".
  color: '#767676',
  roughness: 1,
  metalness: 0,
  // Minimum size; a distant wall grows so it still fills the frame
  // (cycloramaSize in StudioEnvironment.jsx).
  widthM: 8,
  heightM: 4,
  // The wall covers this half angle seen from `frameReferenceM` in front of the subject.
  frameHalfWidthDeg: 24,
  frameHalfHeightDeg: 18,
  frameReferenceM: 4,
  coveRadiusM: 1,
  // Front edge of the floor apron (the camera usually stands at z = 2–4 m).
  apronFrontZ: 2.5,
  // Lifted above the studio floor (y = 0) to avoid z-fighting; see also polygonOffset.
  apronLiftM: 0.001,
  coveSegments: 24,
});

/**
 * Shadow frustum extension for a distant background (StudioLight.jsx): the
 * standard far margin covers a wall up to `coveredDistanceM` behind the subject.
 */
export const BACKGROUND_SHADOW_REACH = Object.freeze({ coveredDistanceM: 3, obliqueFactor: 1.5 });

/**
 * Small emissive spheres behind the subject: point highlights that turn into
 * bokeh discs in camera mode. Unlit (MeshBasicMaterial) with HDR colors, so
 * they emit no light onto the scene. [x, y, z, radius, color]
 */
export const BOKEH_SPHERES_CONFIG = Object.freeze({
  intensity: 8,
  spheres: [
    [-1.35, 1.05, -2.4, 0.018, '#ffd9a0'],
    [-1.05, 1.62, -2.1, 0.015, '#ffc070'],
    [-0.8, 0.78, -2.6, 0.02, '#ffe6c0'],
    [-0.62, 1.98, -1.8, 0.014, '#9fd3ff'],
    [-0.5, 1.3, -2.7, 0.016, '#ffd9a0'],
    [-0.2, 2.05, -2.3, 0.017, '#ffb347'],
    [0.18, 1.92, -1.7, 0.013, '#ffe6c0'],
    [0.45, 2.12, -2.6, 0.02, '#ffd9a0'],
    [0.55, 0.95, -2.0, 0.015, '#ffc070'],
    [0.72, 1.55, -2.5, 0.018, '#9fd3ff'],
    [0.95, 1.18, -1.9, 0.014, '#ffd9a0'],
    [1.1, 1.85, -2.2, 0.016, '#ffb347'],
    [1.32, 0.82, -2.7, 0.019, '#ffe6c0'],
    [-1.25, 2.0, -2.8, 0.02, '#ffc070'],
  ],
});

export const FLOOR_GRID_CONFIG = Object.freeze({
  sizeM: 10,
  divisions: 20, // 0.5 m cells
  centerColor: '#9a9aa6',
  lineColor: '#5c5c66',
  opacity: 0.6,
  heightM: 0.003,
});

/**
 * Floor protractor around the subject. Azimuths use the light placement
 * convention (0° = camera side +Z, +90° = subject's left +X), so a light
 * card's azimuth can be read directly from the floor.
 */
export const ANGLE_GUIDE_CONFIG = Object.freeze({
  ringRadiiM: [1, 2, 3],
  rayStepDeg: 15,
  majorStepDeg: 45,
  innerRadiusM: 0.25,
  outerRadiusM: 3.2,
  labelRadiusM: 3.5,
  labelHeightM: 0.17,
  ringLabelHeightM: 0.12,
  heightM: 0.006,
  majorColor: '#ffd166',
  minorColor: '#8a7a50',
  // Photo camera position and its horizontal angle of view (lighting mode only).
  cameraColor: '#7ec8ff',
  cameraWedgeLengthM: 7,
  renderOrder: 15,
});

/** Red sphere at the computed focus point. */
export const AF_TARGET_MARKER_CONFIG = Object.freeze({
  radiusM: 0.008,
  // Grows in far views so it stays visible (CSS px).
  minScreenDiameterPx: 10,
  color: '#ff2020',
  renderOrder: 30,
});

/** Framing for the overview buttons (Top / Front / Side / Quarter). */
export const OVERVIEW_FIT_CONFIG = Object.freeze({
  // Share of the view kept free around the fixtures on each side.
  marginFraction: 0.08,
  minDistanceM: 2,
  // Looking straight down makes the orbit up vector degenerate.
  topElevationDeg: 89.99,
});

export const SCREENSHOT_CONFIG = Object.freeze({
  filePrefix: 'studio-setup',
  // HUD text size relative to the image height, and its limits (px).
  hudFontFraction: 1 / 62,
  hudMinFontPx: 11,
  // The HUD panel may use at most this share of the image.
  hudMaxWidthFraction: 0.62,
  hudMaxHeightFraction: 0.94,
  hudBackground: 'rgba(12, 12, 16, 0.68)',
  // The download link's Blob URL is revoked after this delay (as FileSaver.js does).
  revokeDelayMs: 40000,
});


/** Pose Mode gizmo (components/scene/PoseController.jsx). */
export const POSE_CONFIG = Object.freeze({
  // 'local': rings follow the bone's own axes (bend / twist like a joint).
  space: 'local',
  gizmoSize: 0.8,
});
