#!/usr/bin/env python3
"""RDKit worker (Priority A/D) — REAL cheminformatics, called by the Node adapter.

Protocol: argv[1] is a JSON request {"cmd": ..., ...}. Output is a single JSON
line to stdout: {"ok": true, ...} or {"ok": false, "error": ...}. No RDKit →
import fails and the adapter treats the capability as unavailable (never faked).

Commands:
  detect                 -> { ok, version }
  descriptors {smiles}   -> { ok, data: {...real descriptors...} }
  validate {smiles}      -> { ok, valid, canonicalSmiles? }
  similarity {smiles, reference} -> { ok, tanimoto, sameScaffold, ... } (structural ONLY, never affinity)
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
        from rdkit import Chem, DataStructs, RDLogger
        from rdkit.Chem import Descriptors, Lipinski, rdMolDescriptors, Crippen, AllChem
        RDLogger.DisableLog("rdApp.*")  # ostrzeżenia deprecacji na stderr są szumem; błędy i tak wracają jako JSON
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": "rdkit_unavailable: %s" % e}))
        return

    if cmd == "detect":
        print(json.dumps({"ok": True, "version": rdkit.__version__}))
        return

    # Deterministyczne transformacje oparte na REAKCJACH SMARTS (nie mutacja tekstu).
    # Każda dodaje grupę funkcyjną w pozycji aromatycznej C-H; RDKit sanityzuje i
    # kanonizuje produkty. To realna chemia, powtarzalna i walidowalna.
    TRANSFORMATIONS = {
        "add-methyl":   "[cH:1]>>[c:1]C",
        "add-hydroxyl": "[cH:1]>>[c:1]O",
        "add-fluoro":   "[cH:1]>>[c:1]F",
        "add-chloro":   "[cH:1]>>[c:1]Cl",
        "add-amino":    "[cH:1]>>[c:1]N",
        "add-nitrile":  "[cH:1]>>[c:1]C#N",
    }

    if cmd == "transformations":
        print(json.dumps({"ok": True, "transformations": sorted(TRANSFORMATIONS.keys())}))
        return

    if cmd == "diversity":
        smiles_list = req.get("smiles", [])
        mols = [Chem.MolFromSmiles(s) for s in smiles_list if isinstance(s, str)]
        mols = [m for m in mols if m is not None]
        if len(mols) < 2:
            print(json.dumps({"ok": True, "meanPairwiseDistance": 0.0, "n": len(mols)}))
            return
        fps = [AllChem.GetMorganFingerprintAsBitVect(m, 2, nBits=2048) for m in mols]
        total = 0.0
        pairs = 0
        for i in range(len(fps)):
            for j in range(i + 1, len(fps)):
                total += 1.0 - DataStructs.TanimotoSimilarity(fps[i], fps[j])
                pairs += 1
        print(json.dumps({"ok": True, "meanPairwiseDistance": round(total / pairs, 5), "n": len(mols)}))
        return

    smiles = req.get("smiles", "")
    mol = Chem.MolFromSmiles(smiles) if isinstance(smiles, str) else None
    if mol is None:
        print(json.dumps({"ok": False, "error": "invalid_smiles"}))
        return

    if cmd == "validate":
        print(json.dumps({"ok": True, "valid": True, "canonicalSmiles": Chem.MolToSmiles(mol)}))
        return

    if cmd == "similarity":
        # REAL Tanimoto similarity on Morgan fingerprints (radius 2, 2048 bits),
        # plus a real Bemis-Murcko scaffold comparison. Both are structural
        # measures ONLY: a high value says two molecules share substructure,
        # never that they share biological activity. Callers must not use this
        # as a proxy for affinity — see structuralSimilarity.ts.
        from rdkit.Chem.Scaffolds import MurckoScaffold

        reference_smiles = req.get("reference", "")
        ref_mol = Chem.MolFromSmiles(reference_smiles) if isinstance(reference_smiles, str) else None
        if ref_mol is None:
            print(json.dumps({"ok": False, "error": "invalid_reference_smiles"}))
            return

        fp_a = AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=2048)
        fp_b = AllChem.GetMorganFingerprintAsBitVect(ref_mol, 2, nBits=2048)
        tanimoto = DataStructs.TanimotoSimilarity(fp_a, fp_b)

        def scaffold_of(m):
            try:
                scaffold = MurckoScaffold.GetScaffoldForMol(m)
                return Chem.MolToSmiles(scaffold) if scaffold is not None else ""
            except Exception:  # noqa: BLE001
                return ""

        scaffold_candidate = scaffold_of(mol)
        scaffold_reference = scaffold_of(ref_mol)
        print(json.dumps({
            "ok": True,
            "tanimoto": round(tanimoto, 5),
            "fingerprint": "morgan_r2_2048",
            "candidateCanonical": Chem.MolToSmiles(mol),
            "referenceCanonical": Chem.MolToSmiles(ref_mol),
            "scaffoldCandidate": scaffold_candidate,
            "scaffoldReference": scaffold_reference,
            "sameScaffold": scaffold_candidate != "" and scaffold_candidate == scaffold_reference,
        }))
        return

    if cmd == "transform":
        tname = req.get("transformation")
        smarts = TRANSFORMATIONS.get(tname)
        if smarts is None:
            print(json.dumps({"ok": False, "error": "unknown_transformation: %s" % tname}))
            return
        rxn = AllChem.ReactionFromSmarts(smarts)
        parent_canon = Chem.MolToSmiles(mol)
        products = {}
        for prodset in rxn.RunReactants((mol,)):
            for p in prodset:
                try:
                    Chem.SanitizeMol(p)
                    canon = Chem.MolToSmiles(p)
                except Exception:  # noqa: BLE001
                    continue
                if canon and canon != parent_canon:
                    products[canon] = True
        print(json.dumps({
            "ok": True, "parentCanonical": parent_canon,
            "transformation": tname, "products": sorted(products.keys()),
        }))
        return

    if cmd == "embed3d":
        # Realna geometria 3D: dodaj wodory, osadź (ETKDG, seed deterministyczny),
        # zoptymalizuj polem MMFF/UFF. Zwraca atomy w Angstremach — wejście dla QM.
        seed = int(req.get("seed", 42))
        mh = Chem.AddHs(mol)
        params = AllChem.ETKDGv3()
        params.randomSeed = seed
        if AllChem.EmbedMolecule(mh, params) != 0:
            print(json.dumps({"ok": False, "error": "embed_failed"}))
            return
        ff = "MMFF"
        if AllChem.MMFFHasAllMoleculeParams(mh):
            AllChem.MMFFOptimizeMolecule(mh, maxIters=500)
        else:
            AllChem.UFFOptimizeMolecule(mh, maxIters=500)
            ff = "UFF"
        conf = mh.GetConformer()
        atoms = []
        for i, at in enumerate(mh.GetAtoms()):
            p = conf.GetAtomPosition(i)
            atoms.append({"element": at.GetSymbol(), "x": round(p.x, 5), "y": round(p.y, 5), "z": round(p.z, 5)})
        print(json.dumps({
            "ok": True, "atoms": atoms, "forceField": ff, "seed": seed,
            "charge": Chem.GetFormalCharge(mol), "nAtoms": len(atoms),
            "canonicalSmiles": Chem.MolToSmiles(mol),
        }))
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
