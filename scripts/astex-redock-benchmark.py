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

PROTOCOL = {
    "dataset": "Astex Diverse Set, 85 complexes (Hartshorn et al., J. Med. Chem. 2007, 50, 726-741)",
    "distribution": "github.com/rdk/p2rank-datasets, directory joined/astex",
    "distributionCommit": "0236ecb38cbb60b89849a1ea36fbd9ee93f3e906",
    "ligandDefinition": "the HETATM residue in chain L (the Astex file convention); where a file has no chain L, the single residue carrying the listed ligand code; altloc ' ' or 'A' only",
    "ligandChemistry": "bond orders and formal charges from the wwPDB Chemical Component Dictionary entry (as shipped in biotite) assigned to the crystal heavy atoms with RDKit AssignBondOrdersFromTemplate; template = the file's residue name if its heavy-atom count matches, else the listed code; written as SDF, then dock_worker redock: SDF -> canonical SMILES -> RDKit ETKDGv3(seed) + MMFF -> Meeko",
    "receptor": "all ATOM records of the file with altloc ' ' or 'A' (altloc column cleared), plus single-atom metal ions (ZN, MG, CA, MN, FE, CO, NI, CU, NA, K) as HETATM; waters, cofactors and all other HETATM dropped; Meeko mk_prepare_receptor via dock_worker; no repair",
    "box": "centre = crystal-ligand heavy-atom centroid; edge per axis = clamp(ligand extent + 10 A, 20 A, 30 A)",
    "engine": "AutoDock Vina (vina scoring), exhaustiveness 8, seed 42, top pose only",
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
    block = "\n".join(heavy_lines) + "\nEND\n"
    xtal = Chem.MolFromPDBBlock(block, removeHs=False, sanitize=False, proximityBonding=True)
    if xtal is None:
        raise ValueError("pdb_block_unreadable")
    used = None
    for code in dict.fromkeys([resname, listed]):
        try:
            tmpl = Chem.RemoveHs(brd.to_mol(info.residue(code)))
        except Exception:  # noqa: BLE001
            continue
        if tmpl.GetNumAtoms() == xtal.GetNumAtoms():
            used = code
            break
    if used is None:
        raise ValueError("no_ccd_template_with_%d_heavy_atoms" % xtal.GetNumAtoms())
    mol = AllChem.AssignBondOrdersFromTemplate(tmpl, xtal)
    Chem.SanitizeMol(mol)
    Chem.MolToMolFile(mol, path)
    return used


METALS = {"ZN", "MG", "CA", "MN", "FE", "CO", "NI", "CU", "NA", "K"}


def clean_receptor(pdb_text, path):
    keep = []
    for l in pdb_text.splitlines():
        if l[16:17] not in (" ", "A"):
            continue
        if l.startswith("ATOM") or (l.startswith("HETATM") and l[17:20].strip() in METALS and l[21] != "L"):
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
        out["ccdTemplate"] = ligand_sdf(heavy, resname, code, sdf)
        center, size = box_for(heavy)
        out.update({"center": center, "boxSize": size})
        receptor = os.path.join(case_dir, "receptor_clean.pdb")
        clean_receptor(raw.decode(), receptor)
        req = {"cmd": "redock", "pdbPath": receptor, "keepHetatm": True, "ligandSdfPath": sdf, "center": center, "boxSize": size,
               "exhaustiveness": 8, "seed": 42, "outDir": os.path.join(case_dir, "run")}
        proc = subprocess.run([sys.executable, WORKER, json.dumps(req)], capture_output=True, text=True, timeout=1800)
        r = json.loads(proc.stdout.strip().splitlines()[-1])
    except Exception as e:  # noqa: BLE001
        return {**out, "status": "PREPARATION_FAILED", "success": False, "error": str(e)[:200]}
    if not r.get("ok"):
        return {**out, "status": "DOCKING_FAILED", "success": False, "error": str(r.get("error"))[:200]}
    rmsd = r["rmsdA"]
    return {**out, "status": "DOCKED", "success": rmsd < 2.0, "rmsdA": rmsd, "vinaScoreKcalMol": r["bestAffinityKcalMol"],
            "ligandSmiles": r["ligandSmiles"], "poseSha256": r["poseSha256"], "receptorPdbqtSha256": r["receptor"]["receptorPdbqtSha256"],
            "vinaVersion": r["vinaVersion"], "meekoVersion": r["meekoVersion"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--jobs", type=int, default=2)
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    prereg = json.load(open(PREREG))
    if prereg["protocol"] != PROTOCOL or prereg["protocolFingerprint"] != protocol_fingerprint():
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
        "kind": "GENESIS_ASTEX_REDOCK_BENCHMARK",
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
    out = args.out or os.path.join(REPO, "docs/evidence", "astex-redock-benchmark-%s.json" % datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    with open(out, "w") as f:
        json.dump(report, f, indent=1)
        f.write("\n")
    s = report["summary"]
    print("\n%d/%d within 2.0 A (%.1f%%); %d docked, %d failed before a pose existed -> %s" % (
        s["successes"], s["cases"], 100 * (s["successRate"] or 0), s["docked"], s["preparationOrDockingFailures"], out))


if __name__ == "__main__":
    main()
