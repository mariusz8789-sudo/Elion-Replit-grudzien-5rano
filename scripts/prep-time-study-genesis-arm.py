#!/usr/bin/env python3
"""The Genesis arm of the preparation time study: the same ten complexes, the same finish line.

    python3 scripts/prep-time-study-genesis-arm.py --out /tmp/claude-0/timestudy/genesis

Starts from exactly what the person with the stopwatch starts from - the deposited mmCIF files in
docs/evidence/prep-time-study/inputs - and produces exactly what they are asked to produce:
receptor.pdb, ligand.sdf and box.json per complex. The acceptance gate
(scripts/prep-time-study-check.py) then judges both arms the same way.

It reports ACTIVE HUMAN TIME as zero-by-construction for this arm and machine time as measured,
because that is the honest split: a person can start this and walk away. The number that matters
in the comparison is the person's active time against the single command it takes here.
"""

from __future__ import annotations

import argparse
import contextlib
import importlib.util
import io
import json
import os
import shutil
import sys
import time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
INPUTS = os.path.join(ROOT, "docs/evidence/prep-time-study/inputs")


def _module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="/tmp/claude-0/timestudy/genesis")
    ap.add_argument("--scratch", default="/tmp/claude-0/timestudy/scratch")
    ap.add_argument("--json-out",
                    default=os.path.join(ROOT, "docs/evidence/prep-time-study/genesis-arm.json"))
    args = ap.parse_args(argv)

    r8 = _module(os.path.join(HERE, "posebusters-unseen-benchmark.py"), "r8_timestudy")
    p2 = _module(os.path.join(HERE, "astex-phase2-redock.py"), "p2_timestudy")

    with open(os.path.join(INPUTS, "manifest.json")) as f:
        cases = json.load(f)

    data = os.path.join(args.scratch, "data")
    os.makedirs(data, exist_ok=True)
    os.makedirs(args.out, exist_ok=True)

    rows, t_all = [], time.time()
    for c in cases:
        pid, lig = c["pdbId"], c["ligand"]
        cif = os.path.join(INPUTS, "%s.cif" % pid.lower())
        got = r8.sha256_file(cif)
        if got != c["sourceCifSha256"]:
            raise SystemExit("REFUSING TO RUN: %s input sha256 drift" % pid)
        folder = os.path.join(args.out, pid)
        os.makedirs(folder, exist_ok=True)
        t0 = time.time()
        r8.build_receptor_pdb(pid, cif, os.path.join(data, "%s.pdb" % pid.lower()))
        with contextlib.redirect_stderr(io.StringIO()):
            prep, receptor, sdf, center, size, extra = p2.prepare_case(
                pid, lig, data, os.path.join(args.scratch, "work", pid))
        shutil.copy(receptor, os.path.join(folder, "receptor.pdb"))
        shutil.copy(sdf, os.path.join(folder, "ligand.sdf"))
        with open(os.path.join(folder, "box.json"), "w") as f:
            json.dump({"center": list(center), "size": list(size)}, f)
        dt = round(time.time() - t0, 2)
        rows.append({"pdbId": pid, "ligand": lig, "machineSeconds": dt,
                     "ligandHeavyAtoms": prep["ligandHeavyAtoms"],
                     "extraRigidFiles": len(extra)})
        print("%-5s %6.2f s" % (pid, dt))

    total = round(time.time() - t_all, 2)
    rep = {
        "kind": "GENESIS_PREP_TIME_STUDY_ARM",
        "measuredAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "hostCpuCount": os.cpu_count(),
        "complexes": len(rows),
        "machineSecondsTotal": total,
        "machineSecondsPerComplexMean": round(total / len(rows), 2) if rows else None,
        "activeHumanSeconds": 0,
        "activeHumanNote": ("Zero by construction: this arm is one command. The operator types it "
                            "and is free until it returns. Machine time is reported separately "
                            "and is NOT claimed as a saving - a person running the same tools "
                            "would wait for their own machine too."),
        "whatWasProduced": "receptor.pdb, ligand.sdf and box.json per complex, judged by "
                           "scripts/prep-time-study-check.py, the same gate as the manual arm",
        "perCase": rows,
    }
    with open(args.json_out, "w") as f:
        json.dump(rep, f, indent=1)
    print("total %.2f s for %d complexes, mean %.2f s" % (total, len(rows), total / len(rows)))
    print("wrote %s" % args.json_out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
