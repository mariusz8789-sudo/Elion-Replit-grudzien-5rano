# ZEFIR Discovery Campaign (Phase 3N) — Executable Proof

A REAL adversarial molecular candidate-survival campaign, driven by the AUTONOMOUS
campaign runner (3A) over the adversarial funnel (3F) on real engines. NOT the
benzene QM trial. Reproducible: `npm run campaign:zefir`.

## What ran (one real execution)

- **Human goal:** prioritise a small BRICS-generated analog set by adversarial
  computational review; eliminate liabilities.
- **Real candidate generation:** 12 RDKit BRICS recombinations of non-sensitive
  textbook scaffolds (aspirin/paracetamol/ibuprofen/benzocaine). No novelty/activity
  claim.
- **Autonomous runner** drove all 12 candidate-tasks (status COMPLETED, order derived
  from the DAG — not scripted).
- **Real engines:** RDKit 2026.03.3 (descriptors, PAINS+BRENK alerts, SA score,
  Tanimoto novelty vs the 4 parent scaffolds) + ADMET-AI 2.0.1 (MODEL_ESTIMATE).
- **Selectivity:** no validated target structure (RCSB egress blocked) →
  SELECTIVITY_NOT_ASSESSED for every candidate. No selectivity fabricated.

## Result (recorded run)

- Candidates entered: **12**. Decisions: **REJECT 3, SURVIVES 9**, HELD 0.
- **Rejections (adversarial critic killed them on REAL structural alerts):**
  - `CC(=O)OC(=O)c1ccc(-c2ccc(N)cc2)cc1` — aniline + anhydride alerts
  - `CC(=O)OC(=O)c1ccc(N)cc1` — aniline + anhydride alerts
  - `CC(=O)Oc1ccc(N)cc1` — anilide/aniline/phenol-ester alerts
- **Survivors: 9** (survived CURRENT computational review; selectivity NOT assessed).
  Top-ranked `CC(=O)Oc1ccc(O)cc1` — MW 152, logP 1.32, SA 1.58, novelty (max Tanimoto
  vs scaffolds) 0.43.
- **Negative-result memory:** 6 rejection motifs recorded for future avoidance.
- **Candidate Dossier V2** built for the top survivor: full provenance + uncertainty
  vector + TRANSLATIONAL GAP WARNING + CRO handoff readiness = `READY_FOR_EXPERT_REVIEW`
  (never auto external-ready; human gate required).

## Honest limitations

- Meta-Orchestrator classified the mission `MISSION_FAILURE` because it is
  hypothesis/verified-evidence-centric and this funnel campaign produced neither a
  replay-verified evidence item nor an accepted hypothesis. This is an honest
  labelling gap (funnel campaigns need their own outcome mapping), not a fabricated
  success — the campaign itself succeeded at triage.
- Nine survivors is a triage result, not a discovery. Nothing is claimed active,
  safe, selective, or novel. Selectivity was NOT assessed.
