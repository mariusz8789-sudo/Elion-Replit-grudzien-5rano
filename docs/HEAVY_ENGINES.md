# Heavy Scientific Engines — Validated External Compute Integration

Real, executable scientific engines integrated above the Scientific Acceleration
Engine. Every capability follows the **Verified Scientific Adapter Contract**:
DETECT → VERSION → VALIDATE INPUT → VALIDATE DOMAIN → EXECUTE REAL REFERENCE CASE →
CAPTURE RAW OUTPUT → PARSE → NORMALIZE UNITS → HASH → STORE PROVENANCE → COMPARE
WITH EXPECTATION → PASS VALIDATION → REGISTER. A capability is `AVAILABLE` only
after a real reference case passes — an adapter, a package install, or a UI badge
is **not** a capability.

## Install (optional runtime dependencies)

```bash
pip install -r requirements-compute.txt
```

CPU-only; no GPU required. When a package is absent the capability is reported
`BLOCKED_BY_RUNTIME` — honest, never faked.

## Registered engines (this runtime)

| Capability | Engine | Version | License | Status | Reference case |
| --- | --- | --- | --- | --- | --- |
| molecular-descriptors | RDKit | 2026.03.3 | BSD-3 | AVAILABLE | aspirin logP 1.31; benzene→`Cc1ccccc1` |
| quantum-chemistry | PySCF | 2.13.1 | Apache-2.0 | AVAILABLE | H2 RHF/STO-3G = −1.1168 Ha (literature) |
| molecular-dynamics | OpenMM | 8.5.2 | MIT/LGPL | AVAILABLE | TIP3P water box: min lowers energy, NVT holds 150–450 K |
| molecular-docking | AutoDock Vina + Meeko | 1.2.7 / 0.7.1 | Apache-2.0 / LGPL | AVAILABLE | aspirin→rigid stand-in dock, ≥1 pose, finite favorable score, deterministic |
| protein-structure-ingestion | Biopython | 1.87 | BSD | AVAILABLE | 2-residue ALA PDB parses to expected chains/residues |
| admet-estimation | ADMET-AI (Chemprop D-MPNN) | 2.0.1 | MIT | AVAILABLE | aspirin: execution + determinism + physicochemical cross-check vs RDKit; all 52 TDC endpoints present |
| toxicity-risk-estimation | ADMET-AI (Chemprop D-MPNN) | 2.0.1 | MIT | AVAILABLE | shares the ADMET reference case; toxicity endpoints (hERG/AMES/DILI/ClinTox/…) never returned as SAFE/NON-TOXIC |

Statuses are determined at **runtime** by executing the reference case (cached per
process). Query live via `GET /api/compute/toolchain` and the runtime audit via
`GET /api/compute/environment`.

## Evidence classes

- **MODEL_ESTIMATE** — every docking score (kcal/mol), MD metric, QM property, and
  ADMET/toxicity prediction. Never experimental evidence, never a
  therapeutic/clinical claim.
- **DETERMINISTIC** — protein-structure parsing/validation.
- **CAPABILITY_GAP** — reported honestly whenever no validated executable model is
  integrated for a requested capability; never filled by an LLM or a heuristic
  presented as a validated model.

## Honesty constraints (persisted, enforced)

- No fake docking, MD, quantum chemistry, ADMET, toxicity, or protein results.
- Docking scores are MODEL_ESTIMATE, classified never as EXPERIMENTAL_EVIDENCE.
- ADMET/toxicity remain endpoint-specific; no single "universal score".
- Toxicity never returns SAFE / NON-TOXIC from computational prediction.
- **Environment limitation:** a canonical public protein-ligand redocking
  benchmark requires an RCSB structure; RCSB egress is blocked by this
  environment's policy (HTTP 403 on `files.rcsb.org`). The docking reference case
  therefore validates the *software pipeline* (RDKit 3D embed → Meeko ligand
  PDBQT → rigid receptor → Vina execution → pose/score parsing → determinism)
  against a small-molecule rigid receptor stand-in, labeled as such. It is **not**
  a protein target and makes no binding-affinity claim.

## Multi-fidelity campaign integration

CHEAP → FILTER → EXPENSIVE. RDKit descriptors + Pareto/diversity gate which
candidates reach docking (medium) and quantum chemistry (expensive). Expensive
engines are never called for candidates already invalidated by cheaper validated
constraints. Every stage decision (SELECTED / NOT_SELECTED / FAILED / RETAINED),
every Scientific Run (raw artifacts, sha256, provenance), and every cross-engine
MODEL_CONFLICT is persisted so the WHY engine can explain it.

Reproduce the full pipeline:

```bash
npm run campaign:validate
```
