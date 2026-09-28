/**
 * Bridge between the HTML screenshot button (outside the Canvas) and the
 * three.js renderer (inside it). ScreenshotBridge registers the capture
 * function while the Canvas is mounted.
 */
let captureImpl = null;

/** @param {() => { dataUrl: string, width: number, height: number, cssWidth: number, cssHeight: number }} capture */
export function registerCapture(capture) {
  captureImpl = capture;
  return () => {
    if (captureImpl === capture) captureImpl = null;
  };
}

/** Renders one frame without helper meshes and returns it as a PNG data URL. */
export function captureCanvas() {
  if (!captureImpl) throw new Error('The 3D view is not ready yet.');
  return captureImpl();
}
