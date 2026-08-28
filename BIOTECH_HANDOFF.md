# GENESIS Biotech / Main Roadmap Handoff

## Checkpoint state

- **CURRENT HEAD:** update after commit below
- **CURRENT BRANCH:** `manus/next-gap-observation-analysis`
- **CURRENT LIVE:** `origin/main = 9ad75f3` (unchanged)
- **Working tree before this piece:** clean

Do not restart or perform a broad repository audit. Verify only the current branch, HEAD, status and the specific files named in the next GAP.

## Commits completed in this series

- `092c6aa` — `feat(biotech): pin ChEMBL caffeine bioactivity`
- next checkpoint in this session — integrate pinned biotech evidence into Experiment Fabric

## Completed capability

Genesis now has a controlled Science Chat → Experiment Fabric path for the one verified ChEMBL record:

```text
Science Chat natural-language biotech request
→ structured biotechnology request
→ source-bound ChEMBL match when query names caffeine/A1/adenosine
→ knowledge-only ExperimentResult
→ BiologicalTarget + BiologicalEvidence + provenance
```

The integration is intentionally not a biological executor. A matching query returns `status: knowledge_only`, `provenance.resultOrigin: knowledge-only`, the pinned activity/assay/value fields and the source-bound biological records. It never claims that a binding `Ki` is efficacy, therapeutic benefit or safety. An unrelated target query remains `engine_not_available` and receives no unrelated evidence.

Changed files for this piece:

- `packages/frontend/src/core/experimentFabric/types.ts` — optional source-bound biological target/evidence fields on `ExperimentResult`.
- `packages/frontend/src/core/experimentFabric/executor.ts` — guarded ChEMBL knowledge-result branch before the generic unavailable fallback.
- `packages/frontend/src/__tests__/biotechExperimentFabric.test.ts` — integration tests for match, non-match, status and provenance semantics.

## Validation

The following completed successfully after this piece:

```text
npm run test --workspace=packages/frontend -- --run src/__tests__/biotechExperimentFabric.test.ts
npm test
npm run build
npm run lint
git diff --check
```

Build reports only the existing Vite large-chunk warning. No UI changed, so Chromium was not required. CI is not claimed green because no CI run was performed in this session.

## Designed versus real

The ChEMBL record is real and pinned: caffeine `CHEMBL113`, activity `189031`, target `CHEMBL318` Adenosine receptor A1, assay `CHEMBL876556`, `Ki = 41000.0 nM`, release `ChEMBL_37`. The Fabric integration is a deterministic local mapping of that pinned record, not a live biological execution and not a clinical or efficacy model.

## Parked

- Biological executor remains `NOT_EXECUTED`/`BLOCKED`.
- Do not promote a single binding record into a full Evidence Pack without hypothesis, baseline/reference, arms, repetition policy, real runs and replay identity.
- Do not create candidate efficacy/safety scores or infer safety from PubChem/ChEMBL identity/activity records.
- Canonical replay remains parked; no casts or artificial plan IDs.
- Real independent model ↔ observation comparison remains a larger future gap.
- Double-Slit / Bloch / Atom-Bohr and G3/NIST remain unrelated/out of scope.

## NEXT GAP — next large logical piece

Complete the **result → analysis → Scientific Memory** integration for existing executable experiments, preserving `modelId`, `runId`, run fingerprint, outputs, analysis, provenance and execution status. Start by locating the smallest existing save-to-memory boundary and add a targeted test for one already executable model. Do not redesign Memory, Evidence or Replay. If the boundary cannot be wired without a broad semantic change, park it and take the next safe gap: expose the existing ExperimentResult/provenance in the current Science Chat response/UI without inventing new scientific claims.

## Large roadmap priorities after the next piece

1. Result → Analysis → Scientific Memory with complete identity/provenance.
2. Result → existing World/3D visualization, only where a real result already maps semantically.
3. Minimal preregistered protocol/A-B contract; park if hypothesis, baseline, arms, repetition and replay semantics cannot all be represented honestly.
4. Infrastructure for the first genuine model ↔ independent real observation comparison; never use model inputs as observations.
5. Continue real-source expansion through pinned records, provenance and evidence rather than live scraper sprawl.

## Exact continuation instruction

Confirm branch, HEAD, status and `origin/main`. Read this handoff. Inspect only the current result/memory boundary and its tests. Implement one large, logically complete GAP; run targeted tests, full tests as needed, typecheck/build, lint and `git diff --check`; update this handoff; commit; push; then continue to the next GAP. Never create ZIP files. If interrupted, first make the current scope consistent, test it, update this handoff, commit and push.
