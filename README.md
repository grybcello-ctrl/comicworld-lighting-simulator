# Studio Lighting Simulator

React + Three.js (@react-three/fiber, drei) skeleton for a studio lighting simulator.

```bash
npm install
npm run dev
```

## Structure

```
src/
├─ config/
│  ├─ equipmentConfig.js    # Equipment catalog: STROBES, MODIFIERS, GRIDS, GELS, mounts
│  ├─ equipmentRegistry.js  # Query helpers (lookup, mount compatibility, grouping)
│  ├─ lightingPresets.js    # Preset lighting setups (built from catalog ids)
│  ├─ cameraConfig.js       # Camera mode: GFX bodies, GF lenses, f-stops, DoF, Eye AF
│  ├─ environmentConfig.js  # Cyc, bokeh spheres, grid, angle guide, overview fit, screenshot HUD
│  └─ sceneConfig.js        # Camera, render calibration, slider limits
├─ state/
│  ├─ LightingContext.jsx     # Light instances (useReducer + context)
│  ├─ lightSelectors.js       # Shared derived data (pose, rig, color) for scene + panel
│  ├─ setupSerializer.js      # JSON export / import
│  ├─ subjectStore.js         # Subject type + custom model lifecycle
│  ├─ cameraStore.js          # appMode ('lighting' | 'camera') + photo-camera settings, AF targets
│  ├─ viewStore.js            # Environment toggles, background brightness, bokeh offset
│  ├─ poseStore.js            # Pose Mode: bone list, selection, rest rotations
│  ├─ panelStore.js           # Accordion open states, side panel visibility (UI only)
│  ├─ screenshotService.js    # Canvas capture bridge (button ↔ renderer)
│  └─ cameraSelectors.js      # Derived optics (AoV, DoF, blur) for panel + viewfinder
├─ postprocessing/
│  └─ PhysicalBokehPass.js    # Thin-lens depth of field (CoC from f, N, focus distance)
├─ utils/
│  ├─ cameraOptics.js         # Thin-lens math: FOV fit, focus geometry, CoC, DoF
│  ├─ eyeAutofocus.js         # Eye AF: eye/head bones, bbox heuristic, skin-depth correction
│  ├─ viewFit.js              # Overview framings that fit every fixture
│  ├─ setupHud.js             # Screenshot HUD text
│  ├─ screenshotExport.js     # Off-screen 2D composite + PNG download
│  ├─ toneMappingInverse.js   # Keeps the backdrop color identical in camera mode
│  ├─ lightMath.js            # Placement, Connect-style power scale (f-stop law)
│  ├─ beamModel.js            # Strobe + modifier + grid → three.js light rig
│  ├─ beamProfileTexture.js   # Angular beam profiles as SpotLight maps
│  ├─ spectral.js             # Planck's law, CIE 1931 CMFs, XYZ → linear sRGB
│  ├─ gelFilters.js           # Gel transmission curves T(λ)
│  ├─ colorTemperature.js     # Kelvin × gel → three.js light color
│  ├─ shadowModel.js          # Apparent-size shadows → shadow.radius / map size
│  ├─ beamProfile.js          # Beam profile, flattening, energy (effective solid angle)
│  ├─ parabolicReflector.js   # Focusing-rod head travel, dish irradiance (glow)
│  ├─ modelLoader.js          # Local glTF/GLB loading (Draco, Meshopt)
│  ├─ modelFileSet.js         # Multi-file .gltf/.glb: main file + Blob URL map + URL modifier
│  ├─ externalTextureBinder.js # Binds unreferenced images to materials by file name
│  ├─ gltfSpecGlossPlugin.js  # KHR_materials_pbrSpecularGlossiness → MeshPhysicalMaterial
│  ├─ blobUrlRegistry.js      # Tracks and revokes a model's Blob URLs
│  ├─ textureColorSpace.js    # Ensures color textures are SRGBColorSpace
│  ├─ shadowSides.js          # Double-sided materials, shadow sides, slope bias
│  ├─ meshTopology.js         # Thin sheet vs closed solid (boundary length / √area)
│  ├─ modelPreparation.js     # Shadows, unlit → PBR, Box3 auto-fit
│  ├─ disposeObject3D.js      # Frees geometries, materials, textures, bitmaps
│  ├─ skinTexture.js          # Procedural skin normal + roughness maps
│  └─ skinMaterial.js         # PBR skin materials for the mannequin
└─ components/
   ├─ scene/                  # Canvas, mannequin, StudioLight, fixture renderers
   │  ├─ CameraPostFX.jsx     # Camera mode renderer: photo camera + EffectComposer
   │  ├─ StudioEnvironment.jsx # Cyc, bokeh spheres, floor grid, angle guide
   │  ├─ AutofocusTargets.jsx # AF target measurement + red marker
   │  ├─ ScreenshotBridge.jsx # Capture without helper meshes
   │  ├─ PoseController.jsx   # TransformControls (rotate) on the selected bone
   │  └─ fixtures/index.js    # shape key → 3D renderer registry
   ├─ viewport/               # Viewfinder overlay, Take Screenshot button
   ├─ ui/                     # Accordion, IconSlider + Chip, TooltipLayer
   └─ panel/                  # InfoPanel (left), RightPanel + lighting/LightAccordion (right), ModeTabs
```

## Adding equipment

1. **Using an existing shape:** add an entry to `STROBES` or `MODIFIERS` in
   `equipmentConfig.js`. The UI, compatibility filter and 3D scene pick it up automatically.
2. **Adding a new shape** (e.g. `parabolic`): write a renderer component in
   `components/scene/fixtures/`, then register it in `MODIFIER_RENDERERS`
   (or `STROBE_BODY_RENDERERS`) in `fixtures/index.js`.

Compatibility works through mounts: a modifier fits a strobe if `modifier.mounts` includes `strobe.mount`.
Light instances only store `strobeId` / `modifierId`, and the specs are always resolved from the catalog.

## Light models (Phase 2)

| Model | Used by | three.js mapping |
|---|---|---|
| `spot` | Reflectors, beauty dishes, umbrellas | `SpotLight` + optional beam-profile `map`; grids override the angle |
| `parabolic` | Para 133HR, Parabolix 35D | Focusing rod (0 = spot … 100 = flood) linearly interpolates angle, penumbra, center gain, throw and profile |
| `area` | Softboxes / octas | `RectAreaLight` sized to the diffuser (luminance = I / A) + soft shadow-proxy `SpotLight` |

- **Power:** `outputWs = maxWs × 2^(level − 10)`. The level runs from 1.0 to 10.0 in 0.1 steps, like the Profoto Connect Pro.
- **Distance decay:** a virtual source sits `d0` behind the fixture. `decay = 2d / (d + d0)`, so `d0 = 0` gives exact inverse-square falloff (hard lights).
- **Grids:** the beam angle is forced to the grid rating (10° / 20°), with a penumbra of about 0.03 and a hard edge cut.

## Color (Phase 3)

- **Kelvin → RGB:** the strobe is treated as a black body (Planck's law) and integrated against the CIE 1931 2° color-matching functions, then converted from XYZ to linear sRGB (the working space three.js uses). Luminance is normalized to 1, so changing the color temperature does not change exposure. The white point is D65, so about 6500K looks neutral on screen.
- **Gels:** the black-body spectrum is multiplied by the gel transmission `T(λ)` wavelength by wavelength, before converting to color. The gel's light loss (its photopic transmission) is built into the color's luminance.
  - CTO gels use a mired-shift curve, so 5600K + Full CTO gives about 2960K and 5600K + ½ CTO gives about 3850K.
  - Effect gels use band-pass curves.
- **Fixture toggle:** hides the stand, body and modifier meshes. Lights sit outside the hidden groups, so they keep illuminating the subject.

## Phase 4

- **Color toggles:** "Color temperature" and "Color gel" each have their own checkbox. Turning one off keeps its setting (the Kelvin value or the chosen gel). With both off, the light is exactly `#FFFFFF`. The panel and the 3D scene both read the light color from `state/lightSelectors.js`, so they always match.
- **Placement:**
  - Orbit (azimuth / elevation / distance) moves the light around the subject and re-aims it.
  - Shift X / Y / Z moves the fixture in world space without re-aiming it.
  - Tilt / Pan / Roll rotate the aim away from the subject.
- **Parabolix 35D accessories:**
  - Inner Diffuser: −1 EV, and the effective emitter gets larger, which softens shadows.
  - Grid: limits the beam to 40°, caps the penumbra at 0.35, and cuts the edge so spill falls off fast.
- **Shadows:** the penumbra width is `w = D·s/d`, where D is the effective emitter diameter, s = 10 cm (the gap between an occluder and the surface behind it), and d is the 3D distance. `shadow.radius = w / (2·texel)`, with a constant 4 mm texel.
  - The focusing rod scales D from 11 cm (spot) to 89 cm (flood), so the radius grows as the rod floods and shrinks with distance.
- **Skin:** a procedural 512² tileable height field (Worley furrows and pores plus fBm noise) is turned into normal and roughness maps. These go on a `MeshPhysicalMaterial` with IOR 1.4, tiled at a constant 4 cm in world space.
- **Performance:**
  - `frameloop="demand"`: nothing renders while the scene is idle.
  - Each light's shadow map is re-rendered only when that light's pose, cone or map size changes.
  - Each shadow map is sized to fit its beam's footprint.
- **JSON:** Export / Import saves and restores every light setting. Imported files go through the same validation as lights created in the UI, and any changes are reported in the panel.

## Phase 4.5 — parabolics and light rays

- **Focusing rod:** the rear-firing strobe slides along the dish axis.
  - Rod 0 pushes the head deep inside to the focal point `f = R²/4·depth`.
  - Rod 100 pulls the head out to 90 % of the dish depth.
  - The strobe body rides on the rod; at rod 100 it sticks out of the front of the dish.
- **Beam geometry:** the SpotLight sits at the beam's virtual apex, `a = R / tan α` behind the aperture, with `decay = 2`.
  - This makes the footprint match the real beam (spot: collimated, about as wide as the dish; flood: a widening cone).
  - It also produces the collimated "throw" of a focused parabolic.
- **Energy:** `I = Φ / Ω_eff`, where Φ is fixed by the flash energy and `Ω_eff = 2π∫A·M·sinθ dθ`.
  - In spot, the narrow cone and hot spot give a small Ω_eff, so the center is punchy: about +2.5 EV over flood at 1.4 m for the 35D.
  - In flood, the beam profile cancels the `cos³θ` center peak of a point source (`M ∝ 1/cos³θ`), so the subject plane is lit evenly.
- **Shadows:** the effective emitter size grows with the rod, so `shadow.radius` rises monotonically from spot to flood. The penumbra is computed at the aperture-to-subject distance.
- **Fake GI:** an additive, vertex-colored layer on the dish interior shows the head's irradiance on the dish (inverse square × incidence × emission pattern).
  - Spot: the light pools near the apex (about 2 % of the dish is lit).
  - Flood: the whole interior glows evenly (about 77 %).
  - The layer uses an unlit material, so it adds no light to the scene.
- **Show Light Rays:** draws each light's beam from the modifier exit to the subject: rays, the footprint ring, the full-intensity core ring and the beam axis.
  - It reads the live SpotLight in `useFrame`, so rod, tilt and shift changes show up in the same frame.
  - It is hidden together with the fixtures and never casts shadows or catches clicks.

## Phase 5 — custom model loader

- **Subject selector:** at the top of the panel, choose Default Mannequin (the default) or Custom Model.
  - With Custom Model selected, an upload button accepts `.glb` / `.gltf` files.
  - For a `.gltf` with external `.bin` or texture files, select all of them at once.
  - Until a model finishes loading, the mannequin stays on stage as a placeholder.
- **Local only:** files are read with `URL.createObjectURL()` and parsed by `GLTFLoader`. Nothing is uploaded.
  - `GLTFLoader` is lazy-loaded, so the main bundle does not grow.
  - Draco and Meshopt decoders come bundled with three.js and are served from the same origin.
- **Lighting:** every mesh gets `castShadow` and `receiveShadow`. The model's own PBR materials are kept, so they respond to the strobes, softbox area lights, shadows and gel colors.
  - Unlit materials ignore light, so they are converted to `MeshStandardMaterial` with the same maps.
  - Lights and cameras embedded in the file are removed.
- **Auto-fit:** `Box3.setFromObject(model, true)` measures the model. The scale is `1.725 / height`, and an offset of `(−center.x, −min.y, −center.z)` is applied. Result: feet at y = 0, centered on x = 0 / z = 0, same height as the mannequin.
- **Clean-up:** switching back to the mannequin, or replacing the model, disposes all geometries, materials and textures, and closes decoded ImageBitmaps.
  - A load that is superseded before it finishes is disposed when it arrives.
  - Shadow maps are refreshed whenever the subject changes.

### Multi-file .gltf (external .bin and textures)

- **Select everything at once:** the file input allows multiple files. Pick the `.gltf` together with its `.bin` and texture files (Ctrl/⌘ or Shift + click).
- **Mapping:** exactly one `.gltf` / `.glb` is the main file. Every other file becomes a Blob URL (`URL.createObjectURL`) in a map keyed by file name.
  - A `THREE.LoadingManager` URL modifier redirects each `.bin` or texture request from `GLTFLoader` to the matching Blob URL.
  - Names match case-insensitively, after handling `%20`, subfolders (`textures/…`), `./` and `../`, backslashes, query strings and absolute exporter paths.
  - If several selected files share a name, the relative path decides.
- **Report:** the panel shows how many files were mapped. It also lists referenced files that were not selected (textures load blank, a missing `.bin` is an error) and selected files the model never used.
- **Color space:** after loading, every color texture (`map`, `emissiveMap`, `sheenColorMap`, `specularColorMap`) is checked and set to `THREE.SRGBColorSpace`, so textures don't look washed out.
  - Data maps (normal, roughness, metalness, AO, …) stay linear.
  - PBR parameters and shadow flags are not touched.
- **Blob URL clean-up:** all Blob URLs of a model (main file, `.bin`, textures) are tracked in one registry that the model owns.
  - They are revoked together with `dispose()` when the model is replaced or removed.
  - A failed or cancelled load revokes its URLs immediately and disposes any textures it had already decoded.

### Thin meshes and shadow bias

- **Problem:** three.js puts only the back faces of a single-sided material into the shadow map. A hair card or plane whose front faces the light therefore cast no shadow, so a rim light shone straight through the hair.
- **Materials (custom models):** every material is set to `side = DoubleSide`.
  - Thin sheets (hair cards, planes, single-sheet cloth) get `shadowSide = DoubleSide`, so they block light from both faces.
  - Closed solids (skin, body, props) get `shadowSide = BackSide`. They cast the same shadows but can never shadow themselves.
  - Sheets and solids are told apart by topology: boundary length / √area (`meshTopology.js`). A material shared by both kinds is split into two, and the textures stay shared.
  - `SUBJECT_CONFIG.shadowSideMode = 'double'` forces DoubleSide shadows on everything.
- **Depth bias:** `shadow.bias` is now a world distance (2 mm at the subject) converted to depth units for each light: `−b · near·far / ((far − near)·D²)`.
  - The old constant −0.0002 grew with the square of the distance (≈2.4 cm at 1.4 m, ≈10 cm at 5 m), so thin meshes closer than that to a surface stopped casting shadows.
- **Slope bias:** each subject mesh gets a per-light `glPolygonOffset` in the shadow pass, with factor `1.5 + shadow.radius` (the PCF kernel size). This keeps double-sided sheets and thin solids such as ears from shadowing themselves under soft lights.
- **Normal bias:** `shadow.normalBias` is 0. three.js offsets along the vertex normal, which is not flipped on a double-sided card's back face, so any positive value darkens the lit back side of hair cards.
- **Unchanged:** radius, map size, texel size, penumbra and the parabolic rig are identical to before.

### External textures with a .glb

A model shows up white when `GLTFLoader` never gets a texture for it. There are two different causes:

1. **The model references textures, but the reference can't be resolved.** Examples: a stale `blob:http://other-host/…` URL, an absolute `http://…` or `file:///D:/…` path, or a name in a different letter case or Unicode form (macOS reports Korean names decomposed, NFD).
   - The URL modifier now extracts the pure file name from any request: it strips the query, percent-decodes, converts `\` to `/`, drops the scheme/host/drive, takes the last segment, then applies NFC and lower case.
   - It then looks that name up among the selected files.
   - If the name isn't found, it tries the same name with a different image extension (`skin.tga` → `skin.png`).
2. **The .glb has no texture references at all.** This is common after FBX/OBJ conversion or a "no textures" export. `GLTFLoader` never requests anything, so no redirect can help.
   - Selected images the model never requested are bound by file name (`externalTextureBinder.js`). For example `Body_BaseColor.png` → material "Body" `map`, and `Body_Normal` / `_ORM` / `_Roughness` / `_Metallic` / `_Emissive` go to the matching slots. For a single-material model, the file goes to that one material.
   - Slots the model already fills are never overwritten. Ambiguous names are reported, not guessed.

The panel shows how the model stores its textures (**Textures in the model**), what was bound by file name, and what was not applied and why. The same `LoadingManager` is passed to `GLTFLoader` (buffers and images) and to the binder, so every request goes through the URL modifier.

### Spec-gloss models (e.g. Sketchfab `scene.gltf` downloads)

three.js dropped `KHR_materials_pbrSpecularGlossiness` in r147. Materials that store their textures only inside that extension load white, and `GLTFLoader` never even requests their texture files.

- **Plugin:** a GLTFLoader plugin (`gltfSpecGlossPlugin.js`) registered on the same loader converts these materials to `MeshPhysicalMaterial`:
  - diffuse → `map` (sRGB)
  - specular F0 → `specularColor = F0 / 0.04` and `specularColorMap`
  - glossiness → `roughness = 1 − glossiness`, with a `roughnessMap` derived from the texture's alpha channel
  - `metalness` = 0
- **Loading:** the textures load through the parser, so they go through the same `LoadingManager` and URL modifier as every other file.
- **Name matching:** the name-based binder now matches in three steps. It tries the exact name first (numbers included, so `Body_1` and `Body_2` stay distinct), then tokens with numbers, then tokens without numbers.


## Camera mode

The tabs at the top of the panel switch `appMode` (`state/cameraStore.js`) between **Lighting Mode** (direct render, orbit camera, light rays and selection highlight) and **Camera Mode** (a photo camera with depth of field).

- **Bodies:** FUJIFILM GFX100S and GFX100S II, both with a 43.8 × 32.9 mm sensor.
- **Lenses:** GF55mmF1.7, GF55mm F3.5, GF80mmF1.7 and GF110mmF2.
  - The GF55mm F3.5 is not a Fujifilm catalogue lens. It is modeled as requested; the closest real lens is the GF50mmF3.5 R LM WR, whose 0.35 m close focus is used.
- **Angle of view:** the 4:3 sensor frame is the largest centered rectangle that fits the canvas. `camera.fov` is chosen so that frame spans exactly the lens's angle of view, and `filmGauge` is set so `getFocalLength()` returns the lens focal length.
  - The diagonals come out at 52.9° / 37.8° / 28.0°, matching Fujifilm's specs.
  - The overlay masks everything outside the frame.
- **F-Stop:** the slider runs in 1/3 stops from the lens's maximum aperture to f/16. Changing lens snaps the f-number to the nearest stop that lens offers.
- **Focus Distance:** measured from the focal plane, from the lens's minimum focus distance to 30 m, on a log scale.
  - **AF · Face** (the default) keeps the face in focus while you move the camera. The face surface is found once per subject with a ray from the front.
  - Moving the focus slider switches to MF.
- **Shooting Distance:** sets `camera.position.z`, dollying the camera along z. Camera and aim height sliders tilt the view.
- **Depth of field** (`postprocessing/PhysicalBokehPass.js`): uses the thin-lens circle of confusion `c = f²/(N(u₁ − f)) · (1 − u₁/u₂)`, computed per pixel from the depth buffer of the real render. Blur therefore grows as the f-number drops.
  - A blurred foreground spreads over what lies behind it. A blurred background never spreads over a sharp subject.
  - three's `BokehPass` is not used: its blur is linear in depth, its aperture is not an f-number, and its separate depth pass ignores alpha-cutout hair.
- **Readouts:** DoF near/far limits and hyperfocal distance (circle of confusion 0.038 mm, the 35 mm standard of 0.030 mm scaled to the sensor), 35 mm equivalents, and blur at infinity.
- **Isolation:** mode and camera state live outside the lighting reducer and the subject store, so switching modes never recomputes or resets lights, the loaded model, parabolic calculations or shadow maps.
  - OrbitControls stays mounted but is paused, so the lighting view comes back pixel-identical.
  - Post-processing resources exist only while camera mode is active.
- **Exposure** does not follow the f-number: camera mode keeps the brightness of the lighting setup.


### Eye AF

The focus modes are **AF · Eye** (the default), **AF · Face** and **MF**. Eye AF picks its target once per subject (`utils/eyeAutofocus.js`), then corrects the depth so the target is on the skin rather than inside the head.

1. **Eye bones** (names containing `Eye`, `LeftEye`, `RightEye`; brows, lids, look-at and end bones are skipped). An eye bone sits at the eyeball center, so the target is the first surface in front of it (cornea, or the face shell on models without eyeballs). Of the two eyes, the one nearer the camera is used.
   - The mannequin has two invisible `LeftEye`/`RightEye` anchors, so it goes through the same path.
2. **Head bone.** The head joint sits at the skull base. The eye height is set 36 % of the way from the joint to the head top (`HeadTop_End`, or the crown). The depth is the face surface at that height, found with rays half an interpupillary distance (31.5 mm) left and right of the center line, so they land on an eye and not the nose.
3. **No usable bones: bounding box.** The eye height is 92 % of the model height. The head's center line comes from the frontal cap of the vertices at that height. The depth is the face surface on an eye, as above. If no surface is hit, the target falls back to the front of that height slice.

Measured against the Mixamo X Bot's eye bones, the head-bone and bounding-box targets land within 0.9 mm in depth. On the mannequin, simpler rules miss the ±1.0 cm depth of field of 110 mm f/2 at 1.5 m:

| Rule | Where it lands | Error vs. the eye |
|---|---|---|
| Front face of the whole model's `Box3` | Toes | 10.8 cm in front |
| Front of the slice at 85–90 % height | Chin | 2.0 cm behind, 8 cm low |
| Front-most point at eye height | Nose tip | 3.3 cm in front |

The focus distance runs from `camera.position` along the optical axis, which is the view-space depth the depth-of-field pass reads. A straight-line distance would be 2.6 cm too long at the default framing.

**Show AF target** draws a small red sphere at the focus point: the AF target, or in MF the point on the optical axis at the focus distance.

### Studio environment

The toggles appear in both panels:
- **18% gray cyclorama** (`#767676`, linear 0.184). It receives shadows and casts none.
- **Emissive bokeh spheres.** They light nothing.
- **Floor grid** (0.5 m).
- **Angle guide:** a floor protractor in light-azimuth degrees plus the photo camera's horizontal angle of view.
- **Show AF target.**

None of these cast shadows or emit light. With the background and spheres off, both modes are pixel-identical to the previous release.

### Overview views and screenshots

- **[Top] [Front] [Side] [Quarter]** (lighting panel) move the orbit camera so that every fixture and the subject fit the view (`utils/viewFit.js`).
- **Take Screenshot** (top right of the 3D view) produces a PNG:
  1. It renders one frame without the AF target, angle guide and light rays.
  2. It reads the canvas (`preserveDrawingBuffer: true`) with `toDataURL`.
  3. It restores the helpers and renders again, all in the same task, so the screen never shows the frame without helpers.
  4. An off-screen 2D canvas adds a HUD with the camera, lens, angle of view, aperture, focus, DoF and every light that is on (power, Ws, azimuth/elevation/distance, XYZ, color). The result is downloaded as a PNG.

  In camera mode the image is cropped to the 4:3 sensor frame.


### Environment adjustments

- **Background Brightness** (0.0–3.0, default 1.0) scales the cyc's linear reflectance: `new Color().setHex(0x767676).multiplyScalar(brightness)`. 0 is black (only the 4% dielectric sheen is left), 1 is 18% gray, 2 is +1 EV.
- **Bokeh X / Y / Z** move the group of emissive spheres (one `THREE.Group`), so the highlights can be placed in the frame while looking through the viewfinder. **Reset bokeh position** returns them.

### Pose Mode

**Pose Mode** (lighting panel, under the subject selector) lists every `isBone` object of the loaded model and attaches a `TransformControls` gizmo in `rotate` mode to the selected bone.
- While a ring is dragged, OrbitControls is disabled (`dragging-changed`).
- **Shadows** refresh on every rotation step.
- **Releasing a ring** updates the skinned bounds and re-measures the AF targets, so Eye AF follows a turned head.
- **Turning Pose Mode off** detaches the gizmo. The pose is kept, and **Reset bone** / **Reset pose** restore the rest rotations.
- **Camera mode:** the gizmo only exists in lighting mode, but the pose carries over.
- **Screenshots** never include the gizmo.
- **The mannequin** has no skeleton, so Pose Mode needs a rigged glTF/GLB (e.g. a Mixamo character).

## Layout (Lightroom-style)

A dark, three-column layout under a top bar. The top bar holds the Lighting | Camera module picker and buttons that show or hide the side panels.

| Column | Role |
|---|---|
| **Left · Info** (`panel/InfoPanel.jsx`) | Read-only viewer. Camera settings and optics; every light's equipment, power (level · Ws of max), color (Kelvin, gel swatch), XYZ position, distance, height, azimuth and elevation; beam & shadow parameters of the selected light; subject / model readout. |
| **Center** | The 3D view, viewfinder overlay and Take Screenshot button. |
| **Right · Controls** (`panel/RightPanel.jsx`) | Controls only. Each light is an accordion titled like "Profoto B10X Plus (Key Light)". Inside are icon sliders (power, focusing rod, Kelvin, azimuth, elevation, distance, plus shift & tilt when expanded) and chips (strobe, compatible modifiers, grid / diffuser, Kelvin + gels). Presets, Environment, View, Subject & Pose and Setup file follow as further accordions. Camera mode has Body & Lens, Aperture & Focus, Camera position and Environment. |

- **Sliders and chips** (`ui/IconSlider.jsx`) show an icon instead of a text label; hovering shows the full name. Double-clicking a slider's icon resets it.
- **Accordions** (`ui/Accordion.jsx`) animate their height. A closed body stays mounted but `inert`. Opening a light's accordion selects the light, and selecting a light in the 3D view opens its accordion. Open states live in `state/panelStore.js`, apart from the scene stores.
- **Default scene:** Key Light (Profoto B10X Plus + Parabolix 35D) and Fill Light (Profoto B10 + OCF Softbox 1×4′), preset `key-fill`.
- **Rendering is unchanged:** with the same preset and canvas size the 3D render is pixel-identical to the previous layout.
