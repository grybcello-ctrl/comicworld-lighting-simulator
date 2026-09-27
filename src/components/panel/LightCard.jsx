import { getModifierById, getStrobeById } from '../../config/equipmentRegistry.js';
import { PLACEMENT_LIMITS } from '../../config/sceneConfig.js';
import { useLightingActions } from '../../state/LightingContext.jsx';
import { formatPowerStops } from '../../utils/lightMath.js';
import { EquipmentPicker } from './EquipmentPicker.jsx';
import { SliderField, ToggleField } from './fields.jsx';

const formatDegrees = (value) => `${value}°`;
const formatMeters = (value) => `${value.toFixed(2)} m`;
const formatKelvin = (value) => `${value} K`;

export function LightCard({ light, isSelected }) {
  const { updateLight, updatePlacement, removeLight, selectLight } = useLightingActions();
  const strobe = getStrobeById(light.strobeId);
  const modifier = getModifierById(light.modifierId);
  if (!strobe) return null;

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
        <span className="light-card__power">{formatPowerStops(light.powerStops)}</span>
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

          <h3 className="light-card__subtitle">Output</h3>
          <SliderField
            label="Power"
            value={light.powerStops}
            min={strobe.powerRange.minStops}
            max={strobe.powerRange.maxStops}
            step={strobe.powerRange.stepStops}
            onChange={(powerStops) => update({ powerStops })}
            formatValue={formatPowerStops}
          />
          <SliderField
            label="Color temperature"
            value={light.colorTempK}
            min={strobe.colorTempRange.minK}
            max={strobe.colorTempRange.maxK}
            step={50}
            onChange={(colorTempK) => update({ colorTempK })}
            formatValue={formatKelvin}
          />

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
