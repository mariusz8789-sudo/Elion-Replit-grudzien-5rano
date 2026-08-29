# GENESIS Main Roadmap Handoff

## Checkpoint state

- **CURRENT HEAD:** `5881521`
- **CURRENT BRANCH:** `manus/next-gap-observation-analysis`
- **CURRENT LIVE:** `origin/main = 9ad75f3` (unchanged)
- **WORKING TREE:** clean at handoff preparation; final verification required after this documentation update
- **PUSH:** branch synchronized with `origin/manus/next-gap-observation-analysis`

Do not restart or perform a broad repository audit. Verify only the current branch, HEAD, status and the specific files named in the next GAP.

## Completed commits in this series

- `092c6aa` — `feat(biotech): pin ChEMBL caffeine bioactivity`
- `a1050ca` — `feat(biotech): expose ChEMBL evidence in fabric`
- `076cb87` — `feat(memory): persist experiment fabric runs`
- `a3f0d79` — `feat(science-chat): surface biotech evidence`
- `97d0631` — `feat(memory-ui): expose fabric provenance`
- `805e41b` — `feat(memory): route saved runs from science chat`
- `0a740ab` — `feat(biotech): connect pinned record to discovery`
- `429a3be` — `feat(core): surface honest result analysis`
- `322a369` — `feat(core): carry provenance into world handoff`
- `f2aec5f` — `feat(core): surface replay identity in memory`
- `d749715` — `docs(core): confirm evidence replay boundary`
- `22fd2f4` — `docs(core): verify protocol replay path`
- `3579f64` — `docs(core): verify model request boundary`
- `fe7491d` — `feat(core): unify scientific result report`
- `7a9e016` — `feat(core): include evidence replay report status`
- `4fd50e6` — `feat(core): keep pilot report analysis consistent`
- `1c4655f` — `feat(core): preserve saved result routes`
- `83d41cc` — `feat(core): carry result summary into world`
- `9b8a772` — `feat(core): preserve world result continuity`
- `1f44a79` — `feat(drug-discovery): expose pinned molecular properties`
- `94aec37` — `feat(drug-discovery): mark safety as unknown`
- `8455d34` — `feat(drug-discovery): expose candidate validation path`
- `77c0d9f` — `feat(drug-discovery): persist discovery context`
- `f60694b` — `feat(drug-discovery): add pinned GHS safety signal`
- `b314b68` — `feat(drug-discovery): surface safety provenance`
- `f6a4e9d` — `feat(drug-discovery): add pinned adme properties`
- `9c6ff74` — `feat(drug-discovery): compare candidate reports`
- `ba2ec82` — `feat(drug-discovery): surface pinned reference`
- `5881521` — `feat(drug-discovery): wire comparison status`

## Completed capability: Result → Analysis → Scientific Memory

The existing `Scientific Memory` now exposes `saveExperimentRunToMemory(run)`. It persists an existing `ExperimentRun` through the existing `saveExperiment` contract, preserving request parameters, finite numeric/series outputs, run status, run ID, run fingerprint, result origin, model ID, engine, model version, summary, warnings and assumptions.

The helper writes two explicit analysis blocks: the Fabric result summary and, when present, the warnings. It does not upgrade status: a completed real engine run remains `completed`/`real-engine`, while a biotech knowledge result remains `knowledge_only`/`knowledge-only` and `epistemicStatus=UNKNOWN`. No new Memory, Evidence or Replay system was created.

Changed files for this piece:

- `packages/frontend/src/core/scienceMemory.ts` — `saveExperimentRunToMemory`.
- `packages/frontend/src/__tests__/scienceMemoryFabric.test.ts` — round-trip tests for a real executable model and a knowledge-only biotech run.

## Validation

The following completed successfully after this piece:

```text
npm run test --workspace=packages/frontend -- --run src/__tests__/scienceMemoryFabric.test.ts
npm test
npm run build
npm run lint
git diff --check
```

Build reports only the existing Vite large-chunk warning. No UI changed, so Chromium was not required. CI is not claimed green because no CI run was performed in this session.

## Real and designed

Real source-backed data remains the pinned ChEMBL record: caffeine `CHEMBL113`, activity `189031`, target `CHEMBL318` Adenosine receptor A1, assay `CHEMBL876556`, `Ki = 41000.0 nM`, release `ChEMBL_37`. The Fabric and Memory changes are deterministic local mappings; they are not biological execution, clinical efficacy, safety assessment or independent observation.

## Parked

- Biological executor remains `NOT_EXECUTED`/`BLOCKED`.
- Do not promote a single binding record into a full Evidence Pack without hypothesis, baseline/reference, arms, repetition policy, real runs and replay identity.
- Do not create candidate efficacy/safety scores or infer safety from PubChem/ChEMBL activity.
- Canonical replay remains parked; no casts or artificial plan IDs.
- Real independent model ↔ observation comparison remains a larger future gap.
- Double-Slit / Bloch / Atom-Bohr and G3/NIST remain unrelated/out of scope.

## Completed capability: source-bound result in Science Chat UI

The existing Science Chat now handles `biotechnology` requests through the pinned ChEMBL knowledge path instead of presenting an unusable confirmation plan. Matching caffeine/A1/adenosine queries are executed locally as a deterministic `knowledge_only` lookup, saved through `saveExperimentRunToMemory`, and displayed with status, result origin, target identity, evidence identity, evidence status and provenance. No biological executor is invoked. Unrelated biotech targets remain explicitly unavailable and do not receive unrelated evidence.

Changed file: `packages/frontend/src/components/ScienceChat.tsx`. Added coverage: `packages/frontend/src/__tests__/scienceChatFabricFormat.test.ts`.

Chromium manual check completed on the local frontend: the query `Znajdź naturalnych kandydatów dla targetu A1: kofeina.` displayed `Status: knowledge_only; origin: knowledge-only`, `Adenosine receptor A1`, `chembl:activity:189031`, `LITERATURE_SUPPORTED` and a run provenance fingerprint.

## Completed capability: Scientific Memory UI for Fabric and biotech runs

The existing Scientific Memory screen now renders saved Fabric execution metadata when present: epistemic status, run status, result origin, run ID, run fingerprint, summary, and for biotech records the target candidate ID and evidence IDs. This is a read-only projection of the existing `SavedExperiment` record; it does not create a second memory system, infer efficacy/safety, or turn `knowledge_only` into biological execution.

Changed file: `packages/frontend/src/components/ScientificMemoryScreen.tsx`.

Validation completed: `npm test` (271 passed, 40 skipped, 0 failed), `npm run build`, `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## Completed capability: Science Chat → Scientific Memory route

The existing `Pokaż zapisane` action now includes each saved record’s execution status and result origin in the chat list, then routes to `#/memory` when records exist. This gives the user access to the enriched Scientific Memory projection from the same conversation boundary. Empty memory behavior remains in-chat. No new route or storage layer was created.

Changed file: `packages/frontend/src/components/ScienceChat.tsx`.

Validation completed: `npm test` (271 passed, 40 skipped, 0 failed), `npm run build`, `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## Completed capability: source provenance visibility

The pinned biotech provenance is now visible at both user-facing boundaries. Science Chat shows source, source ID, source version and source URL beside the target/evidence identity. Scientific Memory provides a `Provenance źródeł` disclosure with the same fields and an external source link. This remains read-only provenance; it does not upgrade evidence status or imply efficacy, safety or execution.

Changed files: `packages/frontend/src/components/ScienceChat.tsx`, `packages/frontend/src/components/ScientificMemoryScreen.tsx`.

Validation completed: `npm test` (271 passed, 40 skipped, 0 failed), `npm run build`, `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## Parked semantic blocker: biotech preregistration

The current scientific protocol contract requires executable model requests, baseline/variant arms, repetition policy and real runs. A literature-backed ChEMBL binding record cannot honestly populate those fields. This is parked rather than represented as a false biological protocol.

## Parked source-expansion check

A limited ChEMBL check found additional caffeine/A1 activities with different assay contexts and measures, including duplicate/heterogeneous Ki and IC50 records; one candidate carries a ChEMBL data-validity warning. No second fixture was added because selecting it without a deliberate relation policy would weaken provenance semantics. Source expansion is parked until a clear relation-selection rule and fixture schema exist.

## Completed capability: ChEMBL → Candidate Discovery chain

The pinned caffeine/A1 ChEMBL record now flows through existing contracts into a `TherapeuticCandidate` with `UNKNOWN` status, an explainable research-priority `CandidateRanking` with `PREDICTION` status, a `TherapeuticHypothesis` with `HYPOTHESIS` status, and a `CandidateDiscoveryReport` carrying target/evidence/provenance identities. The chain explicitly does not create efficacy, safety or mechanism claims. No new contract system was introduced.

Changed files: `packages/frontend/src/core/biotechData/chembl.ts`, `packages/frontend/src/__tests__/chembl.test.ts`.

Validation completed: `npm test` (271 passed, 40 skipped, 0 failed), `npm run build`, `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## Biotech status: pause for this session

The remaining Biotech items are parked unless a very small, low-cost integration appears. In particular, safety needs a real source and explicit uncertainty, while preregistration needs an executable biological protocol; neither will be invented here. The additional ChEMBL relation search remains parked because available records are heterogeneous/duplicate and one candidate carries a data-validity warning.

## Completed Core capability: typed result → honest analysis in Science Chat

The existing `formatFabricRun` now renders `analyzeExperimentResult(run.result)` beside the typed result, status, origin, outputs and provenance. For a real completed run it states that the analysis covers one result and does not infer trends; for `knowledge_only` or other non-completed statuses it remains explicitly blocked. No new analysis contract or solver was added.

Changed file: `packages/frontend/src/components/ScienceChat.tsx`.

Validation completed: targeted formatter/memory tests, then `npm test` (271 passed, 40 skipped, 0 failed), `npm run build`, `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## Completed Core capability: real result → World/3D provenance handoff

The existing `epidemic-city` World handoff now carries the original run fingerprint and explicit `real-engine` origin together with the original simulation reference. City3D renders a compact real-run provenance readout, so the scene cannot silently appear as a disconnected second simulation. No new solver or World state was created.

Changed files: `packages/frontend/src/core/experimentFabric/worldHandoff.ts`, `packages/frontend/src/core/experimentFabric/executor.ts`, `packages/frontend/src/components/visual-simulation/City3DWebGLScreen.tsx`.

Validation completed: targeted Experiment Fabric tests (107 passed), then `npm test` (271 passed, 40 skipped, 0 failed), `npm run build`, `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## Completed Core capability: Evidence/Replay identity → Scientific Memory

Scientific Memory now shows the existing replay identity (`capsuleId`, `planId`, `confirmationId`) alongside an Evidence Pack ID when those fields are present. This is a read-only projection of persisted metadata; it does not create an Evidence Pack from a single run and does not claim replayability where protocol semantics are incomplete.

Changed file: `packages/frontend/src/components/ScientificMemoryScreen.tsx`.

Validation completed: targeted memory tests (18 passed), then `npm test` (271 passed, 40 skipped, 0 failed), `npm run build`, `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## Completed Core capability: Evidence Pack → Replay user boundary confirmed

The existing Scientific Memory already lists local multi-run Evidence Packs, classifies their persisted replay verdict (`MATCH`, `DRIFT` or `BLOCKED`), exposes the stored run count and model identity, and routes `Otwórz do jawnego rerun` back to the existing Experiment Pilot. It also states that a snapshot is not a new backend execution. No additional UI or contract was added because this integration already exists.

This GAP is therefore parked as already satisfied by the current system. No code change was necessary beyond documenting the decision.

## Parked Core GAP: model → independent real observation

The existing `compareBridge` and `experimentComparison` cover model-vs-model or replay/comparison flows, not an independently measured observation. No trustworthy external observation fixture is currently available at this boundary. This is parked to avoid using model inputs, synthetic outputs or a second model as an alleged observation; no new contract was added.

## Completed Core capability: Protocol/A-B → Evidence Pack → Replay persistence verified

The existing Experiment Pilot already creates the multi-run `ScientificEvidencePack`, persists it through `saveScientificEvidencePack`, indexes it through `saveScientificEvidencePackToMemory`, builds the replay capsule, and exposes the replay verdict plus explicit rerun action. This path is not a single-run shortcut and retains the existing real-run validation. No code change was necessary; the result is documented here to avoid duplicating the system.

## Completed Core capability: model selection → Structured Request verified

Experiment Pilot already uses the canonical `buildStructuredRequestFromModel` builder to fill declared defaults, preserve model identity and seed, and feed the resulting `StructuredExperimentRequest` into the existing plan/confirmation/Fabric flow. The builder is covered by the existing Experiment Pilot tests. No duplicate request path was introduced.

## Completed Core capability: unified user-facing scientific result report

Science Chat now presents one explicit `SCIENTIFIC RESULT REPORT` from the existing `ExperimentRun`: original question, selected model, execution status/origin, epistemic classification, typed outputs, existing analysis, route, warnings, source/provenance, Evidence interpretation and Replay boundary. The report distinguishes `EXECUTED_REAL_ENGINE`, `KNOWLEDGE_ONLY_NOT_EXECUTED`, `SCENARIO_OR_HYPOTHETICAL_NOT_MEASUREMENT` and `NOT_EXECUTED_OR_BLOCKED`. It states that a single run is not an Evidence Pack and that Replay requires existing capsule/protocol semantics.

Changed file: `packages/frontend/src/components/ScienceChat.tsx`.

Validation completed: targeted report/ChEMBL tests (6 passed), then `npm test` (271 passed, 40 skipped, 0 failed), `npm run build`, `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## Completed Core capability: confirmed report includes Evidence/A-B/Replay status

The confirmed Science Chat flow now appends Evidence Pack status, A/B status and an explicit Replay status to the same `SCIENTIFIC RESULT REPORT` response. A hypothetical visualization is labeled `NOT_CREATED`/`NOT_AVAILABLE`; ordinary single-run confirmations remain `PROTOCOL_REQUIRED`, `VARIANT_REQUIRED` and `NOT_ESTABLISHED` rather than suggesting a completed Evidence Pack or replay. No second reporting system was created.

Changed file: `packages/frontend/src/components/ScienceChat.tsx`.

Validation completed: targeted Science Chat/Experiment Fabric tests (109 passed), then `npm test` (271 passed, 40 skipped, 0 failed), `npm run build`, `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## Completed Core capability: confirmed report analysis in Experiment Pilot

The confirmed result view in Experiment Pilot now renders the same existing `analyzeExperimentResult` blocks used by Science Chat. This keeps summary, typed outputs, honest single-run analysis, warnings, provenance and route in one consistent user-facing flow after confirmation. Non-completed statuses remain blocked by the existing analysis helper. No second reporting system was created.

Changed file: `packages/frontend/src/components/ExperimentPilotScreen.tsx`.

Validation completed: targeted Pilot/Science Chat tests (7 passed), then `npm test` (271 passed, 40 skipped, 0 failed), `npm run build`, `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## Completed Core capability: saved result route preserved across Memory

Scientific Memory now persists the existing `ExperimentRun.result.route` for canonical Fabric runs. Reopening a saved lab result uses the recorded lab route; hypothetical visualization uses its recorded hash; ephemeral `live-world` records are sent to the existing Pilot with an explicit notice instead of incorrectly opening a lab, because the session-bound World instance cannot be reconstructed from local memory alone. Legacy records without route retain the prior fallback. The UI displays the route kind.

Changed files: `packages/frontend/src/core/scienceMemory.ts`, `packages/frontend/src/components/ScientificMemoryScreen.tsx`, `packages/frontend/src/__tests__/scienceMemoryFabric.test.ts`.

Validation completed: targeted Memory tests (18 passed), then `npm test` (271 passed, 40 skipped, 0 failed), `npm run build`, `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## Completed Core capability: result summary preserved in World/3D handoff

The existing real `epidemic-city` handoff now carries the canonical run summary together with runId, fingerprint and `real-engine` origin. City3D displays that summary in the locked same-world provenance panel, so the World view does not silently detach from the user-facing scientific report. The scene and simulation mechanics remain unchanged.

Changed files: `packages/frontend/src/core/experimentFabric/worldHandoff.ts`, `packages/frontend/src/core/experimentFabric/executor.ts`, `packages/frontend/src/components/visual-simulation/City3DWebGLScreen.tsx`.

Validation completed: targeted World/Fabric tests (109 passed), then `npm test` (271 passed, 40 skipped, 0 failed), `npm run build`, `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## Completed drug-discovery capability: PubChem molecular properties → ChEMBL discovery result

The existing pinned PubChem CID 2519 fixture now exposes verified molecular formula `C8H10N4O2`, molecular weight `194.19`, canonical SMILES and InChIKey alongside the existing ChEMBL activity/target/evidence. The ChEMBL discovery mapper verifies PubChem/ChEMBL compound identity, and the existing Science Chat knowledge-only result presents the properties without upgrading them to efficacy, safety or biological execution claims.

Changed files: `packages/frontend/src/core/biotechData/pubchem.ts`, `packages/frontend/src/core/biotechData/chembl.ts`, `packages/frontend/src/core/experimentFabric/executor.ts`.

Validation completed: targeted PubChem/ChEMBL and Science Chat tests (6 passed), then `npm test` (271 passed, 40 skipped, 0 failed), `npm run build`, `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## Completed drug-discovery capability: explicit Safety UNKNOWN boundary

The existing user-facing biotech report now states `Safety / ADME-Tox: UNKNOWN` when the result is biotechnology knowledge-only. The report explicitly says that no source-backed safety record is attached and that the ChEMBL binding record does not establish safety. No arbitrary safety score or unsupported toxicity claim was added.

Changed file: `packages/frontend/src/components/ScienceChat.tsx`.

Validation completed: targeted ChEMBL/Science Chat tests (6 passed), then `npm test` (271 passed, 40 skipped, 0 failed), `npm run build`, `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## Completed drug-discovery capability: candidate → ranking → hypothesis → report → validation path

The existing pinned ChEMBL knowledge-only Fabric result now carries candidate identity/status, deterministic explainable ranking score/status/rationale/uncertainty, hypothesis identity/status, discovery report ID and an explicit `NOT_EXECUTED / BLOCKED — biological executor unavailable` validation path. This reuses the existing `buildPinnedChEMBLCaffeineDiscovery` chain and does not imply efficacy, safety or biological execution.

Changed file: `packages/frontend/src/core/experimentFabric/executor.ts`.

Validation completed: targeted ChEMBL/Science Chat tests (6 passed), then `npm test` (271 passed, 40 skipped, 0 failed), `npm run build`, `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## Completed drug-discovery capability: Candidate → Ranking → Hypothesis → Report → Memory

`saveExperimentRunToMemory` now preserves the existing source-backed biotech chain in the same Scientific Memory record when a Fabric result carries the canonical IDs: candidate ID, hypothesis ID/status, discovery report ID, evidence ID, target/evidence provenance and a deterministic discovery-chain analysis containing ranking status/score/rationale plus the explicit validation path. No second report or memory system was created.

Changed file: `packages/frontend/src/core/scienceMemory.ts`.

Validation completed: targeted Memory/ChEMBL tests (6 passed), then `npm test` (271 passed, 40 skipped, 0 failed), `npm run build`, `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## Completed drug-discovery capability: real PubChem GHS SafetySignal

Added a pinned PubChem PUG View GHS record for caffeine CID 2519 and mapped it through the existing `SafetySignal` contract. The record preserves PubChem source ID/reference, retrieval date, source URL, signal word `Danger`, hazard statements H301/H332/H360, `LITERATURE_SUPPORTED` status, `MODERATE` evidence quality and explicit uncertainty. The existing ChEMBL discovery chain now attaches that safety signal to the candidate, hypothesis and deterministic research-priority ranking; safety remains a hazard-classification signal, not a clinical safety conclusion or efficacy probability.

Changed files: `packages/frontend/src/core/biotechData/pubchem-ghs-2519.json`, `packages/frontend/src/core/biotechData/safety.ts`, `packages/frontend/src/core/biotechData/chembl.ts`.

Validation completed: targeted safety/ChEMBL tests (6 passed), then `npm test` (271 passed, 40 skipped, 0 failed), `npm run build`, `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## Completed drug-discovery capability: SafetySignal in user-facing report

The existing Fabric biotech result now carries the pinned PubChem GHS SafetySignal ID, status, evidence quality, hazard description and source provenance. Science Chat renders this as a safety section with source/source ID/URL and explicitly labels it as hazard classification rather than a clinical safety conclusion. The report falls back to `Safety / ADME-Tox: UNKNOWN` only when no signal is attached.

Changed files: `packages/frontend/src/core/experimentFabric/executor.ts`, `packages/frontend/src/components/ScienceChat.tsx`.

Validation: targeted ChEMBL/Science Chat tests (6 passed); the first full build exposed one optional-URL type error, fixed by normalizing the source URL; rerun full validation passed: `npm test` (271 passed, 40 skipped, 0 failed), `npm run build`, `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## Completed drug-discovery capability: pinned ADME properties foundation

The existing PubChem mapper now carries a pinned PubChem PUG REST record for CID 2519 with XLogP, TPSA, H-bond donor/acceptor counts and rotatable-bond count. The existing biotech Fabric result exposes these fields and their independent source/source ID/source URL. Science Chat renders them as `ADME properties (computed)` and explicitly states they are not an ADME/Tox outcome or clinical prediction. Safety remains separately represented by the pinned GHS SafetySignal; no toxicity or efficacy inference was added.

Changed files: `packages/frontend/src/core/biotechData/pubchem-adme-2519.json`, `packages/frontend/src/core/biotechData/pubchem.ts`, `packages/frontend/src/core/experimentFabric/executor.ts`, `packages/frontend/src/components/ScienceChat.tsx`, `packages/frontend/src/__tests__/chembl.test.ts`.

Validation: `npm test` (272 passed, 40 skipped, 0 failed), `npm run build` (includes `tsc -b`), `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## Completed drug-discovery capability: multi-candidate comparison contract

The existing candidate/discovery contract now exposes `compareCandidateDiscoveryReports(reports)`. It accepts multiple source-backed `CandidateDiscoveryReport` records with their existing deterministic research-priority rankings, rejects missing/mismatched rankings and duplicate candidate IDs, sorts by score with stable candidate-ID tie-break, computes delta-from-top, preserves provenance IDs, and fingerprints the comparison. The output is explicitly `PREDICTION` and states that ordering is research priority only—not efficacy, safety, clinical suitability or probability. No second molecule was fabricated and no biological execution was claimed.

Changed files: `packages/frontend/src/core/biotechDiscoveryContract.ts`, `packages/frontend/src/__tests__/biotechDiscoveryContract.test.ts`.

Validation: targeted contract test and build/typecheck passed; full `npm test` passed (271 passed, 40 skipped, 0 failed), `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## Completed drug-discovery capability: source-backed context in Drug Discovery workspace

The existing `DrugDiscoveryScreen` now shows a read-only pinned reference card above the project-owned backend workspace. It renders the real Caffeine → ChEMBL A1 binding record, PubChem computed ADME properties, deterministic research-priority score and source link. The card explicitly says `knowledge_only`, `LITERATURE_SUPPORTED` applies to the binding record, `PREDICTION` applies only to research priority, and no biological experiment was executed. Project candidates/pasports remain separate; no duplicate candidate contract or backend record was created.

Changed file: `packages/frontend/src/components/DrugDiscoveryScreen.tsx`.

Validation: targeted ChEMBL/contract tests (14 passed), initial build caught and corrected an incorrect `activity` access; corrected targeted tests and build passed, then full `npm test` (271 passed, 40 skipped, 0 failed), `npm run lint`, and `git diff --check`. Build retains only the existing Vite large-chunk warning.

## NEXT PRIORITY — Genesis core integration

The source-backed UI card now calls the existing multi-candidate comparator with the one available pinned report and displays `NOT_ESTABLISHED · requires ≥2 comparable reports`; this is an honest one-candidate state, not a comparison claim.

Biotech discovery is now a source-backed foundation with UI exposure. Switch focus back to the main Genesis loop. The highest-value parked item is model → independent real observation comparison. An existing pinned USGS public-real-data fixture is replayable and provenance-complete (`USGS-01646500`, discharge parameter `00060`, provisional, 10 observations), but its own contract marks `genesisModelComparisonStatus=VERIFY_REQUIRED`: the current Genesis models do not predict open-channel stream discharge, so the fixture cannot honestly be compared to them. Keep this parked rather than relabeling an exogenous input or model output as an observation. Next core work should target a truly compatible observation/model pair or another integration GAP.

## Completed drug-discovery capability: comparator wired into UI boundary

`DrugDiscoveryScreen` now invokes `compareCandidateDiscoveryReports` for the available pinned report and surfaces the resulting one-candidate state next to the research-priority prediction. The UI does not claim a two-candidate comparison until at least two comparable source-backed reports exist.

Changed file: `packages/frontend/src/components/DrugDiscoveryScreen.tsx`.

Validation: targeted tests and build/typecheck passed; full `npm test` (271 passed, 40 skipped, 0 failed), `npm run lint`, and `git diff --check` passed. Build retains only the existing Vite large-chunk warning.

## Observation investigation result

The repository already contains `docs/evidence/usgs/USGS-01646500-00060-normalized-observation.json` plus raw payload and station metadata. Its tests verify real station/series identity, units, timestamps, quality fields, pinned hashes, deterministic replay drift detection and the explicit incompatibility reason. No new adapter was added because the existing comparison surface is epidemic model-vs-model, while the available USGS series is hydrology and the current pump-pipe model treats flow as an input rather than predicting stream discharge.

## Conservative readiness levels (orientational)

These are approximate readiness assessments, not measured coverage percentages: Knowledge **~85%**, Engines / Models **~75%**, Experiment Fabric **~85%**, Evidence / Replay **~80%**, World / 3D **~75%**, Science Chat **~85%**, End-to-End **~80%**, Biotech Foundation **~85%**, Real Drug Discovery **~70%**, and Model ↔ Real Observation **~25%**. The lower drug-discovery level reflects the absence of a validated biological executor and full ADME/Tox outcomes. The lower observation level reflects the absence of a semantically compatible model/independent observation pair.

## What is actually working

The working Genesis path is Science Chat → Structured Request → model selection → Experiment Fabric → existing executor → real typed result or explicit knowledge-only result → honest analysis → World/3D handoff where semantically valid → evidence/provenance → Scientific Memory → replay boundary. Protocol/A-B multi-run Evidence Pack creation, persisted replay verdicts and explicit rerun boundaries already exist. The biotech path is PubChem compound identity → ChEMBL bioactivity → BiologicalTarget/BiologicalEvidence → candidate → research-priority ranking → hypothesis/discovery report → PubChem GHS hazard signal → pinned ADME properties → multi-candidate comparison contract → user-facing Drug Discovery workspace.

## Scientific integrity boundaries

PubChem and ChEMBL are real pinned sources. Safety is a real hazard classification, not a complete clinical safety assessment. ADME currently means pinned molecular properties, not a full ADME/Tox outcome. Drug Discovery has a demonstrable source-backed workflow, but not a validated drug-discovery engine. Model ↔ independent real observation is not closed. The pinned USGS observation must remain `VERIFY_REQUIRED`; it is not ground truth for the current models because the semantic variables do not match.

## Next large gaps

1. Result → existing World/3D visualization with a real result only where mapping is semantically valid.
2. Minimal preregistered protocol/A-B contract with hypothesis, baseline/reference, arms, repetition policy, execution and replay; park if semantics are insufficient.
3. Infrastructure for the first genuine model ↔ independent real observation comparison; never use model inputs as observations.
4. Continue pinned real-source expansion with provenance rather than live scraper sprawl.

## Final stop checkpoint for the next Manus

Do not start from the beginning and do not repeat closed GAPs. Start with the current branch and this handoff. The next large GAP is **MODEL ↔ INDEPENDENT REAL OBSERVATION**: find a genuinely compatible pair, then implement `MODEL → PREDICTION ↔ INDEPENDENT REAL OBSERVATION → COMPARISON → MATCH / DRIFT / INCONCLUSIVE → CALIBRATION`. Do not use model inputs, synthetic outputs, unrelated USGS discharge, another model, invented observations, unsupported efficacy/safety, fictional DOIs or probabilities. If no compatible pair is found, park it with the exact semantic blocker and move to the next valuable core integration.

The current repo already contains the functioning Core and real PubChem + ChEMBL chain. After the observation work, return to Biotech and move Real Drug Discovery toward ~90% through real demonstrable capability, not contract count. Work in large pieces: implement → test → commit → push → handoff → next.

## Exact continuation instruction

Confirm branch, HEAD, status and `origin/main`. Read this handoff. Inspect only the current Science Chat/UI result boundary and relevant tests. Implement one large, logically complete GAP; run targeted tests, full tests as needed, typecheck/build, lint and `git diff --check`; update this handoff; commit; push; then continue to the next GAP. Never create ZIP files. If interrupted, first make the current scope consistent, test it, update this handoff, commit and push.

## Completed Core capability: AME2020 → nuclear SEMF observation admission

The existing `nuclear-semf` model now has a minimal source-backed observation adapter for the first compatible model/observation pair. The pinned official AME2020 `mass_1.mas20` raw file is stored at `docs/evidence/ame2020/mass_1.mas20.txt` with SHA-256 `e8599c6d7f724fac91934e59f1b9de8fb8f63e820f4b39456b790665ed2a3307`. The admission fixture selects Fe-56, Ni-62 and Pb-208 before comparison and preserves source units, uncertainty, source lines, transformation identity and estimated-value semantics.

`packages/frontend/src/core/observation/nuclearAme2020.ts` reuses the existing `semfBindingPerNucleon`, `canonicalJson` and `fnv1a` utilities. It produces per-nuclide prediction, independent observation, absolute/relative error, declared model-error tolerance, `MATCH`/`DRIFT`/`INCONCLUSIVE`, provenance fingerprint, aggregate MAE/RMSE and an explicit `INSUFFICIENT_DATA` calibration status. Estimated records are never treated as measurements. No second Evidence, Memory or Replay system was created; no network refetch occurs at runtime.

The three real records currently classify as `DRIFT`, `DRIFT`, `MATCH` under the preregistered 0.05 MeV/nucleon tolerance. This is a demonstrated comparison path, not a calibrated accuracy claim. Existing Evidence Pack/Memory/Replay integration remains the next wiring step; source terms are still marked `SOURCE_TERMS_REVIEW_REQUIRED`.

Changed files:

- `docs/evidence/ame2020/mass_1.mas20.txt`
- `docs/evidence/ame2020/AME2020-NUCLEAR-SEMF-ADMISSION.json`
- `packages/frontend/src/core/observation/nuclearAme2020.ts`
- `packages/frontend/src/__tests__/nuclearAme2020.test.ts`

Validation completed:

```text
npm run test --workspace=packages/frontend -- --run src/__tests__/nuclearAme2020.test.ts
npm run build
npm run lint
git diff --check
```

Focused tests: 4 passed. Build and lint passed. Build retains only the existing Vite large-chunk warning. No UI changed, so Chromium was not required.

## Updated continuation checkpoint

- **CURRENT HEAD before this handoff update:** `7ccb8d6`
- **CURRENT BRANCH:** `manus/next-gap-observation-analysis`
- **CURRENT LIVE:** `origin/main = 9ad75f3` unchanged
- **CURRENT READINESS:** Model ↔ independent real observation increased from ~25% to an admission/comparison foundation; calibration and Evidence/Memory/Replay wiring remain incomplete.
- **PARKED:** source terms review, full calibration, biological executor, USGS hydrology comparison, Atom-Bohr G3, live scraper expansion.
- **NEXT LARGE GAP:** connect this existing comparison result to the existing Scientific Evidence Pack / Scientific Memory / Replay boundary, with explicit external-observation provenance and no-network replay, then expose the result in the existing user-facing scientific report. Do not claim calibration until the preregistered observation set is sufficiently large.

## Completed Core capability: AME2020 comparison in report and Scientific Memory

The existing `ScienceChat.formatFabricRun` now appends the source-backed AME2020 comparison when the selected model is `nuclear-semf`, including independent-observation source URL, raw SHA-256, per-nuclide `MATCH`/`DRIFT` statuses, MAE, RMSE and `INSUFFICIENT_DATA` calibration status. The existing `saveExperimentRunToMemory` path persists the same comparison as an `external-observation-comparison` analysis block in the existing Scientific Memory record. No second report, memory, evidence or replay system was introduced.

Validation completed:

```text
npm run test --workspace=packages/frontend -- --run src/__tests__/nuclearAme2020.test.ts src/__tests__/scienceChatFabricFormat.test.ts src/__tests__/scienceMemoryFabric.test.ts
npm test
npm run build
npm run lint
git diff --check
```

Focused tests: 8 passed. Full test suite, build, lint and diff check passed. Build retains only the existing Vite large-chunk warning. No UI layout changed, so Chromium was not required.

- **CURRENT HEAD before this handoff update:** `1077f9b`
- **CURRENT BRANCH:** `manus/next-gap-observation-analysis`
- **CURRENT LIVE:** `origin/main = 9ad75f3` unchanged
- **NEXT LARGE GAP:** preserve the structured AME2020 comparison in the existing Evidence Pack / Replay data boundary and expose it in the existing Scientific Memory view, while keeping the comparison explicitly independent-observation data and calibration `INSUFFICIENT_DATA`.

## Completed Core capability: structured external observation in Evidence Pack and Memory

The existing `ScientificEvidencePack` now optionally carries the structured AME2020 comparison when its preregistered hypothesis uses the existing `nuclear-semf` model. The projection preserves per-nuclide prediction/observation/status, MAE/RMSE, calibration status, source URL, raw SHA-256, transform identity and replay input declaration. Protocols without a compatible observation remain unchanged and do not receive unrelated data.

The existing `ScientificMemoryScreen` now renders the comparison status, error metrics, calibration boundary and AME2020 provenance inside the already persisted Evidence Pack view. Existing replay verdicts and explicit rerun actions are unchanged; this source comparison is not mislabeled as a replay or a calibrated accuracy claim. No second Evidence, Memory or Replay system was created.

Changed files:

- `packages/frontend/src/core/experimentFabric/evidencePack.ts`
- `packages/frontend/src/components/ScientificMemoryScreen.tsx`

Validation completed:

```text
npm run test --workspace=packages/frontend -- --run src/__tests__/experimentFabric.test.ts src/__tests__/scienceMemoryFabric.test.ts src/__tests__/nuclearAme2020.test.ts src/__tests__/EvidenceReplayPanel.test.tsx
npm test
npm run build
npm run lint
git diff --check
```

Focused tests: 115 passed. Full test suite, build, lint and diff check passed. Build retains only the existing Vite large-chunk warning.

- **CURRENT HEAD before this handoff update:** `e2fde79`
- **CURRENT BRANCH:** `manus/next-gap-observation-analysis`
- **CURRENT LIVE:** `origin/main = 9ad75f3` unchanged
- **NEXT LARGE GAP:** add a no-network replay verifier for the structured external-observation fixture and expose `MATCH / DRIFT / BLOCKED` for source-integrity changes without claiming a fresh measurement or calibrated accuracy.

## Completed Core capability: no-network AME2020 replay integrity

The existing AME2020 observation adapter now exposes `replayAme2020ObservationFixture`, which verifies the pinned raw SHA-256, transformation identity, explicit no-network replay declaration and exact admitted observation records. It returns `MATCH` for the unchanged fixture, `DRIFT` for changed source values or transformation identity, and `BLOCKED` when the replay input is empty or requests a network source. The verifier is an integrity boundary, not a claim of fresh measurement or model calibration.

The structured comparison now carries this replay result through the existing Evidence Pack serialization and Scientific Memory projection. Existing arm replay verdicts and rerun actions remain unchanged.

Changed file:

- `packages/frontend/src/core/observation/nuclearAme2020.ts`
- `packages/frontend/src/__tests__/nuclearAme2020.test.ts`

Validation completed:

```text
npm run test --workspace=packages/frontend -- --run src/__tests__/nuclearAme2020.test.ts src/__tests__/experimentFabric.test.ts src/__tests__/scienceMemoryFabric.test.ts src/__tests__/scienceChatFabricFormat.test.ts
npm test
npm run build
npm run lint
git diff --check
```

Focused and full validation passed. The AME2020 tests now cover MATCH, DRIFT and BLOCKED replay outcomes. Build retains only the existing Vite large-chunk warning.

- **CURRENT HEAD before this handoff update:** `cd436ca`
- **CURRENT BRANCH:** `manus/next-gap-observation-analysis`
- **CURRENT LIVE:** `origin/main = 9ad75f3` unchanged
- **NEXT LARGE GAP:** complete the user-facing comparison/replay disclosure in the existing Experiment Pilot result boundary, then evaluate whether the preregistered AME2020 observation set can be expanded without weakening source semantics. Calibration remains `INSUFFICIENT_DATA`.

## Completed Core capability: Experiment Pilot external-observation disclosure

The existing Experiment Pilot confirmed-result boundary now renders the AME2020 prediction-versus-independent-observation comparison for `nuclear-semf`, including per-nuclide `MATCH`/`DRIFT`, MAE/RMSE, calibration status, no-network replay status, source URL and raw SHA-256. It explicitly states that this is not a fresh measurement or calibrated model accuracy. Other models and routes remain unchanged.

Changed file: `packages/frontend/src/components/ExperimentPilotScreen.tsx`.

Validation completed:

```text
npm run test --workspace=packages/frontend -- --run src/__tests__/experimentPilot.test.ts src/__tests__/nuclearAme2020.test.ts src/__tests__/experimentFabric.test.ts
npm run build
npm run lint
git diff --check
```

Focused tests, build, lint and diff check passed. Build retains only the existing Vite large-chunk warning.

- **CURRENT HEAD before this handoff update:** `6d0f53a`
- **CURRENT BRANCH:** `manus/next-gap-observation-analysis`
- **CURRENT LIVE:** `origin/main = 9ad75f3` unchanged
- **NEXT LARGE GAP:** wire the structured external-observation comparison into the existing replay/export boundary only if the existing Evidence Pack semantics can preserve it without falsely treating external observations as model-run arms; otherwise keep the honest parked boundary and expand the preregistered AME2020 set with additional non-estimated records.

## Completed Core capability: expanded AME2020 error-distribution panel

The pinned AME2020 comparison panel now contains ten fixed, non-estimated records spanning light, mid-mass and heavy nuclei plus odd-A and shell-sensitive cases: C-12, O-16, Ca-40, Fe-56, Co-59, Ni-62, Sn-120, Xe-132, Pb-208 and U-238. The panel was selected under a fixed policy from the already pinned raw file; no values were fabricated and no model tuning was performed after seeing errors.

The comparison now exposes an error-distribution analysis path and marks calibration as `AVAILABLE` only in the narrow sense that the preregistered panel is large enough for analysis. It still explicitly refuses to assert a calibrated accuracy percentage; model-error calibration methodology and uncertainty decomposition remain future work.

Validation completed:

```text
npm run test --workspace=packages/frontend -- --run src/__tests__/nuclearAme2020.test.ts
npm test
npm run build
npm run lint
git diff --check
```

Focused tests: 5 passed. Full test suite, build, lint and diff check passed. Build retains only the existing Vite large-chunk warning.

- **CURRENT HEAD before this handoff update:** `8b256d1`
- **CURRENT BRANCH:** `manus/next-gap-observation-analysis`
- **CURRENT LIVE:** `origin/main = 9ad75f3` unchanged
- **NEXT LARGE GAP:** define and implement a formal, preregistered calibration method over the existing error distribution, or park calibration if the current SEMF model-error policy cannot be scientifically justified. Do not convert the ten-record panel into a probability or clinical-style accuracy claim.

## Completed Core capability: transparent AME2020 calibration path

The AME2020 comparison now exposes a formal `SIGNED_RESIDUAL_DISTRIBUTION` path over the fixed ten-nuclide panel: sample count, mean signed residual, residual standard deviation and maximum absolute error. The result carries the explicit claim boundary `NO_CALIBRATED_ACCURACY`; no probability, accuracy percentage or clinical-style confidence was generated. Science Chat and Experiment Pilot now display this path alongside the existing MAE/RMSE, source provenance and replay status.

Validation completed:

```text
npm run test --workspace=packages/frontend -- --run src/__tests__/nuclearAme2020.test.ts src/__tests__/experimentFabric.test.ts src/__tests__/experimentPilot.test.ts src/__tests__/scienceChatFabricFormat.test.ts
npm test
npm run build
npm run lint
git diff --check
```

Focused and full validation passed. Build retains only the existing Vite large-chunk warning.

- **CURRENT HEAD before this handoff update:** `e7d0b93`
- **CURRENT BRANCH:** `manus/next-gap-observation-analysis`
- **CURRENT LIVE:** `origin/main = 9ad75f3` unchanged
- **NEXT LARGE GAP:** decide and implement the existing Evidence Pack replay/export treatment for external observations only if its semantics remain distinct from model-run arms; otherwise keep the comparison as a source-backed validation attachment and move to the next high-value Genesis integration.

## Completed Core capability: Evidence Pack replay honors external-observation integrity

The existing `compareScientificEvidencePacks` and `getStoredEvidencePackReplayVerdict` now inspect the structured external-observation replay result. A blocked external fixture yields `BLOCKED`, a source or transformation drift yields `DRIFT`, and an overall Evidence Pack cannot be reported as `MATCH` when its pinned external observation is not intact. Protocol arm replay semantics remain unchanged; no second replay system was created.

Validation completed:

```text
npm run test --workspace=packages/frontend -- --run src/__tests__/experimentFabric.test.ts src/__tests__/evidenceReplayIntegration.test.ts src/__tests__/EvidenceReplayPanel.test.tsx src/__tests__/nuclearAme2020.test.ts
npm test
npm run build
npm run lint
git diff --check
```

Focused and full validation passed. Build retains only the existing Vite large-chunk warning.

- **CURRENT HEAD before this handoff update:** `73ebf34`
- **CURRENT BRANCH:** `manus/next-gap-observation-analysis`
- **CURRENT LIVE:** `origin/main = 9ad75f3` unchanged
- **NEXT LARGE GAP:** add dedicated regression fixtures for Evidence Pack external-observation `MATCH`/`DRIFT`/`BLOCKED` verdicts, then continue the core end-to-end loop or park if the remaining semantics require a new real source.

## Completed Core capability: external-observation replay regression coverage

Added `evidencePackObservationReplay.test.ts` using the existing Evidence Pack and replay contracts. The regression fixtures prove that an intact pinned AME2020 comparison remains `MATCH`, a source-integrity `DRIFT` downgrades the overall pack verdict, and a `BLOCKED` external replay blocks the overall verdict. No new replay or evidence store was introduced.

Validation completed:

```text
npm run test --workspace=packages/frontend -- --run src/__tests__/evidencePackObservationReplay.test.ts src/__tests__/evidenceReplayIntegration.test.ts src/__tests__/nuclearAme2020.test.ts
npm test
npm run build
npm run lint
git diff --check
```

Focused tests: 13 passed. Full test suite, build, lint and diff check passed. Build retains only the existing Vite large-chunk warning.

- **CURRENT HEAD before this handoff update:** `109a100`
- **CURRENT BRANCH:** `manus/next-gap-observation-analysis`
- **CURRENT LIVE:** `origin/main = 9ad75f3` unchanged
- **NEXT LARGE GAP:** continue the Genesis end-to-end observation path only where an existing contract can carry it honestly; otherwise move to the next real biotech evidence integration rather than inflating the nuclear panel with unsupported claims.

## Completed Biotech Foundation capability: assay-level ChEMBL semantics

The existing pinned caffeine/A1 card now displays the exact activity type (`Ki`), relation, value and units, ChEMBL activity identity, assay identity (`CHEMBL876556`) and the pinned assay description. The UI labels it as an in-vitro binding record and explicitly excludes efficacy, safety and clinical-outcome interpretation. This is a read-only projection of the existing source-backed record; no second evidence, ranking or biological-executor path was created.

Validation completed:

```text
npm run test --workspace=packages/frontend -- --run src/__tests__/chembl.test.ts src/__tests__/biotechExperimentFabric.test.ts src/__tests__/scienceChatFabricFormat.test.ts
npm test
npm run build
npm run lint
git diff --check
```

Focused and full validation passed. Build retains only the existing Vite large-chunk warning.

- **CURRENT HEAD before this handoff update:** `8a5771a`
- **CURRENT BRANCH:** `manus/next-gap-observation-analysis`
- **CURRENT LIVE:** `origin/main = 9ad75f3` unchanged
- **NEXT LARGE GAP:** real biological execution remains correctly parked; do not infer efficacy or safety from the ChEMBL binding record. Continue only with another source-backed provenance/disclosure improvement or a genuinely available biological executor.

## Completed Biotech Foundation capability: evidence versus clinical efficacy separation

The existing `CandidateDiscoveryReport` now carries two explicit dimensions: `scientificEvidenceStatus` and `clinicalEfficacy`. The pinned ChEMBL caffeine/A1 report is `scientificEvidenceStatus=HYPOTHESIS` and `clinicalEfficacy=UNKNOWN`. The existing Drug Discovery UI displays both statuses. This prevents a source-backed in-vitro binding record or research-priority prediction from being read as a human clinical efficacy claim. No safety, efficacy or probability was invented.

A targeted ChEMBL API discovery for an additional CHEMBL318 comparator was attempted but the public request exceeded two 30-second timeouts and was stopped. No new fixture was created from an unavailable response. The source-expansion blocker remains parked because additional records are heterogeneous and require an explicit relation/assay-selection policy.

Validation completed:

```text
npm run test --workspace=packages/frontend -- --run src/__tests__/biotechDiscoveryContract.test.ts src/__tests__/chembl.test.ts src/__tests__/biotechExperimentFabric.test.ts src/__tests__/scienceChatFabricFormat.test.ts src/__tests__/experimentPilot.test.ts
npm test
npm run build
npm run lint
git diff --check
```

Focused and full tests passed: `271 passed, 40 skipped, 0 failed`. TypeScript checking is included in `npm run build` (`tsc -b`); there is no standalone `npm run typecheck` script. Build retains only the existing Vite large-chunk warning.

- **CURRENT HEAD before this handoff update:** `b5bd51e`
- **CURRENT BRANCH:** `manus/next-gap-observation-analysis`
- **CURRENT LIVE:** `origin/main = 9ad75f3` unchanged
- **WORKING TREE before this handoff update:** clean
- **PARKED:** biological executor, independent clinical efficacy, safety inference, and ChEMBL multi-record expansion pending a reachable source response and deliberate selection policy.
- **NEXT LARGE GAP:** continue only with a real reachable source-backed multi-candidate relation or an available biological executor; otherwise preserve the explicit parked status and avoid fabricated neurotherapeutic claims.

## FINAL MAXIMUM COMPLETION / PRE-DEPLOY RELEASE GATE

Checkpoint verified on the existing checkout without resetting or auditing the repository:

- **HEAD:** `389a57b`
- **BRANCH:** `manus/next-gap-observation-analysis`
- **REMOTE:** `origin/manus/next-gap-observation-analysis`
- **WORKING TREE before this handoff update:** clean and synchronized

### Release validation

- **Focused workflow tests:** passed in prior blocks for Science Chat, Experiment Pilot, Evidence/Replay, AME2020, ChEMBL and biotech contracts.
- **Full tests:** `npm test` passed: `271 passed, 40 skipped, 0 failed`.
- **Build / TypeScript:** `npm run build` passed; this executes `tsc -b` followed by Vite production build.
- **Lint:** `npm run lint` passed.
- **Diff check:** `git diff --check` passed.
- **Chromium desktop:** passed against the existing backend production server: 27 routes plus 13 laboratories, 242 interactions, zero runtime errors.
- **Chromium mobile:** passed with the same coverage and zero runtime errors.
- **Credential hygiene:** narrow tracked-file scan found no obvious hardcoded API keys, cloud access keys, private keys or Slack tokens.

The first smoke attempt against Vite alone exposed the expected integration condition that Vite proxies `/api` to the backend and therefore cannot be used as the complete E2E target by itself. The corrected production-style run started `packages/backend/src/server.mjs` on port 8080 and passed both desktop and mobile smoke suites. This is documented as an operational setup requirement, not an application defect.

### Release status

The main Science Chat → Request → Model → Fabric → Execution → Result → Analysis → Report → Memory/ Evidence/ Replay path is stable and demonstrable for available executors. The ChEMBL/PubChem path is source-backed and explicitly separates binding evidence, safety/ADME status, research-priority prediction, hypothesis and clinical efficacy. The AME2020 path preserves independent observation provenance, comparison metrics, no-network replay integrity and source-aware Evidence Pack verdicts.

**PARKED, intentionally not faked:** biological executor = `NOT_EXECUTED / BLOCKED`; clinical efficacy = `UNKNOWN`; additional heterogeneous ChEMBL relation expansion = parked after unavailable/slow API response and lack of a declared assay-selection policy; formal calibrated accuracy claims = not asserted; no laboratory measurement is implied.

**KNOWN NON-BLOCKING WARNING:** Vite reports an existing large JavaScript chunk above 750 kB. No cosmetic redesign or risky code-splitting was introduced during the release gate.

**CURRENT READINESS:** `READY` for the available, bounded workflows; not a claim of clinical readiness, biological execution, efficacy, safety or calibrated accuracy.

**GENESIS IS READY FOR DEPLOY.**

- **HANDOFF UPDATED:** pending commit below.

## OVERNIGHT FINAL HARDENING CHECKPOINT

The existing release checkpoint was revalidated without code changes or repository reset. `HEAD=12cb899` before this handoff append, branch `manus/next-gap-observation-analysis`, remote synchronized, and working tree clean.

Backend/frontend integration was checked with the existing architecture: `packages/backend/src/server.mjs` on port 8080, frontend Vite on port 5000, and Vite `/api` proxy to `http://localhost:8080`. Backend `/api/health` reported `ok=true`, `static=true`, `knowledgeLabs=15`, and `persistence=ready`; frontend root returned HTTP 200. The production-style Chromium desktop and mobile smoke suites already passed with 27 routes, 13 laboratories and 242 interactions each, with zero runtime errors.

The earlier HTTP 500s were caused by running the smoke harness against the frontend-only Vite server without the backend. The harness default is port 8092; the correct local validation target is the existing backend on 8080, or an explicitly supplied `E2E_BASE`. No application workaround or duplicate backend was added. All temporary validation servers were stopped; no listeners remain on ports 5000 or 8080.

The final gate remains: full tests green (`271 passed, 40 skipped, 0 failed`), production build/typecheck green, lint green, diff check green, desktop Chromium green, mobile Chromium green, and narrow credential-hygiene scan clean. The only known non-blocking warning is the existing Vite large-chunk warning.

Remaining parked states are unchanged and intentional: biological executor `NOT_EXECUTED/BLOCKED`, clinical efficacy `UNKNOWN`, formal calibration accuracy limited by independent-observation count, and additional heterogeneous ChEMBL expansion parked without a reachable source response and declared assay-selection policy.

- **HANDOFF STATUS:** updated by overnight validation; commit follows.

## CONTINUATION BLOCK: smoke harness startup correctness

The release gate exposed one real operational defect: `scripts/smoke-e2e.mjs` defaulted to port 8092 while the existing production backend defaults to port 8080. Running the harness against frontend-only Vite produced false API failures because Vite proxies `/api` and is not the complete E2E target. The harness default is now `http://127.0.0.1:8080`; the explicit `E2E_BASE` override remains available.

Validation after this patch:

- `node --check scripts/smoke-e2e.mjs` passed.
- Desktop smoke passed: 27 routes, 13 laboratories, 242 interactions, zero runtime errors.
- Mobile smoke passed: 27 routes, 13 laboratories, 242 interactions, zero runtime errors.
- Full `npm test` passed: `271 passed, 40 skipped, 0 failed`.
- `npm run build` passed, including `tsc -b`.
- `npm run lint` passed.
- `git diff --check` passed.

The application architecture was not changed and no duplicate backend was introduced. The existing correct startup remains: backend `packages/backend/src/server.mjs` on 8080, frontend Vite/proxy on 5000 for development, or backend serving the production build for E2E/deploy.

- **HEAD before this block:** `9470c0b`
- **BRANCH:** `manus/next-gap-observation-analysis`
- **PARKED:** biological executor, clinical efficacy, insufficient independent-observation calibration, and heterogeneous ChEMBL expansion remain explicitly blocked/unknown.
- **NEXT GAP:** no further high-value release blocker is currently evidenced; continue only if a real runtime or integration failure appears.

## COMPLETED MAJOR BLOCK: real two-candidate ChEMBL comparison

The existing Drug Discovery path now compares two real A1-target candidates through the same `CandidateDiscoveryReport` and deterministic research-priority comparison: PubChem/ChEMBL caffeine (`CHEMBL113`, activity `189031`) and ChEMBL adenosine (`CHEMBL477`, activity `71801`, assay `CHEMBL639739`, target `CHEMBL318`). The adenosine record is pinned with exact Ki `= 12.8 nM`, assay description, target confidence metadata, source URLs, ChEMBL release and retrieval date. It is a natural/endogenous compound record, but the UI and report do not infer safety, efficacy or therapeutic benefit.

The block reuses the existing Evidence/Candidate/Ranking/Hypothesis/Report path and adds no second ranker or evidence system. Adenosine safety/ADME/Tox remains explicitly `UNKNOWN`; PubChem enrichment was not fabricated because the PubChem endpoint returned HTTP 503 during retrieval. The ChEMBL-only source boundary is visible in the candidate comparison.

Validation completed:

```text
focused adenosine + ChEMBL + biotech contract tests: passed
npm test: 271 passed, 40 skipped, 0 failed
npm run build: passed, including tsc -b
npm run lint: passed
git diff --check: passed
```

- **HEAD before this handoff update:** `3623f33`
- **BRANCH:** `manus/next-gap-observation-analysis`
- **PARKED:** real safety/ADME/Tox for adenosine, biological executor, clinical efficacy, formal accuracy calibration and further heterogeneous assay expansion.
- **NEXT LARGE GAP:** expose this two-candidate comparison through the existing Scientific Memory / Evidence Pack persistence path, or park if the current report boundary already provides sufficient replay-safe persistence; do not create another report system.

## COMPLETED MAJOR BLOCK: multi-candidate comparison persistence

The real caffeine/adenosine A1 comparison now persists through the existing Scientific Memory boundary. The stored biotech context carries a validated comparison summary with comparison ID, all report IDs, candidate IDs, deterministic scientific fingerprint, `PREDICTION` epistemic status and explicit uncertainty. A single user-facing action in Drug Discovery saves the comparison and opens the existing Scientific Memory screen; no second report, ranking, memory or evidence system was created.

The persistence path rejects fewer than two reports, validates IDs/fingerprint/status on reload, and preserves the existing boundary that research-priority ordering is not efficacy. Adenosine remains ChEMBL-only with safety/ADME/Tox `UNKNOWN`; no clinical claim is introduced.

Validation completed:

```text
focused Science Memory + adenosine + ChEMBL tests: passed
full npm test: 271 passed, 40 skipped, 0 failed
npm run build: passed, including tsc -b
npm run lint: passed
git diff --check: passed
```

- **HEAD before this handoff update:** `5ce7cc5`
- **BRANCH:** `manus/next-gap-observation-analysis`
- **NEXT LARGE GAP:** add Evidence Pack identity only if a confirmed persistence/replay break is found; otherwise move to the next real Natural/Neuro source-backed candidate or park due unavailable compatible data. Do not invent safety, efficacy, ADME/Tox or biological execution.

## COMPLETED MAJOR BLOCK: three-candidate natural A1 comparison and memory loop

The existing Drug Discovery workflow now presents and compares three real A1-target records through the same evidence/ranking/report boundary: caffeine (`CHEMBL113`, activity `189031`), adenosine (`CHEMBL477`, activity `71801`, assay `CHEMBL639739`) and theophylline (`CHEMBL1355736`, activity `109460`, assay `CHEMBL641038`). The new theophylline record is pinned from ChEMBL Web Services with exact Ki `= 700.0 nM`, assay context, target identity, confidence metadata, provenance, source URLs and deterministic fingerprint.

The comparison is now user-facing and can be saved through the existing Scientific Memory store. Memory persists the comparison ID, all report IDs, candidate IDs, scientific fingerprint, `PREDICTION` epistemic status and explicit uncertainty; reload validation rejects malformed comparison metadata. The workflow still does not claim efficacy, safety, ADME/Tox or therapy. All three candidates retain `UNKNOWN` safety where no compatible safety source is present.

Source limitation: ChEMBL lookups were reachable for these records. PubChem enrichment for adenosine/theophylline was not added because the PubChem endpoint returned HTTP 503 during retrieval; no PubChem properties or ADME values were inferred from that unavailable response.

Validation completed:

```text
focused adenosine/ChEMBL/Scientific Memory tests: passed
full npm test: 271 passed, 40 skipped, 0 failed
npm run build: passed, including tsc -b
npm run lint: passed
git diff --check: passed
```

- **HEAD before this handoff update:** `f1efe8a`
- **BRANCH:** `manus/next-gap-observation-analysis`
- **NEXT LARGE GAP:** add compatible safety/ADME/Tox evidence only from a reachable authoritative source, or park and move to another real end-to-end boundary. Biological execution and clinical efficacy remain blocked/unknown; no synthetic data is permitted.

## COMPLETED MAJOR BLOCK: saved comparison is visible on reopen

Scientific Memory now renders the persisted multi-candidate comparison inside the existing biotech record card. Reopening a saved comparison shows candidate count, `PREDICTION` epistemic status, deterministic comparison fingerprint and the explicit uncertainty boundary. This completes the user-facing Drug Discovery path from real ChEMBL records through comparison, save, reopen and verification using the existing Memory system.

Validation completed:

```text
focused Science Memory + adenosine + ChEMBL tests: passed
npm run build: passed, including tsc -b
npm run lint: passed
git diff --check: passed
```

- **HEAD before this handoff update:** `27885df`
- **BRANCH:** `manus/next-gap-observation-analysis`
- **PARKED:** compatible safety/ADME/Tox for adenosine and theophylline, biological executor, clinical efficacy, formal calibration accuracy, and additional heterogeneous assay expansion.
- **NEXT LARGE GAP:** only add safety/ADME/Tox when a reachable authoritative source provides compatible records; otherwise preserve `UNKNOWN` and continue with another confirmed end-to-end break rather than inventing data.

## COMPLETED MAJOR BLOCK: official-label safety provenance

The real adenosine and theophylline A1 candidates now carry official DailyMed label-derived safety signals through the existing `SafetySignal` and candidate ranking path. Adenosine uses the Sagent label set ID `546642f2-662f-46cf-9d82-5bb3bdcc7677`, including label-listed contraindication/warning categories. Theophylline uses the PD-Rx extended-release label set ID `5e64036a-ee3e-42e7-9e59-881f88a4e298`, including label-described concentration-related adverse-effect risk and pharmacokinetic monitoring variability. These are label-level evidence records, not individual clinical assessments.

The Drug Discovery UI now discloses ChEMBL binding plus DailyMed label provenance and keeps `clinical efficacy = UNKNOWN`. No treatment recommendation, safety conclusion for an individual, efficacy claim, ADME inference or biological execution was added. Existing Evidence, Ranking, Hypothesis, Report and Scientific Memory boundaries were reused.

Validation completed:

```text
focused DailyMed + candidate + memory tests: passed
full npm test: 271 passed, 40 skipped, 0 failed
npm run build: passed, including tsc -b
npm run lint: passed
git diff --check: passed
Chromium desktop: 27 routes, 13 labs, 242 interactions, zero runtime errors
Chromium mobile: 27 routes, 13 labs, 242 interactions, zero runtime errors
```

- **HEAD before this handoff update:** `ec2626c`
- **BRANCH:** `manus/next-gap-observation-analysis`
- **REAL SOURCES:** ChEMBL Web Services, DailyMed official human prescription labels, PubChem caffeine fixture, AME2020 raw mass table.
- **PARKED:** clinical efficacy, biological executor, formal calibrated accuracy, PubChem enrichment for adenosine/theophylline after HTTP 503, and any safety/ADME/Tox claim not directly supported by a compatible source.
- **NEXT LARGE GAP:** add compatible quantitative ADME/Tox data only if an authoritative reachable source provides it; otherwise continue with the next confirmed end-to-end persistence or replay break and do not fabricate data.

## COMPLETED MAJOR BLOCK: quantitative label ADME context

The existing candidate report now carries a minimal source-backed `BiotechAdmeProfile` for the real adenosine and theophylline candidates. Adenosine includes the official-label whole-blood half-life context of `<10 seconds`. Theophylline includes the official-label serum concentration-effect range `5–20 mcg/mL`, mean steady-state half-life `8.3 hours`, and mean clearance `3.5 L/hour` from the label’s referenced study population. The Drug Discovery UI renders these metrics with explicit DailyMed product/population context and a non-clinical boundary.

This is label-derived pharmacokinetic context, not an individual prediction, dose recommendation, complete ADME profile, efficacy claim or safety conclusion. No synthetic values were added. The existing PubChem/RDKit property path, SafetySignal, CandidateDiscoveryReport, comparison, Scientific Memory and provenance structures were reused.

Validation completed:

```text
focused ADME + safety + candidate + memory tests: passed
full npm test: 271 passed, 40 skipped, 0 failed
npm run build: passed, including tsc -b
npm run lint: passed
git diff --check: passed
Chromium desktop: 27 routes, 13 labs, 242 interactions, zero runtime errors
Chromium mobile: 27 routes, 13 labs, 242 interactions, zero runtime errors
```

- **HEAD before this handoff update:** `dcb1211`
- **BRANCH:** `manus/next-gap-observation-analysis`
- **REAL SOURCE:** DailyMed official label pages for adenosine set ID `546642f2-662f-46cf-9d82-5bb3bdcc7677` and theophylline set ID `5e64036a-ee3e-42e7-9e59-881f88a4e298`.
- **PARKED:** complete ADME/Tox, quantitative toxicity endpoints, biological execution, clinical efficacy, and any individual-level interpretation. PubChem enrichment for the new candidates remains unavailable after HTTP 503.
- **NEXT LARGE GAP:** add compatible quantitative ADME/Tox endpoint data only from an authoritative reachable source; otherwise move to the next confirmed end-to-end break and preserve `UNKNOWN`.

## COMPLETED MAJOR BLOCK: explicit biological validation path

The real adenosine and theophylline reports now include a deterministic `BiologicalExperimentRequest` generated by the shared biotech contract. It preserves candidate ID, hypothesis ID, target IDs, a pre-registered binding/functional activity primary metric and the requirement for an independent assay. The request is explicitly `BLOCKED` with `No reliable biological executor is configured in this environment`; no biological run or measured result is claimed.

Drug Discovery now displays the validation request ID and `NOT_EXECUTED / BLOCKED` status in the existing report card. This closes the available knowledge-only → validation-path boundary without inventing executor output, efficacy, safety or assay measurements.

Validation completed:

```text
focused validation-request + candidate + safety + memory tests: passed
full npm test: 271 passed, 40 skipped, 0 failed
npm run build: passed, including tsc -b
npm run lint: passed
git diff --check: passed
Chromium desktop: 27 routes, 13 labs, 235 interactions, zero runtime errors
Chromium mobile: 27 routes, 13 labs, 242 interactions, zero runtime errors
```

- **HEAD before this handoff update:** `96e9056`
- **BRANCH:** `manus/next-gap-observation-analysis`
- **NEXT LARGE GAP:** biological execution remains externally blocked. Quantitative ADME/Tox beyond label-supported context remains `UNKNOWN/PARKED` unless a compatible authoritative endpoint becomes reachable. Continue with another confirmed end-to-end break only if it exists; do not fabricate execution or data.

## COMPLETED MAJOR BLOCK: Science Chat → reviewed biotech request

Science Chat no longer bypasses the reviewed Experiment Fabric path for biotechnology messages. Candidate discovery prompts now produce the existing `EvidenceGuidedExperimentPlan` with the original structured request, deterministic plan ID, disclosure, required solver, limitations and `ENGINE_NOT_AVAILABLE` status. Because no validated biological executor exists, the plan is not confirmable and no biological result is generated. Direct knowledge-only adapters remain available in the existing Experiment Fabric executor for explicit programmatic use and preserve their source-bound ChEMBL semantics.

Focused validation completed:

```text
biotechExperimentFabric + experimentFabric + backendEvidenceExecution tests: passed
npm run build: passed
npm run lint: passed
git diff --check: passed
```

- **HEAD before this block:** `83e3ed8`
- **BRANCH:** `manus/next-gap-observation-analysis`
- **CURRENT STATUS:** candidate-specific discovery prompts now enter the same reviewed request boundary as other domains; biology remains `ENGINE_NOT_AVAILABLE`, `NOT_EXECUTED`, and no clinical efficacy is inferred.
- **PARKED:** confirmation/execution and biological Evidence/Replay require an actual validated biological executor and independent assay data.
- **NEXT LARGE GAP:** only proceed with another real, unblocked integration; otherwise maintain the biological executor blocker rather than inventing execution.

## COMPLETED MAJOR BLOCK: Natural/Neuro mechanism boundary

The existing real ChEMBL candidate graph now links caffeine, adenosine and theophylline to shared A1 binding-mechanism records. These records are explicitly `HYPOTHESIS`, retain source provenance, and state that an in-vitro binding record does not establish downstream signaling, therapeutic mechanism, clinical efficacy or safety. Candidate and hypothesis `mechanismIds` now point to the same reusable records; no second mechanism, evidence or ranking architecture was created.

The Drug Discovery report card now exposes the mechanism status and boundary text to the user. This is a truthful Natural/Neuro workflow improvement: real compounds → real bioactivity/target → mechanism hypothesis → evidence/safety/ADME → ranking → validation path. It does not claim that natural origin is safe or that a candidate is a proven therapy.

Validation completed:

```text
focused ChEMBL / adenosine / theophylline / biotech contract / Science Chat tests: passed
npm run build: passed
npm run lint: passed
git diff --check: passed
```

- **HEAD before this block:** `ac98c0b`
- **BRANCH:** `manus/next-gap-observation-analysis`
- **CURRENT STATUS:** three source-backed candidates now have explicit, provenance-carrying HYPOTHESIS-level binding mechanisms and user-facing disclosure.
- **PARKED:** downstream biological mechanism validation, biological execution, clinical efficacy and mechanistic causal inference remain `UNKNOWN`/`BLOCKED` pending independent assays and a validated executor.
- **NEXT LARGE GAP:** no additional mechanistic claim is admissible from the currently pinned binding records; proceed only with another compatible real source or an unrelated high-value unblocked integration.

## RELEASE VERIFICATION AFTER MECHANISM BLOCK

Full release verification completed after the user-facing mechanism disclosure:

```text
npm test: 271 passed, 40 skipped, 0 failed
Chromium desktop: 27 routes, 13 labs, 242 interactions, zero runtime errors
Chromium mobile: 27 routes, 13 labs, 242 interactions, zero runtime errors
```

- **CURRENT HEAD:** `0694f03` before this documentation checkpoint
- **BRANCH:** `manus/next-gap-observation-analysis`
- **WORKING TREE:** clean after push

## COMPLETED CORE/DRUG DISCOVERY BLOCK: deterministic biotech comparison replay integrity

The existing source-backed caffeine/adenosine/theophylline comparison now has a narrow replay-integrity verifier in the existing Scientific Memory boundary. `replaySavedBiotechComparison` deterministically recomputes the existing candidate comparison and returns `MATCH` when comparison ID, report order, candidate order and scientific fingerprint are unchanged, `DRIFT` when persisted identity differs, and `BLOCKED` when the saved comparison/report set is incomplete or cannot be recomputed. This verifies the saved comparison calculation only; it is not a biological rerun, fresh assay, source refresh, efficacy claim or safety conclusion.

Scientific Memory now renders the replay-integrity status and reason for saved biotech comparisons, with an explicit disclaimer that this is not biological execution or a fresh measurement. The implementation reuses the existing pinned source-backed builders and comparator; no second replay, evidence, memory or ranking system was introduced.

Changed files:

- `packages/frontend/src/core/scienceMemory.ts`
- `packages/frontend/src/components/ScientificMemoryScreen.tsx`
- `packages/frontend/src/__tests__/scienceMemoryFabric.test.ts`

Validation completed:

```text
focused scienceMemoryFabric.test.ts: 5 passed
npm test: 271 passed, 40 skipped, 0 failed
npm run build: passed, including tsc -b; existing Vite large-chunk warning remains
npm run lint: passed
git diff --check: passed
```

- **CURRENT STATUS:** comparison → Scientific Memory → deterministic replay-integrity disclosure is now complete for the pinned source-backed reports.
- **PARKED:** biological execution, clinical efficacy, full ADME/Tox, new independent assays, and any claim of calibrated therapeutic accuracy remain blocked/unknown by source or executor limitations.
- **NEXT GAP:** inspect only for another confirmed end-to-end break; otherwise prioritize a reachable authoritative source-backed capability rather than creating another contract or synthetic dataset.

## COMPLETED END-TO-END BLOCK: Science Chat → Drug Discovery workspace handoff

When a candidate-discovery request enters Science Chat and the reviewed Fabric plan is `ENGINE_NOT_AVAILABLE`/blocked because no validated biological executor is configured, Science Chat now offers a direct action to open the existing `#/drug` Drug Discovery workspace. The request remains unexecuted; the destination explicitly presents source-backed records, comparison, provenance and validation blockers. No direct bypass of the reviewed request boundary, biological executor, efficacy claim or synthetic observation was added.

Changed file:

- `packages/frontend/src/components/ScienceChat.tsx`

Validation completed:

```text
focused Science Chat + biotech Fabric tests: passed
npm test: 271 passed, 40 skipped, 0 failed
npm run build: passed, including tsc -b; existing Vite large-chunk warning remains
npm run lint: passed
git diff --check: passed
```

- **CURRENT STATUS:** Science Chat now hands blocked candidate-discovery intent into the existing source-backed Drug Discovery user flow instead of ending at a dead request boundary.
- **PARKED:** biological executor, independent assays, clinical efficacy, complete ADME/Tox and unsupported Natural/Neuro causal claims remain blocked/unknown.
- **NEXT GAP:** only pursue another confirmed end-to-end break or reachable authoritative source-backed capability; do not add another duplicate contract or synthetic data path.

## RELEASE CHECKPOINT AFTER CONTINUATION SPRINT

The continuation sprint is verified on the remote tip. The deterministic biotech comparison replay-integrity block and Science Chat → Drug Discovery handoff are committed on `manus/next-gap-observation-analysis`.

Production-style verification used the existing backend on port 8080. `/api/health` returned `ok=true`, `static=true`, `knowledgeLabs=15` and `persistence=ready`. Desktop smoke passed with 27 routes, 13 laboratories and 242 interactions, zero runtime errors. Mobile smoke passed with the same coverage and zero runtime errors. Full tests remain `271 passed, 40 skipped, 0 failed`; build/typecheck, lint and `git diff --check` passed.

- **CURRENT HEAD:** pending commit below
- **BRANCH:** `manus/next-gap-observation-analysis`
- **REMOTE:** synchronized after push
- **COMPLETED:** saved biotech comparison replay-integrity disclosure; blocked Science Chat biotech request → existing Drug Discovery workspace handoff
- **PARKED:** biological executor, independent assays, clinical efficacy, complete ADME/Tox, unsupported Natural/Neuro causal claims and fabricated observations
- **NEXT GAP:** continue only with another confirmed end-to-end break or reachable authoritative source-backed capability; current available workflows have no evidenced release blocker.
