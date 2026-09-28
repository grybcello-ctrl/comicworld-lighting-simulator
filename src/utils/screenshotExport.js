/**
 * Composites the captured 3D view and the setup HUD on an off-screen 2D
 * canvas (never attached to the page) and downloads the result as PNG.
 */
import { SCREENSHOT_CONFIG } from '../config/environmentConfig.js';

const STYLES = {
  title: { weight: 700, scale: 1.25, color: '#ffffff' },
  heading: { weight: 700, scale: 1.05, color: '#ffd166', gapBefore: 0.5 },
  item: { weight: 600, scale: 1, color: '#f2f2f5' },
  detail: { weight: 400, scale: 0.92, color: '#c9c9d2', indent: 1.4 },
  muted: { weight: 400, scale: 0.85, color: '#a0a0ab' },
};
const LINE_HEIGHT = 1.38;
const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The captured frame could not be decoded.'));
    image.src = src;
  });
}

/** Line layout at font size `px`: each line's font, offset and the panel size. */
function layoutHud(context, hud, px) {
  const entries = [{ text: hud.title, style: 'title' }, ...hud.lines];
  const padding = px;
  let y = padding;
  let width = 0;
  const lines = entries.map((line) => {
    const style = STYLES[line.style] ?? STYLES.detail;
    const size = px * style.scale;
    const font = `${style.weight} ${size}px ${FONT_FAMILY}`;
    context.font = font;
    const indent = (style.indent ?? 0) * px + (line.swatch ? px * 1.1 : 0);
    y += (style.gapBefore ?? 0) * px;
    const top = y;
    y += size * LINE_HEIGHT;
    width = Math.max(width, indent + context.measureText(line.text).width);
    return { ...line, style, size, font, indent, top };
  });
  return { lines, padding, width: width + 2 * padding, height: y + padding };
}

/** Semi-transparent HUD panel in the top-left corner, scaled to fit the image. */
function drawHud(context, hud, imageWidth, imageHeight) {
  const c = SCREENSHOT_CONFIG;
  const basePx = Math.max(c.hudMinFontPx, Math.round(imageHeight * c.hudFontFraction));
  let layout = layoutHud(context, hud, basePx);
  const fit = Math.min(
    1,
    (imageWidth * c.hudMaxWidthFraction) / layout.width,
    (imageHeight * c.hudMaxHeightFraction) / layout.height,
  );
  if (fit < 1) layout = layoutHud(context, hud, Math.max(6, basePx * fit));

  const margin = Math.round(basePx * 0.8);
  context.save();
  context.translate(margin, margin);
  context.fillStyle = c.hudBackground;
  context.beginPath();
  context.roundRect(0, 0, layout.width, layout.height, layout.padding * 0.6);
  context.fill();
  context.textBaseline = 'top';
  for (const line of layout.lines) {
    const x = layout.padding + line.indent;
    const y = line.top;
    if (line.swatch) {
      const box = line.size * 0.8;
      context.fillStyle = line.swatch;
      context.fillRect(x - line.size * 1.05, y + line.size * 0.12, box, box);
    }
    context.font = line.font;
    context.fillStyle = line.style.color;
    context.fillText(line.text, x, y);
  }
  context.restore();
}

/**
 * @param {{ dataUrl: string, crop: { x: number, y: number, width: number, height: number },
 *   hud: ReturnType<import('./setupHud.js').buildSetupHud> }} input
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function composeScreenshot({ dataUrl, crop, hud }) {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  const context = canvas.getContext('2d');
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  drawHud(context, hud, crop.width, crop.height);
  return canvas;
}

/** Saves a canvas as PNG through a temporary Blob URL (revoked later, see SCREENSHOT_CONFIG). */
export function downloadCanvas(canvas, fileName) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('PNG encoding failed.'));
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), SCREENSHOT_CONFIG.revokeDelayMs);
      resolve({ fileName, bytes: blob.size, width: canvas.width, height: canvas.height });
    }, 'image/png');
  });
}

const pad = (n) => String(n).padStart(2, '0');
export function screenshotFileName(appMode, date) {
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${SCREENSHOT_CONFIG.filePrefix}-${appMode}-${stamp}.png`;
}
