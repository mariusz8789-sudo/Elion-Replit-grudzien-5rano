# ZEFIR Phase 3F/G/H/J — Adversarial Molecular Discovery Funnel

Candidate survival funnel over **real engines**, embodying **Adversarial Candidate
Survival**: do not prove a candidate is good — try to KILL it. A candidate advances
only when current evidence fails to give a sufficient reason to reject. Additive
schema `v14 → v15`. No Phase-1 code, engine, or provenance semantics touched.

## Real capabilities added
- `rdkit_worker.py` + `rdkitAdapter.mjs`: **`sascore`** (RDKit Contrib SA_Score),
  **`alerts`** (RDKit FilterCatalog **PAINS + BRENK** — real SMARTS), **`novelty`**
  (max Tanimoto vs a reference set). Verified live (aspirin SA 1.58; azobenzene →
  `azo_A`,`diazo_group`).

## Funnel (`cognitive/molecularFunnel.mjs`, schema v15)
Stages: validity → canonicalization → descriptors → physicochemical filter →
structural alerts → ADMET (MODEL_ESTIMATE) → structural novelty → synthetic
accessibility → target/off-target → adversarial critic → multi-objective ranking.
Every stage records engine/version/params/input+output hashes/duration/epistemic
class/status (`EXECUTED / VERIFIED / REJECTED / SKIPPED_BY_POLICY / CAPABILITY_GAP /
BLOCKED_BY_RUNTIME / BLOCKED_BY_RESOURCES / FAILED`).

- **Adversarial critic** issues only `REJECT / HOLD_FOR_MORE_EVIDENCE /
  ESCALATE_TO_HIGHER_FIDELITY / SURVIVES_CURRENT_COMPUTATIONAL_REVIEW` — never SAFE /
  EFFECTIVE / CLINICALLY_SELECTIVE. A candidate never survives on one favorable score.
- **Selectivity / off-target:** with no valid target structure (RCSB egress blocked)
  the target stage is `BLOCKED_BY_RESOURCES` → `SELECTIVITY_NOT_ASSESSED /
  INSUFFICIENT_TARGET_COVERAGE`. No selectivity claim is fabricated.
- **Negative-result memory:** a structure that previously failed is recognized on
  re-entry and `SKIPPED_BY_POLICY` — expensive stages avoided (history changes the
  decision). Demonstrated.
- **Candidate Dossier V2:** all mandated fields + provenance chain + uncertainty
  vector + capability gaps + blocked resources + content hash + the mandatory
  **TRANSLATIONAL GAP WARNING** + **CRO handoff readiness** (never auto
  `READY_FOR_EXTERNAL_EXPERIMENT_DESIGN_REVIEW`; a human gate is required).

## Verification
- `cognitiveMolecularFunnel.test.mjs` — **9/9**, incl. a **real-RDKit** azobenzene
  rejection on genuine PAINS/BRENK alerts, negative-memory skip, HOLD on two concerns,
  and dossier completeness.
- Full gate: backend **350/350** (0 skipped), frontend 601/601, build green, lint clean.
