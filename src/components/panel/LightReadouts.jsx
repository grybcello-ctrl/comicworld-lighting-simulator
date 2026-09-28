/**
 * Read-only readouts of a light: resulting color and the resolved beam /
 * shadow parameters (the same selectors as the 3D scene).
 */
import { LIGHT_MODELS } from '../../config/equipmentConfig.js';
import { ColorSwatch, ReadoutList } from './fields.jsx';

const formatMeters = (value) => `${value.toFixed(2)} m`;
const formatStops = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(1)} EV`;
const formatCm = (meters) => `${(meters * 100).toFixed(meters < 0.1 ? 1 : 0)} cm`;

/** Resulting light color after the Kelvin/gel toggles and spectral mixing. */
export function ColorReadout({ color, gelActive }) {
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
export function BeamReadout({ rig, pose }) {
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
    {
      label: 'shadow.bias / normalBias',
      value: `${shadow.bias.toExponential(2)} (${(shadow.biasWorldM * 1000).toFixed(1)} mm) / ${(shadow.normalBias * 1000).toFixed(1)} mm`,
    },
    { label: 'Slope bias (shadow pass)', value: `× ${shadow.slopeBias.factor.toFixed(1)}` },
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
