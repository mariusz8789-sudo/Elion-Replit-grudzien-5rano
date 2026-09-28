#!/usr/bin/env python3
"""GENESIS — Astex phase 2: redock selected cases with the phase-2 preparation rules.

NEW code. `scripts/astex-redock-benchmark.py` is imported and its functions reused; nothing
in it is modified, so the preregistered run-3 path stays replayable byte for byte.

Differences from run 3, and only these:
  RULE 1  the ligand is the preregistered residue PLUS every HETATM residue covalently linked
          to it (element-dependent covalent-radius criterion, see scripts/astex_phase2_prep.py)
  RULE 2  amino-acid residues of the protein chain deposited as HETATM are kept as rigid
          receptor atoms, typed from the wwPDB CCD
  RULE 3  unchanged (audited, see the evidence document)
  reporting: dock_worker command `redock_poses` with numModes 20 so top-K is reportable;
          rank 1 of that set is the number compared against run 3.

Everything else — box, exhaustiveness 32, seed 42, vina scoring, cofactor rule, receptor
cleaning, the 2.0 A criterion — is the run-3 protocol.

    python3 scripts/astex-phase2-redock.py --data <astex> --only 1GKC,1MEH --out out.json
"""
import argparse
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, "scripts"))
_spec = importlib.util.spec_from_file_location("astex_bench", os.path.join(REPO, "scripts/astex-redock-benchmark.py"))
B = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(B)
import astex_phase2_prep as P  # noqa: E402

WORKER = B.WORKER
PREREG = B.PREREG


def prepare_case(pdb_id, code, data_dir, case_dir):
    """Run-3 preparation plus rules 1 and 2. Returns the record and the dock request fields."""
    path = os.path.join(data_dir, pdb_id.lower() + ".pdb")
    raw = open(path, "rb").read()
    txt = raw.decode()
    out = {"pdbId": pdb_id, "listedLigand": code, "inputSha256": B.sha256_bytes(raw)}
    resname, heavy = B.ligand_lines(txt, code)
    out["run3LigandHeavyAtoms"] = len(heavy)

    # cofactor rule first, exactly as run 3 defines it (on the preregistered ligand residue)
    picked, skipped = B.cofactor_residues(txt, heavy)
    cof_labels = [p[0] for p in picked]

    # RULE 1
    extra_lig, r1 = P.covalent_ligand_residues(
        txt, heavy, exclude_labels=cof_labels, is_hydrogen=B.is_hydrogen,
        waters=B.WATERS, metals=B.METALS, additives=B.ADDITIVES)
    lig_heavy = heavy + extra_lig
    absorbed_labels = [a["residue"] for a in r1["absorbed"]]
    out["rule1"] = r1
    out["ligandHeavyAtoms"] = len(lig_heavy)
    out["ligandResidue"] = resname

    os.makedirs(case_dir, exist_ok=True)
    sdf = os.path.join(case_dir, "ligand.sdf")
    out["ccdTemplate"], out["ligandElementsFromCcd"] = B.ligand_sdf(lig_heavy, resname, code, sdf)
    center, size = B.box_for(lig_heavy)
    out.update({"center": center, "boxSize": size})

    receptor = os.path.join(case_dir, "receptor_clean.pdb")
    B.clean_receptor(txt, receptor)

    extra, cofactors = [], []
    for label, ccode, lines in picked:
        cpath = os.path.join(case_dir, "cofactor_%s.pdbqt" % label.replace(":", "_"))
        try:
            n = B.cofactor_pdbqt(ccode, lines, cpath)
        except Exception as e:  # noqa: BLE001
            skipped.append({"residue": label, "reason": "typing_failed: %s" % str(e)[:80]})
            continue
        extra.append(cpath)
        cofactors.append({"residue": label, "heavyAtoms": len(lines), "pdbqtAtoms": n})

    # RULE 2
    mods = P.modified_amino_acid_residues(
        txt, lig_heavy, is_hydrogen=B.is_hydrogen, waters=B.WATERS, metals=B.METALS,
        additives=B.ADDITIVES, exclude_labels=cof_labels + absorbed_labels)
    kept_mods, skipped_mods = [], []
    for label, rn, lines, link in mods:
        mpath = os.path.join(case_dir, "modres_%s.pdbqt" % label.replace(":", "_"))
        try:
            n, removed = P.modified_residue_pdbqt(rn, lines, mpath, B.elements_from_ccd)
        except Exception as e:  # noqa: BLE001
            skipped_mods.append({"residue": label, "resname": rn, "heavyAtoms": len(lines),
                                 "reason": "typing_failed: %s" % str(e)[:120]})
            continue
        extra.append(mpath)
        kept_mods.append({"residue": label, "resname": rn, "heavyAtoms": len(lines),
                          "pdbqtAtoms": n, "peptideBondA": link,
                          "ccdLeavingAtomsRemoved": removed})
    kept_labels = {m["residue"] for m in kept_mods}
    skipped = [s for s in skipped if s["residue"] not in kept_labels]  # now kept by rule 2
    out.update({"cofactorsKept": cofactors, "cofactorsNotKept": skipped,
                "rule2ModifiedResiduesKept": kept_mods,
                "rule2ModifiedResiduesNotTyped": skipped_mods})
    return out, receptor, sdf, center, size, extra


def run_case(case, data_dir, work, num_modes, exhaustiveness):
    pdb_id, code = case["pdbId"], case["ligand"]
    case_dir = os.path.join(work, pdb_id)
    try:
        out, receptor, sdf, center, size, extra = prepare_case(pdb_id, code, data_dir, case_dir)
    except Exception as e:  # noqa: BLE001
        return {"pdbId": pdb_id, "listedLigand": code, "status": "PREPARATION_FAILED",
                "success": False, "error": str(e)[:300]}
    req = {"cmd": "redock_poses", "pdbPath": receptor, "keepHetatm": True, "ligandSdfPath": sdf,
           "center": center, "boxSize": size, "exhaustiveness": exhaustiveness, "seed": 42,
           "numModes": num_modes, "outDir": os.path.join(case_dir, "run"),
           "deleteBadRes": True, "forgiveExtraBonds": True, "extraRigidPdbqtPaths": extra}
    proc = subprocess.run([sys.executable, WORKER, json.dumps(req)], capture_output=True,
                          text=True, timeout=3600)
    try:
        r = json.loads(proc.stdout.strip().splitlines()[-1])
    except Exception:  # noqa: BLE001
        return {**out, "status": "DOCKING_FAILED", "success": False,
                "error": (proc.stderr or proc.stdout)[-300:]}
    if not r.get("ok"):
        return {**out, "status": "DOCKING_FAILED", "success": False, "error": str(r.get("error"))[:300]}
    rmsd = r["rmsdA"]
    return {**out, "status": "DOCKED", "success": rmsd < 2.0, "rmsdA": rmsd,
            "vinaScoreKcalMol": r["bestAffinityKcalMol"], "bestRmsdA": r["bestRmsdA"],
            "bestRmsdRank": r["bestRmsdRank"], "poses": r["poses"],
            "ligandSmiles": r["ligandSmiles"], "caseDir": case_dir,
            "receptorPdbqtSha256": r["receptor"]["receptorPdbqtSha256"],
            "receptorPdbqtPath": r["receptor"]["receptorPdbqtPath"],
            "extraRigidPdbqt": [{k: x[k] for k in ("sha256", "atoms")}
                                for x in r["receptor"].get("extraRigidPdbqt", [])],
            "vinaVersion": r["vinaVersion"], "meekoVersion": r["meekoVersion"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--only", required=True, help="comma-separated PDB ids; this script never runs all 85")
    ap.add_argument("--out", required=True)
    ap.add_argument("--jobs", type=int, default=2)
    ap.add_argument("--work", default="")
    ap.add_argument("--num-modes", type=int, default=20)
    ap.add_argument("--exhaustiveness", type=int, default=B.EXHAUSTIVENESS)
    args = ap.parse_args()

    prereg = json.load(open(PREREG))
    wanted = {x.strip().upper() for x in args.only.split(",") if x.strip()}
    cases = [c for c in prereg["cases"] if c["pdbId"] in wanted]
    missing = wanted - {c["pdbId"] for c in cases}
    if missing:
        sys.exit("unknown pdb ids: %s" % sorted(missing))
    work = args.work or tempfile.mkdtemp(prefix="genesis-astex-phase2-")
    os.makedirs(work, exist_ok=True)

    import concurrent.futures as cf
    results = []
    with cf.ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
        futs = {pool.submit(run_case, c, args.data, work, args.num_modes, args.exhaustiveness): c for c in cases}
        for f in cf.as_completed(futs):
            r = f.result()
            results.append(r)
            print("%-5s %-18s rmsd=%s best=%s" % (r["pdbId"], r["status"], r.get("rmsdA"),
                                                  r.get("bestRmsdA", r.get("error", ""))), flush=True)
    results.sort(key=lambda r: r["pdbId"])
    import vina, meeko, rdkit, biotite
    report = {
        "kind": "GENESIS_ASTEX_PHASE2_PREPARATION_FIX_VALIDATION",
        "notABenchmarkHeadline": "a subset run; the 85-case headline is unchanged by this file",
        "exhaustiveness": args.exhaustiveness, "numModes": args.num_modes, "seed": 42,
        "workDir": work,
        "preregistrationSha256": B.sha256_bytes(open(PREREG, "rb").read()),
        "run3ProtocolFingerprint": B.protocol_fingerprint(),
        "finishedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "versions": {"vina": vina.__version__, "meeko": meeko.__version__,
                     "rdkit": rdkit.__version__, "biotite": biotite.__version__,
                     "python": sys.version.split()[0]},
        "cases": results,
    }
    with open(args.out, "w") as f:
        json.dump(report, f, indent=1)
        f.write("\n")
    print("-> %s" % args.out)


if __name__ == "__main__":
    main()
