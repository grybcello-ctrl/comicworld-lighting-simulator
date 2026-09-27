import { useMemo } from 'react';
import { CAMERA_BODIES, CAMERA_LIMITS, FOCUS_MODES, LENSES } from '../../config/cameraConfig.js';
import { formatFNumber, formatMeters, selectCameraOptics } from '../../state/cameraSelectors.js';
import { cameraActions, useCameraState } from '../../state/cameraStore.js';
import { useLightingActions, useLightingState } from '../../state/LightingContext.jsx';
import { ReadoutList, SelectField, SliderField, ToggleField } from './fields.jsx';

const FOCUS_SLIDER_STEPS = 1000;

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

function BodySection({ settings, derived }) {
  const { sensor } = derived;
  return (
    <section className="panel-section">
      <h2 className="panel-section__title">Camera body</h2>
      <SelectField
        label="Body"
        value={settings.bodyId}
        options={CAMERA_BODIES.map((body) => ({ value: body.id, label: body.name }))}
        onChange={cameraActions.setBody}
      />
      <ReadoutList
        items={[
          { label: 'Sensor', value: `${sensor.widthMm} × ${sensor.heightMm} mm (4:3)` },
          { label: 'Resolution', value: `${sensor.pixelsX} × ${sensor.pixelsY} (102 MP)` },
          { label: 'Crop factor vs 35 mm', value: `${derived.crop.toFixed(2)}×` },
        ]}
      />
    </section>
  );
}

function LensSection({ settings, derived }) {
  const { lens, angles } = derived;
  const stops = derived.fNumbers;
  const stopIndex = Math.max(0, stops.indexOf(settings.fNumber));
  return (
    <section className="panel-section">
      <h2 className="panel-section__title">Lens</h2>
      <SelectField
        label="Lens"
        value={settings.lensId}
        options={LENSES.map((item) => ({ value: item.id, label: item.name }))}
        onChange={cameraActions.setLens}
      />
      {lens.note && <span className="field__hint field__hint--warning">{lens.note}</span>}
      <ReadoutList
        items={[
          { label: 'Focal length', value: `${lens.focalLengthMm} mm (≈ ${Math.round(derived.equivalentFocalLengthMm)} mm FF)` },
          {
            label: 'Angle of view H / V / D',
            value: `${angles.horizontalDeg.toFixed(1)}° / ${angles.verticalDeg.toFixed(1)}° / ${angles.diagonalDeg.toFixed(1)}°`,
          },
          { label: 'Max aperture · MFD', value: `${formatFNumber(lens.maxAperture)} · ${formatMeters(lens.minFocusDistanceM)}` },
        ]}
      />
      <SliderField
        label="F-Stop (조리개)"
        value={stopIndex}
        min={0}
        max={stops.length - 1}
        step={1}
        onChange={(index) => cameraActions.setFNumber(stops[index])}
        formatValue={(index) => formatFNumber(stops[index])}
        hint={`${formatFNumber(stops[0])} (wide open) – ${formatFNumber(stops[stops.length - 1])} · lower f-number = shallower focus, stronger blur`}
      />
      <ReadoutList
        items={[
          { label: 'Aperture diameter', value: `${derived.optics.apertureDiameterMm.toFixed(1)} mm` },
          { label: 'DoF-equivalent on 35 mm', value: formatFNumber(Math.round(derived.equivalentFNumber * 10) / 10) },
        ]}
      />
    </section>
  );
}

function FocusSection({ settings, derived }) {
  const scale = useFocusSliderScale(derived.focusRangeM);
  const { dof } = derived;
  const isAf = settings.focusMode === FOCUS_MODES.AF;
  const faceOffsetM = derived.faceDistanceM - settings.focusDistanceM;
  const faceStatus = derived.faceInFocus
    ? 'In focus ✓'
    : `${faceOffsetM > 0 ? 'Behind' : 'In front of'} the DoF (${Math.abs(faceOffsetM * 100).toFixed(0)} cm from focus)`;
  return (
    <section className="panel-section">
      <h2 className="panel-section__title">Focus</h2>
      <div className="segmented" role="radiogroup" aria-label="Focus mode">
        {[
          { mode: FOCUS_MODES.AF, label: 'AF · Face' },
          { mode: FOCUS_MODES.MANUAL, label: 'MF' },
        ].map((option) => (
          <label
            key={option.mode}
            className={`segmented__option ${settings.focusMode === option.mode ? 'segmented__option--active' : ''}`}
          >
            <input
              type="radio"
              name="focus-mode"
              value={option.mode}
              checked={settings.focusMode === option.mode}
              onChange={() => cameraActions.setFocusMode(option.mode)}
            />
            {option.label}
          </label>
        ))}
      </div>
      <SliderField
        label="Focus Distance (초점 거리)"
        value={scale.toSlider(settings.focusDistanceM)}
        min={0}
        max={FOCUS_SLIDER_STEPS}
        step={1}
        onChange={(t) => cameraActions.setFocusDistance(scale.fromSlider(t))}
        formatValue={() => `${formatMeters(settings.focusDistanceM)}${isAf ? ' · AF' : ''}`}
        hint={`From the focal plane · ${formatMeters(derived.focusRangeM.min)} (MFD) – ${formatMeters(derived.focusRangeM.max, 0)}${isAf ? ' · moving it switches to MF' : ''}`}
      />
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
          { label: 'Face distance', value: formatMeters(derived.faceDistanceM) },
          { label: 'Face', value: faceStatus },
          {
            label: 'Background blur at ∞',
            value: `${derived.optics.blurAtInfinityMm.toFixed(2)} mm (${(derived.optics.blurAtInfinityFrameShare * 100).toFixed(1)}% of width)`,
          },
        ]}
      />
      <span className="field__hint">
        Thin-lens model · DoF for a {derived.cocMm.toFixed(3)} mm circle of confusion (35 mm 0.030 mm scaled to the
        sensor diagonal).
      </span>
    </section>
  );
}

function PositionSection({ settings, derived }) {
  const lim = CAMERA_LIMITS;
  return (
    <section className="panel-section">
      <h2 className="panel-section__title">Camera position</h2>
      <SliderField
        label="Shooting Distance (촬영 거리)"
        value={settings.shootingDistanceM}
        {...lim.shootingDistanceM}
        onChange={cameraActions.setShootingDistance}
        formatValue={(v) => formatMeters(v)}
        hint="Dolly along z: focal plane → subject axis (camera.position.z)"
      />
      <SliderField
        label="Camera height"
        value={settings.cameraHeightM}
        {...lim.cameraHeightM}
        onChange={cameraActions.setCameraHeight}
        formatValue={(v) => formatMeters(v)}
      />
      <SliderField
        label="Aim height"
        value={settings.aimHeightM}
        {...lim.aimHeightM}
        onChange={cameraActions.setAimHeight}
        formatValue={(v) => formatMeters(v)}
        hint="Where the optical axis meets the subject axis"
      />
      <ReadoutList
        items={[
          {
            label: 'Frame at focus plane',
            value: `${derived.fieldWidthM.toFixed(2)} × ${derived.fieldHeightM.toFixed(2)} m`,
          },
          { label: 'Magnification', value: `1:${(1 / derived.magnification).toFixed(1)}` },
        ]}
      />
    </section>
  );
}

function ViewSection() {
  const { showFixtures } = useLightingState();
  const { setShowFixtures } = useLightingActions();
  return (
    <section className="panel-section">
      <h2 className="panel-section__title">View</h2>
      <ToggleField
        label="Fixtures in frame (장비 보이기)"
        checked={showFixtures}
        onChange={setShowFixtures}
        title="Stands, strobes and modifiers are real objects in the shot. Same switch as Hide Fixtures."
      />
      <span className="field__hint">
        Light rays and selection highlights are never drawn in camera mode. Exposure is not tied to the f-number:
        the image keeps the brightness of the lighting setup.
      </span>
    </section>
  );
}

/** Photo-camera controls: body, lens, aperture, focus and position. */
export function CameraPanel() {
  const settings = useCameraState();
  const derived = useMemo(() => selectCameraOptics(settings), [settings]);
  return (
    <div className="camera-panel">
      <header className="control-panel__header">
        <h1>Camera</h1>
        <p>GFX + GF lens · thin-lens depth of field</p>
      </header>
      <BodySection settings={settings} derived={derived} />
      <LensSection settings={settings} derived={derived} />
      <FocusSection settings={settings} derived={derived} />
      <PositionSection settings={settings} derived={derived} />
      <ViewSection />
    </div>
  );
}
