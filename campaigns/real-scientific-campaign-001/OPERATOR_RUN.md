# GENESIS Campaign #001 — External Execution Package (operator-ready)

Run the **real** BRAF/V600E computational campaign on genuine scientific evidence in a
network-enabled environment. The current agent sandbox blocks egress (proven: 403 CONNECT to
UniProt/ChEMBL/PubChem/Europe PMC/RCSB); this package runs the identical code path elsewhere.

## What it does (ONE command, fail-closed)

`node scripts/run-campaign-001.mjs` performs, aborting on any failure without fabricating data:

1. **preflight** — deps + genuine reachability of all 5 sources, per-source diagnostics
2. **acquire** — UniProt → ChEMBL (target→activities→molecules) → PubChem (CID/SMILES) →
   Europe PMC (literature) → RCSB (optional structure); preserves raw payloads, SHA-256, provenance
3. **verify** — SHA-256 / provenance / identity via the fail-closed bundle adapter
4. **execute** — Campaign #001 on the REAL `VERIFIED_BUNDLE`: real RDKit + real ADMET-AI +
   every scientifically applicable available engine → MCRE conflicts → deterministic ranking →
   Truth-Engine final gate → Discovery Dossier

If mandatory evidence (ChEMBL, PubChem, UniProt) is unavailable, it **fails closed** — no bundle,
no fixtures, no fabrication.

## Requirements

- **Node.js ≥ 22** (uses `node:sqlite`, global `fetch`).
- **Python 3.11+** with **RDKit** and **ADMET-AI** installed and importable by the same `python3`.
- Optional (docking): AutoDock **Vina** + **Meeko** + a prepared receptor (see "Docking" below).
- Outbound HTTPS to: `rest.uniprot.org`, `www.ebi.ac.uk`, `pubchem.ncbi.nlm.nih.gov`,
  `data.rcsb.org`, `search.rcsb.org`, `files.rcsb.org`.

## Bootstrap (installs Python science deps)

```bash
python3 -m pip install --upgrade "rdkit>=2024.3" "admet-ai>=2.0" --ignore-installed packaging setuptools
# (heavy; ADMET-AI pulls torch/chemprop. First run downloads model weights bundled in the package.)
```

## One command — copy-paste

### Local Linux machine
```bash
git clone <your fork of this repo> genesis && cd genesis
git checkout claude/genesis-takeover-audit-kpz019
python3 -m pip install --upgrade "rdkit>=2024.3" "admet-ai>=2.0" --ignore-installed packaging setuptools
node scripts/run-campaign-001.mjs --with-structure
```

### Linux VPS (fresh Ubuntu 22.04/24.04)
```bash
sudo apt-get update && sudo apt-get install -y python3 python3-pip curl git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
git clone <your fork> genesis && cd genesis && git checkout claude/genesis-takeover-audit-kpz019
python3 -m pip install --upgrade "rdkit>=2024.3" "admet-ai>=2.0" --ignore-installed packaging setuptools
node scripts/run-campaign-001.mjs --with-structure
```

### Replit
1. Import the repo into a Replit (Node.js template), open the Shell.
2. In the Shell:
```bash
python3 -m pip install --user --upgrade "rdkit>=2024.3" "admet-ai>=2.0" --ignore-installed packaging setuptools
GENESIS_PYTHON=python3 node scripts/run-campaign-001.mjs
```
(Replit egress is open by default; if a proxy is configured, set standard `HTTPS_PROXY`. Omit
`--with-structure` on constrained Replit plans — RCSB mmCIF download + docking prep are heavy.)

## Docking (optional, real — never faked)

`--with-structure` downloads the BRAF mmCIF from RCSB. mmCIF existence is **not** docking-ready.
To run **real** Vina, prepare a receptor (protonation, binding-site definition, PDBQT via Meeko)
and pass it to the campaign runner (`hasReceptor` + a prepared receptor spec). Without a valid
prepared receptor, docking is **BLOCKED_BY_RUNTIME** and is never replaced by a heuristic score.

## Honest expectation

Even fully executed on real evidence, this produces auditable **computational candidates /
repurposing signals** with full provenance, MCRE conflict handling, and a Truth-Engine gate — it
does **not** constitute drug discovery. The dossier's mandatory answer to "did Genesis find a
drug?" is **NO** unless independent experimental/clinical validation exists (it does not here).
