# GENESIS GRAPHICS ENGINE — WORLD BUILDER HANDOFF

Independent rendering-layer contribution, built on branch
`claude/genesis-graphics-engine-v1-wd0r66`. Scope is deliberately narrow:
**materials, lighting roles, shadows, AO, DOF, post-processing, and
performance tooling.** It does not build laboratory geometry, the hero
apparatus, scientist hands/PPE, or UI — that's the world-builder's layer,
and this document is written for that world-builder to consume this one
without re-deriving or duplicating any of it.

## 1. What APIs to use

| Concern | Module | Entry points |
|---|---|---|
| Materials | `materials.ts` | `createGenesisMaterialPalette(THREE)`, `createScienceGlass`, `createEmissiveInstrumentMaterial`, `createScreenMaterial`, plus the procedural texture generators |
| Lighting roles | `lighting.ts` | `createKeyLight`, `createRimLight`, `createPracticalLight`, `applyHeroLighting`, `createBackgroundFill`, `applyAmbientIBL` |
| Shadows | `shadowPolicy.ts` | `applyShadowPolicy(THREE, scene, options?)`, `SHADOW_SIZE_TIERS` |
| Instancing | `instancing.ts` | `InstanceBatch` |
| Post-processing (AO/bloom/DOF/tone-mapping) | `postProcessing.ts` | `setupGraphicsPipeline`, `resolveBokehUniforms`, types `GraphicsPipelineOptions`/`DepthOfFieldSettings`/`GraphicsPipeline` |
| Quality tiers | `../quality.ts` | `detectRenderTier`, `tierDpr`, `tierAllowsBloom`, `tierAllowsAO`, `tierAtLeast`, `recommendedShadowMapSize`, `maxShadowCasterBudget` |
| Integration pattern | `examples/heroApparatusExample.ts` | `buildExampleHeroApparatus` — READ this, don't import it into a real scene |

## 2. What NOT to duplicate

- **Don't write a second tone-mapping/color-space/shadow-map renderer
  setup.** `setupGraphicsPipeline` already configures `renderer.shadowMap`,
  `renderer.toneMapping`, `renderer.toneMappingExposure`, and
  `renderer.outputColorSpace` — call it once from your `Sim3D.setupPostProcessing`
  and you're done. See §3 for the exact contract.
- **Don't write a second AO/bloom/DOF composer chain.** Extend
  `GraphicsPipelineOptions` if you need a new pass, don't build a parallel
  `EffectComposer`.
- **Don't hand-roll a PBR material for something that fits one of the 8
  canonical categories.** `createGenesisMaterialPalette` exists so "brushed
  metal" means the same roughness/metalness everywhere in the world.
- **Don't hand-place a SpotLight+PointLight pair and re-tune the angle for
  every new hero object.** Call `applyHeroLighting` once instead.
- **Don't re-derive the shadow size heuristic.** Call `applyShadowPolicy`
  once, after your scene is fully built.
- **Don't import `examples/heroApparatusExample.ts` into a real scene.** It
  is a reference pattern, not reusable geometry — its chamber/frame/bolts
  are generic filler, not the flagship apparatus.

## 3. The rendering pipeline contract

### Canonical call order

```
SCENE / MATERIALS  →  LIGHTING  →  (build finishes)  →  SHADOW POLICY  →  AO  →  BLOOM  →  DOF  →  TONE MAPPING  →  COLOR SPACE OUTPUT
```

Concretely, across two phases:

**Phase 1 — scene construction (`Sim3D.init`)**, entirely yours to order as
you like, except shadow policy must run last:
1. Build geometry, assign `createGenesisMaterialPalette`/`createScienceGlass`/etc. materials.
2. Add lighting roles (`createKeyLight`/`applyHeroLighting`/`createBackgroundFill`/...).
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
    depthOfField: { enabled: true, focusDistance: 3.2 }, // see §4
  });
}
```

Internally this builds: `RenderPass → GTAOPass (tier-gated) → UnrealBloomPass
(tier-gated) → BokehPass (opt-in, tier-gated) → OutputPass`, plus
`renderer.shadowMap`/`toneMapping`/`outputColorSpace` and the AMBIENT/IBL
role (`applyAmbientIBL`). **You should not need to touch any of this** —
it's exposed as one function precisely so you don't have to reassemble it.

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
`renderer.toneMapping`'s value. `GTAOPass` and `UnrealBloomPass` then
operate correctly on that linear HDR data (AO darkens actual scene radiance,
bloom blooms actual scene brightness — not an already-compressed, already-
gamma-encoded image). Only `OutputPass`, which sets the render target to
`null` for the final blit, applies tone mapping **and** color-space
conversion — **exactly once, at the very end.** There is no double
tone-mapping, no double encoding, and no ordering ambiguity: this is the
same reasoning behind three.js's own recommended
`RenderPass → effects → OutputPass` pattern, verified here against this
project's actual pipeline rather than assumed. See
`graphics/postProcessing.ts`'s test file
(`src/__tests__/graphicsPostProcessing.test.ts`) for the automated pass-order
assertions.

`GTAOPass` composes correctly into this chain specifically because it
blends its AO term with `CustomBlending` **inside** the same linear-HDR
buffer, before `OutputPass` runs — this is the fix for the pipeline's
previous "SSAO skipped, blows out to white" state (SSAO used to fight the
tone-mapper because of a different, incorrect pass placement).

## 4. How to enable AO

You don't — it's already on, gated to the `'high'` render tier
(`tierAllowsAO`) via `setupGraphicsPipeline`. Nothing to configure for the
common case. If you need to change the AO tuning (radius/thickness/scale),
edit the `gtao.updateGtaoMaterial({...})` call inside `setupGraphicsPipeline`
— don't build a second GTAOPass elsewhere.

## 5. How to configure DOF

DOF is **opt-in and off by default** — omitting `depthOfField` (or passing
`{ enabled: false }`) is a strict no-op, so enabling it never affects a
scene that hasn't asked for it.

```ts
const depthOfField: DepthOfFieldSettings = {
  enabled: true,
  focusDistance: 3.2,       // meters from the camera — YOU must know this; the pipeline won't guess.
  blurStrength: 0.4,        // optional, 0..1 friendly knob (default 0.4). 0 = imperceptible, 1 = strong "macro" look.
  // aperture / maxBlur     // optional advanced overrides of the blurStrength mapping — see resolveBokehUniforms.
  // minTier: 'medium',     // optional — loosens the default 'high'-tier gate. Only after profiling your scene.
};
```

Retune focus at runtime (e.g. a cinematic camera cuts to a new shot) via the
pipeline's own handle, without rebuilding the composer:

```ts
const pipeline = setupGraphicsPipeline(...); // your Sim3D.setupPostProcessing already returns this
pipeline.setFocusDistance(newDistance); // no-op if DOF was never enabled
```

DOF renders its own full-scene depth pre-pass — see
[`PERFORMANCE.md`](./PERFORMANCE.md) before enabling it below the `'high'`
tier or alongside AO on mid-range hardware.

## 6. How to assign materials

```ts
const materials = createGenesisMaterialPalette(THREE); // once per scene
mesh.material = materials.BRUSHED_METAL; // share the SAME instance across every brushed-metal part
```

The 10 canonical categories: `SCIENCE_GLASS`, `BRUSHED_METAL`,
`POLISHED_METAL`, `TECH_COMPOSITE`, `RUBBER`, `CERAMIC`,
`EMISSIVE_INSTRUMENT`, `LAB_FLOOR`, `LAB_WALL`, `SCREEN`. Eight of them
(everything except `EMISSIVE_INSTRUMENT` and `SCREEN`) are shared static
instances from `createGenesisMaterialPalette` — assign the same instance to
every mesh of that category. The other two are **factories**, because their
content is inherently per-instance:

```ts
const led = createEmissiveInstrumentMaterial(THREE, { color: 0xffb545, intensity: 0.9 }); // one per distinct indicator color
const screen = createScreenMaterial(THREE, myCanvasTexture); // one per screen — each shows different content
```

Need a true see-through pane instead of `SCIENCE_GLASS`'s reflective hero
look (a partition, an observation window)?

```ts
const windowGlass = createScienceGlass(THREE, { transmissive: true });
```

Need a variant of a shared category (different color, a normal map once you
have an approved asset)? Treat the result like any three.js material —
`palette.BRUSHED_METAL.clone()` then set `.color`/`.normalMap` directly.
There is no bespoke options API for this; that's intentional (see
`materials.ts`'s doc comment on `createGenesisMaterialPalette`).

## 7. How to assign shadows

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

## 8. How to register hero objects

"Hero object" isn't a registry — it's a lighting + (optionally) DOF
treatment you apply once, generalized from the proven flagship apparatus
tuning:

```ts
applyHeroLighting(THREE, scene, {
  target: apparatusPosition,     // world point the object sits at
  keyDistance: 4.2,              // scale up for a larger object
  rimDistance: 1.8,
});
```

See `examples/heroApparatusExample.ts` for the full pattern (materials +
instancing + hero lighting + shadow policy + the visual-state hook, all in
one place) — read it, don't import it.

## 9. How to register scientific visual state

There's no registry here either — the pattern (proven in `labScene3D.ts`'s
`syncScene`, and mirrored generically in
`examples/heroApparatusExample.ts`'s `updateVisualState`) is: your Sim3D's
`syncScene`/`update` reads the ALREADY-COMPUTED scientific state (a
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

## 10. Performance rules

Full detail (cost drivers, checklist) in [`PERFORMANCE.md`](./PERFORMANCE.md).
The five that matter most:

1. DPR is capped via `quality.tierDpr(tier)` — the single highest-leverage lever (cost ~O(dpr²)).
2. A shadow-casting `PointLight` costs ~6x a Spot/DirectionalLight (cube shadow map, 6 faces) — budget with `maxShadowCasterBudget(tier)`, not a raw light count.
3. AO and DOF each render their own extra full-scene pre-pass — both gated to `'high'` tier by default; loosen only after profiling.
4. Repeated small parts (bolts, LEDs, knobs) go through `InstanceBatch` once the count exceeds ~15-20 — one draw call regardless of instance count.
5. `applyShadowPolicy` runs exactly once, after the scene is fully built.

## Example usage

See `examples/heroApparatusExample.ts` in full — it wires every subsystem
above (materials, instancing, hero lighting, shadow policy, a DOF-settings
hint, the scientific-state hook) into one generic, documented, non-lab
object. A world-builder assembling the real flagship apparatus should
follow that *pattern*, not import that *file*. Its smoke test
(`src/__tests__/graphicsHeroApparatusExample.test.ts`) is a working,
executable reference for "does my composition actually run."

## Verification performed on this branch

- `npx tsc -b --force` — clean, no errors.
- `npm run build` (`tsc -b && vite build`) — clean; `GTAOPass`/`BokehPass`
  land in their own lazy-loaded chunks, matching the existing pattern for
  `UnrealBloomPass`/`OutputPass`.
- `npx vitest run` — every test file in the project passes, including six
  new files covering this rendering layer: pipeline pass-order/tier-gating
  (`graphicsPostProcessing.test.ts`), the material palette
  (`graphicsMaterials.test.ts`), lighting roles (`graphicsLighting.test.ts`),
  the shadow policy (`graphicsShadowPolicy.test.ts`), the new quality-tier
  helpers (`graphicsQualityTiers.test.ts`), and the integration example
  (`graphicsHeroApparatusExample.test.ts`).
- Manual headless run (Playwright + SwiftShader): `#/first-person-lab`
  renders correctly with GTAO active, no console errors, no visual
  regression versus the pre-existing lighting/materials.
