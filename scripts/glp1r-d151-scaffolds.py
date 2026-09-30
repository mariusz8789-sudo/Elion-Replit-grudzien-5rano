#!/usr/bin/env python3
"""D-151/D-152 scaffold diagnostic: Bemis-Murcko scaffolds of the FUNCTIONAL_AGONISM arm.

Reads the compound list written by scripts/glp1r-d151-endpoint-role.mjs (pass 1)
and writes artifacts/glp1r-d151-scaffolds.json. Independent of the production
pipeline's own scaffold routine, and labelled as such in the sealed artefact.

Run: python3 scripts/glp1r-d151-scaffolds.py
"""
import json
import os
import sys

from rdkit import Chem, RDLogger
from rdkit.Chem.Scaffolds import MurckoScaffold

RDLogger.DisableLog("rdApp.*")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Defaults are D-151. Pass two paths to point it at another pass (D-152):
#   python3 scripts/glp1r-d151-scaffolds.py <in.json> <out.json>
IN_PATH = sys.argv[1] if len(sys.argv) > 2 else os.path.join(ROOT, "artifacts", "glp1r-d151-functional-smiles.json")
OUT_PATH = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "artifacts", "glp1r-d151-scaffolds.json")

if not os.path.exists(IN_PATH):
    sys.exit(f"missing {IN_PATH} — run scripts/glp1r-d151-endpoint-role.mjs first")

smiles = json.load(open(IN_PATH))["functionalAgonismSmiles"]

scaffolds, unparseable = {}, []
for s in smiles:
    mol = Chem.MolFromSmiles(s)
    if mol is None:
        unparseable.append(s)
        continue
    core = MurckoScaffold.GetScaffoldForMol(mol)
    key = Chem.MolToSmiles(core) if core is not None and core.GetNumAtoms() else "<acyclic>"
    scaffolds.setdefault(key, 0)
    scaffolds[key] += 1

sizes = sorted(scaffolds.values(), reverse=True)
out = {
    "status": "OK",
    "method": "Bemis-Murcko via RDKit MurckoScaffold, independent of the production rdkitAdapter",
    "rdkitVersion": __import__("rdkit").__version__,
    "compounds": len(smiles),
    "parsed": len(smiles) - len(unparseable),
    "unparseable": len(unparseable),
    "distinctScaffolds": len(scaffolds),
    "largestScaffoldShare": round(sizes[0] / max(1, len(smiles) - len(unparseable)), 4) if sizes else None,
    "scaffoldSizeHistogram": sizes[:20],
    "acyclicCompounds": scaffolds.get("<acyclic>", 0),
}
os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
with open(OUT_PATH, "w") as fh:
    json.dump(out, fh, indent=2)
    fh.write("\n")
print(json.dumps(out, indent=2))
