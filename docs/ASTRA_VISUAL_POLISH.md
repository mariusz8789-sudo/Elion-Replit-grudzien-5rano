# Astra visual polish — bounded first pass

Base: `a6e5abb45dad64daca5ce9c3a03541c07911b10e`.
Branch: `astra/genesis-investor-visual-polish`.

## Changes

- Human Explorer shell: Fresnel rim enters linear emissive lighting before ACES, fog, output conversion and premultiplied alpha. The original emissive texture chunk is preserved. Fresnel input is clamped to avoid precision-induced invalid powers.
- GHOST opacity is multiplied by the shell effect instead of replaced by it. This preserves the material/texture transparency budget and reduces bright opaque edges.
- Shared CameraRig and FocusPuller use exponential damping: the same elapsed time produces the same settled pose/focus at 15, 30, 60 and 144 Hz. Invalid/backward deltas hold the current value.
- CameraRig no longer adds the requested starting orbit angle twice after frame()/cut().
- Human Biology/physics lab camera interpolation now uses elapsed wall time, capped at 0.2 seconds for stalled frames. With reduced motion it snaps to the requested framing and suppresses decorative drift/head bob. Controller timing is unchanged.

No new assets, dependencies, renderer, quality tiers, postprocessing passes, simulation behavior, evidence, provenance, classification, backend or deployment changes. CERN, SW-4, World Director and cinematic world generation have no scene-specific changes in this pass. The shared focus fix also benefits existing callers, including GenesisScientificCitySim. This is a modest consistency/correctness improvement, not a new visual-fidelity tier.

## Verification

- 9 focused frontend files: **80 tests passed**, including six new regressions. Five initial regressions reproduced failures on the base before fixes; the sixth exercises reduced-motion camera behavior in the real AgentLabScene3D lifecycle.
- ESLint on all changed TypeScript and the browser harness: passed.
- `npm run build`: TypeScript (`tsc -b`) and production Vite build passed. Existing mixed static/dynamic Three.js import and large-chunk warnings remain.
- Chromium/Edge 153.0.4234.48: desktop 1440x900, mobile 390x844, and desktop reduced motion; NORMAL, XRAY and GHOST on each. All nine cases passed before and after, zero captured JavaScript/shader errors. The browser check requires the approved GLB to reach READY and preserves the `ANATOMIA: MODEL` label.
- Final diff whitespace check passed.

Run the browser harness against the isolated frontend server:

```powershell
$env:BASE_URL = 'http://127.0.0.1:5177'
$env:VISUAL_STAGE = 'after'
node scripts/astra-visual-polish-e2e.mjs
```

The harness writes one representative desktop GHOST screenshot per stage (at most two for a before/after comparison) and raw counters to `artifacts/astra-visual-polish/`. Generated review artifacts are not runtime assets and are not included in the code commit. Temporary verification artifacts were removed after review.

## Measured rendering cost

These are actual existing renderer counters, sampled after at least 20 further frames per surface. They count submitted work across the current render path, not unique model polygons. Mobile uses the existing proxy LOD; desktop uses the full approved body. The animated scene/camera is not frozen to a canonical timestamp, so small culling differences between runs are expected. These samples are not hardware-performance benchmarks.

| Mode / surface | Draw calls before → after | Submitted triangles before → after |
| --- | ---: | ---: |
| Desktop NORMAL | 1223 → 1223 | 440523 → 440523 |
| Desktop XRAY | 1231 → 1231 | 524209 → 524209 |
| Desktop GHOST | 1231 → 1231 | 524209 → 524209 |
| Mobile NORMAL | 539 → 540 | 55375 → 55727 |
| Mobile XRAY | 543 → 545 | 56559 → 57263 |
| Mobile GHOST | 545 → 545 | 57183 → 57183 |
| Reduced-motion NORMAL | 1223 → 1223 | 440523 → 440523 |
| Reduced-motion XRAY / GHOST | 1231 → 1231 | 524209 → 524209 |

Texture GPU-memory estimate in every sample: **53,204,309 bytes / 50.74 MiB**, unchanged. This existing browser diagnostic exposes texture memory only; it excludes geometry and render targets, so **total GPU memory is not measured here**. No draw-call reduction is claimed.

## Integration and remaining limits

Review/cherry-pick the branch after final integration checks; do not merge blindly across concurrent edits to AgentLabScene3D. Its changes are confined to the camera import and camera presentation block. The other three production files are shared visual utilities/materials.

Improved shading does not add segmented medical anatomy, organ textures, or anatomical fidelity. The existing MPFB silhouette and illustrative organ geometry remain the asset ceiling. No claim is made that AI-video or different lighting changes scientific validity. More aggressive bloom/AO/DOF/light/material tuning needs scene-specific visual comparisons and device budgets; those parameters were deliberately left at their already-tuned values in this first pass.
