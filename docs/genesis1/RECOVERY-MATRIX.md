# Genesis — Recovery Matrix (final branch forensics)

Date: 2026-10-04. Base: `claude/human-explorer-mobile-tap-nrboog` **59e3822f**
(= `origin/main` **286822e7**, after PR #83, plus the time-to-discovery work and schema v17).
Supersedes the 2026-10-03 pass of this file, which was written against `origin/main` **0f6be2dd**
(before PR #74/#75/#81/#83). **Every NEEDS_PORT item of that pass is now on main** — see §6.

Branches inspected: **124** (every remote branch except `origin/main`). No branch was deleted,
nothing was pushed, no history was rewritten.

Method, per branch: `git rev-list --count origin/main..B` (commits outside main),
`git cherry origin/main B` (patch-id: is every patch already on main under another SHA),
`git diff --stat origin/main...B` and `git diff --name-only origin/main...B`, then — for every
branch with a unique patch — reading the commits and checking main's tree for the capability under
its current name. Tree-hash comparison was used where a three-dot diff was misleading
(`project-thread-2wdmhf` has multiple merge bases).

**Mechanical proof covers 64 of 124 branches**: 45 have zero commits outside main, and a further 19
have commits whose every patch is already on main by patch-id. The remaining 60 were read.

---

## 1. Counts

| Class | Branches |
|---|---|
| ALREADY_IN_MAIN | **97** |
| ABSORBED_BY_NEWER_IMPLEMENTATION | **7** |
| DUPLICATE | **7** |
| OBSOLETE | **5** |
| ARCHITECTURALLY_INVALID | **5** |
| ACTIVE_WORK_ALREADY_OWNED | **1** |
| NEEDS_PORT | **2** |
| **UNREVIEWED** | **0** |
| **UNKNOWN** | **0** |
| Total | **124** + `origin/main` = **125 refs** |

`origin/main` is the base, not a candidate: it is canonical Genesis by definition. Every one of the
other 124 has a class below, so **UNREVIEWED = 0**: 64 by mechanical proof (zero commits outside
main, or every patch already on main by patch-id) and 60 by reading the commits and checking main's
tree for the capability under its current name. No class was assigned by guess; the one branch whose
three-dot diff was unreliable (`project-thread-2wdmhf`, multiple merge bases) was settled by
tree-hash comparison instead.

Per family (each adds up to its family total):

| Namespace | Total | reviewed | UNREVIEWED | in main | absorbed | duplicate | obsolete | invalid | owned | needs-port |
|---|---|---|---|---|---|---|---|---|---|---|
| claude/* | 95 | 95 | 0 | 73 | 6 | 5 | 4 | 4 | 1 | 2 |
| manus/* | 15 | 15 | 0 | 13 | 1 | 1 | — | — | — | — |
| codex/* (Sol) | 4 | 4 | 0 | 4 | — | — | — | — | — | — |
| astra/* | 3 | 3 | 0 | 2 | — | — | 1 | — | — | — |
| other | 7 | 7 | 0 | 5 | — | 1 | — | 1 | — | — |
| **All** | **124** | **124** | **0** | **97** | **7** | **7** | **5** | **5** | **1** | **2** |

"other" = `events`, `genesis-scientific-worlds-complete`, `checkpoint/pre-w3-consolidation-20260907-0049`,
`railway-production-ready`, `w3-canonical-genesis` (in main), `genesis/main` (duplicate),
`staging/qwen-cyber-foundation-unreviewed` (invalid).

### The two NEEDS_PORT items, in one line each

1. **`claude/grant-readiness-consolidation-rj04ng`** — three commits made *after* PR #81 was cut
   from this branch. They add remote **advance** and remote **fan-out** over the worker API, a
   dependency-free protocol module, a remote-worker registry route and the Flight Control view for
   it. Nothing of it is on main. Details in §2.
2. **`claude/chemistry-discovery-verify-i30c1u`** — two test files for the chemistry
   `WorldLeverCatalog`. Main has its own catalogue implementation with a different API, so the tests
   do not run as written. Blocker and exact mismatch in §2.

### Nothing valuable is forgotten in the candidate-discovery area

The brief singled out GLP-1R, candidate discovery, the winner gate, chemistry discovery,
Ozempic/Mounjaro substitution, dual-target, GIPR, real lab, virtual lab, retrosynthesis and engine
integration. Every one of those was found and placed:

| Area | Where it lives now |
|---|---|
| GLP-1R QSAR, endpoint role, applicability domain | main: `packages/backend/src/glp1rQsar{,V2}.test.mjs`, `glp1rEndpointRole.test.mjs`, `campaign/glp1rEfficacyAdapter.mjs`; D-162 sealed probe on the integration branch |
| GLP-1R source data (RCSB 5VEW/6B3J, Reactome, HPA, ChEMBL) | main: `docs/evidence/source-data/glp1r-2026-10-03*`; `claude/project-thread-2wdmhf`'s copy is byte-identical (same tree hash `f5953613`) |
| GIPR | main: `campaign/giprQsar.mjs` + `giprActivity.json` (233 rows, `INSUFFICIENT_DATA`); the branch copy's header is **older** than main's |
| Mounjaro / tirzepatide / semaglutide | main: `mounjaroTrack.test.mjs`, `core/discovery/molecular/mounjaroResearchRecipe.ts`, `trialInterpretation.ts` |
| Candidate discovery / research intake | main: `campaign/researchIntake.mjs` (840 lines), `apiResearchIntake.test.mjs`, `docs/GENESIS_RESEARCH_INTAKE_CONTRACT.md` |
| Winner gate | main: `core/orchestrator/orchestrator.ts`, `winnerGate.test.ts`, `winnerGateBypassAudit.test.ts` |
| Retrosynthesis | main: `retrosynthesis.test.mjs`, `retrosynthesisAdmission.test.mjs` |
| Real lab | main: `researchRunLab.mjs`, `campaign/labClosedLoop.mjs`, `campaign/labEvidenceBridge.mjs`, `researchRunLab.e2e.test.mjs`, `candidateLabHandoff.test.mjs` |
| Virtual lab | main: `campaign/virtualLabClosedLoop.mjs`, `apiVirtualLabClosedLoop.test.mjs` |
| Engine integration | main: `researchRunEngines.mjs` (one executor table) + the PR #81 remote worker — **except** the three commits of NEEDS_PORT item 1 |
| Candidate pipeline, winner gate, chemistry handoff, discoveryTiming, D-162/D-163 | `claude/human-explorer-mobile-tap-nrboog` — **another agent's live work**, reported, not touched |

The only *other* copy of a winner gate anywhere is
`codex-handoff/genesis-integration-mega-pack-v2/src/drugDiscovery/winnerGate.ts` on three branches.
That is part of a standalone second engine suite, not a port candidate — see
ARCHITECTURALLY_INVALID in §3 and `docs/genesis1/ONE-BRAIN.md`.

---

## 2. The two NEEDS_PORT items in full

### NP-1 — remote advance and fan-out over the worker API

**Branch** `claude/grant-readiness-consolidation-rj04ng`.
**Commits** `7f47aa34` ("Remote advance and fan-out over the worker API, remote worker list and
Flight Control view"), `9427e184` ("Remote cancel E2E: a child that finished before the cancel keeps
its one result"), `2094e922` (trailing blank line), `3fce2f37` (merge of `origin/main` into the PR).
**Why it was missed.** PR #81 was merged from this branch (`e0e13ce2` on main), and these commits
were pushed after that cut. `git merge-base --is-ancestor 7f47aa34 origin/main` → **NO**.

**Exception, precisely.** This is **open PR #84** (head `3fce2f37`, base `main`, +1022/−327 over 19
files, not a draft, `mergeable: true`, `mergeable_state: unstable` — a check is failing or pending).
So the integration is a **review-and-merge, plus one green CI run**, not a port: the work does not
need lifting off a dead branch, and re-implementing it on another branch would duplicate an open PR.
That is why it is left as NEEDS_PORT rather than carried over here. What is still owed before merge:
the failing/pending check must be resolved, a decision id must be recorded for the second job kind
under one lease, and two invariant allowlists move (below).

**What it holds, and where it belongs** (19 files, +1022/−327):

| Worth porting | Target on main | What it is |
|---|---|---|
| `packages/backend/src/remoteWorkerProtocol.mjs` (new, 12 lines) | new file, same path | The protocol constants in a module with **no imports**, so the worker process (no database) and the server share one definition without the worker loading server code. Adds `RESEARCH_ADVANCE_REMOTE_CAPABILITY` and `REMOTE_MAX_ATTEMPTS = 3`. Today `WORKER_API_PREFIX` and `RESEARCH_REMOTE_CAPABILITY` are declared in `remoteWorkerApi.mjs:22` and `researchRunJobs.mjs:23`. |
| `remoteWorkerApi.mjs` (+324/−…) | `packages/backend/src/remoteWorkerApi.mjs` | Three kinds of job over **one** lease, one freeze-before-engine rule, one server-side apply: a single experiment, an **advance** (several justified experiments under one lease) and a **fan-out child**. Plus `listRemoteWorkers(db, projectId)` (lease holders from the durable queue + workers seen since boot, engine names kept under `technicalDetails`) and a reconcile when a fan-out child settles. Resume semantics: a retry after a killed worker finds the same frozen experiment and is resumed, never re-frozen. |
| `researchRunAdvance.mjs` (+37/−12) | same path | Extracts `recordContinuation(db, projectId, runId, experimentId)` — the `EXPERIMENT_CONTINUED` link derived **from the chain alone**, idempotent — out of `advanceResearchRun`, so a remote advance can write the same link the local one does. This is the hop that keeps "next justified experiment" singular when the step runs off-process. |
| `researchRunFanOut.mjs` (+14/−…) | same path | A `remote` flag through `spawnChildRuns` / `ensureJobs` / `retryChild`; a retry stays where the child was running unless the caller says otherwise (`latestJobOf(...).payload.remote`). |
| `researchRunJobs.mjs` (+18/−…) | same path | The queue side of the two remote capabilities. |
| `api.mjs` (+12/−6) | same path | `GET /api/projects/:id/remote-workers` (read-only), and `remote: body?.remote === true` on advance-async, fan-out spawn and child retry. |
| `remoteWorkerTestKit.mjs` (new, 192) + `remoteFanOutAdvance.e2e.test.mjs` (new, 214) + `remoteWorker.e2e.test.mjs` (−186, moved into the kit) + `remoteWorkerApi.test.mjs` (+23) | `packages/backend/src/` | The e2e proof: remote fan-out, remote advance, and a cancel arriving after a child finished keeping its one result. |
| Flight Control remote-worker view | `packages/frontend/src/components/flightControl/{FlightControlView.tsx,flightControlModel.ts,flightControlText.ts,flightControl.css}`, `core/backend/client.ts`, `__tests__/flightControlScreen.test.tsx` | The human surface for "who is running my experiments". |
| `docs/GENESIS_RAILWAY_STAGING.md` (+16/−…), `.github/workflows/ci.yml` (1 line) | same paths | Staging runbook and the CI entry for the new e2e. |

**Do not port it as one commit.** It changes the freeze/apply path. Suggested order: (1) the protocol
module and `recordContinuation` extraction with its existing tests, (2) `researchRunJobs` +
`researchRunFanOut` remote flags, (3) `remoteWorkerApi` advance/fan-out + the test kit and e2e,
(4) `listRemoteWorkers` + the route, (5) Flight Control. A new decision id is needed for (3), because
it adds a second job kind under one lease.

**It will move two architectural invariants** (`packages/backend/src/architecturalInvariants.test.mjs`),
and that is the tests doing their job, not a failure:
- invariant 4 "only one module may serve the remote-worker HTTP API" asserts `WORKER_API_PREFIX` is
  defined in `remoteWorkerApi.mjs`; after the port it is defined in `remoteWorkerProtocol.mjs`, so the
  `except` list moves there;
- invariant 4's `RESEARCH_RUN_EXECUTORS` importer list and invariant 11's statement that the
  capability-worker system never names a ResearchRun are unaffected, but `api.mjs` becomes an importer
  of `remoteWorkerApi.mjs` (`listRemoteWorkers`), which no invariant forbids — record it anyway.

### NP-2 — the two chemistry lever-catalog tests

**Branch** `claude/chemistry-discovery-verify-i30c1u`, commit `c46de7b9`.
**Files** `packages/frontend/src/__tests__/chemistryLeverCatalog.test.ts` (6 tests),
`packages/frontend/src/__tests__/worldDiscoveryChemistryMemory.test.ts` (10 tests).

**Status.** The *implementation* is on main as an independent version written the same day
(`packages/frontend/src/core/agent/chemistryLeverCatalog.ts`, 3dfe9256) — so this is a test-coverage
gap, not a capability gap. Main has no test for the chemistry lever catalogue.

**Blocker, measured by running them (both files copied in and executed under
`packages/frontend` vitest: 14 failed, 2 passed).** The branch's tests are written against a
different exported API:

| Branch test expects | Main exports |
|---|---|
| `GENESIS_CHEMISTRY_KINETICS_CATALOG` (with a `.buildWorld()` method and `.metricPhrases`) | `GENESIS_CHEMISTRY_CATALOG` (`chemistryLeverCatalog.ts:172`) + a free function `buildChemistryDiscoveryWorld()` (`:78`) |
| three levers incl. `lever:sample-quantity` | `GENESIS_CHEMISTRY_LEVERS` (`:115`) — `lever:temperature` first, no `lever:sample-quantity` |
| `GENESIS_CHEMISTRY_KINETICS_CATALOG_ID` | `GENESIS_CHEMISTRY_CATALOG_ID = 'genesis-chemistry-kinetics'` (`:50`) |
| objective metric readable from an "Arrhenius substance entity" | `GENESIS_CHEMISTRY_OBJECTIVE_METRIC = 'concentrationFraction'` (`:221`) |

Porting means **rewriting the assertions** against main's lever set and objective metric, and
deciding whether main's catalogue should also declare a sample-quantity lever (a science question:
the branch's test asserts sample quantity is *genuinely falsified*, which is a real claim main does
not currently make). That is a chemistry-discovery decision, not a mechanical port.

**Not done here** because this audit writes documentation and tests and does not change science, and
because the chemistry handoff is another agent's area. The adjacent, mechanical half of the same
branch family **was** closed: `universeLabsScienceChatRouting.test.ts` from
`claude/genesis-phase3-science-labs` `e33f1606` was ported unchanged and passes (§5).

---

## 3. The table — one row per branch

Legend: **cl** = class. `c` = commits outside main, `u` = commits whose patch is **not** already on
main by patch-id. `c=0` or `u=0` is a mechanical ALREADY_IN_MAIN.

### 3.1 ALREADY_IN_MAIN — zero commits outside main (45)

Each row's tip is an ancestor of `origin/main`.

| Branch | tip |
|---|---|
| astra/evidence-researchrun-roadmap | 6701d02c |
| checkpoint/pre-w3-consolidation-20260907-0049 | 0bb565ed |
| claude/completion-matrix-fanout | 491eaa85 |
| claude/earthquake-vertical-slice | 558aa03d |
| claude/genesis-c1-visual-integration | d48edeb0 |
| claude/genesis-c2-repo-consolidation | be17c4bf |
| claude/genesis-graphics-engine-v1-wd0r66 | 15283b44 |
| claude/genesis-human-twin-cc0-visual | 11f54ec7 |
| claude/genesis-p0-fabric-audit | fd64ddef |
| claude/genesis-total-consolidation | e4f05e35 |
| claude/genesis-winner-gate-audit-qgf90v | 5f20ef95 |
| claude/genesis-world-model-c3-qx7ihi | daccda87 |
| claude/homepage-first-impression-1iul2q | bb86d5b9 |
| claude/human-explorer-direct-nrboog | 3109b40f |
| claude/investor-demo-visual | 53eb6f41 |
| claude/mobile-start-fix | fdf72c64 |
| claude/phase0-admission-gate-fix | bf4831ed |
| claude/phase0-evidence-store-convergence | cd02484f |
| claude/phase0-hazard-provenance | cf964109 |
| claude/project-thread-7vqzv9 | d657bc40 |
| claude/project-thread-d02teo | 315e64bd |
| claude/project-thread-dlc1pv | 34bce99c |
| claude/project-thread-idqf5l | 035318a3 |
| claude/project-thread-lct8kl | 0df04179 |
| claude/project-thread-mk7f49 | 704f2a84 |
| claude/project-thread-nqwhg7 | 92c18d44 |
| claude/project-thread-p94aak | d31d1854 |
| claude/project-thread-xe3uww | 6c2023a0 |
| claude/real-lab-total-consolidation-d6lyu6 | 49f30902 |
| claude/research-access-cherry-pick | b24b512d |
| codex/genesis-final-integration | 022ad816 |
| codex/sol-master-execution | 4926b1b3 |
| events | 9ad75f3b |
| genesis-scientific-worlds-complete | 38886f68 |
| manus/current-genesis-continuation | b1ae7cbd |
| manus/earthquake-damage-final-sprint | 9ad99d32 |
| manus/flagship-scientific-world | 18363806 |
| manus/genesis-consolidation | 83b30c6c |
| manus/high-fidelity-city-view | 1e5d1eb3 |
| manus/next-gap-observation-analysis | c640fb30 |
| manus/observation-analysis-layer | 64df7ac3 |
| manus/scenario-engine-command-center | e7da958f |
| manus/temporal-world-wow | f2493268 |
| manus/world-runtime-foundation | 5ba54aa4 |
| w3-canonical-genesis | 00ce93c3 |

Notes on two of them, because their *content* is not simply present:
`genesis-scientific-worlds-complete` was merged and its Supreme/OMNICORE/9D pack was later **deleted**
from main as dead code (`af395a1c`); do not revive it. `events` is the Dec-2025 ELION OMEGA
description, archived at `docs/legacy/elion-omega-2025-12/`.

### 3.2 ALREADY_IN_MAIN — every patch already on main by patch-id (19)

| Branch | c/u | Commits | Justifying files (already on main) |
|---|---|---|---|
| astra/genesis-investor-visual-polish | 1/0 | b9a95424 | `core/three/agentLabScene3D.ts`, `core/three/graphics/cameraRig.ts`, `__tests__/astraVisualPolish.test.ts` |
| claude/earthquake-impact-damage-science | 1/0 | 4764a274 | `__tests__/earthquakeDamageAssessment.test.ts`, `earthquakeCoordinateMapping.test.ts`, `hazardModuleRegistry.test.ts` |
| claude/extreme-event-engine-foundation | 2/0 | 28ed69de, 4764a274 | `docs/EXTREME_EVENT_ENGINE_ARCHITECTURE.md`, `__tests__/cascadeCandidate.test.ts` |
| claude/genesis-backend-predeploy-closure | 1/0 | 4f0301ac | `campaign/toolchain.mjs`, `compute/engineReadinessReport.mjs`, `campaignD069.test.mjs` |
| claude/genesis-bodyparts3d-pilot | 4/0 | ffb79b02, 60454bcf, d568f1a8, 365e41cb | `docs/GENESIS_BODYPARTS3D_PILOT.md`, `packages/e2e/src/bodyParts3dPilot.e2e.spec.ts`, `artifacts/bodyparts3d/` |
| claude/genesis-engine-readiness-audit | 1/0 | 0b21f52e | `compute/engineReadinessReport.{mjs,test.mjs}`, `scripts/engine-readiness-report.mjs` |
| claude/genesis-human-explorer-visual-polish | 1/0 | 782a3844 | `components/HumanExplorerPanel.tsx`, `__tests__/humanExplorerVisualPolish.test.tsx` |
| claude/genesis-local-ai-video-stage-b | 1/0 | 00ea1b46 | `cinematic/localVideoModelDescriptor.mjs`, `cinematic/localVideoWorkerAdapter.mjs` |
| claude/genesis-p0-retro-handoff | 1/0 | b45ff054 | `docs/GENESIS_RETRO_MODEL_FILES.md`, `apiCampaign.test.mjs` |
| claude/genesis-premium-asset-acceptance | 1/0 | ab95b99f | `core/three/assetGovernance.ts`, `__tests__/assetGovernance.test.ts` |
| claude/genesis-railway-remote-dispatch | 2/0 | 00400d99, de63a418 | `campaign/virtualLabClosedLoop.mjs`, `docs/RAILWAY_SCIENTIFIC_WORKERS.md` |
| claude/genesis-railway-scientific-workers | 1/0 | 96ea9b4c | `compute/workerServer.mjs`, `requirements-{admet,biopython,meeko}.txt` |
| claude/genesis-research-intake-candidate-discovery | 1/0 | 05dc7618 | `campaign/researchIntake.mjs` (840 lines), `campaign/researchIntake.test.mjs`, `apiResearchIntake.test.mjs`, `docs/GENESIS_RESEARCH_INTAKE_CONTRACT.md` — **the candidate-discovery intake is fully on main** |
| claude/traffic-flow-worldgraph-ow11w9 | 1/0 | bd075931 | `VISION-BACKLOG.md` |
| codex/bodyparts3d-claude-ready | 1/0 | 365e41cb | `artifacts/bodyparts3d/README.md`, `bodyparts3d-pilot-source.zip` (byte-identical) |
| codex/bodyparts3d-pilot-source | 1/0 | 70318a8e | same two files |
| manus/lint-fix-20260916 | 1/0 | e68445b9 | `campaign/glp1rQsar.mjs`, `mounjaroTrack.test.mjs`, `scripts/gov-drug-campaign-browser-e2e.mjs` |
| manus/master-audit-discovery-loop | 2/0 | f8074417, ecc48fec | `core/experimentFabric/scientificDiscoveryLoop.ts`, `__tests__/scientificDiscoveryLoop.test.ts` |
| railway-production-ready | 8/0 | 37197555…c8744c54 | Six merge commits; content = main `23cd1340`. Production `b3be8635` is far behind main — a deploy question, not a recovery one. |

### 3.3 ALREADY_IN_MAIN — read and confirmed (33)

| Branch | c/u | Commits | Justifying files on main |
|---|---|---|---|
| claude/ab-counterfactual | 2/2 | 9b4ca0a4, c202921f | Pilot A/B over protocol arms ported: `core/experimentFabric/protocolArmComparison.ts`, `__tests__/pilotProtocolArmComparison.test.ts`, `ExperimentPilotScreen.tsx` |
| claude/atom-bohr-benchmark-admission-v2 | 1/1 | d62529ae | `docs/legacy/audits/` archive of `GENESIS_ATOM_BOHR_BENCHMARK_ADMISSION.md` |
| claude/atom-bohr-g3-security-review | 1/1 | 1f64d832 | `GENESIS_ATOM_BOHR_G3_SECURITY_REVIEW.md` (archive) |
| claude/atom-bohr-option-d-spec | 7/7 | 2cdc3b5a…58e422d2 | `GENESIS_ATOM_BOHR_OPTION_D_SPEC.md`, `…_G3_READINESS.md` (archive) |
| claude/audit-verify-c6ae7d3 | 2/2 | 92202317, 10c8ca5d | `docs/CLAUDE_BRANCH_AUDIT.md` (archive) |
| claude/city3d-camera-focus-safety | 1/1 | 45cfe04f | `core/three/cityCameraSafety.ts`, `__tests__/cityCameraSafety.test.ts` |
| claude/collider-foundation-spec | 2/2 | 85706e51, aa0dffdc | `docs/PARTICLE_COLLIDER_FOUNDATION_SPEC.md` |
| claude/collider-spec-red-team-review | 1/1 | f4576cda | `docs/PARTICLE_COLLIDER_SPEC_RED_TEAM_REVIEW.md` |
| claude/double-slit-core-extraction | 1/1 | 22c6d6dd | `core/physics.ts::doubleSlitProbabilityDensity`, `labs/quantum.ts`, `__tests__/doubleSlitModel.test.ts` |
| claude/earthquake-demo-envelope | 3/3 | 287a788e, 4ff08bde, 0ca74d90 | `docs/EARTHQUAKE_DEMO_ENVELOPE.md` (doc consolidated under this name), `docs/HAZARD_MODULE_REGISTRY.md`, `__tests__/earthquakeDemoEnvelope.test.ts` |
| claude/evidence-pack-connector | 1/1 | b7235352 | `core/experimentFabric/counterfactualEvidence.ts`, `core/knowledge/registry.ts`, `ScientificMemoryScreen.tsx` |
| claude/genesis-chemistry-live-lab | 2/2 | c5b7fbc1, 1e6e6ad1 | `docs/GENESIS_CHEMISTRY_LIVE_LAB.md`, `__tests__/chemistryLiveLab.test.ts`, `packages/e2e/src/chemistryLiveLab.e2e.spec.ts` |
| claude/genesis-event-contract-rebased | 3/3 | 56d60ffe, 8cb11646, e7940c64 | `core/events/*`, `replay.ts`, `eventTraceFingerprint.ts`, `__tests__/{genesisEvent,eventEngine,eventAssurance}.test.ts`. `contractCompat.ts` (semver for a Manus consumer) was not taken and is obsolete. |
| claude/genesis-final-human-mirror-product | 1/1 | 6f4874e4 | `__tests__/anatomyIntegrationShell.test.ts`, `browserCameraAdapter.test.ts`, `packages/e2e/src/mirror.e2e.spec.ts` |
| claude/genesis-final-science-integration | 10/10 | 0bd129bc, ac4a7d9e, 57ccf2f6, afe94b07, 3224cf4d, 632b9065 | ModelRouter, D-141 metrics/DecisionTrace, scientific + drug integration all on main. The specialist solvers in `3224cf4d` (logistic growth, 1-D diffusion) were rejected by the post-freeze audit and stay rejected. |
| claude/genesis-lab-closed-loop | 2/2 | e1de3f3f, 866171d8 | `campaign/labClosedLoop.mjs`, `campaign/labEvidenceBridge.mjs`, `apiLabClosedLoop.test.mjs` — the **real lab** closed loop |
| claude/genesis-local-ai-video-runtime | 5/4 | df5d8c86, b0d49dbf, b25a8ba5, e1de3f3f, 866171d8 | `docs/GENESIS_LOCAL_AI_VIDEO_RUNTIME.md`, `apiLocalVideo.test.mjs`, `cinematic/*` |
| claude/genesis-phase3-science-labs | 3/3 | 83a8ce9f, e33f1606, aa5a1902 | Routing on main (`core/experimentFabric/router.ts`, `ScienceChat.tsx`, `physicsLabsScienceChatRouting.test.ts`); the missing regression proof `universeLabsScienceChatRouting.test.ts` (`e33f1606`) **was ported on this branch** (§5) |
| claude/genesis-railway-worker-runtime-validation | 3/2 | 36592ea4, 3402a19f, 1592ffe5 | `compute/railwayWorkerReadiness.{mjs,test.mjs}`, `compute/workerRuntimeProbe.mjs` |
| claude/genesis-sw4-software-completion | 1/1 | 6daa2c39 | `docs/GENESIS_SW4_ADAPTER_CONTRACT.md`, `__tests__/worldModelSw4EpidemiologyCity.test.ts`, `core/agent/genesisAgentTools.ts` |
| claude/genesis-virtual-lab-engine-bindings | 4/4 | b0d49dbf, b25a8ba5, e1de3f3f, 866171d8 | `campaign/virtualLabClosedLoop.mjs`, `apiVirtualLabClosedLoop.test.mjs`, `docs/GENESIS_VIRTUAL_LAB_CLOSED_LOOP.md` — the **virtual lab** closed loop and MD/protein bindings |
| claude/genesis-voice-guide-product-closure | 1/1 | c37c0b90 | `core/navigation.ts:145` (`#/gov-campaign`), `:150` (`#/virtual-bio`), both reworded; `packages/e2e/src/voiceGuideProductReachability.e2e.spec.ts` |
| claude/hadron-collider-capability-audit | 2/2 | a931fabc, e92f2cf7 | `docs/HADRON_COLLIDER_POC_READINESS_AUDIT.md` |
| claude/hazard-module-registry | 2/2 | 4ff08bde, 0ca74d90 | `core/hazard/earthquake/earthquakeWorldProjection.ts`, `__tests__/hazardModuleRegistry.test.ts`. Catalogue keeps Earthquake "Demo only", SYNTHETIC. |
| claude/matrix-foundation-sprint | 2/2 | a16e1bbb, be6887b8 | `core/matrixFoundation/*`; the O(1) id index is on main (`core/events/eventRegistry.ts:33` `eventsById = new Map`), with `__tests__/eventRegistryScaling.test.ts` |
| claude/matrix-world-poc-readiness-audit | 1/1 | ecf44ae9 | `docs/MATRIX_WORLD_POC_READINESS_AUDIT.md` |
| claude/model-observation-pairs | 1/1 | 385ec198 | `docs/GENESIS_VALID_MODEL_OBSERVATION_CANDIDATES.md` |
| claude/next-audit-be9c56f | 1/1 | 419e1cbb | `__tests__/evidenceReplayVolatility.test.ts` |
| claude/observer-junction-scene | 1/1 | 36464523 | `core/reality/sceneCapture.ts`, `components/RealityNavigator.tsx`, `__tests__/realitySceneCapture.test.ts` |
| claude/project-thread-2wdmhf | 6/5 | 4b2ba665, a4ecfc18, 4e2da311, 1b943e36, 887c54cc | The GLP-1R source data is **byte-identical** on main (tree `f5953613` for `docs/evidence/source-data/glp1r-2026-10-03-d156`). A content diff `origin/main` → branch is all deletions (main holds the full Run 8/Run 9 material the branch only drafted) plus one removed `.gitattributes` line. Run 9 was not touched. |
| claude/quantum-tunneling-audit | 1/1 | a0ec0375 | `labs/experiments/quantum-bloch.ts` (`stepBlochVectorLength`, `probabilityOfZero`, `collapseByMeasurement`), `__tests__/blochDecoherenceModel.test.ts` |
| claude/test-quality-review | 1/1 | 680c4ef8 | The replay false-green is fixed on main: `core/discovery/discoveryReplay.ts:28` `HOSPITAL_FIELDS`, `:54` the hospital comparison, `:66` `describeDifference` (no `a → a`), `:84` the real field difference beside `firstDifferingDay`; `__tests__/replayDriftCoverage.test.ts`; **D-161**. |
| manus/high-fidelity-epidemic-digital-twin | 7/7 | b5f0870e, 0bcf36a3, 1b0fcc7f, 898a362c, 10a4de35, d0ca7c12 | Both user-visible "TODO" strings are gone from main (`ScienceChat.tsx`, `core/scienceChat/resolveCommand.ts`); the fail-closed evidence work is on main as different code. |

### 3.4 ABSORBED_BY_NEWER_IMPLEMENTATION (7)

| Branch | c/u | Commits | What was superseded, and by what |
|---|---|---|---|
| claude/genesis-autonomous-completion-95bt4e | 2/1 | 4e28eaa6 | Everything real on this branch is on main (`core/worldModel/generation/geometry/*` 9 files, `queries/worldQueries.ts`, `specification/worldInvariants.ts`, `scientificFacilityPopulation.ts`, `__tests__/worldModelGeometryGeneration.test.ts`, `winnerGateBypassAudit.test.ts`, `d109Trial2Readiness.test.mjs`, `scripts/d109-trial2-readiness.mjs`). The only delta left is the `campaign/giprQsar.mjs` **header comment**, and main's version is the newer and more accurate one (it states the D-081a pin, 233 rows / 219 structures / 72 scaffolds, nTrain=146 vs MIN_TRAIN=150, nTest=24 vs MIN_TEST=40, and that the gate must not move). Nothing to port. |
| claude/persistence-integrity-hardening | 2/2 | 47c1cdb8, 43981e1e | Store collection boundary / `__proto__` → `core/provenance/recordStore.ts` (`UNSAFE_RECORD_IDS`, `Object.hasOwn`); `HazardInput` shape validation → `hazardProvenanceStore.ts::isHazardInputRecord`. |
| claude/quantum-forge-p845ux | 3/2 | 4fe3c3b0, 99e0c140, 3f70d064 | OSM import out of the public barrel → the barrel now exports only the pure `normalizeOsmMapXml`; the Markdown exclusion in the whitespace gate is on main's CI. |
| claude/research-launcher-nrboog | 1/1 | c6b454de | `components/ResearchLauncher.tsx` replaced by the research console domain choice (PR #69) and the Ask engine choice (PR #33). PR #31 was closed unmerged. |
| claude/temporal-engine-phase-1 | 96/91 | 1da03685, 62110ce5, 5cc92812, 77d31585, 53c8be14, cf0059d4, … | Archived at `legacy/temporal-engine-2026-09/`. The Epistemic Engine / hypothesis generator / parameter fitting are superseded by the backend **ResearchRun** loop plus `core/agent`; the molecular spike by `campaign/*` + `compute/rdkitAdapter.mjs`; the multiverse-branch-to-Evidence piece is on main (`core/simulation/temporalMultiverse.ts`, `__tests__/multiverseEvidence*.test.ts`, `temporalMultiversePreregistration.test.ts`). Residual reference-only: the blind discovery benchmark and `ParameterizedModelFamily` fitting. Automotive claims auditor (`858a6663`) is a different product. |
| claude/usgs-contract-validation | 1/1 | 3c3d1c9b | `__tests__/waterModelObservationBoundary.test.ts` exists on main as main's own version of the boundary test. |
| manus/visual-p1-world | 50/50 | fb665d95, 12fd26f5, a0775023, cf9b207a, 75dede95, 1be5b42a, … | Archived at `legacy/manus-visual-p1-world-2026-08/`. Experiment Fabric v0 (preregistered protocols on the backend, research packets, backend replay receipt, human review decision) is exactly what the backend **ResearchRun** loop now does — see `docs/genesis1/ONE-BRAIN.md` §1. Residual reference-only: the CERN geometry source-asset admission (`ea294273`, `c1ec3a13`). |

### 3.5 DUPLICATE (7)

| Branch | c/u | Commits | Duplicate of |
|---|---|---|---|
| claude/atom-bohr-benchmark-admission | 1/1 | 6d8df376 | `claude/atom-bohr-benchmark-admission-v2` `d62529ae` — same doc, v1 (262 lines vs 302) |
| claude/campaign-evidence-interop | 3/3 | 1aae869d, e589df99, d14795ed | `1aae869d` is the same patch as `claude/ab-counterfactual` `9b4ca0a4`; the RO-Crate export (`e589df99`) is on main in `ExperimentPilotScreen.tsx`. `d14795ed` ("reach Campaign from natural phrases") has no equivalent and no consumer after ResearchRun — reference only. |
| claude/genesis-event-contract | 1/1 | fcf11ee9 | `claude/genesis-event-contract-rebased` (the branch that was merged); 9 files vs 19 |
| claude/genesis-universe-engine-integration | 11/11 | 2d521802, 0bd129bc, ac4a7d9e, 57ccf2f6, afe94b07, 3224cf4d, … | Strict subset of `claude/genesis-spacetime-universe-integration` (same `2d521802` residue, same `codex-handoff/` pack) |
| claude/genesis-virtual-lab-completion | 3/3 | b25a8ba5, e1de3f3f, 866171d8 | Subset of `claude/genesis-virtual-lab-engine-bindings` (which adds `b0d49dbf`) |
| genesis/main | 174/174 | 87ea6d0a, c2b8b79f, f7cd1c82, bddc66eb, a16c2d3b, dac96546, … | Identical SHA head to `claude/genesis-takeover-audit-kpz019` (`87ea6d0a`) |
| manus/product-access-control | 71/60 | 6f63215e, 258b8847, 5a6b98fb, e55d082b, d48aef0c, 5dfbeeff, … | `claude/temporal-engine-phase-1` plus the PR #6 cherry-pick. Its own contribution (`access.mjs`, `access.test.mjs`, research access control, audit trail) is on main. |

### 3.6 OBSOLETE (5)

| Branch | c/u | Commits | Why |
|---|---|---|---|
| astra/human-explorer-visual-ceiling | 2/2 | 83d36900, 7740f886 | The UI work is on main; the two review scripts came in with PR #75. What is left on the branch is **54 screenshots + 4 report JSON** under `artifacts/human-visual-ceiling/` (≈14k inserted lines) — a point-in-time visual record, not code. |
| claude/genesis-c1-visual-snapshot | 2/2 | 3444a900, 0efeb774 | Code archived at `legacy/c1-visual-snapshot-2026-09-21/`; the standalone parts shipped as D-135–D-137; the owner chose one Laboratory, so the 7-room/8th-room variant is not revived; in-browser docking was rejected. What remains is ≈64 MB of `artifacts/visual-regression-audit/` screenshots and diffs. |
| claude/genesis-takeover-audit-kpz019 | 174/174 | 87ea6d0a, c2b8b79f, f7cd1c82, bddc66eb, a16c2d3b, dac96546, … | The old July Genesis lineage (ZEFIR Truth Engine, cognitive/corpus, Stripe billing, longevity reasoning). Unique paths archived at `legacy/genesis-2026-07/`. Its versions of shared files (`api.mjs` +767, `store.mjs` +1378, `client.ts`) exist only here and are needed only if billing is ever revived from it. PR #2 is still open; closing it is an owner decision. |
| claude/p2p-agent-movex-builder-tu22tm | 58/58 | 29ea8be0, fe8eb47e, c78dc356, 486eb6d9, 85830544, 4b4934da, … | The MoveX P2P logistics app — a separate product, archived at `legacy/movex-2026-07/`. PR #1 open; close it or move it to its own repo (owner decision). |
| claude/earthquake-envelope-hardening | 9/9 | a06ec6aa, 0d453a83, 9e831c4f, 0edd6d99, 0fdbd84c, eca3e6e1, … | Hardening of a **demo-only** module: freezing `SYNTHETIC_EXPOSURE_SITES` (on main it is `readonly`-typed at `core/hazard/earthquake/earthquakeExposure.ts:17` but not `Object.freeze`d) and a block-code matrix. Earthquake is "Demo only / SYNTHETIC" by owner rule, so this is effort spent on something that is not product. If the demo is ever promoted, this branch is where the envelope work is. |

### 3.7 ARCHITECTURALLY_INVALID (5)

| Branch | c/u | Commits | Why it must not be revived |
|---|---|---|---|
| claude/genesis-10h-execution | 2/2 | ede52f70, 9735c3cc | `9735c3cc` wires Science Chat to an Earthquake Command Center (`__tests__/earthquakeScienceChatRouting.test.ts`, `hazardScenarioHandoff.test.ts`). It would present a **synthetic** crisis model through the research chat, which is the one place a number must be real. Reject. |
| claude/genesis-overnight-science-completion | 12/12 | b95373f2, ab7f10c3, 0bd129bc, ac4a7d9e, 57ccf2f6, afe94b07, … | The science content is on main (shared with `genesis-final-science-integration`). The residue is the cyber-kernel wiring and finding lifecycle (`b95373f2`, `ab7f10c3`), rejected by an earlier audit for this release. Keep rejected. |
| claude/genesis-spacetime-universe-integration | 14/14 | a3af2b8a, 9649263b, 19cab803, 2d521802, 0bd129bc, ac4a7d9e, … | Residue in `2d521802`: speculative spacetime (wormholes, paradox), `painResearchUseCase.ts` (main has a different `experimentFabric/painResearch.ts`; "no pain model" stands), and `metaCognition/epistemicStatus.ts` — a **second epistemic-status taxonomy**, which is precisely the duplicate-architecture failure ONE-BRAIN.md forbids. Also carries the `codex-handoff/` pack below. |
| claude/genesis-winner-gate-audit-qgf90v-transfer-handoff | 4/4 | be203fe4, 7fcbde14, 5f9f8878, db519a19 | `codex-handoff/genesis-engine-suite-e2e-v1/` + `…mega-pack-v2/` are a **standalone second brain**: their own `src/candidateEngine/engine.ts`, `src/drugDiscovery/{engine,winnerGate}.ts`, `src/experimentPlanner/planner.ts` and — fatally — their own `src/evidenceReplay/{ledger,replay}.ts`. That is a second evidence ledger and a second replay authority in one package. The branch's own last commit (`be203fe4`, "remove ALLOWED_ORPHANS-silenced production src, move to codex-handoff") records that it was already taken out of production source. Keep it as a transfer artefact; never wire it in. Its `winnerGate.ts` is **not** a port candidate for the canonical winner gate (`core/orchestrator/orchestrator.ts`); flagged here only so the candidate-pipeline owner knows it exists. |
| staging/qwen-cyber-foundation-unreviewed | 3/3 | de565414, 7089ad3b, 8f920a8e | Externally supplied cyber "governance primitives" with attack paths against a synthetic target. Already rejected on main, where the raw text is quarantined at `docs/unreviewed-external/qwen-cyber-foundation/`. Reject. |

### 3.8 ACTIVE_WORK_ALREADY_OWNED (1)

| Branch | c/u | Commits | Owner / status |
|---|---|---|---|
| claude/human-explorer-mobile-tap-nrboog | 9/6 | 59e3822f, ca217da5, a707f2e6, 7e142901, d5cdf995, ffa6985a, ed46e56a, 389da869, 9e5ce31c | **The live integration branch.** Holds the candidate pipeline / winner gate / chemistry handoff (merge `a707f2e6` of `g1/candidate-pipeline`), the time-to-discovery instrumentation and schema **v17** (`389da869`, `ffa6985a`, `d5cdf995`, D-163), the sealed D-162 GLP-1R applicability-domain probe (`9e5ce31c`, `ed46e56a`) and the first 25 architectural invariant tests (`59e3822f`). Another agent owns all of it. This audit branch is a descendant of `59e3822f`, so it merges without conflict; nothing in that area was ported or changed here. |

### 3.9 NEEDS_PORT (2)

| Branch | c/u | Commits | Item |
|---|---|---|---|
| claude/grant-readiness-consolidation-rj04ng | 4/4 | 3fce2f37, 2094e922, 9427e184, 7f47aa34 | **NP-1** — remote advance + fan-out over the worker API, `remoteWorkerProtocol.mjs`, `listRemoteWorkers`, Flight Control view, `remoteWorkerTestKit.mjs`, `remoteFanOutAdvance.e2e.test.mjs`. This is **open PR #84**: review-and-merge, not a port. Full breakdown in §2. |
| claude/chemistry-discovery-verify-i30c1u | 1/1 | c46de7b9 | **NP-2** — `chemistryLeverCatalog.test.ts` + `worldDiscoveryChemistryMemory.test.ts`. Blocker: main's catalogue has a different exported API and a different lever set; porting is a rewrite plus one science decision. Full breakdown in §2. |

---

## 4. Pull requests

**85 PR numbers exist; 76 are pull requests** (45–53 are issues, not PRs — the same gap the previous
pass recorded). Of the 76: **72 merged, 3 open, 1 closed unmerged.** Read from
`repos/mariusz8789-sudo/Elion-Replit-grudzien-5rano/pulls?state=all`.

**#85 was merged at 2026-10-04T01:29:51Z, while this audit was being written.** It is listed below
as it stood when read, because its branch is this audit's base; the counts above are the state after
that merge.

### 4.1 Open and just-merged PRs (4 read; 3 still open)

| PR | Head branch | Head | Title | Verdict |
|---|---|---|---|---|
| **#85** (merged mid-audit) | claude/human-explorer-mobile-tap-nrboog | 59e3822f | Time-to-discovery benchmark and the GLP-1R applicability-domain probe | **ACTIVE_WORK_ALREADY_OWNED** → **merged 01:29:51Z.** 13 files. The candidate pipeline / winner gate / chemistry handoff / schema v17 / D-162 / D-163 work of another agent. Not reviewed or touched here. This audit branch is a descendant of its head, so it merges without conflict. The branch keeps the class because it remains the live integration line, not because the work is unintegrated. |
| **#84** | claude/grant-readiness-consolidation-rj04ng | 3fce2f37 | Remote advance and fan-out over the worker API, remote worker list in Flight Control | **NEEDS_PORT = NP-1, as a review-and-merge.** +1022/−327, 19 files, `mergeable: true`, `mergeable_state: unstable` (a check is failing or pending). **This is the single highest-value unintegrated item in the repository.** Full breakdown in §2. Area: remote-worker / engine integration. |
| **#2** | claude/genesis-takeover-audit-kpz019 | 87ea6d0a | Genesis OS Etap 0: fundament — 10 laboratoriów, Scale Journey, Narrator AI | **OBSOLETE.** Opened 2026-09; the old July Genesis lineage, 174 commits, 475 files, +66,969 lines. Unique paths already archived at `legacy/genesis-2026-07/`. Keeping it open implies it is a candidate. Recommend: close with a pointer to the archive (owner decision). |
| **#1** | claude/p2p-agent-movex-builder-tu22tm | 29ea8be0 | Rebuild repo as the Point-to-Point P2P logistics app | **OBSOLETE for Genesis.** A different product; archived at `legacy/movex-2026-07/`. Recommend: close, or move to its own repository (owner decision). |

### 4.2 Closed but NOT merged (1)

| PR | Head branch | Head | Closed | Verdict |
|---|---|---|---|---|
| **#31** | claude/research-launcher-nrboog | c6b454de | 2026-09-29 | **ABSORBED_BY_NEWER_IMPLEMENTATION.** 9 files; `components/ResearchLauncher.tsx` ("five topics from one navigation model") was superseded by the research-console domain choice in **#69** and the Ask engine choice in **#33**, both merged. Nothing to recover. |

That is the whole closed-unmerged set — there is no second place where a rejected PR could be
hiding, because every other number in 1–85 is either merged or one of the four open ones above.

### 4.3 The owner's named recovery areas, checked against the PR history

| Area | Merged and on main | Outstanding |
|---|---|---|
| **recovery** | #13 "Recover work that existed only on unmerged branches", #78 "recovered work from old branches" | none |
| **consolidation** | #58, #59 (Completion Matrix), #66, #70 (central state audit), #10 (P0 consolidation), #22 (real lab) | none |
| **grant** | #15 (Reviewer Room + 85-complex docking benchmark), #16, #20 (grant readiness), #21 (CSRN public-key infrastructure) | none. Note: #20/#21 were written in a vocabulary the current rules forbid — **there is no CSRN key**, so nothing may be described in those terms; the canonical customer-facing check is Genesis Verify (`genesisVerify.mjs`), which compares a file hash, provenance completeness, the ledger anchor and a replay, and returns `MATCH / DRIFT / TAMPERED / BLOCKED`. |
| **visual** | #8 (investor demo), #27, #28, #32 (Start), #64, #65 (visual QA), #34, #35, #29 (Human Explorer) | artefact-only leftovers: `astra/human-explorer-visual-ceiling` (54 screenshots), `claude/genesis-c1-visual-snapshot` (≈64 MB) — OBSOLETE, §3.6 |
| **candidate** | #19 (HERO drug finalist, D-146…D-150), #36 (candidate → receptor → cell → lab → measurement gap check), #60 (D-153), #79 (candidate → laboratory loop), #85 (merged mid-audit: the candidate pipeline, winner gate, chemistry handoff, D-162/D-163) | none |
| **research** | #43, #44, #54 (R1-a/R1-b/R1-c: the whole canonical loop), #55 (Astra evidence projection), #57, #73 (literature), #61, #63, #68, #76, #77 (ResearchRun queue, five engines, advance) | #84 (remote advance/fan-out) |
| **world** | #3, #4, #5, #7 (Manus world runtime + discovery loop), #17 (BodyParts3D atlas), #42 (epistemic status per lab scene) | none |
| **UI** | #25 (mobile Start), #30 (menu), #33 (Ask engine choice), #67, #69 (language), #82, #83 (specialist screens, Lab handoff, Reports) | none |
| **remote-worker** | #81 (remote ResearchRun worker over HTTP: lease, heartbeat, artifact return, takeover) | **#84** — the advance and fan-out half of the same system |

**Agent-family closure.** Manus: 4 PRs (#3, #4, #5, #7), all merged; nothing of Manus's is outside
canonical Genesis except the two reference-only residues named in §3.4 (`visual-p1-world`'s CERN
geometry source-asset admission) — its Experiment Fabric v0 is what ResearchRun now is. Sol/Codex:
#56 merged (`security: gate heavy scientific execution`); the BodyParts3D handoff files are
byte-identical on main; nothing outstanding. Astra: #55 merged; the visual-ceiling screenshots are
the only leftover and they are artefacts, not code. Claude: everything outstanding is the two
NEEDS_PORT items and the two obsolete open PRs above.

---

## 5. What this branch changed

| Change | Why |
|---|---|
| `docs/genesis1/ONE-BRAIN.md` (new) | Task B: the canonical loop with file:line evidence per hop, a verdict per invariant, and the three RED items. The invariant test file already pointed at it. |
| `packages/backend/src/architecturalInvariants.test.mjs` 25 → **40** tests | Added invariant 8 (one stage-timing authority, `discoveryTiming.mjs` / schema v17, 5 tests), invariant 9 (one schema authority, 2), invariant 10 (the browser-local Discovery Engine stays contained, 5), invariant 11 (the two worker systems do not merge, 2) and one test in invariant 7 (a ResearchRun is started from the HTTP seam only). No inherited allowlist or verdict was wrong; none was changed. |
| `packages/frontend/src/__tests__/universeLabsScienceChatRouting.test.ts` (ported) | `claude/genesis-phase3-science-labs` `e33f1606`, taken unchanged. It is the missing regression proof that natural language actually reaches the four Universe models already registered in `ROUTER_MODELS` (Kepler, three-body, Hubble tension, Lorenz), including the refusal of an out-of-contract preset and determinism across repeated runs. 6 tests, passing without adaptation. |
| `docs/genesis1/RECOVERY-MATRIX.md` (this file) | Rewritten as one row per branch against the current base, with a class for all 124 branches (UNREVIEWED = 0), a per-namespace breakdown, and the pull-request audit in §4 (80 PRs: 75 merged, 4 open, 1 closed unmerged) including the owner's nine named recovery areas. |
| `docs/DECISIONS.md` | **D-165** (below). |

Nothing in production source was edited. Nothing was removed or redirected: the one genuine duplicate
architecture (the browser-local Discovery Engine) is not a small, safe, mechanical change, and is
reported as a RED_INTEGRATION item in `ONE-BRAIN.md` §4 instead.

Not touched, by rule: `docs/evidence/run8-status.json`, the Run 8 / Run 9 preregistration, Run 9
(computing). No branch was deleted; nothing was pushed.

---

## 6. Closed since the 2026-10-03 pass

All nine NEEDS_PORT items and both NEEDS_FINISHING items of the previous pass are on main:

| Previous item | Now |
|---|---|
| 1. Replay false-green (`discoveryReplay`) | main `core/discovery/discoveryReplay.ts:28`, `:54`, `:66`, `:84`; D-161 |
| 2. PR #75 (Evidence Pack, Genesis Verify, Flight Control, monetization doc) | merged; main has `genesisVerify.mjs`, `researchRunEvidencePack.mjs` |
| 3. PR #74 → merged as **PR #81** (ResearchRun fan-out) | main `researchRunFanOut.mjs`, `researchRunFanOut.test.mjs` — but see **NP-1** for the three commits left behind on that branch |
| 4. User-visible "TODO" in chat | both strings gone from main |
| 5. Event registry O(1) index | main `core/events/eventRegistry.ts:33`; `eventRegistryScaling.test.ts` |
| 6. Replay volatility probe | main `__tests__/evidenceReplayVolatility.test.ts` |
| 7. Pilot A/B counterfactual | main `core/experimentFabric/protocolArmComparison.ts`, `pilotProtocolArmComparison.test.ts` |
| 8. Multiverse branch → Evidence/lineage | main `core/simulation/temporalMultiverse.ts` + 6 multiverse tests |
| 9. Scientific Core extractions (double-slit, Bloch) | main `doubleSlitModel.test.ts`, `blochDecoherenceModel.test.ts` |
| 10. Reality Navigator scene capture/replay | main `core/reality/sceneCapture.ts`, `realitySceneCapture.test.ts` |
| 11a. `universeLabsScienceChatRouting.test.ts` | **ported on this branch** (§5) |
| 11b. chemistry lever catalogue tests | still open — **NP-2**, with the blocker measured |
| The previous pass's §7, `core/evidence/evidenceContainer.ts` vs Genesis Verify | closed on `g1/recovery-b` `0a070ad9`: Genesis Verify is canonical. Standing suggestion unchanged: mark `core/evidence/*` INTERNAL/DEPRECATED, or delete it once an offline Genesis Verify CLI over an execution bundle exists. |

Still-standing notes from that pass that this one does not repeat: the forgotten-on-main route list
(`#/monetize`, `#/character`, `#/concept`, the canvas labs), the `ALLOWED_ORPHANS` inventory (D-136
medical data, D-140 real lab's 20 modules, D-135 anatomy networks, the ENTITY seams) and the
monetization material inventory. They are about main's own reachability, not about branches, and
nothing in this pass changed them.

---

## 7. D-165

Recorded in `docs/DECISIONS.md`.
