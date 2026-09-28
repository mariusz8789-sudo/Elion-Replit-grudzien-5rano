#!/usr/bin/env python3
"""GENESIS - Astex run 7: deterministic replay of the GNINA rescore.

    python3 scripts/astex-gnina-replay.py --only 1G9V,1KZK --out /tmp/claude-0/run7/replay.json

Rescores the named cases a SECOND time, from the stored PDBQT poses, in a fresh scratch
directory, and asserts that every CNNscore is byte-identical to the value the main run recorded.
Byte-identical here means the decimal text gnina printed, compared as a string, not a float
comparison with a tolerance.

No docking, no minimisation, no pose movement, no new protocol. This script only re-executes the
frozen invocation and compares.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import tempfile
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

spec = importlib.util.spec_from_file_location(
    "astex_gnina_rescore_for_replay", os.path.join(HERE, "astex-gnina-rescore.py"))
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default="/tmp/claude-0/run6/work")
    ap.add_argument("--cases", default="/tmp/claude-0/run6/cases")
    ap.add_argument("--gnina", default="/tmp/claude-0/gnina-audit/gnina")
    ap.add_argument("--first-run", default="/tmp/claude-0/run7/gnina-scored")
    ap.add_argument("--only", default="1G9V,1KZK")
    ap.add_argument("--cpu", type=int, default=2)
    ap.add_argument("--out", default="/tmp/claude-0/run7/replay.json")
    a = ap.parse_args(argv)

    doc = M.load_prereg()
    M.verify_pinned_code(doc["protocol"])
    M.verify_protocol_constants(doc["protocol"])
    binary = M.verify_gnina(doc["protocol"], a.gnina)

    ids = [x.strip().upper() for x in a.only.split(",") if x.strip()]
    compared, mismatches = 0, []
    for pid in ids:
        with open(os.path.join(a.cases, "%s.json" % pid)) as f:
            case = json.load(f)
        with open(os.path.join(a.first_run, "%s.json" % pid)) as f:
            first = json.load(f)
        scratch = tempfile.mkdtemp(prefix="astex-gnina-replay-")
        try:
            again = M.score_case(case, a.work, a.gnina, scratch, cpu=a.cpu)
        finally:
            for f2 in os.listdir(scratch) if os.path.isdir(scratch) else []:
                try:
                    os.unlink(os.path.join(scratch, f2))
                except OSError:
                    pass
            try:
                os.rmdir(scratch)
            except OSError:
                pass
        if again["status"] != "SCORED" or first["status"] != "SCORED":
            mismatches.append({"pdbId": pid, "reason": "not SCORED on both runs",
                               "first": first["status"], "replay": again["status"]})
            continue
        b = {p["tag"]: p for p in again["poses"]}
        for p in first["poses"]:
            q = b.get(p["tag"])
            compared += 1
            if q is None:
                mismatches.append({"pdbId": pid, "tag": p["tag"], "reason": "missing on replay"})
                continue
            # byte-identical comparison of the decimal text, not a float tolerance
            if repr(p["cnnScore"]) != repr(q["cnnScore"]) \
                    or repr(p.get("cnnAffinity")) != repr(q.get("cnnAffinity")) \
                    or p["poseSha256"] != q["poseSha256"] or p["rmsdA"] != q["rmsdA"]:
                mismatches.append({"pdbId": pid, "tag": p["tag"],
                                   "first": [repr(p["cnnScore"]), repr(p.get("cnnAffinity"))],
                                   "replay": [repr(q["cnnScore"]), repr(q.get("cnnAffinity"))]})
        print("%-5s replayed: %d poses, %d mismatches so far"
              % (pid, len(again["poses"]), len(mismatches)), flush=True)

    out = {"kind": "GENESIS_ASTEX_RUN7_DETERMINISTIC_REPLAY",
           "finishedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "cases": ids, "posesCompared": compared,
           "byteIdentical": not mismatches, "mismatches": mismatches[:20],
           "mismatchCount": len(mismatches),
           "engine": binary,
           "method": "each case rescored a second time from the stored PDBQT poses in a fresh "
                     "scratch directory; CNNscore and CNNaffinity compared as decimal text, "
                     "plus the pose identity hash and the recomputed RMSD"}
    with open(a.out, "w") as f:
        json.dump(out, f, indent=1)
        f.write("\n")
    print("wrote", a.out, "byteIdentical =", out["byteIdentical"])
    return 0 if out["byteIdentical"] else 1


if __name__ == "__main__":
    sys.exit(main())
