import { APP_MODES } from '../../config/cameraConfig.js';
import { cameraActions, useAppMode } from '../../state/cameraStore.js';

const TABS = [
  { mode: APP_MODES.LIGHTING, label: 'Lighting Mode', sub: '조명 세팅', panelId: 'panel-lighting' },
  { mode: APP_MODES.CAMERA, label: 'Camera Mode', sub: '촬영 시뮬레이션', panelId: 'panel-camera' },
];

/** Switches between lighting setup and the camera simulation. */
export function ModeTabs() {
  const appMode = useAppMode();
  return (
    <div className="mode-tabs" role="tablist" aria-label="App mode">
      {TABS.map((tab) => (
        <button
          key={tab.mode}
          type="button"
          role="tab"
          id={`tab-${tab.mode}`}
          aria-selected={appMode === tab.mode}
          aria-controls={tab.panelId}
          className={`mode-tabs__tab ${appMode === tab.mode ? 'mode-tabs__tab--active' : ''}`}
          onClick={() => cameraActions.setAppMode(tab.mode)}
        >
          <strong>{tab.label}</strong>
          <small>{tab.sub}</small>
        </button>
      ))}
    </div>
  );
}
