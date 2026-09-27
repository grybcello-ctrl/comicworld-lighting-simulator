import {
  getAllStrobes,
  getCompatibleModifiers,
  groupModifiersByCategory,
  groupStrobesByCategory,
} from '../../config/equipmentRegistry.js';
import { GroupedSelectField } from './fields.jsx';

/**
 * Strobe + modifier selectors. The modifier list is automatically filtered
 * to what fits the selected strobe's mount, so new catalog entries appear
 * here without any UI changes.
 */
export function EquipmentPicker({ strobeId, modifierId, onStrobeChange, onModifierChange }) {
  const strobeGroups = groupStrobesByCategory(getAllStrobes());
  const modifierGroups = groupModifiersByCategory(getCompatibleModifiers(strobeId));

  return (
    <>
      <GroupedSelectField
        label="Strobe"
        value={strobeId}
        groups={strobeGroups}
        onChange={onStrobeChange}
      />
      <GroupedSelectField
        label="Modifier"
        value={modifierId}
        groups={modifierGroups}
        onChange={onModifierChange}
      />
    </>
  );
}
