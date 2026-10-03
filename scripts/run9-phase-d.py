#!/usr/bin/env python3
"""Run 9 phase D - choose the ranker on the Run 8 PoseBusters pools, as seal A fixes it.

Docks nothing and never re-scores with GNINA. For every one of the 308 Run 8 cases it:
  1. re-verifies the Run 8 files (docked.pdbqt and receptor hashes against the hashes Run 8
     recorded, every pooled pose's identity hash recomputed from the pdbqt),
  2. computes two per-pose features: PoseBusters plausibility and cluster support,
  3. applies C0, C1-C3 at three weights and C4 (run9_rankers.py) and records top-1.
Then it applies the seal A selection rule. Any integrity mismatch stops the run: a ranker
chosen on data that does not verify is not chosen at all.

It does not read, list or open any Run 9 fresh-set file.

Usage: run9-phase-d.py --run8-dir /tmp/claude-0/run8 --out OUT.json [--jobs 4]
"""
import argparse
import concurrent.futures as cf
import hashlib
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import run9_rankers as R  # noqa: E402

SEAL_A = os.path.join(ROOT, "docs/evidence/run9/run9-ranking-prereg.json")
SEAL_A_FP = "7f9981173699aa917fa3299c904c23a8749a656b0720200a48caee0d2c017762"
RUN8_REPORT = os.path.join(ROOT, "docs/evidence/posebusters-run8-unseen-benchmark.json")
CASES = os.path.join(ROOT, "docs/evidence/posebusters-benchmark-cases.json")
WORKER = os.path.join(ROOT, "packages/backend/src/compute/dock_worker.py")
ENSEMBLE = os.path.join(ROOT, "scripts/astex-multiseed-ensemble.py")
SUCCESS_RMSD_A = 2.0
DENOMINATOR = 308


def _module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_seal_a():
    doc = json.load(open(SEAL_A))
    fp = hashlib.sha256(json.dumps(doc["protocol"], sort_keys=True).encode()).hexdigest()
    if fp != SEAL_A_FP or doc["protocolFingerprintSha256"] != SEAL_A_FP:
        sys.exit("REFUSING: seal A fingerprint does not match %s" % SEAL_A_FP)
    return fp


def _busters():
    import os as _os

    import posebusters
    import yaml
    from posebusters import PoseBusters

    cfg = yaml.safe_load(open(_os.path.join(_os.path.dirname(posebusters.__file__), "config/dock.yml")))
    wanted = {"Geometry", "Ring flatness", "Double bond flatness", "Energy ratio",
              "Distance to protein", "Volume overlap with protein"}
    mods = [m for m in cfg["modules"] if m["name"] in wanted]
    if {m["name"] for m in mods} != wanted:
        raise RuntimeError("PoseBusters config does not carry the expected modules")
    return PoseBusters(config={"modules": mods})


def features_for_case(pid, run8_dir):
    """Integrity checks plus per-pose features for one case. Returns a JSON-able dict."""
    from meeko import PDBQTMolecule, RDKitMolCreate
    from rdkit import Chem, RDLogger

    RDLogger.DisableLog("rdApp.*")
    dw = _module(WORKER, "dw_%s" % pid)
    ens = _module(ENSEMBLE, "ens_%s" % pid)
    rec = json.load(open(os.path.join(run8_dir, "cases", pid + ".json")))
    out = {"pdbId": pid, "status": rec["status"], "anyNativeLike": bool(rec.get("anyNativeLike"))}
    if rec["status"] != "SCORED":
        return out

    work = os.path.join(run8_dir, "work", pid)
    extra = bool((rec.get("preparation") or {}).get("extraRigidPdbqtPaths"))
    rname = "receptor_with_extra.pdbqt" if extra else "receptor.pdbqt"
    in_pool = {(p["seed"], p["rank"]): p for p in rec["pool"]}
    mols, problems = {}, []
    for sr in rec["seedRuns"]:
        if sr["status"] != "DOCKED":
            continue
        dpath = os.path.join(work, "seed%d" % sr["seed"], "dock", "docked.pdbqt")
        rpath = os.path.join(work, "seed%d" % sr["seed"], "receptor", rname)
        if sha256_file(dpath) != sr["dockedPdbqtSha256"]:
            problems.append("docked_pdbqt_sha256 seed %d" % sr["seed"])
        if sha256_file(rpath) != sr["receptorPdbqtSha256"]:
            problems.append("receptor_pdbqt_sha256 seed %d" % sr["seed"])
        text = open(dpath).read()
        models = dw.pose_models(text)
        mol = Chem.RemoveHs(RDKitMolCreate.from_pdbqt_mol(PDBQTMolecule(text, skip_typing=True))[0])
        confs = list(mol.GetConformers())
        if len(confs) != len(models):
            problems.append("conformer_count seed %d" % sr["seed"])
            continue
        for i, conf in enumerate(confs):
            key = (sr["seed"], i + 1)
            if key not in in_pool:
                continue
            if dw.pose_identity(models[i]) != in_pool[key]["poseSha256"]:
                problems.append("pose_sha256 seed %d rank %d" % key)
            single = Chem.Mol(mol)
            single.RemoveAllConformers()
            single.AddConformer(Chem.Conformer(conf), assignId=True)
            mols[key] = single
    missing = sorted(k for k in in_pool if k not in mols)
    if missing:
        problems.append("pooled poses not found: %s" % missing[:5])
    if problems:
        out["integrityProblems"] = problems
        return out

    keys = [(p["seed"], p["rank"]) for p in rec["pool"]]
    protein = os.path.join(work, "receptor_clean.pdb")
    df = _busters().bust([mols[k] for k in keys], None, protein, full_report=False)
    cols = [c for c in R.PLAUSIBILITY_CHECKS]
    absent = [c for c in cols if c not in df.columns]
    if absent:
        raise RuntimeError("PoseBusters did not report %s" % absent)
    plaus = [bool(df.iloc[i][cols].astype(bool).all()) for i in range(len(keys))]
    failed = [[c for c in cols if not bool(df.iloc[i][c])] for i in range(len(keys))]

    rmsd = ens.pairwise_rmsd_fn(mols[keys[0]])
    import numpy as np
    xyz = [np.array(mols[k].GetConformer().GetPositions()) for k in keys]
    support = []
    for i in range(len(keys)):
        support.append(sum(1 for j in range(len(keys))
                           if j != i and rmsd(xyz[i], xyz[j]) < R.CLUSTER_RMSD_A))

    out["poses"] = []
    for i, p in enumerate(rec["pool"]):
        out["poses"].append({
            "seed": p["seed"], "seedIndex": p["seedIndex"], "rank": p["rank"],
            "poseSha256": p["poseSha256"], "rmsdA": p["rmsdA"],
            "affinityKcalMol": p["affinityKcalMol"], "cnnScore": p["cnnScore"],
            "plausible": plaus[i], "failedChecks": failed[i], "clusterSupport": support[i]})
    return out


def evaluate(features):
    """Top-1 per rule per case; every non-SCORED case is a failure for every rule."""
    rules = {"C0": R.c0, "VINA": R.vina, "C4": R.c4}
    for name, fn, w in R.SELECTABLE:
        rules[R.variant_label(name, w)] = (lambda f, ww: (lambda pool: f(pool, ww)))(fn, w)
    per_case, totals = [], {k: 0 for k in rules}
    for f in features:
        row = {"pdbId": f["pdbId"], "status": f["status"]}
        for k, fn in rules.items():
            hit = False
            if f["status"] == "SCORED":
                top = fn(f["poses"])[0]
                hit = top["rmsdA"] < SUCCESS_RMSD_A
            row[k] = hit
            totals[k] += int(hit)
        per_case.append(row)
    return totals, per_case


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--run8-dir", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--jobs", type=int, default=4)
    a = ap.parse_args(argv)

    fp = verify_seal_a()
    pids = sorted(c["pdbId"] if isinstance(c, dict) else c
                  for c in (lambda d: d["cases"] if isinstance(d, dict) else d)(json.load(open(CASES))))
    if len(pids) != DENOMINATOR:
        sys.exit("REFUSING: case list has %d entries, not %d" % (len(pids), DENOMINATOR))

    with cf.ProcessPoolExecutor(max_workers=a.jobs) as ex:
        feats = list(ex.map(features_for_case, pids, [a.run8_dir] * len(pids)))
    bad = [f for f in feats if f.get("integrityProblems")]
    if bad:
        json.dump({"stopped": "FIX REQUIRED: Run 8 files do not verify",
                   "cases": [{k: f[k] for k in ("pdbId", "integrityProblems")} for f in bad]},
                  open(a.out, "w"), indent=1, sort_keys=True)
        sys.exit("FIX REQUIRED: %d case(s) fail integrity, see %s" % (len(bad), a.out))

    totals, per_case = evaluate(feats)
    # The run-8 reconstruction check: C0 and VINA must reproduce the published Run 8 counts.
    run8 = json.load(open(RUN8_REPORT))
    reproduced = {"C0": {"phaseD": totals["C0"], "run8Published": run8["primaryMetric"]["top1"]},
                  "VINA": {"phaseD": totals["VINA"], "run8Published": run8["pairedVinaBaseline"]["top1"]}}
    if any(v["phaseD"] != v["run8Published"] for v in reproduced.values()):
        json.dump({"stopped": "FIX REQUIRED: Run 8 top-1 not reproduced", "reproduction": reproduced},
                  open(a.out, "w"), indent=1, sort_keys=True)
        sys.exit("FIX REQUIRED: Run 8 top-1 not reproduced: %s" % reproduced)
    sel = R.select({R.variant_label(n, w): totals[R.variant_label(n, w)] for n, _f, w in R.SELECTABLE},
                   totals["C0"], DENOMINATOR)
    scored = [f for f in feats if f["status"] == "SCORED"]
    n_poses = sum(len(f["poses"]) for f in scored)
    n_implaus = sum(1 for f in scored for p in f["poses"] if not p["plausible"])
    doc = {
        "kind": "RUN9_PHASE_D",
        "sealAFingerprint": fp,
        "set": "PoseBusters Benchmark set, Run 8 pools, DEVELOPMENT ONLY",
        "denominator": DENOMINATOR,
        "top1": totals,
        "selection": sel,
        "run8Reproduction": reproduced,
        "features": {"scoredCases": len(scored), "pooledPoses": n_poses,
                     "implausiblePoses": n_implaus,
                     "casesWithAnyImplausiblePose": sum(1 for f in scored if any(not p["plausible"] for p in f["poses"]))},
        "perCase": per_case,
        "perPoseFeatures": [{"pdbId": f["pdbId"], "poses": [
            {k: p[k] for k in ("seed", "rank", "poseSha256", "plausible", "failedChecks", "clusterSupport")}
            for p in f["poses"]]} for f in scored],
    }
    with open(a.out, "w") as fh:
        json.dump(doc, fh, indent=1, sort_keys=True)
        fh.write("\n")
    print(json.dumps({"top1": totals, "selection": sel, "features": doc["features"]}, indent=1, sort_keys=True))


if __name__ == "__main__":
    main()
