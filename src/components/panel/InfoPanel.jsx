import { Camera, Image, Info, Lightbulb, User } from 'lucide-react';
import { useMemo } from 'react';
import { getGridById, getModifierById, getStrobeById } from '../../config/equipmentRegistry.js';
import { SUBJECT_TARGET } from '../../config/sceneConfig.js';
import { formatFNumber, formatMeters, selectCameraOptics } from '../../state/cameraSelectors.js';
import { useCameraState } from '../../state/cameraStore.js';
import { useLightingActions, useLightingState } from '../../state/LightingContext.jsx';
import { getLightColorInputs, selectFixturePose, selectLightColor, selectLightRig } from '../../state/lightSelectors.js';
import { isSectionOpen, panelActions, usePanelState } from '../../state/panelStore.js';
import { useViewState } from '../../state/viewStore.js';
import { blurDiameterMm } from '../../utils/cameraOptics.js';
import { formatPowerLevel, formatWs, powerLevelToWs } from '../../utils/lightMath.js';
import { Accordion } from '../ui/Accordion.jsx';
import { focusStatus, FOCUS_MODE_LABELS, lineOfSightM } from './camera/cameraFormat.js';
import { ColorSwatch, ReadoutList } from './fields.jsx';
import { lightTitle } from './lighting/LightAccordion.jsx';
import { BeamReadout, ColorReadout } from './LightReadouts.jsx';
import { usePoseState } from '../../state/poseStore.js';
import { SubjectInfo } from './SubjectControls.jsx';

const RAD_TO_DEG = 180 / Math.PI;
const fixed = (value, digits = 2) => value.toFixed(digits);
const signedDeg = (value) => `${Math.round(value) > 0 ? '+' : ''}${Math.round(value)}°`;

/** Info-panel accordion; its open state is namespaced (the right panel has sections with the same names). */
function Section({ id, defaultOpen = true, children, ...props }) {
  usePanelState();
  const key = `info-${id}`;
  return (
    <Accordion open={isSectionOpen(key, defaultOpen)} onToggle={() => panelActions.toggleSection(key, defaultOpen)} testId={key} {...props}>
      {children}
    </Accordion>
  );
}

/**
 * Where a fixture actually is (shift included), relative to the head
 * (SUBJECT_TARGET). Azimuth 0° = camera side (+Z), +90° = subject's left.
 */
function fixtureReadout(light) {
  const pose = selectFixturePose(light);
  const [x, y, z] = pose.position;
  const dx = x - SUBJECT_TARGET[0];
  const dy = y - SUBJECT_TARGET[1];
  const dz = z - SUBJECT_TARGET[2];
  return {
    pose,
    position: pose.position,
    distanceM: pose.distanceToSubject,
    azimuthDeg: Math.atan2(dx, dz) * RAD_TO_DEG,
    elevationDeg: Math.atan2(dy, Math.hypot(dx, dz)) * RAD_TO_DEG,
    heightM: y,
  };
}

/** Compact, read-only card of one light (every light is listed, selected or not). */
function LightInfoCard({ light, isSelected }) {
  const { selectLight } = useLightingActions();
  const strobe = getStrobeById(light.strobeId);
  const modifier = getModifierById(light.modifierId);
  const grid = getGridById(light.gridId);
  const color = selectLightColor(light);
  const { kelvin, gel } = getLightColorInputs(light);
  const readout = fixtureReadout(light);
  const [x, y, z] = readout.position;
  const ws = strobe ? powerLevelToWs(strobe.maxWs, light.powerLevel) : 0;
  const rows = [
    ['Equipment', [modifier?.name, grid?.name, light.innerDiffuser ? 'inner diffuser' : null].filter(Boolean).join(' + ') || '—'],
    ['Power', `${formatPowerLevel(light.powerLevel)} · ${formatWs(ws)}${strobe ? ` of ${strobe.maxWs} Ws` : ''}`],
    [
      'Color',
      <span key="color" className="readout__swatch-value">
        <ColorSwatch color={color.displayHex} />
        {[kelvin ? `${kelvin} K` : 'neutral', gel ? `gel ${gel.name}` : 'no gel'].join(' · ')}
      </span>,
    ],
    ['Position XYZ', `${fixed(x)}, ${fixed(y)}, ${fixed(z)} m`],
    ['Distance · Height', `${fixed(readout.distanceM)} m · ${fixed(readout.heightM)} m`],
    ['Azimuth · Elevation', `${signedDeg(readout.azimuthDeg)} · ${signedDeg(readout.elevationDeg)}`],
  ];
  return (
    <article
      className={`info-card ${isSelected ? 'info-card--selected' : ''} ${light.enabled ? '' : 'info-card--off'}`}
      data-testid="info-light"
      data-light-id={light.id}
    >
      <button type="button" className="info-card__header" onClick={() => selectLight(light.id)} aria-pressed={isSelected}>
        <span
          className={`light-card__dot ${light.enabled ? 'light-card__dot--on' : ''}`}
          style={light.enabled ? { '--dot-color': color.displayHex } : undefined}
          aria-hidden="true"
        />
        <span className="info-card__title">{lightTitle(light)}</span>
        {!light.enabled && <span className="info-card__badge">off</span>}
      </button>
      <dl className="info-card__rows">
        {rows.map(([label, value]) => (
          <div key={label} className="info-card__row" data-field={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

/** Physics readouts of the selected light (beam, shadow, resulting color). */
function SelectedLightDetails({ light }) {
  const pose = selectFixturePose(light);
  const rig = selectLightRig(light, pose);
  const color = selectLightColor(light);
  return (
    <>
      <ColorReadout color={color} gelActive={light.gelEnabled} />
      {rig && <BeamReadout rig={rig} pose={pose} />}
    </>
  );
}

/**
 * Background separation: how much darker the wall is than the subject for
 * each light that is on (inverse square of the real distances: light →
 * head vs. light → wall point behind the head), and how blurred it is.
 */
function BackgroundInfo() {
  const { lights } = useLightingState();
  const view = useViewState();
  const camera = useCameraState();
  const optics = useMemo(() => selectCameraOptics(camera), [camera]);
  if (!view.showBackground) return <p className="panel-note">Background off.</p>;
  const wallPoint = [SUBJECT_TARGET[0], SUBJECT_TARGET[1], -view.backgroundDistanceM];
  const wallFromCameraM = camera.shootingDistanceM + view.backgroundDistanceM;
  const blurMm = Math.abs(blurDiameterMm(optics.optics, wallFromCameraM));
  const rows = [
    { label: 'Distance', value: `${view.backgroundDistanceM.toFixed(1)} m behind the subject · ${wallFromCameraM.toFixed(1)} m from the camera` },
    {
      label: 'Wall blur (camera)',
      value: `Ø ${blurMm.toFixed(2)} mm · ${((100 * blurMm) / optics.frame.widthMm).toFixed(1)}% of the frame width`,
    },
  ];
  for (const light of lights.filter((item) => item.enabled)) {
    const { position, distanceToSubject } = selectFixturePose(light);
    const toWall = Math.hypot(...position.map((v, i) => v - wallPoint[i]));
    rows.push({ label: `${light.label} → wall`, value: `${(2 * Math.log2(distanceToSubject / toWall)).toFixed(1)} EV vs. subject (1/d²)` });
  }
  return <ReadoutList items={rows} />;
}

/** Imported pose: source, mapping and what could not be transferred. */
function ImportedPoseInfo() {
  const { importedPose } = usePoseState();
  if (!importedPose) return null;
  const clip = importedPose.clips[importedPose.clipIndex];
  return (
    <ReadoutList
      items={[
        { label: 'Pose file', value: `${importedPose.fileName} (${importedPose.format})` },
        { label: 'Clip · frame', value: clip ? `${clip.name} · ${importedPose.frame} / ${clip.frames - 1}` : 'static pose (skin bind pose as rest)' },
        { label: 'Retargeted bones', value: `${importedPose.applied.length} · rest: ${importedPose.restKind}` },
        { label: 'Not in the pose file', value: importedPose.missingInSource.join(', ') || '—' },
        { label: 'Not on the subject', value: importedPose.missingInTarget.join(', ') || '—' },
        { label: 'Set on the floor', value: `${importedPose.groundShiftM >= 0 ? '+' : ''}${(importedPose.groundShiftM * 100).toFixed(1)} cm` },
      ]}
    />
  );
}

function CameraInfo() {
  const settings = useCameraState();
  const derived = useMemo(() => selectCameraOptics(settings), [settings]);
  const { sensor, frame, lens, angles, dof, body } = derived;
  const eyeTarget = settings.eyeTarget;
  const eyeLineM = lineOfSightM(settings, eyeTarget?.point);
  return (
    <>
      <ReadoutList
        items={[
          { label: 'Body', value: `${body.name.replace('FUJIFILM ', '')} · ${sensor.widthMm} × ${sensor.heightMm} mm` },
          { label: 'Frame', value: `${frame.label}${frame.portrait ? ' portrait' : ''} · ${frame.widthMm.toFixed(1)} × ${frame.heightMm.toFixed(1)} mm${frame.native ? ' (full sensor)' : ' crop'}` },
          { label: 'Lens', value: lens.name },
          { label: 'Aperture', value: `${formatFNumber(settings.fNumber)} · Ø ${derived.optics.apertureDiameterMm.toFixed(1)} mm` },
          {
            label: 'Angle of view',
            value: `${angles.horizontalDeg.toFixed(1)}° × ${angles.verticalDeg.toFixed(1)}° (≈ ${Math.round(derived.equivalentFocalLengthMm)} mm FF)`,
          },
          { label: 'Focus', value: `${FOCUS_MODE_LABELS[settings.focusMode]} ${formatMeters(settings.focusDistanceM)}` },
          { label: 'Depth of field', value: `${formatMeters(dof.nearM)} – ${formatMeters(dof.farM)}` },
          {
            label: 'DoF total',
            value: Number.isFinite(dof.totalM) ? `${(dof.totalM * 100).toFixed(1)} cm (${(dof.frontM * 100).toFixed(1)} / ${(dof.backM * 100).toFixed(1)})` : '∞',
          },
          { label: 'Camera', value: `z ${formatMeters(settings.shootingDistanceM)} · h ${formatMeters(settings.cameraHeightM)} · aim ${formatMeters(settings.aimHeightM)}` },
          { label: 'Eye', value: focusStatus(derived.eyeDistanceM, derived.eyeInFocus, settings.focusDistanceM) },
          { label: 'Face', value: focusStatus(derived.faceDistanceM, derived.faceInFocus, settings.focusDistanceM) },
        ]}
      />
      <div
        className="panel-note"
        data-testid="eye-af-source"
        data-eye-source={eyeTarget?.source ?? ''}
        data-eye-point={JSON.stringify(eyeTarget?.point ?? null)}
        data-face-point={JSON.stringify(settings.facePoint)}
      >
        Eye AF: {eyeTarget ? `${eyeTarget.label} · ${eyeTarget.detail} · ${derived.eyeInFocus ? 'in focus' : 'out of focus'}` : 'not measured yet'}
      </div>
      <details className="info-details" data-testid="camera-details">
        <summary>Optics details</summary>
        <ReadoutList
          items={[
            { label: 'Resolution', value: `${sensor.pixelsX} × ${sensor.pixelsY} (102 MP)` },
            { label: 'Crop factor vs 35 mm', value: `${derived.crop.toFixed(2)}×` },
            { label: 'Focal length', value: `${lens.focalLengthMm} mm` },
            { label: 'Diagonal angle of view', value: `${angles.diagonalDeg.toFixed(1)}°` },
            { label: 'Max aperture · MFD', value: `${formatFNumber(lens.maxAperture)} · ${formatMeters(lens.minFocusDistanceM)}` },
            { label: 'DoF-equivalent on 35 mm', value: formatFNumber(Math.round(derived.equivalentFNumber * 10) / 10) },
            { label: 'Hyperfocal distance', value: formatMeters(dof.hyperfocalM, 1) },
            { label: 'Eye distance (axial · line of sight)', value: `${formatMeters(derived.eyeDistanceM, 3)}${eyeLineM ? ` · ${formatMeters(eyeLineM, 3)}` : ''}` },
            { label: 'Face distance', value: formatMeters(derived.faceDistanceM, 3) },
            { label: 'Background blur at ∞', value: `${derived.optics.blurAtInfinityMm.toFixed(2)} mm (${(derived.optics.blurAtInfinityFrameShare * 100).toFixed(1)}% of width)` },
            { label: 'Frame at focus plane', value: `${derived.fieldWidthM.toFixed(2)} × ${derived.fieldHeightM.toFixed(2)} m` },
            { label: 'Magnification', value: `1:${(1 / derived.magnification).toFixed(1)}` },
          ]}
        />
        {lens.note && <p className="panel-note panel-note--warning">{lens.note}</p>}
        <p className="panel-note">
          Thin-lens model · DoF for a {derived.cocMm.toFixed(3)} mm circle of confusion. Focus distances run from camera.position along
          the optical axis. Exposure is not tied to the f-number.
        </p>
      </details>
    </>
  );
}

/**
 * Left panel: read-only information viewer (like Lightroom's metadata panel).
 * Everything is derived on each render from the same state and selectors as
 * the scene, so it follows every slider immediately.
 */
export function InfoPanel() {
  const { lights, selectedLightId } = useLightingState();
  const selected = lights.find((light) => light.id === selectedLightId);
  const onCount = lights.filter((light) => light.enabled).length;
  return (
    <div className="side-panel__scroll" data-testid="info-panel">
      <Section id="camera" title="Camera" icon={Camera}>
        <CameraInfo />
      </Section>
      <Section id="lights" title={`Lights · ${onCount} of ${lights.length} on`} icon={Lightbulb}>
        {lights.length === 0 && <p className="panel-note">No lights in the scene.</p>}
        {lights.map((light) => (
          <LightInfoCard key={light.id} light={light} isSelected={light.id === selectedLightId} />
        ))}
      </Section>
      <Section id="background" title="Background" icon={Image} defaultOpen={false}>
        <BackgroundInfo />
      </Section>
      {selected && (
        <Section id="selected-light" title={`Beam & shadow · ${selected.label}`} icon={Info} defaultOpen={false}>
          <SelectedLightDetails light={selected} />
        </Section>
      )}
      <Section id="subject" title="Subject" icon={User} defaultOpen={false}>
        <SubjectInfo />
        <ImportedPoseInfo />
      </Section>
    </div>
  );
}
