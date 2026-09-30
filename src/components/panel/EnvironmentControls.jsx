import { Box, Crosshair, Grid2x2, Image, MoveDiagonal2, MoveHorizontal, MoveVertical, RotateCcw, Sparkles, SunDim, UnfoldVertical } from 'lucide-react';
import { ENVIRONMENT_ADJUST_DEFAULTS, ENVIRONMENT_ADJUST_LIMITS } from '../../config/environmentConfig.js';
import { resetBokehOffset, setViewToggle, setViewValue, useViewState } from '../../state/viewStore.js';
import { IconSlider } from '../ui/IconSlider.jsx';
import { ToggleField } from './fields.jsx';

const TOGGLES = [
  { key: 'showBackground', label: '18% Gray BG', icon: Image, title: 'Background: #767676 cyclorama behind the subject; receives shadows, casts none.' },
  { key: 'showBokehSpheres', label: 'Bokeh', icon: Sparkles, title: 'Small emissive spheres behind the subject; they light nothing.' },
  { key: 'showFloorGrid', label: 'Grid', icon: Grid2x2, title: 'Floor grid, 0.5 m cells.' },
  { key: 'showAngleGuide', label: 'Angle guide', icon: Box, title: 'Floor protractor in light-azimuth degrees (0° = camera side), 1 m rings, photo camera angle of view. Left out of screenshots.' },
  { key: 'showAfTarget', label: 'AF target', icon: Crosshair, title: 'Red sphere where the camera focuses. Left out of screenshots.' },
];

const BOKEH_SLIDERS = [
  { key: 'bokehOffsetX', icon: MoveHorizontal, label: 'Bokeh X (left − / right +)' },
  { key: 'bokehOffsetY', icon: MoveVertical, label: 'Bokeh Y (down − / up +)' },
  { key: 'bokehOffsetZ', icon: MoveDiagonal2, label: 'Bokeh Z (back − / towards the camera +)' },
];

const formatOffset = (value) => `${value > 0 ? '+' : ''}${value.toFixed(2)} m`;

/** Brightness factor and its exposure relative to 18% gray. */
function formatBrightness(value) {
  if (value === 0) return 'black';
  const ev = Math.log2(value);
  return `${ev >= 0 ? '+' : '−'}${Math.abs(ev).toFixed(1)} EV`;
}

/** Environment section body (both modes, state/viewStore.js): toggles, then sliders. */
export function EnvironmentControls() {
  const view = useViewState();
  const bokehMoved = BOKEH_SLIDERS.some(({ key }) => view[key] !== 0);
  return (
    <>
      <div className="toggle-chips">
        {TOGGLES.map(({ key, label, icon, title }) => (
          <ToggleField key={key} icon={icon} label={label} title={title} checked={view[key]} onChange={(on) => setViewToggle(key, on)} />
        ))}
      </div>
      <IconSlider
        icon={SunDim}
        label="Background Brightness"
        tooltip={`Background brightness ×${view.backgroundBrightness.toFixed(2)} — reflectance ${(18.4 * view.backgroundBrightness).toFixed(1)}% (0 = black, 1 = 18% gray, 2 = +1 EV)`}
        value={view.backgroundBrightness}
        {...ENVIRONMENT_ADJUST_LIMITS.backgroundBrightness}
        defaultValue={ENVIRONMENT_ADJUST_DEFAULTS.backgroundBrightness}
        disabled={!view.showBackground}
        onChange={(value) => setViewValue('backgroundBrightness', value)}
        formatValue={formatBrightness}
      />
      <IconSlider
        icon={UnfoldVertical}
        label="Background Distance"
        tooltip="Background distance (배경 거리): subject → wall, 1–50 m. Light on the wall falls off with the inverse square of the real distance; in Camera View the wall blurs by its real depth."
        value={view.backgroundDistanceM}
        {...ENVIRONMENT_ADJUST_LIMITS.backgroundDistanceM}
        defaultValue={ENVIRONMENT_ADJUST_DEFAULTS.backgroundDistanceM}
        disabled={!view.showBackground}
        onChange={(value) => setViewValue('backgroundDistanceM', value)}
        formatValue={(value) => `${value.toFixed(1)} m`}
      />
      {BOKEH_SLIDERS.map(({ key, icon, label }) => (
        <IconSlider
          key={key}
          icon={icon}
          label={label}
          value={view[key]}
          {...ENVIRONMENT_ADJUST_LIMITS[key]}
          defaultValue={0}
          disabled={!view.showBokehSpheres}
          onChange={(value) => setViewValue(key, value)}
          formatValue={formatOffset}
        />
      ))}
      <button type="button" className="text-button" disabled={!bokehMoved} onClick={resetBokehOffset}>
        <RotateCcw size={13} aria-hidden="true" /> Reset bokeh position
      </button>
    </>
  );
}
