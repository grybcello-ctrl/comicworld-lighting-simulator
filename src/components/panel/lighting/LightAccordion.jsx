import {
  ArrowUpDown,
  ArrowUpFromDot,
  CircleSlash,
  Compass,
  Crosshair,
  Grid3x3,
  Layers,
  Lightbulb,
  MoveDiagonal2,
  MoveHorizontal,
  MoveVertical,
  Palette,
  Power,
  RotateCcw,
  RotateCw,
  Ruler,
  SlidersHorizontal,
  Thermometer,
  Trash2,
  Umbrella,
  Zap,
} from 'lucide-react';
import { LIGHT_MODELS } from '../../../config/equipmentConfig.js';
import {
  getAllStrobes,
  getCompatibleGels,
  getCompatibleGrids,
  getCompatibleModifiers,
  getModifierById,
  getStrobeById,
} from '../../../config/equipmentRegistry.js';
import { FOCUS_ROD_LIMITS, PLACEMENT_LIMITS } from '../../../config/sceneConfig.js';
import { DEFAULT_PLACEMENT, useLightingActions } from '../../../state/LightingContext.jsx';
import { selectLightColor } from '../../../state/lightSelectors.js';
import { isSectionOpen, panelActions, usePanelState } from '../../../state/panelStore.js';
import { kelvinToHex, resolveLightColor } from '../../../utils/colorTemperature.js';
import { formatPowerLevel, formatWs, powerLevelToWs, snapPowerLevel } from '../../../utils/lightMath.js';
import { Accordion } from '../../ui/Accordion.jsx';
import { Chip, IconSlider } from '../../ui/IconSlider.jsx';
import { modifierIcon, strobeIcon } from '../equipmentIcons.js';

const signed = (value, digits = 2, unit = ' m') => `${value > 0 ? '+' : ''}${value.toFixed(digits)}${unit}`;

/** "Profoto B10X Plus (500Ws)" → "Profoto B10X Plus" */
export const strobeDisplayName = (strobe) => (strobe?.name ?? '?').replace(/\s*\(.*\)\s*$/, '');

/** Accordion title, e.g. "Profoto B10X Plus (Key Light)". */
export const lightTitle = (light) => `${strobeDisplayName(getStrobeById(light.strobeId))} (${light.label})`;

/** Icon at the left of a chip row (tooltip = what the chips choose). */
function ChipRow({ icon: Icon, label, children }) {
  return (
    <div className="chip-row" role="group" aria-label={label}>
      <span className="chip-row__icon" data-tooltip={label} aria-hidden="true">
        <Icon size={15} strokeWidth={1.8} />
      </span>
      <div className="chip-row__chips">{children}</div>
    </div>
  );
}

const OFFSET_SLIDERS = [
  { key: 'shiftX', icon: MoveHorizontal, label: 'Shift X (left − / right +)', format: (v) => signed(v) },
  { key: 'shiftY', icon: MoveVertical, label: 'Shift Y (down − / up +)', format: (v) => signed(v) },
  { key: 'shiftZ', icon: MoveDiagonal2, label: 'Shift Z (back − / front +)', format: (v) => signed(v) },
  { key: 'tiltDeg', icon: ArrowUpDown, label: 'Tilt (aim down − / up +)', format: (v) => signed(v, 0, '°') },
  { key: 'panDeg', icon: MoveHorizontal, label: 'Pan (aim left − / right +, seen from behind)', format: (v) => signed(v, 0, '°') },
  { key: 'rollDeg', icon: RotateCw, label: 'Roll (clockwise +, seen from behind)', format: (v) => signed(v, 0, '°') },
];

/**
 * One light as a Lightroom-style accordion: header = light, power switch and
 * output; body = icon sliders and equipment chips. Opening it selects the
 * light (3D highlight, light rays emphasis).
 */
export function LightAccordion({ light, isSelected, defaultOpen }) {
  const { updateLight, updatePlacement, removeLight, selectLight } = useLightingActions();
  usePanelState(); // re-render on accordion changes
  const strobe = getStrobeById(light.strobeId);
  const modifier = getModifierById(light.modifierId);
  if (!strobe) return null;

  const sectionId = `light-${light.id}`;
  const offsetsId = `light-offsets-${light.id}`;
  const open = isSectionOpen(sectionId, defaultOpen);
  const offsetsOpen = isSectionOpen(offsetsId, false);
  const update = (changes) => updateLight(light.id, changes);
  const place = (changes) => updatePlacement(light.id, changes);
  const color = selectLightColor(light);
  const isParabolic = modifier?.lighting.model === LIGHT_MODELS.PARABOLIC;
  const grids = getCompatibleGrids(light.modifierId);
  const diffuser = modifier?.accessories?.innerDiffuser;
  const gels = getCompatibleGels(light.strobeId);
  const offsetCount = OFFSET_SLIDERS.filter(({ key }) => light.placement[key] !== DEFAULT_PLACEMENT[key]).length;
  const ws = formatWs(powerLevelToWs(strobe.maxWs, light.powerLevel));
  const placement = (key, icon, label, format) => (
    <IconSlider
      key={key}
      icon={icon}
      label={label}
      value={light.placement[key]}
      {...PLACEMENT_LIMITS[key]}
      defaultValue={DEFAULT_PLACEMENT[key]}
      onChange={(value) => place({ [key]: value })}
      formatValue={format}
    />
  );

  return (
    <Accordion
      testId="light-accordion"
      className={`light-accordion ${isSelected ? 'light-accordion--selected' : ''} ${light.enabled ? '' : 'light-accordion--off'}`}
      open={open}
      onToggle={() => {
        panelActions.toggleSection(sectionId, defaultOpen);
        if (!isSelected) {
          panelActions.noteSelectionFromAccordion(light.id);
          selectLight(light.id);
        }
      }}
      leading={
        <span
          className={`light-card__dot ${light.enabled ? 'light-card__dot--on' : ''}`}
          style={light.enabled ? { '--dot-color': color.displayHex } : undefined}
          aria-hidden="true"
        />
      }
      title={lightTitle(light)}
      subtitle={`${modifier?.name ?? '—'} · ${formatPowerLevel(light.powerLevel)}`}
      headerExtra={
        <button
          type="button"
          className={`power-switch ${light.enabled ? 'power-switch--on' : ''}`}
          aria-pressed={light.enabled}
          aria-label={light.enabled ? `Turn ${light.label} off` : `Turn ${light.label} on`}
          data-tooltip={light.enabled ? 'On — click to switch off' : 'Off — click to switch on'}
          onClick={() => update({ enabled: !light.enabled })}
        >
          <Power size={14} aria-hidden="true" />
        </button>
      }
    >
      <IconSlider
        icon={Lightbulb}
        label="Power"
        tooltip="Power (광량): +1.0 = 1 stop (2× energy) · 10.0 = full power"
        value={light.powerLevel}
        {...strobe.powerLevelRange}
        defaultValue={7}
        onChange={(value) => update({ powerLevel: snapPowerLevel(value, strobe.powerLevelRange) })}
        formatValue={(level) => `${formatPowerLevel(level)} · ${ws}`}
      />
      {isParabolic && (
        <IconSlider
          icon={Crosshair}
          label="Focusing rod"
          tooltip="Focusing rod: 0 = head deep inside (spot: narrow, hard) · 100 = head out (flood: wide, soft)"
          value={light.focusRod}
          min={FOCUS_ROD_LIMITS.min}
          max={FOCUS_ROD_LIMITS.max}
          step={FOCUS_ROD_LIMITS.step}
          defaultValue={FOCUS_ROD_LIMITS.default}
          onChange={(focusRod) => update({ focusRod })}
          formatValue={(value) => `${value}`}
        />
      )}
      <IconSlider
        icon={Thermometer}
        label="Kelvin"
        tooltip={light.colorTempEnabled ? 'Color temperature: 3200 K tungsten · 5600 K daylight flash · 6500 K D65' : 'Color temperature off (neutral white) — switch it on with the K chip below'}
        value={light.colorTempK}
        min={strobe.colorTempRange.minK}
        max={strobe.colorTempRange.maxK}
        step={strobe.colorTempRange.stepK}
        defaultValue={strobe.colorTempK}
        disabled={!light.colorTempEnabled}
        accent={light.colorTempEnabled ? kelvinToHex(light.colorTempK) : undefined}
        onChange={(colorTempK) => update({ colorTempK })}
        formatValue={(kelvin) => `${kelvin} K`}
      />
      {placement('azimuthDeg', Compass, 'Azimuth (0° = camera side, +90° = subject’s left)', (v) => `${v}°`)}
      {placement('elevationDeg', ArrowUpFromDot, 'Elevation above the head', (v) => `${v}°`)}
      {placement('distance', Ruler, 'Distance to the head', (v) => `${v.toFixed(2)} m`)}

      <ChipRow icon={Zap} label="Strobe">
        {getAllStrobes().map((item) => (
          <Chip
            key={item.id}
            label={strobeIcon(item).caption}
            tooltip={item.name}
            active={light.strobeId === item.id}
            onClick={() => update({ strobeId: item.id })}
          />
        ))}
      </ChipRow>
      <ChipRow icon={Umbrella} label="Modifier (fits this strobe)">
        {getCompatibleModifiers(light.strobeId).map((item) => {
          const { icon, caption } = modifierIcon(item);
          return (
            <Chip
              key={item.id}
              icon={icon}
              label={caption}
              tooltip={item.name}
              active={light.modifierId === item.id}
              onClick={() => update({ modifierId: item.id })}
            />
          );
        })}
      </ChipRow>
      {(grids.length > 0 || diffuser) && (
        <ChipRow icon={Grid3x3} label="Grid / diffuser">
          {grids.length > 0 && <Chip icon={CircleSlash} label="No grid" tooltip="No grid" active={!light.gridId} onClick={() => update({ gridId: null })} />}
          {grids.map((grid) => (
            <Chip key={grid.id} label={grid.name.replace(/\s*\(.*\)/, '')} tooltip={`Grid · ${grid.name}`} active={light.gridId === grid.id} onClick={() => update({ gridId: grid.id })} />
          ))}
          {diffuser && (
            <Chip
              icon={Layers}
              label="Diffuser"
              tooltip={`${diffuser.name} (−${diffuser.lightLossStops} EV, softer shadows)`}
              active={light.innerDiffuser}
              onClick={() => update({ innerDiffuser: !light.innerDiffuser })}
            />
          )}
        </ChipRow>
      )}
      <ChipRow icon={Palette} label="Color: Kelvin and OCF gels">
        <Chip
          label="K"
          tooltip={light.colorTempEnabled ? `Color temperature ${light.colorTempK} K — click for neutral white` : 'Neutral white — click to use the Kelvin slider'}
          active={light.colorTempEnabled}
          swatch={light.colorTempEnabled ? kelvinToHex(light.colorTempK) : '#ffffff'}
          onClick={() => update({ colorTempEnabled: !light.colorTempEnabled })}
        />
        {gels.length === 0 ? (
          <Chip label="No gel mount" tooltip="OCF gels fit Profoto B10-series heads only." disabled />
        ) : (
          <>
            <Chip icon={CircleSlash} label="No gel" tooltip="No gel" active={!light.gelEnabled} onClick={() => update({ gelEnabled: false })} />
            {gels.map((gel) => (
              <Chip
                key={gel.id}
                swatch={resolveLightColor(null, gel).displayHex}
                label={gel.name}
                tooltip={`Gel · ${gel.name}`}
                active={light.gelEnabled && light.gelId === gel.id}
                onClick={() => update({ gelEnabled: true, gelId: gel.id })}
              />
            ))}
          </>
        )}
      </ChipRow>

      <div className="light-accordion__footer">
        <button
          type="button"
          className={`text-button ${offsetsOpen ? 'text-button--active' : ''}`}
          aria-expanded={offsetsOpen}
          onClick={() => panelActions.toggleSection(offsetsId, false)}
          data-tooltip="Shift (move without re-aiming) and tilt / pan / roll"
        >
          <SlidersHorizontal size={13} aria-hidden="true" />
          Shift & tilt{offsetCount ? ` · ${offsetCount}` : ''}
        </button>
        <input
          className="text-input text-input--small"
          value={light.label}
          onChange={(event) => update({ label: event.target.value })}
          aria-label="Light name"
          data-tooltip="Light name"
        />
        <button
          type="button"
          className="icon-only-button icon-only-button--danger"
          aria-label={`Remove ${light.label}`}
          data-tooltip={`Remove ${light.label}`}
          onClick={() => removeLight(light.id)}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
      {offsetsOpen && (
        <div className="light-accordion__offsets">
          {OFFSET_SLIDERS.map(({ key, icon, label, format }) => placement(key, icon, label, format))}
          <button
            type="button"
            className="text-button"
            disabled={offsetCount === 0}
            onClick={() => place(Object.fromEntries(OFFSET_SLIDERS.map(({ key }) => [key, DEFAULT_PLACEMENT[key]])))}
          >
            <RotateCcw size={13} aria-hidden="true" /> Reset shift & tilt
          </button>
        </div>
      )}
    </Accordion>
  );
}
