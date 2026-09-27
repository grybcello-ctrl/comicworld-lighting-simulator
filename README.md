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
│  └─ sceneConfig.js        # Camera, render calibration, slider limits
├─ state/
│  ├─ LightingContext.jsx     # Light instances (useReducer + context)
│  ├─ lightSelectors.js       # Shared derived data (pose, rig, color) for scene + panel
│  └─ setupSerializer.js      # JSON export / import
├─ utils/
│  ├─ lightMath.js            # Placement, Connect-style power scale (f-stop law)
│  ├─ beamModel.js            # Strobe + modifier + grid → three.js light rig
│  ├─ beamProfileTexture.js   # Angular beam profiles as SpotLight maps
│  ├─ spectral.js             # Planck's law, CIE 1931 CMFs, XYZ → linear sRGB
│  ├─ gelFilters.js           # Gel transmission curves T(λ)
│  ├─ colorTemperature.js     # Kelvin × gel → three.js light color
│  ├─ shadowModel.js          # Apparent-size shadows → shadow.radius / map size
│  ├─ skinTexture.js          # Procedural skin normal + roughness maps
│  └─ skinMaterial.js         # PBR skin materials for the mannequin
└─ components/
   ├─ scene/                  # Canvas, mannequin, StudioLight, fixture renderers
   │  └─ fixtures/index.js    # shape key → 3D renderer registry
   └─ panel/                  # Control panel UI
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
