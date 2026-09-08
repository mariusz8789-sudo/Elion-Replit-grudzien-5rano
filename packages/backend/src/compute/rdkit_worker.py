#!/usr/bin/env python3
"""RDKit worker (Priority A/D) — REAL cheminformatics, called by the Node adapter.

Protocol: argv[1] is a JSON request {"cmd": ..., ...}. Output is a single JSON
line to stdout: {"ok": true, ...} or {"ok": false, "error": ...}. No RDKit →
import fails and the adapter treats the capability as unavailable (never faked).

Commands:
  detect                 -> { ok, version }
  descriptors {smiles}   -> { ok, data: {...real descriptors...} }
  validate {smiles}      -> { ok, valid, canonicalSmiles? }
  similarity {smiles, reference} -> { ok, tanimoto, scaffold* }
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

    # REKOMBINACJA FRAGMENTOW BRICS — realny, deterministyczny sposob na wyjscie
    # POZA staly, wyliczony zbior transformacji jednorodzicielskich powyzej.
    #
    # BRICS (Degen i in. 2008) to opublikowany zbior regul rozbioru czasteczki na
    # fragmenty po wiazaniach syntetycznie dostepnych. RDKit implementuje go w
    # `rdkit.Chem.BRICS`: BRICSDecompose rozklada, BRICSBuild sklada ponownie,
    # laczac fragmenty WYLACZNIE tam, gdzie typy punktow przylaczenia pasuja do
    # siebie wedlug tych regul. Dzieki temu produkt zlozony z fragmentow DWOCH
    # roznych rodzicow jest chemia, nie sklejaniem tekstu.
    #
    # Determinizm: scrambleReagents=False wylacza losowa kolejnosc reagentow —
    # ta sama pula fragmentow daje ta sama sekwencje produktow w kazdym procesie.
    # To jest sprawdzane w tescie, nie zalozone.
    #
    # To NIE jest generatywne projektowanie de novo: nie ma tu modelu proponujacego
    # nowe rusztowania. To szersze, ale wciaz kombinatoryczne przeszukiwanie —
    # ograniczone do fragmentow obecnych w rodzicach i regul laczenia BRICS.
    if cmd == "brics":
        from rdkit.Chem import BRICS
        smiles_in = req.get("smiles", [])
        if not isinstance(smiles_in, list) or len(smiles_in) < 1:
            print(json.dumps({"ok": False, "error": "brics_needs_smiles_list"}))
            return
        max_products = int(req.get("maxProducts", 8))
        max_depth = int(req.get("maxDepth", 2))
        parents = []
        fragments_by_parent = {}
        pool = set()
        for s in smiles_in:
            if not isinstance(s, str):
                continue
            m = Chem.MolFromSmiles(s)
            if m is None:
                print(json.dumps({"ok": False, "error": "invalid_smiles: %s" % s}))
                return
            canonical = Chem.MolToSmiles(m)
            parents.append(canonical)
            frags = sorted(BRICS.BRICSDecompose(m))
            fragments_by_parent[canonical] = frags
            pool.update(frags)
        # Jeden fragment na rodzica = czasteczka nierozkladalna wedlug regul BRICS;
        # nie ma z czego rekombinowac i mowimy to wprost zamiast zwracac rodzicow.
        if len(pool) < 2:
            print(json.dumps({"ok": True, "products": [], "fragmentsByParent": fragments_by_parent,
                              "reason": "not_decomposable", "engine": "RDKit " + rdkit.__version__}))
            return
        frag_mols = [Chem.MolFromSmiles(f) for f in sorted(pool)]
        frag_mols = [m for m in frag_mols if m is not None]
        parent_set = set(parents)
        products = []
        seen = set()
        # Twardy limit pobran z generatora: BRICSBuild jest nieskonczony dla wiekszych
        # pul, a adapter ma 10 s budzetu. Limit jest deterministyczny, nie losowy.
        max_draws = max_products * 20
        try:
            builder = BRICS.BRICSBuild(frag_mols, onlyCompleteMols=True,
                                       scrambleReagents=False, maxDepth=max_depth)
            for i, prod in enumerate(builder):
                if i >= max_draws or len(products) >= max_products:
                    break
                try:
                    prod.UpdatePropertyCache(strict=False)
                    Chem.SanitizeMol(prod)
                    smi = Chem.MolToSmiles(prod)
                except Exception:  # noqa: BLE001 — produkt niesanityzowalny odrzucamy, nie naprawiamy
                    continue
                # Odtworzony rodzic nie jest nowym kandydatem.
                if smi in parent_set or smi in seen:
                    continue
                seen.add(smi)
                products.append(smi)
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": "brics_build_failed: %s" % e}))
            return
        print(json.dumps({"ok": True, "products": products, "fragmentsByParent": fragments_by_parent,
                          "engine": "RDKit " + rdkit.__version__}))
        return

    # Porownanie STRUKTURALNE dwoch czasteczek: Tanimoto na Morgan FP (r=2, 2048 bit)
    # + rzeczywisty szkielet Bemisa-Murcko. Oba pochodza wprost z RDKit; zadna
    # wartosc nie jest tu szacowana ani interpolowana.
    if cmd == "similarity":
        from rdkit.Chem.Scaffolds import MurckoScaffold
        cand = Chem.MolFromSmiles(req.get("smiles", "")) if isinstance(req.get("smiles"), str) else None
        ref = Chem.MolFromSmiles(req.get("reference", "")) if isinstance(req.get("reference"), str) else None
        if cand is None or ref is None:
            print(json.dumps({"ok": False, "error": "invalid_smiles"}))
            return
        fp_cand = AllChem.GetMorganFingerprintAsBitVect(cand, 2, nBits=2048)
        fp_ref = AllChem.GetMorganFingerprintAsBitVect(ref, 2, nBits=2048)
        scaffold_cand = Chem.MolToSmiles(MurckoScaffold.GetScaffoldForMol(cand))
        scaffold_ref = Chem.MolToSmiles(MurckoScaffold.GetScaffoldForMol(ref))
        print(json.dumps({
            "ok": True,
            "tanimoto": round(DataStructs.TanimotoSimilarity(fp_cand, fp_ref), 5),
            "fingerprint": "morgan_r2_2048",
            "candidateCanonical": Chem.MolToSmiles(cand),
            "referenceCanonical": Chem.MolToSmiles(ref),
            "scaffoldCandidate": scaffold_cand,
            "scaffoldReference": scaffold_ref,
            "sameScaffold": scaffold_cand == scaffold_ref,
        }))
        return

    smiles = req.get("smiles", "")
    mol = Chem.MolFromSmiles(smiles) if isinstance(smiles, str) else None
    if mol is None:
        print(json.dumps({"ok": False, "error": "invalid_smiles"}))
        return

    if cmd == "validate":
        print(json.dumps({"ok": True, "valid": True, "canonicalSmiles": Chem.MolToSmiles(mol)}))
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
        # Wiazania sa REALNE dane RDKit (mol.GetBonds()), nie wnioskowanie z odleglosci
        # miedzyatomowych. Indeksy a/b odnosza sie do tablicy `atoms` powyzej, w tej samej
        # kolejnosci. `order` to GetBondTypeAsDouble(): 1.0 / 1.5 (aromatyczne) / 2.0 / 3.0.
        bonds = []
        for b in mh.GetBonds():
            bonds.append({
                "a": b.GetBeginAtomIdx(),
                "b": b.GetEndAtomIdx(),
                "order": b.GetBondTypeAsDouble(),
                "aromatic": 1 if b.GetIsAromatic() else 0,
            })
        print(json.dumps({
            "ok": True, "atoms": atoms, "bonds": bonds, "forceField": ff, "seed": seed,
            "charge": Chem.GetFormalCharge(mol), "nAtoms": len(atoms), "nBonds": len(bonds),
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
        try:
            from rdkit.Chem import inchi as rd_inchi
            data["inchi"] = rd_inchi.MolToInchi(mol) or None
            data["inchiKey"] = rd_inchi.MolToInchiKey(mol) or None
        except Exception:  # noqa: BLE001 — brak modulu InChI => brak identyfikatora, nie zmyslony
            data["inchi"] = None
            data["inchiKey"] = None
        print(json.dumps({"ok": True, "data": data, "engine": "RDKit " + rdkit.__version__}))
        return

    print(json.dumps({"ok": False, "error": "unknown_cmd: %s" % cmd}))


if __name__ == "__main__":
    main()
