import { LIGHTING_PRESETS } from '../../config/lightingPresets.js';
import { useLightingActions, useLightingState } from '../../state/LightingContext.jsx';
import { AddLightForm } from './AddLightForm.jsx';
import { LightCard } from './LightCard.jsx';

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

export function ControlPanel() {
  const { lights, selectedLightId } = useLightingState();

  return (
    <div className="control-panel">
      <header className="control-panel__header">
        <h1>Studio Lighting</h1>
        <p>Drag to orbit · Scroll to zoom · Click a light to select it</p>
      </header>

      <PresetPicker />
      <AddLightForm />

      <section className="panel-section">
        <h2 className="panel-section__title">Lights in scene ({lights.length})</h2>
        {lights.length === 0 && <p className="empty-state">No lights yet — add one above.</p>}
        {lights.map((light) => (
          <LightCard key={light.id} light={light} isSelected={light.id === selectedLightId} />
        ))}
      </section>
    </div>
  );
}
