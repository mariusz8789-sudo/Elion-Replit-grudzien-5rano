# GENESIS Main Roadmap Handoff

## Checkpoint state

- **CURRENT HEAD:** update immediately after this checkpoint commit
- **CURRENT BRANCH:** `manus/next-gap-observation-analysis`
- **CURRENT LIVE:** `origin/main = 9ad75f3` (unchanged)
- **Working tree before this piece:** clean

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
- next checkpoint in this session — show attached SafetySignal/provenance in Science Chat report

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

## NEXT PRIORITY — real drug-discovery workflow

Next large block: ADME/Tox. Inspect whether a real public source can be pinned cheaply; otherwise add only a minimal extension point and keep ADME/Tox `UNKNOWN`. Then continue to multi-candidate comparison. Do not infer safety from binding, add arbitrary scores or make clinical efficacy claims.

## Next large gaps

1. Result → existing World/3D visualization with a real result only where mapping is semantically valid.
2. Minimal preregistered protocol/A-B contract with hypothesis, baseline/reference, arms, repetition policy, execution and replay; park if semantics are insufficient.
3. Infrastructure for the first genuine model ↔ independent real observation comparison; never use model inputs as observations.
4. Continue pinned real-source expansion with provenance rather than live scraper sprawl.

## Exact continuation instruction

Confirm branch, HEAD, status and `origin/main`. Read this handoff. Inspect only the current Science Chat/UI result boundary and relevant tests. Implement one large, logically complete GAP; run targeted tests, full tests as needed, typecheck/build, lint and `git diff --check`; update this handoff; commit; push; then continue to the next GAP. Never create ZIP files. If interrupted, first make the current scope consistent, test it, update this handoff, commit and push.
