import { Bone, RotateCcw, Undo2 } from 'lucide-react';
import { Euler } from 'three';
import { getBoneObject, isPosed, poseActions, usePoseState } from '../../state/poseStore.js';
import { ToggleField } from './fields.jsx';

const RAD_TO_DEG = 180 / Math.PI;
const euler = new Euler();

/** Pose Mode: pick a bone, then drag the gizmo rings in the 3D view to rotate it. */
export function PosePanel() {
  const { poseMode, bones, selectedBoneId, revision } = usePoseState();
  const bone = getBoneObject(selectedBoneId);
  const rotation = bone ? euler.setFromQuaternion(bone.quaternion).toArray().slice(0, 3).map((r) => r * RAD_TO_DEG) : null;
  const posed = bones.length > 0 && isPosed();

  return (
    <div
      className="pose-panel"
      data-testid="pose-panel"
      data-pose-revision={revision}
      data-bone-count={bones.length}
      data-selected-rotation={rotation ? JSON.stringify(rotation.map((v) => +v.toFixed(3))) : ''}
    >
      <div className="toggle-chips">
        <ToggleField
          icon={Bone}
          label="Pose Mode"
          checked={poseMode}
          onChange={poseActions.setPoseMode}
          title="Pose Mode (자세 조절): rotate the joints of a rigged glTF model with a gizmo in the 3D view."
        />
      </div>
      {poseMode && bones.length === 0 && (
        <p className="panel-note">This subject has no skeleton. Load a rigged glTF/GLB (e.g. a Mixamo character) as Custom Model.</p>
      )}
      {poseMode && bones.length > 0 && (
        <>
          <select
            className="panel-select"
            value={selectedBoneId ?? ''}
            aria-label="Bone"
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
          <p className="panel-note">
            {rotation
              ? `X / Y / Z ${rotation.map((v) => `${v.toFixed(1)}°`).join(' / ')} · drag the rings in the 3D view`
              : 'Select a bone, then drag the gizmo rings in the 3D view.'}
          </p>
        </>
      )}
      {bones.length > 0 && (
        <div className="button-line">
          {poseMode && (
            <button type="button" className="text-button" disabled={!bone} onClick={poseActions.resetSelectedBone}>
              <Undo2 size={13} aria-hidden="true" /> Reset bone
            </button>
          )}
          <button type="button" className="text-button" disabled={!posed} onClick={poseActions.resetPose}>
            <RotateCcw size={13} aria-hidden="true" /> Reset pose
          </button>
        </div>
      )}
    </div>
  );
}
