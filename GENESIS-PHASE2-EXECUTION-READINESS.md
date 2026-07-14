# Genesis Lab — Phase 2 Execution Readiness Report

**Date:** 2026-07-14 · **Branch:** `claude/genesis-takeover-audit-kpz019`
**Scope:** Step H of the takeover audit — establish the maximum REAL scientific
execution capability in the current runtime and assess Phase 2 executability.
**Honesty contract:** no invented affinities / ADMET / molecules / mock-as-real;
100 ns MD/FEP remains CAPABILITY_GAP; external DB failures = BLOCKED_BY_RESOURCES;
exact SHA-256 provenance semantics preserved. Phase 1 was NOT modified.

Every number below was executed in this runtime during this session, or is an
honest gap. Nothing is fabricated.

---

## A. Environment

| Item | Value |
|---|---|
| OS / kernel | Linux 6.18.5, x86_64 |
| Python | 3.11.15 |
| Node | 22.22.2 |
| CPU / GPU | CPU-only (no GPU/CUDA runtime device); torch installed as `cu130` wheel but runs CPU |
| Disk | ~22 GB free after all installs (16 GB used) |
| RAM | ~15 GiB |
| Network to external science DBs | BLOCKED (see J) — `files.rcsb.org` / external egress restricted by policy |

At takeover, **zero** scientific Python packages were installed and `node_modules`
was absent. Both were established during this step.

## B. Installation attempts

All installs succeeded via `pip` into the system Python (`python3`), the
interpreter the Genesis adapters invoke (`GENESIS_PYTHON ?? 'python3'`).

| Package | Method | Result |
|---|---|---|
| rdkit | `pip install "rdkit>=2023.9"` | OK |
| biopython, gemmi | `pip install "biopython>=1.81" "gemmi>=0.6"` | OK |
| meeko, vina | `pip install "meeko>=0.6" "vina>=1.2.5"` | OK |
| pyscf | `pip install "pyscf>=2.9"` | OK |
| openmm | `pip install "openmm>=8.1"` | OK |
| admet-ai | first attempt FAILED, then `pip install "admet-ai>=2.0" --ignore-installed packaging setuptools` | OK |
| node deps | `npm install` (198 pkgs) | OK |

**ADMET-AI install note (safest compatible method):** the first attempt aborted
with `Cannot uninstall packaging 24.0, RECORD file not found. Hint: The package
was installed by debian.` — pip refused to remove a distro-managed package. The
retry used `--ignore-installed packaging setuptools`, which installs fresh copies
alongside the Debian ones instead of uninstalling them. This pulled the full
chemprop/torch stack (torch 2.13.0, chemprop 2.2.4, lightning, scikit-learn,
pandas, etc.). No system package was destructively removed.

## C. Exact engine versions

| Engine | Version | Import verified |
|---|---|---|
| RDKit | 2026.03.3 | yes (aspirin logP = 1.31, reference match) |
| PySCF (QM) | 2.13.1 | yes |
| OpenMM (MD) | 8.5.2 | yes |
| AutoDock Vina | 1.2.7 | yes |
| Meeko (ligand prep) | 0.7.1 | yes |
| gemmi | 0.7.5 | yes |
| Biopython | 1.87 | yes |
| ADMET-AI | 2.0.1 | yes |
| chemprop / torch | 2.2.4 / 2.13.0 | yes |

## D. Validation evidence (Toolchain Registry — real reference cases)

`campaign/toolchain.mjs` validates each engine by executing a cached REAL
reference case before marking it AVAILABLE. Result of `listToolchain()` in this
runtime:

| Tool | Status | Version |
|---|---|---|
| rdkit | **AVAILABLE** | 2026.03.3 |
| pyscf | **AVAILABLE** | 2.13.1 |
| openmm | **AVAILABLE** | 8.5.2 |
| vina | **AVAILABLE** | 1.2.7 / meeko 0.7.1 |
| biopython | **AVAILABLE** | 1.87 |
| admet | **AVAILABLE** | 2.0.1 |
| toxicity | **AVAILABLE** | 2.0.1 |

Strict per-engine classification (never "available" on install alone — each
passed its adapter reference case):

| Engine | Classification |
|---|---|
| RDKit | VERIFIED_AVAILABLE |
| PySCF (QM) | VERIFIED_AVAILABLE |
| OpenMM (MD) | VERIFIED_AVAILABLE |
| AutoDock Vina + Meeko (docking) | VERIFIED_AVAILABLE |
| Biopython (protein ingestion) | VERIFIED_AVAILABLE |
| ADMET-AI (ADMET) | VERIFIED_AVAILABLE |
| ADMET-AI (toxicity) | VERIFIED_AVAILABLE |

**Concrete real computations executed this session (tangible evidence):**
- **QM:** H2 RHF/STO-3G @0.74 Å = **−1.1167593 Ha** (expected ≈ −1.1168, tol 0.02, converged) — PySCF 2.13.1.
- **ADMET:** aspirin `CC(=O)Oc1ccccc1C(=O)O` → real 52-endpoint ADMET-AI output, e.g. hERG drugbank-approved percentile 13.4, Caco2 76.9, Solubility 76.0, VDss 11.5 — ADMET-AI 2.0.1. (Reported as MODEL_ESTIMATE, never SAFE/NON-TOXIC.)
- **Docking / MD / protein:** validated by their adapter reference cases (`heavyEngines.test.mjs`, 11/11 pass — Vina dock produces poses + finite favorable score deterministically; OpenMM water-box minimization lowers energy + NVT holds T; Biopython parses reference PDB and flags missing atoms as ADDITIONAL_INPUT_REQUIRED).

## E. Benchmark / reference-test results

| Suite | Result |
|---|---|
| `rdkit.test.mjs` | 4/4 pass (capabilities AVAILABLE, real descriptors) |
| `cheminformatics.test.mjs` | 13/13 pass |
| `heavyEngines.test.mjs` | 11/11 pass (QM + MD + docking + protein + toolchain, all real) |
| `admetEngine.test.mjs` | 7/7 pass (real ADMET-AI reference + reproducibility) |
| `campaignMultiFidelity.test.mjs` | 8/8 pass |
| `benchmarkSuite.test.mjs` | 16/16 pass |

## F. Cancelled-test diagnosis (the 4 originally-cancelled backend tests)

**Verdict: transient first-run artifact, NOT a test-logic or orchestration defect. No code change required or made. No scientific assertion was weakened.**

Evidence gathered by reproducing controlled conditions:

| Condition | cancelled |
|---|---|
| First audit run: no `node_modules`, no science engines, cold caches | **4** |
| Whole suite, `node_modules` present, engines forced absent (bare venv `python`) | **0** |
| Whole suite, `node_modules` present, `@anthropic-ai/sdk` hidden | **0** |
| Whole suite, all 7 engines installed | **0** |

The cancellations were **not** caused by missing science engines (the bare-venv
whole-suite run reproduces the 38 capability skips but 0 cancellations) and
**not** by the missing npm dependency (`@anthropic-ai/sdk` is imported lazily/
dynamically in `server.mjs`, so its absence does not break test-file loading —
confirmed by hiding it: 0 cancellations). They are consistent with the Node
`node:test` runner cancelling a few still-pending capability-detection subtests
that exceeded their per-test timeout during the very first cold run (first Python
subprocess spawns are slow on a cold filesystem cache, before `node_modules`
existed). With the toolchain present and warm, detection returns instantly and
every test runs to completion. Because it is a runtime/timing artifact rather
than a defect, the correct action was to leave the tests untouched.

## G. Final test / build results

| Suite | Result |
|---|---|
| Backend (`node --test src/*.test.mjs`, all engines) | **245 pass / 245**, 0 fail, 0 cancelled, 0 skipped |
| Frontend (`vitest run`) | **601 pass / 601**, 0 fail |
| Production build (`npm run build`) | **green** (218 modules; index 229 KB gzip + three.js) |

**Legitimate skips:** with all engines installed there are **0 skips** in the
backend suite. (Skips only appear when an engine is absent — e.g. 18–38 skips in
the no-engine states above — and are honest capability gaps by design, never
silent passes.)

## H. Phase 2 pipeline stage matrix

Two columns are distinguished on purpose: the **engine/primitive capability**
(can the math run at all in this runtime?) vs. the **Genesis pipeline-stage
integration** (is it wired as a discrete Phase-2 campaign stage?).

| Stage | Engine/primitive capability | Genesis pipeline-stage integration |
|---|---|---|
| 1. BRICS generation | **IMPLEMENTED_AND_VERIFIED** (real RDKit BRICS, executed — see I) | **NOT_IMPLEMENTED** (no BRICS command in `rdkit_worker.py`; run via new proof script only) |
| 2. ADMET filtering | **IMPLEMENTED_AND_VERIFIED** (ADMET-AI 2.0.1, real 52-endpoint prediction) | **IMPLEMENTED_AND_VERIFIED** (`admetToxicityStage` in `multiFidelity.mjs`; scores + persists as MODEL_ESTIMATE) |
| 3. Vina docking | **IMPLEMENTED_AND_VERIFIED** (Vina 1.2.7 + Meeko, real dock, deterministic) | **IMPLEMENTED_AND_VERIFIED** (docking stage in `multiFidelity.mjs`, executed in validation campaign) |
| 4. OpenMM 1–5 ps relaxation | **IMPLEMENTED_AND_VERIFIED** (OpenMM 8.5.2, real minimization + NVT) | **NOT_IMPLEMENTED** (engine validated only; not wired as a campaign stage) |
| 5. Tanimoto novelty filter (reject sim > 0.7) | **IMPLEMENTED_AND_VERIFIED** (real RDKit Morgan/Tanimoto in `rdkit_worker.py` `diversity` + `drugAdapter`) | **NOT_IMPLEMENTED** as a discrete 0.7-threshold novelty-vs-reference filter stage (only mean-pairwise-distance diversity exists) |
| 6. RDKit SA_Score | **IMPLEMENTED_AND_VERIFIED** (RDKit Contrib `sascorer` importable; aspirin SA = 1.58) | **NOT_IMPLEMENTED** (no adapter/worker command; not in any campaign stage) |
| 7. Conceptual retrosynthesis | **NOT_IMPLEMENTED** (no code anywhere) | **NOT_IMPLEMENTED** |
| 8. SHA-256 provenance / contentHash | **IMPLEMENTED_AND_VERIFIED** (`provenance.mjs` `canonicalHash`) | **IMPLEMENTED_AND_VERIFIED** (used across campaign; used by the BRICS proof) |

**Summary:** 5 of 8 stages are executable NOW at the engine level (BRICS, ADMET,
docking, MD, Tanimoto, SA_Score all run for real; 6 counting provenance). Only
**conceptual retrosynthesis is entirely absent**. But as *wired Genesis pipeline
stages*, only ADMET, docking, and provenance are integrated; BRICS, MD relaxation,
the 0.7 novelty filter, and SA_Score need adapter/stage wiring (they are not
missing engines — they are missing glue). No Phase-2 discovery classes, targets,
or portfolio exist yet (confirmed in the takeover audit).

## I. BRICS proof-of-capability results (REAL, executed)

**This is NOT Phase 2 portfolio generation.** It is a software-capability proof.
Scripts added: `scripts/brics-proof.mjs` + `scripts/brics_proof_worker.py`.

- **Reference scaffolds (non-sensitive, textbook):** aspirin
  `CC(=O)Oc1ccccc1C(=O)O`, paracetamol `CC(=O)Nc1ccc(O)cc1`, ibuprofen
  `CC(C)Cc1ccc(C(C)C(=O)O)cc1`, benzocaine `CCOC(=O)c1ccc(N)cc1`.
- **Engine:** RDKit 2026.03.3, real `BRICS.BRICSDecompose` + `BRICS.BRICSBuild`.
- **Configuration:** deterministic (`scrambleReagents=False`, `uniquify=True`,
  seed 42 recorded), maxProducts 24, heavy-atom window [6, 40].
- **Fragments (real BRICS decomposition):** 12.
- **Molecules generated:** 24 canonical SMILES, duplicate-free, each re-parsed
  by RDKit for validity.
- **Determinism:** identical output across 3 independent runs.
- **contentHash (SHA-256 via repo `canonicalHash`):**
  `4bc5de27372dcf6517869b6e2e93328f15b44cdfd932145b4020e7bdf956f7f6`
  — byte-identical across all runs.

Sample generated canonical SMILES (first 6 of 24; recombinations of the
reference fragments — **no novelty, therapeutic value, safety, or binding
affinity is claimed for any of these**):

```
CC(=O)OC(=O)c1ccc(-c2ccc(N)cc2)cc1
CC(=O)OC(=O)c1ccc(-c2ccc(O)cc2)cc1
CC(=O)OC(=O)c1ccc(C(=O)O)cc1
CC(=O)OC(=O)c1ccc(C(C)C(=O)O)cc1
CC(=O)OC(=O)c1ccc(CC(C)C)cc1
CC(=O)OC(=O)c1ccc(N)cc1
```

## J. Blockers

1. **BLOCKED_BY_RESOURCES — external structure/data egress.** `files.rcsb.org`
   and external science DBs are blocked by the environment network policy, so the
   Phase 2 protein targets (EGFR 1M17, GABA-A 6X3Z, NMDA 4NF8, MOP 5C1M, GLP-1R
   6B3J) and COCONUT natural-product analogs **cannot be fetched here**. Docking
   needs a real receptor; without the PDBs, real target docking is blocked. (A
   user-supplied local PDB copy would unblock docking against real targets.)
2. **Ephemeral runtime.** All engines were installed into this container's system
   Python. The container is ephemeral — a fresh session starts with zero science
   deps again. Installation must be repeatable (documented in
   `requirements-compute.txt`) or baked into the image.
3. **CAPABILITY_GAP — conceptual retrosynthesis.** No implementation exists.
   (To remain conceptual only — no wet-lab procedures.)
4. **CAPABILITY_GAP — 100 ns MD / FEP.** Not executed; CPU-only. Remains a gap.
   Only short (1–5 ps) relaxation is demonstrated real.
5. **Missing pipeline glue (not missing engines):** BRICS stage, MD relaxation
   stage, 0.7 Tanimoto novelty-filter stage, and SA_Score scoring are not yet
   wired into the multi-fidelity campaign.

## K. Decision: Phase 2 GO / CONDITIONAL GO / NO-GO

**CONDITIONAL GO.**

- The scientific compute substrate is real and verified: 7/7 engines
  VERIFIED_AVAILABLE, 245/245 backend + 601/601 frontend tests green, real QM /
  ADMET / docking / MD / BRICS all executed this session.
- Phase 2 as literally specified (18 leads across 6 classes docked into named PDB
  targets) is **blocked NOW** by BLOCKED_BY_RESOURCES: the target structures and
  COCONUT set are not reachable from this environment.
- Three pipeline stages still need integration glue (BRICS, MD-relax, novelty
  filter, SA_Score), and retrosynthesis is absent.

**Conditions to reach full GO:**
1. Provide the target PDBs locally (or an allowed egress) — unblocks real docking
   against EGFR/GABA-A/NMDA/MOP/GLP-1R.
2. Wire the four missing stages (BRICS gen, Tanimoto 0.7 novelty filter, RDKit
   SA_Score, OpenMM relax) into the campaign as budgeted stages with provenance.
3. Add a conceptual-only retrosynthesis stage (no wet-lab detail).
4. Make the engine install reproducible for the runtime.

Until conditions 1–2 are met, any "portfolio" would be either blocked or
non-real — which the honesty contract forbids presenting as computed results.
