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

| Capability | Status | Needs |
|---|---|---|
| molecular-weight | AVAILABLE | — (chem-molecular-weight) |
| formula-validation | AVAILABLE | — |
| logp | NOT_IMPLEMENTED | atom-contribution model (e.g. Crippen) |
| docking | EXTERNAL_ENGINE_REQUIRED | 3D target + AutoDock Vina + force field |
| molecular-dynamics | EXTERNAL_ENGINE_REQUIRED | OpenMM/GROMACS + force field |
| quantum-chemistry | EXTERNAL_ENGINE_REQUIRED | Psi4/ORCA + basis set |
| admet | EXTERNAL_ENGINE_REQUIRED | validated QSAR/ML models |
| toxicity | EXTERNAL_ENGINE_REQUIRED | validated tox models + data |
| protein-structure | EXTERNAL_ENGINE_REQUIRED | AlphaFold / experimental PDB |
| generative-de-novo | NOT_IMPLEMENTED | validated generative model + synthesis + safety filters |

Each entry declares an `adapter` signature — the interface a future real engine
plugs into.
