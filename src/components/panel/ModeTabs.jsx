import { APP_MODES } from '../../config/cameraConfig.js';
import { cameraActions, useAppMode } from '../../state/cameraStore.js';

const TABS = [
  { mode: APP_MODES.LIGHTING, label: 'Lighting', panelId: 'panel-lighting', tooltip: 'Lighting Mode (조명 세팅) — drag to orbit · scroll to zoom · click a light to select it' },
  { mode: APP_MODES.CAMERA, label: 'Camera', panelId: 'panel-camera', tooltip: 'Camera Mode (촬영 시뮬레이션) — GFX body + GF lens with thin-lens depth of field' },
];

/** Lightroom-style module picker ("Lighting | Camera") in the top bar. */
export function ModeTabs() {
  const appMode = useAppMode();
  return (
    <nav className="module-picker" role="tablist" aria-label="App mode">
      {TABS.map(({ mode, label, panelId, tooltip }) => (
        <button
          key={mode}
          type="button"
          role="tab"
          id={`tab-${mode}`}
          aria-selected={appMode === mode}
          aria-controls={panelId}
          data-tooltip={tooltip}
          className={`module-picker__tab ${appMode === mode ? 'module-picker__tab--active' : ''}`}
          onClick={() => cameraActions.setAppMode(mode)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
