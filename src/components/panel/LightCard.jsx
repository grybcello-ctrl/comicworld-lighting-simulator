import { LIGHT_MODELS } from '../../config/equipmentConfig.js';
import {
  getCompatibleGels,
  getCompatibleGrids,
  getModifierById,
  getStrobeById,
  groupGelsByCategory,
} from '../../config/equipmentRegistry.js';
import { FOCUS_ROD_LIMITS, PLACEMENT_LIMITS } from '../../config/sceneConfig.js';
import { DEFAULT_PLACEMENT, useLightingActions } from '../../state/LightingContext.jsx';
import { selectFixturePose, selectLightColor, selectLightRig } from '../../state/lightSelectors.js';
import { kelvinToHex } from '../../utils/colorTemperature.js';
import { formatPowerLevel, formatWs, powerLevelToWs, snapPowerLevel } from '../../utils/lightMath.js';
import { EquipmentPicker } from './EquipmentPicker.jsx';
import {
  ColorSwatch,
  GroupedSelectField,
  ReadoutList,
  SelectField,
  SliderField,
  ToggleField,
  ToggleSection,
} from './fields.jsx';

const formatDegrees = (value) => `${value}°`;
const formatSignedDegrees = (value) => `${value > 0 ? '+' : ''}${value}°`;
const formatMeters = (value) => `${value.toFixed(2)} m`;
const formatShift = (value) => `${value > 0 ? '+' : ''}${value.toFixed(2)} m`;
const formatKelvin = (value) => `${value} K`;
const formatStops = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(1)} EV`;
const formatCm = (meters) => `${(meters * 100).toFixed(meters < 0.1 ? 1 : 0)} cm`;

const SHIFT_KEYS = ['shiftX', 'shiftY', 'shiftZ', 'tiltDeg', 'panDeg', 'rollDeg'];

/** Resulting light color after the Kelvin/gel toggles and spectral mixing. */
function ColorReadout({ color, gelActive }) {
  const items = [
    {
      label: 'Emitted color (light.color)',
      value: (
        <span className="readout__swatch-value">
          <ColorSwatch color={color.displayHex} />
          {color.displayHex}
        </span>
      ),
    },
    {
      label: 'Resulting CCT',
      value: color.cctK ? `≈ ${Math.round(color.cctK / 10) * 10} K` : '— (saturated color)',
    },
  ];
  if (gelActive) {
    items.push({
      label: 'Gel transmission',
      value: `${(color.transmission * 100).toFixed(0)} % (−${color.lossStops.toFixed(1)} EV)`,
    });
  }
  return <ReadoutList items={items} />;
}

/** Computed beam and shadow parameters, so users can see what the physics resolved to. */
function BeamReadout({ rig, pose }) {
  const { info } = rig;
  const { shadow } = info;
  const items = [
    { label: '3D distance to subject', value: formatMeters(pose.distanceToSubject) },
    { label: 'Subject off beam axis', value: `${pose.subjectOffAxisDeg.toFixed(1)}°` },
    { label: 'Beam angle', value: `${info.beamAngleDeg.toFixed(1)}°` },
    { label: 'Penumbra (edge)', value: info.penumbra.toFixed(2) },
    {
      label:
        rig.model === LIGHT_MODELS.AREA
          ? 'Falloff exponent (near field)'
          : rig.model === LIGHT_MODELS.PARABOLIC
            ? 'Falloff exponent (vs. distance)'
            : 'Decay',
      value: info.decay.toFixed(2),
    },
    { label: 'Footprint at subject', value: `Ø ${info.footprintM.toFixed(2)} m` },
    { label: 'Center gain / losses', value: `${formatStops(info.gainStops)} / ${formatStops(-info.lossStops)}` },
    { label: 'Effective emitter', value: `Ø ${formatCm(info.sourceDiameterM)}` },
    { label: 'Apparent size', value: `${shadow.apparentSizeDeg.toFixed(1)}°` },
    { label: 'Shadow penumbra (10 cm gap)', value: formatCm(shadow.penumbraM) },
    {
      label: 'shadow.radius',
      value: `${shadow.radius.toFixed(2)} · ${shadow.mapSize}² @ ${(shadow.texelM * 1000).toFixed(1)} mm`,
    },
  ];
  if (info.emitterAreaM2) {
    items.push({ label: 'Emitting area', value: `${info.emitterAreaM2.toFixed(3)} m²` });
  }
  if (info.parabolic) {
    const { headZ, headDepthFraction, apexBehindApertureM, solidAngleSr, flatten, glowCoverage } =
      info.parabolic;
    items.push(
      {
        label: 'Head on rod (from apex)',
        value: `${formatCm(headZ)} · ${(headDepthFraction * 100).toFixed(0)}% of depth`,
      },
      { label: 'Lit dish area (glow)', value: `${(glowCoverage * 100).toFixed(0)} %` },
      { label: 'Beam solid angle Ω', value: `${solidAngleSr.toFixed(3)} sr` },
      { label: 'Center flattening', value: `${(flatten * 100).toFixed(0)} %` },
      { label: 'Virtual apex behind dish', value: formatMeters(apexBehindApertureM) },
    );
  }
  return <ReadoutList items={items} />;
}

/** Grid + inner diffuser controls for modifiers that support them. */
function AccessoryControls({ light, modifier, update }) {
  const grids = getCompatibleGrids(light.modifierId);
  const diffuser = modifier?.accessories?.innerDiffuser;
  if (grids.length === 0 && !diffuser) return null;

  return (
    <>
      <h3 className="light-card__subtitle">Accessories</h3>
      <div className="button-row">
        {diffuser && (
          <ToggleField
            label={`${diffuser.name} (−${diffuser.lightLossStops} EV, softer shadows)`}
            checked={light.innerDiffuser}
            onChange={(innerDiffuser) => update({ innerDiffuser })}
          />
        )}
        {grids.length === 1 && (
          <ToggleField
            label={`Grid · ${grids[0].name}`}
            checked={light.gridId === grids[0].id}
            onChange={(on) => update({ gridId: on ? grids[0].id : null })}
          />
        )}
      </div>
      {grids.length > 1 && (
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
    </>
  );
}

function ColorControls({ light, strobe, color, update }) {
  const compatibleGels = getCompatibleGels(light.strobeId);
  const gelsAvailable = compatibleGels.length > 0;
  return (
    <>
      <h3 className="light-card__subtitle">Color</h3>
      <ToggleSection
        label="Color temperature"
        checked={light.colorTempEnabled}
        onChange={(colorTempEnabled) => update({ colorTempEnabled })}
        hint={light.colorTempEnabled ? null : 'Off: neutral white light (#FFFFFF, D65 white point).'}
      >
        <SliderField
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
              {formatKelvin(kelvin)}
            </span>
          )}
          hint="3200K tungsten · 5600K daylight flash · 6500K D65"
        />
      </ToggleSection>
      <ToggleSection
        label="Color gel (OCF)"
        checked={light.gelEnabled}
        disabled={!gelsAvailable}
        onChange={(gelEnabled) => update({ gelEnabled })}
        hint={gelsAvailable ? null : 'OCF gels fit Profoto B10-series heads only.'}
      >
        {gelsAvailable && (
          <GroupedSelectField
            label="Gel"
            value={light.gelId ?? compatibleGels[0].id}
            groups={groupGelsByCategory(compatibleGels)}
            disabled={!light.gelEnabled}
            onChange={(gelId) => update({ gelId })}
          />
        )}
      </ToggleSection>
      <ColorReadout color={color} gelActive={light.gelEnabled} />
    </>
  );
}

function PlacementControls({ light, place }) {
  const { placement } = light;
  const slider = (key, label, formatValue) => (
    <SliderField
      key={key}
      label={label}
      value={placement[key]}
      {...PLACEMENT_LIMITS[key]}
      onChange={(value) => place({ [key]: value })}
      formatValue={formatValue}
    />
  );
  const isOffset = SHIFT_KEYS.some((key) => placement[key] !== DEFAULT_PLACEMENT[key]);

  return (
    <>
      <h3 className="light-card__subtitle">Placement · orbit (re-aims at subject)</h3>
      {slider('azimuthDeg', 'Azimuth', formatDegrees)}
      {slider('elevationDeg', 'Elevation', formatDegrees)}
      {slider('distance', 'Distance', formatMeters)}

      <h3 className="light-card__subtitle">Shift · translate X / Y / Z (keeps aim)</h3>
      {slider('shiftX', 'Shift X (left − / right +)', formatShift)}
      {slider('shiftY', 'Shift Y (down − / up +)', formatShift)}
      {slider('shiftZ', 'Shift Z (back − / front +)', formatShift)}

      <h3 className="light-card__subtitle">Tilt · rotation (re-aims)</h3>
      {slider('tiltDeg', 'Tilt (down − / up +)', formatSignedDegrees)}
      {slider('panDeg', 'Pan (left − / right +, seen from behind)', formatSignedDegrees)}
      {slider('rollDeg', 'Roll (clockwise +, seen from behind)', formatSignedDegrees)}
      <button
        type="button"
        className="button button--small"
        disabled={!isOffset}
        onClick={() => place(Object.fromEntries(SHIFT_KEYS.map((key) => [key, DEFAULT_PLACEMENT[key]])))}
      >
        Reset shift & tilt
      </button>
    </>
  );
}

export function LightCard({ light, isSelected }) {
  const { updateLight, updatePlacement, removeLight, selectLight } = useLightingActions();
  const strobe = getStrobeById(light.strobeId);
  const modifier = getModifierById(light.modifierId);
  if (!strobe) return null;

  // Same selectors as the 3D scene -> the panel always matches the render.
  const pose = selectFixturePose(light);
  const rig = selectLightRig(light, pose);
  const color = selectLightColor(light);
  const isParabolic = modifier?.lighting.model === LIGHT_MODELS.PARABOLIC;

  const update = (changes) => updateLight(light.id, changes);
  const place = (changes) => updatePlacement(light.id, changes);

  return (
    <article className={`light-card ${isSelected ? 'light-card--selected' : ''}`}>
      <header className="light-card__header" onClick={() => selectLight(light.id)}>
        <span
          className={`light-card__dot ${light.enabled ? 'light-card__dot--on' : ''}`}
          style={light.enabled ? { '--dot-color': color.displayHex } : undefined}
        />
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
          <AccessoryControls light={light} modifier={modifier} update={update} />

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
              hint="0 = head pushed deep inside (spot: narrow, punchy, hard) · 100 = head pulled out (flood: wide, flat, soft)"
            />
          )}

          <ColorControls light={light} strobe={strobe} color={color} update={update} />
          {rig && <BeamReadout rig={rig} pose={pose} />}

          <PlacementControls light={light} place={place} />

          <button type="button" className="button button--danger" onClick={() => removeLight(light.id)}>
            Remove light
          </button>
        </div>
      )}
    </article>
  );
}
