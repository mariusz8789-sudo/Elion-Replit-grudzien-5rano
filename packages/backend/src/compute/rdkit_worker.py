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

    if cmd == "sascore":
        # Synthetic accessibility (Ertl & Schuffenhauer 2009) via RDKit Contrib.
        smiles = req.get("smiles", "")
        mol = Chem.MolFromSmiles(smiles) if isinstance(smiles, str) else None
        if mol is None:
            print(json.dumps({"ok": False, "error": "invalid_smiles"}))
            return
        try:
            import os as _os
            from rdkit.Chem import RDConfig
            _sa_path = _os.path.join(RDConfig.RDContribDir, "SA_Score")
            if _sa_path not in sys.path:
                sys.path.append(_sa_path)
            import sascorer  # noqa: E402
            print(json.dumps({"ok": True, "saScore": round(sascorer.calculateScore(mol), 4), "engine": "RDKit " + rdkit.__version__ + " SA_Score"}))
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": "sascore_unavailable: %s" % e}))
        return

    if cmd == "alerts":
        # Structural alerts via RDKit FilterCatalog (PAINS + BRENK). Real, not a guess.
        smiles = req.get("smiles", "")
        mol = Chem.MolFromSmiles(smiles) if isinstance(smiles, str) else None
        if mol is None:
            print(json.dumps({"ok": False, "error": "invalid_smiles"}))
            return
        try:
            from rdkit.Chem import FilterCatalog
            params = FilterCatalog.FilterCatalogParams()
            params.AddCatalog(FilterCatalog.FilterCatalogParams.FilterCatalogs.PAINS)
            params.AddCatalog(FilterCatalog.FilterCatalogParams.FilterCatalogs.BRENK)
            cat = FilterCatalog.FilterCatalog(params)
            hits = [m.GetDescription() for m in cat.GetMatches(mol)]
            print(json.dumps({"ok": True, "alerts": hits, "nAlerts": len(hits), "engine": "RDKit " + rdkit.__version__ + " FilterCatalog(PAINS,BRENK)"}))
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": "alerts_unavailable: %s" % e}))
        return

    if cmd == "novelty":
        # Max Tanimoto similarity of `smiles` against a provided reference set.
        # No reference set -> caller must treat as NOT ASSESSED (this returns n=0).
        smiles = req.get("smiles", "")
        ref = req.get("reference", [])
        mol = Chem.MolFromSmiles(smiles) if isinstance(smiles, str) else None
        if mol is None:
            print(json.dumps({"ok": False, "error": "invalid_smiles"}))
            return
        refmols = [Chem.MolFromSmiles(s) for s in ref if isinstance(s, str)]
        refmols = [x for x in refmols if x is not None]
        if not refmols:
            print(json.dumps({"ok": True, "maxTanimoto": None, "nReference": 0}))
            return
        fp = AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=2048)
        reffps = [AllChem.GetMorganFingerprintAsBitVect(x, 2, nBits=2048) for x in refmols]
        sims = [DataStructs.TanimotoSimilarity(fp, r) for r in reffps]
        print(json.dumps({"ok": True, "maxTanimoto": round(max(sims), 5), "nReference": len(reffps)}))
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

    if cmd == "parse-molfile":
        # SDF/MOL import (V-format MOL block: one .mol file, or one record of a multi-
        # molecule .sdf). RDKit parses the real atom/bond table — never a text/regex hack —
        # so structure fidelity matches the file-format spec exactly.
        block = req.get("molblock", "")
        if not isinstance(block, str) or not block.strip():
            print(json.dumps({"ok": False, "error": "invalid_input: pusty blok molfile"}))
            return
        m = Chem.MolFromMolBlock(block, sanitize=True)
        if m is None:
            print(json.dumps({"ok": False, "error": "invalid_molfile"}))
            return
        # First line of a MOL/SDF block conventionally carries the compound name/title.
        first_line = block.split("\n", 1)[0].strip()
        print(json.dumps({"ok": True, "smiles": Chem.MolToSmiles(m), "name": first_line or None}))
        return

    if cmd == "parse-sdf":
        # Multi-record .sdf file — split on the standard "$$$$" record delimiter; a
        # malformed record is skipped and counted, never aborts the whole batch.
        text = req.get("sdf", "")
        if not isinstance(text, str) or not text.strip():
            print(json.dumps({"ok": False, "error": "invalid_input: pusty plik SDF"}))
            return
        # Every record after the first still carries the newline that followed the previous
        # "$$$$" delimiter; strip ONLY that leading blank line, or the fixed-position V2000
        # header (title/program/comment/counts on lines 1-4) shifts by one and fails to parse.
        records = [r.lstrip("\r\n") for r in text.split("$$$$") if r.strip()]
        out = []
        errors = 0
        for i, block in enumerate(records[:2000]):
            m = Chem.MolFromMolBlock(block, sanitize=True)
            if m is None:
                errors += 1
                continue
            first_line = block.strip().split("\n", 1)[0].strip()
            out.append({"smiles": Chem.MolToSmiles(m), "name": first_line or ("cząsteczka %d" % (i + 1))})
        print(json.dumps({"ok": True, "molecules": out, "parsed": len(out), "errors": errors, "total": len(records)}))
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
        # Bonds (atom-index pairs + order) so a client can draw a ball-and-stick model.
        bonds = []
        for b in mh.GetBonds():
            bonds.append({"a": b.GetBeginAtomIdx(), "b": b.GetEndAtomIdx(), "order": b.GetBondTypeAsDouble()})
        print(json.dumps({
            "ok": True, "atoms": atoms, "bonds": bonds, "forceField": ff, "seed": seed,
            "charge": Chem.GetFormalCharge(mol), "nAtoms": len(atoms),
            "canonicalSmiles": Chem.MolToSmiles(mol),
        }))
        return

    if cmd == "depict2d":
        # Publication-quality 2D depiction via RDKit's own renderer (MolDraw2DSVG).
        # Returns a self-contained SVG string the client can inline directly.
        from rdkit.Chem.Draw import rdMolDraw2D
        m = Chem.MolFromSmiles(req.get("smiles", ""))
        if m is None:
            print(json.dumps({"ok": False, "error": "invalid_smiles"}))
            return
        AllChem.Compute2DCoords(m)
        w = int(req.get("width", 420))
        h = int(req.get("height", 320))
        drawer = rdMolDraw2D.MolDraw2DSVG(w, h)
        opts = drawer.drawOptions()
        # Publication-standard black-on-white "molecule card" (readable on any theme);
        # the client frames it on a white swatch, matching PubChem/ChemDraw conventions.
        opts.setBackgroundColour((1, 1, 1, 1))
        opts.bondLineWidth = 2
        rdMolDraw2D.PrepareAndDrawMolecule(drawer, m)
        drawer.FinishDrawing()
        svg = drawer.GetDrawingText()
        print(json.dumps({
            "ok": True, "svg": svg, "width": w, "height": h,
            "canonicalSmiles": Chem.MolToSmiles(m),
            "molecularFormula": rdMolDescriptors.CalcMolFormula(m),
            "engine": "RDKit " + rdkit.__version__,
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

    if cmd == "inchi":
        # Standard InChI + InChIKey (IUPAC) for a SMILES — deterministic identity string.
        m = Chem.MolFromSmiles(req.get("smiles", ""))
        if m is None:
            print(json.dumps({"ok": False, "error": "invalid_smiles"}))
            return
        try:
            from rdkit.Chem import inchi as _inchi
            ik = _inchi.MolToInchi(m)
            key = _inchi.InchiToInchiKey(ik) if ik else None
            print(json.dumps({"ok": True, "inchi": ik, "inchiKey": key, "canonicalSmiles": Chem.MolToSmiles(m), "engine": "RDKit " + rdkit.__version__}))
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": "inchi_failed: %s" % str(e)[:120]}))
        return

    if cmd == "denovo":
        # REAL de novo design via RDKit BRICS (fragment decomposition + recombination) and Murcko
        # scaffolds. Generated molecules are genuine valid structures, deduplicated + validated;
        # nothing is fabricated. Deterministic output (fixed seed + sorted canonical SMILES).
        from rdkit.Chem import BRICS
        from rdkit.Chem.Scaffolds import MurckoScaffold
        mode = req.get("mode", "brics_build")
        seeds = req.get("smiles", []) or req.get("seeds", [])
        count = int(req.get("count", 50))
        seed_mols = [Chem.MolFromSmiles(s) for s in seeds]
        seed_mols = [m for m in seed_mols if m is not None]
        if not seed_mols:
            print(json.dumps({"ok": False, "error": "no_valid_seeds"}))
            return
        seed_canon = set(Chem.MolToSmiles(m) for m in seed_mols)

        def murcko(m):
            try:
                return Chem.MolToSmiles(MurckoScaffold.GetScaffoldForMol(m))
            except Exception:  # noqa: BLE001
                return None

        if mode == "decompose":
            frags = sorted(set(f for m in seed_mols for f in BRICS.BRICSDecompose(m)))
            print(json.dumps({"ok": True, "mode": mode, "fragments": frags}))
            return
        if mode == "murcko":
            print(json.dumps({"ok": True, "mode": mode, "scaffolds": sorted(set(filter(None, (murcko(m) for m in seed_mols))))}))
            return

        frag_mols = [Chem.MolFromSmiles(f) for m in seed_mols for f in BRICS.BRICSDecompose(m)]
        frag_mols = [f for f in frag_mols if f is not None]
        seed_scaffolds = set(filter(None, (murcko(m) for m in seed_mols)))
        products = {}
        # Exhaust the (deterministic, scrambleReagents=False) enumeration up to a safety cap, then
        # sort canonical SMILES and trim — so the output is order-independent + reproducible.
        max_build = int(req.get("maxBuild", 4000))
        seen_iter = 0
        try:
            for prod in BRICS.BRICSBuild(frag_mols, onlyCompleteMols=True, uniquify=True, scrambleReagents=False, maxDepth=int(req.get("maxDepth", 3))):
                seen_iter += 1
                if seen_iter > max_build:
                    break
                try:
                    smi = Chem.MolToSmiles(prod)
                except Exception:  # noqa: BLE001
                    continue
                clean = Chem.MolFromSmiles(smi)
                if smi in seed_canon or smi in products or clean is None:
                    continue
                sc = murcko(clean)  # scaffold from the clean re-parsed molecule
                if mode == "scaffold_hop" and (sc is None or sc in seed_scaffolds):
                    continue  # scaffold hopping keeps only NOVEL scaffolds
                products[smi] = {"smiles": smi, "scaffold": sc, "designMethod": mode}
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": "brics_build_failed: %s" % str(e)[:150]}))
            return
        out = [products[k] for k in sorted(products.keys())][:count]
        print(json.dumps({"ok": True, "mode": mode, "generated": out, "nSeeds": len(seed_mols),
                          "nScaffolds": len(set(p["scaffold"] for p in out if p["scaffold"])),
                          "engine": "RDKit " + rdkit.__version__ + " BRICS"}))
        return

    print(json.dumps({"ok": False, "error": "unknown_cmd: %s" % cmd}))


if __name__ == "__main__":
    main()
