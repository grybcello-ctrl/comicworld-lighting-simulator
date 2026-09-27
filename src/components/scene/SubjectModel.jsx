import { useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import { SUBJECT_TYPES } from '../../config/sceneConfig.js';
import { useSubjectState } from '../../state/subjectStore.js';
import { MannequinSubject } from './MannequinSubject.jsx';

/**
 * Shadow maps render on demand (StudioLight's useOnDemandShadow only reacts to
 * light changes), so a new subject must request one refresh of every map —
 * otherwise the previous subject's shadow would stay on the floor.
 * Runs after the commit, i.e. once the new subject is attached to the scene.
 */
function useShadowRefreshOnChange(subjectKey) {
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    scene.traverse((object) => {
      if (object.isLight && object.shadow) object.shadow.needsUpdate = true;
    });
    invalidate();
  }, [subjectKey, scene, invalidate]);
}

/**
 * The lit subject: the default mannequin, or the uploaded model once it is
 * ready. While 'Custom Model' is selected but nothing is loaded yet (or a load
 * failed), the mannequin stays as a placeholder so the scene is never empty.
 *
 * The custom model is a <primitive>: r3f never disposes primitives, and the
 * subject store owns (and disposes) the object — so there is exactly one owner.
 */
export function SubjectModel() {
  const { subjectType, model } = useSubjectState();
  const showCustom = subjectType === SUBJECT_TYPES.CUSTOM && model.object !== null;
  const subjectKey = showCustom ? `custom-${model.id}` : SUBJECT_TYPES.MANNEQUIN;
  useShadowRefreshOnChange(subjectKey);

  return showCustom ? <primitive key={subjectKey} object={model.object} /> : <MannequinSubject />;
}
