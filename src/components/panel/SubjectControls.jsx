import { Upload } from 'lucide-react';
import { useRef } from 'react';
import { SUBJECT_CONFIG, SUBJECT_TYPES } from '../../config/sceneConfig.js';
import { loadCustomModel, setSubjectType, useSubjectState } from '../../state/subjectStore.js';
import { MODEL_FILE_ACCEPT } from '../../utils/modelLoader.js';
import { ReadoutList } from './fields.jsx';

const SUBJECT_OPTIONS = [
  { value: SUBJECT_TYPES.MANNEQUIN, label: 'Default Mannequin' },
  { value: SUBJECT_TYPES.CUSTOM, label: 'Custom Model' },
];

const formatBytes = (bytes) =>
  bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const formatVector = (values, digits = 2) => values.map((value) => value.toFixed(digits)).join(' × ');
const formatSigned = (value) => (Math.abs(value) < 5e-4 ? '0.000' : value.toFixed(3));

function describeReleased(released) {
  if (!released) return null;
  const parts = [
    `${released.geometries} geometries`,
    `${released.materials} materials`,
    `${released.textures} textures`,
  ];
  if (released.imageBitmaps) parts.push(`${released.imageBitmaps} image bitmaps`);
  parts.push(`${released.blobUrls ?? 0} blob URLs revoked`);
  return `Previous custom model disposed: ${parts.join(', ')}.`;
}

function describeImageSources({ embedded, external, total }) {
  if (total === 0) return 'none — the file has no texture references (selected images are matched by name)';
  const parts = [];
  if (embedded) parts.push(`${embedded} embedded`);
  if (external) parts.push(`${external} external file reference(s)`);
  return parts.join(' · ');
}

function ModelReadout({ info }) {
  const minY = info.fittedMin[1];
  const [centerX, , centerZ] = info.fittedCenter;
  const notes = [];
  if (info.unlitMaterialsConverted) notes.push(`${info.unlitMaterialsConverted} unlit material(s) made PBR`);
  if (info.doubleSidedMaterials) {
    notes.push(
      `double-sided: ${info.thinMaterials} thin (shadows from both faces), ${info.solidMaterials} solid (back-face shadows)${
        info.clonedMaterials ? `, ${info.clonedMaterials} split` : ''
      }${info.topologyAnalysed ? '' : ' — model too large to analyse, all treated as thin'}`,
    );
  }
  if (info.strippedLights || info.strippedCameras) {
    notes.push(`removed ${info.strippedLights} embedded light(s), ${info.strippedCameras} camera(s)`);
  }
  const compression = info.extensionsUsed.filter((name) => /draco|meshopt/i.test(name));
  if (compression.length) notes.push(`decoded ${compression.join(', ')}`);
  if (info.animationCount) notes.push(`${info.animationCount} animation(s) not played (static pose)`);
  if (info.missingFiles.length) notes.push(`missing: ${info.missingFiles.join(', ')}`);
  if (info.unsupportedExtensions.length) notes.push(`unsupported glTF extensions: ${info.unsupportedExtensions.join(', ')}`);
  if (info.substitutedFiles.length) {
    notes.push(`other extension used: ${info.substitutedFiles.map((item) => `${item.requested} → ${item.used}`).join(', ')}`);
  }
  const unboundNames = new Set(info.unboundImages.map((item) => item.file));
  const unusedOther = info.unusedFiles.filter((name) => !unboundNames.has(name));
  if (unusedOther.length) notes.push(`not referenced by the model: ${unusedOther.join(', ')}`);
  if (info.ambiguousFiles.length) notes.push(`ambiguous names: ${info.ambiguousFiles.join(', ')}`);
  const { colorTextures, alreadySrgb, corrected, conflicts } = info.colorSpaces;

  const items = [
    {
      label: 'File',
      value: `${info.fileName} · ${formatBytes(info.totalBytes)}${
        info.resourceCount ? ` (+${info.resourceCount} file(s))` : ''
      }`,
    },
    {
      label: 'External files mapped',
      value: info.resourceCount
        ? `${info.mappedCount} / ${info.resourceCount} → blob URLs (${info.blobUrlCount} tracked)`
        : `none (self-contained) · ${info.blobUrlCount} blob URL tracked`,
    },
    {
      label: 'Textures in the model',
      value: describeImageSources(info.imageSources),
    },
    ...(info.specGlossMaterials.length
      ? [
          {
            label: 'Material conversion',
            value: `${info.specGlossMaterials.length} spec-gloss material(s) → PBR (KHR_materials_pbrSpecularGlossiness)`,
          },
        ]
      : []),
    ...(info.boundByName.length
      ? [
          {
            label: 'Bound by file name',
            value: info.boundByName.map((item) => `${item.file} → ${item.material} (${item.label})`).join(' · '),
          },
        ]
      : []),
    ...(info.unboundImages.length
      ? [
          {
            label: 'Not applied',
            value: info.unboundImages.map((item) => `${item.file}: ${item.reason}`).join(' · '),
          },
        ]
      : []),
    {
      label: 'Color textures (sRGB)',
      value: colorTextures
        ? `${alreadySrgb + corrected} / ${colorTextures}${corrected ? ` · ${corrected} corrected` : ''}${
            conflicts ? ` · ${conflicts} shared with data maps (left linear)` : ''
          }`
        : 'none',
    },
    { label: 'Original size (model units)', value: formatVector(info.originalSize, 3) },
    { label: 'Auto scale', value: `× ${info.scale.toPrecision(4)} → ${info.fittedSize[1].toFixed(3)} m tall` },
    { label: 'Fitted size W × H × D', value: `${formatVector(info.fittedSize)} m` },
    {
      label: 'Placement check',
      value: `feet y = ${formatSigned(minY)} · center x = ${formatSigned(centerX)}, z = ${formatSigned(centerZ)}`,
    },
    { label: 'Meshes / triangles', value: `${info.meshes} / ${info.triangles.toLocaleString('en-US')}` },
    { label: 'Materials / textures', value: `${info.materials} / ${info.textures}` },
    { label: 'Load time', value: `${Math.round(info.loadMs)} ms` },
  ];
  if (notes.length) items.push({ label: 'Notes', value: notes.join(' · ') });
  return <ReadoutList items={items} />;
}

/**
 * Subject controls (right panel): Default Mannequin or a local glTF/GLB.
 * Files are read in the browser only (URL.createObjectURL), never uploaded.
 * The model readout lives in the info panel (SubjectInfo).
 */
export function SubjectControls() {
  const { subjectType, model } = useSubjectState();
  const inputRef = useRef(null);
  const isCustom = subjectType === SUBJECT_TYPES.CUSTOM;

  const handleFiles = (event) => {
    // Copy before resetting: the FileList is live and empties with the input.
    const files = Array.from(event.target.files ?? []);
    event.target.value = ''; // allow re-selecting the same file
    if (files.length) loadCustomModel(files);
  };

  return (
    <section className="subject-selector" aria-label="Subject">
      <div className="segmented" role="radiogroup" aria-label="Subject type">
        {SUBJECT_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`segmented__option ${subjectType === option.value ? 'segmented__option--active' : ''}`}
          >
            <input
              type="radio"
              name="subject-type"
              value={option.value}
              checked={subjectType === option.value}
              onChange={() => setSubjectType(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
      {isCustom && (
        <button
          type="button"
          className="text-button"
          data-tooltip={`Loaded locally — nothing is uploaded. For a .gltf with separate files, select the .gltf together with its .bin and textures. Auto-fitted to ${SUBJECT_CONFIG.targetHeightM} m.`}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={13} aria-hidden="true" /> {model.object ? 'Replace model (.glb / .gltf)…' : 'Upload model (.glb / .gltf)…'}
        </button>
      )}
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept={MODEL_FILE_ACCEPT}
        multiple
        onChange={handleFiles}
        aria-label="Upload custom 3D model"
        data-testid="custom-model-input"
      />
      {model.loadingFileName && (
        <p className="panel-note" role="status">
          Loading {model.loadingFileName}…
        </p>
      )}
      {model.error && (
        <p className="panel-note panel-note--error" role="alert">
          {model.error}
          {model.object ? ' The previous model is still shown.' : ''}
        </p>
      )}
      {isCustom && !model.object && !model.loadingFileName && !model.error && (
        <p className="panel-note">No model loaded yet — the mannequin is shown meanwhile.</p>
      )}
    </section>
  );
}

/** Subject readout for the info panel. */
export function SubjectInfo() {
  const { subjectType, model } = useSubjectState();
  const releasedNote = describeReleased(model.lastReleased);
  const isCustom = subjectType === SUBJECT_TYPES.CUSTOM && model.object && model.info;
  return (
    <>
      {isCustom ? (
        <ModelReadout info={model.info} />
      ) : (
        <p className="panel-note">Default mannequin · {SUBJECT_CONFIG.mannequinHeightM} m, facing the camera (+Z).</p>
      )}
      {releasedNote && (
        <p className="panel-note" data-testid="subject-released">
          {releasedNote}
        </p>
      )}
    </>
  );
}
