# GENESIS Biotech Handoff

## Checkpoint state

- **CURRENT HEAD:** `1ccdf93` (feat(biotech): pin ChEMBL caffeine bioactivity)
- **CURRENT BRANCH:** `manus/next-gap-observation-analysis`
- **CURRENT LIVE:** `origin/main = 9ad75f3` (unchanged)
- **Working tree before this session:** clean

This handoff records the completed ChEMBL bioactivity continuation. Do not redo a broad audit; verify only the current Git state and continue from the next GAP below.

## Completed in this session

Added a minimal, source-neutral ChEMBL adapter and replayable pinned fixture for one real public bioactivity record:

```text
PubChem CID 2519 / Caffeine
→ ChEMBL CHEMBL113
→ activity 189031
→ target CHEMBL318 / Adenosine receptor A1
→ assay CHEMBL876556
→ Ki = 41000.0 nM
→ BiologicalTarget + BiologicalEvidence
```

The fixture is `packages/frontend/src/core/biotechData/chembl-activity-189031.json`. It preserves the molecule ID and PubChem CID, target ID/name/type, assay ID/context/type, activity ID/type/relation/value/unit, ChEMBL release `ChEMBL_37`, release date, source URL, retrieval date, document ID and raw response fields.

The mapper is `packages/frontend/src/core/biotechData/chembl.ts`. It validates the pinned identity/activity fields, maps only the target and binding evidence actually supported by ChEMBL, preserves provenance and raw fixture data, and produces a deterministic eight-character scientific fingerprint. It does not create efficacy, safety, candidate, executor or clinical claims.

Target provenance is `OBSERVED`; the curated activity evidence is `LITERATURE_SUPPORTED`. The evidence uncertainty explicitly states that an in vitro binding measurement does not establish clinical efficacy, therapeutic benefit or safety.

## Validation

The following commands completed successfully:

```text
npm run test --workspace=packages/frontend -- --run src/__tests__/chembl.test.ts
npm test
npm run build
npm run lint
git diff --check
```

The build emitted only the pre-existing Vite large-chunk warning; no build failure occurred. Chromium was not needed because this change is data/core logic only.

## Parked / do not do

- PubChem → target/evidence/safety remains parked; PubChem is chemical identity/properties only.
- BiologicalEvidence → ScientificEvidencePack remains parked until real Fabric runs, arms, baseline/reference and replay semantics exist.
- Biological executor remains `NOT_EXECUTED`/`BLOCKED`; never reuse a physics or chemistry executor as a biological adapter.
- Canonical replay remains parked; do not cast `EvidenceGuidedExperimentCapsule` to `ReproducibleScenarioCapsule` or invent plan IDs.
- Do not invent compounds, targets, DOI, toxicity, efficacy or synthesis instructions.
- Double-Slit / Bloch / Atom-Bohr and G3/NIST remain unrelated/out of scope.

## NEXT GAP

Wire the verified `BiologicalTarget` and `BiologicalEvidence` into the existing biotech discovery path without creating a biological executor. Prefer the smallest integration point that lets a discovery report or Science Chat response expose the evidence IDs and provenance while keeping execution `NOT_EXECUTED`/`BLOCKED`. Reuse existing candidate/report/memory contracts; do not invent candidate efficacy or safety scores. If this requires a broad architecture change, park it and choose a smaller contract/test/documentation gap.

## Exact continuation instruction

1. Confirm branch, HEAD, `origin/main`, and clean/dirty status.
2. Read this handoff and inspect only the existing biotech discovery/report/memory path plus the new ChEMBL mapper and tests.
3. Implement the smallest safe mapping of the verified ChEMBL record into existing contracts, with targeted tests and provenance assertions.
4. Run targeted tests, full tests as needed, typecheck/build, lint and `git diff --check`.
5. Update this handoff with the resulting HEAD/branch/live state, commit and push.

Never claim CI green without an actual CI result. If interrupted, first leave the current scope consistent, test it, update this handoff, commit and push.
