# GENESIS Biotech Handoff

## Current state

- Branch: `manus/next-gap-observation-analysis`
- Last commit: `e440d39`
- LIVE: `origin/main = 9ad75f3`
- Working tree was clean after push.

## Delivered

Science Chat now parses Polish natural-product discovery requests such as `Znajdź naturalnych kandydatów dla targetu X.` into a `StructuredExperimentRequest` with:

- `domainId: biotechnology`
- `parameters.targetQuery`
- no `modelId`
- `executionStatus: NOT_EXECUTED`

The Fabric router preserves the boundary: the request is explicit but non-runnable (`ENGINE_NOT_AVAILABLE`) because no validated biological executor or source connector exists. It must not generate candidates or results.

Biotech contracts already provide candidate/evidence/safety/hypothesis/report/ranking structures, and Scientific Memory persists hypothesis/report context and explainable ranking.

A pinned real PubChem PUG REST fixture is now connected for CID 2519 (Caffeine) as an `OBSERVED` `Compound`, with source URL, CID, retrieval date, source version and response fingerprint. It provides chemical identity/properties only; it does not provide a biological target, efficacy or safety claim.

## Next safe work

1. Add a source-neutral `BiologicalKnowledgeSource` connector interface only if needed by the next verified source.
2. Use the existing pinned PubChem compound record as chemical identity input; do not infer target, efficacy or safety.
3. Connect one real, citable bioactivity source (for example a pinned ChEMBL record) only when its exact release/record provenance is preserved.
4. Convert source records into existing biotech contracts; never create placeholder compounds, targets, DOI or toxicity claims.
4. Feed only sourced evidence and safety signals into ranking; keep score as research priority, never efficacy probability.
5. Keep biological execution `NOT_EXECUTED`/`BLOCKED` until a validated biological executor exists.

## Do not do

Do not build a second Evidence/Memory system, invent biological data, add a safety score, create a biological executor, or map source claims directly to `ScientificEvidencePack` without real runs and protocol semantics. Double-Slit, Bloch, Atom-Bohr and G3/NIST are parked/unrelated.
