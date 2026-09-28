import { ChevronDown, ChevronUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { APP_MODES } from '../../config/cameraConfig.js';
import { getModifierById, getStrobeById } from '../../config/equipmentRegistry.js';
import { SUBJECT_TARGET } from '../../config/sceneConfig.js';
import { formatFNumber, formatMeters, selectCameraOptics } from '../../state/cameraSelectors.js';
import { useCameraState } from '../../state/cameraStore.js';
import { useLightingState } from '../../state/LightingContext.jsx';
import { selectFixturePose, selectLightColor } from '../../state/lightSelectors.js';
import { formatPowerLevel, formatWs, powerLevelToWs } from '../../utils/lightMath.js';
import { FOCUS_MODE_LABELS } from '../panel/camera/cameraFormat.js';

const RAD_TO_DEG = 180 / Math.PI;

/**
 * Where a fixture actually is, relative to the subject's head (SUBJECT_TARGET):
 * from the resolved pose, so shift offsets are included. Azimuth 0° = camera
 * side (+Z), +90° = subject's left (+X), like the placement sliders.
 */
function fixtureReadout(light) {
  const pose = selectFixturePose(light);
  const [x, y, z] = pose.position;
  const dx = x - SUBJECT_TARGET[0];
  const dy = y - SUBJECT_TARGET[1];
  const dz = z - SUBJECT_TARGET[2];
  return {
    distanceM: pose.distanceToSubject,
    azimuthDeg: Math.atan2(dx, dz) * RAD_TO_DEG,
    elevationDeg: Math.atan2(dy, Math.hypot(dx, dz)) * RAD_TO_DEG,
    heightM: y,
  };
}

const signedDegrees = (value) => `${Math.round(value) > 0 ? '+' : ''}${Math.round(value)}°`;

/**
 * Transparent overlay (top left of the 3D view): current camera settings and
 * the live position of every light. Derived on every render from the same
 * state/selectors as the scene and the panel, so moving a slider updates it
 * immediately. HTML only: not part of the WebGL render or of screenshots.
 */
export function SetupHud() {
  const { lights, selectedLightId } = useLightingState();
  const camera = useCameraState();
  const optics = useMemo(() => selectCameraOptics(camera), [camera]);
  const [collapsed, setCollapsed] = useState(false);
  const { body, lens, angles, dof } = optics;
  const eyeTarget = camera.eyeTarget;

  return (
    <aside className={`setup-hud ${collapsed ? 'setup-hud--collapsed' : ''}`} aria-label="Setup HUD" data-testid="setup-hud">
      <header className="setup-hud__header">
        <strong>Setup HUD</strong>
        <span className="setup-hud__mode">{camera.appMode === APP_MODES.CAMERA ? 'Camera view' : 'Lighting view'}</span>
        <button
          type="button"
          className="setup-hud__toggle"
          aria-label={collapsed ? 'Expand HUD' : 'Collapse HUD'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronUp size={14} aria-hidden="true" />}
        </button>
      </header>

      {!collapsed && (
        <>
          <section className="setup-hud__section" data-testid="hud-camera">
            <div className="setup-hud__line setup-hud__line--strong">
              {body.name.replace('FUJIFILM ', '')} · {lens.name} · {formatFNumber(camera.fNumber)}
            </div>
            <div className="setup-hud__line">
              {FOCUS_MODE_LABELS[camera.focusMode]} {formatMeters(camera.focusDistanceM)} · DoF {formatMeters(dof.nearM)}–
              {formatMeters(dof.farM)} · AoV {angles.horizontalDeg.toFixed(1)}° × {angles.verticalDeg.toFixed(1)}°
            </div>
            <div className="setup-hud__line">
              Camera z {formatMeters(camera.shootingDistanceM)} · height {formatMeters(camera.cameraHeightM)} · aim{' '}
              {formatMeters(camera.aimHeightM)}
            </div>
            <div
              className="setup-hud__line setup-hud__line--muted"
              data-testid="eye-af-source"
              data-eye-source={eyeTarget?.source ?? ''}
              data-eye-point={JSON.stringify(eyeTarget?.point ?? null)}
              data-face-point={JSON.stringify(camera.facePoint)}
            >
              Eye AF: {eyeTarget ? `${eyeTarget.label} · ${optics.eyeInFocus ? 'in focus' : 'out of focus'}` : 'not measured yet'}
            </div>
          </section>

          <section className="setup-hud__section">
            <table className="setup-hud__lights" data-testid="hud-lights">
              <thead>
                <tr>
                  <th scope="col" colSpan={2}>
                    Lights ({lights.filter((light) => light.enabled).length}/{lights.length} on)
                  </th>
                  <th scope="col" title="3D distance to the subject's head">Dist</th>
                  <th scope="col" title="Azimuth around the subject: 0° = camera side, +90° = subject's left">Az</th>
                  <th scope="col" title="Elevation above the head">El</th>
                  <th scope="col" title="Fixture height above the floor">Height</th>
                  <th scope="col">Power</th>
                </tr>
              </thead>
              <tbody>
                {lights.map((light) => {
                  const strobe = getStrobeById(light.strobeId);
                  const modifier = getModifierById(light.modifierId);
                  const readout = fixtureReadout(light);
                  const color = selectLightColor(light);
                  return (
                    <tr
                      key={light.id}
                      className={`${light.id === selectedLightId ? 'setup-hud__row--selected' : ''} ${light.enabled ? '' : 'setup-hud__row--off'}`}
                      data-light-id={light.id}
                    >
                      <td>
                        <span
                          className={`light-card__dot ${light.enabled ? 'light-card__dot--on' : ''}`}
                          style={light.enabled ? { '--dot-color': color.displayHex } : undefined}
                        />
                      </td>
                      <td className="setup-hud__name" title={`${strobe?.name ?? ''} · ${modifier?.name ?? ''}`}>
                        {light.label}
                      </td>
                      <td data-field="distance">{readout.distanceM.toFixed(2)} m</td>
                      <td data-field="azimuth">{signedDegrees(readout.azimuthDeg)}</td>
                      <td data-field="elevation">{signedDegrees(readout.elevationDeg)}</td>
                      <td data-field="height">{readout.heightM.toFixed(2)} m</td>
                      <td data-field="power">
                        {formatPowerLevel(light.powerLevel)}
                        {strobe ? ` · ${formatWs(powerLevelToWs(strobe.maxWs, light.powerLevel))}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {lights.length === 0 && <div className="setup-hud__line setup-hud__line--muted">No lights in the scene.</div>}
          </section>
        </>
      )}
    </aside>
  );
}
