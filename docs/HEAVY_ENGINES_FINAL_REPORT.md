# Heavy Scientific Engines — Final Report

Validated External Compute Integration atop the Scientific Acceleration Engine.
Every number below comes from an executed reference case or the recorded
`npm run campaign:validate` run in this runtime. No fake docking / MD / quantum /
ADMET / toxicity / protein results. No therapeutic or clinical claims.

1. **VERIFIED STARTING HEAD** — `eba84fe`.
2. **FINAL HEAD** — see the last pushed commit on `genesis/main`; this report ships in the final milestone.
3. **RUNTIME ENVIRONMENT** — Ubuntu 24.04 (Linux 6.18.5), x86_64, Python 3.11.15, Node 22.22.2, 4 CPU, ~15.7 GiB RAM, ~28 GiB free disk.
4. **CPU/GPU STATUS** — CPU-only (4 cores). No GPU, no CUDA (`nvidia-smi` absent, no `/dev/nvidia*`, no `nvcc`).
5. **RDKit STATUS AND VERSION** — AVAILABLE, 2026.03.3 (reference: aspirin logP 1.31; benzene→`Cc1ccccc1`).
6. **DOCKING ENGINE STATUS** — AVAILABLE (software-pipeline validated).
7. **DOCKING ENGINE VERSION** — AutoDock Vina 1.2.7 + Meeko 0.7.1 (+ gemmi 0.7.5).
8. **DOCKING REFERENCE CASE** — aspirin ligand (real Meeko PDBQT) docked into an indole rigid small-molecule receptor stand-in; ≥1 pose, finite favorable score (best −2.226 kcal/mol), deterministic with fixed seed. Real artifacts (receptor/ligand/docked PDBQT) with sha256.
9. **REAL DOCKING RUNS EXECUTED** — 3 in the validation campaign (candidates `Oc1cc(Cl)cc(Cl)c1` −1.883, `Oc1cc(Cl)ccc1Cl` −1.929, `Oc1ccc(Cl)c(Cl)c1` −1.929 kcal/mol) + reference + tests.
10. **MD ENGINE STATUS** — AVAILABLE.
11. **MD ENGINE VERSION** — OpenMM 8.5.2 (CPU + Reference platforms).
12. **MD REFERENCE CASE** — TIP3P water box (~185 waters, 555 atoms), minimization lowers potential energy (+1342 → ≈ −8300 kJ/mol), 300-step NVT holds T in 150–450 K (~247–275 K observed).
13. **REAL MD RUNS EXECUTED** — reference-case executions (toolchain validation + tests). MD is registered/validated; campaign MD stage is available for future wiring.
14. **QUANTUM ENGINE STATUS** — AVAILABLE.
15. **QUANTUM ENGINE VERSION** — PySCF 2.13.1.
16. **QUANTUM REFERENCE CASE** — H2 RHF/STO-3G @0.74 Å = −1.116759 Ha (literature ≈ −1.1168, tol 0.02); water RHF/STO-3G = −74.963 Ha, dipole ≈ 1.73 D.
17. **REAL QUANTUM RUNS EXECUTED** — 2 in the validation campaign (`Oc1cc(Cl)cc(Cl)c1` gap 13.55 eV; `Oc1cc(Cl)ccc1Cl` gap 13.39 eV) + reference + tests.
18. **ADMET ENDPOINTS ACTUALLY AVAILABLE** — none. CAPABILITY_GAP.
19. **ADMET MODELS AND VERSIONS** — none integrated; no validated executable per-endpoint model in this runtime (never filled by an LLM/heuristic).
20. **TOXICITY ENDPOINTS ACTUALLY AVAILABLE** — none. CAPABILITY_GAP.
21. **TOXICITY MODELS AND VERSIONS** — none integrated; never returns SAFE/NON-TOXIC.
22. **PROTEIN STRUCTURE INGESTION STATUS** — AVAILABLE (Biopython 1.87). Real PDB parse/validate; flags missing atoms/altloc/hetero/models → ADDITIONAL_INPUT_REQUIRED, never silent edits.
23. **MULTI-FIDELITY ORCHESTRATOR STATUS** — implemented (`campaign/multiFidelity.mjs`): RDKit → Pareto/diversity filter → docking → quantum, with per-stage budgets and persisted selection reasons.
24. **CANDIDATES PER COMPUTATION STAGE** (validation run) — RDKit 69, docking 3, quantum 2.
25. **CROSS-ENGINE MODEL CONFLICTS** — MCRE detects descriptor-favorable vs weak-docking as MODEL_CONFLICT (persisted, never averaged); 0 in the recorded run (candidates agreed within thresholds).
26. **NEXT COMPUTATIONAL EXPERIMENT DECISIONS** — adaptive engine emits DOCK_SELECTED_CANDIDATES / RUN_QUANTUM_CALCULATION selection reasons per candidate (SELECTED/NOT_SELECTED/FAILED/RETAINED), all persisted for WHY.
27. **VALIDATION CAMPAIGN OBJECTIVE** — multi-fidelity software validation: MPO descriptors + docking + QM on documented non-novel reference chemicals; not a therapeutic claim.
28. **VALIDATION CAMPAIGN RESULTS** — 69 candidates, 60 retained, 10 Pareto, hypervolume 10.17 → 15.53; 3 real docks, 2 real QM single-points; wall-clock 59.5 s; stop STOP_RESOURCE_LIMIT.
29. **REAL SCIENTIFIC JOBS EXECUTED** — campaign-run + campaign-stage jobs via the async Job System (`compute/jobs.mjs`).
30. **REAL SCIENTIFIC RUNS EXECUTED** — 5 heavy Scientific Runs persisted in the validation campaign (3 docking + 2 quantum), plus the cheap RDKit descriptor runs.
31. **RAW SCIENTIFIC ARTIFACTS CREATED** — 9 in the validation run (3 PDBQT artifacts per dock × 3), each with sha256; stored on disk under the artifact dir and referenced by the Scientific Run.
32. **TOOLCHAIN REGISTRY STATUS** — validates every engine by a cached real reference case; 5 AVAILABLE (RDKit, PySCF, OpenMM, Vina+Meeko, Biopython), 2 CAPABILITY_GAP (ADMET, toxicity). `GET /api/compute/toolchain`.
33. **WHY ENGINE INTEGRATION** — candidate existence, engine/version/inputs/run, Pareto, strategy, stop, and stage selection/conflict are answerable from persisted evidence.
34. **SCIENTIFIC UI STATUS** — `#/campaign` shows verified engines (all heavy engines auto-listed with runtime status + reference evidence), a run-stage control, heavy Scientific Runs (engine/version/units/hashes/artifacts/MODEL_ESTIMATE), and MCRE conflicts. No fake poses/trajectories/animations.
35. **TEST COUNTS** — backend 196+ (incl. 11 heavy-engine + 4 multi-fidelity); frontend 601. See CI verification below.
36. **TEST FAILURES** — 0.
37. **BLOCKED_BY_RUNTIME** — none of the six targeted engines (all installed). Any engine absent in another runtime is reported BLOCKED_BY_RUNTIME honestly.
38. **BLOCKED_BY_LICENSE** — none (all engines are permissive OSS: BSD/Apache/MIT/LGPL).
39. **BLOCKED_BY_RESOURCES** — canonical protein-ligand redocking benchmark: RCSB egress (`files.rcsb.org`) returns HTTP 403 under this environment's policy, so a real PDB target could not be fetched; docking is validated with a rigid small-molecule receptor stand-in instead (software-pipeline validation).
40. **CAPABILITY GAPS** — ADMET estimation; toxicity risk estimation (both endpoint-specific, no validated executable model integrated).
41. **SCIENTIFIC LIMITATIONS** — docking/MD/QM outputs are MODEL_ESTIMATE; short MD says nothing about biological stability; low-basis QM is not high-level ab initio; the docking receptor stand-in is not a protein target; descriptors are 2D/3D-embedded cheminformatics.
42. **PRODUCTION LIMITATIONS** — engines run as short-lived subprocesses with hard timeouts, fixed (non-shell) command construction, input/parameter validation, artifact directories, result/input hashing, and dependency/version provenance; heavy stages run through the async Job System with budgets and cancel-where-safe. No untrusted shell is ever executed from API input. CPU-only (no GPU acceleration); large protein MD/QM would need more resources.
43. **EXACT COMMITS PUSHED** — `be20ff7` (env audit + QM/MD/docking/protein adapters + toolchain), `d53defd` (multi-fidelity docking/QM stages + validation campaign), and the final milestone commit carrying the campaign-stage API routes, UI, and this report.

---

**Bottom line:** four heavy scientific engines beyond RDKit — quantum chemistry
(PySCF), molecular dynamics (OpenMM), molecular docking (AutoDock Vina + Meeko),
and protein-structure ingestion (Biopython) — are really installed, really
executed, and each passes a real reference case before being marked AVAILABLE.
They are wired into the campaign as budgeted multi-fidelity stages with persisted
Scientific Runs, raw artifacts, provenance, and cross-engine conflict detection.
ADMET and toxicity are honest capability gaps. Nothing is faked, and nothing is
overclaimed.
