# Genesis Discovery Trial — Final Proof

One real end-to-end computational investigation driven through the implemented
cognitive architecture (P1–P13) on **real** Genesis engines. Reproducible:
`npm run trial:discovery` (`scripts/genesis-discovery-trial.mjs`).

## Domain choice (honest)

The strongest scientifically defensible domain the CURRENT runtime supports is
**quantum chemistry (PySCF)**, because its results are **bit-exact replay-verifiable**
and need no external egress — unlike docking, which requires a real receptor PDB that
is `BLOCKED_BY_RESOURCES` here (RCSB egress blocked). This is a computational
electronic-structure study at a stated **minimal basis (RHF/STO-3G): trends only**.
No therapeutic, experimental, or novelty claim.

## Human research goal

> For a small congeneric series of monosubstituted benzenes, does an
> electron-withdrawing substituent LOWER the computed HOMO–LUMO gap (RHF/STO-3G)
> relative to benzene? Rank the series and identify the lowest-gap member.

## What actually ran (real engines, one run)

RDKit 2026.03.3 (real 3D geometry) + PySCF 2.13.1 (real single points) →
plan → task DAG → competing hypotheses → **interruption + recovery** → bit-exact
replay verification → sandbox → gated promotion → independent critic swarm →
meta classification.

## Evidence hierarchy (from the recorded run)

**[1] COMPUTED FACT** (real RDKit geometry + real PySCF single points)
- benzene 14.928 eV · nitrobenzene 12.140 eV · benzonitrile 13.566 eV · aniline 13.634 eV

**[2] VERIFIED COMPUTATIONAL RESULT** (independent bit-exact replay = MATCH, promoted to main store)
- All four gaps VERIFIED via real PySCF re-execution (replay MATCH, tolerance 0).

**[3] ARCHITECTURE-GENERATED COMPETING HYPOTHESES** (deterministic template; **no LLM invoked**)
- H1 "EWG lowers the gap" → **accepted / SUPPORTED**; H2 "EWG does not lower the gap" → **rejected / CONTRADICTED**.
- Independent critic swarm: H1 ACCEPT, H2 REJECT (proposer ≠ judge).

**[4] INFERENCE** (qualitative, from the verified computation)
- Gap ranking (low→high, eV): **nitrobenzene 12.14 < benzonitrile 13.57 < aniline 13.63 < benzene 14.93**.
- EWG lowers the gap for **all** tested EWG members (Δ = −2.79, −1.36 eV).
- **This reproduces known qualitative electronic-structure behavior — it is NOT a novel discovery.**

**[5] UNRESOLVED QUESTION**
- STO-3G gap magnitudes are unreliable; ordering vs a larger basis / DFT is untested here.

**[6] CAPABILITY GAP** (honest)
- No live LLM/model provider invoked → hypotheses are template-generated, not model-generated.
- Real protein-target docking: `BLOCKED_BY_RESOURCES` (RCSB egress) — not attempted.
- Higher-level ab initio / larger basis / solvation: not executed.

**[7] EXPERIMENTAL VALIDATION REQUIRED**
- Any physical claim requires wet-lab measurement. None is claimed.

## Outcome

`SUCCESS` (Meta-Orchestrator): 4 verified evidence items + an accepted hypothesis;
0 contradictions in the promoted set; 4 sandbox promotions audited; agent invocation
logged; 2 hypothesis-evaluation records.

**Honest bottom line:** Genesis planned, computed, verified (bit-exact replay),
survived an interruption, gated sandbox promotion, and adjudicated competing
hypotheses on real quantum-chemistry evidence. It **reproduced known computational
behavior, discovered nothing novel, and claims no experimental result** — an honest
positive control that a skeptic can re-run and audit end to end.
