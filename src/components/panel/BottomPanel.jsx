import { APP_MODES } from '../../config/cameraConfig.js';
import { useAppMode } from '../../state/cameraStore.js';
import { CameraEquipmentRow, CameraOptionsRow, CameraSlidersRow } from './camera/CameraRows.jsx';
import { LightEquipmentRow } from './lighting/LightEquipmentRow.jsx';
import { LightingOptionsRow } from './lighting/LightingOptionsRow.jsx';
import { LightSlidersRow } from './lighting/LightSlidersRow.jsx';
import { ModeTabs } from './ModeTabs.jsx';

/** Three fixed rows; each row scrolls horizontally when the window is narrow. */
function Rows({ id, mode, hidden, rows }) {
  return (
    <div id={id} role="tabpanel" aria-labelledby={`tab-${mode}`} className="bottom-panel__rows" hidden={hidden}>
      {rows.map(([name, content]) => (
        <div key={name} className={`bottom-panel__row bottom-panel__row--${name}`} data-row={name}>
          {content}
        </div>
      ))}
    </div>
  );
}

/**
 * Bottom control panel: a mode rail plus three rows.
 *   Row 1  equipment / presets as icon buttons
 *   Row 2  sliders side by side
 *   Row 3  toggles and other options
 *
 * Both modes' rows stay mounted and are only hidden, so switching modes never
 * resets panel state (open offsets, file status). All state lives in the
 * existing stores/contexts; this component only lays them out.
 */
export function BottomPanel() {
  const appMode = useAppMode();
  const isCameraMode = appMode === APP_MODES.CAMERA;
  return (
    <div className="bottom-panel">
      <ModeTabs />
      <Rows
        id="panel-lighting"
        mode={APP_MODES.LIGHTING}
        hidden={isCameraMode}
        rows={[
          ['equipment', <LightEquipmentRow key="equipment" />],
          ['sliders', <LightSlidersRow key="sliders" />],
          ['options', <LightingOptionsRow key="options" />],
        ]}
      />
      <Rows
        id="panel-camera"
        mode={APP_MODES.CAMERA}
        hidden={!isCameraMode}
        rows={[
          ['equipment', <CameraEquipmentRow key="equipment" />],
          ['sliders', <CameraSlidersRow key="sliders" />],
          ['options', <CameraOptionsRow key="options" />],
        ]}
      />
    </div>
  );
}
