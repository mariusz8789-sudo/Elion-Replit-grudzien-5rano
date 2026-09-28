#!/usr/bin/env python3
"""GENESIS - run 6 deterministic replay check.

Re-runs ONE seed of the run-6 protocol, from preparation onwards, in a fresh working directory
for a couple of cases, and compares the result bit for bit against what the main run recorded:
the docked PDBQT sha256, every per-pose coordinate hash, every Vina score and every RMSD.

    python3 scripts/astex-multiseed-replay.py --data <astex> --cases 1G9V,1GKC --seed 42 \
        --results-dir /tmp/claude-0/run6/cases --work /tmp/claude-0/run6/replay-work \
        --out /tmp/claude-0/run6/replay.json
"""
import argparse
import importlib.util
import json
import os
from datetime import datetime, timezone

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_spec = importlib.util.spec_from_file_location(
    "astex_multiseed_ensemble", os.path.join(REPO, "scripts/astex-multiseed-ensemble.py"))
M = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(M)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--cases", required=True)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--results-dir", default="/tmp/claude-0/run6/cases")
    ap.add_argument("--work", default="/tmp/claude-0/run6/replay-work")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    doc, protocol, fp = M.load_frozen_protocol()
    M.verify_code_identity(protocol)
    if args.seed not in protocol["seeds"]["list"]:
        raise SystemExit("seed %d is not in the frozen seed list" % args.seed)

    phase2 = M._phase2_module()
    worker = phase2.B.WORKER
    prereg = json.load(open(phase2.PREREG))
    wanted = [x.strip().upper() for x in args.cases.split(",") if x.strip()]
    os.makedirs(args.work, exist_ok=True)

    rows = []
    for pid in wanted:
        case = next(c for c in prereg["cases"] if c["pdbId"] == pid)
        orig = json.load(open(os.path.join(args.results_dir, "%s.json" % pid)))
        ref = next(x for x in orig["seedRuns"] if x["seed"] == args.seed)
        case_dir = os.path.join(args.work, pid)
        prep, receptor, sdf, center, size, extra = phase2.prepare_case(
            pid, case["ligand"], args.data, case_dir)
        p = {"receptor": receptor, "sdf": sdf, "center": center, "size": size, "extra": extra}
        got = M.dock_one_seed(p, args.seed, case_dir, protocol["search"]["exhaustiveness"],
                              protocol["search"]["numModes"], protocol["search"]["energyRange"],
                              protocol["search"]["minRmsd"], worker)
        row = {
            "pdbId": pid, "seed": args.seed,
            "posesCompared": len(got.get("poses") or []),
            "dockedPdbqtSha256Identical": got.get("dockedPdbqtSha256") == ref.get("dockedPdbqtSha256"),
            "dockedPdbqtSha256": got.get("dockedPdbqtSha256"),
            "ligandPdbqtSha256Identical": got.get("ligandPdbqtSha256") == ref.get("ligandPdbqtSha256"),
            "receptorPdbqtSha256Identical": got.get("receptorPdbqtSha256") == ref.get("receptorPdbqtSha256"),
            "poseHashesIdentical": [x["poseSha256"] for x in got.get("poses") or []]
                                   == [x["poseSha256"] for x in ref.get("poses") or []],
            "affinitiesIdentical": [x["affinityKcalMol"] for x in got.get("poses") or []]
                                   == [x["affinityKcalMol"] for x in ref.get("poses") or []],
            "rmsdsIdentical": [x["rmsdA"] for x in got.get("poses") or []]
                              == [x["rmsdA"] for x in ref.get("poses") or []],
        }
        rows.append(row)
        print(json.dumps(row), flush=True)

    out = {
        "kind": "GENESIS_ASTEX_RUN6_DETERMINISTIC_REPLAY",
        "note": "an independent second execution of one frozen seed in a fresh working directory, "
                "compared bit for bit against the main run's recorded pose set",
        "protocolFingerprintSha256": fp,
        "seed": args.seed,
        "finishedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "allIdentical": all(all(v is True for k, v in r.items() if k.endswith("Identical")) for r in rows),
        "cases": rows,
    }
    with open(args.out, "w") as f:
        json.dump(out, f, indent=1)
        f.write("\n")
    print("allIdentical=%s -> %s" % (out["allIdentical"], args.out))


if __name__ == "__main__":
    main()
