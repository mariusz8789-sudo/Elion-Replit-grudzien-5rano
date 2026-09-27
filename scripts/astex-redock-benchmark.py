#!/usr/bin/env python3
"""GENESIS — Astex Diverse Set crystal-ligand redocking benchmark.

    python3 scripts/astex-redock-benchmark.py --data <p2rank-datasets>/joined/astex [--only 1T46,1G9V] [--jobs 2]

One imatinib redock (1IEP) is an anecdote. This runs the SAME docking code
Genesis uses everywhere (`packages/backend/src/compute/dock_worker.py`, command
`redock`: Meeko receptor prep -> RDKit ligand from SMILES -> AutoDock Vina ->
symmetry-aware heavy-atom RMSD of the top pose, in the crystal frame) on all 85
complexes of the Astex Diverse Set (Hartshorn et al., J. Med. Chem. 2007, 50,
726-741), as distributed in rdk/p2rank-datasets (joined/astex).

The protocol is frozen in `docs/evidence/astex-redock-prereg.json` BEFORE any
case is docked; this script refuses to run if the file's protocol does not match
the constants below. Every case counts: a case whose preparation fails is a
FAILURE in the headline rate, never dropped from the denominator.

Run 3 (amendment 4) keeps cofactors next to the ligand as rigid receptor atoms, drops deposited
receptor hydrogens and monovalent ions, reads ligand elements from the CCD, and uses exhaustiveness 32.
`--smoke` runs a draft protocol on a few cases WITHOUT the preregistration check; its output is marked
unregistered and is never a benchmark result (smoke results are disclosed in the amendment).

Output: docs/evidence/astex-redock-benchmark-<date>.json (per case: input SHA-256,
ligand definition, box, RMSD, Vina score, status, error).
"""
import argparse
import concurrent.futures as cf
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKER = os.path.join(REPO, "packages/backend/src/compute/dock_worker.py")
PREREG = os.path.join(REPO, "docs/evidence/astex-redock-prereg.json")

EXHAUSTIVENESS = 32
# Monovalent Na+/K+ are not kept: Meeko 0.8 has no template for them (run 2: 1K3U, 1MEH, 1OYT, 1T9B, 1V4S).
METALS = {"ZN", "MG", "CA", "MN", "FE", "CO", "NI", "CU"}
WATERS = {"HOH", "WAT", "DOD"}
# Common crystallisation additives / buffer components; never treated as cofactors.
ADDITIVES = {"SO4", "PO4", "GOL", "EDO", "PEG", "PGE", "PG4", "1PE", "P6G", "MPD", "DMS", "ACT", "FMT", "EPE",
             "MES", "TRS", "CIT", "TLA", "IMD", "BME", "NO3", "CL", "IOD", "BR", "BOG", "LDA", "SCN", "AZI", "IPA",
             "EOH", "MOH", "DMF", "MLI", "SIN", "VO4", "MO3", "NH4", "CO3", "BCT", "PGO", "PGR", "HEZ", "1BO", "BU3"}
COFACTOR_RADIUS_A = 8.0
COFACTOR_MIN_HEAVY = 5

PROTOCOL = {
    "dataset": "Astex Diverse Set, 85 complexes (Hartshorn et al., J. Med. Chem. 2007, 50, 726-741)",
    "distribution": "github.com/rdk/p2rank-datasets, directory joined/astex",
    "distributionCommit": "0236ecb38cbb60b89849a1ea36fbd9ee93f3e906",
    "ligandDefinition": "the HETATM residue in chain L (the Astex file convention); where a file has no chain L, the single residue carrying the listed ligand code; altloc ' ' or 'A' only",
    "ligandChemistry": "bond orders and formal charges from the wwPDB Chemical Component Dictionary entry (as shipped in biotite) assigned to the crystal heavy atoms with RDKit AssignBondOrdersFromTemplate; template = the file's residue name if its heavy-atom count matches, else the listed code; element symbols taken from the template by atom name when every crystal atom name is in the entry (a deposited element column can be wrong, e.g. 1NAV chlorines labelled C); written as SDF, then dock_worker redock: SDF -> canonical SMILES -> RDKit ETKDGv3(seed) + MMFF -> Meeko",
    "receptor": "all ATOM records of the file with altloc ' ' or 'A' (altloc column cleared) and deposited hydrogens removed (Meeko adds hydrogens from its residue templates), plus single-atom metal ions (ZN, MG, CA, MN, FE, CO, NI, CU) as HETATM; monovalent NA and K dropped (Meeko 0.8 has no template for them); waters dropped; cofactors kept as defined under 'cofactors'; all other HETATM dropped; Meeko mk_prepare_receptor via dock_worker; no repair",
    "cofactors": "every HETATM residue (altloc ' ' or 'A', heavy atoms) that is not water, not a metal ion, not in chain L, not of the ligand's residue name and not a common crystallisation additive (%s), that has >= %d heavy atoms, any heavy atom within %.1f A of any crystal-ligand heavy atom, and a heavy-atom count equal to its wwPDB CCD entry's; kept rigid at its crystal coordinates: CCD bond orders (RDKit AssignBondOrdersFromTemplate), element symbols from the CCD by atom name, RDKit AddHs(addCoords), Meeko MoleculePreparation (AD4 types, Gasteiger charges), torsion tree discarded, atoms appended to the Meeko receptor PDBQT (dock_worker extraRigidPdbqtPaths, SHA-256 recorded); a metal inside a cofactor (haem Fe) is written as a separate metal atom and a former neighbour left below its default valence gets the matching negative formal charge; a cofactor that cannot be typed is left out and recorded; every case lists the cofactors kept and not kept" % (
        ", ".join(sorted(ADDITIVES)), COFACTOR_MIN_HEAVY, COFACTOR_RADIUS_A),
    "box": "centre = crystal-ligand heavy-atom centroid; edge per axis = clamp(ligand extent + 10 A, 20 A, 30 A)",
    "receptorTemplateTolerance": "Meeko --delete_bad_res and --forgive_extra_bonds: residues that do not match a template (e.g. incomplete side chains) are deleted rather than failing the case; the record lists the flags",
    "engine": "AutoDock Vina (vina scoring), exhaustiveness %d, seed 42, top pose only" % EXHAUSTIVENESS,
    "metric": "symmetry-aware heavy-atom RMSD of the top-ranked pose vs the crystal pose, no superposition (RDKit CalcRMS)",
    "successCriterion": "RMSD < 2.0 A",
    "headline": "successes / 85 — every preparation or docking failure counts as a failure",
}


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def protocol_fingerprint():
    return sha256_bytes(json.dumps(PROTOCOL, sort_keys=True).encode())


def ligand_lines(pdb_text, code):
    lines = [l for l in pdb_text.splitlines() if l.startswith("HETATM") and l[16] in (" ", "A")]
    chain_l = [l for l in lines if l[21] == "L"]
    pool = chain_l if chain_l else [l for l in lines if l[17:20].strip() == code]
    if not pool:
        raise ValueError("ligand_not_found")
    first = (pool[0][17:20], pool[0][21], pool[0][22:27])
    residue = [l for l in pool if (l[17:20], l[21], l[22:27]) == first]
    heavy = [l for l in residue if l[76:78].strip().upper() != "H"]
    return first[0].strip(), heavy


def ligand_sdf(heavy_lines, resname, listed, path):
    from rdkit import Chem
    from rdkit.Chem import AllChem
    import biotite.structure.info as info
    from biotite.interface import rdkit as brd
    used = None
    for code in dict.fromkeys([resname, listed]):
        try:
            tmpl = Chem.RemoveHs(brd.to_mol(info.residue(code)))
        except Exception:  # noqa: BLE001
            continue
        if tmpl.GetNumAtoms() == len(heavy_lines):
            used = code
            break
    if used is None:
        raise ValueError("no_ccd_template_with_%d_heavy_atoms" % len(heavy_lines))
    heavy_lines, fixed = elements_from_ccd(heavy_lines, used)
    block = "\n".join(heavy_lines) + "\nEND\n"
    xtal = Chem.MolFromPDBBlock(block, removeHs=False, sanitize=False, proximityBonding=True)
    if xtal is None:
        raise ValueError("pdb_block_unreadable")
    mol = AllChem.AssignBondOrdersFromTemplate(tmpl, xtal)
    Chem.SanitizeMol(mol)
    Chem.MolToMolFile(mol, path)
    return used, fixed


def elements_from_ccd(lines, code):
    """Element symbols from the CCD entry, matched by atom name, when every atom name is in the entry.

    Some deposited files carry a wrong element column (e.g. 1NAV: chlorines CL5/CL6 labelled C).
    Returns (lines, number of element columns changed); lines are unchanged if any name is missing."""
    import biotite.structure.info as info
    ref = info.residue(code)
    by_name = {n: e for n, e in zip(ref.atom_name, ref.element) if e != "H"}
    names = [l[12:16].strip() for l in lines]
    if not all(n in by_name for n in names):
        return lines, 0
    out, fixed = [], 0
    for l, n in zip(lines, names):
        el = by_name[n].upper()
        if l[76:78].strip().upper() != el:
            fixed += 1
        out.append(l[:76].ljust(76) + el.rjust(2) + l[78:])
    return out, fixed



def is_hydrogen(l):
    el = l[76:78].strip().upper()
    if el:
        return el in ("H", "D")
    return l[12:16].strip().lstrip("0123456789").upper().startswith(("H", "D"))


def clean_receptor(pdb_text, path):
    keep = []
    for l in pdb_text.splitlines():
        if l[16:17] not in (" ", "A"):
            continue
        if not l.startswith(("ATOM", "HETATM")) or is_hydrogen(l):
            continue  # deposited hydrogens dropped (1KZK's are malformed); Meeko adds them from its templates
        if l.startswith("ATOM") or (l[17:20].strip() in METALS and l[21] != "L"):
            keep.append(l[:16] + " " + l[17:])
    with open(path, "w") as f:
        f.write("\n".join(keep) + "\nEND\n")


def box_for(heavy_lines):
    xyz = [(float(l[30:38]), float(l[38:46]), float(l[46:54])) for l in heavy_lines]
    n = len(xyz)
    center = [round(sum(p[i] for p in xyz) / n, 3) for i in range(3)]
    size = []
    for i in range(3):
        extent = max(p[i] for p in xyz) - min(p[i] for p in xyz)
        size.append(round(min(30.0, max(20.0, extent + 10.0)), 3))
    return center, size


def cofactor_residues(pdb_text, lig_heavy):
    """Non-water, non-ligand, non-metal, non-additive HETATM residues near the ligand with a CCD template."""
    import biotite.structure.info as info
    lig_name = lig_heavy[0][17:20]
    lxyz = [(float(l[30:38]), float(l[38:46]), float(l[46:54])) for l in lig_heavy]
    groups = {}
    for l in pdb_text.splitlines():
        if not l.startswith("HETATM") or l[16] not in (" ", "A") or is_hydrogen(l):
            continue
        name = l[17:20].strip()
        if name in WATERS or name in METALS or name in ADDITIVES or l[17:20] == lig_name or l[21] == "L":
            continue
        groups.setdefault((l[17:20], l[21], l[22:27]), []).append(l)
    picked, skipped = [], []
    r2 = COFACTOR_RADIUS_A ** 2
    for key, lines in groups.items():
        label = "%s%s%s" % (key[0].strip(), key[1].strip() and ":" + key[1], key[2].strip())
        if len(lines) < COFACTOR_MIN_HEAVY:
            continue
        near = any((float(l[30:38]) - x) ** 2 + (float(l[38:46]) - y) ** 2 + (float(l[46:54]) - z) ** 2 <= r2
                   for l in lines for (x, y, z) in lxyz)
        if not near:
            continue
        try:
            n_tmpl = sum(1 for e in info.residue(key[0].strip()).element if e != "H")
        except Exception:  # noqa: BLE001
            n_tmpl = None
        if n_tmpl != len(lines):
            skipped.append({"residue": label, "reason": "no_ccd_template_with_%d_heavy_atoms" % len(lines)})
            continue
        picked.append((label, key[0].strip(), lines))
    return picked, skipped


def cofactor_pdbqt(code, lines, path):
    """Rigid AD4-typed PDBQT of a cofactor at its crystal coordinates: CCD bond orders, RDKit H, Meeko typing."""
    from rdkit import Chem
    from rdkit.Chem import AllChem
    from meeko import MoleculePreparation, PDBQTWriterLegacy
    import biotite.structure.info as info
    from biotite.interface import rdkit as brd
    lines, _ = elements_from_ccd(lines, code)
    tmpl = brd.to_mol(info.residue(code))
    xtal = Chem.MolFromPDBBlock("\n".join(lines) + "\nEND\n", removeHs=False, sanitize=False, proximityBonding=True)
    metal_lines = []
    metal_idx = [a.GetIdx() for a in tmpl.GetAtoms() if a.GetSymbol().upper() in METALS]
    if metal_idx:
        # A metal inside the cofactor (haem iron) is kept as a separate metal atom, as metal ions are. On the
        # Kekule template, a former neighbour left below its default valence keeps the electron pair (charge -1).
        em = Chem.RWMol(tmpl)
        Chem.Kekulize(em, clearAromaticFlags=True)
        pt = Chem.GetPeriodicTable()
        for i in metal_idx:
            for b in em.GetAtomWithIdx(i).GetBonds():
                nb = b.GetOtherAtom(em.GetAtomWithIdx(i))
                left = sum(x.GetBondTypeAsDouble() for x in nb.GetBonds() if x.GetIdx() != b.GetIdx())
                deficit = int(pt.GetDefaultValence(nb.GetAtomicNum()) - left)
                if deficit > 0:
                    nb.SetFormalCharge(nb.GetFormalCharge() - deficit)
                    nb.SetNoImplicit(True)
        for i in sorted(metal_idx, reverse=True):
            em.RemoveAtom(i)
        tmpl = em.GetMol()
        Chem.SanitizeMol(tmpl)
        keep = [l for l in lines if l[76:78].strip().upper() not in METALS]
        metal_lines = [l for l in lines if l[76:78].strip().upper() in METALS]
        xtal = Chem.MolFromPDBBlock("\n".join(keep) + "\nEND\n", removeHs=False, sanitize=False, proximityBonding=True)
    tmpl = Chem.RemoveHs(tmpl)
    mol = AllChem.AssignBondOrdersFromTemplate(tmpl, xtal)
    Chem.SanitizeMol(mol)
    molh = Chem.AddHs(mol, addCoords=True)
    setup = MoleculePreparation().prepare(molh)[0]
    pdbqt, ok, err = PDBQTWriterLegacy.write_string(setup)
    if not ok:
        raise ValueError("pdbqt_write_failed: %s" % err)
    atoms = [l for l in pdbqt.splitlines() if l.startswith(("ATOM", "HETATM"))]
    for l in metal_lines:
        el = l[76:78].strip().capitalize()
        atoms.append("HETATM%5d %-4s %3s  %4d    %8.3f%8.3f%8.3f  1.00  0.00    %6.3f %-2s" % (
            len(atoms) + 1, el.upper(), code[:3], 1, float(l[30:38]), float(l[38:46]), float(l[46:54]), 0.0, el))
    with open(path, "w") as f:
        f.write("\n".join(atoms) + "\n")
    return len(atoms)


def run_case(case, data_dir, work):
    pdb_id, code = case["pdbId"], case["ligand"]
    path = os.path.join(data_dir, pdb_id.lower() + ".pdb")
    raw = open(path, "rb").read()
    out = {"pdbId": pdb_id, "listedLigand": code, "inputSha256": sha256_bytes(raw)}
    if case.get("sha256") and case["sha256"] != out["inputSha256"]:
        return {**out, "status": "INPUT_HASH_MISMATCH", "success": False}
    try:
        resname, heavy = ligand_lines(raw.decode(), code)
        out.update({"ligandResidue": resname, "ligandHeavyAtoms": len(heavy)})
        case_dir = os.path.join(work, pdb_id)
        os.makedirs(case_dir, exist_ok=True)
        sdf = os.path.join(case_dir, "ligand.sdf")
        out["ccdTemplate"], out["ligandElementsFromCcd"] = ligand_sdf(heavy, resname, code, sdf)
        center, size = box_for(heavy)
        out.update({"center": center, "boxSize": size})
        receptor = os.path.join(case_dir, "receptor_clean.pdb")
        clean_receptor(raw.decode(), receptor)
        picked, skipped = cofactor_residues(raw.decode(), heavy)
        extra, cofactors = [], []
        for label, ccode, lines in picked:
            cpath = os.path.join(case_dir, "cofactor_%s.pdbqt" % label.replace(":", "_"))
            try:
                n = cofactor_pdbqt(ccode, lines, cpath)
            except Exception as e:  # noqa: BLE001  — declared: an untypable cofactor is left out and recorded
                skipped.append({"residue": label, "reason": "typing_failed: %s" % str(e)[:80]})
                continue
            extra.append(cpath)
            cofactors.append({"residue": label, "heavyAtoms": len(lines), "pdbqtAtoms": n})
        out.update({"cofactorsKept": cofactors, "cofactorsNotKept": skipped})
        req = {"cmd": "redock", "pdbPath": receptor, "keepHetatm": True, "ligandSdfPath": sdf, "center": center, "boxSize": size,
               "exhaustiveness": EXHAUSTIVENESS, "seed": 42, "outDir": os.path.join(case_dir, "run"),
               "deleteBadRes": True, "forgiveExtraBonds": True, "extraRigidPdbqtPaths": extra}
        proc = subprocess.run([sys.executable, WORKER, json.dumps(req)], capture_output=True, text=True, timeout=1800)
        r = json.loads(proc.stdout.strip().splitlines()[-1])
    except Exception as e:  # noqa: BLE001
        return {**out, "status": "PREPARATION_FAILED", "success": False, "error": str(e)[:200]}
    if not r.get("ok"):
        return {**out, "status": "DOCKING_FAILED", "success": False, "error": str(r.get("error"))[:200]}
    rmsd = r["rmsdA"]
    return {**out, "status": "DOCKED", "success": rmsd < 2.0, "rmsdA": rmsd, "vinaScoreKcalMol": r["bestAffinityKcalMol"],
            "ligandSmiles": r["ligandSmiles"], "poseSha256": r["poseSha256"], "receptorPdbqtSha256": r["receptor"]["receptorPdbqtSha256"], "receptorTemplateTolerance": r["receptor"].get("templateTolerance"),
            "extraRigidPdbqt": [{k: x[k] for k in ("sha256", "atoms")} for x in r["receptor"].get("extraRigidPdbqt", [])],
            "vinaVersion": r["vinaVersion"], "meekoVersion": r["meekoVersion"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--jobs", type=int, default=2)
    ap.add_argument("--out", default="")
    ap.add_argument("--label", default="", help="human-readable run label stored in the record (e.g. 'RUN 3 ...')")
    ap.add_argument("--smoke", action="store_true",
                    help="UNREGISTERED smoke test of a draft protocol on --only cases; output marked as smoke, never a benchmark result")
    ap.add_argument("--smoke-exhaustiveness", type=int, default=0)
    args = ap.parse_args()

    prereg = json.load(open(PREREG))
    if args.smoke:
        if not args.only or not args.out:
            sys.exit("--smoke needs --only and --out")
        if args.smoke_exhaustiveness:
            global EXHAUSTIVENESS
            EXHAUSTIVENESS = args.smoke_exhaustiveness
    elif prereg["protocol"] != PROTOCOL or prereg["protocolFingerprint"] != protocol_fingerprint():
        sys.exit("protocol differs from the preregistration — refusing to run")
    cases = prereg["cases"]
    if args.only:
        wanted = {x.strip().upper() for x in args.only.split(",")}
        cases = [c for c in cases if c["pdbId"] in wanted]

    work = tempfile.mkdtemp(prefix="genesis-astex-")
    results = []
    with cf.ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
        futures = {pool.submit(run_case, c, args.data, work): c for c in cases}
        for f in cf.as_completed(futures):
            r = f.result()
            results.append(r)
            print("%-5s %-17s %s" % (r["pdbId"], r["status"], r.get("rmsdA", r.get("error", ""))), flush=True)
    results.sort(key=lambda r: r["pdbId"])

    docked = [r for r in results if r["status"] == "DOCKED"]
    ok = [r for r in results if r["success"]]
    import vina, meeko, rdkit
    import biotite
    report = {
        "kind": "GENESIS_ASTEX_REDOCK_SMOKE_UNREGISTERED" if args.smoke else "GENESIS_ASTEX_REDOCK_BENCHMARK",
        "exhaustiveness": EXHAUSTIVENESS,
        "protocolFingerprint": protocol_fingerprint(),
        "preregistrationSha256": sha256_bytes(open(PREREG, "rb").read()),
        "finishedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "versions": {"vina": vina.__version__, "meeko": meeko.__version__, "rdkit": rdkit.__version__,
                     "biotite": biotite.__version__, "python": sys.version.split()[0]},
        "summary": {
            "cases": len(results), "docked": len(docked), "successes": len(ok),
            "successRate": round(len(ok) / len(results), 4) if results else None,
            "successRateAmongDocked": round(len(ok) / len(docked), 4) if docked else None,
            "preparationOrDockingFailures": len(results) - len(docked),
        },
        "cases": results,
    }
    if args.label:
        report["run"] = args.label
    out = args.out or os.path.join(REPO, "docs/evidence", "astex-redock-benchmark-%s.json" % datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    with open(out, "w") as f:
        json.dump(report, f, indent=1)
        f.write("\n")
    s = report["summary"]
    print("\n%d/%d within 2.0 A (%.1f%%); %d docked, %d failed before a pose existed -> %s" % (
        s["successes"], s["cases"], 100 * (s["successRate"] or 0), s["docked"], s["preparationOrDockingFailures"], out))


if __name__ == "__main__":
    main()
