# GENESIS Biotech Handoff

## Current state

- Branch: `manus/next-gap-observation-analysis`
- Last commit: `c3cf9c0`
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

## Next safe work

1. Add a source-neutral `BiologicalKnowledgeSource` connector interface only if needed by the first verified source.
2. Connect one real, citable natural-product/compound source; preserve source ID, version/date, evidence type, and provenance.
3. Convert source records into existing biotech contracts; never create placeholder compounds, targets, DOI or toxicity claims.
4. Feed only sourced evidence and safety signals into ranking; keep score as research priority, never efficacy probability.
5. Keep biological execution `NOT_EXECUTED`/`BLOCKED` until a validated biological executor exists.

## Do not do

Do not build a second Evidence/Memory system, invent biological data, add a safety score, create a biological executor, or map source claims directly to `ScientificEvidencePack` without real runs and protocol semantics. Double-Slit, Bloch, Atom-Bohr and G3/NIST are parked/unrelated.
