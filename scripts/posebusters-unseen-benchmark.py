#!/usr/bin/env python3
"""GENESIS - run 8: the frozen post-run-7 pipeline on the unseen PoseBusters benchmark.

    python3 scripts/posebusters-unseen-benchmark.py --repo-clone /tmp/claude-0/pb-bench \
        --work /tmp/claude-0/run8/work --jobs 4

This is the independent validation no Astex number can be. The protocol is frozen in
docs/evidence/posebusters-unseen-benchmark-prereg.json and fingerprinted; this script
RECOMPUTES sha256(json.dumps(protocol, sort_keys=True)) and REFUSES TO RUN on any drift,
as it does on drift of the pinned preparation/docking code or of the gnina binary.

Nothing here is tuned for this benchmark. The preparation, the sampling, the pooling, the
rescoring and the single ranking rule are the ones run 7 ended with, pinned by file hash.
The denominator is 308 and never anything else: a case that fails preparation, fails docking
or fails its integrity gate stays in the denominator as a top-1 failure and is reported by
name. No case is removed, repaired case by case, substituted or re-run because its result
was poor.

GNINA is an external benchmark executable only. It is NOT added to any manifest and NOT
integrated into the product.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import hashlib
import importlib.util
import json
import os
import statistics
import string
import subprocess
import sys
import time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PREREG = os.path.join(ROOT, "docs/evidence/posebusters-unseen-benchmark-prereg.json")
CASES = os.path.join(ROOT, "docs/evidence/posebusters-benchmark-cases.json")
WORKER = os.path.join(ROOT, "packages/backend/src/compute/dock_worker.py")
PHASE2 = os.path.join(ROOT, "scripts/astex-phase2-redock.py")
ENSEMBLE = os.path.join(ROOT, "scripts/astex-multiseed-ensemble.py")
GNINA7 = os.path.join(ROOT, "scripts/astex-gnina-rescore.py")
OUT_JSON = os.path.join(ROOT, "docs/evidence/posebusters-run8-unseen-benchmark.json")
OUT_MD = os.path.join(ROOT, "docs/evidence/posebusters-run8-unseen-benchmark.md")

SUCCESS_RMSD_A = 2.0
DENOMINATOR = 308
TOP_K_WINDOWS = (1, 3, 5, 10, 20)
SEEDS = (42, 1042, 2042, 3042, 4042)
EXHAUSTIVENESS = 32
NUM_MODES = 20
ENERGY_RANGE = 20.0
MIN_RMSD = 1.0
RMSD_TOLERANCE = 0.0005
ALPHA = string.ascii_uppercase + string.ascii_lowercase + string.digits


# ------------------------------------------------------------------ gates


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def _module(path: str, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_prereg(path: str = PREREG) -> dict:
    with open(path) as f:
        doc = json.load(f)
    got = hashlib.sha256(json.dumps(doc["protocol"], sort_keys=True).encode()).hexdigest()
    if got != doc["protocolFingerprintSha256"]:
        raise SystemExit("REFUSING TO RUN: preregistration fingerprint drift.\n"
                         "  frozen %s\n  actual %s" % (doc["protocolFingerprintSha256"], got))
    return doc


def verify_pinned_code(protocol: dict) -> dict:
    out, bad = {}, []
    for rel, want in sorted(protocol["codeIdentity"]["pinnedFileSha256"].items()):
        got = sha256_file(os.path.join(ROOT, rel))
        out[rel] = got
        if got != want:
            bad.append((rel, want, got))
    if bad:
        raise SystemExit("REFUSING TO RUN: pinned code changed since the freeze:\n" +
                         "\n".join("  %s\n    frozen %s\n    actual %s" % b for b in bad))
    return out


def verify_protocol_constants(protocol: dict) -> None:
    """The numbers this script hard-codes must be the numbers the freeze says."""
    p = protocol["frozenProtocol"]
    if str(DENOMINATOR) not in p["denominator"]:
        raise SystemExit("REFUSING TO RUN: denominator drift")
    if "2.0 A" not in p["successCriterion"]:
        raise SystemExit("REFUSING TO RUN: success threshold drift")
    for s in SEEDS:
        if str(s) not in p["sampling"]:
            raise SystemExit("REFUSING TO RUN: seed %d not in the frozen sampling clause" % s)
    if "exhaustiveness 32" not in p["sampling"]:
        raise SystemExit("REFUSING TO RUN: exhaustiveness drift")


# ------------------------------------------------------------------ inputs


def build_receptor_pdb(pdb_id: str, cif_path: str, out_pdb: str) -> None:
    """The frozen input-construction rule: model 1, first altloc, hydrogens dropped, every
    other deposited atom kept, chain ids longer than one character remapped deterministically."""
    import numpy as np
    from biotite.structure.io.pdb import PDBFile
    from biotite.structure.io.pdbx import CIFFile, get_structure

    st = get_structure(CIFFile.read(cif_path), model=1, altloc="first")
    st = st[st.element != "H"]
    chains = sorted(set(st.chain_id.tolist()))
    if any(len(c) > 1 for c in chains):
        if len(chains) > len(ALPHA):
            raise RuntimeError("too many chains to remap: %d" % len(chains))
        m = {c: ALPHA[i] for i, c in enumerate(chains)}
        st.chain_id = np.array([m[c] for c in st.chain_id])
    f = PDBFile()
    f.set_structure(st)
    os.makedirs(os.path.dirname(out_pdb), exist_ok=True)
    f.write(out_pdb)


def stage_inputs(case: dict, clone: str, data_dir: str) -> dict:
    """Rebuild this case's receptor input and check both input hashes against the freeze."""
    pid = case["pdbId"]
    cif = os.path.join(clone, "structures/raw_from_pdb", "%s.cif" % pid.lower())
    if not os.path.exists(cif):
        return {"ok": False, "reason": "missing_source_cif", "path": cif}
    got_cif = sha256_file(cif)
    if got_cif != case["sourceCifSha256"]:
        return {"ok": False, "reason": "source_cif_sha256_mismatch",
                "expected": case["sourceCifSha256"], "got": got_cif}
    pdb = os.path.join(data_dir, "%s.pdb" % pid.lower())
    if not os.path.exists(pdb):
        build_receptor_pdb(pid, cif, pdb)
    got_pdb = sha256_file(pdb)
    if got_pdb != case["receptorInputPdbSha256"]:
        return {"ok": False, "reason": "receptor_input_pdb_sha256_mismatch",
                "expected": case["receptorInputPdbSha256"], "got": got_pdb}
    return {"ok": True, "cif": cif, "pdb": pdb,
            "sourceCifSha256": got_cif, "receptorInputPdbSha256": got_pdb}


# ------------------------------------------------------------------ one case


def run_one(case: dict, clone: str, data_dir: str, work: str, results: str,
            gnina_bin: str, log) -> dict:
    """Prepare, dock five seeds, pool, gate, GNINA-score and rank ONE case."""
    pid, lig = case["pdbId"], case["ligand"]
    out_path = os.path.join(results, "%s.json" % pid)
    if os.path.exists(out_path):
        with open(out_path) as f:
            rec = json.load(f)
        log("%-5s CACHED   %s" % (pid, rec.get("status")))
        return rec

    ens = _module(ENSEMBLE, "ens_for_run8")
    p2 = _module(PHASE2, "p2_for_run8")
    g7 = _module(GNINA7, "g7_for_run8")

    rec = {"pdbId": pid, "ligand": lig, "seeds": list(SEEDS)}
    t0 = time.time()

    staged = stage_inputs(case, clone, data_dir)
    rec["inputs"] = staged
    if not staged["ok"]:
        rec.update({"status": "UNAVAILABLE", "seedRuns": [], "pool": [], "poolSize": 0,
                    "gninaOrdered": [], "anyNativeLike": False, "top1Success": False})
        _write(out_path, rec, t0)
        log("%-5s UNAVAILABLE %s" % (pid, staged["reason"]))
        return rec

    case_dir = os.path.join(work, pid)
    try:
        prep, receptor, sdf, center, size, extra = p2.prepare_case(pid, lig, data_dir, case_dir)
    except Exception as e:  # noqa: BLE001
        rec.update({"status": "PREPARATION_FAILED", "error": str(e)[:300], "seedRuns": [],
                    "pool": [], "poolSize": 0, "gninaOrdered": [], "anyNativeLike": False,
                    "top1Success": False})
        _write(out_path, rec, t0)
        log("%-5s PREPARATION_FAILED %s" % (pid, str(e)[:110]))
        return rec

    rec.update(prep)
    rec["preparation"] = {"receptorPdb": receptor, "ligandSdf": sdf, "center": center,
                          "boxSize": size, "extraRigidPdbqtPaths": extra,
                          "sharedByAllSeeds": True}
    p = {"receptor": receptor, "sdf": sdf, "center": center, "size": size, "extra": extra}

    seed_runs = []
    for s in SEEDS:
        seed_runs.append(ens.dock_one_seed(p, s, case_dir, EXHAUSTIVENESS, NUM_MODES,
                                           ENERGY_RANGE, MIN_RMSD, WORKER))
    rec["seedRuns"] = seed_runs
    docked = [sr for sr in seed_runs if sr["status"] == "DOCKED"]
    if not docked:
        rec.update({"status": "DOCKING_FAILED", "pool": [], "poolSize": 0, "gninaOrdered": [],
                    "anyNativeLike": False, "top1Success": False})
        _write(out_path, rec, t0)
        log("%-5s DOCKING_FAILED all seeds" % pid)
        return rec

    rec.update(ens.pool_case(rec))
    rec["anyNativeLike"] = any(q["rmsdA"] < SUCCESS_RMSD_A for q in rec["pool"])

    gate = _gate(rec, work)
    rec["integrityGate"] = gate
    if not gate["ok"]:
        rec.update({"status": "UNAVAILABLE", "gninaOrdered": [], "top1Success": False})
        _write(out_path, rec, t0)
        log("%-5s UNAVAILABLE integrity gate" % pid)
        return rec

    scratch = os.path.join(work, pid, "gnina")
    os.makedirs(scratch, exist_ok=True)
    sdf_path = os.path.join(scratch, "%s_poses.sdf" % pid)
    # extract_poses walks case["seedRuns"] and looks each seed up in the gate, which only holds
    # the seeds that actually docked. On Astex every seed always docked, so run 7 never hit this;
    # here 8F4J lost two of five seeds and the lookup raised KeyError. Hand it the docked seeds
    # only - exactly the set pool_case pooled and the gate verified. Inert when all seeds docked.
    poses, checks = g7.extract_poses(dict(rec, seedRuns=docked), gate, sdf_path)
    if poses is None or checks:
        rec.update({"status": "UNAVAILABLE", "failedChecks": checks or [], "gninaOrdered": [],
                    "top1Success": False})
        _write(out_path, rec, t0)
        log("%-5s UNAVAILABLE pose verification" % pid)
        return rec

    receptor_pdbqt = gate["perSeed"][docked[0]["seed"]]["receptorPath"]
    tg = time.time()
    try:
        scores = g7.score_with_gnina(gnina_bin, receptor_pdbqt, sdf_path, cpu=1)
    except Exception as e:  # noqa: BLE001
        rec.update({"status": "UNAVAILABLE", "gninaError": str(e)[:300], "gninaOrdered": [],
                    "top1Success": False})
        _write(out_path, rec, t0)
        log("%-5s UNAVAILABLE gnina: %s" % (pid, str(e)[:100]))
        return rec
    rec["gninaSeconds"] = round(time.time() - tg, 2)
    try:
        os.unlink(sdf_path)
    except OSError:
        pass

    by_key = {(q["seed"], q["rank"]): q for q in poses}
    missing = [(q["seed"], q["rank"]) for q in rec["pool"] if (q["seed"], q["rank"]) not in by_key]
    unscored = [q["tag"] for q in poses if q["tag"] not in scores]
    if missing or unscored:
        rec.update({"status": "UNAVAILABLE", "gninaOrdered": [], "top1Success": False,
                    "failedChecks": [{"check": "every_pooled_pose_scored", "ok": False,
                                      "missingFromPoses": missing[:20],
                                      "unscoredByGnina": unscored[:20]}]})
        _write(out_path, rec, t0)
        log("%-5s UNAVAILABLE unscored poses" % pid)
        return rec

    pool = []
    for q in rec["pool"]:
        src = by_key[(q["seed"], q["rank"])]
        if src["poseSha256"] != q["poseSha256"]:
            rec.update({"status": "UNAVAILABLE", "gninaOrdered": [], "top1Success": False,
                        "failedChecks": [{"check": "pose_sha256_stable", "ok": False,
                                          "seed": q["seed"], "rank": q["rank"]}]})
            _write(out_path, rec, t0)
            log("%-5s UNAVAILABLE pose sha drift" % pid)
            return rec
        s = scores[src["tag"]]
        e = dict(q)
        e["cnnScore"] = s["cnnScore"]
        e["cnnAffinity"] = s.get("cnnAffinity")
        e["cnnVariance"] = s.get("cnnVariance")
        e["gninaAffinityKcalMol"] = s["affinity"]
        pool.append(e)
    rec["pool"] = pool
    rec["gninaOrdered"] = g7.rank_by_gnina(pool)
    rec["vinaOrdered"] = sorted(pool, key=ens.pool_sort_key)
    rec["status"] = "SCORED"
    rec["top1Success"] = bool(rec["gninaOrdered"]) and rec["gninaOrdered"][0]["rmsdA"] < SUCCESS_RMSD_A
    rec["vinaTop1Success"] = bool(rec["vinaOrdered"]) and rec["vinaOrdered"][0]["rmsdA"] < SUCCESS_RMSD_A
    rec["perSeedTop1"] = _per_seed(rec, g7)
    _write(out_path, rec, t0)
    log("%-5s SCORED   pool=%-3d gnina_top1=%s vina_top1=%s ceiling=%s %.0fs"
        % (pid, rec["poolSize"], rec["top1Success"], rec["vinaTop1Success"],
           rec["anyNativeLike"], time.time() - t0))
    return rec


def _write(path: str, rec: dict, t0: float) -> None:
    rec["wallClockSeconds"] = round(time.time() - t0, 1)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(rec, f, indent=1)
    os.replace(tmp, path)


def _gate(rec: dict, work: str) -> dict:
    """File-level gate against the hashes THIS run recorded when it docked."""
    extra = bool((rec.get("preparation") or {}).get("extraRigidPdbqtPaths"))
    name = "receptor_with_extra.pdbqt" if extra else "receptor.pdbqt"
    per_seed, problems = {}, []
    for sr in rec["seedRuns"]:
        if sr["status"] != "DOCKED":
            continue
        seed_dir = os.path.join(work, rec["pdbId"], "seed%d" % sr["seed"])
        docked = os.path.join(seed_dir, "dock", "docked.pdbqt")
        recp = os.path.join(seed_dir, "receptor", name)
        missing = False
        for label, path in (("docked.pdbqt", docked), ("receptor.pdbqt", recp)):
            if not os.path.exists(path):
                problems.append({"seed": sr["seed"], "reason": "missing_%s" % label})
                missing = True
        if missing:
            continue
        gd, gr = sha256_file(docked), sha256_file(recp)
        if gd != sr["dockedPdbqtSha256"]:
            problems.append({"seed": sr["seed"], "reason": "docked_pdbqt_sha256_mismatch"})
        if gr != sr["receptorPdbqtSha256"]:
            problems.append({"seed": sr["seed"], "reason": "receptor_pdbqt_sha256_mismatch"})
        per_seed[sr["seed"]] = {"dockedPath": docked, "receptorPath": recp,
                                "dockedPdbqtSha256": gd, "receptorPdbqtSha256": gr}
    receptors = {v["receptorPdbqtSha256"] for v in per_seed.values()}
    if len(receptors) > 1:
        problems.append({"reason": "receptor_differs_across_seeds"})
    return {"ok": not problems and bool(per_seed), "problems": problems, "perSeed": per_seed,
            "usedExtraRigidReceptor": extra}


def _per_seed(rec: dict, g7) -> dict:
    """The same two rules applied to each seed's own 20-pose set, never pooled."""
    out = {}
    for sr in rec["seedRuns"]:
        if sr["status"] != "DOCKED":
            out[str(sr["seed"])] = {"gnina": False, "vina": False, "status": sr["status"]}
            continue
        own = [q for q in rec["pool"] if q["seed"] == sr["seed"]]
        if not own:
            out[str(sr["seed"])] = {"gnina": False, "vina": False, "status": "NO_SURVIVING_POSE"}
            continue
        g = g7.rank_by_gnina(own)[0]
        v = sorted(own, key=lambda q: (q["affinityKcalMol"], q["seedIndex"], q["rank"]))[0]
        out[str(sr["seed"])] = {"gnina": g["rmsdA"] < SUCCESS_RMSD_A,
                                "vina": v["rmsdA"] < SUCCESS_RMSD_A, "status": "DOCKED"}
    return out


# ------------------------------------------------------------------ report


def top_k(cases: list, key: str) -> dict:
    out = {}
    for k in TOP_K_WINDOWS:
        hits = [c for c in cases
                if any(q["rmsdA"] < SUCCESS_RMSD_A for q in (c.get(key) or [])[:k])]
        out["top%d" % k] = {"successes": len(hits), "denominator": len(cases),
                            "rate": round(len(hits) / len(cases), 4) if cases else None}
    return out


def verdict(gnina_top1: int, vina_top1: int, per_seed_signs: list) -> dict:
    """The criterion fixed before the run: the PAIRED difference on this same set."""
    diff_pp = round(100.0 * (gnina_top1 - vina_top1) / DENOMINATOR, 2)
    reversals = sum(1 for d in per_seed_signs if d < 0)
    if diff_pp >= 8.0 and reversals == 0:
        v = "GENERALISES"
    elif diff_pp <= 2.0 or reversals >= 2:
        v = "DOES_NOT_GENERALISE"
    else:
        v = "PARTIAL"
    return {"gninaMinusVinaPercentagePoints": diff_pp, "seedsWhereAdvantageReverses": reversals,
            "perSeedDifferences": per_seed_signs, "verdict": v,
            "criterion": {"GENERALISES": ">= +8.0 pp and no seed reverses",
                          "DOES_NOT_GENERALISE": "<= +2.0 pp or >= 2 seeds reverse",
                          "PARTIAL": "anything between"},
            "referenceEffectOnAstex": "+15.3 pp (63 vs 50 of 85), all five seeds"}


def build_report(cases: list, doc: dict, pinned: dict, binary: dict, wall: float,
                 args) -> dict:
    p = doc["protocol"]
    if len(cases) != DENOMINATOR:
        raise SystemExit("REFUSING TO REPORT: %d cases, expected %d" % (len(cases), DENOMINATOR))
    by_status = {}
    for c in cases:
        by_status.setdefault(c["status"], []).append(c["pdbId"])
    g_flags = {c["pdbId"]: bool(c.get("top1Success")) for c in cases}
    v_flags = {c["pdbId"]: bool(c.get("vinaTop1Success")) for c in cases}
    g_top1 = sum(g_flags.values())
    v_top1 = sum(v_flags.values())

    per_seed = {}
    for s in SEEDS:
        g = sum(1 for c in cases if (c.get("perSeedTop1") or {}).get(str(s), {}).get("gnina"))
        v = sum(1 for c in cases if (c.get("perSeedTop1") or {}).get(str(s), {}).get("vina"))
        per_seed[str(s)] = {"gnina": g, "vina": v, "difference": g - v}
    signs = [per_seed[str(s)]["difference"] for s in SEEDS]

    ceiling = [c["pdbId"] for c in cases if c.get("anyNativeLike")]
    ranking_failures = sorted(c["pdbId"] for c in cases
                              if c.get("anyNativeLike") and not c.get("top1Success"))
    sampling_failures = sorted(c["pdbId"] for c in cases
                               if c.get("status") == "SCORED" and not c.get("anyNativeLike"))
    recovered = sorted(k for k in g_flags if g_flags[k] and not v_flags[k])
    lost = sorted(k for k in g_flags if v_flags[k] and not g_flags[k])

    return {
        "kind": "GENESIS_RUN8_POSEBUSTERS_UNSEEN_BENCHMARK",
        "label": p["label"],
        "whatThisIs": ("The first Genesis docking result measured on complexes that are provably "
                       "absent from the published training id lists of its scorer. The protocol "
                       "was frozen and pushed before the set was docked."),
        "notComparableOneToOne": ("Absolute rates on different benchmarks are NOT comparable "
                                  "one to one: this set and Astex differ in difficulty. The "
                                  "verdict is decided by the paired GNINA-minus-Vina difference "
                                  "measured on this set alone."),
        "scorerStatus": ("GNINA is an external benchmark executable only. It is not in any "
                         "package manifest and not in any product code path."),
        "finishedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "wallClockSeconds": round(wall, 1),
        "hostCpuCount": os.cpu_count(),
        "jobs": args.jobs,
        "preregistration": {"file": os.path.relpath(PREREG, ROOT),
                            "protocolFingerprintSha256": doc["protocolFingerprintSha256"],
                            "fingerprintRecomputedAndMatched": True,
                            "frozenAt": doc["frozenAt"],
                            "pinnedCodeVerified": pinned},
        "engine": {"gnina": binary, "model": "crossdock_default2018_ensemble",
                   "invocation": "--score_only --no_gpu --cpu 1 --cnn crossdock_default2018_ensemble",
                   "docked": True, "minimised": False, "posesMoved": False},
        "benchmark": {"name": p["benchmark"]["name"], "cases": DENOMINATOR,
                      "distribution": p["benchmark"]["distribution"]},
        "contaminationAudit": p["contaminationAudit"]["result"],
        "denominator": DENOMINATOR,
        "statusCounts": {k: len(v) for k, v in sorted(by_status.items())},
        "statusCases": {k: sorted(v) for k, v in sorted(by_status.items())},
        "topKGnina": top_k(cases, "gninaOrdered"),
        "topKVina": top_k(cases, "vinaOrdered"),
        "primaryMetric": {"rule": "GNINA CNNscore descending", "top1": g_top1,
                          "denominator": DENOMINATOR,
                          "rate": round(g_top1 / DENOMINATOR, 4)},
        "pairedVinaBaseline": {"top1": v_top1, "denominator": DENOMINATOR,
                               "rate": round(v_top1 / DENOMINATOR, 4),
                               "recovered": len(recovered), "recoveredCases": recovered,
                               "lost": len(lost), "lostCases": lost,
                               "net": len(recovered) - len(lost)},
        "perSeedTop1": per_seed,
        "samplingCeiling": {"casesWithAnyNativeLikePose": len(ceiling),
                            "denominator": DENOMINATOR},
        "rankingFailures": {"count": len(ranking_failures), "cases": ranking_failures},
        "samplingFailures": {"count": len(sampling_failures), "cases": sampling_failures},
        "preparationFailures": {"count": len(by_status.get("PREPARATION_FAILED", [])),
                                "cases": sorted(by_status.get("PREPARATION_FAILED", [])),
                                "declaredInPreregInAdvance": True},
        "dockingFailures": {"count": len(by_status.get("DOCKING_FAILED", [])),
                            "cases": sorted(by_status.get("DOCKING_FAILED", []))},
        "unavailable": {"count": len(by_status.get("UNAVAILABLE", [])),
                        "cases": sorted(by_status.get("UNAVAILABLE", []))},
        "verdict": verdict(g_top1, v_top1, signs),
        "falsifiablePrediction": p["falsifiablePrediction"],
        "perCase": [{"pdbId": c["pdbId"], "ligand": c.get("ligand"), "status": c["status"],
                     "poolSize": c.get("poolSize", 0),
                     "anyNativeLikeInPool": bool(c.get("anyNativeLike")),
                     "gninaTop1Success": bool(c.get("top1Success")),
                     "vinaTop1Success": bool(c.get("vinaTop1Success")),
                     "gninaTop1RmsdA": (c.get("gninaOrdered") or [{}])[0].get("rmsdA"),
                     "gninaTop1CnnScore": (c.get("gninaOrdered") or [{}])[0].get("cnnScore"),
                     "vinaTop1RmsdA": (c.get("vinaOrdered") or [{}])[0].get("rmsdA"),
                     "bestRmsdInPoolA": min([q["rmsdA"] for q in (c.get("pool") or [])],
                                            default=None),
                     "error": c.get("error")}
                    for c in sorted(cases, key=lambda x: x["pdbId"])],
    }


def render_md(r: dict) -> str:
    L = []
    A = L.append
    A("# Run 8 - the frozen Genesis pipeline on the unseen PoseBusters benchmark")
    A("")
    A("**%s**" % r["whatThisIs"])
    A("")
    A(r["notComparableOneToOne"])
    A("")
    A(r["scorerStatus"])
    A("")
    A("Preregistration `%s`, frozen at %s, fingerprint `%s`, recomputed by the runner and matched."
      % (r["preregistration"]["file"], r["preregistration"]["frozenAt"],
         r["preregistration"]["protocolFingerprintSha256"]))
    A("")
    A("Wall clock **%.0f s** on **%s** CPUs with %s parallel cases."
      % (r["wallClockSeconds"], r["hostCpuCount"], r["jobs"]))
    A("")
    A("## Contamination, measured before the run")
    A("")
    c = r["contaminationAudit"]
    A("| set | in CrossDocked2020 | in PDBbind2016 | in either |")
    A("|---|---|---|---|")
    A("| PoseBusters (this benchmark, 308) | %s | %s | %s |"
      % (c["posebustersIntersectCrossDocked2020"], c["posebustersIntersectPdbBind2016"],
         c["posebustersIntersectCrossDocked2020"] + c["posebustersIntersectPdbBind2016"]))
    A("| Astex (85) | %s | %s | %s |"
      % (c["astex85IntersectCrossDocked2020"], c["astex85IntersectPdbBind2016"],
         c["astex85IntersectUnion"]))
    A("")
    A("## 1. Primary metric")
    A("")
    A("Rule: GNINA CNNscore descending, tie-broken by the pooled order. Denominator %d, always."
      % r["denominator"])
    A("")
    A("| window | GNINA | Vina on the same pooled poses |")
    A("|---|---|---|")
    for k in TOP_K_WINDOWS:
        g = r["topKGnina"]["top%d" % k]
        v = r["topKVina"]["top%d" % k]
        A("| top-%d | **%d** (%.1f%%) | %d (%.1f%%) |"
          % (k, g["successes"], 100 * g["rate"], v["successes"], 100 * v["rate"]))
    A("")
    A("Sampling ceiling in the pool: **%d / %d**."
      % (r["samplingCeiling"]["casesWithAnyNativeLikePose"], r["denominator"]))
    A("")
    b = r["pairedVinaBaseline"]
    A("Paired against Vina on the same pooled poses: recovered **%d**, lost **%d**, net **%+d**."
      % (b["recovered"], b["lost"], b["net"]))
    A("")
    A("## 2. Per seed, the same two rules on each seed's own poses")
    A("")
    A("| seed | GNINA | Vina | difference |")
    A("|---|---|---|---|")
    for s in SEEDS:
        p = r["perSeedTop1"][str(s)]
        A("| %d | %d | %d | %+d |" % (s, p["gnina"], p["vina"], p["difference"]))
    A("")
    A("## 3. Verdict, by the criterion fixed before the run")
    A("")
    v = r["verdict"]
    A("GNINA minus Vina: **%+0.2f percentage points**. Seeds where the advantage reverses: **%d**."
      % (v["gninaMinusVinaPercentagePoints"], v["seedsWhereAdvantageReverses"]))
    A("")
    A("**Verdict: %s.**" % v["verdict"])
    A("")
    A("Criterion, fixed in the preregistration: GENERALISES %s; DOES_NOT_GENERALISE %s; PARTIAL %s."
      % (v["criterion"]["GENERALISES"], v["criterion"]["DOES_NOT_GENERALISE"],
         v["criterion"]["PARTIAL"]))
    A("")
    A("Reference effect on Astex: %s." % v["referenceEffectOnAstex"])
    A("")
    fp = r["falsifiablePrediction"]
    A("Prediction recorded before the run: absolute top-1 %s%%, gap %s, verdict %s."
      % (fp["gninaTop1AbsolutePercent"], fp["gninaMinusVinaPercentagePoints"],
         fp["verdictPredicted"]))
    A("")
    A("## 4. Every failure, kept and published")
    A("")
    A("Status counts: %s" % json.dumps(r["statusCounts"]))
    A("")
    A("**Ranking failures (%d)** - a sub-2.0 A pose is in the pool and the rule does not rank it first:"
      % r["rankingFailures"]["count"])
    A("")
    A(", ".join(r["rankingFailures"]["cases"]) or "none")
    A("")
    A("**Sampling failures (%d)** - no sub-2.0 A pose anywhere in the pool:"
      % r["samplingFailures"]["count"])
    A("")
    A(", ".join(r["samplingFailures"]["cases"]) or "none")
    A("")
    A("**Preparation failures (%d)**, all declared in the preregistration in advance and kept in the denominator:"
      % r["preparationFailures"]["count"])
    A("")
    A(", ".join(r["preparationFailures"]["cases"]) or "none")
    A("")
    A("**Docking failures (%d):** %s" % (r["dockingFailures"]["count"],
                                         ", ".join(r["dockingFailures"]["cases"]) or "none"))
    A("")
    A("**UNAVAILABLE (%d):** %s" % (r["unavailable"]["count"],
                                    ", ".join(r["unavailable"]["cases"]) or "none"))
    A("")
    A("## 5. Per case")
    A("")
    A("| PDB | ligand | status | pool | GNINA top-1 RMSD | Vina top-1 RMSD | best in pool | GNINA hit | Vina hit |")
    A("|---|---|---|---|---|---|---|---|---|")
    for c in r["perCase"]:
        A("| %s | %s | %s | %s | %s | %s | %s | %s | %s |"
          % (c["pdbId"], c["ligand"], c["status"], c["poolSize"],
             c["gninaTop1RmsdA"], c["vinaTop1RmsdA"], c["bestRmsdInPoolA"],
             "yes" if c["gninaTop1Success"] else "no",
             "yes" if c["vinaTop1Success"] else "no"))
    A("")
    return "\n".join(L) + "\n"


# ------------------------------------------------------------------ main


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-clone", default="/tmp/claude-0/pb-bench")
    ap.add_argument("--data", default="/tmp/claude-0/run8/data")
    ap.add_argument("--work", default="/tmp/claude-0/run8/work")
    ap.add_argument("--results", default="/tmp/claude-0/run8/cases")
    ap.add_argument("--gnina", default="/tmp/claude-0/gnina-audit/gnina")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--only", default=None)
    ap.add_argument("--report-only", action="store_true")
    ap.add_argument("--out", default=OUT_JSON)
    ap.add_argument("--md-out", default=OUT_MD)
    ap.add_argument("--log", default="/tmp/claude-0/run8/run.log")
    args = ap.parse_args(argv)

    doc = load_prereg()
    pinned = verify_pinned_code(doc["protocol"])
    verify_protocol_constants(doc["protocol"])
    g7 = _module(GNINA7, "g7_gate")
    binary = g7.verify_gnina(json.load(open(os.path.join(
        ROOT, "docs/evidence/astex-gnina-rescoring-prereg.json")))["protocol"], args.gnina)

    with open(CASES) as f:
        cases = json.load(f)
    if len(cases) != DENOMINATOR:
        raise SystemExit("REFUSING TO RUN: case list has %d entries, expected %d"
                         % (len(cases), DENOMINATOR))
    got = hashlib.sha256(json.dumps(cases, sort_keys=True).encode()).hexdigest()
    if got != doc["protocol"]["caseListSha256"]:
        raise SystemExit("REFUSING TO RUN: case list drift.\n  frozen %s\n  actual %s"
                         % (doc["protocol"]["caseListSha256"], got))

    for d in (args.data, args.work, args.results, os.path.dirname(args.log)):
        os.makedirs(d, exist_ok=True)
    logf = open(args.log, "a")

    def log(msg):
        line = "%s  %s" % (datetime.now(timezone.utc).strftime("%H:%M:%S"), msg)
        print(line, flush=True)
        logf.write(line + "\n")
        logf.flush()

    selected = cases
    if args.only:
        want = {x.strip().upper() for x in args.only.split(",")}
        selected = [c for c in cases if c["pdbId"] in want]

    t0 = time.time()
    if not args.report_only:
        log("run 8 starting: %d cases, seeds %s, jobs %d, fingerprint %s"
            % (len(selected), list(SEEDS), args.jobs, doc["protocolFingerprintSha256"][:16]))
        with cf.ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
            futs = [pool.submit(run_one, c, args.repo_clone, args.data, args.work,
                                args.results, args.gnina, log) for c in selected]
            for fu in cf.as_completed(futs):
                fu.result()

    done = []
    for c in cases:
        path = os.path.join(args.results, "%s.json" % c["pdbId"])
        if not os.path.exists(path):
            log("MISSING RESULT %s - not reporting a partial run" % c["pdbId"])
            return 1
        with open(path) as f:
            rec = json.load(f)
        rec.setdefault("ligand", c["ligand"])
        done.append(rec)

    rep = build_report(done, doc, pinned, binary, time.time() - t0, args)
    with open(args.out, "w") as f:
        json.dump(rep, f, indent=1)
    with open(args.md_out, "w") as f:
        f.write(render_md(rep))
    log("wrote %s and %s" % (args.out, args.md_out))
    log("PRIMARY top-1 %d/%d  Vina %d/%d  verdict %s"
        % (rep["primaryMetric"]["top1"], DENOMINATOR, rep["pairedVinaBaseline"]["top1"],
           DENOMINATOR, rep["verdict"]["verdict"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
