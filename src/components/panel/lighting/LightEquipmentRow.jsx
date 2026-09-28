import { CircleSlash, Grid3x3, Info, Layers, Plus, Power, Trash2 } from 'lucide-react';
import {
  getAllStrobes,
  getCompatibleGels,
  getCompatibleGrids,
  getCompatibleModifiers,
  getModifierById,
  getStrobeById,
} from '../../../config/equipmentRegistry.js';
import { LIGHTING_PRESETS } from '../../../config/lightingPresets.js';
import { useLightingActions, useLightingState } from '../../../state/LightingContext.jsx';
import { selectFixturePose, selectLightColor, selectLightRig } from '../../../state/lightSelectors.js';
import { resolveLightColor } from '../../../utils/colorTemperature.js';
import { IconButton, RowGroup } from '../../ui/IconButton.jsx';
import { Popover, usePopover } from '../../ui/Popover.jsx';
import { modifierIcon, presetIcon, strobeIcon } from '../equipmentIcons.js';
import { ToggleField } from '../fields.jsx';
import { BeamReadout, ColorReadout } from '../LightReadouts.jsx';

/** Details of the selected light that do not fit a one-line row. */
function LightInfoPopover({ light, popover, update, removeLight }) {
  const pose = selectFixturePose(light);
  const rig = selectLightRig(light, pose);
  const color = selectLightColor(light);
  return (
    <Popover anchorRef={popover.anchorRef} open={popover.open} onClose={popover.close} title={`Light · ${light.label}`} testId="light-info">
      <div className="light-card__row">
        <input
          className="text-input"
          value={light.label}
          onChange={(event) => update({ label: event.target.value })}
          aria-label="Light name"
        />
        <ToggleField label="On" checked={light.enabled} onChange={(enabled) => update({ enabled })} />
      </div>
      <ColorReadout color={color} gelActive={light.gelEnabled} />
      {rig && <BeamReadout rig={rig} pose={pose} />}
      <button type="button" className="button button--danger" onClick={() => removeLight(light.id)}>
        Remove light
      </button>
    </Popover>
  );
}

/** Lights in the scene: select, switch on/off, add, details, remove. */
function LightChips({ lights, selected }) {
  const { selectLight, updateLight, addLight, removeLight } = useLightingActions();
  const info = usePopover();
  const addDefault = () => {
    const strobeId = selected?.strobeId ?? getAllStrobes()[0].id;
    addLight({ strobeId, modifierId: selected?.modifierId ?? getCompatibleModifiers(strobeId)[0]?.id });
  };
  return (
    <RowGroup title={`Lights (${lights.length})`}>
      {lights.map((light) => {
        const strobe = getStrobeById(light.strobeId);
        const modifier = getModifierById(light.modifierId);
        const color = selectLightColor(light);
        return (
          <button
            key={light.id}
            type="button"
            className={`light-chip ${light.id === selected?.id ? 'light-chip--selected' : ''} ${light.enabled ? '' : 'light-chip--off'}`}
            aria-label={light.label}
            aria-pressed={light.id === selected?.id}
            data-tooltip={`${light.label} — ${strobe?.name ?? '?'} · ${modifier?.name ?? '—'}${light.enabled ? '' : ' · off'}`}
            data-testid="light-chip"
            onClick={() => selectLight(light.id)}
          >
            <span
              className={`light-card__dot ${light.enabled ? 'light-card__dot--on' : ''}`}
              style={light.enabled ? { '--dot-color': color.displayHex } : undefined}
            />
            <span className="light-chip__label">{light.label}</span>
          </button>
        );
      })}
      {selected && (
        <IconButton
          icon={Power}
          label={selected.enabled ? `Turn ${selected.label} off` : `Turn ${selected.label} on`}
          active={selected.enabled}
          onClick={() => updateLight(selected.id, { enabled: !selected.enabled })}
        />
      )}
      <IconButton icon={Plus} label="Add light (same equipment as the selected one)" onClick={addDefault} testId="add-light" />
      {selected && (
        <>
          <IconButton ref={info.anchorRef} icon={Info} label="Light details (name, beam, shadow)" active={info.open} onClick={info.toggle} />
          <IconButton icon={Trash2} label={`Remove ${selected.label}`} onClick={() => removeLight(selected.id)} className="icon-button--danger" />
          <LightInfoPopover
            light={selected}
            popover={info}
            update={(changes) => updateLight(selected.id, changes)}
            removeLight={(id) => {
              info.close();
              removeLight(id);
            }}
          />
        </>
      )}
    </RowGroup>
  );
}

function StrobeButtons({ light, update }) {
  return (
    <RowGroup title="Strobe">
      {getAllStrobes().map((strobe) => {
        const { icon, caption } = strobeIcon(strobe);
        return (
          <IconButton
            key={strobe.id}
            icon={icon}
            caption={caption}
            label={strobe.name}
            tooltip={`${strobe.name} · ${strobe.maxWs} Ws`}
            active={light.strobeId === strobe.id}
            onClick={() => update({ strobeId: strobe.id })}
          />
        );
      })}
    </RowGroup>
  );
}

/** Only modifiers that fit the strobe's mount (directly or via adapter). */
function ModifierButtons({ light, update }) {
  return (
    <RowGroup title="Modifier">
      {getCompatibleModifiers(light.strobeId).map((modifier) => {
        const { icon, caption } = modifierIcon(modifier);
        return (
          <IconButton
            key={modifier.id}
            icon={icon}
            caption={caption}
            label={modifier.name}
            active={light.modifierId === modifier.id}
            onClick={() => update({ modifierId: modifier.id })}
          />
        );
      })}
    </RowGroup>
  );
}

/** Grids and inner diffuser the modifier offers (hidden when it offers none). */
function AccessoryButtons({ light, update }) {
  const grids = getCompatibleGrids(light.modifierId);
  const diffuser = getModifierById(light.modifierId)?.accessories?.innerDiffuser;
  if (grids.length === 0 && !diffuser) return null;
  return (
    <RowGroup title="Accessory">
      {grids.length > 0 && (
        <IconButton icon={CircleSlash} caption="No grid" label="No grid" active={!light.gridId} onClick={() => update({ gridId: null })} />
      )}
      {grids.map((grid) => (
        <IconButton
          key={grid.id}
          icon={Grid3x3}
          caption={grid.name.replace(/\s*\(.*\)/, '')}
          label={`Grid · ${grid.name}`}
          active={light.gridId === grid.id}
          onClick={() => update({ gridId: grid.id })}
        />
      ))}
      {diffuser && (
        <IconButton
          icon={Layers}
          caption="Diffuser"
          label={`${diffuser.name} (−${diffuser.lightLossStops} EV, softer shadows)`}
          active={light.innerDiffuser}
          onClick={() => update({ innerDiffuser: !light.innerDiffuser })}
        />
      )}
    </RowGroup>
  );
}

/** OCF gels as color swatches; only strobes with a gel mount get them. */
function GelButtons({ light, update }) {
  const gels = getCompatibleGels(light.strobeId);
  if (gels.length === 0) {
    return (
      <RowGroup title="Gel">
        <IconButton icon={CircleSlash} caption="n/a" label="OCF gels fit Profoto B10-series heads only." disabled />
      </RowGroup>
    );
  }
  return (
    <RowGroup title="Gel">
      <IconButton icon={CircleSlash} caption="No gel" label="No gel" active={!light.gelEnabled} onClick={() => update({ gelEnabled: false })} />
      {gels.map((gel) => (
        <IconButton
          key={gel.id}
          swatch={resolveLightColor(null, gel).displayHex}
          caption={gel.name}
          label={`Gel · ${gel.name}`}
          active={light.gelEnabled && light.gelId === gel.id}
          onClick={() => update({ gelEnabled: true, gelId: gel.id })}
        />
      ))}
    </RowGroup>
  );
}

function PresetButtons() {
  const { loadPreset } = useLightingActions();
  return (
    <RowGroup title="Presets">
      {LIGHTING_PRESETS.map((preset) => {
        const { icon, caption } = presetIcon(preset);
        return (
          <IconButton
            key={preset.id}
            icon={icon}
            caption={caption}
            label={preset.name}
            tooltip={`Preset · ${preset.name} (${preset.lights.length} lights, replaces the current ones)`}
            onClick={() => loadPreset(preset.id)}
          />
        );
      })}
    </RowGroup>
  );
}

/** Row 1 (lighting mode): lights and their equipment as icon buttons, presets. */
export function LightEquipmentRow() {
  const { lights, selectedLightId } = useLightingState();
  const { updateLight } = useLightingActions();
  const selected = lights.find((light) => light.id === selectedLightId) ?? null;
  const update = (changes) => updateLight(selected.id, changes);
  return (
    <>
      <LightChips lights={lights} selected={selected} />
      {selected && (
        <>
          <StrobeButtons light={selected} update={update} />
          <ModifierButtons light={selected} update={update} />
          <AccessoryButtons light={selected} update={update} />
          <GelButtons light={selected} update={update} />
        </>
      )}
      <PresetButtons />
    </>
  );
}
