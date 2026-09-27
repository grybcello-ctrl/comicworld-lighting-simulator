/**
 * Read-only query layer over the equipment catalog.
 * Components should use these helpers instead of touching the raw arrays,
 * so the catalog can later be loaded from JSON / an API without UI changes.
 */
import { equipmentConfig } from './equipmentConfig.js';

const { strobes, modifiers, grids, strobeCategories, modifierCategories } = equipmentConfig;

const strobeById = new Map(strobes.map((strobe) => [strobe.id, strobe]));
const modifierById = new Map(modifiers.map((modifier) => [modifier.id, modifier]));
const gridById = new Map(grids.map((grid) => [grid.id, grid]));

export const getAllStrobes = () => strobes;
export const getAllModifiers = () => modifiers;
export const getAllGrids = () => grids;

export const getStrobeById = (id) => strobeById.get(id) ?? null;
export const getModifierById = (id) => modifierById.get(id) ?? null;
export const getGridById = (id) => (id ? (gridById.get(id) ?? null) : null);

/** Native mount plus any mounts reachable through an official adapter. */
const getUsableMounts = (strobe) => [strobe.mount, ...(strobe.adapterMounts ?? [])];

const fitsStrobe = (strobe, modifier) =>
  getUsableMounts(strobe).some((mount) => modifier.mounts.includes(mount));

/** True if the modifier can be mounted on the given strobe. */
export function isModifierCompatible(strobeId, modifierId) {
  const strobe = getStrobeById(strobeId);
  const modifier = getModifierById(modifierId);
  if (!strobe || !modifier) return false;
  return fitsStrobe(strobe, modifier);
}

/** All modifiers that fit the given strobe's mount (directly or via adapter). */
export function getCompatibleModifiers(strobeId) {
  const strobe = getStrobeById(strobeId);
  if (!strobe) return [];
  return modifiers.filter((modifier) => fitsStrobe(strobe, modifier));
}

/** Grids that can be fitted to the given modifier. */
export function getCompatibleGrids(modifierId) {
  const modifier = getModifierById(modifierId);
  return (modifier?.gridIds ?? []).map(getGridById).filter(Boolean);
}

export const isGridCompatible = (modifierId, gridId) =>
  getCompatibleGrids(modifierId).some((grid) => grid.id === gridId);

/**
 * Groups items by their `category` field, preserving the order defined in
 * the category map. Unknown categories are appended at the end.
 * @returns {{ key: string, label: string, items: any[] }[]}
 */
function groupByCategory(items, categoryMap) {
  const groups = new Map(
    Object.entries(categoryMap).map(([key, meta]) => [key, { key, label: meta.label, items: [] }]),
  );
  for (const item of items) {
    if (!groups.has(item.category)) {
      groups.set(item.category, { key: item.category, label: item.category, items: [] });
    }
    groups.get(item.category).items.push(item);
  }
  return [...groups.values()].filter((group) => group.items.length > 0);
}

export const groupStrobesByCategory = (items = strobes) => groupByCategory(items, strobeCategories);
export const groupModifiersByCategory = (items = modifiers) =>
  groupByCategory(items, modifierCategories);

/** Development-time sanity checks for catalog entries. */
function validateCatalog() {
  const assertUniqueIds = (items, label) => {
    const seen = new Set();
    for (const item of items) {
      if (seen.has(item.id)) console.error(`[equipment] Duplicate ${label} id: "${item.id}"`);
      seen.add(item.id);
    }
  };
  assertUniqueIds(strobes, 'strobe');
  assertUniqueIds(modifiers, 'modifier');
  assertUniqueIds(grids, 'grid');

  for (const modifier of modifiers) {
    for (const gridId of modifier.gridIds ?? []) {
      if (!gridById.has(gridId)) {
        console.error(`[equipment] Modifier "${modifier.id}" references unknown grid "${gridId}".`);
      }
    }
  }

  for (const strobe of strobes) {
    if (!getCompatibleModifiers(strobe.id).length) {
      console.warn(`[equipment] Strobe "${strobe.id}" has no compatible modifiers.`);
    }
  }
}

if (import.meta.env.DEV) validateCatalog();
