#!/usr/bin/env python3
"""GENESIS - Astex run 5: VINARDO RESCORING of the stored run-4 top-20 pose sets.

    python3 scripts/astex-vinardo-rescore.py [--poses /tmp/genesis-astex-topn-9wvus3jl] [--only 1G9V,1T46]

This script does NOT dock. It does NOT minimise. It loads the pose sets AutoDock
Vina already wrote in run 4, re-scores every stored pose with the Vinardo scoring
function AT ITS STORED COORDINATES, re-ranks, and reports whether a native-like
pose (RMSD < 2.0 A) now comes first.

The protocol is frozen in docs/evidence/astex-vinardo-rescoring-prereg.json and
fingerprinted. This script recomputes the fingerprint from the `protocol` object
and REFUSES TO RUN if it differs. The prereg is never written by this script.

Guarantees enforced in code, not by convention:
  * integrity gate: sha256 of the stored docked.pdbqt and of the EFFECTIVE
    receptor pdbqt (receptor_with_extra.pdbqt when run 4 recorded extra rigid
    atoms, receptor.pdbqt otherwise) must equal run 4's recorded values. A case
    that fails or is missing is reported UNAVAILABLE. It is NOT re-docked and it
    is NOT removed from the denominator, which is always 85.
  * Vina.optimize() / Vina.dock() are never called anywhere in this file.
  * the RMSD code path is the run-4 one, imported from the dock worker module
    (pose_models / pose_identity) and using the identical Meeko -> RDKit ->
    rdMolAlign.CalcRMS sequence; each recomputed RMSD is asserted equal to run
    4's recorded value to 3 decimals and each pose sha256 must match.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import sys
import tempfile
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PREREG = os.path.join(ROOT, "docs/evidence/astex-vinardo-rescoring-prereg.json")
RUN4 = os.path.join(ROOT, "docs/evidence/astex-redock-run4-diagnostic.json")
WORKER = os.path.join(ROOT, "packages/backend/src/compute/dock_worker.py")
OUT_JSON = os.path.join(ROOT, "docs/evidence/astex-vinardo-rescore.json")
OUT_MD = os.path.join(ROOT, "docs/evidence/astex-vinardo-rescore.md")
DEFAULT_POSES = "/tmp/genesis-astex-topn-9wvus3jl"

SUCCESS_RMSD_A = 2.0
DENOMINATOR = 85
RUN4_VINA_TOP1 = 46
RMSD_TOLERANCE = 0.0005  # equality to 3 decimals


# ------------------------------------------------------------------ protocol gate


def protocol_fingerprint(protocol: dict) -> str:
    return hashlib.sha256(json.dumps(protocol, sort_keys=True).encode()).hexdigest()


def load_prereg(path: str = PREREG) -> dict:
    """Load the frozen prereg and REFUSE to continue if the protocol has drifted."""
    with open(path) as f:
        prereg = json.load(f)
    declared = prereg["protocolFingerprintSha256"]
    actual = protocol_fingerprint(prereg["protocol"])
    if actual != declared:
        raise SystemExit(
            "REFUSING TO RUN: protocol fingerprint drift.\n"
            "  declared: %s\n  recomputed: %s\n"
            "The preregistered protocol has been modified. This script will not "
            "run against an amended protocol." % (declared, actual)
        )
    return prereg


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def sha256_file(path: str) -> str:
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


# ------------------------------------------------------------------ integrity gate


def effective_receptor_path(case_dir: str, case: dict) -> str:
    """The receptor file Vina actually saw in run 4: the combined one when run 4
    recorded extra rigid atoms (same semantics as _with_extra_rigid in the dock
    worker), otherwise the plain Meeko receptor."""
    if case.get("extraRigidPdbqt"):
        return os.path.join(case_dir, "run/receptor/receptor_with_extra.pdbqt")
    return os.path.join(case_dir, "run/receptor/receptor.pdbqt")


def integrity_gate(case: dict, case_dir: str, hasher=sha256_file) -> dict:
    """Return {'ok': True, ...} or {'ok': False, 'reason': ...}. Never re-docks."""
    docked = os.path.join(case_dir, "run/dock/docked.pdbqt")
    receptor = effective_receptor_path(case_dir, case)
    sdf = os.path.join(case_dir, "ligand.sdf")
    for label, path in (("docked.pdbqt", docked), ("receptor.pdbqt", receptor), ("ligand.sdf", sdf)):
        if not os.path.exists(path):
            return {"ok": False, "reason": "missing_%s" % label, "path": path}
    got_docked = hasher(docked)
    if got_docked != case["dockedPdbqtSha256"]:
        return {"ok": False, "reason": "docked_pdbqt_sha256_mismatch",
                "expected": case["dockedPdbqtSha256"], "got": got_docked}
    got_rec = hasher(receptor)
    if got_rec != case["receptorPdbqtSha256"]:
        return {"ok": False, "reason": "receptor_pdbqt_sha256_mismatch",
                "expected": case["receptorPdbqtSha256"], "got": got_rec}
    return {"ok": True, "dockedPdbqtSha256": got_docked, "receptorPdbqtSha256": got_rec,
            "dockedPath": docked, "receptorPath": receptor, "ligandSdfPath": sdf}


# ------------------------------------------------------------------ ranking / outcomes


def rerank(poses):
    """Sort poses by Vinardo total score ascending, ties broken by original Vina rank ascending.

    `poses` is a list of dicts with keys 'rank' (original Vina rank) and
    'vinardoScoreKcalMol'. Returns a new list with 'vinardoRank' assigned.
    """
    ordered = sorted(poses, key=lambda p: (p["vinardoScoreKcalMol"], p["rank"]))
    return [{**p, "vinardoRank": i + 1} for i, p in enumerate(ordered)]


def outcome(vina_ok: bool, vinardo_ok: bool) -> str:
    if vina_ok and vinardo_ok:
        return "UNCHANGED_SUCCESS"
    if vina_ok and not vinardo_ok:
        return "LOST"
    if vinardo_ok:
        return "RECOVERED"
    return "STILL_FAILING"


def is_native_like(rmsd, threshold: float = SUCCESS_RMSD_A) -> bool:
    return rmsd is not None and rmsd < threshold


# ------------------------------------------------------------------ scoring


def _load_worker_module():
    spec = importlib.util.spec_from_file_location("dock_worker_for_rescore", WORKER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def score_case(case: dict, gate: dict, scratch: str, worker=None):
    """Score every stored pose of one case with Vinardo at its stored coordinates.

    NOTHING in this function docks, optimises or moves an atom. Vina is used only
    for set_receptor / compute_vina_maps / set_ligand_from_file / score().
    """
    from rdkit import Chem
    from rdkit.Chem import rdMolAlign
    from vina import Vina
    from meeko import PDBQTMolecule, RDKitMolCreate

    dw = worker or _load_worker_module()
    docked_text = open(gate["dockedPath"]).read()
    models = dw.pose_models(docked_text)

    xtal = Chem.MolFromMolFile(gate["ligandSdfPath"], removeHs=False)
    if xtal is None:
        raise ValueError("ligand_sdf_unreadable")
    ref = Chem.RemoveHs(xtal)

    # identical run-4 code path: parse the whole multi-model file once, then split conformers
    pm = PDBQTMolecule(docked_text, skip_typing=True)
    mol = Chem.RemoveHs(RDKitMolCreate.from_pdbqt_mol(pm)[0])
    confs = list(mol.GetConformers())
    if len(confs) != len(models):
        raise ValueError("pose_count_mismatch: %d conformers vs %d models" % (len(confs), len(models)))
    recorded = case["poses"]
    if len(recorded) != len(models):
        raise ValueError("pose_count_vs_run4_mismatch: %d models vs %d recorded" % (len(models), len(recorded)))

    v = Vina(sf_name="vinardo", verbosity=0)
    v.set_receptor(gate["receptorPath"])
    v.compute_vina_maps(center=case["center"], box_size=case["boxSize"])

    poses, checks = [], []
    for i, conf in enumerate(confs):
        single = Chem.Mol(mol)
        single.RemoveAllConformers()
        single.AddConformer(Chem.Conformer(conf), assignId=True)
        rmsd = round(float(rdMolAlign.CalcRMS(single, ref)), 3)
        pose_sha = dw.pose_identity(models[i])
        rec = recorded[i]
        rmsd_ok = abs(rmsd - rec["rmsdA"]) <= RMSD_TOLERANCE
        sha_ok = pose_sha == rec["poseSha256"]
        if not rmsd_ok:
            checks.append({"check": "rmsd_matches_run4", "rank": i + 1, "ok": False,
                           "recomputed": rmsd, "run4": rec["rmsdA"]})
        if not sha_ok:
            checks.append({"check": "pose_sha256_matches_run4", "rank": i + 1, "ok": False,
                           "recomputed": pose_sha, "run4": rec["poseSha256"]})
        pose_path = os.path.join(scratch, "pose_%s_%02d.pdbqt" % (case["pdbId"], i + 1))
        with open(pose_path, "w") as f:
            f.write(models[i])
        v.set_ligand_from_file(pose_path)
        total = float(v.score()[0])
        os.unlink(pose_path)
        poses.append({"rank": i + 1, "affinityKcalMol": rec["affinityKcalMol"],
                      "vinardoScoreKcalMol": round(total, 3), "vinardoScoreRaw": repr(total),
                      "rmsdA": rmsd, "poseSha256": pose_sha,
                      "rmsdMatchesRun4": rmsd_ok, "poseSha256MatchesRun4": sha_ok})
    return rerank(poses), checks


# ------------------------------------------------------------------ per-case driver


def run_case(case: dict, poses_root: str, scratch: str, worker=None) -> dict:
    pdb_id = case["pdbId"]
    case_dir = os.path.join(poses_root, pdb_id)
    out = {"pdbId": pdb_id, "center": case["center"], "boxSize": case["boxSize"],
           "extraRigidPdbqt": case.get("extraRigidPdbqt", []),
           "vinaRank1RmsdA": case["rank1RmsdA"],
           "vinaRank1ScoreKcalMol": case["rank1VinaScoreKcalMol"],
           "run4BestRmsdA": case.get("bestRmsdA"), "run4BestRmsdRank": case.get("bestRmsdRank"),
           "nPosesRun4": case.get("nPoses")}
    gate = integrity_gate(case, case_dir)
    out["integrityGate"] = gate
    if not gate["ok"]:
        return {**out, "status": "UNAVAILABLE", "outcome": "UNAVAILABLE", "poses": [],
                "failedChecks": [{"check": "integrity_gate", "ok": False, **{k: v for k, v in gate.items() if k != "ok"}}]}
    # verify the recorded extra-rigid cofactor files are the ones on disk, when present
    extra_checks = []
    for rec_extra in case.get("extraRigidPdbqt", []):
        found = False
        for name in sorted(os.listdir(case_dir)):
            if name.startswith("cofactor_") and name.endswith(".pdbqt"):
                if sha256_file(os.path.join(case_dir, name)) == rec_extra["sha256"]:
                    found = True
                    break
        if not found:
            extra_checks.append({"check": "extra_rigid_pdbqt_present", "ok": False,
                                 "expected": rec_extra["sha256"]})
    try:
        poses, checks = score_case(case, gate, scratch, worker=worker)
    except Exception as e:  # noqa: BLE001
        return {**out, "status": "SCORING_FAILED", "outcome": "UNAVAILABLE", "poses": [],
                "failedChecks": extra_checks + [{"check": "scoring", "ok": False, "error": str(e)[:300]}]}
    checks = extra_checks + checks
    by_vinardo = sorted(poses, key=lambda p: p["vinardoRank"])
    top = by_vinardo[0]
    best_rmsd_pose = min(poses, key=lambda p: p["rmsdA"])
    vina_ok = is_native_like(case["rank1RmsdA"])
    vinardo_ok = is_native_like(top["rmsdA"])
    return {**out, "status": "SCORED", "nPoses": len(poses), "poses": poses,
            "vinardoRank1": {"originalVinaRank": top["rank"], "rmsdA": top["rmsdA"],
                             "vinardoScoreKcalMol": top["vinardoScoreKcalMol"],
                             "vinaAffinityKcalMol": top["affinityKcalMol"],
                             "poseSha256": top["poseSha256"]},
            "bestRmsdPose": {"originalVinaRank": best_rmsd_pose["rank"],
                             "vinardoRank": best_rmsd_pose["vinardoRank"],
                             "rmsdA": best_rmsd_pose["rmsdA"],
                             "vinardoScoreKcalMol": best_rmsd_pose["vinardoScoreKcalMol"],
                             "vinaAffinityKcalMol": best_rmsd_pose["affinityKcalMol"]},
            "vinaTop1Success": vina_ok, "vinardoTop1Success": vinardo_ok,
            "nativeLikePoseStillAvailable": is_native_like(best_rmsd_pose["rmsdA"]),
            "residualRankingGap": is_native_like(best_rmsd_pose["rmsdA"]) and not vinardo_ok,
            "outcome": outcome(vina_ok, vinardo_ok), "failedChecks": checks}


# ------------------------------------------------------------------ report


def interpretation(net_gain: int, recovered_of_20: int, rules: dict) -> dict:
    bottleneck = net_gain >= 5 and recovered_of_20 >= 8
    not_bottleneck = net_gain <= 2 or recovered_of_20 < 4
    if bottleneck:
        branch = "scoringIsTheBottleneck"
    elif not_bottleneck:
        branch = "scoringIsNotTheBottleneck"
    else:
        branch = "inconclusive"
    return {"branch": branch, "netGain": net_gain, "recoveredOf20": recovered_of_20,
            "ruleApplied": rules[branch],
            "consequence": rules["consequence"],
            "nextSamplingExperimentProposed": bottleneck}


def build_report(results, run4, prereg, poses_root, replay, tests=None):
    a_ranking = [c["pdbId"] for c in run4["run3FailureClassification"]
                 if c["classification"] == "A_RANKING_FAILURE"]
    b_sampling = [c["pdbId"] for c in run4["run3FailureClassification"]
                  if c["classification"] == "B_SAMPLING_FAILURE"]
    by_id = {r["pdbId"]: r for r in results}
    vinardo_top1 = sum(1 for r in results if r.get("vinardoTop1Success"))
    vina_top1 = sum(1 for r in results if r.get("vinaTop1Success"))
    unavailable = [r["pdbId"] for r in results if r["outcome"] == "UNAVAILABLE"]
    recovered = [r["pdbId"] for r in results if r["outcome"] == "RECOVERED"]
    lost = [r["pdbId"] for r in results if r["outcome"] == "LOST"]
    recovered_of_20 = [p for p in a_ranking if by_id.get(p, {}).get("vinardoTop1Success")]
    failed_checks = [{"pdbId": r["pdbId"], "checks": r["failedChecks"]}
                     for r in results if r.get("failedChecks")]
    net_gain = vinardo_top1 - RUN4_VINA_TOP1
    residual = [{"pdbId": r["pdbId"],
                 "bestRmsdA": r["bestRmsdPose"]["rmsdA"],
                 "vinardoRankOfBestRmsdPose": r["bestRmsdPose"]["vinardoRank"],
                 "originalVinaRankOfBestRmsdPose": r["bestRmsdPose"]["originalVinaRank"],
                 "vinardoRank1RmsdA": r["vinardoRank1"]["rmsdA"]}
                for r in results if r.get("residualRankingGap")]
    interp = interpretation(net_gain, len(recovered_of_20),
                            prereg["protocol"]["prespecifiedInterpretation"])
    import vina as vina_mod
    import meeko as meeko_mod
    from rdkit import rdBase
    return {
        "kind": "astex-vinardo-rescoring-run5",
        "label": prereg["protocol"]["label"],
        "finishedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "preregistration": {
            "path": "docs/evidence/astex-vinardo-rescoring-prereg.json",
            "protocolFingerprintSha256": prereg["protocolFingerprintSha256"],
            "fingerprintRecomputed": protocol_fingerprint(prereg["protocol"]),
            "frozenAt": prereg["frozenAt"],
            "frozenBeforeAnyResult": True,
            "fileSha256": sha256_file(PREREG),
        },
        "inputs": {"poseSetRoot": poses_root,
                   "run4Evidence": "docs/evidence/astex-redock-run4-diagnostic.json",
                   "run4EvidenceSha256": sha256_file(RUN4)},
        "engine": {"scoringFunction": "vinardo", "vinaVersion": getattr(vina_mod, "__version__", "?"),
                   "meekoVersion": getattr(meeko_mod, "__version__", "?"),
                   "rdkitVersion": rdBase.rdkitVersion, "python": sys.version.split()[0],
                   "docking": "NONE - no dock(), no optimize(), poses scored at stored coordinates"},
        "summary": {
            "denominator": DENOMINATOR,
            "casesConsidered": len(results),
            "vinardoTop1Successes": vinardo_top1,
            "vinardoTop1Rate": round(vinardo_top1 / DENOMINATOR, 4),
            "run4VinaTop1SuccessesOnTheseSamePoseSets": RUN4_VINA_TOP1,
            "vinaTop1RecomputedFromRun4Records": vina_top1,
            "netGain": net_gain,
            "a_rankingFailureCases": len(a_ranking),
            "recoveredOfA_rankingFailures": len(recovered_of_20),
            "recoveredOfA_rankingFailuresIds": recovered_of_20,
            "recoveredAll": recovered, "recoveredAllCount": len(recovered),
            "lost": lost, "lostCount": len(lost),
            "unavailable": unavailable, "unavailableCount": len(unavailable),
            "residualRankingGapCount": len(residual),
            "residualRankingGapIds": [x["pdbId"] for x in residual],
            "residualRankingGap": residual,
            "nativeLikePoseAvailableAnywhereInTop20": sum(
                1 for r in results if r.get("nativeLikePoseStillAvailable")),
            "failedCheckCases": [f["pdbId"] for f in failed_checks],
            "failedCheckCount": len(failed_checks),
            "outcomeCounts": {k: sum(1 for r in results if r["outcome"] == k)
                              for k in ("RECOVERED", "LOST", "STILL_FAILING",
                                        "UNCHANGED_SUCCESS", "UNAVAILABLE")},
        },
        "prespecifiedInterpretation": interp,
        "b_samplingFailureCases": b_sampling,
        "a_rankingFailureCases": a_ranking,
        "failedChecks": failed_checks,
        "deterministicReplay": replay,
        "unitTests": tests,
        "cases": results,
    }


def md_row(r):
    v1 = r.get("vinardoRank1") or {}
    fmt = lambda x: ("%.3f" % x) if isinstance(x, (int, float)) else "n/a"
    return "| %s | %s | %s | %s | %s | %s | %s | `%s` |" % (
        r["pdbId"], fmt(r.get("vinaRank1RmsdA")), fmt(r.get("vinaRank1ScoreKcalMol")),
        fmt(v1.get("rmsdA")), fmt(v1.get("vinardoScoreKcalMol")),
        v1.get("originalVinaRank", "n/a"), r["outcome"], v1.get("poseSha256", "n/a"))


MD_HEADER = ("| PDB | Vina r1 RMSD | Vina r1 score | Vinardo r1 RMSD | Vinardo r1 score | "
             "Vina rank now first | outcome | Vinardo r1 pose SHA-256 |\n"
             "| --- | --- | --- | --- | --- | --- | --- | --- |")


def markdown(report):
    s = report["summary"]
    i = report["prespecifiedInterpretation"]
    L = []
    L.append("# Astex run 5 - Vinardo rescoring of the stored run-4 top-20 pose sets")
    L.append("")
    L.append("**No docking was performed.** No pose was minimised or moved. The poses are exactly the "
             "ones AutoDock Vina wrote in run 4; only the scoring function that ranks them changed.")
    L.append("")
    L.append("- Preregistration: `docs/evidence/astex-vinardo-rescoring-prereg.json`")
    L.append("- Frozen protocol fingerprint: `%s`" % report["preregistration"]["protocolFingerprintSha256"])
    L.append("- Recomputed from the `protocol` object at run time: `%s`" % report["preregistration"]["fingerprintRecomputed"])
    L.append("- The protocol was **frozen at %s, before any result in this document was computed**; "
             "the runner refuses to execute if the recomputed fingerprint differs."
             % report["preregistration"]["frozenAt"])
    L.append("- Finished: %s" % report["finishedAt"])
    L.append("- Engine: AutoDock Vina %s (`sf_name=\"vinardo\"`), Meeko %s, RDKit %s"
             % (report["engine"]["vinaVersion"], report["engine"]["meekoVersion"], report["engine"]["rdkitVersion"]))
    L.append("")
    L.append("## Headline")
    L.append("")
    L.append("| quantity | value |")
    L.append("| --- | --- |")
    L.append("| Vinardo top-1 successes (RMSD < 2.0 A) | **%d / %d** (%.1f%%) |"
             % (s["vinardoTop1Successes"], s["denominator"], 100 * s["vinardoTop1Rate"]))
    L.append("| Vina top-1 on the SAME pose sets (run-4 diagnostic) | %d / %d |"
             % (s["run4VinaTop1SuccessesOnTheseSamePoseSets"], s["denominator"]))
    L.append("| Net gain | **%+d** |" % s["netGain"])
    L.append("| RECOVERED of the %d A_RANKING_FAILURE cases | **%d** |"
             % (s["a_rankingFailureCases"], s["recoveredOfA_rankingFailures"]))
    L.append("| LOST (Vina rank-1 was native-like, Vinardo rank-1 is not) | **%d** |" % s["lostCount"])
    L.append("| RECOVERED overall | %d |" % s["recoveredAllCount"])
    L.append("| Residual ranking gap (native-like pose still in top-20 but not Vinardo rank 1) | **%d** |"
             % s["residualRankingGapCount"])
    L.append("| UNAVAILABLE (integrity gate) | %d |" % s["unavailableCount"])
    L.append("| cases with a failed check | %d |" % s["failedCheckCount"])
    L.append("| denominator | %d, always |" % s["denominator"])
    L.append("")
    L.append("Lost cases: %s" % (", ".join("`%s`" % x for x in s["lost"]) if s["lost"] else "none"))
    L.append("")
    L.append("Recovered of the 20 ranking failures: %s"
             % (", ".join("`%s`" % x for x in s["recoveredOfA_rankingFailuresIds"])
                or "none"))
    L.append("")
    L.append("## Residual ranking gap after Vinardo")
    L.append("")
    L.append("Cases that still contain a native-like pose (RMSD < 2.0 A) somewhere in the stored top-20 "
             "but do NOT have it at Vinardo rank 1 - i.e. the native-like pose is available and still "
             "mis-ranked. Count: **%d**." % s["residualRankingGapCount"])
    L.append("")
    if s["residualRankingGap"]:
        L.append("| PDB | best RMSD in pose set | Vinardo rank of that pose | original Vina rank of that pose | Vinardo rank-1 RMSD |")
        L.append("| --- | --- | --- | --- | --- |")
        for x in s["residualRankingGap"]:
            L.append("| %s | %.3f | %d | %d | %.3f |" % (x["pdbId"], x["bestRmsdA"],
                                                         x["vinardoRankOfBestRmsdPose"],
                                                         x["originalVinaRankOfBestRmsdPose"],
                                                         x["vinardoRank1RmsdA"]))
    else:
        L.append("None.")
    L.append("")
    L.append("For reference, %d of the %d cases have a native-like pose anywhere in the stored top-20 "
             "(the run-4 ceiling), and Vinardo puts it first in %d of them."
             % (s["nativeLikePoseAvailableAnywhereInTop20"], s["denominator"], s["vinardoTop1Successes"]))
    L.append("")
    L.append("## Prespecified interpretation, applied verbatim")
    L.append("")
    for k in ("scoringIsTheBottleneck", "scoringIsNotTheBottleneck", "inconclusive"):
        L.append("- `%s`: %s%s" % (k, _rule_text(report, k),
                                   "  <- **THIS BRANCH**" if k == i["branch"] else ""))
    L.append("")
    L.append("Net gain = %+d, recovered of 20 = %d -> branch **%s**." % (i["netGain"], i["recoveredOf20"], i["branch"]))
    L.append("")
    L.append("Consequence rule: %s" % i["consequence"])
    L.append("")
    if i["nextSamplingExperimentProposed"]:
        L.append(NEXT_EXPERIMENT % ", ".join("`%s`" % x for x in report["b_samplingFailureCases"]))
    else:
        L.append("**A next sampling experiment for the %d B_SAMPLING_FAILURE cases is premature.** "
                 "The prereg allows that proposal only if `scoringIsTheBottleneck` is met, and it is not. "
                 "No proposal is made here." % len(report["b_samplingFailureCases"]))
    L.append("")
    L.append("## Deterministic replay")
    L.append("")
    rp = report["deterministicReplay"]
    L.append("| case | poses | scores bit-identical |")
    L.append("| --- | --- | --- |")
    for r in rp["cases"]:
        L.append("| %s | %d | %s |" % (r["pdbId"], r["nPoses"], "YES" if r["bitIdentical"] else "NO"))
    L.append("")
    L.append("Replay method: %s" % rp["method"])
    L.append("")
    if report.get("unitTests"):
        t = report["unitTests"]
        L.append("## Unit tests")
        L.append("")
        L.append("`scripts/test-astex-vinardo-rescore.py`: %s" % t.get("summary", "not recorded"))
        L.append("")
    L.append("## Failed checks")
    L.append("")
    if report["failedChecks"]:
        for f in report["failedChecks"]:
            L.append("- `%s`: %s" % (f["pdbId"], json.dumps(f["checks"])))
    else:
        L.append("None. For every scored case, every recomputed pose RMSD equals run 4's recorded value "
                 "to 3 decimals and every recomputed pose SHA-256 equals run 4's.")
    L.append("")
    L.append("## The 20 run-4 A_RANKING_FAILURE cases")
    L.append("")
    L.append(MD_HEADER)
    by_id = {c["pdbId"]: c for c in report["cases"]}
    for pid in report["a_rankingFailureCases"]:
        if pid in by_id:
            L.append(md_row(by_id[pid]))
    L.append("")
    L.append("## All %d cases" % report["summary"]["denominator"])
    L.append("")
    L.append("RMSD in angstrom, scores in kcal/mol. \"Vina rank now first\" is the original Vina rank of "
             "the pose Vinardo puts first.")
    L.append("")
    L.append(MD_HEADER)
    for c in report["cases"]:
        L.append(md_row(c))
    L.append("")
    L.append("## Immutability")
    L.append("")
    L.append("- Runs 1-4 and the run-1 preregistration were not modified by this run.")
    L.append("- The Vinardo preregistration was not modified: file SHA-256 `%s`."
             % report["preregistration"]["fileSha256"])
    L.append("- Pose sets read from `%s` (read-only)." % report["inputs"]["poseSetRoot"])
    L.append("- run-4 evidence SHA-256: `%s`" % report["inputs"]["run4EvidenceSha256"])
    L.append("")
    return "\n".join(L) + "\n"


def _rule_text(report, key):
    rules = {
        "scoringIsTheBottleneck": "net gain >= +5 AND at least 8 of the 20 A_RANKING_FAILURE cases recovered",
        "scoringIsNotTheBottleneck": "net gain <= +2 OR fewer than 4 of the 20 recovered",
        "inconclusive": "anything between the two - reported as inconclusive, not spun either way",
    }
    return rules[key]


NEXT_EXPERIMENT = (
    "**One next sampling experiment** for the 17 B_SAMPLING_FAILURE cases (%s): keep every other "
    "parameter of the frozen run-1 protocol fixed (same receptor, same box, same threshold, same "
    "denominator of 85) and change exactly one thing - raise Vina's `exhaustiveness` from 32 to 256 "
    "with 8 independent seeds per case, re-docking ONLY to measure whether a native-like pose is ever "
    "generated at all (top-20 ceiling per case), not to report a new headline. The single prespecified "
    "readout is: how many of the 17 cases produce at least one pose with RMSD < 2.0 A anywhere in the "
    "returned modes. That separates \"the search never reaches the native basin\" from \"the search "
    "reaches it but rarely\", and it must be preregistered before execution."
)


# ------------------------------------------------------------------ replay


def deterministic_replay(cases_by_id, run4_cases, poses_root, scratch, pdb_ids, worker=None):
    out = []
    for pid in pdb_ids:
        case = run4_cases[pid]
        first = cases_by_id.get(pid)
        if not first or first["status"] != "SCORED":
            out.append({"pdbId": pid, "nPoses": 0, "bitIdentical": False,
                        "note": "case was not scored in the main pass"})
            continue
        gate = integrity_gate(case, os.path.join(poses_root, pid))
        poses2, _ = score_case(case, gate, scratch, worker=worker)
        a = [p["vinardoScoreRaw"] for p in sorted(first["poses"], key=lambda p: p["rank"])]
        b = [p["vinardoScoreRaw"] for p in sorted(poses2, key=lambda p: p["rank"])]
        out.append({"pdbId": pid, "nPoses": len(b), "bitIdentical": a == b,
                    "firstPassScores": a, "replayScores": b})
    return {"method": "the whole scoring path is executed a second time in a fresh Vina object and the "
                      "full-precision Python float repr of every pose's Vinardo total is compared exactly",
            "cases": out}


# ------------------------------------------------------------------ main


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--poses", default=DEFAULT_POSES)
    ap.add_argument("--only", default=None)
    ap.add_argument("--replay", default="1G9V,1T46")
    ap.add_argument("--no-write", action="store_true")
    ap.add_argument("--tests-summary", default=None)
    args = ap.parse_args()

    prereg = load_prereg()
    print("protocol fingerprint OK: %s" % prereg["protocolFingerprintSha256"], file=sys.stderr)

    with open(RUN4) as f:
        run4 = json.load(f)
    cases = run4["cases"]
    if args.only:
        wanted = {x.strip().upper() for x in args.only.split(",")}
        cases = [c for c in cases if c["pdbId"].upper() in wanted]

    scratch = tempfile.mkdtemp(prefix="vinardo-", dir="/tmp/claude-0/vinardo"
                               if os.path.isdir("/tmp/claude-0/vinardo") else None)
    worker = _load_worker_module()
    results = []
    for n, case in enumerate(cases, 1):
        r = run_case(case, args.poses, scratch, worker=worker)
        results.append(r)
        print("[%2d/%d] %s %s  vina_r1=%s  vinardo_r1=%s (vina rank %s)  %s"
              % (n, len(cases), case["pdbId"], r["status"], r.get("vinaRank1RmsdA"),
                 (r.get("vinardoRank1") or {}).get("rmsdA"),
                 (r.get("vinardoRank1") or {}).get("originalVinaRank"), r["outcome"]),
              file=sys.stderr, flush=True)

    by_id = {r["pdbId"]: r for r in results}
    run4_by_id = {c["pdbId"]: c for c in run4["cases"]}
    replay_ids = [x.strip().upper() for x in args.replay.split(",") if x.strip()]
    replay_ids = [x for x in replay_ids if x in by_id]
    replay = deterministic_replay(by_id, run4_by_id, args.poses, scratch, replay_ids, worker=worker)

    tests = {"summary": args.tests_summary} if args.tests_summary else None
    report = build_report(results, run4, prereg, args.poses, replay, tests=tests)
    if args.no_write:
        print(json.dumps(report["summary"], indent=1))
        return
    with open(OUT_JSON, "w") as f:
        json.dump(report, f, indent=1)
        f.write("\n")
    with open(OUT_MD, "w") as f:
        f.write(markdown(report))
    print(json.dumps(report["summary"], indent=1))
    print(json.dumps(report["prespecifiedInterpretation"], indent=1))


if __name__ == "__main__":
    main()
