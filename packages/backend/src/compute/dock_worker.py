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
import subprocess
import sys
import tempfile

# 20 standard amino acids — everything else in a chain is treated as a ligand/hetero group.
STANDARD_AA = {
    "ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY", "HIS", "ILE",
    "LEU", "LYS", "MET", "PHE", "PRO", "SER", "THR", "TRP", "TYR", "VAL",
    "SEC", "PYL", "MSE",
}
# Ions / buffers / cryoprotectants that are NOT the biological ligand of interest.
EXCLUDE_LIG = {
    "HOH", "WAT", "DOD", "NA", "CL", "K", "MG", "ZN", "CA", "MN", "FE", "CU",
    "NI", "CO", "CD", "SO4", "PO4", "GOL", "EDO", "PEG", "ACT", "DMS", "IOD",
    "BR", "FMT", "MPD", "TRS", "EPE", "IMD", "NO3", "CO3", "NH4", "PG4",
}


def _read_structure(text, fmt):
    """Parse a PDB or mmCIF structure from text via gemmi (format auto-handled by extension)."""
    import gemmi
    ext = ".cif" if str(fmt).lower() in ("mmcif", "cif") else ".pdb"
    fd, path = tempfile.mkstemp(suffix=ext)
    with os.fdopen(fd, "w") as f:
        f.write(text)
    try:
        st = gemmi.read_structure(path)
        st.setup_entities()
        return st
    finally:
        os.unlink(path)


def _hetero_residues(st):
    """Every non-standard, non-water residue with its atom count + coordinates (candidate ligands)."""
    out = []
    if len(st) == 0:
        return out
    for chain in st[0]:
        for res in chain:
            if res.is_water() or res.name in STANDARD_AA:
                continue
            coords = [(a.pos.x, a.pos.y, a.pos.z) for a in res]
            out.append({
                "name": res.name, "chain": chain.name, "seq": res.seqid.num,
                "nAtoms": len(res), "isExcludedIonBuffer": res.name in EXCLUDE_LIG,
                "coords": coords,
            })
    return out


def _extract_reference_ligand(st):
    """Pick the biological reference ligand: the largest hetero residue that is not an ion/buffer."""
    hets = [h for h in _hetero_residues(st) if not h["isExcludedIonBuffer"] and h["nAtoms"] >= 6]
    if not hets:
        return None
    # Deterministic: most atoms, then name, then chain/seq.
    hets.sort(key=lambda h: (-h["nAtoms"], h["name"], h["chain"], h["seq"]))
    return hets[0]


def _grid_from_coords(coords, padding):
    """Deterministic docking box: centre = ligand centroid, size = bbox extent + 2*padding, clamped."""
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]
    zs = [c[2] for c in coords]
    center = [round(sum(xs) / len(xs), 3), round(sum(ys) / len(ys), 3), round(sum(zs) / len(zs), 3)]
    box = [round(min(60.0, max(16.0, (mx - mn) + 2.0 * padding)), 1)
           for mn, mx in ((min(xs), max(xs)), (min(ys), max(ys)), (min(zs), max(zs)))]
    return center, box


def _write_protein_pdb(st, path):
    """Write a receptor-only PDB (ligands + waters removed) for receptor preparation."""
    import copy
    prot = copy.deepcopy(st)
    prot.remove_ligands_and_waters()
    prot.remove_empty_chains()
    prot.write_pdb(path)
    n = sum(1 for line in open(path) if line.startswith("ATOM"))
    if n == 0:
        raise ValueError("no_protein_atoms_after_cleaning")
    return n


def _prepare_receptor_pdbqt(protein_pdb_path, out_base):
    """Real receptor preparation via Meeko's mk_prepare_receptor -> rigid receptor PDBQT."""
    r = subprocess.run(
        ["mk_prepare_receptor.py", "--read_pdb", protein_pdb_path, "-o", out_base, "-p", "-a"],
        capture_output=True, text=True, timeout=240,
    )
    pdbqt = out_base + ".pdbqt"
    if r.returncode != 0 or not os.path.exists(pdbqt):
        raise ValueError("receptor_prep_failed: %s" % (r.stdout.strip()[-180:] or r.stderr.strip()[-180:]))
    return pdbqt


def _build_complex(seq, ligand_smiles, seed):
    """Build a VALID synthetic protein-ligand complex (peptide + bound ligand) for pipeline
    validation. The structure is synthetic (TEST_FIXTURE); any docking run on it is REAL Vina."""
    from rdkit import Chem
    from rdkit.Chem import AllChem

    def embed(mol):
        m = Chem.AddHs(mol, addCoords=True)
        p = AllChem.ETKDGv3()
        p.randomSeed = seed
        if AllChem.EmbedMolecule(m, p) != 0:
            p2 = AllChem.ETKDGv3()
            p2.randomSeed = seed
            p2.useRandomCoords = True
            p2.maxIterations = 2000
            if AllChem.EmbedMolecule(m, p2) != 0:
                raise ValueError("embed_failed")
        try:
            AllChem.MMFFOptimizeMolecule(m, maxIters=300)
        except Exception:  # noqa: BLE001
            pass
        return Chem.RemoveHs(m)

    prot = embed(Chem.MolFromSequence(seq))
    prot_xyz = prot.GetConformer().GetPositions()
    centroid = [sum(prot_xyz[:, i]) / len(prot_xyz) for i in range(3)]
    prot_atoms = [ln for ln in Chem.MolToPDBBlock(prot).splitlines() if ln.startswith("ATOM")]

    lig = embed(Chem.MolFromSmiles(ligand_smiles))
    lig_xyz = lig.GetConformer().GetPositions()
    lig_c = [sum(lig_xyz[:, i]) / len(lig_xyz) for i in range(3)]
    het = []
    for i, atom in enumerate(lig.GetAtoms(), 1):
        x, y, z = lig_xyz[i - 1]
        x = x - lig_c[0] + centroid[0]
        y = y - lig_c[1] + centroid[1]
        z = z - lig_c[2] + centroid[2]
        el = atom.GetSymbol()
        het.append("HETATM%5d %-4s LIG A 900    %8.3f%8.3f%8.3f  1.00  0.00          %2s"
                    % (i, (el + str(i))[:4], x, y, z, el.rjust(2)))
    return "\n".join(prot_atoms + het) + "\nEND\n"


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

    # Receptor: prepared receptor PDBQT (path or text), or a small-molecule stand-in from SMILES.
    receptor_kind = "provided_pdbqt"
    if req.get("receptorPdbqtPath"):
        with open(req["receptorPdbqtPath"]) as f:
            rec_pdbqt = f.read()
        rec_xyz = None
        receptor_kind = "prepared_receptor"
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
        "inputHash": _sha(json.dumps({"lig": lig_smiles, "rec": req.get("receptorSmiles") or "provided",
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

    if cmd == "build_reference_complex":
        try:
            seq = req.get("sequence") or "ACDEFGHIKLMNPQR"
            ligand = req.get("ligandSmiles") or "c1ccccc1"
            pdb = _build_complex(seq, ligand, int(req.get("seed", 42)))
            print(json.dumps({"ok": True, "format": "pdb", "structure": pdb,
                              "sha256": hashlib.sha256(pdb.encode()).hexdigest(),
                              "note": "SYNTHETIC peptide+ligand complex (TEST_FIXTURE) for docking-pipeline validation"}))
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": "build_complex_failed: %s" % str(e)[:180]}))
        return

    if cmd == "parse_structure":
        try:
            st = _read_structure(req["structure"], req.get("format", "pdb"))
            model = st[0] if len(st) else None
            chains = [c.name for c in model] if model else []
            n_atoms = sum(len(res) for c in model for res in c) if model else 0
            n_prot = sum(1 for c in model for res in c if res.name in STANDARD_AA) if model else 0
            hets = [{k: v for k, v in h.items() if k != "coords"} for h in _hetero_residues(st)]
            ref = _extract_reference_ligand(st)
            print(json.dumps({"ok": True, "chains": chains, "nAtoms": n_atoms,
                              "nProteinResidues": n_prot, "heteroResidues": hets,
                              "referenceLigand": {k: v for k, v in ref.items() if k != "coords"} if ref else None}))
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": "parse_failed: %s" % str(e)[:180]}))
        return

    if cmd == "prepare_receptor":
        try:
            out_dir = req.get("outDir") or tempfile.mkdtemp(prefix="recprep-")
            os.makedirs(out_dir, exist_ok=True)
            st = _read_structure(req["structure"], req.get("format", "pdb"))
            ref = _extract_reference_ligand(st)
            if ref is None:
                print(json.dumps({"ok": False, "error": "no_reference_ligand",
                                  "reason": "structure has no non-ion hetero ligand to define the binding site"}))
                return
            padding = float(req.get("padding", 5.0))
            center, box = _grid_from_coords(ref["coords"], padding)
            prot_pdb = os.path.join(out_dir, "receptor_clean.pdb")
            n_prot_atoms = _write_protein_pdb(st, prot_pdb)
            pdbqt_path = _prepare_receptor_pdbqt(prot_pdb, os.path.join(out_dir, "receptor"))
            rec_text = open(pdbqt_path).read()
            n_rec_atoms = sum(1 for ln in rec_text.splitlines() if ln.startswith(("ATOM", "HETATM")))
            print(json.dumps({
                "ok": True, "receptorPdbqtPath": pdbqt_path,
                "cleanReceptorPdb": prot_pdb, "nProteinAtoms": n_prot_atoms,
                "nReceptorPdbqtAtoms": n_rec_atoms,
                "center": center, "boxSize": box, "padding": padding,
                "referenceLigand": {k: v for k, v in ref.items() if k != "coords"},
                "artifacts": [
                    {"kind": "receptor_clean_pdb", "path": prot_pdb, "sha256_16": _sha(open(prot_pdb).read())},
                    {"kind": "receptor_pdbqt", "path": pdbqt_path, "sha256_16": _sha(rec_text)},
                ],
                "inputStructureSha256": hashlib.sha256(req["structure"].encode()).hexdigest(),
            }))
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": "prepare_receptor_failed: %s" % str(e)[:180]}))
        return

    print(json.dumps({"ok": False, "error": "unknown_cmd: %s" % cmd}))


if __name__ == "__main__":
    main()
