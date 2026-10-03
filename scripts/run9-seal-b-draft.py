#!/usr/bin/env python3
"""Run 9, DRAFT of seal B: the fresh-set case list, drawn mechanically.

Applies protocol.freshSet of seal A (docs/evidence/run9/run9-ranking-prereg.json)
to the raw Runs N' Poses annotations.csv from Zenodo, exactly as frozen:

  eligibility
    ligand_is_proper is true and num_proper_ligand_chains equals 1
    ligand_num_heavy_atoms between 10 and 60 inclusive
    ligand_num_rot_bonds at most 15
    entry PDB id absent from PoseBusters 308, Astex 85, CrossDocked2020, PDBbind2016
    one system per PDB id: the first one in the draw order
  draw
    order eligible systems by sha256('run9|' + group_key) ascending, take the first 300

Nothing is docked, scored or opened. ground_truth.tar.gz is only hashed.
Seal A is read, never written.

usage: run9-seal-b-draft.py ANNOTATIONS_CSV GNINA_LIST_DIR OUT_DIR
"""
import csv
import glob
import hashlib
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEAL_A = os.path.join(REPO, "docs/evidence/run9/run9-ranking-prereg.json")
POSEBUSTERS = os.path.join(REPO, "docs/evidence/posebusters-benchmark-cases.json")
ASTEX = os.path.join(REPO, "docs/evidence/astex-redock-benchmark-2026-09-27-run1.json")
TAKE = 300


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def crossdocked_ids(path):
    out = set()
    for line in open(path):
        line = line.strip()
        if not line or line.startswith("--"):
            continue
        for tok in re.split("[:,]", line):
            if re.fullmatch("[0-9][a-z0-9]{3}", tok.lower()):
                out.add(tok.lower())
    return out


def types_ids(path):
    out = set()
    for line in open(path):
        parts = line.split()
        if len(parts) >= 4:
            out.add(parts[3].split("/")[0].lower()[:4])
    return out


def main(annotations, gnina_dir, out_dir):
    seal_a = json.load(open(SEAL_A))
    fresh = seal_a["protocol"]["freshSet"]

    posebusters = {c["pdbId"].lower() for c in json.load(open(POSEBUSTERS))}
    astex = {c["pdbId"].lower() for c in json.load(open(ASTEX))["cases"]}
    cd_path = os.path.join(gnina_dir, "crossdocked_set_ids.txt")
    crossdocked = crossdocked_ids(cd_path)
    types_files = sorted(glob.glob(os.path.join(gnina_dir, "*.types")))
    pdbbind = set()
    for f in types_files:
        pdbbind |= types_ids(f)
    assert len(posebusters) == 308 and len(astex) == 85

    rows = list(csv.DictReader(open(annotations, newline="")))
    reasons = {"ligandNotProperOrNotOneProperChain": 0, "heavyAtomsOutside10to60": 0,
               "rotBondsOver15": 0, "inPoseBusters": 0, "inAstex": 0,
               "inCrossDocked2020": 0, "inPdbBind2016": 0}
    eligible = []
    for r in rows:
        pdb = r["entry_pdb_id"].lower()
        if not (r["ligand_is_proper"] == "True" and r["num_proper_ligand_chains"] == "1"):
            reasons["ligandNotProperOrNotOneProperChain"] += 1
            continue
        if not 10 <= int(r["ligand_num_heavy_atoms"]) <= 60:
            reasons["heavyAtomsOutside10to60"] += 1
            continue
        if int(r["ligand_num_rot_bonds"]) > 15:
            reasons["rotBondsOver15"] += 1
            continue
        hit = False
        for name, ids in (("inPoseBusters", posebusters), ("inAstex", astex),
                          ("inCrossDocked2020", crossdocked), ("inPdbBind2016", pdbbind)):
            if pdb in ids:
                reasons[name] += 1
                hit = True
                break
        if hit:
            continue
        key = hashlib.sha256(("run9|" + r["group_key"]).encode()).hexdigest()
        eligible.append((key, r))

    eligible.sort(key=lambda kr: kr[0])
    seen, one_per_pdb, dropped_same_pdb = set(), [], 0
    for key, r in eligible:
        pdb = r["entry_pdb_id"].lower()
        if pdb in seen:
            dropped_same_pdb += 1
            continue
        seen.add(pdb)
        one_per_pdb.append((key, r))
    drawn = one_per_pdb[:TAKE]

    cases = [{"rank": i + 1, "drawKey": key, "groupKey": r["group_key"],
              "systemId": r["system_id"], "pdbId": r["entry_pdb_id"].upper(),
              "ligandCcd": r["ligand_ccd_code"], "ligandInstanceChain": r["ligand_instance_chain"],
              "ligandHeavyAtoms": int(r["ligand_num_heavy_atoms"]),
              "ligandRotBonds": int(r["ligand_num_rot_bonds"]),
              "releaseDate": r.get("release_date")}
             for i, (key, r) in enumerate(drawn)]

    os.makedirs(out_dir, exist_ok=True)
    cases_path = os.path.join(out_dir, "fresh-set-cases.json")
    with open(cases_path, "w") as f:
        json.dump(cases, f, indent=1)
        f.write("\n")

    rel = lambda p: os.path.relpath(p, REPO)
    manifest = {
        "kind": "run9-seal-b-DRAFT",
        "status": "DRAFT - not sealed. Seal B is frozen only on the owner's word.",
        "sealA": {"path": rel(SEAL_A), "sha256": sha256_file(SEAL_A)},
        "ruleAppliedVerbatim": {"eligibility": fresh["eligibility"], "draw": fresh["draw"]},
        "interpretation": [
            "ligand_is_proper is read as the CSV string 'True'; num_proper_ligand_chains as the string '1'.",
            "A PDB id is compared lower-case. One system per PDB id is applied after the draw order, keeping the first.",
            "group_key is unique per row in this annotations.csv, so no row is merged before the draw.",
        ],
        "inputs": {
            "annotations": {"path": annotations if os.path.isabs(annotations) else rel(os.path.abspath(annotations)),
                            "sha256": sha256_file(annotations), "rows": len(rows)},
            "posebusters308": {"path": rel(POSEBUSTERS), "sha256": sha256_file(POSEBUSTERS), "ids": len(posebusters)},
            "astex85": {"path": rel(ASTEX), "sha256": sha256_file(ASTEX), "ids": len(astex)},
            "crossDocked2020": {"file": "data/CrossDocked2020/crossdocked_set_ids.txt",
                                "sha256": sha256_file(cd_path), "ids": len(crossdocked)},
            "pdbBind2016": {"files": [{"file": os.path.basename(f), "sha256": sha256_file(f)} for f in types_files],
                            "ids": len(pdbbind)},
        },
        "counts": {"rows": len(rows), "excludedByReason": reasons, "eligibleSystems": len(eligible),
                   "droppedSecondSystemOfSamePdb": dropped_same_pdb,
                   "eligibleAfterOnePerPdb": len(one_per_pdb), "drawn": len(cases)},
        "caseList": {"path": rel(cases_path), "sha256": sha256_file(cases_path), "cases": len(cases)},
    }
    with open(os.path.join(out_dir, "seal-b-draft-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
        f.write("\n")
    print(json.dumps(manifest["counts"], indent=1))
    print("caseList sha256", manifest["caseList"]["sha256"])


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
