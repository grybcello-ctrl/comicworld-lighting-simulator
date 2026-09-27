import { APP_MODES } from '../../config/cameraConfig.js';
import { LIGHTING_PRESETS } from '../../config/lightingPresets.js';
import { CAMERA_VIEWS } from '../../config/sceneConfig.js';
import { useAppMode } from '../../state/cameraStore.js';
import { useLightingActions, useLightingState } from '../../state/LightingContext.jsx';
import { AddLightForm } from './AddLightForm.jsx';
import { CameraPanel } from './CameraPanel.jsx';
import { LightCard } from './LightCard.jsx';
import { ModeTabs } from './ModeTabs.jsx';
import { SetupFileControls } from './SetupFileControls.jsx';
import { SubjectSelector } from './SubjectSelector.jsx';
import { ToggleField } from './fields.jsx';

function PresetPicker() {
  const { loadPreset } = useLightingActions();
  return (
    <section className="panel-section">
      <h2 className="panel-section__title">Presets</h2>
      <div className="preset-list">
        {LIGHTING_PRESETS.map((preset) => (
          <button key={preset.id} type="button" className="button" onClick={() => loadPreset(preset.id)}>
            {preset.name}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Hides stand/body/modifier meshes only; the lights keep illuminating the subject. */
function FixtureVisibilityToggle() {
  const { showFixtures } = useLightingState();
  const { setShowFixtures } = useLightingActions();
  return (
    <button
      type="button"
      className={`button fixture-toggle ${showFixtures ? '' : 'fixture-toggle--off'}`}
      aria-pressed={!showFixtures}
      onClick={() => setShowFixtures(!showFixtures)}
      title="Toggle the 3D models of stands, strobes and modifiers. Light output is unaffected."
    >
      <span className="fixture-toggle__icon" aria-hidden="true" />
      <span className="fixture-toggle__text">
        <strong>{showFixtures ? 'Hide Fixtures' : 'Show Fixtures'}</strong>
        <small>
          {showFixtures ? 'Fixtures visible' : 'Fixtures hidden · lights still on'} (장비 외형 숨기기)
        </small>
      </span>
    </button>
  );
}

/**
 * Beam cone helpers. Purely visual: drawn only while fixtures are shown, so
 * 'Hide Fixtures' also removes them; the lights are never affected.
 */
function LightRaysToggle() {
  const { showLightRays, showFixtures } = useLightingState();
  const { setShowLightRays } = useLightingActions();
  return (
    <div className="light-rays-toggle">
      <ToggleField
        label="Show Light Rays (빛 퍼짐 범위)"
        checked={showLightRays}
        onChange={setShowLightRays}
        title="Draws each light's beam cone: angle, full-intensity core and footprint at the subject."
      />
      {showLightRays && !showFixtures && (
        <span className="field__hint">Hidden while fixtures are hidden — show fixtures to see the rays.</span>
      )}
    </div>
  );
}

/** Camera framings; the face close-up is for inspecting skin texture. */
function CameraViewButtons() {
  const { cameraView } = useLightingState();
  const { setCameraView } = useLightingActions();
  return (
    <div className="button-row" role="group" aria-label="Camera view">
      {Object.entries(CAMERA_VIEWS).map(([id, view]) => (
        <button
          key={id}
          type="button"
          className={`button button--small ${cameraView.id === id ? 'button--active' : ''}`}
          onClick={() => setCameraView(id)}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Both mode panels stay mounted and are only hidden, so switching modes never
 * resets panel state (add-light form, file status, open light cards).
 */
export function ControlPanel() {
  const { lights, selectedLightId } = useLightingState();
  const appMode = useAppMode();

  return (
    <div className="control-panel">
      <ModeTabs />

      <div
        id="panel-lighting"
        role="tabpanel"
        aria-labelledby={`tab-${APP_MODES.LIGHTING}`}
        className="control-panel__mode"
        hidden={appMode !== APP_MODES.LIGHTING}
      >
        <header className="control-panel__header">
          <h1>Studio Lighting</h1>
          <p>Drag to orbit · Scroll to zoom · Click a light to select it</p>
          <SubjectSelector />
          <FixtureVisibilityToggle />
          <LightRaysToggle />
          <CameraViewButtons />
        </header>

        <PresetPicker />
        <SetupFileControls />
        <AddLightForm />

        <section className="panel-section">
          <h2 className="panel-section__title">Lights in scene ({lights.length})</h2>
          {lights.length === 0 && <p className="empty-state">No lights yet — add one above.</p>}
          {lights.map((light) => (
            <LightCard key={light.id} light={light} isSelected={light.id === selectedLightId} />
          ))}
        </section>
      </div>

      <div
        id="panel-camera"
        role="tabpanel"
        aria-labelledby={`tab-${APP_MODES.CAMERA}`}
        className="control-panel__mode"
        hidden={appMode !== APP_MODES.CAMERA}
      >
        <CameraPanel />
      </div>
    </div>
  );
}
