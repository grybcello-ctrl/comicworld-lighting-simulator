import { ENVIRONMENT_ADJUST_LIMITS } from '../../config/environmentConfig.js';
import { resetBokehOffset, setViewToggle, setViewValue, useViewState } from '../../state/viewStore.js';
import { SliderField, ToggleField } from './fields.jsx';

const TOGGLES = [
  { key: 'showBackground', label: 'Background (18% gray cyc)', title: '#767676 sweep behind the subject; receives shadows, casts none.' },
  { key: 'showBokehSpheres', label: 'Bokeh spheres', title: 'Small emissive spheres behind the subject; they light nothing.' },
  { key: 'showFloorGrid', label: 'Floor grid (0.5 m)', title: '0.5 m grid on the floor.' },
  { key: 'showAngleGuide', label: 'Angle guide', title: 'Floor protractor in light-azimuth degrees (0° = camera side), 1 m rings, photo camera angle of view.' },
  { key: 'showAfTarget', label: 'Show AF target', title: 'Red sphere where the camera focuses.' },
];

const BOKEH_SLIDERS = [
  { key: 'bokehOffsetX', label: 'Bokeh X (left − / right +)' },
  { key: 'bokehOffsetY', label: 'Bokeh Y (down − / up +)' },
  { key: 'bokehOffsetZ', label: 'Bokeh Z (back − / towards camera +)' },
];

const formatOffset = (value) => `${value > 0 ? '+' : ''}${value.toFixed(2)} m`;

/** Background reflectance and its exposure relative to 18% gray. */
function formatBrightness(value) {
  const reflectance = `${(18.4 * value).toFixed(1)}%`;
  if (value === 0) return `0.00 · black`;
  const ev = Math.log2(value);
  return `${value.toFixed(2)} · ${reflectance} (${ev >= 0 ? '+' : '−'}${Math.abs(ev).toFixed(1)} EV)`;
}

/** Studio environment and guides; the same state in both modes (state/viewStore.js). */
export function EnvironmentToggles() {
  const view = useViewState();
  const bokehMoved = BOKEH_SLIDERS.some(({ key }) => view[key] !== 0);
  return (
    <div className="environment-toggles" role="group" aria-label="Studio environment">
      <span className="environment-toggles__title">Studio environment</span>
      <div className="environment-toggles__grid">
        {TOGGLES.map(({ key, label, title }) => (
          <ToggleField key={key} label={label} title={title} checked={view[key]} onChange={(on) => setViewToggle(key, on)} />
        ))}
      </div>
      <SliderField
        label="Background Brightness"
        value={view.backgroundBrightness}
        {...ENVIRONMENT_ADJUST_LIMITS.backgroundBrightness}
        disabled={!view.showBackground}
        onChange={(value) => setViewValue('backgroundBrightness', value)}
        formatValue={formatBrightness}
        hint="Scales the cyc's reflectance: 0 = black, 1 = 18% gray, 2 = +1 EV."
      />
      {BOKEH_SLIDERS.map(({ key, label }) => (
        <SliderField
          key={key}
          label={label}
          value={view[key]}
          {...ENVIRONMENT_ADJUST_LIMITS[key]}
          disabled={!view.showBokehSpheres}
          onChange={(value) => setViewValue(key, value)}
          formatValue={formatOffset}
        />
      ))}
      <button type="button" className="button button--small" disabled={!bokehMoved} onClick={resetBokehOffset}>
        Reset bokeh position
      </button>
      <span className="field__hint">
        None of these cast shadows or emit light. AF target, angle guide, light rays and the pose gizmo are left out of
        screenshots.
      </span>
    </div>
  );
}
