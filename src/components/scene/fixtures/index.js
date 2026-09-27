/**
 * Renderer registries: map the `shape` keys used in equipmentConfig to
 * React components. Adding a new visual shape = add one entry here.
 */
import { BoxBody, CylinderBody } from './strobeBodies.jsx';
import {
  BareBulbMesh,
  BeautyDishMesh,
  OctaSoftboxMesh,
  ParabolicMesh,
  RectSoftboxMesh,
  ReflectorMesh,
  UmbrellaMesh,
} from './modifierMeshes.jsx';

export const STROBE_BODY_RENDERERS = {
  cylinder: CylinderBody,
  box: BoxBody,
};

export const MODIFIER_RENDERERS = {
  none: BareBulbMesh,
  reflector: ReflectorMesh,
  rectSoftbox: RectSoftboxMesh,
  octaSoftbox: OctaSoftboxMesh,
  umbrella: UmbrellaMesh,
  beautyDish: BeautyDishMesh,
  parabolic: ParabolicMesh,
};

const warnedShapes = new Set();

/** Looks up a renderer, warning once (instead of crashing) for unknown shapes. */
export function resolveRenderer(registry, shape, fallbackKey) {
  const renderer = registry[shape];
  if (renderer) return renderer;
  if (!warnedShapes.has(shape)) {
    console.warn(`[fixtures] No renderer registered for shape "${shape}".`);
    warnedShapes.add(shape);
  }
  return registry[fallbackKey] ?? null;
}
