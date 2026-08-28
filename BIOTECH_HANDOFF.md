# GENESIS Biotech Handoff

## Checkpoint state

- **CURRENT HEAD:** `6cf5609`
- **CURRENT BRANCH:** `manus/next-gap-observation-analysis`
- **CURRENT LIVE:** `origin/main = 9ad75f3`
- **Working tree before this handoff:** clean

This file is an emergency checkpoint. Do not assume later reports are present: verify the current Git state first.

## What is confirmed in the Genesis biotech path

Science Chat parses a request such as `Znajdź naturalnych kandydatów dla targetu X.` into a structured biotechnology request with `domainId: biotechnology`, a `targetQuery`, no model ID, and `executionStatus: NOT_EXECUTED`. The existing Fabric router keeps it non-runnable because Genesis has no validated biological executor or biological source connector.

The biotech contract foundation contains `NaturalMaterial`, `Compound`, `TherapeuticCandidate`, `BiologicalTarget`, `Mechanism`, `SafetySignal`, `BiologicalEvidence`, `TherapeuticHypothesis`, `BiologicalExperimentRequest`, `CandidateDiscoveryReport`, ranking types and Scientific Memory context persistence. The ranking is a transparent research-priority heuristic, not efficacy probability.

## Real source boundary

**PubChem CID 2519 = real chemical identity/properties only.** The pinned PubChem PUG REST fixture is Caffeine and preserves source URL, CID, retrieval date, source version and chemical properties. PubChem alone does **not** confirm a biological target, efficacy or safety. Do not derive those claims from the PubChem compound record.

The repository may contain PubChem fixture/mapping commits after this checkpoint only if they are visible in the current Git history. Check before editing.

## Session work to preserve/check

The intended completed sequence is:

```text
Science Chat
→ biotechnology request
→ PubChem real pinned compound
→ Candidate contract
→ Safety contract
→ explainable research ranking
→ hypothesis
→ discovery report
→ Scientific Memory
```

The last confirmed checkpoint commit from the earlier sprint was `6cf5609`. Later biotech work must be verified with `git log` before being relied upon.

## Designed versus real

Designed/contract-only: biological target links without source evidence, biological executor integration, candidate discovery from arbitrary natural-language requests, efficacy prediction, safety scoring, calibration and biological real-observation execution.

Real and safe only when backed by source provenance: compound identity/properties, source IDs, evidence type, retrieval metadata and fingerprints.

## Parked / do not do

- **PubChem → target/evidence/safety:** parked; chemical identity does not prove these fields.
- **BiologicalEvidence → ScientificEvidencePack:** parked; it lacks real Fabric runs, arms, baseline/reference and replay semantics.
- **Biological executor:** remains `NOT_EXECUTED`/`BLOCKED`; never reuse a physics or chemistry executor as a biological adapter.
- **Canonical replay:** `EvidenceGuidedExperimentCapsule` is not `ReproducibleScenarioCapsule`; no cast, fake planId or artificial adapter.
- **Double-Slit / Bloch / Atom-Bohr:** parked/out of scope.
- **G3/NIST:** `PRE-EXISTING / UNRELATED`; do not return to it.
- Do not invent compounds, plants, targets, DOI, toxicity claims, efficacy or synthesis instructions.

## NEXT GAP

The next correct step is **one verified bioactivity/target relation** for the existing PubChem compound, preferably a pinned ChEMBL activity record. Before implementation, verify the exact activity ID, molecule ID, target ID/name, assay, measured value/units, ChEMBL release/version, source URL and retrieval context. Map only what the record actually supports:

```text
PubChem compound
→ verified bioactivity record
→ BiologicalTarget
→ BiologicalEvidence
```

Do not create a candidate, safety signal or efficacy claim unless the source supports the corresponding relation. Keep missing fields `UNKNOWN`/`VERIFY_REQUIRED` and biological execution `NOT_EXECUTED`/`BLOCKED`.

## First action for the next Manus

1. Run `git status --short --branch`, `git rev-parse --short HEAD`, `git rev-parse --short origin/main` and `git log --oneline -12`.
2. Inspect existing files before adding anything:
   - `packages/frontend/src/core/biotechDiscoveryContract.ts`
   - `packages/frontend/src/core/biotechData/pubchem.ts`
   - `packages/frontend/src/core/biotechData/pubchem-cid-2519.json`
   - `packages/frontend/src/core/experimentFabric/parser.ts`
   - `packages/frontend/src/core/experimentFabric/router.ts`
   - `packages/frontend/src/core/scienceMemory.ts`
   - `packages/frontend/src/__tests__/biotechDiscoveryContract.test.ts`
   - `packages/frontend/src/__tests__/experimentFabric.test.ts`
   - `packages/frontend/src/__tests__/scienceMemory.test.ts`
3. Confirm whether the pinned PubChem files exist at the current HEAD.
4. Only then retrieve and pin one real ChEMBL activity record; if provenance or target semantics are insufficient, park the task without inventing an adapter.

## Verification expectation

For any future code change: targeted tests, typecheck, lint, build, diff check, commit and push. Chromium is required only for UI changes. CI must be reported from an actual run; G3/NIST remains unrelated.
