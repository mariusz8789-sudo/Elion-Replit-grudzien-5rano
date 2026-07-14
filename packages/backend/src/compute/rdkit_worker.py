#!/usr/bin/env python3
"""RDKit worker (Priority A/D) — REAL cheminformatics, called by the Node adapter.

Protocol: argv[1] is a JSON request {"cmd": ..., ...}. Output is a single JSON
line to stdout: {"ok": true, ...} or {"ok": false, "error": ...}. No RDKit →
import fails and the adapter treats the capability as unavailable (never faked).

Commands:
  detect                 -> { ok, version }
  descriptors {smiles}   -> { ok, data: {...real descriptors...} }
  validate {smiles}      -> { ok, valid, canonicalSmiles? }
"""
import sys
import json


def main():
    try:
        req = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": "bad_request: %s" % e}))
        return

    cmd = req.get("cmd")

    try:
        import rdkit
        from rdkit import Chem
        from rdkit.Chem import Descriptors, Lipinski, rdMolDescriptors, Crippen
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": "rdkit_unavailable: %s" % e}))
        return

    if cmd == "detect":
        print(json.dumps({"ok": True, "version": rdkit.__version__}))
        return

    smiles = req.get("smiles", "")
    mol = Chem.MolFromSmiles(smiles) if isinstance(smiles, str) else None
    if mol is None:
        print(json.dumps({"ok": False, "error": "invalid_smiles"}))
        return

    if cmd == "validate":
        print(json.dumps({"ok": True, "valid": True, "canonicalSmiles": Chem.MolToSmiles(mol)}))
        return

    if cmd == "descriptors":
        mw = Descriptors.MolWt(mol)
        logp = Crippen.MolLogP(mol)
        hbd = Lipinski.NumHDonors(mol)
        hba = Lipinski.NumHAcceptors(mol)
        violations = sum([mw > 500, logp > 5, hbd > 5, hba > 10])
        data = {
            "canonicalSmiles": Chem.MolToSmiles(mol),
            "molecularFormula": rdMolDescriptors.CalcMolFormula(mol),
            "molWt": round(mw, 4),
            "exactMolWt": round(Descriptors.ExactMolWt(mol), 5),
            "heavyAtomCount": mol.GetNumHeavyAtoms(),
            "hbd": hbd,
            "hba": hba,
            "rotatableBonds": Descriptors.NumRotatableBonds(mol),
            "ringCount": rdMolDescriptors.CalcNumRings(mol),
            "aromaticRings": rdMolDescriptors.CalcNumAromaticRings(mol),
            "fractionCsp3": round(Descriptors.FractionCSP3(mol), 4),
            "tpsa": round(Descriptors.TPSA(mol), 3),
            "crippenLogP": round(logp, 4),
            "formalCharge": Chem.GetFormalCharge(mol),
            "heteroatomCount": rdMolDescriptors.CalcNumHeteroatoms(mol),
            "lipinskiViolations": violations,
            "lipinskiPass": violations <= 1,
        }
        print(json.dumps({"ok": True, "data": data, "engine": "RDKit " + rdkit.__version__}))
        return

    print(json.dumps({"ok": False, "error": "unknown_cmd: %s" % cmd}))


if __name__ == "__main__":
    main()
