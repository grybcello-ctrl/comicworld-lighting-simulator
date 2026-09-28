import { Box, Crosshair, Grid2x2, Image, RotateCcw, Sparkles } from 'lucide-react';
import { ENVIRONMENT_ADJUST_LIMITS } from '../../config/environmentConfig.js';
import { resetBokehOffset, setViewToggle, setViewValue, useViewState } from '../../state/viewStore.js';
import { IconButton, RowGroup } from '../ui/IconButton.jsx';
import { SliderField, ToggleField } from './fields.jsx';

const TOGGLES = [
  { key: 'showBackground', label: '18% Gray BG', icon: Image, title: 'Background: #767676 cyclorama behind the subject; receives shadows, casts none.' },
  { key: 'showBokehSpheres', label: 'Bokeh', icon: Sparkles, title: 'Small emissive spheres behind the subject; they light nothing.' },
  { key: 'showFloorGrid', label: 'Grid', icon: Grid2x2, title: 'Floor grid, 0.5 m cells.' },
  { key: 'showAngleGuide', label: 'Angle guide', icon: Box, title: 'Floor protractor in light-azimuth degrees (0° = camera side), 1 m rings, photo camera angle of view. Left out of screenshots.' },
  { key: 'showAfTarget', label: 'AF target', icon: Crosshair, title: 'Red sphere where the camera focuses. Left out of screenshots.' },
];

const BOKEH_SLIDERS = [
  { key: 'bokehOffsetX', label: 'Bokeh X', tooltip: 'Bokeh spheres left − / right + (m)' },
  { key: 'bokehOffsetY', label: 'Bokeh Y', tooltip: 'Bokeh spheres down − / up + (m)' },
  { key: 'bokehOffsetZ', label: 'Bokeh Z', tooltip: 'Bokeh spheres back − / towards the camera + (m)' },
];

const formatOffset = (value) => `${value > 0 ? '+' : ''}${value.toFixed(2)} m`;

/** Brightness factor with the background's reflectance and its exposure relative to 18% gray. */
function formatBrightness(value) {
  if (value === 0) return '0.00 · black';
  const ev = Math.log2(value);
  return `${value.toFixed(2)} (${ev >= 0 ? '+' : '−'}${Math.abs(ev).toFixed(1)} EV)`;
}

/** Row 3: environment on/off toggles (the same state in both modes, state/viewStore.js). */
export function EnvironmentToggleChips() {
  const view = useViewState();
  return (
    <RowGroup title="Environment">
      {TOGGLES.map(({ key, label, icon, title }) => (
        <ToggleField key={key} icon={icon} label={label} title={title} checked={view[key]} onChange={(on) => setViewToggle(key, on)} />
      ))}
    </RowGroup>
  );
}

/** Row 2: background brightness and bokeh position sliders. */
export function EnvironmentSliders() {
  const view = useViewState();
  const bokehMoved = BOKEH_SLIDERS.some(({ key }) => view[key] !== 0);
  return (
    <RowGroup title="Environment">
      <SliderField
        compact
        label="Background Brightness"
        value={view.backgroundBrightness}
        {...ENVIRONMENT_ADJUST_LIMITS.backgroundBrightness}
        disabled={!view.showBackground}
        onChange={(value) => setViewValue('backgroundBrightness', value)}
        formatValue={formatBrightness}
        tooltip={`Background reflectance ${(18.4 * view.backgroundBrightness).toFixed(1)}% — 0 = black, 1 = 18% gray, 2 = +1 EV`}
      />
      {BOKEH_SLIDERS.map(({ key, label, tooltip }) => (
        <SliderField
          compact
          key={key}
          label={label}
          value={view[key]}
          {...ENVIRONMENT_ADJUST_LIMITS[key]}
          disabled={!view.showBokehSpheres}
          onChange={(value) => setViewValue(key, value)}
          formatValue={formatOffset}
          tooltip={tooltip}
        />
      ))}
      <IconButton icon={RotateCcw} label="Reset bokeh position" disabled={!bokehMoved} onClick={resetBokehOffset} />
    </RowGroup>
  );
}
