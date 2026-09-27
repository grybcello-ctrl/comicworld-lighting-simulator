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
│  ├─ equipmentConfig.js    # Equipment catalog: STROBES, MODIFIERS, mounts, categories
│  ├─ equipmentRegistry.js  # Query helpers (lookup, mount compatibility, grouping)
│  ├─ lightingPresets.js    # Preset lighting setups (built from catalog ids)
│  └─ sceneConfig.js        # Camera, render calibration, slider limits
├─ state/LightingContext.jsx  # Light instances (useReducer + context)
├─ utils/
│  ├─ lightMath.js            # Placement, Connect-style power scale (f-stop law)
│  ├─ beamModel.js            # Strobe + modifier + grid → three.js light rig
│  └─ beamProfileTexture.js   # Angular beam profiles as SpotLight maps
└─ components/
   ├─ scene/                  # Canvas, bust, StudioLight, fixture renderers
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
