import {
  ArrowDownToLine,
  ArrowUpToLine,
  Aperture,
  Axis3d,
  Camera,
  Columns2,
  Crosshair,
  Eye,
  Focus,
  Hand,
  Image,
  Lightbulb,
  PersonStanding,
  Plus,
  Ruler,
  ScanFace,
  Sparkles,
  Spotlight,
  Square,
  FileJson,
  User,
  View,
} from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { APP_MODES, CAMERA_BODIES, CAMERA_LIMITS, FOCUS_MODES, LENSES } from '../../config/cameraConfig.js';
import { getAllStrobes, getCompatibleModifiers } from '../../config/equipmentRegistry.js';
import { LIGHTING_PRESETS } from '../../config/lightingPresets.js';
import { CAMERA_VIEWS } from '../../config/sceneConfig.js';
import { formatFNumber, formatMeters, selectCameraOptics } from '../../state/cameraSelectors.js';
import { cameraActions, useAppMode, useCameraState } from '../../state/cameraStore.js';
import { useLightingActions, useLightingState } from '../../state/LightingContext.jsx';
import { isSectionOpen, panelActions, usePanelState } from '../../state/panelStore.js';
import { Accordion } from '../ui/Accordion.jsx';
import { Chip, IconSlider } from '../ui/IconSlider.jsx';
import { EnvironmentControls } from './EnvironmentControls.jsx';
import { presetIcon } from './equipmentIcons.js';
import { ToggleField } from './fields.jsx';
import { LightAccordion } from './lighting/LightAccordion.jsx';
import { PosePanel } from './PosePanel.jsx';
import { SetupFileControls } from './SetupFileControls.jsx';
import { SubjectControls } from './SubjectControls.jsx';

const FOCUS_SLIDER_STEPS = 1000;

/** Accordion bound to panelStore (open state survives mode switches). */
function Section({ id, defaultOpen = false, children, ...props }) {
  usePanelState();
  return (
    <Accordion open={isSectionOpen(id, defaultOpen)} onToggle={() => panelActions.toggleSection(id, defaultOpen)} testId={`section-${id}`} {...props}>
      {children}
    </Accordion>
  );
}

const VIEW_ICONS = { fullBody: PersonStanding, face: ScanFace, top: ArrowDownToLine, front: Square, side: Columns2, quarter: Axis3d };
const VIEW_TOOLTIPS = {
  fullBody: 'Full body view',
  face: 'Face close-up (skin texture)',
  top: 'Top — lighting map from above, fits every fixture',
  front: 'Front — from the camera side, fits every fixture',
  side: 'Side — from the subject’s left, fits every fixture',
  quarter: 'Quarter — 45° / 35° overview, fits every fixture',
};

function ViewControls() {
  const { cameraView, showFixtures, showLightRays } = useLightingState();
  const { setCameraView, setShowFixtures, setShowLightRays } = useLightingActions();
  return (
    <>
      <div className="chip-row__chips">
        {Object.entries(CAMERA_VIEWS).map(([id, view]) => (
          <Chip
            key={id}
            icon={VIEW_ICONS[id] ?? Eye}
            label={view.label}
            tooltip={VIEW_TOOLTIPS[id] ?? view.label}
            active={cameraView.id === id}
            onClick={() => setCameraView(id)}
          />
        ))}
      </div>
      <div className="toggle-chips">
        <ToggleField
          icon={Eye}
          label="Fixtures"
          checked={showFixtures}
          onChange={setShowFixtures}
          title="Show / hide the 3D models of stands, strobes and modifiers (장비 외형). Light output is unaffected."
        />
        <ToggleField
          icon={Spotlight}
          label="Light rays"
          checked={showLightRays}
          onChange={setShowLightRays}
          title={
            showLightRays && !showFixtures
              ? 'Light rays are hidden while fixtures are hidden — show fixtures to see them.'
              : 'Show Light Rays (빛 퍼짐 범위): each light’s beam cone, core and footprint at the subject.'
          }
        />
      </div>
    </>
  );
}

/** Lighting mode: one accordion per light, then scene sections. */
function LightingControls() {
  const { lights, selectedLightId } = useLightingState();
  const { addLight, loadPreset } = useLightingActions();
  const selected = lights.find((light) => light.id === selectedLightId);

  // Selecting a light elsewhere (3D click, add, preset) opens its accordion;
  // a selection made by an accordion header leaves the open state to the header.
  useEffect(() => {
    if (!selectedLightId || panelActions.consumeSelectionFromAccordion(selectedLightId)) return;
    panelActions.openSection(`light-${selectedLightId}`);
  }, [selectedLightId]);

  const addDefault = () => {
    const strobeId = selected?.strobeId ?? getAllStrobes()[0].id;
    addLight({ strobeId, modifierId: selected?.modifierId ?? getCompatibleModifiers(strobeId)[0]?.id });
  };

  return (
    <>
      <div className="panel-heading">
        <Lightbulb size={14} aria-hidden="true" />
        <span>Lights ({lights.length})</span>
        <button type="button" className="text-button" onClick={addDefault} data-testid="add-light" data-tooltip="Add a light with the same equipment as the selected one">
          <Plus size={13} aria-hidden="true" /> Add
        </button>
      </div>
      {lights.length === 0 && <p className="panel-note">No lights yet — add one or pick a preset.</p>}
      {lights.map((light, index) => (
        <LightAccordion key={light.id} light={light} isSelected={light.id === selectedLightId} defaultOpen={index === 0} />
      ))}

      <Section id="presets" title="Presets" icon={Sparkles}>
        <div className="chip-row__chips">
          {LIGHTING_PRESETS.map((preset) => {
            const { icon, caption } = presetIcon(preset);
            return (
              <Chip
                key={preset.id}
                icon={icon}
                label={caption}
                tooltip={`${preset.name} (${preset.lights.length} lights, replaces the current ones)`}
                onClick={() => loadPreset(preset.id)}
                testId={`preset-${preset.id}`}
              />
            );
          })}
        </div>
      </Section>
      <Section id="environment" title="Environment" icon={Image} defaultOpen>
        <EnvironmentControls />
      </Section>
      <Section id="view" title="View · 조명 배치 맵" icon={View}>
        <ViewControls />
      </Section>
      <Section id="subject" title="Subject & Pose" icon={User}>
        <SubjectControls />
        <PosePanel />
      </Section>
      <Section id="setup-file" title="Setup file" icon={FileJson}>
        <SetupFileControls />
      </Section>
    </>
  );
}

const FOCUS_OPTIONS = [
  { mode: FOCUS_MODES.AF_EYE, label: 'AF · Eye', icon: Eye, tooltip: 'AF · Eye: focus on the eye nearer to the camera (eye bones → head bone → bounding box)' },
  { mode: FOCUS_MODES.AF_FACE, label: 'AF · Face', icon: ScanFace, tooltip: 'AF · Face: focus on the face surface in front of the head center' },
  { mode: FOCUS_MODES.MANUAL, label: 'MF', icon: Hand, tooltip: 'MF: use the focus distance slider' },
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

/** Camera mode: body/lens chips, exposure & focus, position. */
function CameraControls() {
  const settings = useCameraState();
  const derived = useMemo(() => selectCameraOptics(settings), [settings]);
  const { showFixtures } = useLightingState();
  const { setShowFixtures } = useLightingActions();
  const scale = useFocusSliderScale(derived.focusRangeM);
  const stops = derived.fNumbers;
  const stopIndex = Math.max(0, stops.indexOf(settings.fNumber));
  const isAf = settings.focusMode !== FOCUS_MODES.MANUAL;
  const lim = CAMERA_LIMITS;
  return (
    <>
      <Section id="camera-gear" title="Body & Lens" icon={Camera} defaultOpen>
        <div className="chip-row__chips">
          {CAMERA_BODIES.map((body) => (
            <Chip
              key={body.id}
              icon={Camera}
              label={body.name.replace('FUJIFILM ', '')}
              tooltip={`${body.name} · ${body.sensor.widthMm} × ${body.sensor.heightMm} mm`}
              active={settings.bodyId === body.id}
              onClick={() => cameraActions.setBody(body.id)}
            />
          ))}
        </div>
        <div className="chip-row__chips">
          {LENSES.map((lens) => (
            <Chip
              key={lens.id}
              icon={Aperture}
              label={`${lens.focalLengthMm} mm f/${lens.maxAperture}`}
              tooltip={`${lens.name} · MFD ${lens.minFocusDistanceM} m${lens.note ? ` · ⚠ ${lens.note}` : ''}`}
              active={settings.lensId === lens.id}
              onClick={() => cameraActions.setLens(lens.id)}
            />
          ))}
        </div>
      </Section>
      <Section id="camera-focus" title="Aperture & Focus" icon={Focus} defaultOpen>
        <IconSlider
          icon={Aperture}
          label="F-Stop"
          tooltip={`F-Stop (조리개): ${formatFNumber(stops[0])} (wide open) – ${formatFNumber(stops[stops.length - 1])} · lower f-number = shallower focus`}
          value={stopIndex}
          min={0}
          max={stops.length - 1}
          step={1}
          onChange={(index) => cameraActions.setFNumber(stops[index])}
          formatValue={(index) => formatFNumber(stops[index])}
        />
        <div className="chip-row__chips">
          {FOCUS_OPTIONS.map(({ mode, label, icon, tooltip }) => (
            <Chip key={mode} icon={icon} label={label} tooltip={tooltip} active={settings.focusMode === mode} onClick={() => cameraActions.setFocusMode(mode)} />
          ))}
        </div>
        <IconSlider
          icon={Focus}
          label="Focus Distance"
          tooltip={`Focus distance (초점 거리) from the focal plane · ${formatMeters(derived.focusRangeM.min)} (MFD) – ${formatMeters(derived.focusRangeM.max, 0)}${isAf ? ' · moving it switches to MF' : ''}`}
          value={scale.toSlider(settings.focusDistanceM)}
          min={0}
          max={FOCUS_SLIDER_STEPS}
          step={1}
          onChange={(t) => cameraActions.setFocusDistance(scale.fromSlider(t))}
          formatValue={() => `${formatMeters(settings.focusDistanceM)}${isAf ? ' AF' : ''}`}
        />
      </Section>
      <Section id="camera-position" title="Camera position" icon={Ruler} defaultOpen>
        <IconSlider
          icon={Ruler}
          label="Shooting Distance"
          tooltip="Shooting distance (촬영 거리): dolly along z, focal plane → subject axis"
          value={settings.shootingDistanceM}
          {...lim.shootingDistanceM}
          onChange={cameraActions.setShootingDistance}
          formatValue={(v) => formatMeters(v)}
        />
        <IconSlider
          icon={ArrowUpToLine}
          label="Camera height"
          value={settings.cameraHeightM}
          {...lim.cameraHeightM}
          onChange={cameraActions.setCameraHeight}
          formatValue={(v) => formatMeters(v)}
        />
        <IconSlider
          icon={Crosshair}
          label="Aim height"
          tooltip="Aim height: where the optical axis meets the subject axis"
          value={settings.aimHeightM}
          {...lim.aimHeightM}
          onChange={cameraActions.setAimHeight}
          formatValue={(v) => formatMeters(v)}
        />
        <div className="toggle-chips">
          <ToggleField
            icon={Eye}
            label="Fixtures in frame"
            checked={showFixtures}
            onChange={setShowFixtures}
            title="Stands, strobes and modifiers are real objects in the shot (장비 보이기). Light rays and selection highlights are never drawn in camera mode."
          />
        </div>
      </Section>
      <Section id="environment" title="Environment" icon={Image} defaultOpen>
        <EnvironmentControls />
      </Section>
    </>
  );
}

/**
 * Right panel: controls only (icons + sliders + chips). Both modes stay
 * mounted and are only hidden, so switching modes keeps the panel state.
 */
export function RightPanel() {
  const appMode = useAppMode();
  return (
    <div className="side-panel__scroll">
      <div id="panel-lighting" role="tabpanel" aria-labelledby={`tab-${APP_MODES.LIGHTING}`} hidden={appMode !== APP_MODES.LIGHTING}>
        <LightingControls />
      </div>
      <div id="panel-camera" role="tabpanel" aria-labelledby={`tab-${APP_MODES.CAMERA}`} hidden={appMode !== APP_MODES.CAMERA}>
        <CameraControls />
      </div>
    </div>
  );
}
