import { useState } from 'react';
import {
  getAllStrobes,
  getCompatibleModifiers,
  isModifierCompatible,
} from '../../config/equipmentRegistry.js';
import { useLightingActions } from '../../state/LightingContext.jsx';
import { EquipmentPicker } from './EquipmentPicker.jsx';

export function AddLightForm() {
  const { addLight } = useLightingActions();
  const [strobeId, setStrobeId] = useState(() => getAllStrobes()[0]?.id);
  const [modifierId, setModifierId] = useState(() => getCompatibleModifiers(strobeId)[0]?.id);

  const handleStrobeChange = (nextStrobeId) => {
    setStrobeId(nextStrobeId);
    if (!isModifierCompatible(nextStrobeId, modifierId)) {
      setModifierId(getCompatibleModifiers(nextStrobeId)[0]?.id);
    }
  };

  return (
    <section className="panel-section">
      <h2 className="panel-section__title">Add Light</h2>
      <EquipmentPicker
        strobeId={strobeId}
        modifierId={modifierId}
        onStrobeChange={handleStrobeChange}
        onModifierChange={setModifierId}
      />
      <button type="button" className="button button--primary" onClick={() => addLight({ strobeId, modifierId })}>
        + Add to scene
      </button>
    </section>
  );
}
