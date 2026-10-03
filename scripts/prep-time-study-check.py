#!/usr/bin/env python3
"""The acceptance gate for the preparation time study - the SAME gate for both arms.

    python3 scripts/prep-time-study-check.py --dir <folder with one subfolder per PDB id>

"Done" has to mean the same thing for the person with the stopwatch and for Genesis, or the
measurement is worthless. This script is that definition. It looks at the files an arm produced
and answers one question per complex: could AutoDock Vina dock this, against the right ligand?

For each PDB id the arm must leave, in a subfolder named after that id (any case):

    receptor.pdb   or receptor.pdbqt   - the prepared receptor
    ligand.sdf     or ligand.mol       - the crystal ligand as a 3D molecule with bond orders
    box.json                           - {"center": [x, y, z], "size": [x, y, z]} in Angstrom

Nothing about HOW those files are produced is prescribed: any tool, any workflow. The gate
checks the result, not the route.

The gate does NOT check pose quality, docking scores or anything a person could be blamed for.
It checks that the receptor is a real protein, that the ligand is the right molecule with the
right heavy atoms, and that the box actually contains it.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

AA3 = {
    "ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY", "HIS", "ILE", "LEU", "LYS",
    "MET", "PHE", "PRO", "SER", "THR", "TRP", "TYR", "VAL", "MSE", "SEC", "PYL",
    "HID", "HIE", "HIP", "CYX", "CYM", "ASH", "GLH", "LYN",
}
MIN_PROTEIN_ATOMS = 200
BOX_MARGIN_A = 0.0          # the ligand must be inside the box, no slack demanded
MAX_BOX_EDGE_A = 40.0       # a box big enough to hold half the protein is not a pocket box


def read_receptor_atoms(path: str):
    """(protein heavy-atom count, all heavy-atom coordinates) from a PDB or PDBQT file."""
    prot, coords = 0, []
    with open(path, errors="ignore") as f:
        for line in f:
            if not line.startswith(("ATOM", "HETATM")):
                continue
            name = line[12:16].strip()
            resn = line[17:20].strip().upper()
            if name.startswith("H") and not name[:1].isdigit():
                continue
            try:
                xyz = (float(line[30:38]), float(line[38:46]), float(line[46:54]))
            except ValueError:
                continue
            coords.append(xyz)
            if resn in AA3:
                prot += 1
    return prot, coords


def read_ligand(path: str):
    """(rdkit mol without hydrogens, heavy-atom count, coordinates) or (None, reason, None)."""
    from rdkit import Chem
    mol = Chem.MolFromMolFile(path, removeHs=True, sanitize=True)
    if mol is None:
        mol = Chem.MolFromMolFile(path, removeHs=True, sanitize=False)
        if mol is None:
            return None, "file_not_readable_as_a_molecule", None
        return None, "molecule_does_not_sanitise", None
    if mol.GetNumConformers() == 0:
        return None, "no_3d_coordinates", None
    conf = mol.GetConformer()
    xyz = [tuple(conf.GetAtomPosition(i)) for i in range(mol.GetNumAtoms())]
    return mol, mol.GetNumAtoms(), xyz


def ccd_heavy_atoms(code: str) -> int:
    from biotite.structure.info import residue
    r = residue(code)
    return int(sum(1 for e in r.element if e != "H"))


def find(folder: str, names) -> str | None:
    for n in names:
        p = os.path.join(folder, n)
        if os.path.exists(p):
            return p
    return None


def check_one(folder: str, pdb_id: str, ligand: str) -> dict:
    out = {"pdbId": pdb_id, "ligand": ligand, "checks": [], "ok": False}

    def fail(check, detail=""):
        out["checks"].append({"check": check, "ok": False, "detail": detail})
        return out

    def passed(check, detail=""):
        out["checks"].append({"check": check, "ok": True, "detail": detail})

    if not os.path.isdir(folder):
        return fail("folder_exists", folder)

    rec = find(folder, ["receptor.pdb", "receptor.pdbqt", "receptor.PDB", "receptor.PDBQT"])
    if rec is None:
        return fail("receptor_file_present", "expected receptor.pdb or receptor.pdbqt")
    prot, rec_xyz = read_receptor_atoms(rec)
    if prot < MIN_PROTEIN_ATOMS:
        return fail("receptor_is_a_protein", "%d amino-acid heavy atoms, need >= %d"
                    % (prot, MIN_PROTEIN_ATOMS))
    passed("receptor_is_a_protein", "%d amino-acid heavy atoms" % prot)

    lig = find(folder, ["ligand.sdf", "ligand.mol", "ligand.SDF", "ligand.MOL"])
    if lig is None:
        return fail("ligand_file_present", "expected ligand.sdf or ligand.mol")
    mol, n_or_reason, lig_xyz = read_ligand(lig)
    if mol is None:
        return fail("ligand_readable", str(n_or_reason))
    n_heavy = n_or_reason
    passed("ligand_readable", "%d heavy atoms" % n_heavy)

    try:
        want = ccd_heavy_atoms(ligand)
    except Exception as e:  # noqa: BLE001
        return fail("ccd_template_available", str(e)[:120])
    if n_heavy != want:
        return fail("ligand_is_the_right_molecule",
                    "%d heavy atoms, the CCD entry %s has %d" % (n_heavy, ligand, want))
    passed("ligand_is_the_right_molecule", "%d heavy atoms match CCD %s" % (n_heavy, ligand))

    from rdkit import Chem
    if any(b.GetBondType() == Chem.BondType.UNSPECIFIED for b in mol.GetBonds()):
        return fail("ligand_has_bond_orders", "at least one bond has no order")
    passed("ligand_has_bond_orders")

    # the ligand must sit in the receptor's frame, not in some other coordinate system
    if rec_xyz and lig_xyz:
        import math
        cx = [sum(c[i] for c in rec_xyz) / len(rec_xyz) for i in range(3)]
        d = math.dist([sum(c[i] for c in lig_xyz) / len(lig_xyz) for i in range(3)], cx)
        if d > 60.0:
            return fail("ligand_in_the_receptor_frame",
                        "ligand centre is %.1f A from the receptor centre" % d)
        passed("ligand_in_the_receptor_frame", "%.1f A from the receptor centre" % d)

    boxf = os.path.join(folder, "box.json")
    if not os.path.exists(boxf):
        return fail("box_file_present", "expected box.json")
    try:
        with open(boxf) as f:
            box = json.load(f)
        cen = [float(v) for v in box["center"]]
        siz = [float(v) for v in box["size"]]
        assert len(cen) == 3 and len(siz) == 3
    except Exception as e:  # noqa: BLE001
        return fail("box_file_readable", str(e)[:120])
    if any(s > MAX_BOX_EDGE_A for s in siz):
        return fail("box_is_a_pocket_box", "edge %.1f A exceeds %.1f" % (max(siz), MAX_BOX_EDGE_A))
    lo = [cen[i] - siz[i] / 2 for i in range(3)]
    hi = [cen[i] + siz[i] / 2 for i in range(3)]
    outside = [p for p in lig_xyz if any(p[i] < lo[i] - BOX_MARGIN_A or p[i] > hi[i] + BOX_MARGIN_A
                                         for i in range(3))]
    if outside:
        return fail("box_contains_the_ligand", "%d of %d ligand atoms fall outside the box"
                    % (len(outside), len(lig_xyz)))
    passed("box_contains_the_ligand", "all %d atoms inside" % len(lig_xyz))

    out["ok"] = True
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="folder holding one subfolder per PDB id")
    ap.add_argument("--manifest",
                    default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                         "docs/evidence/prep-time-study/inputs/manifest.json"))
    ap.add_argument("--json-out", default=None)
    args = ap.parse_args(argv)

    with open(args.manifest) as f:
        cases = json.load(f)

    results = []
    for c in cases:
        pid = c["pdbId"]
        folder = None
        for cand in (pid, pid.lower(), pid.upper()):
            p = os.path.join(args.dir, cand)
            if os.path.isdir(p):
                folder = p
                break
        results.append(check_one(folder or os.path.join(args.dir, pid), pid, c["ligand"]))

    ok = sum(1 for r in results if r["ok"])
    for r in results:
        bad = [c for c in r["checks"] if not c["ok"]]
        print("%-5s %s%s" % (r["pdbId"], "PASS" if r["ok"] else "FAIL",
                             "" if r["ok"] else "  " + bad[-1]["check"] +
                             (": " + bad[-1]["detail"] if bad[-1]["detail"] else "")))
    print("accepted %d / %d" % (ok, len(results)))
    if args.json_out:
        with open(args.json_out, "w") as f:
            json.dump({"accepted": ok, "total": len(results), "cases": results}, f, indent=1)
    return 0 if ok == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
