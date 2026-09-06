# GENESIS GRAPHICS ENGINE — WORLD BUILDER HANDOFF

Independent rendering-layer contribution, built on branch
`claude/genesis-graphics-engine-v1-wd0r66`. Scope is deliberately narrow:
**materials, lighting roles, shadows, AO, DOF, reflections, cinematic
camera/post-processing, and performance tooling.** It does not build
laboratory geometry, the hero apparatus, scientist hands/PPE, or UI — that's
the World/Looking-Glass layer, and this document is written for that
world-builder to consume this one without re-deriving or duplicating any of
it.

## Where this sits in the Genesis architecture

```
Genesis Scientific Engine        (the brain — computes real state, never rendered directly)
        ↓
ScientificWorldState             (the computed truth: fractions, statuses, events)
        ↓
World / Looking Glass            (the world — lab geometry, hero apparatus, scientist POV, UI)
        ↓
GENESIS GRAPHICS ENGINE          (the eyes — THIS layer: materials/lighting/shadows/AO/DOF/post-fx)
        ↓
WebGL / Three.js
```

The Graphics Engine **renders** the world; it never simulates one. It has no
opinion on what a fraction or a status *means* — see §9 for the one pattern
(`updateVisualState`-shaped) that crosses the boundary from
`ScientificWorldState` into a rendered mutation, always in that direction,
never the reverse.

## 1. What APIs to use

| Concern | Module | Entry points |
|---|---|---|
| Materials | `materials.ts` | `createGenesisMaterialPalette(THREE)`, `createPBRMaterial`, `createScientificGlass`, `createDoubleWalledGlass`, `createEmissiveInstrumentMaterial`, `createScreenMaterial`, plus the procedural texture generators. 13 static categories: interior (`SCIENCE_GLASS`/`BRUSHED_METAL`/`POLISHED_METAL`/`TECH_COMPOSITE`/`RUBBER`/`CERAMIC`/`PAINTED_METAL`/`LAB_FLOOR`/`LAB_WALL`) and exterior/urban (`CONCRETE`/`ASPHALT`/`BRICK`/`GROUND`, generalized out of and now used by the epidemiology city scene) |
| Lighting roles | `lighting.ts` | `createKeyLight` (interior, SpotLight), `createSunLight` (exterior counterpart — shadow-casting DirectionalLight with an orthographic frustum, generalized from the epidemiology city and high-fidelity street slice), `createRimLight`, `createPracticalLight`, `createHeroLight`, `createBackgroundFill`, `applyAmbientIBL`, `captureRoomEnvironment` (real interior reflections — see `RoomEnvironmentProbeOptions`) |
| Shadows | `shadowPolicy.ts` | `applyShadowPolicy(THREE, scene, options?)`, `SHADOW_SIZE_TIERS` |
| Scene composition primitives | `primitives.ts` | `createColumn`, `createPlatform` (box or disc footprint), `createGlassChamber` (the open-ended-cylinder chamber convention), `createPipe` (a conduit/cable run between two arbitrary points — computes length and orientation, doesn't just stretch a fixed cylinder). Geometry-and-placement only, no material opinion — pass any `materials.ts` category. Proven in `examples/heroApparatusExample.ts`, which builds its base/columns/chamber/conduit entirely through these instead of hand-derived `CylinderGeometry`/`BoxGeometry` args. Room/wall/ceiling/corridor/container/road/terrain deliberately NOT built here yet — no low-risk real consumer exists without rewriting an already-shipped scene's hand-tuned geometry (see the module's own doc comment). |
| Instancing | `instancing.ts` | `InstanceBatch` (per-instance transform, plus optional per-instance `color` for many identical parts that each track a different live value — pair with `stateVisualization.ts`), `setInstanceColor`/`setInstanceTransform` (retune one instance's color/transform after `.build()` — both use three.js's partial buffer-upload API so retuning a handful of instances out of a large population costs GPU upload bytes proportional to instances touched, not population size; see their own doc comments) |
| Post-processing (AO/reflections/bloom/DOF/tone-mapping) | `postProcessing.ts` | `setupGraphicsPipeline`, `configureDOF`, `resolveBokehUniforms`, types `GraphicsPipelineOptions`/`DepthOfFieldSettings`/`ScreenSpaceReflectionSettings`/`AmbientOcclusionSettings`/`AmbientEnvironmentSettings`/`GraphicsPipeline`. `GraphicsPipelineOptions.ambient.mode` picks the AMBIENT/IBL source: `'studio+hdri'` (default), `'room-probe'` (an interior scene reflecting itself — pair with `GraphicsPipeline.captureRoomProbe()`, called once after the first full frame), or `'none'` (the caller manages its own environment/background/fog entirely — see the epidemiology city and high-fidelity street slice). `GraphicsPipelineOptions.ambientOcclusion` retunes AO's tier floor/radius/blend per scene instead of the fixed default. `GraphicsPipeline.setDepthOfFieldEnabled(bool)` toggles DOF per shot without rebuilding the composer. |
| Cinematic camera (lens) | `cinematicCamera.ts` | `configureCinematicCamera`, `recommendedDofForProfile`, `FocusPuller` — FOV/near/far/DOF for a named shot. Never decides where the camera sits or what it looks at — see Camera Rig, below. |
| Camera Rig (transform) | `cameraRig.ts` | `resolveCameraFraming(request)` (pure function: intent + target + `targetRadius` → position/lookAt, scale-aware — no hardcoded coordinate tables) and `CameraRig` (stateful: `frame()` eases, `cut()` snaps, `update(dt)` advances — the position/orientation counterpart to `FocusPuller`). `CameraIntent` (`WIDE`/`HUMAN_EYE`/`SCIENTIST_POV`/`MACRO`/`MICRO`/`SCIENTIFIC`/`CINEMATIC`/`DRIVER`/`ORBITAL`) is a superset of `core/world/cameraPolicy.ts`'s `WorldCameraMode`, so a `CameraPolicyDecision.mode` passes straight through with no translation. Each intent also carries a default `CameraMobility` (`STATIC`/`FOLLOW`/`ORBIT`/`FREE`, via `defaultMobilityFor`) — `ORBIT` intents (`MACRO`/`MICRO`/`ORBITAL`) auto-advance azimuth every `update()` (`setOrbitSpeed`), `FOLLOW` intents (`CINEMATIC`/`DRIVER`) ease toward a live-tracked target (`setTarget`), called every frame with the tracked entity's current position. This is what a per-scene hardcoded intent→coordinate preset table (the anti-pattern this replaces) should resolve onto instead. Proven in `examples/heroApparatusExample.ts`'s `cameraRig`/`shootCamera(intent)` handles. |
| Cinematic sequencing | `cameraSequence.ts` | `CameraSequence` — drives a `CameraRig` through an ordered shot list (`{request, holdSeconds?, cut?}[]`): advances once the rig settles (plus an optional hold), or immediately via `skip()`. The reusable SCENE → CAMERA → TRANSITION → NEW SHOT primitive — it never decides which shots belong in the list or why, only executes one it's handed. |
| Quality tiers | `../quality.ts` | `detectRenderTier`, `configureGraphicsQuality`, `tierDpr`, `tierAllowsBloom`, `tierAllowsAO`, `tierAtLeast`, `recommendedShadowMapSize`, `maxShadowCasterBudget` |
| State-driven visualization | `stateVisualization.ts` | `sampleColorScale`, `severityColor`, `SEVERITY_COLOR_SCALE`, `applyValueToEmissive`, `applyFractionToScale`, `AttentionPulse` — turns an already-computed real value into a color/glow/fill-height/event-flash; never computes or interprets the value itself (see its module doc) |
| LOD / culling | `lod.ts` | `FrustumCuller` (per-instance frustum test, reusable/allocation-free — see its module doc for why this exists instead of `InstancedMesh.frustumCulled`), `PopulationLod` (frustum + distance + projected-size LOD in one per-frame pass over a whole population), `projectedScreenSizePx`, `selectLodTier`. Wired into `InstancedHumanoidCrowd.update()`'s optional `cull` argument — see `PERFORMANCE.md`. |
| Diagnostics | `diagnostics.ts` | `readFrameCounters`, `FrameProfiler`, `RollingFrameStats` — exact draw-call/triangle/geometry/texture/program counts from `renderer.info` (valid on any GPU, including software rendering) plus frame-time sampling (explicitly NOT a hardware performance claim — see the module doc). Wired into every pipeline as `GraphicsPipeline.getFrameCounters()`. See `PERFORMANCE.md`'s "Measured, not fabricated" section for real numbers this produced. |
| Picking / interaction (mechanics) | `picking.ts` | `screenToNDC`, `raycastFromScreenPoint`, `findTaggedAncestor`, `ClickDragTracker` — the mechanical half of "what did the user point at" (screen→NDC, click-vs-drag, walking up to a tagged ancestor). Never decides what a pick MEANS — that stays the caller's `selectAgent`/`selectWorld`-shaped logic. Found duplicated byte-for-byte across `epidemicCity3D.ts` and `highFidelitySlice3D.ts`'s own `pointer()` methods before this existed; both now delegate to it. |
| Interaction (WorldFrame-aware) | `interaction.ts` | `InteractionController` — composes `picking.ts` + `WorldFrameRenderer.resolveEntityId` into hover/select state expressed as WorldFrame entity ids, not raw meshes. `pointerDown`/`pointerMove`/`pointerUp`/`clearHover`, `onHoverChange`/`onSelect` callbacks. No business logic — see §21 below. |
| Environment (sky/fog/time-of-day) | `environment.ts` | `computeSunState(THREE, hourOfDay)` (pure, testable — sun direction/color/intensity + matching sky/fog tones), `createSkyDome`, `applyEnvironmentPreset(THREE, scene, {mode, hourOfDay?})` — `'OUTDOOR'` adds a sky dome + fog and hands back `SunState` for a caller's own `createSunLight` call; `'INDOOR'` is a deliberate near-no-op. See §17 below. |
| Water | `water.ts` | `createWaterSurface` (a horizontal plane with real `MeshPhysicalMaterial` transmission + a scrolling ripple normal map reusing `materials.ts`'s `surfaceNormalFactory`), `captureDryLook`/`applyWetLook` (cheaply wets an existing opaque material). See §18 below. |
| Vegetation | `vegetation.ts` | `createTreeField`, `createGroundClutter` — seeded, instanced (2 draw calls / 1 draw call respectively, any count) scattered nature fields with position/rotation/scale variation. See §19 below. |
| Resource lifecycle | `lifecycle.ts` | `disposeSceneResources(root, options?)` — traverses an `Object3D` subtree (typically your whole `Sim3D.scene`) disposing every geometry, material, and each material's own textures in one call. Call it from your `Sim3D.dispose()`, storing `scene` from `init()` first (see `labScene3D.ts`). `options.excludeMaterials`/`excludeTextures` skip anything owned/disposed elsewhere (a shared registry, the pipeline's own environment map). |
| WorldFrame render pathway | `worldFrame.ts` + `worldFrameRenderer.ts` | The first generic WorldFrame → scene graph → rendering pathway — see §13 below for the full contract, boundary, and why it exists. `WorldFrameRenderer.sync(frame)` reconciles a scene to match a frame of generic entities (appear/move/rescale/reparent/disappear/retune-in-place for an unchanged instanced population — see §13's incremental-update update); `.dispose()` tears the whole thing down; `.resolveEntityId(intersection)` maps a raycast hit back to an entity id (feeds `interaction.ts`). `worldFrame.ts`'s types are deliberately isolated and NOT the final C1/C3 contract — see its own doc comment. |
| Integration pattern | `examples/heroApparatusExample.ts` | `buildExampleHeroApparatus` — READ this, don't import it into a real scene |
| Integration pattern | `examples/worldFrameExample.ts` | `buildExampleWorld` — the WorldFrame pathway's own reference pattern: a synthetic world with a scalar-driven hub, an instanced population, and an honest-boundary entity, plus the SAME `CameraRig` framing a shot on it. READ this, don't import it. |
| Integration pattern | `examples/worldEnvironmentExample.ts` | `buildExampleEnvironmentWorld` — proves `environment.ts`/`water.ts`/`vegetation.ts`/`interaction.ts` compose with the WorldFrame pathway AND with each other in one scene (the sun light it places comes from the SAME `SunState` the sky/fog were built from). READ this, don't import it. |

## 2. What NOT to duplicate

- **Don't write a second tone-mapping/color-space/shadow-map renderer
  setup.** `setupGraphicsPipeline` already configures `renderer.shadowMap`,
  `renderer.toneMapping`, `renderer.toneMappingExposure`, and
  `renderer.outputColorSpace` — call it once from your `Sim3D.setupPostProcessing`
  and you're done. See §3 for the exact contract.
- **Don't write a second AO/reflections/bloom/DOF composer chain.** Extend
  `GraphicsPipelineOptions` if you need a new pass, don't build a parallel
  `EffectComposer`.
- **Don't hand-roll a PBR material for something that fits one of the 10
  canonical categories.** `createGenesisMaterialPalette`/`createPBRMaterial`
  exist so "brushed metal" means the same roughness/metalness everywhere in
  the world.
- **Don't hand-place a SpotLight+PointLight pair and re-tune the angle for
  every new hero object.** Call `createHeroLight` once instead.
- **Don't re-derive the shadow size heuristic.** Call `applyShadowPolicy`
  once, after your scene is fully built.
- **Don't hand-roll a camera FOV/near/far per shot.** Call
  `configureCinematicCamera` with a named profile.
- **Don't hand-roll WHERE the camera sits/looks per world (a `labPresetFor`,
  a `cityPresetFor`, a per-scene orbit-math copy).** Build a `CameraRig`
  once per scene and drive it with `frame`/`cut`/`setTarget`/`setOrbitSpeed`
  — see `cameraRig.ts`. It has no opinion on labs/cities/molecules; it only
  resolves intent + target + scale into a transform.
- **Don't import `examples/heroApparatusExample.ts` into a real scene.** It
  is a reference pattern, not reusable geometry — its chamber/frame/bolts
  are generic filler, not the flagship apparatus.
- **Don't build a second scientific simulation inside this layer.** If a
  rendering decision needs to know WHY a value changed (not just what it
  is), that reasoning belongs upstream in `ScientificWorldState` — this
  layer only ever reads a value it's handed.
- **Don't hand-roll screen→NDC conversion, click-vs-drag detection, or a
  "walk up to the tagged ancestor" raycast-hit loop in your `Sim3D.pointer()`.**
  `picking.ts`'s `raycastFromScreenPoint`/`findTaggedAncestor`/
  `ClickDragTracker` already do — `epidemicCity3D.ts` and
  `highFidelitySlice3D.ts` had independently duplicated all three before
  this existed.
- **Don't hand-roll entity appear/move/disappear reconciliation for a generic
  frame of world entities.** `worldFrameRenderer.ts`'s `WorldFrameRenderer`
  already diffs frames, manages lifecycle, and disposes removed entities —
  see §13. A scene with its OWN bespoke, hand-authored geometry (the three
  shipped scenes) still owns its own `syncScene()`; this is for the
  different case of rendering entities the engine never hand-authored.
- **Don't hand-roll a per-scene camera intent→coordinate preset table** (the
  exact anti-pattern that motivated `cameraRig.ts`). Resolve a
  `CameraFrameRequest` (`intent` + `target` + `targetRadius`) through
  `resolveCameraFraming`/`CameraRig` instead — it's scale-aware by
  construction, so the same intent works whether the target is a
  benchtop instrument or a city district.
- **Don't hand-derive a column/platform/glass-chamber/pipe's `CylinderGeometry`/
  `BoxGeometry` args, or the orientation quaternion for a pipe between two
  points.** `primitives.ts`'s `createColumn`/`createPlatform`/
  `createGlassChamber`/`createPipe` already do, and `createPipe`'s
  from/to→length/orientation math is easy to get subtly wrong by hand.
- **Don't hand-roll a traverse-and-dispose loop in your `Sim3D.dispose()`.**
  `epidemicCity3D.ts` and `highFidelitySlice3D.ts` each independently wrote
  one before `lifecycle.ts` existed; `labScene3D.ts` had none at all and
  relied on GC alone (a real resource leak — see `lifecycle.ts`'s module
  doc). Call `disposeSceneResources(this.scene)` instead.

## 3. The rendering pipeline contract

### Canonical call order

```
SCENE / MATERIALS  →  LIGHTING  →  (build finishes)  →  SHADOW POLICY  →  AO  →  REFLECTIONS  →  BLOOM  →  DOF  →  TONE MAPPING  →  COLOR SPACE OUTPUT
```

Concretely, across two phases:

**Phase 1 — scene construction (`Sim3D.init`)**, entirely yours to order as
you like, except shadow policy must run last:
1. Build geometry, assign `createGenesisMaterialPalette`/`createPBRMaterial`/`createScientificGlass`/etc. materials.
2. Add lighting roles (`createKeyLight`/`createHeroLight`/`createBackgroundFill`/...).
3. Call `applyShadowPolicy(THREE, scene, options)` **once, after every
   builder has added everything to `scene`** — running it earlier misses
   meshes added afterward; running it per-builder just means the last
   builder's call re-does everyone else's work for free (harmless, but
   pointless — call it once).

**Phase 2 — the post-processing chain (`Sim3D.setupPostProcessing`)**, which
you get for free by delegating to `setupGraphicsPipeline`:

```ts
setupPostProcessing(modules, renderer, scene, camera, w, h) {
  return setupGraphicsPipeline(THREE, modules, renderer, {
    scene, camera, width: w, height: h,
    // optional:
    toneMappingExposure: 1.05,
    bloom: { strength: 0.34, radius: 0.5, threshold: 0.92 },
    depthOfField: configureDOF({ focusDistance: 3.2 }), // see §5
    // reflections: { enabled: true },                  // see §11 — off by default, unverified on real hardware
    // qualityTier: 'cinematic',                        // see §11 — forces capture-quality regardless of device
  });
}
```

Internally this builds: `RenderPass → GTAOPass (tier-gated) → SSRPass
(opt-in, cinematic-tier-gated) → UnrealBloomPass (tier-gated) → BokehPass
(opt-in, tier-gated) → OutputPass`, plus `renderer.shadowMap`/
`toneMapping`/`outputColorSpace` and the AMBIENT/IBL role
(`applyAmbientIBL`). **You should not need to touch any of this** — it's
exposed as one function precisely so you don't have to reassemble it.

### Why this order, specifically (verified, not assumed)

three.js's `WebGLRenderer` only applies `toneMapping` and `outputColorSpace`
conversion when the **current render target is `null`** (i.e. rendering
directly to the screen) — confirmed in `WebGLRenderer.js`'s `setProgram()`:

```js
const colorSpace = (_currentRenderTarget === null) ? _this.outputColorSpace : LinearSRGBColorSpace;
let toneMapping = NoToneMapping;
if (material.toneMapped) {
  if (_currentRenderTarget === null || _currentRenderTarget.isXRRenderTarget === true) {
    toneMapping = _this.toneMapping;
  }
}
```

`RenderPass` renders into the composer's **offscreen** intermediate buffer
(`_currentRenderTarget !== null`), so the scene renders there in **raw
linear HDR** — no tone mapping, no sRGB encoding yet, regardless of
`renderer.toneMapping`'s value. `GTAOPass`, `SSRPass` and `UnrealBloomPass`
then operate correctly on that linear HDR data (AO darkens actual scene
radiance, reflections/bloom read/bloom actual scene brightness — not an
already-compressed, already-gamma-encoded image). Only `OutputPass`, which
sets the render target to `null` for the final blit, applies tone mapping
**and** color-space conversion — **exactly once, at the very end.** There is
no double tone-mapping, no double encoding, and no ordering ambiguity: this
is the same reasoning behind three.js's own recommended
`RenderPass → effects → OutputPass` pattern, verified here against this
project's actual pipeline rather than assumed. See
`graphics/postProcessing.ts`'s test file
(`src/__tests__/graphicsPostProcessing.test.ts`) for the automated pass-order
assertions.

`GTAOPass` composes correctly into this chain specifically because it
blends its AO term with `CustomBlending` **inside** the same linear-HDR
buffer, before `OutputPass` runs — this is the fix for the pipeline's
previous "SSAO skipped, blows out to white" state (SSAO used to fight the
tone-mapper because of a different, incorrect pass placement). Reflections
are placed right after AO (so they show the AO-darkened scene, not bypass
it) and before bloom (so a bright reflected practical can still bloom).

## 4. How to enable AO

You don't — it's already on, gated to the `'high'` render tier
(`tierAllowsAO`) via `setupGraphicsPipeline`. Nothing to configure for the
common case. If you need to change the AO tuning (radius/thickness/scale),
edit the `gtao.updateGtaoMaterial({...})` call inside `setupGraphicsPipeline`
— don't build a second GTAOPass elsewhere.

## 5. How to configure DOF

DOF is **opt-in and off by default** — omitting `depthOfField` (or passing
`{ enabled: false }`) is a strict no-op, so enabling it never affects a
scene that hasn't asked for it. Build the settings with `configureDOF` (the
named API) rather than a raw object literal:

```ts
const depthOfField = configureDOF({
  focusDistance: 3.2,       // meters from the camera — YOU must know this; the pipeline won't guess.
  blurStrength: 0.4,        // optional, 0..1 friendly knob (default 0.4). 0 = imperceptible, 1 = strong "macro" look.
  // aperture / maxBlur     // optional advanced overrides of the blurStrength mapping — see resolveBokehUniforms.
  // minTier: 'medium',     // optional — loosens the default 'high'-tier gate. Only after profiling your scene.
});
```

`configureDOF` throws on a non-positive `focusDistance` rather than silently
producing a broken/inverted blur — an easy mistake if the caller passes a
squared distance or forgets to compute it at all.

**Camera profiles have a DOF opinion, use it instead of guessing a
`blurStrength` by hand:**

```ts
import { recommendedDofForProfile } from './cinematicCamera';
const depthOfField = recommendedDofForProfile('HERO_CLOSE_UP', focusDistanceToApparatus);
// WIDE_ESTABLISHING / SCIENTIST_POV return { enabled: false, ... } — safe to pass straight through.
```

Retune focus at runtime (e.g. a cinematic camera cuts to a new shot, or a
`FocusPuller` is racking focus) via the pipeline's own handle, without
rebuilding the composer:

```ts
const pipeline = setupGraphicsPipeline(...); // your Sim3D.setupPostProcessing already returns this
pipeline.setFocusDistance(newDistance); // no-op if DOF was never enabled
```

DOF renders its own full-scene depth pre-pass — see
[`PERFORMANCE.md`](./PERFORMANCE.md) before enabling it below the `'high'`
tier or alongside AO/reflections on mid-range hardware.

## 6. How to configure the cinematic camera

`cinematicCamera.ts` answers "what lens does shot X use" — FOV, near/far,
and whether the shot wants DOF. It never decides WHERE the camera sits or
WHEN a cut happens (that's the World/Looking-Glass layer's camera-phase
state machine, e.g. `labScene3D.ts`'s `FREE`/`FLIGHT`/`FIXED` phases):

```ts
import { configureCinematicCamera, recommendedDofForProfile, FocusPuller } from './cinematicCamera';

configureCinematicCamera(camera, 'HERO_CLOSE_UP'); // sets fov/near/far, calls updateProjectionMatrix()
const depthOfField = recommendedDofForProfile('HERO_CLOSE_UP', focusDistance);
```

Five named profiles: `WIDE_ESTABLISHING` (facility establishing shot, sharp
everywhere), `HERO_CLOSE_UP` (tight lens, moderate DOF falloff),
`SCIENTIST_POV` (first-person, sharp everywhere — DOF here would fight the
sense of physically occupying the space), `MACRO_DETAIL` (very tight, strong
DOF, for a sensor/sample close-up), `INSTRUMENT_INSERT` (a tighter insert on
a control panel/readout).

For a smooth focus transition ("rack focus") instead of a hard cut:

```ts
const puller = new FocusPuller(currentFocusDistance);
// in your render loop:
puller.pullTo(newTargetDistance);
pipeline.setFocusDistance(puller.update(dt));
```

`FocusPuller` is generic and stateful — it has no idea what's in the scene
or why the focus is changing; that's the caller's business.

## 7. How to assign materials

```ts
const materials = createGenesisMaterialPalette(THREE); // once per scene
mesh.material = materials.BRUSHED_METAL; // share the SAME instance across every brushed-metal part
```

Or build exactly one category (the requested `createPBRMaterial` API),
optionally with a color override:

```ts
const painted = createPBRMaterial(THREE, 'PAINTED_METAL', { color: 0x2f5a8f });
```

The 15 canonical categories — interior: `SCIENCE_GLASS`, `BRUSHED_METAL`,
`POLISHED_METAL`, `TECH_COMPOSITE`, `RUBBER`, `CERAMIC`, `PAINTED_METAL`,
`EMISSIVE_INSTRUMENT`, `LAB_FLOOR`, `LAB_WALL`; exterior/urban:
`CONCRETE`, `ASPHALT`, `BRICK`, `GROUND`; plus `SCREEN`. Both bulk
(`createGenesisMaterialPalette`) and single (`createPBRMaterial`) factories
read their tuning from the same internal table, so they can never quietly
drift apart. Thirteen of the fifteen (everything except `EMISSIVE_INSTRUMENT`
and `SCREEN`) are shareable — assign the same instance to every mesh of that
category. The other two are **factories**, because their content is
inherently per-instance:

Every ground/wall category (`CONCRETE`, `ASPHALT`, `BRICK`, `GROUND`,
`LAB_FLOOR`, `LAB_WALL`) and every small-parts category except the glass/
emissive/screen ones carries real procedural surface detail — a correlated
albedo+roughness "worn surface" (`makeWornSurface`) and/or a micro-bump
normal map (`makeSurfaceNormalTexture`/`surfaceNormalFactory`) — generalized
out of the flagship lab scene's own private generators, not hand-rolled per
category. This is the reason none of these categories reads as a flat,
uniformly-lit primitive even before a scene loads its own real photographic
PBR set on top (as the city/HF street scenes already do).

```ts
const led = createEmissiveInstrumentMaterial(THREE, { color: 0xffb545, intensity: 0.9 }); // one per distinct indicator color
const screen = createScreenMaterial(THREE, myCanvasTexture); // one per screen — each shows different content
```

### Scientific glass

Need a true see-through pane instead of `SCIENCE_GLASS`'s reflective hero
look (a partition, an observation window)?

```ts
const windowGlass = createScientificGlass(THREE, { transmissive: true });
```

Full control over wall thickness/roughness/IOR for either variant:

```ts
const thickWalledVessel = createScientificGlass(THREE, { thicknessMeters: 0.03, roughness: 0.02, ior: 1.52 });
```

A vacuum-jacketed vessel (a Dewar flask, a cryostat) — build two concentric
shells yourself (two cylinders/spheres at slightly different radii) and
material them with a matched-but-distinct pair:

```ts
const { outer, inner } = createDoubleWalledGlass(THREE, { jacketContrast: 0.5 });
outerShellMesh.material = outer;
innerShellMesh.material = inner;
```

Need a variant of a shared category (different color, a normal map once you
have an approved asset)? Treat the result like any three.js material —
`palette.BRUSHED_METAL.clone()` then set `.normalMap`/`.roughnessMap`
directly. There is no bespoke options API for that; that's intentional (see
`materials.ts`'s doc comment on `createGenesisMaterialPalette`).

## 8. How to assign shadows

```ts
applyShadowPolicy(THREE, scene, {
  forceCast: [importantSensorHead, valveWheel], // small but significant parts, named explicitly
  // exclude: [somethingWithBespokeShadowNeeds],
});
```

Call this **once**, after every builder has finished adding to `scene` — not
per-builder, and not before the scene is complete. Default behavior: meshes
larger than `SHADOW_SIZE_TIERS.DETAIL_MAX_EXTENT` (0.18m on any axis) cast
shadows; meshes larger than `SHADOW_SIZE_TIERS.RECEIVE_MIN_EXTENT` (0.3m)
receive them; transparent materials never cast (they'd cast an ugly black
blob instead of the refraction/reflection they should show); a small but
functionally important part can be forced to cast via `forceCast` without
lowering the global threshold for everything else.

## 9. How to register hero objects

"Hero object" isn't a registry — it's a lighting + (optionally) DOF/cinematic
treatment you apply once, generalized from the proven flagship apparatus
tuning:

```ts
createHeroLight(THREE, scene, {
  target: apparatusPosition,     // world point the object sits at
  keyDistance: 4.2,              // scale up for a larger object
  rimDistance: 1.8,
});
configureCinematicCamera(camera, 'HERO_CLOSE_UP');
```

See `examples/heroApparatusExample.ts` for the full pattern (materials +
instancing + hero lighting + shadow policy + a DOF hint + the visual-state
hook, all in one place) — read it, don't import it.

## 10. How to register scientific visual state

There's no registry here either — the pattern (proven in `labScene3D.ts`'s
`syncScene`, and mirrored generically in
`examples/heroApparatusExample.ts`'s `updateVisualState`) is: your Sim3D's
`syncScene`/`update` reads the ALREADY-COMPUTED `ScientificWorldState` (a
fraction, a status enum) and pushes it into scene mutations directly —
material colors, mesh scale, light intensity. This rendering layer never
computes or fabricates a scientific value; it only ever renders one it's
handed:

```ts
function updateVisualState(fraction: number, status: MyStatusEnum) {
  const clamped = Math.max(0, Math.min(1, fraction));  // clamp, never trust the caller's range
  fillMesh.scale.y = Math.max(0.001, clamped);           // never exactly 0 — a collapsed mesh reads as "broken", not "empty"
  const color = STATUS_COLOR[status];
  fillMaterial.color.setHex(color);
  fillMaterial.emissive.setHex(color);
}
```

## 11. Reflections — investigation + how to use them

Glass and metal reflections are already handled by two proven, cheap,
real-time techniques with **no configuration needed**: `SCIENCE_GLASS`'s own
transmission/clearcoat model, and the AMBIENT/IBL role's PMREM environment
map (`applyAmbientIBL`, already wired into `setupGraphicsPipeline`). Both
stay correct on curved surfaces (a cylinder vessel, a domed cap), which is
exactly where screen-space reflections historically struggle.

What SSR (`SSRPass`) adds ON TOP of that: reflections of *other scene
objects* on flat-ish opaque surfaces — a polished floor showing the reactor's
silhouette, a metal panel catching a neighboring light. Real value for "deep
laboratory environments," but it renders its own normal+depth+metalness
pre-passes — a similar cost order to AO, stacked on top of AO. **No real GPU
is available in this sandbox to verify SSR's actual visual quality/artifact
behavior** (known to show noise/streaking on some hardware/angles), so it is
wired as **opt-in, off by default, gated to the `'cinematic'` tier**:

```ts
setupGraphicsPipeline(THREE, modules, renderer, {
  scene, camera, width, height,
  qualityTier: 'cinematic',                 // see below — forces capture quality regardless of device
  reflections: { enabled: true, strength: 0.6, maxDistance: 6 },
});
```

**Test on real hardware before shipping this enabled anywhere.** Until then,
treat it as an available capability, not a verified one.

### Forcing capture quality (`qualityTier`)

A screenshot/video capture pathway wants AO/reflections/DOF/bigger shadow
maps regardless of what the interactive device heuristic
(`detectRenderTier()`) would pick — that's what the new `'cinematic'` tier
and `GraphicsPipelineOptions.qualityTier` override are for:

```ts
setupGraphicsPipeline(THREE, modules, renderer, { scene, camera, width, height, qualityTier: 'cinematic' });
```

`detectRenderTier()` **never** returns `'cinematic'` on its own — there is no
device signal that means "the user wants a cinematic capture right now."
That's always this explicit override. `configureGraphicsQuality('cinematic')`
gives you the full resolved bundle (DPR cap, shadow map size, shadow-caster
budget, bloom/AO/DOF allowances) if you need it outside the pipeline too.

## 12. Performance rules

Full detail (cost drivers, checklist) in [`PERFORMANCE.md`](./PERFORMANCE.md).
The six that matter most:

1. DPR is capped via `quality.tierDpr(tier)` — the single highest-leverage lever (cost ~O(dpr²)).
2. A shadow-casting `PointLight` costs ~6x a Spot/DirectionalLight (cube shadow map, 6 faces) — budget with `maxShadowCasterBudget(tier)`, not a raw light count.
3. AO, reflections, and DOF each render their own extra full-scene pre-pass — all gated to `'high'`/`'cinematic'` tier by default; loosen only after profiling.
4. Repeated small parts (bolts, LEDs, knobs) go through `InstanceBatch` once the count exceeds ~15-20 — one draw call regardless of instance count.
5. `applyShadowPolicy` runs exactly once, after the scene is fully built.
6. `'cinematic'` tier is for a captured frame/short clip, not sustained interactive frame rate — never auto-selected, always an explicit `qualityTier` override.

## 13. WorldFrame → Scene: the generic render pathway

Every scene documented above (lab/city/street) hand-writes its own `syncScene()` mapping simulation
state directly onto specific meshes it built itself. That's correct for those three — they're each
one bespoke world with one bespoke renderer. `worldFrame.ts` + `worldFrameRenderer.ts` exist for the
different, newer case: rendering a world whose entities the ENGINE never hand-authored, supplied
instead as a generic frame of transforms/hierarchy/scalars — the shape a future C1/C3 "show me an
evolving scientific world" pipeline needs, once that contract exists.

**Neither C1 nor C3 has published a real `WorldFrame` contract as of this writing** — checked their
current branch before writing either file. `worldFrame.ts`'s types are this engine's own MINIMAL,
ISOLATED stand-in, kept in one small file specifically so they're cheap to replace (delete it and
re-point the renderer at the real contract, or — more likely — write a thin adapter from the real
shape onto this one, since this shape only asks for what any reasonable contract already has: a
transform, a hierarchy, generic scalar/status channels, and an honesty flag).

**The one rule this whole pathway exists to enforce**: `worldFrameRenderer.ts` never branches on
what an entity IS. Grep it — there is no `if (entity.visualHint === 'hospital')` and there must
never be one added. Domain knowledge enters at exactly one point, a caller-supplied
`resolveVisual(entity)` function, and nowhere else.

```ts
import { WorldFrameRenderer } from './worldFrameRenderer';

const renderer = new WorldFrameRenderer(THREE, scene, {
  resolveVisual: (entity) => {
    if (entity.visualHint === 'instanced:tree') {
      return { kind: 'instanced', batchKey: 'trees', geometry: treeGeo, material: treeMat };
    }
    return { kind: 'object', object: buildWhateverThisEntityLooksLike(entity) };
  },
  updateVisual: (entity, object) => {
    const risk = entity.scalars?.risk;
    if (risk !== undefined) applyValueToEmissive(object.material, THREE, risk); // stateVisualization.ts, unchanged
  },
});

// Every time a new frame is available:
renderer.sync({ time, entities });
// On scene teardown:
renderer.dispose();
```

Two entity lifecycles, both generic:
- **`'object'`** — one `Object3D` per entity: created once, transformed every `sync()`, disposed on
  disappearance. Individual identity, individual pick/inspect.
- **`'instanced'`** — every entity sharing a `batchKey` becomes ONE `InstancedMesh` via
  `instancing.ts`'s `InstanceBatch`. When the batch's membership is UNCHANGED from the previous
  `sync()` (same entity ids, same order, same geometry/material identity) — the common steady-state
  case for a population that stays the same size frame to frame — every instance's transform/color
  is retuned IN PLACE via `setInstanceColor`/`setInstanceTransform`'s partial-buffer-upload
  technique, with zero new GPU allocation. Only a genuine STRUCTURAL change (population count/order/
  geometry/material) triggers the full rebuild (old batch disposed, fresh one built). See
  `graphicsWorldFrameBenchmark.test.ts` for real (Node CPU-side) timing numbers at 1k/5k/10k
  synthetic entities, both paths.

**Honest boundaries, not fabricated detail**: an entity with `grounding: 'NOT_MODELED'` never
reaches your `resolveVisual` at all — it always renders as a generic, domain-blind placeholder (a
translucent wireframe sphere by default, overridable via `resolveBoundaryPlaceholder`), so a viewer
sees that something exists conceptually without this engine inventing what it looks like.

**Multi-scale, without new engine code**: `WorldFrameEntity.scale` is exactly `CameraRig`'s
`targetRadius` — frame a shot on any entity with `resolveCameraFraming({ intent, target: entity.
position, targetRadius: entity.scale })` and the SAME camera system already covers city-scale wide
shots and molecule-scale macro shots, by composition of two already-shipped pieces, not a third new
"scale tier" concept. See `examples/worldFrameExample.ts`'s `cameraRig`/`shootCameraAtHub` for this
composition proven end to end (a WIDE shot and a MICRO shot on the literal same entity, same code
path, different intent).

## 14. Atmosphere — dust motes and light shafts

`atmosphere.ts` adds two generic, real-time-safe depth cues, built for the "visual quality" pass
across the lab/city/street-slice benchmarks:

- **`createDustMotes(THREE, options)`** — a bounded, drifting particulate volume (one
  `THREE.Points` draw call). Returns a handle with `update(dt)` (drifts and wraps every mote back
  inside `bounds`, so the volume reads as a continuously-inhabited pocket of air) and `dispose()`.
- **`createLightShaft(THREE, options)`** — a fake volumetric beam via two crossed, additively-
  blended gradient planes (the standard cheap real-time god-ray technique). Returns a plain
  `THREE.Group`; no per-frame update needed.

Both are pure primitives exactly like §7/§9's factories: no scene, no domain knowledge, the caller
positions/adds/animates. Disposal is covered by `disposeSceneResources(scene)` (§ above) as long as
the object was added to the traversed scene graph — `DustMotesHandle.dispose()` is only for removing
the effect independently of a full scene teardown. See `labScene3D.ts`'s window-lit dust + light
shaft, and `epidemicCity3D.ts`/`highFidelitySlice3D.ts`'s low ground haze, for proven usage.

## 15. Quality presets for a settings menu — `QualityLevel`

`quality.ts`'s `RenderTier` (`'low' | 'medium' | 'high' | 'cinematic'`) is this engine's own internal
vocabulary — `'cinematic'` in particular is explicitly NOT something a user picks (it's the
offline-capture tier; see that file's own doc). `QualityLevel` (`'PERFORMANCE' | 'BALANCED' |
'CINEMATIC'`) is the three-choice, real-time-safe preset a settings UI should actually expose;
`resolveQualityLevel`/`configureGraphicsQualityForLevel` map it onto the existing tier system (`
PERFORMANCE→low, BALANCED→medium, CINEMATIC→high`) rather than adding a second, parallel
configuration path. Note the naming collision is deliberate and documented: `QualityLevel`'s
`'CINEMATIC'` is real-time (`high` tier), NOT `RenderTier`'s own `'cinematic'` capture-only tier.

## 16. Interaction — mapping a click/hover back to a WorldFrame entity id

`interaction.ts`'s `InteractionController` is the mechanical pipeline for "what did the user just
point at," expressed as a WorldFrame entity id:

```ts
import { InteractionController } from './graphics/interaction';

const interaction = new InteractionController(THREE, {
  camera,
  resolver: worldFrameRenderer, // satisfies EntityResolver via its own .resolveEntityId(intersection)
  getTargets: () => [scene],
  onHoverChange: (id) => { /* your own hover-highlight logic */ },
  onSelect: (id) => { /* your own selection/inspector logic */ },
});

// Wire into your Sim3D.pointer(...):
interaction.pointerDown(x, y);
interaction.pointerMove(x, y, viewportWidth, viewportHeight);
interaction.pointerUp(x, y, viewportWidth, viewportHeight);
```

`WorldFrameRenderer.resolveEntityId(intersection)` is what makes this work for BOTH entity
lifecycles: an object-kind hit walks up the intersected mesh's ancestor chain (via `picking.ts`'s
`findTaggedAncestor`) to the tagged root `resolveVisual` returned; an instanced hit resolves via
`intersection.instanceId` against the batch's recorded entity order — correct even after an
incremental (non-rebuilt) update, since that path never disturbs index-to-entity correspondence.

**Caveat** (inherent to any `THREE.Raycaster` use, not specific to this module): raycasting reads
`matrixWorld`, which only `WebGLRenderer.render()` keeps current automatically. A normal `Sim3D`
scene is fine (a pointer event always lands after a real frame rendered); a caller driving this
OUTSIDE a render loop (a test, a pointer handler that can fire before the first frame) must call
`scene.updateMatrixWorld(true)` itself first.

## 17. Environment — sky, fog, time-of-day

`environment.ts`'s `applyEnvironmentPreset` is the one call for "what should the sky/fog/sun look
like right now":

```ts
import { applyEnvironmentPreset } from './graphics/environment';
import { createSunLight } from './graphics/lighting';

const env = applyEnvironmentPreset(THREE, scene, { mode: 'OUTDOOR', hourOfDay: 8 });
// env.sunState: { direction, altitude01, color, intensity, skyZenithColor, skyHorizonColor, fogColor, timeOfDay }
createSunLight(THREE, scene, {
  position: env.sunState!.direction.map((v) => v * 40) as THREE.Vector3Tuple,
  color: env.sunState!.color,
  intensity: env.sunState!.intensity,
});
```

This module NEVER creates or retunes a light itself — it only computes what a matching sun/sky/fog
setup should look like and hands back the numbers, so `lighting.ts` stays the one place an actual
light gets created. `'INDOOR'` mode is a deliberate near-no-op (no sky dome, no fog) — an interior
scene's atmosphere is `atmosphere.ts`'s job. `computeSunState` is a pure function (no THREE
dependency beyond color math), fully unit-testable without a renderer — see `graphicsEnvironment.
test.ts`.

Deliberately NOT a physically-based sky (no Rayleigh/Mie scattering simulation) — a plausible,
cheap, artist-tunable day/night curve, not a claim of physical accuracy.

## 18. Water

`water.ts`'s `createWaterSurface` builds a horizontal water plane — a river, lake, reservoir, pool,
or lab container's fill surface — with real `MeshPhysicalMaterial` transmission (the same three.js
feature `createScientificGlass` already uses) and a scrolling ripple normal map (reusing
`materials.ts`'s `surfaceNormalFactory` — composition, not a second bump-map generator):

```ts
import { createWaterSurface } from './graphics/water';

const water = createWaterSurface(THREE, { width: 12, depth: 8, color: 0x1c4f63 });
water.mesh.position.set(x, waterLevelY, z); // caller positions it — this module owns no container
scene.add(water.mesh);
// every frame:
water.update(dt); // scrolls the ripple; a no-op for still water (flowSpeed [0,0])
```

`thicknessMeters` is the one "depth coloration" knob — a thicker body of water tints its transmitted
light more strongly (the real optical effect behind a pool's deep end reading bluer), without
simulating an actual depth field. This module has NO model of real water state (level, flow,
temperature) — C3 remains authoritative; a caller with a real fill fraction sets `mesh.position.y`
itself from its own known container bounds. `captureDryLook`/`applyWetLook` separately handle a
"wet surface" look for existing opaque materials (ground, roads, facades) reacting to a weather
state, without swapping materials.

## 19. Vegetation

`vegetation.ts` adds seeded, instanced nature fields — generalized out of the high-fidelity street
slice's own hand-placed, non-reusable tree code:

```ts
import { createTreeField, createGroundClutter } from './graphics/vegetation';

const trees = createTreeField(THREE, {
  count: 60, width: 40, depth: 40, center: [0, 0],
  trunkMaterial: palette.PAINTED_METAL, canopyMaterial: myLeafMaterial,
});
scene.add(trees.group); // exactly 2 InstancedMeshes (trunks, canopies), any count
```

Every field shares one seeded placement primitive (position/rotation/scale all vary per instance),
so "avoid obvious repetition" is structural, not left to each caller to re-derive. `createGroundClutter`
is the same technique for small rocks/low bushes/urban planting (one `InstancedMesh`, squashed
vertically so it reads as low clutter, not a field of spheres).

## 20. Quality gating — atmosphere/vegetation density by tier

`quality.ts`'s `tierAllowsAtmosphereParticles(tier)` (same `'medium'`+ floor as bloom) and
`atmosphereParticleCount(base, tier)` (0 below that floor, `scaleCount`-scaled otherwise) are the
real feature-gating this engine's atmosphere effects now go through — `labScene3D.ts`,
`epidemicCity3D.ts`, and `highFidelitySlice3D.ts` all skip their dust motes/light shaft/haze
entirely at `'low'` tier rather than rendering a smaller version nobody asked to pay for:

```ts
const tier = detectRenderTier();
if (tierAllowsAtmosphereParticles(tier)) {
  const dust = createDustMotes(THREE, { ...opts, count: atmosphereParticleCount(200, tier) });
  scene.add(dust.points);
}
```

The same pattern generalizes to any future density-scaled effect (vegetation instance counts
included) — one gate check, one count call, instead of each scene re-deriving its own tier logic.

## Example usage

See `examples/heroApparatusExample.ts` in full — it wires every subsystem
above (materials, instancing, hero lighting, shadow policy, a DOF-settings
hint, the scientific-state hook) into one generic, documented, non-lab
object. A world-builder assembling the real flagship apparatus should
follow that *pattern*, not import that *file*. Its smoke test
(`src/__tests__/graphicsHeroApparatusExample.test.ts`) is a working,
executable reference for "does my composition actually run."

## Proven across more than one world

This isn't a single-scene abstraction with one caller — three
independently-built `Sim3D` scenes, of genuinely different shapes, all
delegate their `setupPostProcessing` to `setupGraphicsPipeline` today:

- `labScene3D.ts` (First Person Lab, an interior): `ambient: { mode: 'room-probe' }`
  for a scene-specific reflection of the room itself (via
  `captureRoomEnvironment`, called from the render loop through
  `GraphicsPipeline.captureRoomProbe()` once the first frame is drawn), a
  per-scene `ambientOcclusion` radius tuned for its metre-scale machinery,
  and a per-shot lens via `configureCinematicCamera` (wide 68° for the
  establishing/first-person framings, a tighter 40° `HERO_CLOSE_UP` for the
  vessel close-ups) driven by the same camera-phase state machine that
  retunes DOF's focus distance every frame.
- `epidemicCity3D.ts` (the epidemiology city, an exterior night scene with
  its own HDRI intensity/background/fog): `ambient: { mode: 'none' }` so this
  engine's generic AMBIENT/IBL role doesn't fight that scene's own
  atmosphere, while still getting the shared tone-mapping/AO/bloom pipeline
  and its tier gating.
- `highFidelitySlice3D.ts` (a bright daytime street-level view of the same
  epidemic model): `ambient: { mode: 'none' }` again for its own HDRI/fog/
  background. This scene already bakes AO into `uv2`/`aoMap` textures for
  static per-texel occlusion — `GTAOPass` adds real-time, geometry-aware
  contact occlusion on top, which a baked map can't express (it doesn't
  know what else is nearby at runtime). The two techniques are
  complementary, not redundant.

The `'none'`/`'room-probe'` split is what makes that possible — a real,
different-domain scene consuming this engine's tone-mapping/AO/bloom/DOF
pipeline without forking it or fighting its own environment/atmosphere
handling.

The city scene also runs `applyShadowPolicy` (previously lab-only in
practice) over its hundreds of building/road/street-furniture meshes, and
its four exterior materials (`asphalt`/`concrete`/`ground`/`brick`) are now
built via `createPBRMaterial`'s `CONCRETE`/`ASPHALT`/`BRICK`/`GROUND`
categories instead of duplicating the same roughness/metalness tuning
in-file — the same palette, shadow policy, and post-processing pipeline
now genuinely serve two unrelated worlds, not one plus an untested example.

Both exterior scenes' key/background lights are built via `createSunLight`/
`createBackgroundFill` too — an audit found each had independently
hand-rolled the same DirectionalLight-key + HemisphereLight-fill rig (same
shape, different tuning per scene), which `createSunLight` now generalizes
as SUN's own role rather than leaving it as parallel, undocumented
copy-paste. The lab's own shadow-enabling pass was found to be a byte-for-
byte duplicate of `applyShadowPolicy`'s algorithm too, inlined instead of
calling the shared function — now consolidated onto the one implementation.

## Verification performed on this branch

- `npx tsc -b --force` — clean, no errors.
- `npm run build` (`tsc -b && vite build`) — clean; `GTAOPass`/`BokehPass`/
  `SSRPass` land in their own lazy-loaded chunks, matching the existing
  pattern for `UnrealBloomPass`/`OutputPass`.
- `npx vitest run` — every test file in the project passes, including the
  files covering this rendering layer specifically: pipeline pass-order/
  tier-gating/reflections/qualityTier (`graphicsPostProcessing.test.ts`),
  the material palette/glass/double-wall (`graphicsMaterials.test.ts`),
  lighting roles (`graphicsLighting.test.ts`), the shadow policy
  (`graphicsShadowPolicy.test.ts`), quality-tier helpers including
  `'cinematic'` (`graphicsQualityTiers.test.ts`), the cinematic camera
  module (`graphicsCinematicCamera.test.ts`), the integration example
  (`graphicsHeroApparatusExample.test.ts`), the frame-counter diagnostics
  (`graphicsDiagnostics.test.ts`), and the resource-lifecycle disposal
  utility (`graphicsLifecycle.test.ts`).
- Manual headless run (Playwright + SwiftShader): `#/first-person-lab`
  renders correctly with GTAO active, no console errors, no visual
  regression versus the pre-existing lighting/materials. `#/city3d`
  (the epidemiology city, a second, independent `Sim3D` scene) also renders
  correctly through the same shared pipeline — no console errors, its own
  tuned night atmosphere (HDRI/background/fog) intact.
- A genuine `window is not defined` bug in `quality.ts`'s `tierDpr` (it
  never guarded for a non-browser environment, unlike `detectRenderTier`)
  was found and fixed while writing this session's tests — see
  `graphicsQualityTiers.test.ts`.
- A resource-lifecycle audit (reading three.js's own `EffectComposer`
  source, not assuming) found four genuine GPU-resource leaks across the
  engine, all now fixed and tested:
  1. `EffectComposer.dispose()` never disposed `UnrealBloomPass`/
     `BokehPass`/`OutputPass` — only its own two ping-pong render targets
     — so `setupGraphicsPipeline`'s `dispose()` now disposes all five
     passes explicitly (`graphicsPostProcessing.test.ts`'s
     `'setupGraphicsPipeline — dispose'` block).
  2. `labScene3D.ts` had **no scene-level disposal at all**, on the
     mistaken assumption that GC of the scene graph frees GPU memory (it
     doesn't — see `lifecycle.ts`'s module doc) — now calls
     `disposeSceneResources(this.scene)`.
  3. `highFidelitySlice3D.ts`'s hand-rolled `disposeObject` only disposed
     4 of its 7 `MaterialBundle` registry materials, never touched any of
     their own loaded PBR textures (`map`/`normalMap`/`roughnessMap`/
     `aoMap` — real loaded images), and left `glass`/`metal`/`markings`
     leaking entirely.
  4. `epidemicCity3D.ts`'s `cityMaterials` registry (asphalt/concrete/
     ground/brick, same shape of real loaded PBR textures) was **never
     disposed at all** — 0 of 4, not even the materials themselves.

  A follow-up sweep specifically onto loaded GLTF assets (as opposed to
  procedural geometry) found four more, all fixed the same way:
  `highFidelitySlice3D.ts`'s loaded hero character (added directly to
  `scene`, bypassing the existing per-object disposal loop entirely), its
  real-human GLTF clones (only ever disposed one at a time when an agent
  walked out of range, never as a group on full teardown) and their raw
  clone template, and `epidemicCity3D.ts`'s approved-asset GLTF clones
  (facade/lamp instances) plus their two raw templates — `dispose()` only
  ever called `scene.remove()` on them, never freeing GPU resources.

  Both scene files now delegate to `lifecycle.ts`'s
  `disposeSceneResources`/`disposeMaterials` instead of their own
  hand-rolled, incomplete traversal — one tested implementation instead of
  three independently-drifted ones. See `graphicsLifecycle.test.ts`.
