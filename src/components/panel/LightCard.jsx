import { LIGHT_MODELS } from '../../config/equipmentConfig.js';
import {
  getCompatibleGrids,
  getGridById,
  getModifierById,
  getStrobeById,
} from '../../config/equipmentRegistry.js';
import { FOCUS_ROD_LIMITS, PLACEMENT_LIMITS } from '../../config/sceneConfig.js';
import { useLightingActions } from '../../state/LightingContext.jsx';
import { resolveLightRig } from '../../utils/beamModel.js';
import { formatPowerLevel, formatWs, powerLevelToWs, snapPowerLevel } from '../../utils/lightMath.js';
import { EquipmentPicker } from './EquipmentPicker.jsx';
import { ReadoutList, SelectField, SliderField, ToggleField } from './fields.jsx';

const formatDegrees = (value) => `${value}°`;
const formatMeters = (value) => `${value.toFixed(2)} m`;
const formatKelvin = (value) => `${value} K`;
const formatStops = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(1)} EV`;

/** Computed beam parameters, so users can see what the physics resolved to. */
function BeamReadout({ light, strobe, modifier }) {
  const rig = resolveLightRig({
    strobe,
    modifier,
    grid: getGridById(light.gridId),
    powerLevel: light.powerLevel,
    focusRod: light.focusRod,
    distance: light.placement.distance,
  });
  const { info } = rig;
  const items = [
    { label: 'Beam angle', value: `${info.beamAngleDeg.toFixed(1)}°` },
    { label: 'Penumbra', value: info.penumbra.toFixed(2) },
    {
      label: rig.model === LIGHT_MODELS.AREA ? 'Falloff exponent (near field)' : 'Decay',
      value: info.decay.toFixed(2),
    },
    { label: 'Footprint at subject', value: `Ø ${info.footprintM.toFixed(2)} m` },
    { label: 'Center gain / losses', value: `${formatStops(info.gainStops)} / ${formatStops(-info.lossStops)}` },
  ];
  if (info.emitterAreaM2) {
    items.push({ label: 'Emitting area', value: `${info.emitterAreaM2.toFixed(3)} m²` });
  }
  return <ReadoutList items={items} />;
}

export function LightCard({ light, isSelected }) {
  const { updateLight, updatePlacement, removeLight, selectLight } = useLightingActions();
  const strobe = getStrobeById(light.strobeId);
  const modifier = getModifierById(light.modifierId);
  if (!strobe) return null;

  const grids = getCompatibleGrids(light.modifierId);
  const isParabolic = modifier?.lighting.model === LIGHT_MODELS.PARABOLIC;

  const update = (changes) => updateLight(light.id, changes);
  const place = (changes) => updatePlacement(light.id, changes);

  return (
    <article className={`light-card ${isSelected ? 'light-card--selected' : ''}`}>
      <header className="light-card__header" onClick={() => selectLight(light.id)}>
        <span className={`light-card__dot ${light.enabled ? 'light-card__dot--on' : ''}`} />
        <div className="light-card__titles">
          <strong>{light.label}</strong>
          <small>
            {strobe.name} · {modifier?.name ?? '—'}
          </small>
        </div>
        <span className="light-card__power">{formatPowerLevel(light.powerLevel)}</span>
      </header>

      {isSelected && (
        <div className="light-card__body">
          <div className="light-card__row">
            <input
              className="text-input"
              value={light.label}
              onChange={(event) => update({ label: event.target.value })}
              aria-label="Light name"
            />
            <ToggleField label="On" checked={light.enabled} onChange={(enabled) => update({ enabled })} />
          </div>

          <EquipmentPicker
            strobeId={light.strobeId}
            modifierId={light.modifierId}
            onStrobeChange={(strobeId) => update({ strobeId })}
            onModifierChange={(modifierId) => update({ modifierId })}
          />

          {grids.length > 0 && (
            <SelectField
              label="Grid"
              value={light.gridId}
              options={[
                { value: null, label: 'No grid' },
                ...grids.map((grid) => ({ value: grid.id, label: grid.name })),
              ]}
              onChange={(gridId) => update({ gridId })}
            />
          )}

          <h3 className="light-card__subtitle">Output</h3>
          <SliderField
            label="Power"
            value={light.powerLevel}
            {...strobe.powerLevelRange}
            onChange={(value) => update({ powerLevel: snapPowerLevel(value, strobe.powerLevelRange) })}
            formatValue={(level) =>
              `${formatPowerLevel(level)} · ${formatWs(powerLevelToWs(strobe.maxWs, level))}`
            }
            hint="+1.0 = 1 stop (2× energy) · 10.0 = full power"
          />
          {isParabolic && (
            <SliderField
              label="Focusing rod"
              value={light.focusRod}
              min={FOCUS_ROD_LIMITS.min}
              max={FOCUS_ROD_LIMITS.max}
              step={FOCUS_ROD_LIMITS.step}
              onChange={(focusRod) => update({ focusRod })}
              hint="0 = focused spot (punchy) · 100 = flooded (wide, soft)"
            />
          )}
          <SliderField
            label="Color temperature"
            value={light.colorTempK}
            min={strobe.colorTempRange.minK}
            max={strobe.colorTempRange.maxK}
            step={50}
            onChange={(colorTempK) => update({ colorTempK })}
            formatValue={formatKelvin}
          />
          {modifier && <BeamReadout light={light} strobe={strobe} modifier={modifier} />}

          <h3 className="light-card__subtitle">Placement</h3>
          <SliderField
            label="Azimuth"
            value={light.placement.azimuthDeg}
            {...PLACEMENT_LIMITS.azimuthDeg}
            onChange={(azimuthDeg) => place({ azimuthDeg })}
            formatValue={formatDegrees}
          />
          <SliderField
            label="Elevation"
            value={light.placement.elevationDeg}
            {...PLACEMENT_LIMITS.elevationDeg}
            onChange={(elevationDeg) => place({ elevationDeg })}
            formatValue={formatDegrees}
          />
          <SliderField
            label="Distance"
            value={light.placement.distance}
            {...PLACEMENT_LIMITS.distance}
            onChange={(distance) => place({ distance })}
            formatValue={formatMeters}
          />

          <button type="button" className="button button--danger" onClick={() => removeLight(light.id)}>
            Remove light
          </button>
        </div>
      )}
    </article>
  );
}
