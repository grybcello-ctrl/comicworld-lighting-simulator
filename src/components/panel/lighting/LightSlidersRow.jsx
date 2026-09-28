import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { LIGHT_MODELS } from '../../../config/equipmentConfig.js';
import { getModifierById, getStrobeById } from '../../../config/equipmentRegistry.js';
import { FOCUS_ROD_LIMITS, PLACEMENT_LIMITS } from '../../../config/sceneConfig.js';
import { DEFAULT_PLACEMENT, useLightingActions, useLightingState } from '../../../state/LightingContext.jsx';
import { kelvinToHex } from '../../../utils/colorTemperature.js';
import { formatPowerLevel, formatWs, powerLevelToWs, snapPowerLevel } from '../../../utils/lightMath.js';
import { IconButton, RowGroup } from '../../ui/IconButton.jsx';
import { EnvironmentSliders } from '../EnvironmentControls.jsx';
import { ColorSwatch, SliderField, ToggleField } from '../fields.jsx';

const formatDegrees = (value) => `${value}°`;
const formatSignedDegrees = (value) => `${value > 0 ? '+' : ''}${value}°`;
const formatMeters = (value) => `${value.toFixed(2)} m`;
const formatShift = (value) => `${value > 0 ? '+' : ''}${value.toFixed(2)} m`;

const OFFSET_SLIDERS = [
  { key: 'shiftX', label: 'Shift X', tooltip: 'Shift X: left − / right + (moves the fixture, keeps its aim)', format: formatShift },
  { key: 'shiftY', label: 'Shift Y', tooltip: 'Shift Y: down − / up +', format: formatShift },
  { key: 'shiftZ', label: 'Shift Z', tooltip: 'Shift Z: back − / front +', format: formatShift },
  { key: 'tiltDeg', label: 'Tilt', tooltip: 'Tilt: aim down − / up +', format: formatSignedDegrees },
  { key: 'panDeg', label: 'Pan', tooltip: 'Pan: aim left − / right + (seen from behind the fixture)', format: formatSignedDegrees },
  { key: 'rollDeg', label: 'Roll', tooltip: 'Roll: clockwise + (seen from behind)', format: formatSignedDegrees },
];

/** Row 2 (lighting mode): the selected light's sliders side by side, then the environment sliders. */
export function LightSlidersRow() {
  const { lights, selectedLightId } = useLightingState();
  const { updateLight, updatePlacement } = useLightingActions();
  const [showOffsets, setShowOffsets] = useState(false);
  const light = lights.find((item) => item.id === selectedLightId) ?? null;
  const strobe = light && getStrobeById(light.strobeId);

  if (!light || !strobe) {
    return (
      <>
        <span className="row-empty">No light selected — add one with + in the first row.</span>
        <EnvironmentSliders />
      </>
    );
  }

  const update = (changes) => updateLight(light.id, changes);
  const place = (changes) => updatePlacement(light.id, changes);
  const isParabolic = getModifierById(light.modifierId)?.lighting.model === LIGHT_MODELS.PARABOLIC;
  const offsetCount = OFFSET_SLIDERS.filter(({ key }) => light.placement[key] !== DEFAULT_PLACEMENT[key]).length;
  const placementSlider = (key, label, format, tooltip) => (
    <SliderField
      compact
      key={key}
      label={label}
      value={light.placement[key]}
      {...PLACEMENT_LIMITS[key]}
      onChange={(value) => place({ [key]: value })}
      formatValue={format}
      tooltip={tooltip}
    />
  );

  return (
    <>
      <RowGroup title={`Output · ${light.label}`}>
        <SliderField
          compact
          label="Power"
          value={light.powerLevel}
          {...strobe.powerLevelRange}
          onChange={(value) => update({ powerLevel: snapPowerLevel(value, strobe.powerLevelRange) })}
          formatValue={(level) => `${formatPowerLevel(level)} · ${formatWs(powerLevelToWs(strobe.maxWs, level))}`}
          tooltip="Power: +1.0 = 1 stop (2× energy) · 10.0 = full power"
        />
        {isParabolic && (
          <SliderField
            compact
            label="Focusing rod"
            value={light.focusRod}
            min={FOCUS_ROD_LIMITS.min}
            max={FOCUS_ROD_LIMITS.max}
            step={FOCUS_ROD_LIMITS.step}
            onChange={(focusRod) => update({ focusRod })}
            tooltip="Focusing rod: 0 = head deep inside (spot: narrow, hard) · 100 = head out (flood: wide, soft)"
          />
        )}
      </RowGroup>

      <RowGroup title="Color">
        <ToggleField
          label="K"
          className="toggle--mini"
          checked={light.colorTempEnabled}
          onChange={(colorTempEnabled) => update({ colorTempEnabled })}
          title={light.colorTempEnabled ? 'Color temperature on' : 'Color temperature off: neutral white (#FFFFFF, D65 white point)'}
        />
        <SliderField
          compact
          label="Kelvin"
          value={light.colorTempK}
          min={strobe.colorTempRange.minK}
          max={strobe.colorTempRange.maxK}
          step={strobe.colorTempRange.stepK}
          disabled={!light.colorTempEnabled}
          onChange={(colorTempK) => update({ colorTempK })}
          formatValue={(kelvin) => (
            <span className="readout__swatch-value">
              <ColorSwatch color={kelvinToHex(kelvin)} />
              {kelvin} K
            </span>
          )}
          tooltip="Color temperature: 3200 K tungsten · 5600 K daylight flash · 6500 K D65"
        />
      </RowGroup>

      <RowGroup title="Placement (orbit, re-aims)">
        {placementSlider('azimuthDeg', 'Azimuth', formatDegrees, 'Azimuth around the subject: 0° = camera side, +90° = subject’s left')}
        {placementSlider('elevationDeg', 'Elevation', formatDegrees, 'Elevation above the head')}
        {placementSlider('distance', 'Distance', formatMeters, 'Orbit distance to the head (m)')}
        <IconButton
          icon={SlidersHorizontal}
          caption={offsetCount ? `Offsets ${offsetCount}` : 'Offsets'}
          label={showOffsets ? 'Hide shift / tilt sliders' : 'Show shift / tilt sliders'}
          active={showOffsets}
          onClick={() => setShowOffsets((value) => !value)}
        />
      </RowGroup>

      {showOffsets && (
        <RowGroup title="Shift & tilt">
          {OFFSET_SLIDERS.map(({ key, label, format, tooltip }) => placementSlider(key, label, format, tooltip))}
          <IconButton
            icon={RotateCcw}
            label="Reset shift & tilt"
            disabled={offsetCount === 0}
            onClick={() => place(Object.fromEntries(OFFSET_SLIDERS.map(({ key }) => [key, DEFAULT_PLACEMENT[key]])))}
          />
        </RowGroup>
      )}

      <EnvironmentSliders />
    </>
  );
}
