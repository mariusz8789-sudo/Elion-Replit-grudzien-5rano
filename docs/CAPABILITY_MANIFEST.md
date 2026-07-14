# Genesis Lab — Capability Manifest

`packages/backend/src/compute/capabilities.mjs` — the single honest source of
what Genesis Lab can and cannot compute. `GET /api/compute/capabilities`.

## Statuses
- `AVAILABLE` — implemented, deterministic, tested (maps to a real registry model).
- `NOT_IMPLEMENTED` — absent; no path without an external engine.
- `EXTERNAL_ENGINE_REQUIRED` — needs an external scientific engine/data.
- `MODEL_NOT_VALID_FOR_DOMAIN` — a model exists but is out of its validity range.

For anything other than `AVAILABLE`, the system returns **CAPABILITY GAP
DETECTED** with the status and what it would take — never a fabricated number.

Statuses for RDKit-backed capabilities are resolved **at runtime** by
`compute/rdkitAdapter.mjs:detect()`. With `pip install rdkit` present they are
`AVAILABLE` and compute for real; absent, they are `BLOCKED_BY_RUNTIME` with the
exact missing dependency — never a fabricated number. See `requirements-compute.txt`.

| Capability | Status | Needs |
|---|---|---|
| molecular-weight | AVAILABLE | — (chem-molecular-weight, formula-based) |
| formula-validation | AVAILABLE | — |
| molecular-descriptors | AVAILABLE if RDKit present, else BLOCKED_BY_RUNTIME | `pip install rdkit` (chem-rdkit-descriptors) |
| logp | AVAILABLE if RDKit present, else BLOCKED_BY_RUNTIME | RDKit Crippen logP |
| lipinski-ro5 | AVAILABLE if RDKit present, else BLOCKED_BY_RUNTIME | RDKit (MW+logP+HBD+HBA) |
| structure-validation | AVAILABLE if RDKit present, else BLOCKED_BY_RUNTIME | RDKit SMILES parser |
| docking | EXTERNAL_ENGINE_REQUIRED | 3D target + AutoDock Vina + force field |
| molecular-dynamics | EXTERNAL_ENGINE_REQUIRED | OpenMM/GROMACS + force field |
| quantum-chemistry | EXTERNAL_ENGINE_REQUIRED | Psi4/ORCA + basis set |
| admet | EXTERNAL_ENGINE_REQUIRED | validated QSAR/ML models |
| toxicity | EXTERNAL_ENGINE_REQUIRED | validated tox models + data |
| protein-structure | EXTERNAL_ENGINE_REQUIRED | AlphaFold / experimental PDB |
| generative-de-novo | NOT_IMPLEMENTED | validated generative model + synthesis + safety filters |

Each entry declares an `adapter` signature — the interface a future real engine
plugs into.
