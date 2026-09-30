/**
 * Icons and short captions for the equipment chips. The
 * full catalog name is always the tooltip / accessible name; unknown catalog
 * entries fall back to a category icon and a shortened name, so new
 * equipment appears without UI changes.
 */
import {
  BatteryCharging,
  ChevronsUpDown,
  Circle,
  CircleDot,
  Disc3,
  Flashlight,
  Gem,
  Lightbulb,
  Octagon,
  Palette,
  Radar,
  RectangleVertical,
  SatelliteDish,
  Sparkles,
  Square,
  Target,
  Triangle,
  Umbrella,
  Waypoints,
  Zap,
} from 'lucide-react';

const STROBE_CATEGORY_ICONS = {
  profotoB10: Zap,
  monolight: Lightbulb,
  packHead: BatteryCharging,
  speedlight: Flashlight,
};

const STROBE_CAPTIONS = {
  'profoto-b10': 'B10',
  'profoto-b10-plus': 'B10 Plus',
  'profoto-b10x-plus': 'B10X Plus',
  'monolight-400': 'Mono 400',
  'monolight-600': 'Mono 600',
  'pack-head-1200': 'Pack 1200',
  'speedlight-76': 'Speedlight',
};

const MODIFIER_SHAPE_ICONS = {
  parabolic: SatelliteDish,
  octaSoftbox: Octagon,
  rectSoftbox: Square,
  beautyDish: Disc3,
  reflector: Radar,
  umbrella: Umbrella,
  none: CircleDot,
};

const MODIFIER_CAPTIONS = {
  'broncolor-para-133hr': 'Para 133',
  'parabolix-35d': '35D',
  'profoto-ocf-softbox-1x4': 'OCF 1×4',
  'profoto-rfi-octa-3': 'Octa 3′',
  'profoto-ocf-beauty-dish-white-2': 'OCF BD 2′',
  'profoto-zoom-reflector-white': 'Zoom Refl.',
  'bare-bulb': 'Bare',
  'standard-reflector-18': 'Refl. 18',
  'softbox-60x90': '60×90',
  'stripbox-30x120': 'Strip 30×120',
  'octabox-120': 'Octa 120',
  'umbrella-white-105': 'Umbr. 105',
  'beauty-dish-55': 'BD 55',
  'speedlight-softbox-40': 'SB Box 40',
};

const PRESET_ICONS = {
  'para-fashion': Sparkles,
  'parabolix-beauty': Gem,
  'gel-split': Palette,
  'grid-spot-drama': Target,
  rembrandt: Triangle,
  clamshell: ChevronsUpDown,
  'three-point': Waypoints,
};

const PRESET_CAPTIONS = {
  'para-fashion': 'Fashion',
  'parabolix-beauty': 'Beauty',
  'gel-split': 'Gel Split',
  'grid-spot-drama': 'Drama',
  rembrandt: 'Rembrandt',
  clamshell: 'Clamshell',
  'three-point': '3-Point',
};

/** "Profoto B10 Plus (500Ws)" → "Profoto B10 Plus" (drops the parenthesis), max 12 chars. */
const shorten = (name) => {
  const base = name.replace(/\s*\(.*\)\s*$/, '');
  return base.length > 12 ? `${base.slice(0, 11)}…` : base;
};

export function strobeIcon(strobe) {
  return {
    icon: STROBE_CATEGORY_ICONS[strobe.category] ?? Zap,
    caption: STROBE_CAPTIONS[strobe.id] ?? shorten(strobe.name),
  };
}

export function modifierIcon(modifier) {
  const { shape, width, height } = modifier.geometry ?? {};
  // Tall rectangular boxes (strips) read better as a vertical rectangle.
  const isStrip = shape === 'rectSoftbox' && width && height && Math.max(width, height) / Math.min(width, height) > 2;
  return {
    icon: isStrip ? RectangleVertical : (MODIFIER_SHAPE_ICONS[shape] ?? Circle),
    caption: MODIFIER_CAPTIONS[modifier.id] ?? shorten(modifier.name),
  };
}

export function presetIcon(preset) {
  return {
    icon: PRESET_ICONS[preset.id] ?? Sparkles,
    caption: PRESET_CAPTIONS[preset.id] ?? shorten(preset.name),
  };
}
