#!/usr/bin/env python3
"""GENESIS — real runs that let the 13-probe self-falsification battery decide about a drug finalist.

    python3 scripts/finalist-falsification-evidence.py [--out docs/evidence/<file>.json] [--quick]

D-150. The self-falsification battery (`selfFalsificationBattery.ts`) leaves a probe UNRESOLVED
unless a caller can point at evidence. For the live drug bench's hero run (ABL1 / PDB 1IEP,
imatinib chemotype) three probes need numbers nothing in the repo held yet, and all three can be
produced HERE with the engines the run itself uses — `packages/backend/src/compute/dock_worker.py`
(Meeko receptor prep -> RDKit ETKDGv3/MMFF ligand -> AutoDock Vina -> symmetry-aware heavy-atom
RMSD in the crystal frame), the same code the Astex benchmark and the campaign docking stage call:

  1. NUMERICAL_ARTIFACT / robustness — redock the co-crystallised ligand of the run's own target at
     several (seed, exhaustiveness) settings. If the score or the pose moves with the seed, the
     single number the campaign reports is a numerical artifact.
  2. MEASUREMENT_ARTIFACT — the same redocks give the heavy-atom RMSD against the deposited crystal
     pose: the scoring/pose pipeline measured against an INDEPENDENT reference (X-ray coordinates,
     which share no code path with Vina) on the very receptor the campaign docks into.
  3. ALTERNATIVE_MODEL / comparator — dock a declared control set into the SAME prepared receptor:
     one further type-II ABL1 inhibitor (positive control) and chemically unrelated approved drugs
     that are not kinase inhibitors (negative controls). If an unrelated drug scores as well as the
     finalist chemotype, the "this molecule binds ABL1" reading is not what explains the number.

HONESTY, stated before the run:
- Vina scores are MODEL_ESTIMATE (empirical scoring function, kcal/mol). They are NOT measured
  binding affinity and this script makes no therapeutic claim.
- The negative controls are chemically unrelated approved drugs, NOT property-matched decoys
  (no DUD-E / DeepCoy generation is available offline). A separation against them is weaker
  evidence than a property-matched decoy set would be, and the output says so.
- The redock reuses the deposited ligand of the target file, so it tests the pipeline and the
  receptor, not a novel molecule.

PROTOCOL AND THRESHOLDS ARE FROZEN IN `PROTOCOL` BELOW, before any number is read, and the output
carries their sha256 fingerprint. Disclosed smoke run: one redock at (seed 42, exhaustiveness 8)
was executed while wiring this script and gave RMSD 0.584 A / -12.601 kcal/mol; it is repeated as
a numbered configuration below, so nothing here is selected after the fact.

Output: a JSON record with every configuration, the control scores, the engine versions, the
sha256 of every receptor/pose artifact, and the sha256 of the canonical body itself.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKER = os.path.join(ROOT, "packages", "backend", "src", "compute", "dock_worker.py")
TARGET_DIR = os.path.join(ROOT, "packages", "backend", "src", "compute", "targets", "abl1-1iep")

PROTOCOL = {
    "kind": "GENESIS_FINALIST_FALSIFICATION_PROTOCOL",
    "decision": "D-150",
    "target": "ABL1_1IEP",
    "pdbId": "1IEP",
    "chain": "A",
    "receptorFile": "1iep_receptorH.pdb",
    "crystalLigandFile": "1iep_ligand.sdf",
    "pocketSource": "packages/backend/src/compute/targets/abl1-1iep/SOURCE.json (AutoDock Vina basic-docking tutorial box around the co-crystallised imatinib)",
    "center": [15.19, 53.903, 16.917],
    "boxSize": [20.0, 20.0, 20.0],
    "engine": "packages/backend/src/compute/dock_worker.py — Meeko mk_prepare_receptor -> RDKit AddHs + ETKDGv3(randomSeed) + MMFF94 -> AutoDock Vina",
    "redockConfigurations": [
        {"seed": 42, "exhaustiveness": 8},
        {"seed": 7, "exhaustiveness": 8},
        {"seed": 1234, "exhaustiveness": 8},
        {"seed": 42, "exhaustiveness": 16},
        {"seed": 7, "exhaustiveness": 16},
    ],
    "controls": [
        {"id": "nilotinib", "role": "POSITIVE", "smiles": "Cc1cn(-c2cc(NC(=O)c3ccc(C)c(Nc4nccc(-c5cccnc5)n4)c3)cc(C(F)(F)F)c2)cn1", "why": "second-generation type-II ABL1 inhibitor, same DFG-out ATP-site mode as the reference ligand (Weisberg et al. 2005)"},
        {"id": "aspirin", "role": "NEGATIVE", "smiles": "CC(=O)Oc1ccccc1C(=O)O", "why": "approved COX inhibitor, not a kinase inhibitor"},
        {"id": "paracetamol", "role": "NEGATIVE", "smiles": "CC(=O)Nc1ccc(O)cc1", "why": "approved analgesic, not a kinase inhibitor"},
        {"id": "metformin", "role": "NEGATIVE", "smiles": "CN(C)C(=N)NC(N)=N", "why": "approved biguanide, not a kinase inhibitor"},
        {"id": "caffeine", "role": "NEGATIVE", "smiles": "Cn1cnc2c1c(=O)n(C)c(=O)n2C", "why": "xanthine, purine-like but not an ABL1 inhibitor"},
        {"id": "ibuprofen", "role": "NEGATIVE", "smiles": "CC(C)Cc1ccc(C(C)C(=O)O)cc1", "why": "approved NSAID, not a kinase inhibitor"},
    ],
    "controlDockSettings": {"seed": 42, "exhaustiveness": 8, "nPoses": 5},
    "thresholds": {
        "redockSuccessRmsdA": 2.0,
        "redockSuccessRmsdASource": "the 2 A heavy-atom RMSD convention of the Astex/PoseBusters redocking literature, already the criterion of docs/evidence/astex-redock-prereg.json — not chosen here",
        "maxScoreSpreadKcalMol": 1.0,
        "maxScoreSpreadSource": "stricter than AutoDock Vina's own reported ~2.85 kcal/mol scoring RMSE (Trott & Olson 2010); a spread above 1.0 kcal/mol across seeds means the reported single score is not stable",
        "minControlSeparationKcalMol": 1.0,
        "minControlSeparationSource": "one kcal/mol, the same magnitude as the spread bound: a claim must beat an unrelated drug by more than the method's own seed noise",
    },
    "verdictRules": {
        "NUMERICAL_ARTIFACT": "PASS iff every configuration produced a pose AND max(bestAffinity) - min(bestAffinity) <= maxScoreSpreadKcalMol AND every configuration's rmsdA <= redockSuccessRmsdA; otherwise FAIL",
        "MEASUREMENT_ARTIFACT": "PASS iff the median configuration's rmsdA <= redockSuccessRmsdA (the pipeline reproduces an independently measured crystal pose); otherwise FAIL",
        "ALTERNATIVE_MODEL": "PASS iff the best redock affinity is at least minControlSeparationKcalMol better (more negative) than EVERY NEGATIVE control's best affinity; otherwise FAIL",
    },
    "limitations": [
        "Vina scores are MODEL_ESTIMATE, never measured affinity; no therapeutic claim is made.",
        "Negative controls are chemically unrelated approved drugs, not property-matched decoys; no offline decoy generator is available.",
        "The redocked ligand is the deposited crystal ligand of the target file, so this validates the pipeline and the receptor, not a novel molecule.",
        "The receptor is a single rigid crystal conformation; no receptor ensemble and no molecular dynamics are part of this protocol.",
    ],
}


def sha(text):
    return hashlib.sha256(text.encode("utf-8") if isinstance(text, str) else text).hexdigest()


def fingerprint(obj):
    return sha(json.dumps(obj, sort_keys=True, separators=(",", ":")))


def worker(req, timeout=1800):
    out = subprocess.run([sys.executable, WORKER, json.dumps(req)], capture_output=True, text=True, timeout=timeout)
    line = (out.stdout or "").strip().splitlines()
    if not line:
        return {"ok": False, "error": "no_output: %s" % (out.stderr or "")[-300:]}
    try:
        return json.loads(line[-1])
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": "unparsable_output: %s" % e}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=None)
    ap.add_argument("--quick", action="store_true", help="two redock configurations and two negative controls (wiring check, marked unregistered)")
    args = ap.parse_args()

    protocol_fingerprint = fingerprint(PROTOCOL)
    configs = PROTOCOL["redockConfigurations"][:2] if args.quick else PROTOCOL["redockConfigurations"]
    controls = [c for c in PROTOCOL["controls"] if c["role"] == "POSITIVE"][:1] + [c for c in PROTOCOL["controls"] if c["role"] == "NEGATIVE"][: 2 if args.quick else 99] if args.quick else PROTOCOL["controls"]

    pdb_path = os.path.join(TARGET_DIR, PROTOCOL["receptorFile"])
    sdf_path = os.path.join(TARGET_DIR, PROTOCOL["crystalLigandFile"])
    source = json.load(open(os.path.join(TARGET_DIR, "SOURCE.json")))
    for name in (PROTOCOL["receptorFile"], PROTOCOL["crystalLigandFile"]):
        actual = sha(open(os.path.join(TARGET_DIR, name), "rb").read())
        expected = source["files"][name]["sha256"]
        if actual != expected:
            print("target file hash mismatch: %s" % name, file=sys.stderr)
            return 2

    tmp = tempfile.mkdtemp(prefix="genesis-falsification-")
    redocks = []
    for i, cfg in enumerate(configs):
        req = {
            "cmd": "redock", "pdbPath": pdb_path, "ligandSdfPath": sdf_path,
            "center": PROTOCOL["center"], "boxSize": PROTOCOL["boxSize"],
            "exhaustiveness": cfg["exhaustiveness"], "seed": cfg["seed"],
            "outDir": os.path.join(tmp, "redock-%d" % i),
        }
        print("redock seed=%s exhaustiveness=%s ..." % (cfg["seed"], cfg["exhaustiveness"]), file=sys.stderr)
        r = worker(req)
        if not r.get("ok"):
            redocks.append({**cfg, "status": "FAILED", "error": r.get("error")})
            continue
        redocks.append({
            **cfg, "status": "DOCKED", "ligandSmiles": r["ligandSmiles"], "rmsdA": r["rmsdA"],
            "bestAffinityKcalMol": r["bestAffinityKcalMol"], "poseSha256": r["poseSha256"],
            "receptorPdbqtSha256": r["receptor"]["receptorPdbqtSha256"],
            "sourceSha256": r["receptor"]["sourceSha256"], "receptorAtoms": r["receptor"]["receptorAtoms"],
            "meekoVersion": r["meekoVersion"], "vinaVersion": r["vinaVersion"],
        })

    # One prepared receptor for every control, so a control differs from the redock only in the ligand.
    prep = worker({"cmd": "prepare_receptor", "pdbPath": pdb_path, "center": PROTOCOL["center"],
                   "boxSize": PROTOCOL["boxSize"], "outDir": os.path.join(tmp, "receptor")})
    control_results = []
    if not prep.get("ok"):
        control_results.append({"id": "*", "status": "FAILED", "error": prep.get("error")})
    else:
        cs = PROTOCOL["controlDockSettings"]
        for c in controls:
            print("dock control %s ..." % c["id"], file=sys.stderr)
            r = worker({"cmd": "dock", "ligandSmiles": c["smiles"], "receptorPdbqtPath": prep["receptorPdbqtPath"],
                        "center": PROTOCOL["center"], "boxSize": PROTOCOL["boxSize"],
                        "exhaustiveness": cs["exhaustiveness"], "nPoses": cs["nPoses"], "seed": cs["seed"],
                        "outDir": os.path.join(tmp, "control-%s" % c["id"])})
            if not r.get("ok"):
                control_results.append({**c, "status": "FAILED", "error": r.get("error")})
                continue
            control_results.append({**c, "status": "DOCKED", "bestAffinityKcalMol": r["bestAffinityKcalMol"],
                                    "poseSha256": r["poseSha256"], "ligandPdbqtSha256": r["ligandPdbqtSha256"],
                                    "ligandAtoms": r["ligandAtoms"]})

    docked = [r for r in redocks if r["status"] == "DOCKED"]
    scores = sorted(r["bestAffinityKcalMol"] for r in docked)
    rmsds = sorted(r["rmsdA"] for r in docked)
    negatives = [c for c in control_results if c.get("role") == "NEGATIVE" and c["status"] == "DOCKED"]
    positives = [c for c in control_results if c.get("role") == "POSITIVE" and c["status"] == "DOCKED"]
    th = PROTOCOL["thresholds"]

    spread = round(scores[-1] - scores[0], 3) if scores else None
    median_rmsd = rmsds[len(rmsds) // 2] if rmsds else None
    worst_negative = min((c["bestAffinityKcalMol"] for c in negatives), default=None)
    best_redock = scores[0] if scores else None
    separation = round(worst_negative - best_redock, 3) if (worst_negative is not None and best_redock is not None) else None

    numerical = ("PASS" if (len(docked) == len(configs) and spread is not None and spread <= th["maxScoreSpreadKcalMol"]
                            and all(r["rmsdA"] <= th["redockSuccessRmsdA"] for r in docked)) else "FAIL") if docked else "FAILED_TO_RUN"
    measurement = ("PASS" if (median_rmsd is not None and median_rmsd <= th["redockSuccessRmsdA"]) else "FAIL") if docked else "FAILED_TO_RUN"
    alternative = ("PASS" if (separation is not None and separation >= th["minControlSeparationKcalMol"]) else "FAIL") if negatives and docked else "FAILED_TO_RUN"

    body = {
        "kind": "GENESIS_FINALIST_FALSIFICATION_EVIDENCE",
        "contractVersion": 1,
        "decision": "D-150",
        "registered": not args.quick,
        "protocol": PROTOCOL,
        "protocolFingerprint": protocol_fingerprint,
        "redocks": redocks,
        "controls": control_results,
        "summary": {
            "configurations": len(configs),
            "configurationsDocked": len(docked),
            "bestAffinityKcalMolRange": [scores[0], scores[-1]] if scores else None,
            "scoreSpreadKcalMol": spread,
            "rmsdARange": [rmsds[0], rmsds[-1]] if rmsds else None,
            "medianRmsdA": median_rmsd,
            "positiveControlBestAffinityKcalMol": min((c["bestAffinityKcalMol"] for c in positives), default=None),
            "weakestNegativeControlBestAffinityKcalMol": worst_negative,
            "separationFromWeakestNegativeKcalMol": separation,
        },
        "probeVerdicts": {
            "NUMERICAL_ARTIFACT": numerical,
            "MEASUREMENT_ARTIFACT": measurement,
            "ALTERNATIVE_MODEL": alternative,
        },
        "engines": {
            "vina": (docked[0]["vinaVersion"] if docked else None),
            "meeko": (docked[0]["meekoVersion"] if docked else None),
            "python": sys.version.split()[0],
        },
        "finishedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    body["bodySha256"] = fingerprint({k: v for k, v in body.items() if k != "finishedAt"})

    out = args.out or os.path.join(ROOT, "docs", "evidence", "finalist-falsification-%s.json" % datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    with open(out, "w") as f:
        json.dump(body, f, indent=1, sort_keys=False)
        f.write("\n")
    print(json.dumps({"out": out, "bodySha256": body["bodySha256"], "protocolFingerprint": protocol_fingerprint,
                      "summary": body["summary"], "probeVerdicts": body["probeVerdicts"]}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
