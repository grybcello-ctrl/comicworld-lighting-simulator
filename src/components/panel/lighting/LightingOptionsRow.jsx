import { ArrowDownToLine, Axis3d, Columns2, Eye, PersonStanding, ScanFace, Spotlight, Square } from 'lucide-react';
import { CAMERA_VIEWS } from '../../../config/sceneConfig.js';
import { useLightingActions, useLightingState } from '../../../state/LightingContext.jsx';
import { IconButton, RowGroup } from '../../ui/IconButton.jsx';
import { EnvironmentToggleChips } from '../EnvironmentControls.jsx';
import { ToggleField } from '../fields.jsx';
import { PosePanel } from '../PosePanel.jsx';
import { SetupFileControls } from '../SetupFileControls.jsx';
import { SubjectControls } from '../SubjectControls.jsx';

const VIEW_ICONS = {
  fullBody: PersonStanding,
  face: ScanFace,
  top: ArrowDownToLine,
  front: Square,
  side: Columns2,
  quarter: Axis3d,
};
const VIEW_TOOLTIPS = {
  fullBody: 'Full body view',
  face: 'Face close-up (skin texture)',
  top: 'Top — lighting map from above, fits every fixture',
  front: 'Front — from the camera side, fits every fixture',
  side: 'Side — from the subject’s left, fits every fixture',
  quarter: 'Quarter — 45° / 35° overview, fits every fixture',
};

/** Orbit-camera framings: subject views, then the overview (lighting map) views. */
function ViewButtons() {
  const { cameraView } = useLightingState();
  const { setCameraView } = useLightingActions();
  const button = ([id, view]) => (
    <IconButton
      key={id}
      icon={VIEW_ICONS[id] ?? Eye}
      caption={view.label}
      label={view.label}
      tooltip={VIEW_TOOLTIPS[id] ?? view.label}
      active={cameraView.id === id}
      onClick={() => setCameraView(id)}
    />
  );
  const views = Object.entries(CAMERA_VIEWS);
  return (
    <RowGroup title="View · 조명 배치 맵">
      {views.filter(([, view]) => view.group === 'subject').map(button)}
      <span className="row-group__divider" aria-hidden="true" />
      {views.filter(([, view]) => view.group === 'overview').map(button)}
    </RowGroup>
  );
}

/** Fixture meshes and light-ray helpers (the lights keep lighting either way). */
function HelperToggles() {
  const { showFixtures, showLightRays } = useLightingState();
  const { setShowFixtures, setShowLightRays } = useLightingActions();
  return (
    <RowGroup title="Show">
      <ToggleField
        icon={Eye}
        label="Fixtures"
        checked={showFixtures}
        onChange={setShowFixtures}
        title="Show / hide the 3D models of stands, strobes and modifiers (장비 외형). Light output is unaffected."
      />
      <ToggleField
        icon={Spotlight}
        label="Light rays"
        checked={showLightRays}
        onChange={setShowLightRays}
        className={showLightRays && !showFixtures ? 'toggle--warning' : ''}
        title={
          showLightRays && !showFixtures
            ? 'Light rays are hidden while fixtures are hidden — show fixtures to see them.'
            : 'Show Light Rays (빛 퍼짐 범위): each light’s beam cone, core and footprint at the subject.'
        }
      />
    </RowGroup>
  );
}

/** Row 3 (lighting mode): subject, views, visibility, environment, pose, setup file. */
export function LightingOptionsRow() {
  return (
    <>
      <RowGroup title="Subject">
        <SubjectControls />
      </RowGroup>
      <ViewButtons />
      <HelperToggles />
      <EnvironmentToggleChips />
      <PosePanel />
      <SetupFileControls />
    </>
  );
}
