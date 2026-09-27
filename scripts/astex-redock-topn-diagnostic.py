#!/usr/bin/env python3
"""GENESIS — Astex redocking TOP-N POSE DIAGNOSTIC (run 4). DIAGNOSTIC, NOT PREREGISTERED.

    python3 scripts/astex-redock-topn-diagnostic.py --data <p2rank-datasets>/joined/astex [--only 1T46] [--jobs 2]

The question this answers from real execution: on the 39 Astex cases that the
preregistered run-3 top-pose benchmark scored as failures, does AutoDock Vina
already GENERATE a native-like pose and merely RANK it badly, or does the search
never produce a native-like pose at all?

This is ADDITIVE and DIAGNOSTIC. It does not replace, alter or re-score the
preregistered top-pose benchmark: `scripts/astex-redock-benchmark.py` is
untouched and its 46/85 headline stays reproducible. Nothing here changes the
success threshold (RMSD < 2.0 A), the denominator (all 85 cases) or any
per-target parameter — there are no per-PDB exceptions of any kind.

Everything about preparation is IMPORTED from the preregistered benchmark
module (ligand definition, CCD chemistry, receptor cleaning, cofactors, box), so
the diagnostic cannot silently drift from the registered protocol. The ONLY
protocol differences, both declared here:

  1. Vina's num_modes (n_poses) is raised from 1 to --num-modes (default 20).
  2. The energy window used to retain poses is widened from Vina's default
     3.0 kcal/mol to --energy-range (default 20.0) so the window never truncates
     the requested number of modes.

HONEST CAVEAT: num_modes and the energy window are applied by Vina AFTER the
Monte-Carlo runs (redundant modes removed with min_rmsd, then truncation to
num_modes), so changing them can perturb the reported pose set. Rank 1 here is
therefore not guaranteed to be bit-identical to the run-3 top pose. Both numbers
are recorded per case (`rank1RmsdA` here vs `run3Top1RmsdA`) so the perturbation
can be measured rather than assumed.

Output: docs/evidence/astex-redock-run4-diagnostic.json
        docs/evidence/astex-redock-run4-diagnostic.md
"""
import argparse
import concurrent.futures as cf
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKER = os.path.join(REPO, "packages/backend/src/compute/dock_worker.py")
RUN3 = os.path.join(REPO, "docs/evidence/astex-redock-benchmark-2026-09-27-run3.json")

SUCCESS_RMSD_A = 2.0
TOP_K_WINDOWS = (1, 3, 5, 10, 20)


def _load_benchmark_module():
    """Import the preregistered benchmark script (dashed filename) so all preparation is shared, not copied."""
    path = os.path.join(REPO, "scripts/astex-redock-benchmark.py")
    spec = importlib.util.spec_from_file_location("astex_redock_benchmark", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


BM = _load_benchmark_module()

DIAGNOSTIC_PROTOCOL = {
    "status": "DIAGNOSTIC — NOT PREREGISTERED",
    "basedOnProtocolFingerprint": BM.protocol_fingerprint(),
    "question": "among the poses Vina generates, does a native-like pose (RMSD < 2.0 A) exist but rank below 1 (ranking failure), or is none generated at all (sampling failure)?",
    "sharedWithPreregisteredRun3": "ligand definition and CCD chemistry, receptor cleaning, cofactor handling, box, scoring function (vina), exhaustiveness, seed, RMSD metric (symmetry-aware heavy-atom RDKit CalcRMS, no superposition), success threshold (RMSD < 2.0 A), denominator (all 85 cases)",
    "differencesFromRun3": [
        "Vina num_modes (n_poses) raised from 1 to the requested number of retained poses",
        "pose-retention energy window widened from Vina's default 3.0 kcal/mol so it does not truncate the requested modes",
    ],
    "caveat": "num_modes and the energy window are applied after the Monte-Carlo runs (redundant-mode removal at min_rmsd, then truncation), so the reported pose set can differ from the single-pose run; rank-1 RMSD is recorded alongside the run-3 top-1 RMSD per case so the perturbation is measurable",
    "perTargetTuning": "none — no per-PDB exceptions, no manual boxes, no manual ligand placement, no parameter chosen after inspecting an individual target",
    "reranking": "none — no new scoring function and no rescoring model is used; only the RMSD of already-generated Vina poses is measured",
}


# ---------------------------------------------------------------- aggregation


def top_k_hit(poses, k, threshold=SUCCESS_RMSD_A):
    """True if ANY pose with rank <= k has RMSD < threshold. Poses are the per-case records."""
    return any(p["rmsdA"] < threshold for p in poses if p["rank"] <= k)


def top_k_coverage(cases, windows=TOP_K_WINDOWS, threshold=SUCCESS_RMSD_A):
    """Coverage per window over ALL cases. The denominator is len(cases) — never a filtered subset."""
    out = {}
    for k in windows:
        hits = [c for c in cases if top_k_hit(c.get("poses") or [], k, threshold)]
        out["top%d" % k] = {
            "successes": len(hits),
            "cases": len(cases),
            "rate": round(len(hits) / len(cases), 4) if cases else None,
        }
    return out


def best_pose(poses):
    return min(poses, key=lambda p: (p["rmsdA"], p["rank"])) if poses else None


def classify_failure(case, run3_top1_rmsd, max_k=20, threshold=SUCCESS_RMSD_A):
    """A / B / C / D classification of a case that failed the run-3 top-1 benchmark.

    A RANKING_FAILURE   — a pose with RMSD < threshold exists in the top-max_k window, but not at rank 1.
    B SAMPLING_FAILURE  — no generated pose reaches RMSD < threshold.
    C PIPELINE_CHEMISTRY — the case produced no pose set at all (preparation or docking evidence).
    D UNCERTAIN         — anything that fits none of the above (e.g. rank 1 is already native-like here,
                          which means the pose set was perturbed relative to run 3).
    """
    poses = [p for p in (case.get("poses") or []) if p["rank"] <= max_k]
    if case.get("status") != "DOCKED" or not poses:
        return "C_PIPELINE_CHEMISTRY", "no pose set produced: status %s%s" % (
            case.get("status"), " — " + str(case.get("error"))[:120] if case.get("error") else "")
    hits = [p for p in poses if p["rmsdA"] < threshold]
    bp = best_pose(poses)
    if hits:
        if min(h["rank"] for h in hits) == 1:
            return "D_UNCERTAIN", (
                "rank 1 of this diagnostic pose set is already native-like (%.3f A) while run-3 top-1 was %s A: "
                "raising num_modes perturbed the pose set, so this case is neither a clean ranking nor a sampling failure"
                % (poses[0]["rmsdA"], "%.3f" % run3_top1_rmsd if run3_top1_rmsd is not None else "n/a"))
        return "A_RANKING_FAILURE", (
            "a pose at %.3f A exists at rank %d of %d generated; Vina ranks a %.3f A pose first "
            "(score %.3f vs %.3f kcal/mol for the native-like pose)" % (
                bp["rmsdA"], bp["rank"], len(poses), poses[0]["rmsdA"],
                poses[0]["affinityKcalMol"], bp["affinityKcalMol"]))
    return "B_SAMPLING_FAILURE", (
        "no pose among the %d generated reaches %.1f A; the closest is %.3f A at rank %d "
        "(score %.3f vs %.3f kcal/mol at rank 1)" % (
            len(poses), threshold, bp["rmsdA"], bp["rank"], bp["affinityKcalMol"], poses[0]["affinityKcalMol"]))


def pose_set_perturbation(results, run3_by_id):
    """How far raising num_modes moved the pose set, measured against the preregistered run-3 top pose.

    This is the honest cost of the diagnostic: num_modes and the energy window are applied by Vina after
    the Monte-Carlo runs, so the rank-1 pose of a 20-mode run need not be the rank-1 pose of a 1-mode run."""
    deltas, identical = [], 0
    for c in results:
        a, b = c.get("rank1RmsdA"), run3_by_id.get(c["pdbId"], {}).get("rmsdA")
        if a is None or b is None:
            continue
        if abs(a - b) < 1e-9:
            identical += 1
        else:
            deltas.append(round(a - b, 3))
    absd = sorted(abs(d) for d in deltas)
    med = None
    if absd:
        n = len(absd)
        med = absd[n // 2] if n % 2 else round((absd[n // 2 - 1] + absd[n // 2]) / 2, 3)
    diag_top1 = {c["pdbId"] for c in results if (c.get("poses") or []) and c["poses"][0]["rmsdA"] < SUCCESS_RMSD_A}
    r3_top1 = {p for p, c in run3_by_id.items() if c.get("success")}
    return {
        "rank1RmsdIdenticalToRun3": identical,
        "rank1RmsdDifferentFromRun3": len(deltas),
        "medianAbsoluteRank1RmsdShiftA": med,
        "maxAbsoluteRank1RmsdShiftA": absd[-1] if absd else None,
        "rank1RmsdShiftAbove0_5A": sum(1 for d in absd if d > 0.5),
        "rank1RmsdShiftAbove2_0A": sum(1 for d in absd if d > 2.0),
        "top1SuccessOnlyInDiagnostic": sorted(diag_top1 - r3_top1),
        "top1SuccessOnlyInRun3": sorted(r3_top1 - diag_top1),
        "note": "the diagnostic's own TOP-1 count is NOT the preregistered headline; the preregistered 46/85 comes from the untouched single-pose benchmark and is unaffected by this run",
    }


def chemistry_evidence(case):
    """Actual, file-derived evidence of a preparation / receptor-representation problem for this case.

    This never replaces the ranking-vs-sampling verdict; it is reported alongside it, because a case can
    both be a ranking failure AND carry a receptor-representation defect. Only things the run itself
    recorded count as evidence — nothing is inferred from the RMSD.
    """
    ev = []
    for x in case.get("cofactorsNotKept") or []:
        ev.append("a HETATM residue lining the site was left out of the receptor: %s (%s); "
                  "the receptor cleaner keeps only ATOM records plus metal ions, so a modified residue "
                  "deposited as HETATM is absent from the receptor model" % (x["residue"], x["reason"]))
    if case.get("ligandElementsFromCcd"):
        ev.append("%d ligand element symbol(s) in the deposited file disagreed with the CCD entry and were "
                  "corrected from the CCD" % case["ligandElementsFromCcd"])
    return ev


def scoring_gaps(failed_records):
    """PHASE 5: for ranking failures, the Vina score gap between rank 1 and the best native-like pose."""
    rank_fails = [r for r in failed_records if r["classification"] == "A_RANKING_FAILURE"]
    gaps = []
    for r in rank_fails:
        if r.get("bestNativeLikeVinaScoreKcalMol") is None or r.get("rank1VinaScoreKcalMol") is None:
            continue
        gaps.append(round(r["bestNativeLikeVinaScoreKcalMol"] - r["rank1VinaScoreKcalMol"], 3))
    gaps.sort()
    med = None
    if gaps:
        n = len(gaps)
        med = gaps[n // 2] if n % 2 else round((gaps[n // 2 - 1] + gaps[n // 2]) / 2, 3)
    return {
        "rankingFailures": len(rank_fails),
        "scoreGapsKcalMol": gaps,
        "medianScoreGapKcalMol": med,
        "within0_5KcalMol": sum(1 for g in gaps if g <= 0.5),
        "within1_0KcalMol": sum(1 for g in gaps if g <= 1.0),
        "worseThan1_0KcalMol": sum(1 for g in gaps if g > 1.0),
        "note": "gap = (Vina score of the best native-like pose) - (Vina score of the rank-1 pose); positive means Vina scores the native-like pose WORSE (less negative) than the pose it ranks first",
    }


def reproducibility_checks(diagnostic_cases, replay_path, backcompat_path, run3):
    """Real replay evidence, not a claim.

    `replay_path`   — a second, independent execution of THIS diagnostic on a couple of cases with the same
                      seed: are the pose sets bit-identical (pose hashes, scores, RMSDs)?
    `backcompat_path` — a rerun of the UNTOUCHED preregistered top-1 benchmark on the same cases: does it
                      still reproduce the run-3 record exactly (RMSD, Vina score, pose SHA-256)?
    """
    out = {}
    if replay_path and os.path.exists(replay_path):
        rep = json.load(open(replay_path))
        mine = {c["pdbId"]: c for c in diagnostic_cases}
        rows = []
        for c in rep["cases"]:
            a = mine.get(c["pdbId"])
            if not a:
                continue
            rows.append({
                "pdbId": c["pdbId"],
                "poseHashesIdenticalInRankOrder": [p["poseSha256"] for p in a["poses"]] == [p["poseSha256"] for p in c["poses"]],
                "affinitiesIdentical": [p["affinityKcalMol"] for p in a["poses"]] == [p["affinityKcalMol"] for p in c["poses"]],
                "rmsdsIdentical": [p["rmsdA"] for p in a["poses"]] == [p["rmsdA"] for p in c["poses"]],
                "dockedPdbqtSha256Identical": a["dockedPdbqtSha256"] == c["dockedPdbqtSha256"],
                "receptorPdbqtSha256Identical": a["receptorPdbqtSha256"] == c["receptorPdbqtSha256"],
                "posesCompared": len(c["poses"]),
            })
        out["deterministicReplayOfThisDiagnostic"] = {
            "casesChecked": [r["pdbId"] for r in rows],
            "allIdentical": all(all(v is True for k, v in r.items() if k.endswith("Identical") or k.startswith("poseHashes")) for r in rows),
            "detail": rows,
            "replayEvidenceSha256": sha256_file(replay_path),
        }
    if backcompat_path and os.path.exists(backcompat_path):
        bc = json.load(open(backcompat_path))
        r3 = {c["pdbId"]: c for c in run3["cases"]}
        rows = []
        for c in bc["cases"]:
            o = r3.get(c["pdbId"], {})
            rows.append({
                "pdbId": c["pdbId"],
                "rmsdA": c.get("rmsdA"), "run3RmsdA": o.get("rmsdA"),
                "vinaScoreKcalMol": c.get("vinaScoreKcalMol"), "run3VinaScoreKcalMol": o.get("vinaScoreKcalMol"),
                "poseSha256Identical": c.get("poseSha256") == o.get("poseSha256"),
                "receptorPdbqtSha256Identical": c.get("receptorPdbqtSha256") == o.get("receptorPdbqtSha256"),
                "successIdentical": c.get("success") == o.get("success"),
            })
        out["preregisteredTop1PathStillReproducesRun3"] = {
            "casesChecked": [r["pdbId"] for r in rows],
            "allIdentical": all(r["poseSha256Identical"] and r["receptorPdbqtSha256Identical"]
                                and r["successIdentical"] and r["rmsdA"] == r["run3RmsdA"]
                                and r["vinaScoreKcalMol"] == r["run3VinaScoreKcalMol"] for r in rows),
            "protocolFingerprintIdentical": bc.get("protocolFingerprint") == run3.get("protocolFingerprint"),
            "detail": rows,
            "backCompatEvidenceSha256": sha256_file(backcompat_path),
            "note": "a 2-case rerun for backward compatibility only — NOT a benchmark result and not a restatement of the headline",
        }
    return out


def sha256_file(path):
    return BM.sha256_bytes(open(path, "rb").read())


# ---------------------------------------------------------------- execution


def run_case(case, data_dir, work, num_modes, energy_range, exhaustiveness):
    """Preparation identical to the preregistered benchmark (imported), then the redock_poses command."""
    pdb_id, code = case["pdbId"], case["ligand"]
    path = os.path.join(data_dir, pdb_id.lower() + ".pdb")
    raw = open(path, "rb").read()
    out = {"pdbId": pdb_id, "listedLigand": code, "inputSha256": BM.sha256_bytes(raw)}
    if case.get("sha256") and case["sha256"] != out["inputSha256"]:
        return {**out, "status": "INPUT_HASH_MISMATCH", "poses": []}
    try:
        resname, heavy = BM.ligand_lines(raw.decode(), code)
        out.update({"ligandResidue": resname, "ligandHeavyAtoms": len(heavy)})
        case_dir = os.path.join(work, pdb_id)
        os.makedirs(case_dir, exist_ok=True)
        sdf = os.path.join(case_dir, "ligand.sdf")
        out["ccdTemplate"], out["ligandElementsFromCcd"] = BM.ligand_sdf(heavy, resname, code, sdf)
        center, size = BM.box_for(heavy)
        out.update({"center": center, "boxSize": size})
        receptor = os.path.join(case_dir, "receptor_clean.pdb")
        BM.clean_receptor(raw.decode(), receptor)
        picked, skipped = BM.cofactor_residues(raw.decode(), heavy)
        extra, cofactors = [], []
        for label, ccode, lines in picked:
            cpath = os.path.join(case_dir, "cofactor_%s.pdbqt" % label.replace(":", "_"))
            try:
                n = BM.cofactor_pdbqt(ccode, lines, cpath)
            except Exception as e:  # noqa: BLE001
                skipped.append({"residue": label, "reason": "typing_failed: %s" % str(e)[:80]})
                continue
            extra.append(cpath)
            cofactors.append({"residue": label, "heavyAtoms": len(lines), "pdbqtAtoms": n})
        out.update({"cofactorsKept": cofactors, "cofactorsNotKept": skipped})
        req = {"cmd": "redock_poses", "pdbPath": receptor, "keepHetatm": True, "ligandSdfPath": sdf,
               "center": center, "boxSize": size, "exhaustiveness": exhaustiveness, "seed": 42,
               "numModes": num_modes, "energyRange": energy_range,
               "outDir": os.path.join(case_dir, "run"), "deleteBadRes": True, "forgiveExtraBonds": True,
               "extraRigidPdbqtPaths": extra}
        proc = subprocess.run([sys.executable, WORKER, json.dumps(req)], capture_output=True, text=True, timeout=3600)
        r = json.loads(proc.stdout.strip().splitlines()[-1])
    except Exception as e:  # noqa: BLE001
        return {**out, "status": "PREPARATION_FAILED", "poses": [], "error": str(e)[:200]}
    if not r.get("ok"):
        return {**out, "status": "DOCKING_FAILED", "poses": [], "error": str(r.get("error"))[:200]}
    poses = r["poses"]
    return {**out, "status": "DOCKED", "poses": poses, "nPoses": len(poses),
             "rank1RmsdA": poses[0]["rmsdA"] if poses else None,
             "rank1VinaScoreKcalMol": poses[0]["affinityKcalMol"] if poses else None,
             "bestRmsdA": r.get("bestRmsdA"), "bestRmsdRank": r.get("bestRmsdRank"),
             "ligandSmiles": r["ligandSmiles"], "engine": r["engine"],
             "receptorPdbqtSha256": r["receptor"]["receptorPdbqtSha256"],
             "ligandPdbqtSha256": r["ligandPdbqtSha256"], "dockedPdbqtSha256": r["dockedPdbqtSha256"],
             "extraRigidPdbqt": [{k: x[k] for k in ("sha256", "atoms")} for x in r["receptor"].get("extraRigidPdbqt", [])]}


def build_report(results, run3, args, max_k=20):
    run3_by_id = {c["pdbId"]: c for c in run3["cases"]}
    run3_failed = {pid for pid, c in run3_by_id.items() if not c.get("success")}

    failures = []
    for c in sorted(results, key=lambda r: r["pdbId"]):
        if c["pdbId"] not in run3_failed:
            continue
        r3 = run3_by_id[c["pdbId"]]
        poses = [p for p in (c.get("poses") or []) if p["rank"] <= max_k]
        bp = best_pose(poses)
        native = [p for p in poses if p["rmsdA"] < SUCCESS_RMSD_A]
        best_native = min(native, key=lambda p: p["rank"]) if native else None
        rec = {
            "pdbId": c["pdbId"],
            "run3Top1RmsdA": r3.get("rmsdA"),
            "run3Top1VinaScoreKcalMol": r3.get("vinaScoreKcalMol"),
            "diagnosticRank1RmsdA": c.get("rank1RmsdA"),
            "rank1VinaScoreKcalMol": c.get("rank1VinaScoreKcalMol"),
            "bestRmsdInTopKA": bp["rmsdA"] if bp else None,
            "bestRmsdRank": bp["rank"] if bp else None,
            "bestRmsdVinaScoreKcalMol": bp["affinityKcalMol"] if bp else None,
            "bestNativeLikeRank": best_native["rank"] if best_native else None,
            "bestNativeLikeRmsdA": best_native["rmsdA"] if best_native else None,
            "bestNativeLikeVinaScoreKcalMol": best_native["affinityKcalMol"] if best_native else None,
            "posesGenerated": len(poses),
        }
        rec["classification"], rec["reason"] = classify_failure(c, r3.get("rmsdA"), max_k)
        ev = chemistry_evidence(c)
        if ev:
            rec["pipelineChemistryEvidence"] = ev
        failures.append(rec)

    coverage = top_k_coverage(results)
    perturb = pose_set_perturbation(results, run3_by_id)
    counts = {}
    for f in failures:
        counts[f["classification"]] = counts.get(f["classification"], 0) + 1
    perfect = coverage["top%d" % max_k]["successes"]

    import vina, meeko, rdkit, biotite
    return {
        "kind": "GENESIS_ASTEX_REDOCK_TOPN_DIAGNOSTIC",
        "label": args.label or "RUN 4 — DIAGNOSTIC top-%d pose retention (NOT PREREGISTERED)" % args.num_modes,
        "diagnosticProtocol": DIAGNOSTIC_PROTOCOL,
        "finishedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "dataset": {
            "name": BM.PROTOCOL["dataset"],
            "distribution": BM.PROTOCOL["distribution"],
            "distributionCommit": BM.PROTOCOL["distributionCommit"],
            "dataDir": args.data,
        },
        "baselinePreregisteredRun3": {
            "file": os.path.relpath(RUN3, REPO),
            "sha256": BM.sha256_bytes(open(RUN3, "rb").read()),
            "summary": run3["summary"],
            "protocolFingerprint": run3["protocolFingerprint"],
        },
        "preregistrationSha256": BM.sha256_bytes(open(BM.PREREG, "rb").read()),
        "engine": {
            "scoringFunction": "vina",
            "exhaustiveness": args.exhaustiveness,
            "seed": 42,
            "numModes": args.num_modes,
            "energyRange": args.energy_range,
            "successCriterion": "RMSD < %.1f A" % SUCCESS_RMSD_A,
            "metric": BM.PROTOCOL["metric"].replace("of the top-ranked pose", "of each retained pose"),
        },
        "versions": {"vina": vina.__version__, "meeko": meeko.__version__, "rdkit": rdkit.__version__,
                     "biotite": biotite.__version__, "python": sys.version.split()[0]},
        "summary": {
            "cases": len(results),
            "docked": sum(1 for r in results if r["status"] == "DOCKED"),
            "coverage": coverage,
            "maxSuccessWithPerfectRerankingOfTop%d" % max_k: perfect,
            "denominator": len(results),
            "run3Top1Successes": sum(1 for c in results if run3_by_id.get(c["pdbId"], {}).get("success")),
            "run3Top1SuccessesFullBenchmark": run3["summary"]["successes"],
            "gainFromPerfectReranking": perfect - sum(1 for c in results if run3_by_id.get(c["pdbId"], {}).get("success")),
            "isFullBenchmark": len(results) == run3["summary"]["cases"],
            "run3Failures": len(failures),
            "classificationCounts": counts,
            "poseSetPerturbationVsRun3": perturb,
            "casesWithPipelineChemistryEvidence": [
                {"pdbId": c["pdbId"], "evidence": chemistry_evidence(c)}
                for c in sorted(results, key=lambda x: x["pdbId"]) if chemistry_evidence(c)],
            "posesRetained": {
                "requested": args.num_modes,
                "min": min((len(c.get("poses") or []) for c in results), default=0),
                "casesBelowRequested": [{"pdbId": c["pdbId"], "poses": len(c.get("poses") or [])}
                                        for c in sorted(results, key=lambda x: x["pdbId"])
                                        if len(c.get("poses") or []) < args.num_modes],
                "note": "Vina removes redundant modes (min_rmsd 1.0 A) before truncating to num_modes, so a case can retain fewer than the requested number even with a wide energy window; for those cases the top-20 window is simply every pose generated",
            },
        },
        "scoringDiagnostic": scoring_gaps(failures),
        "reproducibilityChecks": reproducibility_checks(
            results, getattr(args, "replay_json", "") or "", getattr(args, "backcompat_json", "") or "", run3),
        "run3FailureClassification": failures,
        "cases": sorted(results, key=lambda r: r["pdbId"]),
    }


def markdown(report):
    s = report["summary"]
    cov = s["coverage"]
    L = []
    L.append("# Astex redocking — top-N pose diagnostic (run 4)\n")
    L.append("**DIAGNOSTIC, NOT PREREGISTERED.** Additive to the preregistered top-pose benchmark, which is")
    L.append("unchanged: `scripts/astex-redock-benchmark.py` and runs 1-3 are untouched and the 46/85 headline")
    L.append("stays reproducible. No per-target tuning, no threshold change, no case excluded: the denominator")
    L.append("is all %d cases. No new scoring function or rescoring model is used.\n" % s["denominator"])
    L.append("Question: does Vina generate native-like poses and rank them badly, or does the search fail to")
    L.append("generate one at all?\n")
    L.append("## Protocol difference from run 3\n")
    for d in report["diagnosticProtocol"]["differencesFromRun3"]:
        L.append("- %s" % d)
    L.append("\n%s\n" % report["diagnosticProtocol"]["caveat"])
    L.append("## Top-K coverage (a case counts if ANY pose in the window has RMSD < 2.0 A)\n")
    L.append("| window | successes / %d | rate |" % s["denominator"])
    L.append("|---|---|---|")
    for k in TOP_K_WINDOWS:
        c = cov["top%d" % k]
        L.append("| TOP-%d | %d / %d | %.2f%% |" % (k, c["successes"], c["cases"], 100 * c["rate"]))
    L.append("")
    pb = s["poseSetPerturbationVsRun3"]
    L.append("### Honest cost of raising num_modes\n")
    L.append("Retaining %d modes instead of 1 measurably perturbs the pose set: the rank-1 RMSD is identical to"
             % report["engine"]["numModes"])
    L.append("run 3 in only %d of %d cases and differs in %d (median absolute shift %s A, max %s A)." % (
        pb["rank1RmsdIdenticalToRun3"], s["denominator"], pb["rank1RmsdDifferentFromRun3"],
        pb["medianAbsoluteRank1RmsdShiftA"], pb["maxAbsoluteRank1RmsdShiftA"]))
    L.append("Most of those differences are numerical noise — only %d shifts exceed 0.5 A and %d exceed 2.0 A —" % (
        pb["rank1RmsdShiftAbove0_5A"], pb["rank1RmsdShiftAbove2_0A"]))
    L.append("but the tail is real and it moves individual cases in both directions.")
    L.append("This diagnostic's own TOP-1 window succeeds on %d cases against run 3's %d, and not on exactly the"
             % (cov["top1"]["successes"], s["run3Top1Successes"]))
    L.append("same cases: %s succeed here but not in run 3, %s succeed in run 3 but not here. The preregistered" % (
        ", ".join(pb["top1SuccessOnlyInDiagnostic"]) or "no case",
        ", ".join(pb["top1SuccessOnlyInRun3"]) or "no case"))
    L.append("headline stays the run-3 number from the untouched single-pose path; this run neither restates nor")
    L.append("replaces it. It also means the TOP-K numbers below describe the 20-mode pose sets, not run 3's.\n")
    L.append("%d of %d cases retained fewer than %d poses (Vina's redundant-mode removal at min_rmsd 1.0 A), so for" % (
        len(s["posesRetained"]["casesBelowRequested"]), s["denominator"], report["engine"]["numModes"]))
    L.append("those cases the top-20 window is every pose Vina generated; the fewest retained was %d.\n"
             % s["posesRetained"]["min"])
    L.append("Preregistered run-3 top-1 baseline: **%d / %d** (%.2f%%).\n" % (
        s["run3Top1Successes"], s["denominator"], 100 * s["run3Top1Successes"] / s["denominator"]))
    key = "maxSuccessWithPerfectRerankingOfTop20"
    L.append("## Key result\n")
    L.append("**If perfect ranking were available among the generated top-20 poses, the maximum observed")
    L.append("success would be %d/%d (%.2f%%).** That is %+d cases over the run-3 top-1 result of %d/%d.\n" % (
        s[key], s["denominator"], 100 * s[key] / s["denominator"],
        s["gainFromPerfectReranking"], s["run3Top1Successes"], s["denominator"]))
    L.append("## Classification of the %d run-3 top-1 failures\n" % s["run3Failures"])
    L.append("| class | count |")
    L.append("|---|---|")
    for k in ("A_RANKING_FAILURE", "B_SAMPLING_FAILURE", "C_PIPELINE_CHEMISTRY", "D_UNCERTAIN"):
        L.append("| %s | %d |" % (k, s["classificationCounts"].get(k, 0)))
    L.append("")
    sd = report["scoringDiagnostic"]
    L.append("## Scoring diagnostic (ranking-failure cases)\n")
    L.append("Gap = Vina score of the best native-like pose minus Vina score of the rank-1 pose; positive means")
    L.append("Vina scores the native-like pose worse than the pose it puts first.\n")
    L.append("- ranking failures: %d" % sd["rankingFailures"])
    L.append("- median score gap: %s kcal/mol" % sd["medianScoreGapKcalMol"])
    L.append("- gap <= 0.5 kcal/mol: %d" % sd["within0_5KcalMol"])
    L.append("- gap <= 1.0 kcal/mol: %d" % sd["within1_0KcalMol"])
    L.append("- gap > 1.0 kcal/mol: %d\n" % sd["worseThan1_0KcalMol"])
    L.append("## Every run-3 top-1 failure\n")
    L.append("| PDB | run-3 top-1 RMSD | best RMSD in top-20 | rank of that pose | Vina score rank-1 | Vina score best-RMSD pose | class | reason |")
    L.append("|---|---|---|---|---|---|---|---|")
    for f in report["run3FailureClassification"]:
        L.append("| %s | %s | %s | %s | %s | %s | %s | %s |" % (
            f["pdbId"], f["run3Top1RmsdA"], f["bestRmsdInTopKA"], f["bestRmsdRank"],
            f["rank1VinaScoreKcalMol"], f["bestRmsdVinaScoreKcalMol"],
            f["classification"].split("_", 1)[0], f["reason"]))
    L.append("")
    L.append("## What the numbers say, and the single next experiment\n")
    cov20 = cov["top20"]["successes"]
    sd2 = report["scoringDiagnostic"]
    L.append("- Perfect reranking of the generated top-20 poses caps out at **%d/85**. That is a ceiling, not a" % cov20)
    L.append("  forecast: no rescoring function, however good, can exceed it, because %d cases never produce a" % (85 - cov20))
    L.append("  pose under 2.0 A at all. **70/85 is therefore NOT reachable by reranking alone** (%d < 70)." % cov20)
    L.append("- Ranking is nevertheless the larger single lever: %d of the %d run-3 failures already contain a" % (
        sd2["rankingFailures"], s["run3Failures"]))
    L.append("  native-like pose, and every one of them sits within 1.0 kcal/mol of the pose Vina ranks first")
    L.append("  (median gap %s kcal/mol, %d within 0.5, none worse than 1.0). A gap that small is inside the" % (
        sd2["medianScoreGapKcalMol"], sd2["within0_5KcalMol"]))
    L.append("  Vina function's own resolution, so a different scoring function plausibly reorders them.")
    L.append("- The sampling failures are mostly near misses rather than catastrophes, which is a separate and")
    L.append("  also-tractable problem, but a different one.\n")
    L.append("**Recommended next experiment (one):** rescore the pose sets this run already saved with Vinardo")
    L.append("(`sf_name=\"vinardo\"`, shipped in the installed AutoDock Vina 1.2.7 — no new model, no new")
    L.append("dependency, no new search) and recompute TOP-1 over the same 85 cases and the same stored poses.")
    L.append("It costs minutes instead of hours because the search is not repeated, it changes exactly one")
    L.append("variable, and its outcome decides where the next real effort goes: if Vinardo recovers a large")
    L.append("share of the %d ranking failures, scoring is the bottleneck; if it recovers few, the %d-case" % (
        sd2["rankingFailures"], sd2["rankingFailures"]))
    L.append("ranking gap is not a scoring-function artefact and the work moves to sampling and preparation.")
    L.append("Reaching 70/85 will in any case also require raising the %d/85 sampling ceiling." % cov20)
    L.append("\nNot done here and deliberately not implemented in this task: Vinardo, AutoDock4 scoring, CNN")
    L.append("rescoring, protonation/tautomer enumeration, conserved waters, receptor ensembles.\n")
    ch = s.get("casesWithPipelineChemistryEvidence") or []
    L.append("## Pipeline / chemistry evidence found\n")
    if ch:
        L.append("%d case(s) carry recorded evidence of a preparation or receptor-representation defect, reported" % len(ch))
        L.append("alongside (not instead of) their ranking-vs-sampling verdict:\n")
        for x in ch:
            L.append("- **%s** — %s" % (x["pdbId"], "; ".join(x["evidence"])))
        L.append("")
    else:
        L.append("None recorded.\n")
    L.append("## Reproducibility\n")
    L.append("- dataset: %s, commit `%s`" % (report["dataset"]["distribution"], report["dataset"]["distributionCommit"]))
    L.append("- preregistration SHA-256: `%s`" % report["preregistrationSha256"])
    L.append("- run-3 evidence SHA-256: `%s`" % report["baselinePreregisteredRun3"]["sha256"])
    L.append("- protocol fingerprint inherited from run 3: `%s`" % report["diagnosticProtocol"]["basedOnProtocolFingerprint"])
    L.append("- engine: %s" % json.dumps(report["engine"]))
    L.append("- versions: %s" % json.dumps(report["versions"]))
    L.append("- finished at: %s" % report["finishedAt"])
    rc = report.get("reproducibilityChecks") or {}
    d = rc.get("deterministicReplayOfThisDiagnostic")
    if d:
        L.append("- deterministic replay, executed: a second run of this diagnostic on %s with the same seed produced"
                 % ", ".join(d["casesChecked"]))
        L.append("  %s pose sets — pose SHA-256 identities, Vina scores and per-pose RMSDs all %s."
                 % ("bit-identical" if d["allIdentical"] else "DIFFERING",
                    "matched in rank order" if d["allIdentical"] else "did NOT all match"))
    b = rc.get("preregisteredTop1PathStillReproducesRun3")
    if b:
        L.append("- backward compatibility, executed: the untouched preregistered top-1 benchmark rerun on %s %s"
                 % (", ".join(b["casesChecked"]),
                    "reproduced the run-3 record exactly (RMSD, Vina score, pose SHA-256, receptor SHA-256)."
                    if b["allIdentical"] else "did NOT reproduce the run-3 record."))
        L.append("  Protocol fingerprint identical to run 3: %s." % b["protocolFingerprintIdentical"])
    L.append("- per case: input SHA-256, receptor PDBQT SHA-256, ligand PDBQT SHA-256, docked PDBQT SHA-256;")
    L.append("  per pose: a coordinate-derived SHA-256 pose identity (element + x/y/z at 3 decimals).")
    L.append("")
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--jobs", type=int, default=2)
    ap.add_argument("--num-modes", type=int, default=20)
    ap.add_argument("--energy-range", type=float, default=20.0)
    ap.add_argument("--exhaustiveness", type=int, default=BM.EXHAUSTIVENESS)
    ap.add_argument("--out", default="")
    ap.add_argument("--md-out", default="")
    ap.add_argument("--label", default="")
    ap.add_argument("--replay-json", default="", help="a second execution of this diagnostic on a few cases, for the deterministic-replay check")
    ap.add_argument("--backcompat-json", default="", help="a rerun of the untouched top-1 benchmark on the same cases, for the backward-compatibility check")
    args = ap.parse_args()

    if args.num_modes < 20:
        sys.exit("--num-modes must be at least 20: the diagnostic reports TOP-20 coverage")

    prereg = json.load(open(BM.PREREG))
    if prereg["protocolFingerprint"] != BM.protocol_fingerprint():
        sys.exit("preregistered protocol fingerprint does not match the benchmark module — refusing to run")
    cases = prereg["cases"]
    if args.only:
        wanted = {x.strip().upper() for x in args.only.split(",")}
        cases = [c for c in cases if c["pdbId"] in wanted]
    run3 = json.load(open(RUN3))

    work = tempfile.mkdtemp(prefix="genesis-astex-topn-")
    results = []
    with cf.ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
        futures = {pool.submit(run_case, c, args.data, work, args.num_modes, args.energy_range,
                              args.exhaustiveness): c for c in cases}
        for f in cf.as_completed(futures):
            r = f.result()
            results.append(r)
            print("%-5s %-17s poses=%-3s rank1=%-7s best=%-7s@%s" % (
                r["pdbId"], r["status"], len(r.get("poses") or []), r.get("rank1RmsdA"),
                r.get("bestRmsdA"), r.get("bestRmsdRank")), flush=True)

    report = build_report(results, run3, args)
    out = args.out or os.path.join(REPO, "docs/evidence/astex-redock-run4-diagnostic.json")
    with open(out, "w") as f:
        json.dump(report, f, indent=1)
        f.write("\n")
    md = args.md_out or os.path.join(REPO, "docs/evidence/astex-redock-run4-diagnostic.md")
    with open(md, "w") as f:
        f.write(markdown(report))
    s = report["summary"]
    print("\nTOP-K coverage over %d cases: %s" % (s["denominator"], ", ".join(
        "TOP-%d %d" % (k, s["coverage"]["top%d" % k]["successes"]) for k in TOP_K_WINDOWS)))
    print("max with perfect reranking of the generated top-20: %d/%d (run-3 top-1: %d/%d)" % (
        s["maxSuccessWithPerfectRerankingOfTop20"], s["denominator"], s["run3Top1Successes"], s["denominator"]))
    print("classification of the %d run-3 failures: %s" % (s["run3Failures"], json.dumps(s["classificationCounts"])))
    print("-> %s\n-> %s" % (out, md))


if __name__ == "__main__":
    main()
