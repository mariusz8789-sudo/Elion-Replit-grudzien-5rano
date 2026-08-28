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
- next checkpoint in this session — expose the source-bound result directly in Science Chat UI

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

## NEXT GAP — next large logical piece

Connect the saved Experiment Fabric run to the existing Scientific Memory screen/list so users can inspect the persisted result identity and status from the current UI, without inventing new physics or a second memory system. Prefer the smallest existing memory-screen integration point and add a targeted test. Preserve status distinctions and do not claim a result before execution. If UI integration is not semantically safe, park it and implement a minimal protocol/pre-registration contract gap instead.

## Next large gaps

1. Result → existing World/3D visualization with a real result only where mapping is semantically valid.
2. Minimal preregistered protocol/A-B contract with hypothesis, baseline/reference, arms, repetition policy, execution and replay; park if semantics are insufficient.
3. Infrastructure for the first genuine model ↔ independent real observation comparison; never use model inputs as observations.
4. Continue pinned real-source expansion with provenance rather than live scraper sprawl.

## Exact continuation instruction

Confirm branch, HEAD, status and `origin/main`. Read this handoff. Inspect only the current Science Chat/UI result boundary and relevant tests. Implement one large, logically complete GAP; run targeted tests, full tests as needed, typecheck/build, lint and `git diff --check`; update this handoff; commit; push; then continue to the next GAP. Never create ZIP files. If interrupted, first make the current scope consistent, test it, update this handoff, commit and push.
