# Genesis — Recovery Matrix (all branches, PRs, tags)

Date: 2026-10-03. Base: `origin/main` **0f6be2dd** (after PR #73).
Method: read-only. `git fetch --all --tags`; for every remote branch:
commits outside main (`git rev-list main..B`), patch-id check (`git cherry`),
per-file blob check against the main tree (same path / same blob at another
path / different / absent), and for changed files the share of the branch's
added lines that exist anywhere on main (outside `legacy/`). Then targeted
reading of commits, `git grep` on main for the feature under other names, and
the earlier verdicts already written on main (`legacy/README.md`,
`docs/legacy/README.md`, `docs/GENESIS_CLAUDE_POSTFREEZE_AUDIT_2026-09-22.md`,
`docs/GENESIS_V6_V7_CAPABILITY_EVIDENCE.md`, `docs/DECISIONS.md`).

"absorbed %" below = share of the branch's added lines (≥12 chars) that exist
somewhere on main outside `legacy/`. It is a hint, not a verdict; every
NEEDS_PORT item was also checked by reading main's code.

---

## 1. Counts

| What | Number |
|---|---|
| Remote branches inspected | **124** (+ main) |
| · claude/* | 95 |
| · manus/* | 15 |
| · codex/* (Sol) | 4 |
| · astra/* | 3 |
| · other | 7 (`genesis/main`, `railway-production-ready`, `staging/qwen-cyber-foundation-unreviewed`, `w3-canonical-genesis`, `genesis-scientific-worlds-complete`, `checkpoint/pre-w3-consolidation-20260907-0049`, `events`) |
| Local-only branches (this machine) | 6 (`g1/astra-evidence-pack`, `g1/flight-control-ui`, `g1/monetization-verify`, `g1/sol-flight-control`, `claude/auth-roles-work`, `claude/profile-dashboards`) — all have 0 commits outside main or PR #75 |
| Tags | 0 |
| Worktrees | 9 (main checkout + 8 agent/scratch worktrees; all on branches listed here) |
| Stashes | 0 |
| PRs inspected | **66** (61 merged, 4 open: #1, #2, #74, #75; 1 closed unmerged: #31). Numbers 45–53 are issues, not PRs. |
| Branches with 0 commits outside main | 45 |
| Branches with commits, but every patch already on main (patch-id) | 19 |
| Branches with unique patches | 60 |

Branch verdicts (one primary class per branch):

| Class | Branches |
|---|---|
| ALREADY_IN_MAIN | 87 |
| ALREADY_ABSORBED_DIFFERENT_IMPLEMENTATION | 8 |
| PARTIALLY_ABSORBED | 7 |
| DUPLICATE (subset of another branch) | 7 |
| NEEDS_PORT | 9 |
| NEEDS_FINISHING (open PR) | 2 |
| OBSOLETE | 2 |
| ARCHITECTURALLY_INVALID | 2 |
| UNKNOWN | 0 |

Per family: manus 12 in main / 1 absorbed differently / 1 duplicate / **1 NEEDS_PORT**;
astra 1 / 1 / 1 partial; codex 4 in main; claude 65 in main, 6 absorbed
differently, 6 partial, 5 duplicate, **8 NEEDS_PORT**, 2 NEEDS_FINISHING,
2 obsolete, 1 invalid; other 5 in main, 1 duplicate, 1 invalid.

Feature-level summary (capabilities, not branches):

| | Count |
|---|---|
| Unique useful features outside main (to port) | **11** (list in §3) |
| Already integrated (merged or same content on main) | ~40 capability groups |
| Superseded by a different main implementation | 14 |
| To reject (owner rules / earlier audits / dead code) | 17 |
| NEEDS_PORT | 9 items |
| NEEDS_FINISHING | 2 open PRs (#74, #75) + 2 stale open PRs to close (#1, #2) |

---

## 2. Matrix by capability

Legend per row: **Branch** · commits · agent · what · on main? · verdict ·
remaining value · recommendation · tests · provenance note.

### 2.1 World / 3D / temporal engine (Manus focus)

| Capability | Branches · commits | Agent | On main? | Verdict |
|---|---|---|---|---|
| Deterministic world runtime, WorldGraph, WorldGenerator | manus/world-runtime-foundation (#3), manus/flagship-scientific-world, manus/genesis-consolidation, w3-canonical-genesis | Manus | Yes — `core/worldModel/ecs/worldGraph.ts`, `generation/*`, 129 non-test files mention WorldGraph | ALREADY_IN_MAIN |
| TemporalEngine / temporal world "wow" | manus/temporal-world-wow, manus/flagship-scientific-world | Manus | Yes — `TemporalCinematicScreen` (#/world-director?mode=temporal), 80 files reference TemporalEngine | ALREADY_IN_MAIN |
| City / high-fidelity district / road topology / scenario command center | manus/high-fidelity-city-view, manus/current-genesis-continuation, manus/scenario-engine-command-center | Manus | Yes — `City3DWebGLScreen`, `ScenarioCommandCenterPanel`, `core/simulation/scenarioCommandCenter.ts` (nav: Worlds → Miasto 3D) | ALREADY_IN_MAIN |
| First-person foundation `core/world/firstPerson.ts` | manus/world-runtime-foundation | Manus | Deleted in af395a1c (dead code); replaced by `core/three/firstPersonController.ts` | ALREADY_ABSORBED_DIFFERENT_IMPLEMENTATION |
| Many-worlds branching from one T0, state bookmarks | claude/temporal-engine-phase-1 (fb6e46a0 on main by patch-id) | Claude | Yes — `core/simulation/temporalMultiverse.ts`, `temporalStateBookmark.ts`, `TemporalMultiversePanel` in City 3D | ALREADY_IN_MAIN |
| **Branch → Evidence/lineage bridge** (decision lineage, pre-registered question per branch, branch as counterfactual into Evidence Pack, RO-Crate branch context, next-experiment loop) | claude/temporal-engine-phase-1: 4e832ae2, e016fe79, 5bfc858b, 14e3277c, b342101d, 33fdda0d (also on manus/product-access-control) | Claude | Was: only in `legacy/temporal-engine-2026-09/`. Now: `temporalMultiverse.ts` (preregistration, `temporalDecisionLineage`, `multiverseBranchAsCounterfactual`), `experimentFabric/multiverseEvidence.ts`, `evidencePack.ts` `multiverseBranchContext`, `evidencePackRoCrate.ts` round-trip; wired in `TemporalMultiversePanel` | **PORTED on g1/recovery-b d1ac3444** (+ gate: question must match the branch's scenario pair) |
| Counterfactual worlds (world-level) | several | Claude/Codex | Yes — `core/worldModel/discovery/worldCounterfactual.ts` (15 users) | ALREADY_IN_MAIN |
| Tesseract / 4D visualisation | (merged history) | — | Yes — via Science Chat → experimentFabric parser/router/executor; `core/generator/catalog.ts` | ALREADY_IN_MAIN |
| Epidemic digital twin / population (SEIR, agents, hotspots, interventions) | manus/high-fidelity-epidemic-digital-twin, claude/genesis-p0-fabric-audit, manus/visual-p1-world (bee4182b, cca903d1) | Manus | Yes — `core/epidemic/*`, `events/epidemicTransmissionAnalysis.ts`, City 3D, `#/calibration` | ALREADY_IN_MAIN |
| Human Biology World / Human Explorer | many claude/*, astra/* | Claude/Astra | Yes — `#/human-biology-lab` (primary nav), BodyParts3D atlas | ALREADY_IN_MAIN |
| Spacetime world templates (8 types) | claude/genesis-spacetime-universe-integration 9649263b | Claude | Yes, re-implemented — `worldModel/specification/spacetimeTemplates.ts` has all 8 template ids | ALREADY_ABSORBED_DIFFERENT_IMPLEMENTATION |
| Wormhole / gravity-well / paradox geometry (`core/spacetime/spacetimeVisualization.ts`) | same branch 19cab803 | Claude | No | REJECTED earlier (post-freeze audit: no WorldGraph/THREE binding). Keep rejected; speculative physics. |
| `core/physicsWorld/*` (backend registry, recipes) | genesis-scientific-worlds-complete, c1/c2 lineage | Claude | Deleted af395a1c as dead code | OBSOLETE |
| City-camera "stay out of buildings" | claude/city3d-camera-focus-safety 45cfe04f | Claude | Yes, separate commit 30c70dd0 | DUPLICATE |
| World Generation phases 3–8 (geometry, interiors, navigation) | claude/genesis-autonomous-completion-95bt4e 3b881610 | Claude | Yes (80% of lines; same files evolved) | ALREADY_IN_MAIN |
| Biomedical Bay (8th room), Canonical Laboratory (7 rooms), urbanTransformation, in-browser docking/PK | claude/genesis-c1-visual-snapshot 0efeb774, 3444a900 | Claude | Code archived in `legacy/c1-visual-snapshot-2026-09-21/`; standalone parts in product (D-135–D-137); browser docking rejected | PARTIALLY_ABSORBED → reject rest (owner chose one Laboratory); ~64 MB screenshots OBSOLETE |
| Live Science Mode (multi-camera lab), experience/camera foundation | claude/temporal-engine-phase-1 77d31585, 62110ce5, 1da03685 | Claude/owner | Only in `legacy/temporal-engine-2026-09/core/virtualLab`, `core/world` | ALREADY_ABSORBED_DIFFERENT_IMPLEMENTATION (main: `FirstPersonLabScreen`, `ScientificWorldsScreen`, `firstPersonController`) — reference only |

### 2.2 Evidence, replay, provenance (correctness)

| Capability | Branch · commit | On main? | Verdict / remaining value |
|---|---|---|---|
| **Replay false-green: hospital-layer drift reported WITHIN_TOLERANCE; `firstDifferingDay (11 → 11)`** | claude/test-quality-review 680c4ef8 (Claude, 08-28) | **No.** main `core/discovery/discoveryReplay.ts` still compares only S/E/I/R/D and emits `expected: day, actual: day` | **NEEDS_PORT** (high). Tests: `replayDriftCoverage.test.ts` (63 lines). Part 3 of the same commit (Evidence Pack `reproducibility: null`) is fixed differently on main (`evidencePackStore.ts` line 19–34). |
| Replay volatility guard (fresh backendRunId per call) | claude/next-audit-be9c56f 419e1cbb | Partly: main has "without using volatile run IDs" tests in `experimentFabric.test.ts`, but not a probe that mints a fresh id per call | NEEDS_PORT (test only, `evidenceReplayVolatility.test.ts`) |
| Event registry O(1) id index (fixes O(n²) causal chains) | claude/matrix-foundation-sprint be6887b8 | No — main `core/events/eventRegistry.ts` still scans `events.some/find` | NEEDS_PORT (small). Test: `eventRegistryScaling.test.ts` |
| Matrix foundation (fingerprints, headless stepper, replay verdict) | same branch | Yes — `core/matrixFoundation/*` | ALREADY_IN_MAIN |
| Local store collection boundary / `__proto__` | claude/persistence-integrity-hardening 43981e1e | Yes, re-implemented (`provenance/recordStore.ts` `UNSAFE_RECORD_IDS`, `Object.hasOwn`) | ALREADY_ABSORBED_DIFFERENT_IMPLEMENTATION |
| HazardInput shape validation | same branch 47c1cdb8 | Yes (`hazardProvenanceStore.ts::isHazardInputRecord` checks `scientificFields`) | ALREADY_ABSORBED_DIFFERENT_IMPLEMENTATION |
| GenesisEvent contract, event stream, consequences | claude/genesis-event-contract(+rebased) | Yes (`core/events/*`, `replay.ts`, `eventTraceFingerprint.ts`) | ALREADY_IN_MAIN; `contractCompat.ts` (semver for a Manus consumer) OBSOLETE |
| Evidence Pack connector for saved counterfactual | claude/evidence-pack-connector | Yes (89%) | ALREADY_IN_MAIN |
| Manus evidence fail-closed (persisted pack structure, malformed comparisons) | manus/high-fidelity-epidemic-digital-twin a0ac09e0, 10a4de35, 898a362c | Yes, different code | ALREADY_ABSORBED_DIFFERENT_IMPLEMENTATION |
| **Chat honesty labels: "TODO" shown to users; "TODO: uzupełnić metadane modelu"** | manus/high-fidelity-epidemic-digital-twin 1b0fcc7f, d0ca7c12 | **No** — both strings still on main (`ScienceChat.tsx:1056`, `resolveCommand.ts:1050`) | NEEDS_PORT (trivial; replaces with `VERIFY_REQUIRED` / `MODEL_METADATA_UNAVAILABLE`, +12-line test) |
| Experiment Fabric v0 discovery pipeline: preregistered protocols on backend, research packets (RBAC), backend replay receipt, human review decision, seeded uncertainty, Virtual CERN geometry admission | manus/visual-p1-world (50 commits, 08-21/22) | Archived in `legacy/manus-visual-p1-world-2026-08/`; capability now done by backend **ResearchRun** (plan → frozen prediction → engine → verdict → replay → next) | ALREADY_ABSORBED_DIFFERENT_IMPLEMENTATION. Residual: CERN geometry source-asset admission (ea294273, c1ec3a13) — UNKNOWN value, reference only |
| Precision reference analysis, natural-product pool, RDKit transport | claude/temporal-engine-phase-1, manus/product-access-control | Yes (81–100%) | ALREADY_IN_MAIN |
| Research access control, audit trail | manus/product-access-control (#6 cherry-pick) | Yes | ALREADY_IN_MAIN (branch is DUPLICATE of temporal-engine-phase-1 + #6) |
| Scene capture + epistemic status + replay for Reality Navigator ("Observer at the Junction") | claude/observer-junction-scene 36464523 | Now `core/reality/sceneCapture.ts` (closed status set, limit codes), `RealityNavigator.tsx`, PL/EN `components/reality/realitySceneText.ts`; `#/reality` in Worlds menu | **PORTED on g1/recovery-b 149d6efc** |

### 2.3 Science labs, physics, chemistry

| Capability | Branch · commit | On main? | Verdict |
|---|---|---|---|
| Double-slit density extracted into Scientific Core | claude/double-slit-core-extraction 22c6d6dd | `core/physics.ts` `doubleSlitProbabilityDensity`/`doubleSlitProfile`; `labs/quantum.ts` calls it | **PORTED on g1/recovery-b a3e5ddd2** |
| Bloch decoherence / measurement / Born rule extracted from renderer | claude/quantum-tunneling-audit a0ec0375 | `labs/experiments/quantum-bloch.ts` (`stepBlochVectorLength`, `probabilityOfZero`, `collapseByMeasurement`) | **PORTED on g1/recovery-b a3e5ddd2** |
| Universe labs (Kepler/three-body/Hubble/Lorenz) chat routing proof; Schwarzschild/Epidemic/Particle chat suggestions | claude/genesis-phase3-science-labs | Routing code yes; test `universeLabsScienceChatRouting.test.ts` no | PARTIALLY_ABSORBED → port test only |
| Chemistry as 2nd WorldLeverCatalog domain | claude/chemistry-discovery-verify-i30c1u c46de7b9 | Yes, separate implementation 3dfe9256 (same day) | ALREADY_ABSORBED_DIFFERENT_IMPLEMENTATION; main has no `chemistryLeverCatalog.test.ts` — optional test port |
| Specialist solvers (logistic growth, 1D diffusion) | final-science / universe / spacetime / overnight branches 3224cf4d, 2d521802 | No | REJECTED earlier (post-freeze audit). Keep rejected. |
| `painResearchUseCase.ts` | universe/spacetime 2d521802 | Main has `experimentFabric/painResearch.ts` (different) | REJECTED earlier ("no pain model") |
| `metaCognition/epistemicStatus.ts` | same | Duplicate taxonomy | REJECTED earlier |
| ModelRouter, D-141 metrics/DecisionTrace, scientific integration, drug integration | genesis-final-science-integration 632b9065…ac4a7d9e | Yes (98–100%) | ALREADY_IN_MAIN |
| Epistemic Engine, hypothesis generator, blind benchmark, parameter fitting, physics time-dilation domain, mechanistic match score | claude/temporal-engine-phase-1 (≈40 commits 09-02/04) | Archived in `legacy/temporal-engine-2026-09/core/discovery`; product path is backend ResearchRun + `core/agent` hypothesis loop | ALREADY_ABSORBED_DIFFERENT_IMPLEMENTATION; blind discovery benchmark and `ParameterizedModelFamily` fitting have no main equivalent → UNKNOWN value, reference only |
| Molecular discovery spike (RDKit bridge, SMARTS enumerator, Pareto, dossier, ADMET-AI/Vina loop) | claude/temporal-engine-phase-1 d9861c65…fa99ab25 | Yes, backend `campaign/*`, `compute/rdkitAdapter.mjs`, Drug Discovery screen | ALREADY_ABSORBED_DIFFERENT_IMPLEMENTATION |
| Chemistry live lab, virtual lab closed loop, MD/protein bindings, research intake | claude/genesis-* (09-22/24) | Yes (95–100%) | ALREADY_IN_MAIN |
| Atom/Bohr benchmark, collider spec + red-team, hadron/matrix audits, model–observation pairs, branch audit | 10 claude/* doc branches | Yes, `docs/legacy/audits/` | ALREADY_IN_MAIN (archive). v1 atom-bohr admission is DUPLICATE of v2 |
| USGS water model boundary | claude/usgs-contract-validation | Yes, own version of the test on main | ALREADY_ABSORBED_DIFFERENT_IMPLEMENTATION |

### 2.4 Pilot, campaign, counterfactual UX

| Capability | Branch · commit | On main? | Verdict |
|---|---|---|---|
| **A/B counterfactual over the protocol's own arms in Pilot** (wires existing `compareCounterfactual`) | claude/ab-counterfactual 9b4ca0a4 (= 1aae869d on campaign-evidence-interop) | `ExperimentPilotScreen` A/B panel via `experimentFabric/protocolArmComparison.ts` → `compareCounterfactual` | **PORTED on g1/recovery-b d3695ca6** |
| Protocol Evidence Pack / RO-Crate export in Pilot | claude/campaign-evidence-interop e589df99 | Yes (`ExperimentPilotScreen.tsx` RO-Crate button) | ALREADY_IN_MAIN |
| Campaign evidence boundary + "reach Campaign from natural phrases" | c202921f / d14795ed | Not found | UNKNOWN relevance after ResearchRun; reference only |
| Research Launcher in Ask | claude/research-launcher-nrboog (PR #31 closed) | Replaced by research console domain choice (#69) and Ask engine choice (#33) | ALREADY_ABSORBED_DIFFERENT_IMPLEMENTATION |

### 2.5 Hazard / earthquake / crisis (owner rule: demo only)

| Capability | Branch | On main? | Verdict |
|---|---|---|---|
| Hazard registry, earthquake vertical slice, damage NOT_MODELED contract, provenance, admission gate | claude/hazard-module-registry, earthquake-*, phase0-*, extreme-event-engine-foundation | Yes (`core/hazard/*`); catalogue marks Earthquake **"Demo only", SYNTHETIC** | ALREADY_IN_MAIN — keep DEMO |
| Envelope hardening (freeze `SYNTHETIC_EXPOSURE_SITES`, block-code matrix) | claude/earthquake-envelope-hardening 0d453a83 etc. | 64%; `SYNTHETIC_EXPOSURE_SITES` is `readonly` typed but not frozen | PARTIALLY_ABSORBED — port only if the demo is kept; not product |
| Science Chat → Earthquake Command Center handoff | claude/genesis-10h-execution 9735c3cc | No | ARCHITECTURALLY_INVALID as product (synthetic crisis presented through the research chat). Reject. |
| City Enterprise crisis engine (SEIR/flood/blast) | on main `packages/core/src/city-enterprise`, `core/city/*` | Excluded from catalogue by owner rule | Keep INTERNAL |

### 2.6 Infrastructure, runtime, deploy

| Capability | Branch | On main? | Verdict |
|---|---|---|---|
| Railway CPU scientific workers, remote dispatch, runtime probe | claude/genesis-railway-* (3) | Yes (81–99%); `Dockerfile.proposal` superseded by real pymeep Dockerfile | ALREADY_IN_MAIN |
| Local AI video runtime Stage A/B | claude/genesis-local-ai-video-* | Yes (95–99%) | ALREADY_IN_MAIN |
| Backend pre-deploy closure, engine readiness audit, premium asset gate | claude/genesis-* | Yes (91–100%) | ALREADY_IN_MAIN |
| OSM import out of public barrel; whitespace gate excludes Markdown | claude/quantum-forge-p845ux | Yes (barrel exports only pure `normalizeOsmMapXml`; CI `git diff --check` excludes `*.md`) | ALREADY_ABSORBED_DIFFERENT_IMPLEMENTATION |
| Production deploy branch | railway-production-ready (6 merge commits) | Content = main 23cd1340 (29 Sep). **Production (b3be8635) is 331 commits behind main.** | ALREADY_IN_MAIN |
| ResearchRun fan-out (bounded child runs, lineage, retry, cancel) | claude/grant-readiness-consolidation-rj04ng (PR #74 open) | No (`researchRunFanOut.mjs` absent) | NEEDS_FINISHING — review and merge #74 |
| Evidence Pack, Genesis Verify, Astra/Sol integration, Flight Control, monetization readiness doc | claude/human-explorer-mobile-tap-nrboog (PR #75 open; includes all `g1/*`) | No (`genesisVerify.mjs`, `researchRunEvidencePack.mjs`, `docs/monetization/` absent) | NEEDS_FINISHING — review and merge #75 |

### 2.7 Agent-family closures (verified cheaply)

| Family | Result |
|---|---|
| Sol / Codex | `codex/sol-master-execution`, `codex/genesis-final-integration`: 0 commits outside main (#56, #57 merged). `codex/bodyparts3d-claude-ready`, `codex/bodyparts3d-pilot-source`: both files byte-identical on main. **Nothing outstanding.** |
| Astra | `astra/evidence-researchrun-roadmap` merged (#55). `astra/genesis-investor-visual-polish`: 2 changed lines in later-rewritten files, absorbed. `astra/human-explorer-visual-ceiling`: UI absorbed (86–88%), two review scripts ported in PR #75, 4 report JSON + 54 screenshots OBSOLETE. **Nothing outstanding beyond #75.** |
| Manus | 10 of 15 branches have 0 commits outside main; `lint-fix`, `master-audit-discovery-loop` same content on main; `product-access-control` = temporal-engine-phase-1 + #6; `visual-p1-world` archived + superseded by ResearchRun; `high-fidelity-epidemic-digital-twin` → 2 one-line honesty fixes outstanding (§2.2). Only files of merged Manus work no longer on main: `core/world/firstPerson.ts` + its test (deleted as dead code). |
| Run 8 / Run 9 | On main (#44, #72). Not touched. |

### 2.8 Things that must not be revived as product

| Item | Where | Verdict |
|---|---|---|
| Qwen Cyber Foundation (attack paths, synthetic target) | staging/qwen-cyber-foundation-unreviewed | ARCHITECTURALLY_INVALID; already rejected on main (`docs/unreviewed-external/qwen-cyber-foundation/`). Reject. |
| Cyber kernel wiring / finding lifecycle | overnight-science b95373f2/ab7f10c3, universe 2d521802 | REJECTED earlier ("reject for this release"). Keep rejected. |
| Supreme / OMNICORE / 9D / advanced (CyberBastion, MarketGapHarvester, EnterpriseMonetizer…) / quantum-lab / molecular-engine | genesis-scientific-worlds-complete and the c1/c2 lineage | Deleted from main in af395a1c as dead code. OBSOLETE. Do not revive. |
| Speculative spacetime (wormholes, paradox) | spacetime-universe-integration | Rejected. At most DEMO behind "Mity i Teorie". |
| Mirror, Myth Lab, Decipherment, CICADA | on main | Mirror is under Worlds as "eksperymentalny"; Myth Lab and Decipherment under "Pokazy (eksperymenty)"; CICADA only in kernel, needs config. Keep DEMO/INTERNAL. |
| Earthquake / crisis engines | on main | Catalogue already "Demo only". Keep. |
| P2P MoveX logistics app | claude/p2p-agent-movex-builder-tu22tm (PR #1 open) | OBSOLETE for Genesis (separate product; archived in `legacy/movex-2026-07/`). Close PR #1 or move to its own repo (owner decision). |
| Old Genesis July lineage (ZEFIR Truth Engine, cognitive, corpus, billing/Stripe, longevity reasoning) | claude/genesis-takeover-audit-kpz019 = `genesis/main` (identical SHA 87ea6d0a; PR #2 open) | OBSOLETE; unique paths archived in `legacy/genesis-2026-07/`. Its versions of shared files (`api.mjs` +767, `store.mjs` +1378 lines, `client.ts`) remain only on the branch — needed only if billing is ever revived from it. Close PR #2 (owner decision). |
| Automotive claims auditor | temporal-engine-phase-1 858a6663 | Separate product, archived in legacy. Not Genesis. |
| ELION OMEGA | `events` (Dec 2025) | Description only, in `docs/legacy/elion-omega-2025-12/`. |

---

## 3. Prioritised integration list (value ÷ effort)

1. **Fix replay false-green** — source `claude/test-quality-review` 680c4ef8: `discoveryReplay.ts` hunk + `replayDriftCoverage.test.ts` (+ check `evidencePackIntegrityBoundary.test.ts` against main's `isPack`). Target `packages/frontend/src/core/discovery/discoveryReplay.ts`. Effort S. Changes replay verdicts (DRIFT now reported for hospital-layer differences): record it in `docs/DECISIONS.md`.
2. **Finish PR #75** (Evidence Pack, Genesis Verify, Flight Control, Astra/Sol integration, monetization readiness). Source `claude/human-explorer-mobile-tap-nrboog`. Target main. Effort: review.
3. **Finish PR #74** (ResearchRun fan-out). Source `claude/grant-readiness-consolidation-rj04ng` 4b592afa, b591266f. Target `packages/backend/src/researchRunFanOut.mjs`. Effort: review.
4. **Remove "TODO" from user-visible chat** — source `manus/high-fidelity-epidemic-digital-twin` 1b0fcc7f, d0ca7c12. Target `components/ScienceChat.tsx` (tag label), `core/scienceChat/resolveCommand.ts` (equation fallback) + 12-line test in `scienceChat.test.ts`. Effort XS.
5. **Event registry O(1) index** — source `claude/matrix-foundation-sprint` be6887b8. Target `core/events/eventRegistry.ts` + `__tests__/eventRegistryScaling.test.ts`. Effort XS.
6. **Replay volatility probe test** — source `claude/next-audit-be9c56f` 419e1cbb `evidenceReplayVolatility.test.ts`. Target `packages/frontend/src/__tests__/`. Effort XS (test only; adapt mocks to current client).
7. ~~**Pilot A/B counterfactual**~~ PORTED on g1/recovery-b d3695ca6 — source `claude/ab-counterfactual` 9b4ca0a4 (`ExperimentPilotScreen.tsx` hunk, styles, `campaignEvidenceBoundary.test.ts`). Target `components/ExperimentPilotScreen.tsx` calling existing `experimentFabric/counterfactualCompare.ts`. Effort S–M (screen has changed a lot).
8. ~~**Multiverse branch → Evidence/lineage**~~ PORTED on g1/recovery-b d1ac3444 — source `claude/temporal-engine-phase-1` 4e832ae2, e016fe79, 5bfc858b, 14e3277c, b342101d, 33fdda0d; file `legacy/temporal-engine-2026-09/packages/frontend/src/core/experimentFabric/multiverseEvidence.ts`. Target `core/simulation/temporalMultiverse.ts`, `core/experimentFabric/evidencePack*.ts`, `TemporalMultiversePanel.tsx`; better: express a branch as a ResearchRun counterfactual instead of a second Evidence path. Effort M. This is the only Manus-era "branching worlds" piece not on main.
9. ~~**Scientific Core extractions**~~ PORTED on g1/recovery-b a3e5ddd2 — double-slit (22c6d6dd → `core/physics.ts`, `labs/quantum.ts`, `doubleSlitModel.test.ts`) and Bloch decoherence (a0ec0375 → `labs/experiments/quantum-bloch*.ts`, `blochDecoherenceModel.test.ts`). Effort S each. Value: the two quantum labs become testable models instead of renderer code.
10. ~~**Reality Navigator scene capture + replay**~~ PORTED on g1/recovery-b 149d6efc — source `claude/observer-junction-scene` 36464523 (`core/reality/sceneCapture.ts`, `RealityNavigator.tsx`, test). Target `core/reality/`; also link `#/reality` from Worlds (today only reachable from itself and one lab). Effort M.
11. Optional test-only ports: `universeLabsScienceChatRouting.test.ts` (e33f1606), `chemistryLeverCatalog.test.ts` + `worldDiscoveryChemistryMemory.test.ts` (c46de7b9, adapt to main's catalogue). Effort S.

Not to port: everything in §2.8, specialist solvers, pain use case, MP4 encoder, epistemicStatus duplicate, spacetime visualization, earthquake chat handoff, contractCompat, physicsWorld, c1 rooms.

---

## 4. Forgotten on main (exists, not reachable from product UI)

Routes in `App.tsx` without any link from nav, catalogue, Start or screens:

| Route / module | What | Suggestion |
|---|---|---|
| `#/monetize` → `MonetizeScreen` | Commercial ledger (tenant, engagement, fail-closed PAID) D-057 | INTERNAL link from Settings/Platform, or leave hidden until a payment adapter exists |
| `#/character` → `CharacterLabScreen` | Character lab | UNKNOWN value; decide link or delete |
| `#/concept`, `#/compare` | Concept film, model compare | Reachable only through Ask commands |
| `#/reality` → `RealityNavigator` | Place/time observer | Linked from Worlds (variant of "Wizualizacje i światy") and search — g1/recovery-b 149d6efc |
| Labs `atom`, `biology`, `civilization`, `discovery`, `mathematics` (`#/lab/<id>`) | Canvas labs | Only via Search/Ask/dynamic links, not in menu |

Modules documented in `ALLOWED_ORPHANS` (`__tests__/moduleReachability.test.ts`):

- **D-136 medical data**: real DICOM Part-10 and NIfTI-1 readers, dataset registry with SHA-256 gate, volume reconstruction, segmentation overlay (`core/medicalData/*`) — no screen. High product value for Human Explorer.
- **D-140 real lab** (20 modules, `core/lab/*`): instrument registry, read-only instrument adapter, sensor ingest, calibration, uncertainty, safety interlock, protocol engine, sample lineage, Lab→Experiment Fabric bridge — tests only, no screen.
- **D-135** anatomy networks + geometry (`scientificWorlds/humanLab/anatomyNetworks.ts`, `three/anatomyNetworkGeometry.ts`).
- ENTITY-0/2/3 seams (`core/mind/*`, `backendReasoningPort.ts`) — "wired later".
- `hazard/cascadeCandidate.ts`, `worldModel/capability/capabilityStatus.ts`, `agent/agentBridge.ts`, `humanLab/inventory.ts`.
- Owner-held after the 29 Sep Start redesign: `GenesisDashboard`, `ScaleJourney`, `TimeTransport`, `WorkspaceStage`, `GenesisCapabilityShowcase`, `GenesisCommandCenterHero`, `crossDomainSynthesis`, `genesisPulseScene`, `sceneRegistry`, `AskGenesisMic`, `EngineCoreHolo`, `liveMatrix/*`.

`packages/core/src` subtrees with no importer outside their own tests/scripts:
`chemistry/` (chemistry knowledge v0.2.1, SMILES parser; only `scripts/chemistry*Audit.ts`), `evidence/evidenceContainer.ts` + `verifyContainer.cli.ts` (a delta/hash evidence container with a verify CLI — overlaps Genesis Verify; reconciled in §7: Genesis Verify is canonical), `reports/auditReportGenerator.ts`, `glue/genesisBindings.ts`.

Navigation inconsistency: catalogue marks Cyber "Demo only", but `core/navigation.ts` lists `cyber` in the product group "Administracja i sektor publiczny". Move it to the showcase group.

---

## 5. Monetization / product-packaging material

On main:
- `docs/GENESIS_SAAS_ENTERPRISE_READINESS.md`; `docs/GRANT_READINESS_REPORT.md`; `docs/GENESIS_INVESTOR_PACKAGE_GULF.md` (Hub71 / Qatar, measured vs roadmap split); `docs/GENESIS_INVESTOR_DEMO_RUNBOOK.md`; `PITCH_DECK_V16.md` (V16 deck, values marked as hypotheses; built on 9D content that is now deleted — outdated).
- `docs/astra/COMMERCIAL_LICENSE_GATE.md`, `docs/astra/GENESIS_ADVANTAGE_PLAN.md`.
- Code: `core/commercial/*` + `MonetizeScreen` (ledger, no payment adapter, unlinked); `backend/src/commercialReleaseAdmission.mjs` (licence/commercial admission gate); `backend/src/customerResearchDelivery.mjs`; `core/cde/measurementMarket.ts`; `packages/core/src/city-enterprise/GenesisCityMonetizer.ts` (City Enterprise, excluded by owner rule).
- Archive: `docs/legacy/genesis-2026-07/COMMERCIALIZATION.md` ("trustworthy molecule triage"; Stripe checkout → webhook → API-key provisioning), `GRANTS.md`, `ZEFIR_TRUTH_ENGINE_COMMERCIAL_AUDIT.md`, `GRANT_REPORT.md`; code `legacy/genesis-2026-07/packages/backend/src/billing/{stripe,handler,provisioning}.mjs`, `BillingScreen.tsx`, `InvestorDashboardScreen.tsx`, `validation/investorEdition.mjs`; MoveX Stripe Connect / capacity pricing in `legacy/movex-2026-07/` (other product).

Only on branches:
- `docs/monetization/MONETIZATION-READINESS.md` (PR #75): five offers with readiness and owner's prices quoted as hypotheses — Genesis Verify 45% (€3k–8k/audit), Benchmark 25%, Discovery Sprint 30%, Evidence Platform 20%, Enterprise 15%; fastest path = supervised Genesis Verify audit.
- `packages/core/src/supreme/GenesisEnterpriseMonetizer.ts` (35 old branches) — deleted Supreme pack; do not revive.
- Old Genesis billing wiring in `api.mjs` / `store.mjs` on `genesis/main` (not in legacy).

---

## 6. Final line

Outstanding valuable unintegrated work (exact list):
1. `claude/test-quality-review` 680c4ef8 — replay false-green fix (discoveryReplay).
2. PR #75 — `claude/human-explorer-mobile-tap-nrboog` (Evidence Pack, Genesis Verify, Flight Control, monetization doc).
3. PR #74 — `claude/grant-readiness-consolidation-rj04ng` (ResearchRun fan-out).
4. `manus/high-fidelity-epidemic-digital-twin` 1b0fcc7f + d0ca7c12 — user-visible "TODO" in chat.
5. `claude/matrix-foundation-sprint` be6887b8 — event registry O(1).
6. `claude/next-audit-be9c56f` 419e1cbb — replay volatility probe test.
7. ~~`claude/ab-counterfactual` 9b4ca0a4 — Pilot A/B counterfactual.~~ PORTED d3695ca6
8. ~~`claude/temporal-engine-phase-1` 4e832ae2…33fdda0d — multiverse branch → Evidence/lineage.~~ PORTED d1ac3444
9. ~~`claude/double-slit-core-extraction` 22c6d6dd and `claude/quantum-tunneling-audit` a0ec0375 — quantum model extraction.~~ PORTED a3e5ddd2
10. ~~`claude/observer-junction-scene` 36464523 — Reality Navigator scene capture/replay.~~ PORTED 149d6efc
11. Optional tests: e33f1606, c46de7b9.

---

## 7. Reconciliation: `packages/core/src/evidence/evidenceContainer.ts` vs Genesis Verify

Checked 2026-10-03 on g1/recovery-b (read-only comparison, one small hardening).

| | `core/evidence/evidenceContainer.ts` + `verifyContainer.cli.ts` | `backend/src/genesisVerify.mjs` (Genesis Verify) |
|---|---|---|
| Input | A zip it builds itself: `container.json` (input state + `set`/`add` deltas + state-hash chain) and `manifest.json` | The record a ResearchRun already persists (execution bundle or EXPERIMENT_HANDOFF record), as bytes or JSON, plus the sha256 the customer was given |
| Who produces the input | Nobody. No screen, route, engine or script builds a container; only its own test does | Every executed ResearchRun experiment |
| Checks | Manifest hash, recomputed state-hash chain, final fingerprint | File hash vs given hash, provenance completeness, content hashes, ledger anchor (hash-chained research state), replay through the same replayer as the Scientific Run verifier, tolerance |
| Verdicts | `ok: boolean` + error codes | `MATCH / DRIFT / TAMPERED / BLOCKED` with plain-language steps and an HTML report |
| Product surface | CLI file only, no `bin`, not in any npm script | API + customer report; offer "Genesis Verify" in the monetization doc |

**Recommendation: Genesis Verify is canonical.** It verifies the evidence Genesis actually produces and is the
customer-facing product. The container is a second, unconnected format; building it out would be the
"two evidence paths" the owner rules forbid.

**What is worth absorbing later (not done here, each needs its own design):**
1. *Offline mode with zero dependencies* — the container verifier runs on a bare file with no server. Genesis Verify
   already accepts `db = null`; packaging it as a standalone `npx`/CLI over an execution bundle would give the same
   third-party story on the canonical format.
2. *Intermediate state-hash chain* — when an engine exposes intermediate states, Genesis Verify could check a chain of
   hashes, not only input/output. Only relevant once a ResearchRun engine records intermediate states.
3. The stored zip writer/reader (`zipStore`/`parseZip`) is not needed: the execution bundle is JSON.

**Done on this branch (tiny, safe):** `verifyContainerOffline` no longer passes silently when `manifest.json` does
not list `container.json` (now `MANIFEST_ENTRY_MISSING`), and returns `UNREADABLE_JSON` / `MALFORMED_CONTAINER`
instead of throwing on a corrupt file. Two tests in `packages/core/src/__tests__/genesisCoreExpansion.test.ts`.
This is a false-green fix in an unused module, not an absorb into Genesis Verify.

**Suggested next step (owner decision):** mark `core/evidence/*` as INTERNAL/DEPRECATED in favour of Genesis Verify,
or delete it together with its test once item 1 above exists.

