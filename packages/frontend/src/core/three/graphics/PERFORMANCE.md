# Genesis Graphics Runtime — Performance Notes

No FPS numbers here — this container has no real GPU (software/SwiftShader
rendering only), so a frame-rate number reported from it would be fiction.
What follows instead: which operations are GPU-sensitive and *why*, what
each one actually costs in extra render passes/draw calls, the tier gates
already in place, a checklist for a world-builder adding new geometry/
lights, and — new below — actual MEASURED draw-call data from the three
real scenes this engine ships with, using `graphics/diagnostics.ts`.

## Measured, not fabricated: draw-call cost across the three real scenes

`graphics/diagnostics.ts` (added specifically to make this section possible)
exposes `renderer.info`'s draw-call/triangle/geometry/texture/program
counts — exact CPU-side counts three.js already tracks internally, true on
any GPU including software rendering, unlike frame time. The numbers below
were captured by instrumenting the real `WebGLRenderingContext.prototype.
drawArrays`/`drawElements` in a headless Chromium (SwiftShader software
rendering) and counting actual calls over a 15-second window on each of the
three shipped scenes, at their default WIDE/establishing view:

| Scene | Draw calls / frame (measured) | Frames observed / 15s |
|---|---|---|
| First Person Lab (`#/first-person-lab`) | **~2541** | 8 |
| Epidemiology city (`#/city3d`) | **~826** | 34 |
| High-fidelity street slice (`#/hf-slice`) | **~809** | 14 |

**What this measurement IS**: an exact count of GL draw calls submitted per
rendered frame — hardware-independent, reproducible, not a guess. **What it
is NOT**: a frame-rate or hardware-performance claim — "frames observed"
here reflects SwiftShader software rasterization speed in this sandbox, not
any real GPU, and must never be quoted as an FPS number (see the file
intro above).

**Why the lab is ~3x the other two scenes' draw-call cost, and this is
expected, not a bug**: the lab's `setupPostProcessing` explicitly loosens
both `ambientOcclusion` and `depthOfField` to `minTier: 'medium'` (its own
documented choice — AO is what grounds its hero apparatus, worth the
cost). In this sandbox, `detectRenderTier()` returns `'medium'` (4 CPU
cores), so the lab is the only one of the three scenes actually running
`GTAOPass` (its own normal pre-pass) and `BokehPass` (its own depth
pre-pass) here — city and hf-slice both stay on the *default* `'high'`-tier
AO/DOF gate, which this sandbox's tier heuristic doesn't clear, so neither
pass runs for them at all. Three full-scene submissions (base color + AO's
normal pass + DOF's depth pass) landing at ~3x one scene's base draw-call
count is exactly what "GTAO/DOF: this is a full extra scene render" (§3/§4
below) predicts — this is the first time that reasoning has been checked
against an actual measured number instead of asserted structurally, and it
holds up.

**On a real GPU with more cores**, `detectRenderTier()` would return
`'high'` for all three scenes, and city/hf-slice would ALSO pay the
GTAO+DOF draw-call cost (since their `depthOfField`/`ambientOcclusion`
options, where set, use the default `'high'` gate) — the ~3x multiplier
measured here for the lab is a reasonable estimate of what AO+DOF costs
any scene that enables both, not a lab-specific quirk. This is still not a
frame-time claim — verify actual GPU-bound cost on real target hardware
before shipping a performance guarantee.

## Render-loop allocation audit: what was actually found and fixed

Per this project's "zero unnecessary per-frame allocations" rule, every `syncScene()`/`update()`
hot path across all three shipped scenes plus their shared crowd/character rigs was read end to
end looking for allocation inside a per-frame or per-instance loop. These are exact counts of what
the code allocated before each fix — not measured GC pause time (this sandbox has no real GPU to
profile that on), but the allocation COUNT itself is an exact, hardware-independent fact about the
code, same epistemic status as `diagnostics.ts`'s draw-call counts.

| Location | Was allocating | Frequency | Fix |
|---|---|---|---|
| `InstancedHumanoidCrowd.update()` | 6 `THREE.Color` per instance | up to 1024 instances (`MAX_CROWD_HUMANOIDS`) × every frame = **up to 6,144/frame** | 5 named scratch Colors + 1 true constant |
| `epidemicCity3D.ts`/`highFidelitySlice3D.ts`'s `syncAnalysis()` | 1 `THREE.Color` per heatmap grid cell | 864/frame (city, 36×24) or 748/frame (street, 34×22), only while the overlay is on | 1 reused scratch `Color`, `.setRGB()` instead of `new Color()` |
| `setEpidemicTint()` (`characterRig.ts`) | 2 `THREE.Color` (`.clone()`) | once per DETAILED agent (LOD0/LOD1, a few dozen at most) × every frame | 2 scratch Colors, `.copy()` instead of `.clone()` |
| `useThreeLoop.ts`'s orbit-focus fallback, `epidemicCity3D.ts`'s `getOrbitCameraDirection()`/`syncScene()`, `highFidelitySlice3D.ts`'s `syncScene()` camera lerps | 1 `THREE.Vector3` each | every frame any orbit-focus/composed-shot camera path is active | reused scratch `Vector3` fields |
| `labScene3D.ts`'s `syncScene()` (fixed earlier this project) | 3 `THREE.Vector3` | every frame | reused scratch `Vector3` fields |

**Why this matters more than it looks**: `THREE.Color`/`THREE.Vector3` are small objects, but V8
still has to allocate, initialize, and eventually garbage-collect every one of them. The crowd fix
alone removes over 6,000 short-lived object allocations *per frame* at full population — sustained
indefinitely for as long as the city scene renders, not a one-off setup cost. None of these fixes
changed behavior: every mutated site was verified to either (a) have its value copied out
immediately by the three.js API it feeds (`InstancedMesh.setColorAt`, `Vector3.lerp`/`copy`, all of
which read then discard, never retain a reference), or (b) need the scratch's value only within the
same synchronous call before the next overwrite. New tests were added specifically to catch the
failure mode this kind of refactor risks — one instance's/frame's value bleeding into the next —
not just "it runs without throwing" (see `graphicsInstancedHumanoidCrowd.test.ts` and
`graphicsCharacterRig.test.ts`).

## Cost drivers, in the order they'll bite you

### 1. Device pixel ratio — the biggest lever, by far

Every other cost below scales with pixel count, which scales with `dpr²`.
`quality.ts`'s `tierDpr(tier)` caps it at 1 / 1.5 / 2 for low/medium/high.
**Before tuning anything else, confirm DPR is actually capped** — a 3x
retina display left uncapped costs 9x the equivalent 1x pass on every full-
screen effect (bloom, AO, DOF, the base render itself).

### 2. Shadow-casting lights

A shadow-casting light renders the *entire shadow-casting scene* again, once
per light, into a shadow map — this is a full extra scene traversal, not a
cheap post-process.

- **`SpotLight`/`DirectionalLight`**: 1 shadow map (1 extra scene render).
- **`PointLight`**: a **cube** shadow map — 6 faces, so ~6x the cost of a
  Spot/DirectionalLight shadow at the same resolution. This project already
  hit this bug once: an earlier version of the lab's `workLight` (a
  `PointLight`) had `castShadow = true` left on by accident, alongside the
  intended single `SpotLight` shadow caster — doubling the *intended* shadow
  budget into something closer to 7x it, silently.
- `quality.ts`'s `maxShadowCasterBudget(tier)` expresses this as budget
  *units* rather than a light count for exactly this reason: a
  `PointLight` shadow caster spends 6 units, a Spot/DirectionalLight spends
  1. Check a new light's total against the tier's budget before adding it,
  not just "is this one more light."
- `quality.ts`'s `recommendedShadowMapSize(tier)` returns `0` at `'low'`
  (skip shadow-casting entirely, don't allocate an undersized map that
  won't look right anyway), `512` at `'medium'`, `1024` at `'high'`.
- **Never leave a `PointLight`'s `castShadow` on by accident.** It defaults
  to `false`; if you set it, mean to.

### 3. GTAO (ambient occlusion)

`GTAOPass` renders its own normal+depth pre-pass (`MeshNormalMaterial`
override across the whole scene) before computing occlusion, then runs a
Poisson-denoise pass over the result. That's roughly:

- 1 extra full-scene render (normals).
- 2 full-screen shader passes (raw AO + denoise).

Gated to `'high'` tier by default (`tierAllowsAO`) for exactly this reason —
it's meaningfully pricier than bloom, which is a pure post-process with no
extra scene render. `GraphicsPipelineOptions.ambientOcclusion.minTier` lets a
specific scene loosen this after profiling its own cost (the flagship lab
does, down to `'medium'`, because AO is what grounds its metre-scale hero
machinery) — treat that as a per-scene, measured exception, not a reason to
change the global default.

### 4. Depth of Field (`BokehPass`)

Same shape of cost as GTAO: its own full-scene depth pre-pass
(`MeshDepthMaterial`) plus a blur convolution pass. **Enabling AO and DOF
together roughly doubles the "extra full scene render" cost** (one pass for
normals, one for depth) on top of the base render. `graphics/postProcessing.ts`
gates DOF to `'high'` tier by default (`DepthOfFieldSettings.minTier`) for
this reason — loosen it only after profiling your own scene, and consider
whether you need both AO and DOF simultaneously on anything but the top
tier.

### 5. Bloom (`UnrealBloomPass`)

A pure post-process (no extra scene render) — a chain of ~5 downsample/blur
passes at shrinking resolutions. Cheaper than AO/DOF, but not free; gated at
`'low'` tier (`tierAllowsBloom`) since it's still a handful of full-screen
passes at a device already too weak for AO.

### 5b. Screen-space reflections (`SSRPass`, opt-in)

Costs roughly the same order as GTAO — its own normal+depth+metalness
pre-passes plus a blur pass — and is UNVERIFIED in this sandbox (no real GPU
to check for the noise/streaking artifacts SSR is known to show on some
hardware/angles, especially at grazing incidence). For exactly this reason
it defaults to **off**, gated to the `'cinematic'` tier
(`ScreenSpaceReflectionSettings.minTier`), and should be validated on real
hardware before any caller loosens that gate. It complements, not replaces,
`SCIENCE_GLASS`'s transmission/clearcoat model and the AMBIENT/IBL PMREM
environment — both of those stay on and cheap regardless of whether SSR is
ever enabled.

### 6. Draw calls: instancing

Every unique `Mesh` is (at minimum) one draw call. A facility built from
hundreds of individually-placed bolts, LEDs, and knobs pays for hundreds of
draw calls for geometry that never changes shape, only position. Use
`graphics/instancing.ts`'s `InstanceBatch` for anything repeated more than
~15-20 times with a shared geometry+material — it collects transforms and
bakes them into one `InstancedMesh`, i.e. one draw call regardless of count
(practically bounded by GPU instancing limits, which are in the tens of
thousands — not a concern at facility scale).

Don't instance things that need independent per-instance material state
(different colors driven by different live data) unless you're prepared to
use instance-color/instance-attribute buffers — that's a different, more
involved technique than plain `InstanceBatch`.

### 7. Shadow policy as a performance control, not just a look

`graphics/shadowPolicy.ts`'s `applyShadowPolicy` isn't only about visual
correctness — every mesh with `castShadow = true` costs shadow-map render
time proportional to its triangle count. Its size-heuristic default
(`SHADOW_SIZE_TIERS`) exists specifically so a facility with thousands of
small parts doesn't silently make all of them shadow casters. Use
`forceCast` sparingly (a handful of "important machinery" exceptions, not a
blanket override) — each addition is a real cost, not just a flag.

### 8. The `'cinematic'` tier is not a "make it nicer" toggle

`recommendedShadowMapSize`/`maxShadowCasterBudget`/AO/reflections/DOF all
allow more at `'cinematic'` than at `'high'` — that budget is for a captured
still frame or a short clip, not a sustained interactive frame rate.
`detectRenderTier()` never returns it; it's only ever reached via an
explicit `GraphicsPipelineOptions.qualityTier: 'cinematic'` override for a
screenshot/video capture pathway. Don't wire it into a scene's normal
interactive rendering path.

## Performance checklist for the world-builder

Before shipping a new facility/hero-object scene, check:

- [ ] DPR is capped via `quality.tierDpr(tier)` — never left at the raw
      `window.devicePixelRatio`.
- [ ] Exactly one shadow-casting light exists per `maxShadowCasterBudget(tier)`
      at your target tier (remember: a `PointLight` shadow caster spends 6
      units, not 1).
- [ ] `light.shadow.mapSize` comes from `recommendedShadowMapSize(tier)`,
      not a hardcoded number.
- [ ] AO (`GraphicsPipelineOptions` via `setupGraphicsPipeline`) and DOF
      (`DepthOfFieldSettings`) are left at their default `'high'`-tier gate
      unless you've specifically profiled a lower tier can afford them.
- [ ] Repeated small parts (bolts, LEDs, knobs, gauges) go through
      `InstanceBatch`, not one `Mesh` per instance, once the count exceeds
      ~15-20.
- [ ] `applyShadowPolicy` runs exactly once, after every builder has
      finished adding to the scene — not per-builder, and not before the
      scene is complete (it would miss later-added meshes).
- [ ] `forceCast` in the shadow policy lists specific, named "important
      machinery" objects — not a broad predicate that quietly re-enables
      shadows for a whole category of parts.
- [ ] New procedural textures reuse a shared generator
      (`materials.ts`'s `brushedMetalFactory`/`makeFloorNoiseTexture`) with
      `.clone()` + a new `.repeat`, rather than generating a fresh canvas
      per surface that wants the same look.
- [ ] Screen-space reflections (`reflections` in `GraphicsPipelineOptions`)
      stay off/at their default `'cinematic'`-tier gate unless verified on
      real hardware — this sandbox cannot confirm SSR's visual quality.
- [ ] `qualityTier: 'cinematic'` is only ever used for an explicit capture
      (a screenshot/video request), never wired into normal interactive
      rendering.

## Update: crowd culling — fixed at the application level, not via `frustumCulled`

The finding below (three.js's own per-`InstancedMesh` bounding-sphere check
is unsafe for a scattered crowd) is still accurate, and `frustumCulled`
stays `false` on all ten meshes — that part is NOT changed. What's new is
`graphics/lod.ts`'s `FrustumCuller`: a correct, real-instance-position
frustum test computed on the CPU, independent of three.js's own (broken)
per-batch shortcut. `InstancedHumanoidCrowd.update()` now takes an optional
second argument, `{ camera, maxDistance? }` — when given, each agent's
OWN world position is tested against the camera's actual frustum (and
optionally a max distance) BEFORE it's added to the batch at all, so
`mesh.count` on every one of the ten meshes shrinks to the true visible
count. This is a real, structural reduction in submitted instances (an
exact, CPU-computed number, verifiable without a GPU — see
`graphicsInstancedHumanoidCrowd.test.ts`'s culling tests), not a
GPU-timing claim. `epidemicCity3D.ts` now passes its camera through
(frustum-only — no `maxDistance`, since this scene's camera standoff varies
too much across presets to guess a safe cutoff without real-hardware
verification; the frustum test itself is exact at any distance/scale).
This closes the "not fixed here" gap below with a genuinely different
mechanism (an application-level test) rather than the never-applied
`computeBoundingSphere()` idea, which is why that idea's own risk analysis
(stale bounding sphere as agents move) never even arises here — nothing
per-`InstancedMesh` is cached across frames; every agent is re-tested fresh
each `update()` call.

## Fixed: highFidelitySlice3D.ts's getOrbitCameraDirection() allocated a fresh Vector3 every frame

`useThreeLoop.ts`'s render loop calls `sim.getOrbitCameraDirection?.()`
every single frame whenever an orbit target with a focus distance is
active (see its own "Render-loop allocation audit finding" comment — the
caller-side fix for this was already applied there, copying the result
into a scratch vector immediately). The callee side wasn't: all three
branches of `highFidelitySlice3D.ts`'s `getOrbitCameraDirection()` returned
`new this.THREE.Vector3(...).normalize()`, allocating on every call even
though the caller never retains the reference. `epidemicCity3D.ts`'s own
version of this method already used a scratch vector
(`this.scratchOrbitDirection`) — `highFidelitySlice3D.ts` now does too
(same field name, same pattern). Verified in
`highFidelitySlice3DOrbitDirection.test.ts`: repeated calls return the
identical object reference, and the returned direction is still correct
per camera mode.

## Known limitation of `InstancedMesh` itself, worked around above (not fixed via `frustumCulled`)

`humanoidAgentVisual.ts`'s `InstancedHumanoidCrowd` sets `frustumCulled = false`
on all ten of its `InstancedMesh`es (torso/head/hair/limbs/status/aura/ground-
shadow), with no comment explaining why. The likely reason, verified by
reading three.js's own `InstancedMesh` source rather than assumed: its
default frustum-culling check uses the *base geometry's* bounding sphere —
which does not account for where each instance's transform actually places
it — so with `frustumCulled` left at its default `true`, three.js could
incorrectly cull the ENTIRE instanced batch (hide potentially hundreds of
agents scattered across the city) whenever that undersized bounding sphere
alone falls outside the frustum, even while individual instances are still
plainly on-screen. Disabling culling entirely avoids that visible bug at
the cost of always submitting the full batch regardless of camera framing.

The documented, but NOT applied, three.js-supported fix: call
`mesh.computeBoundingSphere()` after `setMatrixAt`-ing every instance (three.js
computes it from the actual instance transforms in that case), then leave
`frustumCulled` at its default. This would let the whole batch be culled
correctly when every instance is genuinely off-screen (e.g. a tight
`'agent'`/`'street'` camera framing looking away from most of the city) —
still all-or-nothing per `InstancedMesh` (three.js has no built-in
per-instance frustum culling), not a full culling system. **Not applied in
this branch**: this sandbox cannot render on a real GPU, so there is no way
to verify the fix doesn't introduce a worse regression (a stale bounding
sphere as agents keep moving frame to frame, if `computeBoundingSphere()`
isn't re-run often enough, causing agents to incorrectly vanish) — exactly
the class of visual bug that must be checked on real hardware before
shipping, per this project's own "never fabricate/never guess a performance
fix" rule. Flagging this precisely so whoever next has real-GPU access can
verify and apply it, rather than leaving it undocumented.
