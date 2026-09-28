import { setViewToggle, useViewState } from '../../state/viewStore.js';
import { ToggleField } from './fields.jsx';

const TOGGLES = [
  { key: 'showBackground', label: 'Background (18% gray cyc)', title: '#767676 sweep behind the subject; receives shadows, casts none.' },
  { key: 'showBokehSpheres', label: 'Bokeh spheres', title: 'Small emissive spheres behind the subject; they light nothing.' },
  { key: 'showFloorGrid', label: 'Floor grid (0.5 m)', title: '0.5 m grid on the floor.' },
  { key: 'showAngleGuide', label: 'Angle guide', title: 'Floor protractor in light-azimuth degrees (0° = camera side), 1 m rings, photo camera angle of view.' },
  { key: 'showAfTarget', label: 'Show AF target', title: 'Red sphere where the camera focuses.' },
];

/** Studio environment and guides; the same state in both modes (state/viewStore.js). */
export function EnvironmentToggles() {
  const view = useViewState();
  return (
    <div className="environment-toggles" role="group" aria-label="Studio environment">
      <span className="environment-toggles__title">Studio environment</span>
      <div className="environment-toggles__grid">
        {TOGGLES.map(({ key, label, title }) => (
          <ToggleField key={key} label={label} title={title} checked={view[key]} onChange={(on) => setViewToggle(key, on)} />
        ))}
      </div>
      <span className="field__hint">
        None of these cast shadows or emit light. AF target, angle guide and light rays are left out of screenshots.
      </span>
    </div>
  );
}
