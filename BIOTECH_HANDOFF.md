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
- next checkpoint in this session — verify model selection → Structured Request boundary; if already wired, park and continue Core queue

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

## NEXT PRIORITY — main Genesis Core

Continue with the next low-cost integration gap at the user-facing result boundary: verify that the existing real typed result, analysis, route, evidence status and replay identity are presented as one coherent report without implying execution where status is `knowledge_only`, `scenario` or `blocked`. Prefer a focused formatter/test change only where a field is actually missing.

## Next large gaps

1. Result → existing World/3D visualization with a real result only where mapping is semantically valid.
2. Minimal preregistered protocol/A-B contract with hypothesis, baseline/reference, arms, repetition policy, execution and replay; park if semantics are insufficient.
3. Infrastructure for the first genuine model ↔ independent real observation comparison; never use model inputs as observations.
4. Continue pinned real-source expansion with provenance rather than live scraper sprawl.

## Exact continuation instruction

Confirm branch, HEAD, status and `origin/main`. Read this handoff. Inspect only the current Science Chat/UI result boundary and relevant tests. Implement one large, logically complete GAP; run targeted tests, full tests as needed, typecheck/build, lint and `git diff --check`; update this handoff; commit; push; then continue to the next GAP. Never create ZIP files. If interrupted, first make the current scope consistent, test it, update this handoff, commit and push.
