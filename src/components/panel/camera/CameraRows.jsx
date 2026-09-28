import { Eye, Hand, Info, ScanFace, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { CAMERA_BODIES, CAMERA_LIMITS, FOCUS_MODES, LENSES } from '../../../config/cameraConfig.js';
import { formatFNumber, formatMeters, selectCameraOptics } from '../../../state/cameraSelectors.js';
import { cameraActions, useCameraState } from '../../../state/cameraStore.js';
import { useLightingActions, useLightingState } from '../../../state/LightingContext.jsx';
import { IconButton, RowGroup } from '../../ui/IconButton.jsx';
import { Popover, usePopover } from '../../ui/Popover.jsx';
import { EnvironmentSliders, EnvironmentToggleChips } from '../EnvironmentControls.jsx';
import { bodyIcon, lensIcon } from '../equipmentIcons.js';
import { ReadoutList, SliderField, ToggleField } from '../fields.jsx';
import { focusStatus, lineOfSightM } from './cameraFormat.js';

const FOCUS_SLIDER_STEPS = 1000;

const FOCUS_OPTIONS = [
  { mode: FOCUS_MODES.AF_EYE, label: 'AF · Eye', icon: Eye, tooltip: 'AF · Eye: focus on the eye nearer to the camera (eye bones → head bone → bounding box)' },
  { mode: FOCUS_MODES.AF_FACE, label: 'AF · Face', icon: ScanFace, tooltip: 'AF · Face: focus on the face surface in front of the head center' },
  { mode: FOCUS_MODES.MANUAL, label: 'MF', icon: Hand, tooltip: 'MF: use the Focus Distance slider' },
];

/** Focus slider on a log scale: close distances get as much travel as far ones (like a lens scale). */
function useFocusSliderScale({ min, max }) {
  return useMemo(() => {
    const span = Math.log(max / min);
    return {
      toSlider: (m) => Math.round((Math.log(m / min) / span) * FOCUS_SLIDER_STEPS),
      fromSlider: (t) => min * Math.exp((t / FOCUS_SLIDER_STEPS) * span),
    };
  }, [min, max]);
}

function useCameraOptics() {
  const settings = useCameraState();
  const derived = useMemo(() => selectCameraOptics(settings), [settings]);
  return { settings, derived };
}

/** Everything the rows and the HUD do not show: sensor, lens, DoF and focus readouts. */
function CameraDetails({ settings, derived }) {
  const { sensor, lens, angles, dof } = derived;
  const eyeLineM = lineOfSightM(settings, settings.eyeTarget?.point);
  return (
    <>
      <ReadoutList
        items={[
          { label: 'Body · sensor', value: `${derived.body.name} · ${sensor.widthMm} × ${sensor.heightMm} mm (4:3)` },
          { label: 'Resolution', value: `${sensor.pixelsX} × ${sensor.pixelsY} (102 MP)` },
          { label: 'Crop factor vs 35 mm', value: `${derived.crop.toFixed(2)}×` },
          { label: 'Lens', value: lens.name },
          { label: 'Focal length', value: `${lens.focalLengthMm} mm (≈ ${Math.round(derived.equivalentFocalLengthMm)} mm FF)` },
          {
            label: 'Angle of view H / V / D',
            value: `${angles.horizontalDeg.toFixed(1)}° / ${angles.verticalDeg.toFixed(1)}° / ${angles.diagonalDeg.toFixed(1)}°`,
          },
          { label: 'Max aperture · MFD', value: `${formatFNumber(lens.maxAperture)} · ${formatMeters(lens.minFocusDistanceM)}` },
          { label: 'Aperture diameter', value: `${derived.optics.apertureDiameterMm.toFixed(1)} mm` },
          { label: 'DoF-equivalent on 35 mm', value: formatFNumber(Math.round(derived.equivalentFNumber * 10) / 10) },
        ]}
      />
      {lens.note && <span className="field__hint field__hint--warning">{lens.note}</span>}
      <ReadoutList
        items={[
          { label: 'Depth of field', value: `${formatMeters(dof.nearM)} – ${formatMeters(dof.farM)}` },
          {
            label: 'Total (front / back)',
            value: Number.isFinite(dof.totalM)
              ? `${(dof.totalM * 100).toFixed(1)} cm (${(dof.frontM * 100).toFixed(1)} / ${(dof.backM * 100).toFixed(1)})`
              : '∞',
          },
          { label: 'Hyperfocal distance', value: formatMeters(dof.hyperfocalM, 1) },
          {
            label: 'Eye distance (axial · line of sight)',
            value: `${formatMeters(derived.eyeDistanceM, 3)}${eyeLineM ? ` · ${formatMeters(eyeLineM, 3)}` : ''}`,
          },
          { label: 'Eye', value: focusStatus(derived.eyeDistanceM, derived.eyeInFocus, settings.focusDistanceM) },
          { label: 'Face distance', value: formatMeters(derived.faceDistanceM, 3) },
          { label: 'Face', value: focusStatus(derived.faceDistanceM, derived.faceInFocus, settings.focusDistanceM) },
          {
            label: 'Background blur at ∞',
            value: `${derived.optics.blurAtInfinityMm.toFixed(2)} mm (${(derived.optics.blurAtInfinityFrameShare * 100).toFixed(1)}% of width)`,
          },
          { label: 'Frame at focus plane', value: `${derived.fieldWidthM.toFixed(2)} × ${derived.fieldHeightM.toFixed(2)} m` },
          { label: 'Magnification', value: `1:${(1 / derived.magnification).toFixed(1)}` },
        ]}
      />
      <span className="field__hint">
        Eye AF target: {settings.eyeTarget ? `${settings.eyeTarget.label} · ${settings.eyeTarget.detail}` : 'not measured yet (face estimate)'}.
        Thin-lens model · DoF for a {derived.cocMm.toFixed(3)} mm circle of confusion (35 mm 0.030 mm scaled to the sensor
        diagonal). Focus distances run from camera.position along the optical axis. Exposure is not tied to the f-number.
      </span>
    </>
  );
}

/** Row 1 (camera mode): body, lens and focus mode as icon buttons; details popover. */
export function CameraEquipmentRow() {
  const { settings, derived } = useCameraOptics();
  const details = usePopover();
  return (
    <>
      <RowGroup title="Body">
        {CAMERA_BODIES.map((body) => {
          const { icon, caption } = bodyIcon(body);
          return (
            <IconButton
              key={body.id}
              icon={icon}
              caption={caption}
              label={body.name}
              tooltip={`${body.name} · ${body.sensor.widthMm} × ${body.sensor.heightMm} mm`}
              active={settings.bodyId === body.id}
              onClick={() => cameraActions.setBody(body.id)}
            />
          );
        })}
      </RowGroup>
      <RowGroup title="Lens">
        {LENSES.map((lens) => {
          const { icon, caption } = lensIcon(lens);
          return (
            <IconButton
              key={lens.id}
              icon={lens.note ? TriangleAlert : icon}
              caption={caption}
              label={lens.name}
              tooltip={`${lens.name} · MFD ${lens.minFocusDistanceM} m${lens.note ? ` · ⚠ ${lens.note}` : ''}`}
              active={settings.lensId === lens.id}
              onClick={() => cameraActions.setLens(lens.id)}
            />
          );
        })}
      </RowGroup>
      <RowGroup title="Focus mode">
        {FOCUS_OPTIONS.map(({ mode, label, icon, tooltip }) => (
          <IconButton
            key={mode}
            icon={icon}
            caption={label}
            label={label}
            tooltip={tooltip}
            active={settings.focusMode === mode}
            onClick={() => cameraActions.setFocusMode(mode)}
            data-focus-mode={mode}
          />
        ))}
      </RowGroup>
      <RowGroup title="Details">
        <IconButton ref={details.anchorRef} icon={Info} caption="Optics" label="Camera details (sensor, lens, DoF)" active={details.open} onClick={details.toggle} />
      </RowGroup>
      <Popover anchorRef={details.anchorRef} open={details.open} onClose={details.close} title="Camera · optics" width={600} testId="camera-details">
        <CameraDetails settings={settings} derived={derived} />
      </Popover>
    </>
  );
}

/** Row 2 (camera mode): aperture, focus and camera position sliders side by side. */
export function CameraSlidersRow() {
  const { settings, derived } = useCameraOptics();
  const scale = useFocusSliderScale(derived.focusRangeM);
  const stops = derived.fNumbers;
  const stopIndex = Math.max(0, stops.indexOf(settings.fNumber));
  const isAf = settings.focusMode !== FOCUS_MODES.MANUAL;
  const lim = CAMERA_LIMITS;
  return (
    <>
      <RowGroup title="Exposure · focus">
        <SliderField
          compact
          label="F-Stop (조리개)"
          value={stopIndex}
          min={0}
          max={stops.length - 1}
          step={1}
          onChange={(index) => cameraActions.setFNumber(stops[index])}
          formatValue={(index) => formatFNumber(stops[index])}
          tooltip={`${formatFNumber(stops[0])} (wide open) – ${formatFNumber(stops[stops.length - 1])} · lower f-number = shallower focus, stronger blur`}
        />
        <SliderField
          compact
          label="Focus Distance (초점 거리)"
          value={scale.toSlider(settings.focusDistanceM)}
          min={0}
          max={FOCUS_SLIDER_STEPS}
          step={1}
          onChange={(t) => cameraActions.setFocusDistance(scale.fromSlider(t))}
          formatValue={() => `${formatMeters(settings.focusDistanceM)}${isAf ? ' · AF' : ''}`}
          tooltip={`From the focal plane · ${formatMeters(derived.focusRangeM.min)} (MFD) – ${formatMeters(derived.focusRangeM.max, 0)}${isAf ? ' · moving it switches to MF' : ''}`}
        />
      </RowGroup>
      <RowGroup title="Camera position">
        <SliderField
          compact
          label="Shooting Distance (촬영 거리)"
          value={settings.shootingDistanceM}
          {...lim.shootingDistanceM}
          onChange={cameraActions.setShootingDistance}
          formatValue={(v) => formatMeters(v)}
          tooltip="Dolly along z: focal plane → subject axis (camera.position.z)"
        />
        <SliderField
          compact
          label="Camera height"
          value={settings.cameraHeightM}
          {...lim.cameraHeightM}
          onChange={cameraActions.setCameraHeight}
          formatValue={(v) => formatMeters(v)}
        />
        <SliderField
          compact
          label="Aim height"
          value={settings.aimHeightM}
          {...lim.aimHeightM}
          onChange={cameraActions.setAimHeight}
          formatValue={(v) => formatMeters(v)}
          tooltip="Where the optical axis meets the subject axis"
        />
      </RowGroup>
      <EnvironmentSliders />
    </>
  );
}

/** Row 3 (camera mode): what is in the frame. */
export function CameraOptionsRow() {
  const { showFixtures } = useLightingState();
  const { setShowFixtures } = useLightingActions();
  return (
    <>
      <RowGroup title="In frame">
        <ToggleField
          icon={Eye}
          label="Fixtures in frame"
          checked={showFixtures}
          onChange={setShowFixtures}
          title="Stands, strobes and modifiers are real objects in the shot (장비 보이기). Same switch as Fixtures in lighting mode. Light rays and selection highlights are never drawn in camera mode."
        />
      </RowGroup>
      <EnvironmentToggleChips />
    </>
  );
}
