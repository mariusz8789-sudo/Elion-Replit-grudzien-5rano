# Human Explorer: isolated visual ceiling prototype

Base: `e01e6950d941af95195d9e349ee053ad1538cc35`.
Branch: `astra/human-explorer-visual-ceiling`.
Scope: four frontend presentation files, one browser review script, this report and real browser artifacts. Not deployed or merged.

## Verdict

**ASSET_CEILING_REACHED.** The screen is substantially easier to read and the existing scientific subject is now the centre of attention. It is not a photoreal medical atlas. The enlarged heart exposes the actual limitation very clearly: its existing geometry is illustrative, not a detailed anatomical heart. Further bloom, exposure or camera changes cannot fix that.

## Existing stack audited

- `humanTwinAsset.ts`: governed CC0 MPFB outer-person asset at `/assets/genesis-hf/characters/mpfb-lod0.glb`. Clothing, skin and facial surfaces; no anatomical organ/vessel meshes in the body asset.
- `biologyLabKit.ts`: procedural organ volumes and chamber, existing key/fill/rim lighting and PBR palette.
- `humanTwinMaterials.ts`: NORMAL, TRANSLUCENT, XRAY and GHOST, Fresnel shell. XRAY is a model presentation, not a radiograph.
- `humanTwinCutaway.ts`: existing clipping planes and isolation, unchanged.
- `humanMacroMicroLayer.ts`: existing canonical organ/tissue/cell presentation from manifest/sealed artifacts, unchanged.
- `agentLabScene3D.ts` and `useThreeLoop.ts`: existing renderer and frame-rate-independent camera damping. No second renderer.
- Existing ACES exposure 0.78, scene probe/IBL, restrained bloom, GTAO and SMAA tier gates. DOF/SSR remain off. No expensive effects added.
- Coarse-pointer mobile under 520 px retains LOW tier, DPR 1 and PROXY_LOW body. This is a substantial mobile asset-quality limitation, intentionally not bypassed for attractive screenshots.

## Changes

1. Biology opens directly in the existing TWIN camera, with research information collapsed.
2. Four clearly visible BODY → ORGAN → TISSUE → CELL buttons call the original canonical commands. The primary button follows the same path. No scientific result/record is synthesized by presentation code.
3. Surface mode controls remain visible. All original system/organ selection, cutaway, isolation, microscope, session details, source labels, hashes, commands and evidence controls remain in one scrollable inspector. Advanced tools are additionally collapsed.
4. Establishing camera frames the whole subject. Detail camera follows the existing macro layer instead of leaving it behind the research dock. Damping remains independent of frame rate; drift reduced from 0.14 to 0.035 units.
5. Decorative moving scan rings/fiducials are hidden while in the TWIN camera to stop them cutting across the subject; they return in the other camera views. No anatomy geometry was removed.
6. Scoped typography, path and controls respect the desktop sidebar and mobile bottom navigation. No application-wide CSS rewrite.

At 1440×900, the coarse bounding-box estimate leaves **79.5%** of the whole screen for the scene after subtracting the sidebar and the four prototype HUD regions. This is an approximate layout-area measure, not the fraction occupied by anatomical pixels; it excludes the existing thin guide strip and chat launcher. Opening the inspector intentionally occupies part of the scene.

## Visual score against the supplied references

These are subjective art-direction ratings, not measured scientific accuracy or a benchmark. Same rubric before and after; no credit for missing geometry.

| Criterion | Before /20 | After /20 | Reason |
|---|---:|---:|---|
| Composition / hierarchy | 6 | 16 | Before: large technical dock and command UI hide scene. After: one subject, clear four-step path, details on demand. Global sidebar/guide still consume space. |
| Lighting / depth | 10 | 10 | Existing light hierarchy is serviceable. Removing scan clutter helps readability, but lighting and room assets are unchanged; no artificial score gain. |
| Materials / realism | 7 | 7 | Existing PBR works but clothing, bright edges and procedural tissue remain stylized. |
| Asset richness / anatomy | 4 | 4 | Clothed body, ellipsoid-like heart and schematic tissue remain the same assets. |
| Camera / presentation / UX | 6 | 14 | Direct establishing shot and smooth detail framing, one primary action, contained mobile inspector. More editorial framing and accessibility testing remain possible. |
| **TOTAL** | **33/100** | **51/100** | A substantial presentation improvement, not a premium-anatomy transformation. |

The touch/LOW-tier phone version remains visibly less detailed than desktop: its capsule-based proxy cannot be scored as the licensed desktop mesh. Approximate mobile visual score: **24 → 40/100**, driven by removal of UI obstruction rather than anatomical quality.

- Plausible ceiling with CURRENT assets and further bounded tuning: **60–64/100** desktop. Diminishing return starts here.
- Potential with appropriate licensed anatomy, texture/LOD sets and a competent art pass: **75–85/100**. Conditional estimate, not a promise from buying one mesh.
- Code cannot supply valid vessel branching, chamber topology, muscle fibres or histology detail absent from the assets.

## Exact missing assets

1. Segmentable anatomical human suitable for an educational atlas (skin, muscles, skeleton and major organ systems), plus a genuinely useful mobile LOD.
2. Anatomically shaped heart with chambers, major vessels, plausible coronary surface, section-capable topology and authored textures.
3. Tissue/cell meshes and PBR/normal textures with scientifically reviewed visual descriptions. Current procedural models are valid as illustrations, not reference-quality histology.
4. Better room/medical-instrument props and calibrated materials only after the anatomical subject is fixed. They are secondary to this task's ceiling.

No patient-specific claim is justified by any of these assets. The generic-model label is visible on the main screen.

## Real browser artifacts

All images are unedited Chromium screenshots. `before` was served from a separate, detached checkout of the exact base SHA; `after` from this branch.

| View | Before | After |
|---|---|---|
| Establishing | [before](../artifacts/human-visual-ceiling/before/desktop-establishing.png) | [after](../artifacts/human-visual-ceiling/after/desktop-establishing.png) |
| Organ hero | [before](../artifacts/human-visual-ceiling/before/desktop-organ.png) | [after](../artifacts/human-visual-ceiling/after/desktop-organ.png) |
| GHOST | [before](../artifacts/human-visual-ceiling/before/desktop-ghost.png) | [after](../artifacts/human-visual-ceiling/after/desktop-ghost.png) |
| Tissue | [before](../artifacts/human-visual-ceiling/before/desktop-tissue.png) | [after](../artifacts/human-visual-ceiling/after/desktop-tissue.png) |
| Cell | [before](../artifacts/human-visual-ceiling/before/desktop-cell.png) | [after](../artifacts/human-visual-ceiling/after/desktop-cell.png) |
| 390×844 hero | [before](../artifacts/human-visual-ceiling/before/mobile-390-hero.png) | [after](../artifacts/human-visual-ceiling/after/mobile-390-hero.png) |
| 390×844 inspector | [before](../artifacts/human-visual-ceiling/before/mobile-390-inspector.png) | [after](../artifacts/human-visual-ceiling/after/mobile-390-inspector.png) |

Equivalent hero/inspector captures for **375×812** and **430×932** are in those directories. Before the change the inspector was always open; before hero and inspector views therefore intentionally show the same presentation. Touch captures use device DPR 3 but the actual renderer remains capped at DPR 1. They are desktop Chromium device emulations, not physical iPhone/Safari measurements.

## Performance before / after

Same computer, Edge Chromium, 1440×900 desktop and touch-emulated mobile. Twelve existing-diagnostic samples at 200 ms spacing per view. Counts include post-processing passes; triangles are rendered counts, not unique mesh totals. Runtime timings are approximate observations, not controlled GPU benchmarks. Background desktop load can affect them.

| View | Draw calls before → after | Triangles before → after | Median FPS before → after |
|---|---:|---:|---:|
| Desktop body | 1223 → 1167 | 440523 → 432403 | 59.9 → 59.9 |
| Desktop organ | 1237 → 1149 | 565433 → 556757 | 59.9 → 60.1 |
| Desktop GHOST | 1243 → 1147 | 564825 → 556733 | 60.2 → 60.2 |
| Desktop tissue | 1903 → 1807 | 924269 → 915497 | 59.7 → 59.5 |
| Desktop cell | 1420 → 1318 | 630573 → 621313 | 59.9 → 59.9 |
| Mobile 375 body | 548 → 517 | 58239 → 53727 | 59.3 → 59.9 |
| Mobile 390 body | 548 → 517 | 58239 → 53727 | 59.9 → 59.9 |
| Mobile 430 body | 548 → 516 | 58239 → 53679 | 59.9 → 59.9 |

Estimated scene texture memory is **50.7 MiB both before and after** in all views. This estimator includes loaded scene textures (including hidden loaded assets), not total GPU residency or render-target allocation. Actual renderer DPR **1** in all captures. No extra post-processing: desktop ACES/GTAO/bloom/SMAA, mobile ACES with LOW-tier gates; DOF and SSR off.

The tissue view remains expensive at ~1800 draw calls. The prototype does not claim to solve scene-wide performance. No material loss of interactivity was observed on this desktop; no physical-phone FPS claim is made.

## Validation

- 47/47 focused frontend tests across six Human Explorer/anatomy/lifecycle/visual suites.
- TypeScript project build: PASS.
- ESLint on changed TS/TSX and review script: PASS.
- Production Vite build: PASS; existing chunk-size warnings remain.
- Real browser BODY → ORGAN → TISSUE → CELL reaches matching canonical UI/runtime levels and IDLE; GHOST works.
- 11 after screenshot scenarios PASS; horizontal overflow false in all; pairwise overlap checks PASS for heading, modes, path, primary action, open inspector and mobile bottom navigation.
- No uncaught page errors in either before/after run. This is not a claim of a repository-wide console/API audit.
- Full metrics, timing samples and layout rectangles: `artifacts/human-visual-ceiling/{before,after}/report.json`.

Reproduce with Vite serving the appropriate checkout and `BASE_URL` set, then `node scripts/human-visual-ceiling-review.mjs before` or `after`. `CHROMIUM_PATH` is optional. The script uses real existing canonical execution; it does not mock successful results.

## Review and next step

Review the screenshots before integrating. Recommend transferring the **world-first hierarchy, compact path and optional inspector pattern** to CERN first, then SW-4. Chemistry should wait for the current Chemistry Live Lab branch and be adapted to its actual procedure. Do not transfer the exact camera geometry or apply expensive effects globally.

Stop further Human Explorer polish at this point. The next convincing quality improvement requires an anatomical heart/body asset and a real mobile LOD, not more credit spent on glow effects.
