# Human Explorer — second bounded visual pass

Branch: `astra/human-explorer-visual-ceiling`. Original base: `e01e6950d941af95195d9e349ee053ad1538cc35`. Previous prototype commit: `7740f886a61f64a8cac2e11fe0f22d421af3f45a`.

## What was already there

The original base already had a large 3D scene, the current body asset, procedural organ/tissue/cell presentations, PBR/light/post-processing, macro-to-micro commands, Hyperscope, cutaway, isolation, surface modes and research/Evidence controls. This work does not claim to create those capabilities. The first pass moved controls into an optional inspector and adjusted camera framing. This second pass reorganizes the same controls and adds a contextual-disclosure pattern. Neither pass makes the anatomy medically accurate.

## New in this pass

- Four explicit tool tabs: **Odkrywaj / Mikroskop / Przekrój / Badania**. Arrow-key navigation and selected states; one scrollable inspector, opened explicitly.
- Searchable existing organ list; expandable existing system list. No automatic giant list when the subject is selected.
- Magnification readout from the real current session; depth slider shows current normalized model percentage and axis/side. No physical-depth claim.
- A small projected subject **information marker**: mouse hover/focus previews, click pins; touch opens a compact bottom peek. Name, system, scale, illustrative-model label and one expansion action. Outside pointer and Escape dismiss. This is not per-anatomical-organ mesh hover or an anatomical explode implementation.
- Presentation-only bounds come from visible mesh bounds in the existing renderer; the card avoids the subject in the verified body/organ scenarios. The marker does not replace existing canvas organ picking.
- Existing microscopy apparatus: restrained luminous ring, ceramic housing against dark worktop/stage, slightly clearer base/head proportions, one small focus wheel. Existing geometry/material kit; no new renderer, textures, lights, effects or scientific functionality.

## Retained feature matrix

| Existing function | Location now | Verification |
|---|---|---|
| Body → organ → tissue → cell | Always-visible four-step path | Real canonical runtime transitions reach IDLE and matching levels |
| Other supported scales / disabled unsupported atom | Odkrywaj | Original scale ladder retained |
| Systems and organs | Odkrywaj; search plus two selectors | Search uses actual manifest labels; original commands retained |
| Hyperscope 1×, 5×, 25×, 100×, 500×, 1000× | Mikroskop | All six buttons visible; original magnification commands retained |
| Microscope field / sealed capture | Mikroskop | Original artifact canvas and session readout |
| Cutaway / three axes / flip / depth | Przekrój | Browser clicks each axis, flips, sets depth to 65%, checks readout |
| Isolate / show all | Przekrój | Browser toggles both states |
| Skin / transparency / model RTG / GHOST | Przekrój; three shortcuts remain outside | All four original modes selected and checked |
| Twin/agent camera | Przekrój | Original toggle retained |
| Histology / imaging / neuro | Badania | Existing quick actions visible/reachable, not reimplemented |
| ORPHEUS | Badania, original Test V3 command and free-form canonical command | Existing route preserved; this pass does not claim a new ORPHEUS run |
| Scientific explanation / provenance / limitations | Badania | Existing organ card/session inspector unchanged |
| Evidence / replay / detailed status | Badania | Existing controls passed through; no logic changes |

## Validation and artifacts

`scripts/human-instruments-review.mjs` runs real Edge/Chromium against the local checkout. It verifies desktop 1440×900 and touch/mobile 375×812, 390×844, 430×932: no horizontal overflow, no overlap between visible primary HUD regions and bottom navigation, explicit inspector scrolling, retained-control actions, small peek coverage ≤35% of viewport height, and non-overlap with the projected subject bounding rectangle. The full inspector is deliberately larger and only opens explicitly.

- Before (exact original base): `artifacts/human-visual-ceiling/before/`.
- First pass: `artifacts/human-visual-ceiling/after/`.
- Second-pass screenshots/metrics: `artifacts/human-visual-ceiling/instruments/` (24 captures).
- Enlarged-organ context checks: `artifacts/human-visual-ceiling/context/`.
- Focused existing tests: 47/47 across six Human Explorer / lifecycle / asset / visual suites.
- TypeScript and changed-file ESLint checked. Browser captures use existing runtime outputs, no mocked success.
- All 28 captured scenarios passed; zero uncaught browser errors. Body and enlarged-organ peek occupy **15–17%** of mobile viewport height (desktop ~19%), below the 35% cap, with no measured subject overlap. Desktop mouse-hover dismissal also passed. Keyboard focus uses the same disclosure handler; physical Safari/iPhone is not claimed tested.
- Production Vite build passed (existing chunk-size and mixed-import warnings remain).

## Performance: first pass → second pass

Measured with the existing renderer diagnostics on local desktop Chromium, not a physical phone benchmark. Visible geometry/culling varies slightly with the live scene. The small microscopy change adds one mesh and reduces ring subdivisions; no post-processing was added.

| View | Draw calls | Triangles | Median sampled FPS |
|---|---:|---:|---:|
| Desktop body | 1167 → 1169 | 432403 → 430739 | 59.9 → 59.9 |
| Desktop organ | 1149 → 1155 | 556757 → 555141 | 60.2 → 59.9 |
| Desktop tissue | 1807 → 1817 | 915497 → 913909 | 59.5 → 59.9 |
| Desktop cell | 1318 → 1320 | 621313 → 619649 | 59.9 → 59.9 |
| Mobile 375 / 390 body | 517 → 517 | 53727 → 53279 | ~59.9 → ~60 |
| Mobile 430 body | 516 → 516 | 53679 → 53231 | 59.9 → 60.2 |

Actual rendering DPR remains 1; estimated scene textures remain 50.7 MiB (not total GPU memory). Desktop ACES/GTAO/bloom/SMAA and mobile LOW gates unchanged; DOF/SSR remain off. ~1800 calls in tissue is still a performance limitation, not solved by this UI pass. The original-base comparison remains in `HUMAN_VISUAL_CEILING_REVIEW.md`.

## Honest visual assessment

Keep the previous desktop **51/100**, not a new inflated visual score: composition 16/20, lighting 10/20, materials 7/20, asset richness 4/20, camera/presentation/UX 14/20. The tools are easier to find and operate, but that does not materially improve anatomical realism. Mobile remains **40/100** because LOW still shows the procedural body proxy. Current-asset ceiling remains approximately **60–64/100**; **75–85/100** with suitable anatomy/environment assets is a conditional planning estimate, not a guarantee.

## ASSET_CEILING_REACHED

The exact requested target — unclothed anatomical person, separately selectable anatomically accurate liver/heart/other organs, adjacent-organ spatial relations, vessels/blood, accurate tissue — is **not delivered by these assets**. The current desktop outer-form asset is clothed MPFB; LOW uses a capsule-style rig; organ proxies are atlas ellipsoids. A realistic anatomical explode or surrounding-organ view cannot be truthfully created by styling them.

Required next asset package: licensed and redistribution-approved segmented human anatomy with shared coordinates and stable organ IDs; separate skin, organs and vessels; reference scale and tissue metadata; PBR textures and practical desktop/mobile LODs. No asset purchased or downloaded here. BodyParts3D or a premium package would need a separate license/source/coverage audit before adoption; neither is claimed integrated.

Existing integration seams (future work, untouched here):

- `core/three/humanTwinAsset.ts`: existing approved-asset loader; current runtime `/assets/genesis-hf/characters/mpfb-lod0.glb`.
- `core/three/assetGovernance.ts`: license/checksum/provenance admission.
- `core/three/biologyLabKit.ts`: `createTwinProxy`, body asset binding, per-organ `userData.nodeId` / `assetSlot`, isolation and clipping.
- `core/three/agentLabScene3D.ts`: existing raycast picking / camera; the new bounds method is presentation-only.
- `core/three/humanMacroMicroLayer.ts`: current enlarged schematic subjects, not a detailed anatomical mesh library.
- Existing manifest IDs/slots in `core/scientificWorlds/humanLab/anatomyAtlas.ts` must be mapped and reviewed, not silently overwritten to fit an asset.

Stop further superficial anatomy polish. Review these interactions separately from the missing anatomy content. Transfer the compact disclosure pattern only after the Human controls are accepted; no CERN, SW-4, Chemistry, deployment or backend change belongs to this branch.
