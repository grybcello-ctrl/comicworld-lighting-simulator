import { useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import { registerCapture } from '../../state/screenshotService.js';

/**
 * Registers the canvas capture used by the 'Take Screenshot' button.
 *
 * Capture, all in one synchronous task (the screen never shows the frame
 * without helpers):
 *   1. hide every object flagged `userData.hideInScreenshot` (AF target
 *      marker, angle guide, light rays) that is currently visible,
 *   2. render one frame exactly like the frame loop does (r3f `advance`:
 *      direct render in lighting mode, the DoF composer in camera mode),
 *   3. read the drawing buffer (preserveDrawingBuffer: true) as PNG,
 *   4. restore the helpers and render again.
 * Shadow maps are not re-rendered: the hidden helpers cast no shadows.
 */
export function ScreenshotBridge() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const advance = useThree((state) => state.advance);
  const size = useThree((state) => state.size);

  useLayoutEffect(
    () =>
      registerCapture(() => {
        const hidden = [];
        scene.traverse((object) => {
          if (object.userData.hideInScreenshot && object.visible) hidden.push(object);
        });
        let dataUrl;
        try {
          for (const object of hidden) object.visible = false;
          advance(performance.now(), false);
          dataUrl = gl.domElement.toDataURL('image/png');
        } finally {
          for (const object of hidden) object.visible = true;
          advance(performance.now(), false);
        }
        return {
          dataUrl,
          width: gl.domElement.width,
          height: gl.domElement.height,
          cssWidth: size.width,
          cssHeight: size.height,
          hiddenHelpers: hidden.map((object) => object.name || object.type),
        };
      }),
    [gl, scene, advance, size.width, size.height],
  );

  return null;
}
