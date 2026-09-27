#!/usr/bin/env bash
# Genesis — stand up the real scientific engines from the repo's own pins.
#
# Three interpreters, NOT one. aizynthfinder pins rdkit<2024 while the docking/QM
# stack runs RDKit 2026.x, so installing them together silently downgrades RDKit
# under the docking worker. admet-ai drags a torch stack that nothing else needs.
# Each venv is therefore built from the requirements file that already pins it,
# and the adapters are pointed at it through GENESIS_*_PYTHON.
#
# Model data is NOT installed here. AiZynthFinder's published models (~1.3 GB,
# own upstream licences) are fetched separately into GENESIS_RETRO_MODEL_DIR;
# until then the engine reports BLOCKED_BY_RUNTIME and Genesis proposes no route.
#
# Usage:
#   bash scripts/genesis-engine-venvs.sh [root]      # default root: /opt/genesis-venv
#   source <(bash scripts/genesis-engine-venvs.sh --env-only)   # just the exports
set -euo pipefail

ROOT="${1:-/opt/genesis-venv}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REQ="$REPO/packages/backend"

emit_env() {
  cat <<EOF
export GENESIS_PYTHON=$ROOT/compute/bin/python
export GENESIS_RDKIT_PYTHON=$ROOT/compute/bin/python
export GENESIS_DOCKING_PYTHON=$ROOT/compute/bin/python
export GENESIS_MEEKO_PYTHON=$ROOT/compute/bin/python
export GENESIS_PYSCF_PYTHON=$ROOT/compute/bin/python
export GENESIS_OPENMM_PYTHON=$ROOT/compute/bin/python
export GENESIS_BIOPYTHON_PYTHON=$ROOT/compute/bin/python
export GENESIS_ADMET_PYTHON=$ROOT/admet/bin/python
export GENESIS_RETRO_PYTHON=$ROOT/retro/bin/python
EOF
}

if [ "${1:-}" = "--env-only" ]; then ROOT="/opt/genesis-venv"; emit_env; exit 0; fi

mk() { python3 -m venv "$ROOT/$1"; "$ROOT/$1/bin/pip" install -q --upgrade pip; }

echo "==> compute venv (RDKit, Vina, Meeko, PySCF, OpenMM, Biopython)"
mk compute
"$ROOT/compute/bin/pip" install -q \
  -r "$REQ/requirements-rdkit.txt" \
  -r "$REQ/requirements-vina.txt" \
  -r "$REQ/requirements-meeko.txt" \
  -r "$REQ/requirements-pyscf.txt" \
  -r "$REQ/requirements-openmm.txt" \
  -r "$REQ/requirements-biopython.txt"

echo "==> admet venv (ADMET-AI; pretrained weights ship in the package)"
mk admet
"$ROOT/admet/bin/pip" install -q -r "$REQ/requirements-admet.txt"

echo "==> retro venv (AiZynthFinder; --no-deps drops its GUI/notebook extras)"
mk retro
"$ROOT/retro/bin/pip" install -q --no-deps aizynthfinder==4.4.1
"$ROOT/retro/bin/pip" install -q -r "$REQ/requirements-retro.txt"

echo
echo "==> installed versions"
"$ROOT/compute/bin/python" - <<'PY'
import importlib.metadata as md
for p in ("rdkit","vina","meeko","scipy","gemmi","pdbfixer","pyscf","openmm","biopython"):
    try: print(f"  {p:12s} {md.version(p)}")
    except Exception: print(f"  {p:12s} MISSING")
PY
"$ROOT/admet/bin/python" -c "import importlib.metadata as md; print('  admet-ai    ', md.version('admet-ai'))"
"$ROOT/retro/bin/python" -c "import importlib.metadata as md; print('  aizynthfinder', md.version('aizynthfinder'), '(rdkit', md.version('rdkit') + ')')"

echo
echo "==> add to your environment:"
emit_env
echo
echo "Retrosynthesis stays BLOCKED_BY_RUNTIME until GENESIS_RETRO_MODEL_DIR holds"
echo "uspto_model.onnx, uspto_templates.csv.gz and zinc_stock.hdf5."
