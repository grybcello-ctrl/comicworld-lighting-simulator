import { Camera, Lightbulb } from 'lucide-react';
import { APP_MODES } from '../../config/cameraConfig.js';
import { cameraActions, useAppMode } from '../../state/cameraStore.js';

const TABS = [
  {
    mode: APP_MODES.LIGHTING,
    label: 'Lighting Mode',
    sub: '조명 세팅',
    icon: Lightbulb,
    panelId: 'panel-lighting',
    tooltip: 'Lighting Mode — drag to orbit · scroll to zoom · click a light to select it',
  },
  {
    mode: APP_MODES.CAMERA,
    label: 'Camera Mode',
    sub: '촬영 시뮬레이션',
    icon: Camera,
    panelId: 'panel-camera',
    tooltip: 'Camera Mode — GFX body + GF lens with thin-lens depth of field',
  },
];

/** Vertical mode rail at the left edge of the bottom panel. */
export function ModeTabs() {
  const appMode = useAppMode();
  return (
    <div className="mode-tabs" role="tablist" aria-label="App mode" aria-orientation="vertical">
      {TABS.map(({ mode, label, sub, icon: Icon, panelId, tooltip }) => (
        <button
          key={mode}
          type="button"
          role="tab"
          id={`tab-${mode}`}
          aria-selected={appMode === mode}
          aria-controls={panelId}
          data-tooltip={tooltip}
          className={`mode-tabs__tab ${appMode === mode ? 'mode-tabs__tab--active' : ''}`}
          onClick={() => cameraActions.setAppMode(mode)}
        >
          <Icon size={18} aria-hidden="true" />
          <strong>{label}</strong>
          <small>{sub}</small>
        </button>
      ))}
    </div>
  );
}
