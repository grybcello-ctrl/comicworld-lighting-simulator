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
      <ToggleField
        label="Pose Mode (자세 조절)"
        checked={poseMode}
        onChange={poseActions.setPoseMode}
        title="Rotate the joints of a rigged glTF model with a gizmo in the 3D view."
      />
      {poseMode && bones.length === 0 && (
        <span className="field__hint">
          This subject has no skeleton. Load a rigged glTF/GLB (e.g. a Mixamo character) as Custom Model.
        </span>
      )}
      {poseMode && bones.length > 0 && (
        <>
          <label className="field">
            <span className="field__label">Bone ({bones.length})</span>
            <select
              value={selectedBoneId ?? ''}
              aria-label="Bone"
              onChange={(event) => poseActions.selectBone(event.target.value || null)}
            >
              <option value="">— Select a bone —</option>
              {bones.map((item) => (
                <option key={item.id} value={item.id}>
                  {'\u00a0\u00a0'.repeat(Math.min(item.depth, 12))}
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {rotation && (
            <span className="field__hint">
              Rotation X / Y / Z: {rotation.map((v) => `${v.toFixed(1)}°`).join(' / ')} · drag the rings in the 3D view
              (the view does not orbit while dragging).
            </span>
          )}
          <div className="button-row">
            <button type="button" className="button button--small" disabled={!bone} onClick={poseActions.resetSelectedBone}>
              Reset bone
            </button>
            <button type="button" className="button button--small" disabled={!posed} onClick={poseActions.resetPose}>
              Reset pose
            </button>
          </div>
        </>
      )}
      {!poseMode && posed && <span className="field__hint">Pose kept. Turn Pose Mode on to edit it.</span>}
    </div>
  );
}
