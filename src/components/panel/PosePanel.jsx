import { Bone, FileUp, Film, RotateCcw, Undo2, X } from 'lucide-react';
import { useRef } from 'react';
import { Euler } from 'three';
import { POSE_FILE_ACCEPT } from '../../utils/poseFileLoader.js';
import { Chip, IconSlider } from '../ui/IconSlider.jsx';
import { getBoneObject, isPosed, poseActions, usePoseState } from '../../state/poseStore.js';
import { ToggleField } from './fields.jsx';

const RAD_TO_DEG = 180 / Math.PI;
const euler = new Euler();

/** Pose Mode: pick a bone, then drag the gizmo rings in the 3D view to rotate it. */
/** 'Import Pose': a pose file (.glb/.gltf/.fbx/.bvh) retargeted onto the subject's skeleton. */
function PoseImport({ bones }) {
  const { importedPose, poseImport } = usePoseState();
  const inputRef = useRef(null);
  const clip = importedPose?.clips[importedPose.clipIndex];
  return (
    <div className="pose-import" data-testid="pose-import">
      <div className="button-line">
        <button
          type="button"
          className="text-button"
          disabled={poseImport.busy}
          data-tooltip="Import a pose from a .glb / .gltf / .fbx (e.g. Mixamo) or .bvh file. It is retargeted onto the subject's skeleton by bone names (Mixamo, Unreal, VRM, mocap …)."
          onClick={() => inputRef.current?.click()}
        >
          <FileUp size={13} aria-hidden="true" /> {poseImport.busy ? 'Importing…' : 'Import Pose'}
        </button>
        {importedPose && (
          <button type="button" className="text-button" onClick={poseActions.clearImportedPose} data-tooltip="Remove the imported pose (back to the rest pose)">
            <X size={13} aria-hidden="true" /> Clear
          </button>
        )}
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept={POSE_FILE_ACCEPT}
          aria-label="Import pose file"
          data-testid="pose-import-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            poseActions.importPose(file);
          }}
        />
      </div>
      {bones.length === 0 && !importedPose && <p className="panel-note">Needs a rigged Custom Model (e.g. a Mixamo character).</p>}
      {poseImport.error && (
        <p className="panel-note panel-note--error" role="alert">
          {poseImport.error}
        </p>
      )}
      {importedPose && (
        <>
          <p className="panel-note" data-testid="pose-import-status">
            {importedPose.fileName} ({importedPose.format}) · {importedPose.applied.length} bones retargeted
          </p>
          {importedPose.clips.length > 1 && (
            <div className="chip-row__chips">
              {importedPose.clips.map((item, index) => (
                <Chip
                  key={`${item.name}-${index}`}
                  icon={Film}
                  label={item.name}
                  tooltip={`${item.name} · ${item.frames} frames @ ${item.fps} fps`}
                  active={index === importedPose.clipIndex}
                  onClick={() => poseActions.setImportedPoseFrame(index, 0)}
                />
              ))}
            </div>
          )}
          {clip && clip.frames > 1 && (
            <IconSlider
              icon={Film}
              label="Pose frame"
              tooltip={`Frame of '${clip.name}' (${clip.frames} frames @ ${clip.fps} fps)`}
              value={importedPose.frame}
              min={0}
              max={clip.frames - 1}
              step={1}
              onChange={(frame) => poseActions.setImportedPoseFrame(importedPose.clipIndex, frame)}
              formatValue={(frame) => `${frame} / ${clip.frames - 1}`}
            />
          )}
        </>
      )}
    </div>
  );
}

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
      <PoseImport bones={bones} />
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
