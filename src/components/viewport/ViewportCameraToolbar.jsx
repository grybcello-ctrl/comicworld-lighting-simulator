import { Camera, RectangleHorizontal, RectangleVertical } from 'lucide-react';
import { APP_MODES, ASPECT_RATIOS } from '../../config/cameraConfig.js';
import { selectCameraFrame } from '../../state/cameraSelectors.js';
import { cameraActions, useCameraState } from '../../state/cameraStore.js';

/**
 * Top-left of the 3D view: 'Camera View' toggle (the photo camera with depth
 * of field — the same state as the Camera module) and, while it is on, the
 * output aspect ratio and landscape / portrait toggle. The frame outside the
 * chosen ratio is masked by the viewfinder overlay (letterbox / pillarbox).
 */
export function ViewportCameraToolbar() {
  const settings = useCameraState();
  const isCameraView = settings.appMode === APP_MODES.CAMERA;
  const frame = selectCameraFrame(settings);
  const OrientationIcon = frame.portrait ? RectangleVertical : RectangleHorizontal;
  return (
    <div className="viewport-camera-toolbar" role="toolbar" aria-label="Camera view">
      <button
        type="button"
        className={`viewer-chip viewer-chip--strong ${isCameraView ? 'viewer-chip--active' : ''}`}
        aria-pressed={isCameraView}
        data-testid="camera-view-toggle"
        data-tooltip={isCameraView ? 'Back to the lighting view (orbit camera)' : 'Look through the photo camera (GFX + GF lens, depth of field)'}
        onClick={() => cameraActions.setAppMode(isCameraView ? APP_MODES.LIGHTING : APP_MODES.CAMERA)}
      >
        <Camera size={14} aria-hidden="true" />
        Camera View
      </button>
      {isCameraView && (
        <>
          <div className="viewer-chip-group" role="group" aria-label="Aspect ratio">
            {ASPECT_RATIOS.map((aspect) => {
              const active = settings.aspectId === aspect.id;
              const shown = active && settings.aspectFlipped ? `${aspect.height}:${aspect.width}` : aspect.label;
              return (
                <button
                  key={aspect.id}
                  type="button"
                  className={`viewer-chip ${active ? 'viewer-chip--active' : ''}`}
                  aria-pressed={active}
                  data-aspect={aspect.id}
                  data-tooltip={`Aspect ratio ${shown}${active ? ` · frame ${frame.widthMm.toFixed(1)} × ${frame.heightMm.toFixed(1)} mm${frame.native ? ' (full sensor)' : ''}` : ''}`}
                  onClick={() => cameraActions.setAspect(aspect.id)}
                >
                  {shown}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="viewer-chip"
            aria-label={frame.portrait ? 'Switch to landscape' : 'Switch to portrait'}
            data-testid="aspect-orientation"
            data-tooltip={`${frame.portrait ? 'Portrait' : 'Landscape'} ${frame.label} — click for ${frame.label.split(':').reverse().join(':')}`}
            onClick={cameraActions.toggleAspectOrientation}
          >
            <OrientationIcon size={14} aria-hidden="true" />
            {frame.portrait ? 'Portrait' : 'Landscape'}
          </button>
        </>
      )}
    </div>
  );
}
