#!/usr/bin/env python3
"""Run 9 phase F - the ONE final run on the fresh Runs N' Poses set, under seal B.

Refuses to start unless seal B exists, its fingerprint recomputes, and every pinned file, the
case list, the GNINA binary and the PoseBusters version match it. Docking, pooling, gating and
GNINA scoring are Run 8's own run_one(), unchanged, with exactly two substitutions that seal A
allows and seal B pins:
  * inputs are staged from the fresh set's system.cif by run9_fresh_inputs.stage_fresh_inputs,
  * the receptor handed to GNINA (never the one Vina docks against) goes through
    run9_gnina_receptor.sanitize.
Per-pose features and rankings are run9-phase-d.py's and run9_rankers.py's, unchanged.
Every case result is cached, so an infrastructure restart resumes with the identical command; a
report is refused unless every drawn case has a result.

Usage: run9-final.py --gt-root DIR --root DIR --gnina PATH [--jobs 4] [--report-only]
"""
import argparse
import hashlib
import importlib.util
import json
import math
import os
import sys
import time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import run9_fresh_inputs as FI  # noqa: E402
import run9_gnina_receptor as GR  # noqa: E402
import run9_rankers as R  # noqa: E402

SEAL_B = os.path.join(ROOT, "docs/evidence/run9/run9-seal-b.json")
OUT_JSON = os.path.join(ROOT, "docs/evidence/run9/run9-final-result.json")
SUCCESS_RMSD_A = 2.0
TOP_K = (1, 3, 5)


def _module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()


def load_seal_b():
    if not os.path.exists(SEAL_B):
        sys.exit("REFUSING: no seal B at %s" % SEAL_B)
    doc = json.load(open(SEAL_B))
    fp = hashlib.sha256(json.dumps(doc["seal"], sort_keys=True).encode()).hexdigest()
    if fp != doc["sealFingerprintSha256"]:
        sys.exit("REFUSING: seal B fingerprint does not recompute")
    s = doc["seal"]
    for rel, want in s["pinnedFileSha256"].items():
        got = sha256_file(os.path.join(ROOT, rel)) if os.path.exists(os.path.join(ROOT, rel)) else "MISSING"
        if got != want:
            sys.exit("REFUSING: pinned file changed since seal B: %s" % rel)
    cases_path = os.path.join(ROOT, s["caseList"]["file"])
    if sha256_file(cases_path) != s["caseList"]["sha256"]:
        sys.exit("REFUSING: case list changed since seal B")
    if sha256_file(os.path.join(ROOT, s["similarityBins"]["file"])) != s["similarityBins"]["sha256"]:
        sys.exit("REFUSING: similarity bins changed since seal B")
    import posebusters
    if posebusters.__version__ != s["versions"]["posebusters"]:
        sys.exit("REFUSING: posebusters %s, seal B pins %s" % (posebusters.__version__, s["versions"]["posebusters"]))
    return doc, json.load(open(cases_path))


def patched_run8(gt_root):
    """Run 8's runner with the two pinned substitutions and nothing else."""
    r8 = _module(os.path.join(HERE, "posebusters-unseen-benchmark.py"), "run8_for_run9")

    def stage(case, _clone, data_dir):
        st = FI.stage_fresh_inputs(case, gt_root, data_dir)
        if st.get("ok"):
            st["cif"] = st["systemCif"]
            st["sourceCifSha256"] = st["systemCifSha256"]
        return st

    orig_module = r8._module

    def module_with_sanitised_gnina(path, name):
        mod = orig_module(path, name)
        if os.path.abspath(path) == os.path.abspath(r8.GNINA7):
            raw = mod.score_with_gnina

            def score(gnina_bin, receptor, sdf_path, cpu=1):
                text = open(receptor).read()
                clean, rep = GR.sanitize(text)
                if clean is text:
                    return raw(gnina_bin, receptor, sdf_path, cpu=cpu)
                alt = receptor + ".gnina.pdbqt"
                with open(alt, "w") as f:
                    f.write(clean)
                return raw(gnina_bin, alt, sdf_path, cpu=cpu)
            mod.score_with_gnina = score
        return mod

    r8.stage_inputs = stage
    r8._module = module_with_sanitised_gnina
    return r8


def mcnemar_one_sided(b, c):
    """P(X >= b) for X ~ Binomial(b + c, 1/2): the exact one-sided McNemar p-value."""
    n = b + c
    if n == 0:
        return 1.0
    return sum(math.comb(n, k) for k in range(b, n + 1)) / 2.0 ** n


def three_way(gain_pp, p, seeds_nonneg, seeds_neg):
    if gain_pp >= 3.0 and p < 0.05 and seeds_nonneg >= 4:
        return "GENERALISES"
    if gain_pp <= 1.0 or seeds_neg >= 2:
        return "DOES_NOT_GENERALISE"
    return "PARTIAL"


def compare(arm, base, per_case, per_seed, denom):
    a = sum(1 for r in per_case if r[arm])
    b0 = sum(1 for r in per_case if r[base])
    gain = 100.0 * (a - b0) / denom
    b = sum(1 for r in per_case if r[arm] and not r[base])
    c = sum(1 for r in per_case if r[base] and not r[arm])
    p = mcnemar_one_sided(b, c)
    diffs = [per_seed[s][arm] - per_seed[s][base] for s in sorted(per_seed)]
    nonneg = sum(1 for d in diffs if d >= 0)
    neg = sum(1 for d in diffs if d < 0)
    return {"arm": arm, "baseline": base, "armTop1": a, "baselineTop1": b0,
            "gainPp": round(gain, 4), "discordantArmOnly": b, "discordantBaselineOnly": c,
            "mcnemarOneSidedP": round(p, 6), "perSeedDifferences": diffs,
            "seedsNonNegative": nonneg, "seedsNegative": neg,
            "verdict": three_way(gain, p, nonneg, neg)}


def by_similarity(per_case, bins):
    """Seal A's secondary split: R vs C0 inside each similarity third. Descriptive, no verdict."""
    rows = {r["pdbId"]: r for r in per_case}
    out = {}
    for name, b in bins["bins"].items():
        ids = b["pdbIds"]
        a = sum(1 for p in ids if rows[p]["R"])
        c0 = sum(1 for p in ids if rows[p]["C0"])
        out[name] = {"cases": len(ids), "R": a, "C0": c0,
                     "VINA": sum(1 for p in ids if rows[p]["VINA"]), "C4": sum(1 for p in ids if rows[p]["C4"]),
                     "gainPpRvsC0": round(100.0 * (a - c0) / len(ids), 4) if ids else None}
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--gt-root", required=True)
    ap.add_argument("--root", required=True, help="working root: data/, work/, cases/ go here")
    ap.add_argument("--gnina", required=True)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--report-only", action="store_true")
    a = ap.parse_args(argv)

    seal, cases = load_seal_b()
    s = seal["seal"]
    if sha256_file(a.gnina) != s["gninaBinarySha256"]:
        sys.exit("REFUSING: gnina binary differs from seal B")
    selected = s["selectedRanker"]
    if selected == "NO_RANKER_SELECTED":
        sys.exit("REFUSING: phase D selected no ranker; seal A says the primary phase F is not run")
    denom = len(cases)
    data, work, res = (os.path.join(a.root, d) for d in ("data", "work", "cases"))
    for d in (data, work, res):
        os.makedirs(d, exist_ok=True)
    logf = open(os.path.join(a.root, "run9.log"), "a")

    def log(msg):
        line = "%s  %s" % (datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"), msg)
        print(line, flush=True)
        logf.write(line + "\n")
        logf.flush()

    r8 = patched_run8(a.gt_root)
    t0 = time.time()
    if not a.report_only:
        import concurrent.futures as cf
        log("run 9 starting: %d cases, seal B %s, ranker %s" % (denom, seal["sealFingerprintSha256"][:16], selected))
        jobs = [dict(c, ligand=c["ligandCcd"]) for c in cases]
        with cf.ThreadPoolExecutor(max_workers=max(1, a.jobs)) as ex:
            for fu in cf.as_completed([ex.submit(r8.run_one, c, a.gt_root, data, work, res, a.gnina, log)
                                       for c in jobs]):
                fu.result()

    for c in cases:
        if not os.path.exists(os.path.join(res, c["pdbId"] + ".json")):
            log("MISSING RESULT %s - not reporting a partial run" % c["pdbId"])
            return 1

    pd = _module(os.path.join(HERE, "run9-phase-d.py"), "phase_d_for_run9")
    feats = [pd.features_for_case(c["pdbId"], a.root) for c in cases]
    bad = [f["pdbId"] for f in feats if f.get("integrityProblems")]
    sel_name, sel_w = selected.split("(")[0], selected.split("(")[1].rstrip(")")
    sel_fn = {"C1": R.c1, "C2": R.c2, "C3": R.c3}[sel_name]
    rules = {"C0": R.c0, "VINA": R.vina, "R": lambda p: sel_fn(p, sel_w), "C4": R.c4}
    per_case, per_seed = [], {sd: {k: 0 for k in rules} for sd in ("42", "1042", "2042", "3042", "4042")}
    topk = {k: {"top%d" % n: 0 for n in TOP_K} for k in rules}
    ceiling = 0
    for f in feats:
        row = {"pdbId": f["pdbId"], "status": f["status"]}
        ok = f["status"] == "SCORED" and not f.get("integrityProblems")
        if ok:
            ceiling += int(any(q["rmsdA"] < SUCCESS_RMSD_A for q in f["poses"]))
        for k, fn in rules.items():
            order = fn(f["poses"]) if ok else []
            row[k] = bool(order) and order[0]["rmsdA"] < SUCCESS_RMSD_A
            for n in TOP_K:
                topk[k]["top%d" % n] += int(any(q["rmsdA"] < SUCCESS_RMSD_A for q in order[:n]))
            if ok:
                for sd in per_seed:
                    own = [q for q in f["poses"] if str(q["seed"]) == sd]
                    if own:
                        per_seed[sd][k] += int(fn(own)[0]["rmsdA"] < SUCCESS_RMSD_A)
        per_case.append(row)
    doc = {
        "kind": "RUN9_FINAL", "sealB": seal["sealFingerprintSha256"], "selectedRanker": selected,
        "denominator": denom, "integrityFailures": bad,
        "statusCounts": {st: sum(1 for f in feats if f["status"] == st) for st in sorted({f["status"] for f in feats})},
        "top1": {k: sum(1 for r in per_case if r[k]) for k in rules}, "topK": topk,
        "samplingCeiling": ceiling, "perSeedTop1": per_seed,
        "primary": compare("R", "C0", per_case, per_seed, denom),
        "secondaryC4": compare("C4", "VINA", per_case, per_seed, denom),
        "bySimilarityThird": by_similarity(per_case, json.load(open(os.path.join(ROOT, s["similarityBins"]["file"])))),
        "perCase": per_case,
        "wallClockSecondsThisProcess": round(time.time() - t0, 1),
    }
    with open(OUT_JSON, "w") as fh:
        json.dump(doc, fh, indent=1, sort_keys=True)
        fh.write("\n")
    log("PRIMARY %s %d vs C0 %d of %d: %s" % (selected, doc["primary"]["armTop1"], doc["primary"]["baselineTop1"],
                                              denom, doc["primary"]["verdict"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
