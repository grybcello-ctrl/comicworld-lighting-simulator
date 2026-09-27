import { useMemo } from 'react';
import { APP_MODES, FOCUS_MODES, VIEWFINDER_CONFIG } from '../../config/cameraConfig.js';
import { formatFNumber, formatMeters, selectCameraOptics } from '../../state/cameraSelectors.js';
import { useCameraState } from '../../state/cameraStore.js';

/**
 * Camera-mode frame lines over the canvas. The render covers the whole canvas;
 * the sensor's 4:3 frame is the largest centered rectangle that fits (same fit
 * as frameCanvasFit in cameraOptics.js), everything outside it is masked.
 * Pure HTML/CSS: no effect on the WebGL render.
 */
export function ViewfinderOverlay() {
  const settings = useCameraState();
  const derived = useMemo(() => selectCameraOptics(settings), [settings]);
  if (settings.appMode !== APP_MODES.CAMERA) return null;

  const { sensor, lens, dof } = derived;
  const aspect = sensor.widthMm / sensor.heightMm;
  return (
    <div
      className="viewfinder"
      data-testid="viewfinder"
      style={{ '--frame-aspect': aspect, '--mask-opacity': VIEWFINDER_CONFIG.maskOpacity }}
    >
      <div className="viewfinder__frame">
        <div className="viewfinder__thirds" aria-hidden="true" />
        <div className="viewfinder__info">
          <span>{derived.body.name.replace('FUJIFILM ', '')}</span>
          <span>{lens.name}</span>
          <strong>{formatFNumber(settings.fNumber)}</strong>
          <span>
            {settings.focusMode === FOCUS_MODES.AF ? 'AF' : 'MF'} {formatMeters(settings.focusDistanceM)}
          </span>
          <span>
            DoF {formatMeters(dof.nearM)}–{formatMeters(dof.farM)}
          </span>
          <span className={derived.faceInFocus ? 'viewfinder__ok' : 'viewfinder__warn'}>
            Face {derived.faceInFocus ? 'in focus' : 'out of focus'}
          </span>
        </div>
      </div>
    </div>
  );
}
