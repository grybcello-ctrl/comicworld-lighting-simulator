import { useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo } from 'react';
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  GridHelper,
  LineBasicMaterial,
  LineSegments,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
} from 'three';
import { APP_MODES, getBodyById, getLensById } from '../../config/cameraConfig.js';
import {
  ANGLE_GUIDE_CONFIG,
  BOKEH_SPHERES_CONFIG,
  CYCLORAMA_CONFIG,
  FLOOR_GRID_CONFIG,
} from '../../config/environmentConfig.js';
import { useCameraState } from '../../state/cameraStore.js';
import { useViewState } from '../../state/viewStore.js';
import { angleOfViewDeg } from '../../utils/cameraOptics.js';

const DEG = Math.PI / 180;

/** Frees GPU resources of objects created outside JSX (r3f does not dispose those). */
function useDisposeOnUnmount(...resources) {
  useLayoutEffect(
    () => () => {
      for (const resource of resources) resource?.dispose?.();
    },
    resources, // eslint-disable-line react-hooks/exhaustive-deps
  );
}

/**
 * Profile of the sweep in the (z, y) plane, front to top, with normals:
 * floor apron → cove (quarter circle) → wall.
 */
function cycloramaProfile({ wallZ, heightM, coveRadiusM: r, apronFrontZ, apronLiftM: lift, coveSegments }) {
  const points = [
    { z: apronFrontZ, y: lift, nz: 0, ny: 1 },
    { z: wallZ + r, y: lift, nz: 0, ny: 1 },
  ];
  for (let i = 1; i <= coveSegments; i++) {
    const theta = (i / coveSegments) * (Math.PI / 2);
    // Normal points to the cove's center: up at the floor, +Z at the wall.
    points.push({ z: wallZ + r - r * Math.sin(theta), y: lift + r - r * Math.cos(theta), nz: Math.sin(theta), ny: Math.cos(theta) });
  }
  points.push({ z: wallZ, y: heightM, nz: 1, ny: 0 });
  return points;
}

function createCycloramaGeometry(config) {
  const profile = cycloramaProfile(config);
  const half = config.widthM / 2;
  const positions = [];
  const normals = [];
  for (const { z, y, nz, ny } of profile) {
    positions.push(-half, y, z, half, y, z);
    normals.push(0, ny, nz, 0, ny, nz);
  }
  const index = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const a = i * 2;
    const c = a + 1;
    const b = a + 2;
    const d = a + 3;
    // Counter-clockwise seen from the subject's side.
    index.push(a, c, b, c, d, b);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

/** 18% gray sweep: receives shadows, never casts them (lights behind it still reach the subject). */
function Cyclorama({ brightness }) {
  const geometry = useMemo(() => createCycloramaGeometry(CYCLORAMA_CONFIG), []);
  useDisposeOnUnmount(geometry);
  // setHex converts sRGB #767676 to linear 0.184; scaling the linear value
  // scales the reflectance (2× = +1 EV). 0 = black.
  const color = useMemo(() => new Color().setHex(parseInt(CYCLORAMA_CONFIG.color.slice(1), 16)).multiplyScalar(brightness), [brightness]);
  return (
    <mesh name="cyclorama" geometry={geometry} receiveShadow castShadow={false}>
      <meshStandardMaterial
        color={color}
        roughness={CYCLORAMA_CONFIG.roughness}
        metalness={CYCLORAMA_CONFIG.metalness}
        // Wins the depth test against the studio floor it lies on.
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-4}
      />
    </mesh>
  );
}

/** Emissive point highlights behind the subject (bokeh test targets). They light nothing. */
function BokehSpheres({ offset }) {
  const spheres = useMemo(
    () =>
      BOKEH_SPHERES_CONFIG.spheres.map(([x, y, z, radius, hex], i) => ({
        key: i,
        position: [x, y, z],
        radius,
        // Linear HDR color: blooms into a disc in the DoF pass, clips to white when sharp.
        color: new Color(hex).multiplyScalar(BOKEH_SPHERES_CONFIG.intensity),
      })),
    [],
  );
  return (
    // One THREE.Group: the offset sliders move all spheres together.
    <group name="bokeh-spheres" position={offset}>
      {spheres.map((sphere) => (
        <mesh key={sphere.key} position={sphere.position} castShadow={false} receiveShadow={false}>
          <sphereGeometry args={[sphere.radius, 20, 14]} />
          <meshBasicMaterial color={sphere.color} />
        </mesh>
      ))}
    </group>
  );
}

function FloorGrid() {
  const grid = useMemo(() => {
    const { sizeM, divisions, centerColor, lineColor, opacity, heightM } = FLOOR_GRID_CONFIG;
    const helper = new GridHelper(sizeM, divisions, centerColor, lineColor);
    helper.name = 'floor-grid';
    helper.position.y = heightM;
    helper.material.transparent = true;
    helper.material.opacity = opacity;
    helper.material.depthWrite = false;
    return helper;
  }, []);
  useDisposeOnUnmount(grid);
  return <primitive object={grid} />;
}

/** Text label as a camera-facing sprite (canvas texture, no font loading). */
function createLabel(text, heightM, color) {
  const fontPx = 48;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  context.font = `600 ${fontPx}px system-ui, sans-serif`;
  const width = Math.ceil(context.measureText(text).width) + 16;
  canvas.width = width;
  canvas.height = fontPx + 16;
  context.font = `600 ${fontPx}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 8;
  context.strokeStyle = 'rgba(0, 0, 0, 0.75)';
  context.strokeText(text, width / 2, canvas.height / 2);
  context.fillStyle = color;
  context.fillText(text, width / 2, canvas.height / 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  const sprite = new Sprite(material);
  sprite.scale.set((heightM * width) / canvas.height, heightM, 1);
  sprite.renderOrder = ANGLE_GUIDE_CONFIG.renderOrder + 1;
  sprite.userData.dispose = () => {
    texture.dispose();
    material.dispose();
  };
  return sprite;
}

function createLines(positions, color, opacity = 0.9) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const material = new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });
  const lines = new LineSegments(geometry, material);
  lines.renderOrder = ANGLE_GUIDE_CONFIG.renderOrder;
  lines.userData.dispose = () => {
    geometry.dispose();
    material.dispose();
  };
  return lines;
}

const floorPoint = (radius, azimuthDeg, y) => [radius * Math.sin(azimuthDeg * DEG), y, radius * Math.cos(azimuthDeg * DEG)];

/** Protractor: rings every meter, rays every 15°, labels on the 45° rays and the rings. */
function createProtractor() {
  const c = ANGLE_GUIDE_CONFIG;
  const y = c.heightM;
  const major = [];
  const minor = [];
  for (const radius of c.ringRadiiM) {
    const segments = 96;
    for (let i = 0; i < segments; i++) {
      major.push(...floorPoint(radius, (i / segments) * 360, y), ...floorPoint(radius, ((i + 1) / segments) * 360, y));
    }
  }
  for (let az = -180 + c.rayStepDeg; az <= 180; az += c.rayStepDeg) {
    const target = az % c.majorStepDeg === 0 ? major : minor;
    target.push(...floorPoint(c.innerRadiusM, az, y), ...floorPoint(c.outerRadiusM, az, y));
  }
  const objects = [createLines(major, c.majorColor), createLines(minor, c.minorColor, 0.7)];
  for (let az = -135; az <= 180; az += c.majorStepDeg) {
    const text = az === 0 ? '0° front' : az === 180 ? '180° back' : `${az > 0 ? '+' : ''}${az}°`;
    const label = createLabel(text, c.labelHeightM, c.majorColor);
    label.position.set(...floorPoint(c.labelRadiusM, az, c.labelHeightM / 2 + 0.01));
    objects.push(label);
  }
  for (const radius of c.ringRadiiM) {
    const label = createLabel(`${radius} m`, c.ringLabelHeightM, c.majorColor);
    label.position.set(...floorPoint(radius, 22.5, c.ringLabelHeightM / 2 + 0.01));
    objects.push(label);
  }
  return objects;
}

/** Photo camera floor position and its horizontal angle of view (a wedge on the floor). */
function CameraWedge() {
  const { bodyId, lensId, shootingDistanceM } = useCameraState();
  const horizontalAovDeg = angleOfViewDeg(getBodyById(bodyId).sensor.widthMm, getLensById(lensId).focalLengthMm);
  const objects = useMemo(() => {
    const c = ANGLE_GUIDE_CONFIG;
    const y = c.heightM;
    const half = (horizontalAovDeg / 2) * DEG;
    const length = c.cameraWedgeLengthM;
    const origin = [0, y, shootingDistanceM];
    const edge = (sign) => [sign * length * Math.sin(half), y, shootingDistanceM - length * Math.cos(half)];
    const mark = 0.12;
    const lines = createLines(
      [
        ...origin, ...edge(-1),
        ...origin, ...edge(1),
        // Small cross at the camera position.
        -mark, y, shootingDistanceM, mark, y, shootingDistanceM,
        0, y, shootingDistanceM - mark, 0, y, shootingDistanceM + mark,
      ],
      c.cameraColor,
    );
    const label = createLabel(`CAMERA · ${horizontalAovDeg.toFixed(1)}° H`, c.ringLabelHeightM, c.cameraColor);
    label.position.set(0, c.ringLabelHeightM / 2 + 0.01, shootingDistanceM + 0.3);
    return [lines, label];
  }, [horizontalAovDeg, shootingDistanceM]);
  useLayoutEffect(() => () => objects.forEach((object) => object.userData.dispose()), [objects]);
  return objects.map((object) => <primitive key={object.uuid} object={object} />);
}

function AngleGuide({ showCamera }) {
  const objects = useMemo(createProtractor, []);
  useLayoutEffect(() => () => objects.forEach((object) => object.userData.dispose()), [objects]);
  return (
    // Hidden while a screenshot is taken (ScreenshotBridge.jsx).
    <group name="angle-guide" userData={{ hideInScreenshot: true }}>
      {objects.map((object) => (
        <primitive key={object.uuid} object={object} />
      ))}
      {showCamera && <CameraWedge />}
    </group>
  );
}

/**
 * Background, bokeh spheres, floor grid and angle guide. Mounted only while
 * toggled on, so hidden parts cost nothing. None of them casts shadows, so
 * shadow maps and the lighting on the subject are unaffected.
 */
export function StudioEnvironment({ appMode }) {
  const {
    showBackground,
    showBokehSpheres,
    showFloorGrid,
    showAngleGuide,
    backgroundBrightness,
    bokehOffsetX,
    bokehOffsetY,
    bokehOffsetZ,
  } = useViewState();
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    invalidate(); // frameloop="demand": draw the toggled scene
  }, [showBackground, showBokehSpheres, showFloorGrid, showAngleGuide, invalidate]);
  return (
    <group name="studio-environment">
      {showBackground && <Cyclorama brightness={backgroundBrightness} />}
      {showBokehSpheres && <BokehSpheres offset={[bokehOffsetX, bokehOffsetY, bokehOffsetZ]} />}
      {showFloorGrid && <FloorGrid />}
      {showAngleGuide && <AngleGuide showCamera={appMode === APP_MODES.LIGHTING} />}
    </group>
  );
}
