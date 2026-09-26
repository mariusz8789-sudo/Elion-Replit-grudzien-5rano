#!/usr/bin/env python3
"""Molecular-docking worker — REAL AutoDock Vina via python bindings + Meeko prep.

AutoDock Vina (Apache-2.0) and Meeko (LGPL) are mature open-source docking tools.
Short-lived subprocess. Protocol: argv[1] is a JSON request {"cmd": ...}. Output
is a single JSON line. Missing engine -> import fails and the adapter treats the
capability as unavailable (never faked).

Commands:
  detect                      -> { ok, vinaVersion, meekoVersion }
  reference {outDir}          -> documented software-integration reference dock
  dock {ligandSmiles, receptorSmiles|receptorPdbqt|receptorPdbqtPath, ligandPdbqtPath?,
        center, boxSize, exhaustiveness, nPoses, seed, outDir}
                              -> real prepared artifacts + Vina poses/scores; with a protein
                                 receptor also the top pose (atoms, bonds, PDBQT text) and the
                                 receptor residues lining it
  prepare_receptor {pdbPath, center, boxSize, outDir}
                              -> deterministic Meeko receptor preparation of a vetted PDB file
  prepare_ligand {ligandSmiles, seed, outDir}
                              -> deterministic RDKit ETKDG/MMFF + Meeko ligand PDBQT
  redock {pdbPath, ligandSdfPath, center, boxSize, exhaustiveness, seed, outDir}
                              -> re-docks the co-crystallised ligand and reports the heavy-atom
                                 RMSD of the top pose against the crystal pose

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
    return hashlib.sha256(text.encode()).hexdigest()


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
    if req.get("ligandPdbqtPath"):
        # Ligand already prepared by `prepare_ligand` (same _prep, same seed) — reuse the exact file.
        with open(str(req["ligandPdbqtPath"]), "r") as handle:
            lig_pdbqt = handle.read()
        lig_xyz = [l for l in lig_pdbqt.splitlines() if l.startswith(("ATOM", "HETATM"))]
    else:
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

    pose = pocket = None
    pose_pdbqt = None
    if receptor_kind == "provided_pdbqt" and poses:
        pose, pose_pdbqt = _top_pose(open(out_path).read())
        pocket = _pocket(rec_pdbqt, pose["atoms"])

    import vina as vina_mod
    import meeko as meeko_mod
    return {
        "pose": pose, "pocket": pocket, "posePdbqt": pose_pdbqt,
        "poseSha256": _sha(pose_pdbqt) if pose_pdbqt else None,
        "ligandPdbqtSha256": _sha(lig_pdbqt),
        "vinaVersion": getattr(vina_mod, "__version__", "?"),
        "meekoVersion": getattr(meeko_mod, "__version__", "?"),
        "receptorKind": receptor_kind,
        "center": center, "boxSize": box, "exhaustiveness": exhaustiveness,
        "seed": seed, "nPoses": len(poses),
        "bestAffinityKcalMol": best, "poses": poses,
        "ligandAtoms": int(len(lig_xyz)),
        "artifacts": [
            {"kind": "receptor_pdbqt", "path": rec_path, "sha256": _sha(rec_pdbqt)},
            {"kind": "ligand_pdbqt", "path": lig_path, "sha256": _sha(lig_pdbqt)},
            {"kind": "docked_pdbqt", "path": out_path, "sha256": _sha(open(out_path).read())},
        ],
        "inputHash": _sha(json.dumps({"lig": lig_smiles, "rec": req.get("receptorSmiles") or _sha(rec_pdbqt),
                                      "center": center, "box": box, "ex": exhaustiveness, "seed": seed}, sort_keys=True)),
    }


def _top_pose(docked_text):
    """Top-ranked Vina pose as heavy atoms + bonds (Meeko rebuilds the RDKit molecule from the PDBQT)."""
    from meeko import PDBQTMolecule, RDKitMolCreate
    from rdkit import Chem
    model1 = []
    for line in docked_text.splitlines():
        model1.append(line)
        if line.startswith("ENDMDL"):
            break
    model1_text = "\n".join(model1) + "\n"
    pm = PDBQTMolecule(docked_text, skip_typing=True)
    mol = RDKitMolCreate.from_pdbqt_mol(pm)[0]
    first = mol.GetConformers()[0]
    single = Chem.Mol(mol)
    single.RemoveAllConformers()
    single.AddConformer(Chem.Conformer(first), assignId=True)
    heavy = Chem.RemoveHs(single)
    conf = heavy.GetConformer()
    atoms = []
    for a in heavy.GetAtoms():
        p = conf.GetAtomPosition(a.GetIdx())
        atoms.append([a.GetSymbol(), round(p.x, 3), round(p.y, 3), round(p.z, 3)])
    bonds = [[b.GetBeginAtomIdx(), b.GetEndAtomIdx(), 1.5 if b.GetIsAromatic() else float(b.GetBondTypeAsDouble())]
             for b in heavy.GetBonds()]
    return {"atoms": atoms, "bonds": bonds, "smiles": Chem.MolToSmiles(heavy)}, model1_text


def _pocket(rec_pdbqt, pose_atoms, cutoff=4.5):
    """Receptor residues with any heavy atom within `cutoff` Å of the pose; all their heavy atoms."""
    import numpy as np
    recs = []
    for l in rec_pdbqt.splitlines():
        if not l.startswith(("ATOM", "HETATM")):
            continue
        ad = l[77:79].strip()
        if ad in ("H", "HD", "HS"):
            continue
        name = l[12:16].strip()
        res = "%s%s:%s" % (l[17:20].strip(), l[22:26].strip(), l[21].strip())
        el = ad[0] if ad not in ("OA", "NA", "SA", "Cl", "CL", "Br", "BR") else {"OA": "O", "NA": "N", "SA": "S"}.get(ad, ad.capitalize())
        recs.append((res, name, el, float(l[30:38]), float(l[38:46]), float(l[46:54])))
    if not recs:
        return {"residues": [], "atoms": [], "cutoffA": cutoff}
    rxyz = np.array([[r[3], r[4], r[5]] for r in recs])
    lxyz = np.array([[a[1], a[2], a[3]] for a in pose_atoms])
    d = np.sqrt(((rxyz[:, None, :] - lxyz[None, :, :]) ** 2).sum(-1)).min(axis=1)
    near = []
    for i, r in enumerate(recs):
        if d[i] <= cutoff and r[0] not in near:
            near.append(r[0])
    keep = set(near)
    atoms = [[r[2], round(r[3], 3), round(r[4], 3), round(r[5], 3), near.index(r[0])] for r in recs if r[0] in keep]
    return {"residues": near, "atoms": atoms, "cutoffA": cutoff}


def _prepare_receptor(req, out_dir):
    """Deterministic receptor preparation: stable residue ordering, then Meeko mk_prepare_receptor."""
    import subprocess
    import meeko as meeko_mod
    pdb_path = str(req["pdbPath"])
    raw = open(pdb_path).read()
    lines = raw.splitlines()
    # A deposited structure carries more than the receptor: other chains (nanobody, G protein),
    # waters, lipids and crystallisation matter. The registry says which chains are the receptor;
    # everything else is dropped here, deterministically, and the record says so.
    chains = req.get("chains")
    keep_het = bool(req.get("keepHetatm", False))
    kinds = ("ATOM", "HETATM") if keep_het else ("ATOM",)
    atoms = [(i, l) for i, l in enumerate(lines)
             if l.startswith(kinds) and (not chains or l[21] in set(chains))]
    if not atoms:
        raise ValueError("receptor_empty_after_filter")
    ordered = sorted(atoms, key=lambda t: (t[1][21], int(t[1][22:26]), t[1][26], t[0]))
    reordered = any(a[0] != b[0] for a, b in zip(atoms, ordered))
    ordered_text = "\n".join(l for _, l in ordered) + "\nEND\n"
    os.makedirs(out_dir, exist_ok=True)
    ordered_path = os.path.join(out_dir, "receptor_ordered.pdb")
    with open(ordered_path, "w") as f:
        f.write(ordered_text)

    # A deposited structure can lack side-chain atoms a template needs. PDBFixer adds THOSE atoms and
    # the terminal oxygen; missing loops are deliberately NOT modelled (`missingResidues = {}`), because
    # inventing backbone that was never observed would be inventing structure. Hydrogens are left to
    # Meeko. The record says whether this step ran and what it added.
    repaired = {"ran": False}
    if req.get("repair"):
        from pdbfixer import PDBFixer
        from openmm.app import PDBFile
        fixer = PDBFixer(filename=ordered_path)
        fixer.findMissingResidues()
        fixer.missingResidues = {}
        fixer.findMissingAtoms()
        repaired = {"ran": True, "residuesWithMissingAtoms": len(fixer.missingAtoms), "missingTerminals": len(fixer.missingTerminals),
                    "unmodelledLoops": "NOT_MODELLED"}
        fixer.addMissingAtoms()
        ordered_path = os.path.join(out_dir, "receptor_repaired.pdb")
        with open(ordered_path, "w") as handle:
            PDBFile.writeFile(fixer.topology, fixer.positions, handle, keepIds=True)
        ordered_text = open(ordered_path).read()
    center = [float(c) for c in req["center"]][:3]
    box = [float(b) for b in req.get("boxSize", [20, 20, 20])][:3]
    base = os.path.join(out_dir, "receptor")
    args = ["--read_pdb", ordered_path, "-o", base, "-p", "-v",
            "--box_size", *["%.3f" % b for b in box], "--box_center", *["%.3f" % c for c in center]]
    proc = subprocess.run([sys.executable, "-m", "meeko.cli.mk_prepare_receptor", *args],
                          capture_output=True, text=True, timeout=240)
    pdbqt_path = base + ".pdbqt"
    if proc.returncode != 0 or not os.path.exists(pdbqt_path):
        raise ValueError("receptor_prep_failed: %s" % (proc.stderr or proc.stdout)[-160:])
    pdbqt = open(pdbqt_path).read()
    n_atoms = sum(1 for l in pdbqt.splitlines() if l.startswith(("ATOM", "HETATM")))
    return {
        "receptorPdbqtPath": pdbqt_path, "receptorPdbqtSha256": _sha(pdbqt),
        "sourceSha256": _sha(raw), "orderedSha256": _sha(ordered_text),
        "sourceAtoms": len(atoms), "reordered": reordered, "receptorAtoms": n_atoms,
        "chainsKept": list(chains) if chains else "ALL", "hetatmKept": keep_het, "repair": repaired,
        "meekoVersion": getattr(meeko_mod, "__version__", "?"),
        "preparation": {
            "step1": "keep the receptor chains' ATOM records (waters, lipids and other chains dropped); stable sort by (chain, residue number, insertion code, file order)",
            "step1b": "PDBFixer: add missing side-chain atoms and terminal oxygen; missing loops NOT modelled; hydrogens left to Meeko" if repaired["ran"] else "no repair requested",
            "step2": "meeko mk_prepare_receptor --read_pdb (templates, Gasteiger charges from template, AD4 atom types) -> rigid PDBQT",
            "arguments": ["--read_pdb", "<ordered.pdb>", "-p", "-v", "--box_size", *["%.3f" % b for b in box], "--box_center", *["%.3f" % c for c in center]],
        },
        "center": center, "boxSize": box,
    }


def _redock(req, out_dir):
    """Crystal-ligand redocking: dock the co-crystallised ligand from its SMILES, RMSD vs crystal pose."""
    from rdkit import Chem
    from rdkit.Chem import rdMolAlign
    xtal = Chem.MolFromMolFile(str(req["ligandSdfPath"]), removeHs=False)
    if xtal is None:
        raise ValueError("ligand_sdf_unreadable")
    ref = Chem.RemoveHs(xtal)
    smiles = Chem.MolToSmiles(ref)
    rec = _prepare_receptor(req, os.path.join(out_dir, "receptor"))
    r = _run_dock({"ligandSmiles": smiles, "receptorPdbqtPath": rec["receptorPdbqtPath"], "center": rec["center"],
                   "boxSize": rec["boxSize"], "exhaustiveness": req.get("exhaustiveness", 8), "nPoses": 1,
                   "seed": req.get("seed", 42)}, os.path.join(out_dir, "dock"))
    from meeko import PDBQTMolecule, RDKitMolCreate
    pm = PDBQTMolecule(open(r["artifacts"][2]["path"]).read(), skip_typing=True)
    mol = Chem.RemoveHs(RDKitMolCreate.from_pdbqt_mol(pm)[0])
    single = Chem.Mol(mol)
    single.RemoveAllConformers()
    single.AddConformer(Chem.Conformer(mol.GetConformers()[0]), assignId=True)
    # Symmetry-aware heavy-atom RMSD, in place (no superposition): the pose is judged in the crystal frame.
    rmsd = rdMolAlign.CalcRMS(single, ref)
    return {"ligandSmiles": smiles, "rmsdA": round(float(rmsd), 3), "bestAffinityKcalMol": r["bestAffinityKcalMol"],
            "receptor": rec, "vinaVersion": r["vinaVersion"], "meekoVersion": r["meekoVersion"],
            "poseSha256": r["poseSha256"], "seed": r["seed"], "exhaustiveness": r["exhaustiveness"]}


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

    if cmd in ("prepare_receptor", "prepare_ligand", "redock"):
        try:
            out_dir = req.get("outDir") or os.path.join(os.getcwd(), "_" + cmd)
            if cmd == "prepare_receptor":
                r = _prepare_receptor(req, out_dir)
            elif cmd == "redock":
                r = _redock(req, out_dir)
            else:
                seed = int(req.get("seed", 42))
                pdbqt, xyz = _prep(str(req["ligandSmiles"]), seed)
                os.makedirs(out_dir, exist_ok=True)
                path = os.path.join(out_dir, "ligand.pdbqt")
                with open(path, "w") as f:
                    f.write(pdbqt)
                import meeko as meeko_mod
                from rdkit import rdBase
                r = {"ligandPdbqtPath": path, "ligandPdbqtSha256": _sha(pdbqt), "atoms": int(len(xyz)), "seed": seed,
                     "preparation": "RDKit AddHs + ETKDGv3(randomSeed=%d) + MMFF94 (UFF fallback) 500 iters -> Meeko MoleculePreparation -> PDBQT" % seed,
                     "rdkitVersion": rdBase.rdkitVersion, "meekoVersion": getattr(meeko_mod, "__version__", "?")}
            print(json.dumps({"ok": True, **r}))
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": "%s_failed: %s" % (cmd, str(e)[:180])}))
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
