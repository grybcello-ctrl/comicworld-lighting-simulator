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
├─ utils/                     # Spherical placement, intensity, Kelvin → RGB
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
