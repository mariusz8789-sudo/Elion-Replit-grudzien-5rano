# Genesis Graphics Runtime — Rendering Layer

Independent rendering-infrastructure contribution, built on branch
`claude/genesis-graphics-engine-v1-wd0r66`. Scope is deliberately narrow:
**post-processing / AO / depth / DOF / material quality / performance
plumbing** — no facility geometry, no hero-apparatus geometry, no scientist
POV/hands, no UI. Those are owned by a parallel effort; this layer is meant
to be *consumed* by it, not to replace it.

## Files changed

| File | What it is |
|---|---|
| `graphics/postProcessing.ts` | **Main deliverable.** `setupGraphicsPipeline()` builds the EffectComposer chain: `RenderPass → GTAOPass (tier-gated) → UnrealBloomPass (tier-gated) → BokehPass (opt-in, tier-gated) → OutputPass`, plus renderer flags (shadow map type, ACES tone mapping, sRGB output) and environment/IBL application. Returns a `GraphicsPipeline` (superset of the existing `PostProcessor` contract) with a `setFocusDistance()` hook for DOF. |
| `graphics/lighting.ts` | `applyStudioEnvironment()` (procedural PMREM studio env — gives metal/glass something to reflect without any asset) and `loadHdriEnvironment()` (optional approved HDRI, IBL-only, never touches `scene.background`). Pure technique, no fixture placement. |
| `graphics/materials.ts` | Reusable PBR material palette (`createFacilityMaterials`), small shared primitive geometries (`createFacilityGeometry`), LED-strip/contact-shadow accents (`createFacilityAccents`), and the procedural texture generators (brushed metal, floor noise, contact-shadow decal, canvas readout surface) the original scene used inline. Optional — the facility/apparatus layer can adopt this palette or keep its own. |
| `graphics/instancing.ts` | `InstanceBatch` — collects per-instance transforms for a single (geometry, material) pair and bakes them into one `InstancedMesh` on `.build()`. Use for any high-count repeated greeble (bolts, LEDs, knobs) to cut draw calls. |
| `graphics/shadowPolicy.ts` | `applyShadowPolicy(THREE, scene)` — the size/transparency heuristic that decides which meshes cast/receive shadows, extracted as a single reusable pass to run once after a scene is fully built. |
| `core/three/quality.ts` | Added `tierAllowsAO(tier)` (AO only on `'high'` — GTAO's normal/depth pre-pass is pricier than bloom) alongside the existing `tierAllowsBloom`. |
| `core/three/types.ts` | `PostProcessingModules` gained `GTAOPass` and `BokehPass` module refs (the `Sim3D.setupPostProcessing` contract now receives them like every other postprocessing class). |
| `core/three/useThreeLoop.ts` | Dynamically imports `GTAOPass`/`BokehPass` alongside the other postprocessing modules and passes them through — this is the one shared file every Sim3D's `setupPostProcessing` goes through, so wiring here makes AO/DOF available to *any* Sim3D, not just the lab. |
| `core/three/labScene3D.ts` | **One surgical change**: `setupPostProcessing()`'s body now delegates to `setupGraphicsPipeline()` instead of the old inline composer setup, replacing the "SSAO skipped, would blow out to white" comment with working GTAO. No other line in this file changed — scene composition, apparatus, camera system, and the first-person controller are untouched. |

## The AO fix, specifically

The previous pipeline explicitly skipped `SSAOPass` because it fought ACES
tone mapping + `OutputPass` and blew the frame to white. `GTAOPass` (already
available in this three.js version) blends its AO term into the beauty
render target with `CustomBlending` *inside* the composer's linear-HDR
chain — i.e. strictly before `OutputPass` tone-maps/converts color space.
Placed right after `RenderPass`, it composes correctly instead of racing
the tone mapper. Verified by running the actual First-Person Lab scene
headless (Playwright + SwiftShader) — GTAO's Poisson-denoise pass visibly
executes (console warning from its own shader is the tell) and the frame
renders with no visual regression vs. the pre-existing lighting/materials.

## How the main graphics branch should consume this

1. **Nothing is required to change.** `labScene3D.ts`'s `setupPostProcessing`
   already calls `setupGraphicsPipeline()`, so GTAO + tone-mapped bloom are
   live for the existing scene as-is (tier-gated: AO needs `'high'`).
2. **DOF is opt-in and OFF by default.** To use it on a fixed/cinematic
   camera shot (e.g. a close-up on the hero apparatus or a sensor probe),
   pass `depthOfField: { focusDistance }` into the `setupGraphicsPipeline()`
   options from wherever `setupPostProcessing` is implemented — `labScene3D`
   would need to know its own shot's focus distance (e.g. the distance from
   `camera.position` to `VESSEL_POSITION` for a `SCIENTIFIC`/`MACRO` shot).
   That number is scene-composition knowledge this layer deliberately
   doesn't have. The returned `GraphicsPipeline.setFocusDistance(distance)`
   lets the caller retune focus at runtime when a cinematic camera cuts to
   a new shot, without rebuilding the composer.
3. **Optional material/instancing adoption.** `materials.ts`'s palette and
   `instancing.ts`'s `InstanceBatch` are available if the facility/apparatus
   layer wants a shared PBR vocabulary or wants to cut draw calls on
   repeated small parts (bolts, LEDs) — neither is required; both are
   additive, opt-in utilities with zero coupling to any specific facility
   layout.
4. **`applyShadowPolicy(THREE, scene)`** should be called once, after the
   facility/apparatus layer has finished adding everything to `scene`, if
   that layer wants the same "small parts don't cast, transparent things
   only receive" shadow heuristic the original scene used. It's a pure
   function over the finished scene graph — no ordering dependency beyond
   "run last."

## Verification performed

- `npx tsc -b --force` — clean, no errors.
- `npm run build` (`tsc -b && vite build`) — clean; `GTAOPass`/`BokehPass`
  land in their own lazy-loaded chunks (30 KB / 7 KB gzip'd-ish), matching
  the existing pattern for `UnrealBloomPass`/`OutputPass`.
- `npx vitest run` — 195 test files, 1976 tests passed, 1 pre-existing skip.
- Manual headless run: `#/first-person-lab` renders correctly (screenshot
  verified), WASD/pointer-lock flow untouched, no console errors beyond
  expected SwiftShader/software-WebGL notices from the sandboxed browser.
