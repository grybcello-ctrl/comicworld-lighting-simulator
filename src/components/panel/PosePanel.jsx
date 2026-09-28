import { Bone, RotateCcw, Undo2 } from 'lucide-react';
import { Euler } from 'three';
import { getBoneObject, isPosed, poseActions, usePoseState } from '../../state/poseStore.js';
import { IconButton, RowGroup } from '../ui/IconButton.jsx';
import { ToggleField } from './fields.jsx';

const RAD_TO_DEG = 180 / Math.PI;
const euler = new Euler();

/** Pose Mode (option row): pick a bone, then drag the gizmo rings in the 3D view to rotate it. */
export function PosePanel() {
  const { poseMode, bones, selectedBoneId, revision } = usePoseState();
  const bone = getBoneObject(selectedBoneId);
  const rotation = bone ? euler.setFromQuaternion(bone.quaternion).toArray().slice(0, 3).map((r) => r * RAD_TO_DEG) : null;
  const posed = bones.length > 0 && isPosed();
  const hint =
    bones.length === 0
      ? 'This subject has no skeleton. Load a rigged glTF/GLB (e.g. a Mixamo character) as Custom Model.'
      : rotation
        ? `Rotation X / Y / Z: ${rotation.map((v) => `${v.toFixed(1)}°`).join(' / ')} · drag the rings in the 3D view (the view does not orbit while dragging)`
        : 'Select a bone, then drag the gizmo rings in the 3D view.';

  return (
    <RowGroup title="Pose">
      <div
        className="pose-panel"
        data-testid="pose-panel"
        data-pose-revision={revision}
        data-bone-count={bones.length}
        data-selected-rotation={rotation ? JSON.stringify(rotation.map((v) => +v.toFixed(3))) : ''}
      >
        <ToggleField
          icon={Bone}
          label="Pose Mode"
          checked={poseMode}
          onChange={poseActions.setPoseMode}
          title="Pose Mode (자세 조절): rotate the joints of a rigged glTF model with a gizmo in the 3D view."
        />
        {poseMode && bones.length === 0 && (
          <span className="status-message status-message--inline" data-tooltip={hint}>
            This subject has no skeleton
          </span>
        )}
        {poseMode && bones.length > 0 && (
          <>
            <select
              className="pose-panel__select"
              value={selectedBoneId ?? ''}
              aria-label="Bone"
              data-tooltip={hint}
              onChange={(event) => poseActions.selectBone(event.target.value || null)}
            >
              <option value="">— Bone ({bones.length}) —</option>
              {bones.map((item) => (
                <option key={item.id} value={item.id}>
                  {'\u00a0\u00a0'.repeat(Math.min(item.depth, 12))}
                  {item.label}
                </option>
              ))}
            </select>
            <IconButton icon={Undo2} label="Reset bone" disabled={!bone} onClick={poseActions.resetSelectedBone} />
          </>
        )}
        {bones.length > 0 && (
          <IconButton icon={RotateCcw} label="Reset pose" disabled={!posed} onClick={poseActions.resetPose} />
        )}
      </div>
    </RowGroup>
  );
}
