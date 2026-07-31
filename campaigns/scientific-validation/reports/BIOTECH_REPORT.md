# Biotech Report

_Genesis OS · genesis-scientific-reports/1 · generated: (run timestamp omitted for deterministic hashing) · readiness: MEDIUM_

## Decision-support outputs (real engines)
- **Real engines executed:** RDKit, TruthEngine, MCRE, AutoDock Vina
- **Off-target liability:** 20 scored — risk dist {"LOW":6,"MEDIUM":2,"HIGH":12} (MODEL_INFERRED, Tox21/ADMET-AI panel)
- **Docking:** 2 docked, best -2.969 kcal/mol (MODEL_ESTIMATE), site REFERENCE_LIGAND
- **Molecular dynamics:** BLOCKED_BY_RUNTIME
- **MM-GBSA:** BLOCKED_BY_RUNTIME (kept separate from docking score)

## Honest boundary
Candidates are computational; ADMET/off-target are MODEL_INFERRED; docking is MODEL_ESTIMATE. Wet-lab
validation, MD-in-loop (ligand force field), and an off-target structural panel remain external.
DID GENESIS DISCOVER A DRUG? **NO** — computational candidates + provenance, not validated therapeutics.
