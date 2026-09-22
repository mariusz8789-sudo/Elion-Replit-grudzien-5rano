# Genesis V6 / V6.1 / V7 capability evidence ledger

Audit date: 2026-09-22. This is a **non-production acceptance ledger**, updated by independently reading the execution reports in `artifacts/human-twin-review`, reviewing their browser drivers and focused tests, and visually inspecting the screenshots. The document author did not rerun the executor's tests or browser. Final frontend, core and CSRN results and the explicitly limited backend run are recorded below; the main executor owns the final build report. Earlier handoff claims are not substituted for fresh evidence.

## Scope and scoring rules

The exact 50 identifiers below come from `D141-handoff-v6-v61-v7.zip`, member `D141-handoff-v6-v61-v7/new-files/packages/frontend/src/core/visualStages/capabilityReport.ts`. The ZIP remains a reference; this ledger does not install or bind `core/visualStages/**` to production.

That source declares statuses `NOT_IMPLEMENTED`, `STRUCTURAL`, `UNIT_VERIFIED`, `E2E_VERIFIED`, `REAL_BROWSER_VERIFIED`. It validates 50 unique entries, calculates the fraction at E2E-or-higher, and sets `TRANSFER_SCOPE_98_E2E` at 98%. Its differently named `REAL_REPO_VISUAL_COMPLETE` accepts E2E-or-higher for 49 entries and requires real-browser status only for `REAL_BROWSER_CANONICAL_CAPTURE`. It does **not** define detailed per-ID acceptance criteria, establish that evidence strings are genuine, or prove every feature was used by production.

For this task the user's stricter acceptance applies: canonical generated rooms, real UI/runtime macro-to-micro navigation, real organ picking/Hyperscope, measured loader readiness, and truthful provenance. The required proof in each row below is an operational interpretation of that request, not text claimed to exist in the transfer specification. Distinguish two fields when completing the ledger:

- **Execution level:** the actual level supported by files/logs, using the source status vocabulary. Until any execution evidence has been examined, use the ledger marker `NOT_VERIFIED` (not a new production enum).
- **Acceptance outcome:** `PASS`, `PARTIAL`, `BLOCKED`, `FAIL` or `NOT_VERIFIED` against the row's scope. PARTIAL means useful evidence exists but the full stated acceptance is not supported. A unit-pass does not imply browser-pass. `N/A` can explain an architectural absence but cannot increase the numerator or shrink the original denominator.

Reviewed score: **33 PASS / 16 PARTIAL / 1 BLOCKED = 33/50 (66%)** under the strict scope in this ledger. `REAL_REPO_V6_V61_V7_100_E2E = false`. This does not mean only 66% of Genesis works or that visual quality is 66% of the references. It counts exactly these acceptance requirements. It is not directly comparable to the handoff's 38/50 Node-or-stronger classification. Partial Node, browser or visual evidence is retained below without upgrading it to the row's full required level. Matrix and loader checks are additional gates, not extra capability rows.

Every evidence record needs run ID/time, branch and HEAD plus working-tree diff identity, command, route/input seed, result, log/artifact path, and the specific assertion supported. For browser evidence also record Chromium executable/version, OS/GPU or software renderer, viewport, console/network errors and screenshots. For evidence hashes record the actual canonical ledger record ID and provenance. A screenshot filename without examination of its contents and associated runtime state is insufficient.

## Source map

Paths in this table are relative to `packages/frontend/src/` except entries beginning with `scripts/`.

| Key | Current canonical code to inspect/run |
| --- | --- |
| ROOMS | `core/worldModel/ecs/geometry.ts`; `core/worldModel/generation/geometry/interiorGenerator.ts` |
| INTERIOR | `core/temporalCinematic/scientificInteriorVisuals.ts`; `core/temporalCinematic/temporalCinematicVisualResolver.ts` |
| WORLD | `core/worldModel/temporal/temporalEngine.ts`; `core/worldModel/bridge/worldFrameState.ts`; `core/three/graphics/worldFrameRenderer.ts` |
| TEMPORAL | `core/temporalCinematic/temporalCinematicSim3D.ts`; `components/visual-simulation/TemporalCinematicScreen.tsx` |
| CAMERA | `core/temporalCinematic/cameraPath.ts`; `core/temporalCinematic/cinematicShotDirector.ts`; `core/three/graphics/cinematicCamera.ts` |
| POST | `core/three/graphics/postProcessing.ts` |
| CAPTURE | `core/lookingGlass/capture/canonicalBrowserFrameRenderer.node.ts`; `core/lookingGlass/capture/canonicalTemporalCapture.node.ts`; `core/lookingGlass/capture/canonicalVideoEncoder.node.ts` |
| ATLAS | `core/scientificWorlds/humanLab/anatomyAtlas.ts`; `core/scientificWorlds/humanLab/types.ts` |
| HUMAN | `core/three/humanTwinAsset.ts`; `core/three/humanMacroMicroLayer.ts`; `core/three/biologyLabKit.ts`; `core/scientificWorlds/biologyLabWorld.ts` |
| EXPLORER | `components/HumanExplorerPanel.tsx`; `core/scientificWorlds/humanExplorer.ts` |
| BIOLOGY | `core/scientificWorlds/biologyRunners.ts`; `core/scientificWorlds/humanLab/histology.ts`; `core/scientificWorlds/humanLab/hyperscope.ts`; `core/scientificWorlds/humanLab/virtualMicroscope.ts` |
| GOVERNANCE | `core/three/assetGovernance.ts`; ATLAS representation provenance; existing canonical Evidence Ledger and the runtime evidence sink (trace actual imports/emission per run) |
| REPLAY | `core/lookingGlass/worldModelReplay.ts`; `__tests__/worldModelReplayDeterminism.test.ts`; `__tests__/fingerprintClockIndependence.test.ts` |
| BROWSER_SCRIPT | repository-root `scripts/visual-e2e-v52-v7.mjs`; `scripts/temporal-cinematic-e2e-capture.mjs` |

In the following tables, **B** requires a real Chromium path through the production runtime plus any supporting focused tests. **C** requires canonical integration/replay execution, without substituting transfer fixtures; add browser proof where stated. Evidence keys below identify the actual reviewed files. PASS for spectrometer/materials/compute means the requested generated visual chain; it expressly does not certify a solver binding or real instrument measurement.

## Reviewed evidence snapshot

Baseline snapshot: branch `claude/genesis-c1-visual-integration`, HEAD `d48edeb0ef9b403c253806c935c41d49096a86fa`, with the implementation working tree recorded in `artifacts/human-twin-review/source-snapshot.json`. Final integration and verification moved to `codex/genesis-final-integration` and selectively consumed Claude commit `0bd129bc847239f3f2b20c75c60b7a6e97f3b2d7`; the current deploy report and `final-verification.json` supersede this baseline identity while retaining it for provenance.

All report paths below are under `artifacts/human-twin-review/`. Chromium reports identify version **153.0.4234.48** and the local Genesis base `http://127.0.0.1:5000`. The drivers use real Chromium and production UI/runtime. GPU driver details are not present in the earlier M/S JSON; do not invent them. Desktop images are 1440×900; Matrix mobile is 390×844.

| Key | Actual evidence reviewed | Result and boundary |
| --- | --- | --- |
| L | `browser-loads.json`; `scripts/human-twin-browser-e2e.mjs loads`; `after-body.png` | 10/10 READY + LICENSED_CC0_ASSET + non-null actual first-render timestamp; HTTP 200 and no recorded errors. Five cold runs each use a new Chromium process and empty context, not a purged OS filesystem cache. Cold wall times 13.208–14.543 s; repeat reloads 3.294–3.938 s. |
| R | `browser-recovery.json`; browser driver recovery mode | 2/2: deliberately injected HTTP 503 shows ERROR/PROXY, explicit retry returns READY full model; navigation away during held fetch then return succeeds. This is intentional error injection, not a claim that the server spontaneously produced 503. |
| M | `browser-macro.json`; browser driver macro mode; seven `macro-*.png` images | All seven stages complete with zero recorded errors; real `page.mouse.click` raycast gives `lastPickedNode='heart'`; four production UI replay actions produce MATCH for tissue/cell/organelle/molecule. Replay verdicts are recorded, but full canonical ledger exports are not. |
| S | `browser-surfaces.json`; `scripts/genesis-visual-surfaces-e2e.mjs`; Matrix, materials and street PNGs | 5/5 surfaces: animated desktop/mobile Matrix, static reduced motion, generated MATERIALS_LAB with three rendered slot types, street. Three canonical time seeks each for materials/street have different real image hashes. No instrument click or room-walking assertion is made. |
| T-V6 | Final `full-vitest-release-check.json` entries for `scientificInteriorVisuals.test.ts` (4 passed), `temporalCinematicEngine.test.ts` (19), `temporalCinematicVisualResolver.test.ts` (6), plus reviewed source | Real canonical generation, slot/mesh footprint/aisle assertions, world invariants and independent graph fingerprint comparison. These remain Node tests. The agent's earlier focused aggregate of 28 is not added to full-suite totals. |
| T-V7 | Same JSON: `humanExplorerRuntime.test.ts` (7), `humanExplorer.test.ts` (12), `humanMacroMicroLayer.test.ts` (2), plus reviewed source | Semantic system edges, honest metadata, sealed prerequisite reuse, consecutive same-station sessions, real controller/runner ladder at 60/10/5 Hz, session replay. Earlier focused aggregate 34 is overlapping coverage, not extra tests. |
| T-LOADER | Same final JSON: `humanTwinAsset.test.ts` (16), `humanTwinLoading.test.ts` (10), `humanTwinSceneLifecycle.test.ts` (4), all passed | 30 total registry/fallback/result/loading/lifecycle assertions confirmed directly in final JSON; L/R establish actual browser behavior. |
| T-CAMERA | Same JSON: `cinematicShotDirector.test.ts` (2 passed); actual S driver | Deterministic shot parameters and real canonical frames; not an independent DOF/FOV/exposure sweep. |
| T-REPLAY | Same JSON: `worldModelReplayDeterminism.test.ts` (6), `fingerprintClockIndependence.test.ts` (7), plus M UI replay | Canonical deterministic tests and four sealed session replays, without claiming identical GPU image bytes across machines. |

Reviewed JSON SHA-256 identities (a later rerun replacing a file requires another review):

- L: `32e219732b7bc9e85626efe3db065abe25ba0f708d7c828f6ea9146a6be4ca20`.
- M: `6e1bf6a57efa3b8e8cf73464ced52c73ab986159f2d29af97b7b0b520f2e9523` (final reviewed rerun written 2026-09-22 00:22:45 +02:00).
- S: `8194ded88dcfe4657849bd24972e97bb128dcc2d13abd6ec089b4c0f6fedd8ef`.

Final M timing records show BODY 12.315 s, ORGAN_SYSTEM 9.360 s, ORGAN 3.272 s, TISSUE 14.360 s, CELL 7.184 s, ORGANELLE 4.145 s and MOLECULE 8.216 s wall time for the respective UI commands. An earlier successful run recorded cell 8.224 s, organelle 4.174 s and molecule 8.294 s; both are execution observations, not timing guarantees. The biology clock owner is **AgentController**, and TemporalEngine advances are **0**, accurately recorded rather than fabricated. Steady samples are around 60 FPS with roughly 0.016–0.017 s deltas; first rendering can take seconds, so one instantaneous FPS value is not a full-frame throughput summary. State-machine samples expose target, waypoints, timer and transition condition. They prove the corrected path now completes; the historical sandbox timeout cannot be assigned solely to the 0.05 s clamp from this new run.

Visual inspection covered `before-body.png`, `after-body.png`, every macro PNG, materials at t=0, street at t=0 and all three Matrix modes. The full outer-body asset appears consistently, floor glare is reduced and the side panel is readable. Remaining defects are visible: overbright head in translucent organ/system modes, simple ellipsoid/capsule anatomy, sparse materials-room equipment/material detail, heavily fogged street with a dark frame-edge area, and labels/objects obscured by HUD panels. These are working visual demonstrations, not a match to the target concept images or scientific-fidelity certification.

## Exact 50-capability matrix

### V6 — rooms and instruments (20)

| # | Exact capability ID | Required proof and acceptance boundary | Source mapping / static observation | Execution / evidence |
| --- | --- | --- | --- | --- |
| 1 | `V6_ROOM_SPEC` | C: generated room has canonical kind, dimensions, units, stable identity and validated bounds. | ROOMS; `MATERIALS_LAB` present in RoomType. | **PASS** — C / generated spec and invariants: T-V6. |
| 2 | `V6_ROOM_COMPILER` | B: real generator produces ROOM consumed by the canonical visual resolver and rendered room shell; record entity ID. | ROOMS → INTERIOR → WORLD; hand-created test ROOM does not suffice. | **PASS** — B / S materials room from canonical Vienna generation, actual renderer mesh IDs. |
| 3 | `V6_ASSET_SLOTS` | B: generated ASSET_SLOT entities keep room relationship/type and appear through WorldFrameRenderer. | ROOMS, INTERIOR, WORLD; inspect current generator output. | **PASS** — B / S three generated ASSET_SLOT IDs, all rendered=true. |
| 4 | `V6_INSTRUMENT_PLACEMENT` | C+B: slot positions/footprints remain within actual generated room; visually confirm no intersection, unusable orientation or clipping. | ROOMS scientificSlots and INTERIOR instrument geometry. | **PASS** — C+B / T-V6 full mesh footprints in bounds, disjoint; S images inspected. |
| 5 | `V6_WALKABLE_LAYOUT` | C+B: validate full equipment footprint and central/entry clearance in generated rooms, then traverse actual room. | ROOMS positions seek to preserve corridor; center spacing alone is not clearance proof. | **PARTIAL** — C / T-V6 1.2 m entry aisle clear; no browser traversal, cinematic camera only. |
| 6 | `V6_LIGHTING_PROFILE` | B: actual room profile lights/material response rendered with readable equipment, no blown highlights; record pipeline parameters. | TEMPORAL, POST and INTERIOR; static config alone insufficient. | **PARTIAL** — B / S room rendered; sparse/flat presentation and bright table surfaces remain, no calibrated lighting acceptance. |
| 7 | `V6_INTERACTION_TARGETS` | B: click intended instrument target through UI, canonical entity selection/command and resulting state must agree. | ROOMS ASSET_SLOT plus production picker/command route must be traced; visible mesh alone insufficient. | **PASS** — B / `director-meta-mirror-browser.json`: the real canvas projects three generated slot targets; a pointer click selects the generated COMPUTE_STATION, produces canonical `INSPECT_ENTITY`, and exposes the corresponding Evidence hash. |
| 8 | `V6_MICROSCOPE` | B: real microscope station appears and accepted interaction reaches existing microscope runtime; record model/simulation status. | INTERIOR, BIOLOGY virtualMicroscope/histology. | **PASS** — B / M tissue+cell+organelle use canonical microscopy station and sealed MODEL artifact. |
| 9 | `V6_SPECTROMETER` | B: generated MATERIALS_LAB contains visible spectrometer target with honest instrument binding state; demonstrate interaction if claimed. | INTERIOR createSpectrometer has `instrumentState='UNBOUND'`. Visual proof cannot imply measured spectra or solver integration. | **PASS** — B visual scope / S generated spectrometer rendered; instrument remains UNBOUND, no spectroscopy claim. |
| 10 | `V6_MATERIALS_STATION` | B: canonical MATERIALS_LAB generation → ROOM → ASSET_SLOT → spectrometer and thermal-stage visuals. | ROOMS scientificSlots, INTERIOR; thermal-stage `UNBOUND`. Do not manually insert test room as sole proof. | **PASS** — B visual scope / S generated MATERIALS_LAB spectrometer+thermal-stage; both unbound models. |
| 11 | `V6_BIOLOGY_STATION` | B: production biology station loads and normal UI reaches the existing experiment session with artifact/evidence. | HUMAN, BIOLOGY and generated-room integration where claimed. | **PASS** — B / M biology UI completes canonical histology/Hyperscope/central-dogma sessions. |
| 12 | `V6_COMPUTE_STATION` | B: real room generator produces COMPUTE_STATION slot consumed by existing scientific-interior renderer; verify actual target. | ROOMS supports slot; INTERIOR createComputeStation has `computeBinding='UNBOUND'`. No claim of computational results from monitor geometry. | **PASS** — B visual scope / S COMPUTE_STATION generated slot rendered; computeBinding=UNBOUND, no solver claim. |
| 13 | `V6_PROVENANCE` | C: geometry/assets/room generation keep source/license/version/hash and explicitly procedural vs measured labels, through emitted records. | GOVERNANCE, ROOMS; registry declaration alone is not hash validation. | **PARTIAL** — C / source registry and generated identities exist; room-asset provenance emitted through real ledger not captured. |
| 14 | `V6_EVIDENCE` | C+B: normal room/instrument production action emits record through canonical ledger; verify actual ID/hash/source link. | GOVERNANCE; direct sink.addRecord in a test is not proof of runtime emission. | **PASS** — C+B / World Director emits the generated-world record; the subsequent real canvas selection emits an `INSPECT_ENTITY` record for the exact generated slot through the canonical ledger. Browser assertions reject a missing hash. |
| 15 | `V6_DETERMINISM` | C: two independently generated worlds with identical explicit inputs/seed yield matching relevant room/slot fingerprints; changed input discriminates. | ROOMS, WORLD, REPLAY; hashing same object twice does not suffice. | **PASS** — C / T-V6 independent generated graphs have equal canonical entity fingerprint; T-REPLAY covers determinism. |
| 16 | `V6_CANONICAL_WORLD_SEAM` | B: trace generated entity IDs from existing WorldGraph through TemporalEngine/frame adapter to existing renderer. | WORLD, INTERIOR, TEMPORAL; transfer FixtureVisualRuntime not admissible. | **PASS** — B / S generator ROOM+slots -> existing WorldGraph/frame bridge/WorldFrameRenderer, mesh presence checked. |
| 17 | `V6_MULTI_ROOM_KIND` | B: at least generated MATERIALS_LAB and required IMAGING/BIOLOGY room are actually reached/rendered, with types and IDs recorded. | ROOMS, INTERIOR, TEMPORAL room targeting; multiple hand-created Node groups insufficient. | **PARTIAL** — B / generated MATERIALS_LAB plus separate biology world; no fresh generated IMAGING/BIOLOGY room browser proof. |
| 18 | `V6_CAPABILITY_DRIVEN_ASSETS` | C+B: declared room/instrument capability controls supported slot/visual availability and discloses unavailable binding; no fabricated results. | ROOMS, INTERIOR, GOVERNANCE; prove dispatch rather than enumerating hardcoded type names. | **PARTIAL** — C+B / room/slot type dispatcher rendered; capability-driven availability/functional binding gate not exercised. |
| 19 | `V6_ENTITY_LABELS` | B: visible/selectable label corresponds to actual entity/type, remains readable, no labels for nonexistent experiment results. | INTERIOR, TEMPORAL UI and runtime target mapping. | **PARTIAL** — B / scientific room equipment visible, but generated instrument label/selection correspondence not exercised. |
| 20 | `V6_REAL_SCALE_GEOMETRY_CONTRACT` | C+B: validate metre units, transforms, room bounds and equipment dimensions through adapter/renderer; capture reference scale. | ROOMS, WORLD, INTERIOR; illustrative dimensions are not device specifications. | **PASS** — C+B / T-V6 actual mesh bounds/metre footprint; S generated scale rendered, dimensions remain illustrative. |

### V6.1 — camera and capture (12)

| # | Exact capability ID | Required proof and acceptance boundary | Source mapping / static observation | Execution / evidence |
| --- | --- | --- | --- | --- |
| 21 | `V61_CAMERA_KEYFRAMES` | C+B: world-derived path has evolving valid keyframes and real renderer uses them; record canonical world identity. | CAMERA buildWalkCameraPath, TEMPORAL. | **PASS** — C+B / T-CAMERA evolving world path; S rendered captures at 0, 1.5, 3 seconds. |
| 22 | `V61_CAMERA_INTERPOLATION` | C+B: evaluate between sample times and demonstrate continuous expected pose (position and view target), stable under seek/replay. | CAMERA `sampleCameraPath()` brackets keyframes and interpolates position/lookAt; TEMPORAL consumes it directly. | **PASS** — C+B / focused test checks an exact between-keyframe pose and clamped ends; Chromium captures at 0/1.5/3 s have distinct SHA-256 values through the production camera. |
| 23 | `V61_DOF` | B: real postprocessing focus/enable changes affect rendered output for appropriate shot, with readable comparison. | CAMERA → TEMPORAL setDepthOfFieldEnabled/setFocusDistance → POST; booleans alone not rendered DOF proof. | **PARTIAL** — C+B / director tests and real pipeline path; no rendered DOF enable/focus A/B proof. |
| 24 | `V61_EXPOSURE` | B: verify canonical tone-mapping/exposure contract with recorded settings and bounded highlights; document whether static or animated. | TEMPORAL currently configures static interior 1.0/street 1.08. Do not claim exposure keyframe animation. | **PARTIAL** — B / static exposure renders S; no dedicated exposure acceptance/animation, highlights remain. |
| 25 | `V61_FOV` | C+B: shot-dependent FOV reaches PerspectiveCamera projection matrix and rendered framing; finite safe values across boundaries. | CAMERA resolveCinematicShot, TEMPORAL applyCamera. | **PARTIAL** — C / T-CAMERA FOV changes; no captured runtime FOV/projection measurement alongside S frames. |
| 26 | `V61_CUT_RESET` | C+B: show a supported camera cut resets relevant persistent render history, or record architecture mismatch and keep unpassed. | POST inspected pipeline has no TAA/accumulation history. Snap-focus handling is distinct from accumulation reset. Do not invent redundant history architecture to satisfy count. | **BLOCKED** — No temporal accumulation/TAA history in reviewed pipeline; N/A not counted as PASS. |
| 27 | `V61_DISCONTINUITY_GUARD` | C+B: demonstrate canonical behavior after camera/time jump and absence of stale dependent output. Define actual state guarded. | TEMPORAL increments a continuity epoch and clears stale ASSET_SLOT selection/highlight on seek or loop wrap; camera/FOV/DOF are recomputed on the next real frame. | **PASS** — C+B / focused test verifies seek epoch/reason; Chromium captures record two guarded seeks. `temporalAccumulation=NOT_PRESENT` keeps CUT_RESET separate and honest. |
| 28 | `V61_FRAME_SEQUENCER` | C+B: existing canonical capture selects intended monotonic frame times and captures actual rendered frames in correct order. | CAPTURE captureCanonicalTemporalSequence; helper existence is not invocation evidence. | **PASS** — B / S seeks canonical bridge at three increasing times and waits actual rendered frames before screenshots. |
| 29 | `V61_CAPTURE_MANIFEST` | C+B: emitted manifest binds actual files/frame times/route/input versions and success/failures, not a planned list of frames. | CAPTURE, BROWSER_SCRIPT; examine real output manifest after run. | **PARTIAL** — B / S JSON lists frame time/file/SHA256 and room summary; no complete capture input/version manifest. |
| 30 | `V61_CAPTURE_FINGERPRINT` | C+B: reproducible semantic capture fingerprint over defined canonical inputs/times/state, and hashes of actual artifacts where promised. | CAPTURE, REPLAY, BROWSER_SCRIPT; GPU/image nondeterminism must be distinguished from semantic determinism. | **PARTIAL** — B / S real PNG hashes verified; independent semantic capture replay fingerprint not demonstrated. |
| 31 | `V61_EVIDENCE` | C+B: actual capture route creates canonical evidence/provenance linked to artifacts; no second ledger or test-only synthetic claim. | GOVERNANCE, CAPTURE and the production capture hook bind to `kernelLedger`; screenshot bytes are hashed before the record is added. | **PASS** — C+B / `browser-surfaces.json` contains six real screenshot SHA-256 values, six canonical Evidence content hashes and semantic fingerprints; browser assertions validate every record shape. |
| 32 | `REAL_BROWSER_CANONICAL_CAPTURE` | B mandatory: real Chromium/WebGL renders canonical world and human path, screenshots examined; human READY + LICENSED_CC0_ASSET + at least one actual rendered frame. | BROWSER_SCRIPT, TEMPORAL, HUMAN. Visible canvas/two animation callbacks alone do not establish licensed asset was submitted/drawn. | **PASS** — B / L+M+S real Chromium, asset READY+LICENSED_CC0_ASSET+render timestamp, examined screenshots. |

### V7 — human macro-to-micro (18)

| # | Exact capability ID | Required proof and acceptance boundary | Source mapping / static observation | Execution / evidence |
| --- | --- | --- | --- | --- |
| 33 | `V7_HUMAN_MANIFEST` | C+B: normal runtime uses single canonical manifest, node IDs and spatial/semantic relationships consistent with visible representation. | ATLAS, HUMAN, EXPLORER. Asset slot strings do not prove corresponding anatomy assets exist. | **PASS** — C+B / T-V7 canonical manifest/edges and M body/system/heart IDs in real UI/runtime. |
| 34 | `V7_BODY` | B: UI BODY stage with licensed full exterior after observed real asset frame; 5 cold + 5 repeat loader runs and scene lifecycle evidence. | HUMAN humanTwinAsset, EXPLORER; external-body mesh is not internal anatomy. | **PASS** — B / L 5 cold + 5 repeat all real rendered READY; R error retry/navigation recovery; body PNG inspected. |
| 35 | `V7_ORGAN_SYSTEM` | C+B: select actual semantic system → organ edge through UI while preserving spatial organ → region hierarchy. | ATLAS `SYSTEM_HAS_ORGAN`, organsInSystem/systemsForOrgan, EXPLORER. Declared primary membership is not exhaustive biology. | **PASS** — C+B / T-V7 typed SYSTEM_HAS_ORGAN keeps heart->thorax spatial parent; M cardiovascular->heart. |
| 36 | `V7_ORGAN` | B: normal UI selection reaches intended canonical organ, correct state/representation and artifact provenance. | ATLAS, HUMAN, EXPLORER; `getAnatomyNode('heart')` in Node alone is not picking/navigation. | **PASS** — B / M canonical heart selected and actual organ presentation seen; illustrative anatomy only. |
| 37 | `V7_TISSUE` | B: UI ORGAN → TISSUE produces actual existing histology artifact, presentation state and examined screenshot. | EXPLORER, BIOLOGY histology, HUMAN macro layer; MODEL/SIMULATED labels preserved. | **PASS** — B / M histology stage, MODEL artifact/hash text and inspected tissue PNG. |
| 38 | `V7_CELL` | B: actual TISSUE → CELL runtime transition and artifact complete; log wall/simulation time, FPS, deltas, advances and guard. | EXPLORER hyperscope-capture 100×, BIOLOGY, HUMAN, canonical animation/TemporalEngine. Increasing timeout alone not a fix. | **PASS** — B / M tissue->cell completes 8.224 s wall, sampled clock/state, real Hyperscope artifact and PNG. |
| 39 | `V7_ORGANELLE` | B: CELL → ORGANELLE through UI/Hyperscope, correct artifact and screenshot with provenance/epistemic label. | EXPLORER hyperscope-capture 500×, BIOLOGY, HUMAN. | **PASS** — B / M cell->organelle completes 4.174 s wall, Hyperscope 500x, inspected PNG. |
| 40 | `V7_MOLECULE` | B: ORGANELLE → MOLECULE through same production flow, correct molecule/experiment identity and screenshot. | EXPLORER, BIOLOGY central-dogma/molecular artifact, HUMAN. Bead geometry alone not verified chemistry. | **PASS** — B / M molecule completes 8.294 s wall, central-dogma MODEL artifact, inspected PNG. |
| 41 | `V7_ORGAN_PICKING` | B: real screen-coordinate hit passes through runtime picker/raycast to correct canonical organ/selection; include miss/occlusion handling. | HUMAN production picker and EXPLORER state; dropdown or Node ID lookup cannot substitute for geometric picking. | **PARTIAL** — B positive case / M real canvas mouse raycast selects heart; no dedicated miss/occlusion coverage. |
| 42 | `V7_HYPERSCOPE` | B: controls initiate existing experiment/session, magnification/state transition, artifact, visible result and ledger evidence. | EXPLORER, BIOLOGY hyperscope and runner, HUMAN. No direct fabricated artifact injection. | **PASS** — B / M actual station experiment artifact, 100x/500x controls/state and replay MATCH; not microscopy measurement. |
| 43 | `V7_SCALE_MONOTONICITY` | C+B: explicit physical metadata valid across path; semantic system step may share body scale; display rescaling clearly distinguished. | ATLAS, HUMAN `visualScaleNotPhysical`, BIOLOGY. Geometry normalized for viewing cannot prove physical size. | **PARTIAL** — C / T-V7 monotone display ladder; physical metadata is illustrative, semantic system step and display rescaling not independently measured. |
| 44 | `V7_LOD` | C+B: actual representation/detail selection under runtime distance/quality changes with measured mesh/texture budget, correct identity and no lost interactions. | HUMAN uses the licensed GLB as FULL_ASSET and the existing procedural body as PROXY_LOW while sharing the one canonical organ map. AUTO considers camera mode/device tier; UI exposes explicit quality selection. | **PASS** — C+B / `browser-lod.json`: real runtime switches 83,686 triangles/7 textures ↔ 6,116/0, then restores FULL_ASSET while the same heart remains pickable and selected. |
| 45 | `V7_EPISTEMIC_LABELS` | C+B: visible/exported MODEL/SIMULATED labels retained every stage and never promoted to measured/clinical by styling. | ATLAS epistemic, BIOLOGY, EXPLORER, HUMAN. | **PASS** — C+B / M MODEL/non-observation labels preserved in inspected stages and sealed artifact output. |
| 46 | `V7_PROVENANCE` | C+B: each representation/artifact connects to real source/version/license or procedural model declaration, survives navigation/capture. | GOVERNANCE, ATLAS representation, BIOLOGY evidence. CC0 exterior does not license hypothetical internal organs. | **PARTIAL** — C+B / outer asset registry and procedural atlas source verified; complete per-artifact provenance export not reviewed. |
| 47 | `V7_CONFIDENCE` | C+B: typed confidence metadata has justified source/calibration or explicit UNKNOWN reason; shown/exported honestly, never medical-truth probability. | ATLAS currently UNKNOWN with procedural reason. This can satisfy honest metadata handling, not a numeric-confidence claim. | **PASS** — C+B / T-V7 unknown-no-value test and visible UNKNOWN; no calibrated numeric confidence claimed. |
| 48 | `V7_RESOLUTION_METADATA` | C+B: typed resolution has actual acquisition/model source or UNSPECIFIED reason; no conversion of magnification/polygon size into scientific resolution. | ATLAS currently UNSPECIFIED. Required evidence is truthful propagation, not invented nanometre resolution. | **PASS** — C+B / T-V7 unspecified-no-metres test and visible UNSPECIFIED; Hyperscope display factors are model parameters, not acquisition resolution. |
| 49 | `V7_EVIDENCE` | C+B: every accepted normal-runtime stage emits actual canonical ledger records, linked hashes and provenance; no second sink architecture. | BIOLOGY, EXPLORER, GOVERNANCE; direct test `addRecord` is insufficient. | **PARTIAL** — B / M four sealed session hashes/replay receipts; no exported canonical ledger records for every level (body/system/organ included). |
| 50 | `V7_DETERMINISTIC_REPLAY` | C+B: independent replay with explicit stable IDs/seed/commands produces equal semantic artifact/evidence fingerprints through same production path. | BIOLOGY, ATLAS, REPLAY, EXPLORER; exclude wall-clock/generated defaults deliberately, don't compare only trivial selected fields. | **PARTIAL** — B+C / M UI replay MATCH for four sealed sessions, T-V7 canonical replay; no independent full-path browser replay with compared exported fingerprints. |

## Why the handoff's counts are not current acceptance

- The standalone ZIP test supplies `E2E_VERIFIED` to 49 rows with a common evidence string and uses its own `FixtureVisualRuntime`. The resulting 98% is a statement about that fixture package, not canonical browser coverage. No browser can be inferred from the name of a test.
- The ZIP's `visualStagesGenesisE2E.test.ts` manually builds a WorldGraph room and constructs Three objects in Node with a canvas stub. It exercises selected real classes but does not demonstrate the real room generator, WebGL rendering or real user interactions. Looking up the heart node is not raycast organ picking. Calling runner functions directly is not UI-driven macro-to-micro navigation.
- The Node test manually adds evidence records, including a confidence value of 1. That does not calibrate scientific confidence or prove normal runtime emitted the same evidence. Preserve its useful structural coverage without promoting its claims.
- Some compared fingerprints in the Node test cover reconstructed summaries or limited artifact fields. State the covered scope; do not call them whole-browser replay verification.
- The supplied report describes historical street/interior and organ/tissue screenshots, with later biology stages incomplete. Treat this as reported historical context until actual artifacts are examined against an identified working tree. The statement that a timeout was pre-existing does not establish that cause without comparative measurements.

## Specific scientific and architectural limits to retain

1. **Generated equipment may be unbound.** Current instrument/compute visual `UNBOUND` state is an honest boundary. Prove the user-requested generated visual chain, and separately report whether any functional station/solver interaction exists. An illuminated screen does not count as a scientific result.
2. **No observed temporal accumulation history.** Current postprocessing has render/AO/bloom/DOF/reflection/anti-aliasing/output passes; composer ping-pong targets alone are not TAA/accumulated frame history. Do not report cut-reset and history-guard as passed merely because there is nothing to reset. No second renderer should be introduced just to make an inherited checklist fit.
3. **Camera interpolation needs a direct check.** The street renderer chooses its nearest keyframe at audit time. A dense sequence can look smooth at particular sample times yet jump between them. Camera drift is not keyframe interpolation.
4. **Anatomical relationships are not model fidelity.** The current atlas has ten named organs and twelve system nodes with primary-membership edges. Procedural ellipsoids/capsules, illustrative dimensions and a dressed outer-body asset do not provide detailed muscles, vessels, nerves, histology or patient-specific anatomy.
5. **Source-dependent metadata can stay unknown.** UNKNOWN confidence and UNSPECIFIED resolution meet the user's prohibition on invented numbers when properly propagated. They must never be presented as calibrated confidence or measured resolution.
6. **Scale and magnification are different.** `HumanMacroMicroLayer` marks display scale as nonphysical. Enlarging a cell to fill a room does not give a physical-scale contract; changing Hyperscope magnification does not change source resolution.
7. **Canonical IDs/replay must be explicit.** The anatomy manifest's optional default twin ID depends on `Date.now()`. Determinism tests should supply explicit IDs and explain included/excluded fields rather than silently hiding nondeterministic data.
8. **Reachability is a separate check.** Module reachability documents imported/allowed orphan modules. It does not by itself prove a single active renderer, one world graph, canonical evidence emission or absence of duplicated runtime ownership. `npm run audit:verify` also must not be renamed a universal architecture audit without reviewing what it actually checks.

## Verification commands from actual local configuration

Commands below are instructions for the implementation executor, **not executed results**. Run from the repository root with the already installed lockfile dependencies and Node >=22.5.0. No dependency upgrades or downloads are needed to invoke the installed scripts. Retain individual exit codes/logs; do not let an early failure hide unexecuted stages.

Frontend focused tests (extend with newly implemented lifecycle/generator tests as they are added):

```powershell
npm run test --workspace=packages/frontend -- src/__tests__/humanTwinAsset.test.ts src/__tests__/humanExplorerRuntime.test.ts src/__tests__/humanExplorer.test.ts src/__tests__/humanMacroMicroLayer.test.ts src/__tests__/scientificInteriorVisuals.test.ts src/__tests__/cinematicShotDirector.test.ts
npm run test --workspace=packages/frontend -- src/__tests__/worldModelReplayDeterminism.test.ts src/__tests__/fingerprintClockIndependence.test.ts
npm run test --workspace=packages/frontend -- src/__tests__/moduleReachability.test.ts
node node_modules/typescript/bin/tsc --noEmit -p packages/frontend/tsconfig.json
npm run lint
```

Full suites, split so frontend Vitest is not confused with the complete monorepo:

```powershell
npm run test --workspace=packages/frontend
npm run test --workspace=packages/backend
npm run test:core
npm run csrn:test
npm run build
npm run csrn:build
```

Root `npm test` runs frontend Vitest, backend Node tests, then `test:core`, but **does not run CSRN tests**. `vitest.core.config.ts` includes tests from `packages/core/src`, `packages/ui/src` and `packages/e2e/src`, using the Node environment. The frontend `test` script is `vitest run`; the backend is `node --test src/*.test.mjs`; CSRN also has `vitest run`. Root production `build` delegates to frontend `tsc -b && vite build`, not all workspace builds. These distinctions belong in final counts.

For machine-readable skipped-test and failure evidence, add Vitest reporters and use an executor-chosen existing artifact directory. Example relative locations below differ because workspace scripts run from their workspace:

```powershell
npm run test --workspace=packages/frontend -- --reporter=default --reporter=json --outputFile=../../artifacts/genesis-verification/frontend-vitest.json
npm run test:core -- --reporter=default --reporter=json --outputFile=artifacts/genesis-verification/core-vitest.json
npm run csrn:test -- --reporter=default --reporter=json --outputFile=../../artifacts/genesis-verification/csrn-vitest.json
```

Use either ordinary full-suite invocation or its reporter-enabled variant, not both unless code changed or a failure requires it. The caller must create the artifact directory if necessary. Backend Node output should have its own saved log.

Real browser prerequisites/commands:

- Root `npm run dev:backend` is long-running `node --watch src/start.mjs`; root `npm run dev` runs frontend Vite on port 5000. After a production build, `npm run preview` runs Vite preview on port 5000. Frontend dev and preview proxy `/api` to port 8080. Check actual backend startup configuration/logs rather than presuming every scientific service is on that port.
- `node scripts/visual-e2e-v52-v7.mjs` is the existing browser driver. `E2E_BASE` defaults to `http://127.0.0.1:8181`, so set it to the actual running frontend URL, e.g. `$env:E2E_BASE = 'http://127.0.0.1:5000'`. Use the installed Playwright Chromium or verified existing `GENESIS_CHROMIUM_PATH`.
- That driver removes and recreates `artifacts/visual-e2e-v52-v7` at startup. Preserve a baseline in another intended artifact location before running it again. It must be extended/verified to cover all seven required levels, generated MATERIALS/COMPUTE rooms, real asset readiness, measured transition timing, organ picking and Hyperscope; its existing filename does not guarantee that coverage.
- Loader cold/repeat/lifecycle, Matrix dashboard interactions and reduced-motion acceptance are additional required checks. Record their actual driver/commands after implementation. Do not invent executable script names for tests that have not been written.

Architecture review should trace active ownership/call sites for WorldGraph, TemporalEngine, WorldFrameRenderer, Human Digital Twin, solver routing and the canonical ledger; review imports from any transfer package; and distinguish valid per-instance objects/test fixtures from parallel production architectures. Save both the scan command and reviewed conclusion. A textual count of class declarations alone is not a proof of runtime uniqueness.

## Exact conditional skipped test — confirmed in fresh JSON

Static source at `packages/frontend/src/__tests__/backendEvidenceExecution.test.ts:638` contains:

```typescript
it.runIf(process.env.GENESIS_REAL_BACKEND === '1')(
  'executes both PySCF H2 basis arms against the real local Fabric and produces a MATCH Evidence Pack',
  // ...
);
```

Without `GENESIS_REAL_BACKEND=1` it is conditionally skipped. It uses real fetch at `http://127.0.0.1:8092`, expects engine provenance `PySCF 2.14.0`, runs H2 RHF with `sto-3g` and `6-31g` bases, and checks independent repeat evidence fingerprints. It is not a human-loader/visual test. The real scientific Fabric/PySCF services must actually exist before enabling it. Do not mock them or replace expected provenance to eliminate the skip.

Historical `full-vitest-release-check.json` confirmed this exact single frontend skipped test at an earlier checkpoint: **6908 passed, 0 failed, 1 skipped; 621/621 files passed**. The final combined run supersedes its totals with **6973 passed, 0 failed, 1 skipped across 627/627 files**; the skipped test is unchanged.

Historical `broader-verification.json` records the recovery baseline and remains useful for failure provenance. Subsequent fixes and a complete controlled run supersede it: backend **849 passed, 0 failed, 33 skipped of 882**, core **465/465**, CSRN **38/38**. Optional-engine skips remain fail-closed; PySCF is the material environment blocker.

## Read-only duplicate-architecture audit

Scope: changed production imports/classes in `packages/frontend/src/core`, `components` and `hooks`; class/manifest declarations in `packages/frontend/src` and `packages/core/src`; Matrix App mounting; transfer-engine identifiers in those production source trees. Commands used (with the locally verified Git executable prepended to PATH by the executor):

```powershell
git diff --unified=0 -- packages/frontend/src/core packages/frontend/src/components packages/frontend/src/hooks
rg -n 'export class (WorldGraph|TemporalEngine|WorldFrameRenderer)|export function createHumanDigitalTwinManifest|export (const|class) kernelLedger' packages/frontend/src packages/core/src
rg -n 'visualStages|CanonicalVisualRuntimePort|FixtureVisualRuntime' packages/frontend/src packages/core/src
rg -n 'LiveMatrixBackground|new LiveMatrix' packages/frontend/src/components packages/frontend/src/App.tsx
```

Reviewed result: one canonical `WorldGraph` declaration (`worldModel/ecs/worldGraph.ts`), `TemporalEngine` (`worldModel/temporal/temporalEngine.ts`), `WorldFrameRenderer` (`three/graphics/worldFrameRenderer.ts`) and `createHumanDigitalTwinManifest` (`humanLab/anatomyAtlas.ts`) in the scanned scope. `kernelLedger` in `agent/cyberReasoningKernel.ts` remains an alias of the existing `clockworkLedger`. Added imports reuse canonical anatomy helpers, sealed `ExperimentSession` integrity and existing scene resource disposal. No newly added duplicate WorldGraph/TemporalEngine/WorldFrameRenderer class or construction was found in the reviewed changed production lines. No `visualStages`, `CanonicalVisualRuntimePort` or `FixtureVisualRuntime` references were found in the scanned production trees. Matrix retains one `LiveMatrixBackground` component, imported/mounted by App; the S browser checks verify exclusion from Human Explorer and temporal scenes.

Outcome: **no competing production visual engine introduced in the reviewed changes**. This is a scoped source/import/call-path review supported by browser entity mapping, not a formal theorem that the entire historical monorepo contains exactly one object instance of every architecture class. Multiple legitimate scenes can instantiate the same canonical renderer; tests use fixtures. SolverRouter ownership and every unrelated historical runtime were not dynamically instrumented by this audit. The passing module-reachability test is supporting evidence only.

## Execution handoff record — final reviewed test results

| Field | Current value |
| --- | --- |
| Branch / integration sources | `codex/genesis-final-integration`; base `d48edeb0ef9b403c253806c935c41d49096a86fa`; Claude source `0bd129bc847239f3f2b20c75c60b7a6e97f3b2d7` |
| Focused, lifecycle and replay test logs | Reviewed passing JSON entries T-V6/T-V7/T-LOADER/T-REPLAY; earlier aggregate counts overlap full-suite tests |
| Machine / Chromium / viewport | Executor confirms DESKTOP-7UAVGFS; Chromium 153.0.4234.48; desktop 1440×900/mobile 390×844; no GPU model invented |
| 5 cold / 5 repeat loads and navigation-away result | L 10/10; R 2/2, including retry and navigation during load |
| Full seven-stage browser path / organ picking / Hyperscope | M 7/7, actual positive heart raycast, four sealed session replay MATCH; edge cases/ledger exports still limited |
| Generated MATERIALS_LAB / COMPUTE_STATION entity chains | S actual Vienna room and 3 ASSET_SLOT IDs, each rendered=true; unbound visual equipment |
| Before/after image paths and visual inspection | `artifacts/human-twin-review/before-body.png`, `after-body.png`, seven macro PNGs reviewed; remaining visual defects stated above |
| Matrix dashboard/mobile/reduced-motion/scene exclusion | S desktop/mobile animated, reduced static; no rain in Human Explorer/temporal room; screenshots reviewed |
| TypeScript / root lint / reachability | Executor reports current tsc/build and root lint passed; reviewed moduleReachability JSON 2/2; exact final command logs remain executor-owned |
| Full frontend | Final combined run: **6973 passed / 0 failed / 1 skipped, 627/627 files** |
| Backend / core / CSRN | Final controlled runs: backend **849 passed/0 failed/33 skipped of 882**; core **465/465**; CSRN **38/38** |
| Actual frontend skipped test | Real PySCF H2 basis-arms Evidence Pack test named above; confirmed JSON status skipped |
| Production build | Executor reports current root `tsc -b && vite build` PASS (large-chunk warning); CSRN standalone build not independently evidenced here |
| Duplicate-architecture audit | Scoped reviewed source/import scan finds no newly introduced parallel visual/world/anatomy engine; limitations above |
| Verified numerator / 50 | **33 PASS, 16 PARTIAL, 1 BLOCKED — 66% strict acceptance** |
| REAL_REPO_V6_V61_V7_100_E2E | **false** |

No merge or deployment is performed by this report. The final integration commit remains on the dedicated `codex/genesis-final-integration` branch pending review.
