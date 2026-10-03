# Engine truth table — updated 2026-10-03 (branch claude/grant-readiness-consolidation-rj04ng)

Each column is stated separately; none is inferred from another. YES / NO / NOT_VERIFIED (not checked, so not claimed).
Proof for the ResearchRun columns: `researchRunEngines.real.test.mjs` runs each real engine twice through the ResearchRun route and the durable queue
(frozen prediction, real execution, SUPPORTED and FALSIFIED verdicts, replay, database reopen, no second execution). CI job
"Real engines through ResearchRun and the durable queue" sets GENESIS_REQUIRE_ENGINES=rdkit,pyscf,vina,openmm,admet, so a missing engine fails the job instead of skipping.

| ENGINE | RESEARCHRUN_INTEGRATED | ASYNC_QUEUE_VERIFIED | ARTIFACT_PERSISTED | REPLAY | ADMISSION / PRODUCT | STATUS |
|---|---|---|---|---|---|---|
| RDKit | YES (executor `rdkit`) | YES (single node) | YES (bundle custody, `ARTIFACT_PERSISTED`) | MATCH (molecular-descriptors) | BSD-3-Clause; commercial admission not exercised | GREEN |
| PySCF | YES (RHF, STO-3G/3-21G/6-31G, at most 12 atoms) | YES | YES | MATCH (quantum-chemistry) | Apache-2.0 | GREEN |
| Vina / Meeko | YES (receptor hash frozen, RECEPTOR_PREPARATION_DRIFT guard) | YES | YES | MATCH (molecular-docking); docking score is a MODEL_ESTIMATE, not binding proof | licence review not confirmed | GREEN for execution; PRODUCT_ELIGIBLE NOT_VERIFIED |
| OpenMM | YES (TIP3P water-box reference only, 100–2000 steps) | YES | YES | NOT_APPLICABLE: no bit-exact replayer is wired and none is claimed | MIT/LGPL | PARTIAL: reference system only, no protein/ligand MD |
| ADMET-AI | YES (checked again at execution time) | YES | YES | MATCH (admet-estimation) | TECHNICAL_VALIDATION only; COMMERCIAL_PRODUCT is BLOCKED_BY_LICENSE at execution, tested | GREEN for technical validation; PRODUCT_ELIGIBLE NO |
| Retrosynthesis (AiZynthFinder) | NO | NO | NO | NOT_VERIFIED | TECHNICAL_VALIDATION only | BLOCKED_BY_RUNTIME (not installed in any CI job or this sandbox) |

Limits that stay true:
- The queue and the artifact store are single-node (SQLite and local content-addressed files). Multi-replica and shared object storage are not proven and are labelled BLOCKED_EXTERNAL_OBJECT_STORAGE.
- Artifact custody covers the asynchronous path. The synchronous POST route does not store an artifact.
- A passing engine test proves the engine ran under the frozen protocol; it does not turn a model estimate into a measurement.
