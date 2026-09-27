/**
 * Approximates the sRGB color of a black-body radiator (Tanner Helland's fit).
 * Valid roughly for 1000K–40000K.
 * @returns {string} sRGB hex color string, e.g. "#ffeedd".
 */
export function kelvinToHex(kelvin) {
  const temp = kelvin / 100;
  let red;
  let green;
  let blue;

  if (temp <= 66) {
    red = 255;
    green = 99.4708025861 * Math.log(temp) - 161.1195681661;
    blue = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    red = 329.698727446 * (temp - 60) ** -0.1332047592;
    green = 288.1221695283 * (temp - 60) ** -0.0755148492;
    blue = 255;
  }

  const toHexChannel = (value) =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`;
}
