#!/usr/bin/env python3
"""Molecular-docking worker — REAL AutoDock Vina via python bindings + Meeko prep.

AutoDock Vina (Apache-2.0) and Meeko (LGPL) are mature open-source docking tools.
Short-lived subprocess. Protocol: argv[1] is a JSON request {"cmd": ...}. Output
is a single JSON line. Missing engine -> import fails and the adapter treats the
capability as unavailable (never faked).

Commands:
  detect                      -> { ok, vinaVersion, meekoVersion }
  reference {outDir}          -> documented software-integration reference dock
  dock {ligandSmiles, receptorSmiles|receptorPdbqt, center, boxSize, exhaustiveness,
        nPoses, seed, outDir}
                              -> real prepared artifacts + Vina poses/scores

IMPORTANT SCIENTIFIC HONESTY:
- Docking scores are MODEL_ESTIMATE (Vina empirical scoring function, kcal/mol),
  NEVER experimental binding affinity and NEVER a therapeutic claim.
- When a `receptorSmiles` is given, the "receptor" is a small-molecule rigid
  stand-in used to validate the docking SOFTWARE PIPELINE end-to-end. It is not a
  protein target. A canonical protein-ligand redocking benchmark requires an
  external structure (e.g., RCSB), which may be blocked by egress policy.
"""
import hashlib
import json
import os
import sys


def _prep(smiles, seed):
    from rdkit import Chem
    from rdkit.Chem import AllChem
    from meeko import MoleculePreparation, PDBQTWriterLegacy
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError("invalid_smiles: %s" % smiles)
    mol = Chem.AddHs(mol)
    p = AllChem.ETKDGv3()
    p.randomSeed = seed
    if AllChem.EmbedMolecule(mol, p) != 0:
        raise ValueError("embed_failed")
    if AllChem.MMFFHasAllMoleculeParams(mol):
        AllChem.MMFFOptimizeMolecule(mol, maxIters=500)
    else:
        AllChem.UFFOptimizeMolecule(mol, maxIters=500)
    prep = MoleculePreparation()
    setup = prep.prepare(mol)[0]
    pdbqt, ok, err = PDBQTWriterLegacy.write_string(setup)
    if not ok:
        raise ValueError("pdbqt_write_failed: %s" % err)
    coords = mol.GetConformer().GetPositions()
    return pdbqt, coords


def _rigidify(pdbqt):
    # Rigid receptor PDBQT: keep only atom records (Vina rejects torsion-tree tags).
    return "\n".join(l for l in pdbqt.splitlines() if l.startswith(("ATOM", "HETATM"))) + "\n"


def _sha(text):
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def _run_dock(req, out_dir):
    from vina import Vina
    import numpy as np
    seed = int(req.get("seed", 42))
    exhaustiveness = max(1, min(int(req.get("exhaustiveness", 8)), 32))
    n_poses = max(1, min(int(req.get("nPoses", 5)), 20))
    box = req.get("boxSize", [22.0, 22.0, 22.0])
    box = [float(b) for b in box][:3]
    if any(b <= 0 or b > 60 for b in box):
        raise ValueError("box_out_of_range")

    lig_smiles = req.get("ligandSmiles")
    if not lig_smiles:
        raise ValueError("ligandSmiles_required")
    lig_pdbqt, lig_xyz = _prep(str(lig_smiles), seed)

    # Receptor: prepared rigid PDBQT provided, or a small-molecule stand-in from SMILES.
    receptor_kind = "provided_pdbqt"
    if req.get("receptorPdbqtPath"):
        with open(str(req["receptorPdbqtPath"]), "r") as handle:
            rec_pdbqt = handle.read()
        rec_xyz = None
    elif req.get("receptorPdbqt"):
        rec_pdbqt = str(req["receptorPdbqt"])
        rec_xyz = None
    elif req.get("receptorSmiles"):
        raw, rec_xyz = _prep(str(req["receptorSmiles"]), seed)
        rec_pdbqt = _rigidify(raw)
        receptor_kind = "small_molecule_standin"
    else:
        raise ValueError("receptor_required (receptorPdbqt or receptorSmiles)")

    center = req.get("center")
    if center is None:
        if rec_xyz is not None:
            center = [round(float(x), 3) for x in rec_xyz.mean(axis=0)]
        else:
            raise ValueError("center_required_for_provided_receptor")
    center = [float(c) for c in center][:3]

    os.makedirs(out_dir, exist_ok=True)
    rec_path = os.path.join(out_dir, "receptor.pdbqt")
    lig_path = os.path.join(out_dir, "ligand.pdbqt")
    out_path = os.path.join(out_dir, "docked.pdbqt")
    with open(rec_path, "w") as f:
        f.write(rec_pdbqt)
    with open(lig_path, "w") as f:
        f.write(lig_pdbqt)

    v = Vina(sf_name="vina", seed=seed, verbosity=0)
    v.set_receptor(rec_path)
    v.set_ligand_from_file(lig_path)
    v.compute_vina_maps(center=center, box_size=box)
    v.dock(exhaustiveness=exhaustiveness, n_poses=n_poses)
    v.write_poses(out_path, n_poses=n_poses, overwrite=True)
    energies = v.energies(n_poses=n_poses)

    poses = []
    for i, e in enumerate(energies):
        poses.append({"rank": i + 1, "affinityKcalMol": round(float(e[0]), 3)})
    best = poses[0]["affinityKcalMol"] if poses else None

    import vina as vina_mod
    import meeko as meeko_mod
    return {
        "vinaVersion": getattr(vina_mod, "__version__", "?"),
        "meekoVersion": getattr(meeko_mod, "__version__", "?"),
        "receptorKind": receptor_kind,
        "center": center, "boxSize": box, "exhaustiveness": exhaustiveness,
        "seed": seed, "nPoses": len(poses),
        "bestAffinityKcalMol": best, "poses": poses,
        "ligandAtoms": int(len(lig_xyz)),
        "artifacts": [
            {"kind": "receptor_pdbqt", "path": rec_path, "sha256_16": _sha(rec_pdbqt)},
            {"kind": "ligand_pdbqt", "path": lig_path, "sha256_16": _sha(lig_pdbqt)},
            {"kind": "docked_pdbqt", "path": out_path, "sha256_16": _sha(open(out_path).read())},
        ],
        "inputHash": _sha(json.dumps({"lig": lig_smiles, "rec": req.get("receptorSmiles") or req.get("receptorPdbqtPath") or "provided",
                                      "center": center, "box": box, "ex": exhaustiveness, "seed": seed}, sort_keys=True)),
    }


def main():
    try:
        req = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": "bad_request: %s" % e}))
        return

    cmd = req.get("cmd")

    try:
        import vina  # noqa: F401
        import meeko  # noqa: F401
        from rdkit import Chem  # noqa: F401
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": "docking_unavailable: %s" % e}))
        return

    if cmd == "detect":
        import vina as vina_mod
        import meeko as meeko_mod
        print(json.dumps({"ok": True, "vinaVersion": getattr(vina_mod, "__version__", "?"),
                          "meekoVersion": getattr(meeko_mod, "__version__", "?")}))
        return

    if cmd == "reference":
        try:
            out_dir = req.get("outDir") or os.path.join(os.getcwd(), "_dock_ref")
            spec = {"ligandSmiles": "CC(=O)Oc1ccccc1C(=O)O",  # aspirin
                    "receptorSmiles": "c1ccc2[nH]ccc2c1",     # indole rigid stand-in
                    "center": [0.0, 0.0, 0.0], "boxSize": [22, 22, 22],
                    "exhaustiveness": 8, "nPoses": 5, "seed": 42, "outDir": out_dir}
            r = _run_dock(spec, out_dir)
            # Reference pass: Vina executed, produced >=1 pose, finite favorable score.
            passed = (r["nPoses"] >= 1 and r["bestAffinityKcalMol"] is not None
                      and r["bestAffinityKcalMol"] < 0)
            r["pass"] = bool(passed)
            r["case"] = "aspirin -> indole rigid stand-in (docking software-integration validation)"
            print(json.dumps({"ok": True, **r}))
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": "dock_reference_failed: %s" % str(e)[:180]}))
        return

    if cmd == "dock":
        try:
            out_dir = req.get("outDir") or os.path.join(os.getcwd(), "_dock")
            r = _run_dock(req, out_dir)
            print(json.dumps({"ok": True, **r}))
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": "dock_failed: %s" % str(e)[:180]}))
        return

    print(json.dumps({"ok": False, "error": "unknown_cmd: %s" % cmd}))


if __name__ == "__main__":
    main()
