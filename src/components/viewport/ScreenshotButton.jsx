import { useState } from 'react';
import { APP_MODES } from '../../config/cameraConfig.js';
import { CAMERA_CONFIG } from '../../config/sceneConfig.js';
import { selectCameraOptics } from '../../state/cameraSelectors.js';
import { getCameraState } from '../../state/cameraStore.js';
import { useLightingState } from '../../state/LightingContext.jsx';
import { captureCanvas } from '../../state/screenshotService.js';
import { getSubjectState } from '../../state/subjectStore.js';
import { frameCanvasFit } from '../../utils/cameraOptics.js';
import { composeScreenshot, downloadCanvas, screenshotFileName } from '../../utils/screenshotExport.js';
import { buildSetupHud } from '../../utils/setupHud.js';

/**
 * In camera mode the image is cropped to the sensor frame (what the
 * viewfinder shows); in lighting mode the whole view is kept.
 */
function cropFor(camera, optics, shot) {
  if (camera.appMode !== APP_MODES.CAMERA) return { x: 0, y: 0, width: shot.width, height: shot.height };
  const { frame } = frameCanvasFit(optics.sensor, optics.lens.focalLengthMm, shot.cssWidth, shot.cssHeight);
  const scale = shot.width / shot.cssWidth;
  const x = Math.round(frame.x * scale);
  const y = Math.round(frame.y * scale);
  return {
    x,
    y,
    width: Math.min(Math.round(frame.width * scale), shot.width - x),
    height: Math.min(Math.round(frame.height * scale), shot.height - y),
  };
}

/** 'Take Screenshot': 3D view + setup HUD → PNG download. */
export function ScreenshotButton() {
  const { lights } = useLightingState();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const takeScreenshot = async () => {
    setBusy(true);
    try {
      const camera = getCameraState();
      const optics = selectCameraOptics(camera);
      const date = new Date();
      const shot = captureCanvas(); // synchronous: helpers are hidden only for this render
      const hud = buildSetupHud({
        appMode: camera.appMode,
        lights,
        subject: getSubjectState(),
        camera,
        optics,
        orbitFovDeg: CAMERA_CONFIG.fov,
        date,
      });
      const canvas = await composeScreenshot({ dataUrl: shot.dataUrl, crop: cropFor(camera, optics, shot), hud });
      const saved = await downloadCanvas(canvas, screenshotFileName(camera.appMode, date));
      setStatus({ ok: true, text: `Saved ${saved.fileName} (${saved.width} × ${saved.height})` });
    } catch (error) {
      setStatus({ ok: false, text: `Screenshot failed: ${error.message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="viewport-toolbar">
      <button
        type="button"
        className="button viewport-toolbar__button"
        onClick={takeScreenshot}
        disabled={busy}
        title="Download the 3D view as PNG with the camera and light settings drawn on it. The AF target, angle guide and light rays are left out."
      >
        {busy ? 'Saving…' : 'Take Screenshot'}
      </button>
      {status && (
        <span
          className={`viewport-toolbar__status ${status.ok ? '' : 'viewport-toolbar__status--error'}`}
          role="status"
          data-testid="screenshot-status"
        >
          {status.text}
        </span>
      )}
    </div>
  );
}
