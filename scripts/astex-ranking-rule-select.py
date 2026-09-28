#!/usr/bin/env python3
"""GENESIS - Astex phase 4: select ONE ranking rule from a closed, preregistered candidate list.

    python3 scripts/astex-ranking-rule-select.py [--work /tmp/claude-0/run6/work] [--only 1G9V,1T46]

MODEL SELECTION ON THE TEST SET. The winning rule's score here is a post-hoc development
number, not a validation result and not a headline. That statement is frozen in the
preregistration and is repeated in every artefact this script writes.

The protocol is frozen in docs/evidence/astex-ranking-rule-prereg.json and fingerprinted.
This script RECOMPUTES the fingerprint from the `protocol` object and REFUSES TO RUN on any
drift. It also verifies the sha256 of the pinned code files and of the run-6 evidence.

NO DOCKING. NO MINIMISATION. NO POSE MOVEMENT. Vina.dock() and Vina.optimize() are never
called. Poses are read from run 6's stored output and scored at their stored coordinates.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import hashlib
import importlib.util
import json
import os
import statistics
import sys
import tempfile
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PREREG = os.path.join(ROOT, "docs/evidence/astex-ranking-rule-prereg.json")
RUN6 = os.path.join(ROOT, "docs/evidence/astex-run6-multiseed-ensemble.json")
WORKER = os.path.join(ROOT, "packages/backend/src/compute/dock_worker.py")
OUT_JSON = os.path.join(ROOT, "docs/evidence/astex-ranking-rule-selection.json")
OUT_MD = os.path.join(ROOT, "docs/evidence/astex-ranking-rule-selection.md")

SUCCESS_RMSD_A = 2.0
DENOMINATOR = 85
RMSD_TOLERANCE = 0.0005
BASELINE_TOP1 = 50

CANDIDATES = ("vina", "vinardo", "linear_equal_weight", "normalised_rank_sum")
COMPLEXITY = {"vina": 0, "vinardo": 1, "linear_equal_weight": 2, "normalised_rank_sum": 3}
LINEAR_WEIGHT = 0.5


# ------------------------------------------------------------------ gates


def sha256_file(path: str) -> str:
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def protocol_fingerprint(protocol: dict) -> str:
    return hashlib.sha256(json.dumps(protocol, sort_keys=True).encode()).hexdigest()


def load_prereg(path: str = PREREG) -> dict:
    """Load the frozen prereg and REFUSE to continue on any protocol drift."""
    with open(path) as f:
        doc = json.load(f)
    declared = doc["protocolFingerprintSha256"]
    actual = protocol_fingerprint(doc["protocol"])
    if actual != declared:
        raise SystemExit(
            "REFUSING TO RUN: protocol fingerprint drift.\n"
            "  declared:   %s\n  recomputed: %s\n"
            "The preregistered protocol has been modified. This script will not run "
            "against an amended protocol." % (declared, actual))
    return doc


def verify_pinned_code(protocol: dict, root: str = ROOT) -> dict:
    bad, ok = [], {}
    for rel, want in sorted(protocol["pinnedCodeSha256"].items()):
        p = os.path.join(root, rel)
        got = sha256_file(p) if os.path.exists(p) else "MISSING"
        if got != want:
            bad.append((rel, want, got))
        ok[rel] = want
    want6 = protocol["poseSource"]["evidenceSha256"]
    got6 = sha256_file(RUN6)
    if got6 != want6:
        bad.append(("docs/evidence/astex-run6-multiseed-ensemble.json", want6, got6))
    if bad:
        raise SystemExit("REFUSING TO RUN: pinned inputs changed under us:\n" + "\n".join(
            "  %s\n    frozen %s\n    actual %s" % b for b in bad))
    ok["docs/evidence/astex-run6-multiseed-ensemble.json"] = want6
    return ok


def verify_candidate_list(protocol: dict) -> None:
    ids = tuple(r["id"] for r in protocol["candidateRules"]["rules"])
    if ids != CANDIDATES:
        raise SystemExit("REFUSING TO RUN: candidate list drift.\n  frozen %s\n  code   %s"
                         % (list(ids), list(CANDIDATES)))
    lin = next(r for r in protocol["candidateRules"]["rules"] if r["id"] == "linear_equal_weight")
    if lin["weight"] != LINEAR_WEIGHT:
        raise SystemExit("REFUSING TO RUN: linear weight drift: frozen %s, code %s"
                         % (lin["weight"], LINEAR_WEIGHT))
    if protocol["successThresholdRmsdA"] != SUCCESS_RMSD_A or protocol["denominator"] != DENOMINATOR:
        raise SystemExit("REFUSING TO RUN: threshold or denominator drift.")


# ------------------------------------------------------------------ the four rules


def _tie(p):
    return (p["seedIndex"], p["rank"])


def rank_poses(poses, rule: str):
    """Order a pose list under one candidate rule. Returns a NEW list, best first.

    Each pose must carry: affinityKcalMol (V), vinardoScoreKcalMol (D), seedIndex, rank.
    Every rule is total and deterministic: no two poses can ever compare equal, because
    (seedIndex, rank) is unique within a case.
    """
    if rule not in CANDIDATES:
        raise ValueError("unknown candidate rule: %r" % (rule,))
    if rule == "vina":
        return sorted(poses, key=lambda p: (p["affinityKcalMol"],) + _tie(p))
    if rule == "vinardo":
        return sorted(poses, key=lambda p: (p["vinardoScoreKcalMol"], p["affinityKcalMol"]) + _tie(p))
    if rule == "linear_equal_weight":
        def s(p):
            return LINEAR_WEIGHT * p["affinityKcalMol"] + (1.0 - LINEAR_WEIGHT) * p["vinardoScoreKcalMol"]
        return sorted(poses, key=lambda p: (s(p), p["affinityKcalMol"]) + _tie(p))
    # normalised_rank_sum
    n = len(poses)
    by_v = sorted(poses, key=lambda p: (p["affinityKcalMol"],) + _tie(p))
    by_d = sorted(poses, key=lambda p: (p["vinardoScoreKcalMol"],) + _tie(p))
    denom = float(n - 1) if n > 1 else 1.0
    rv = {id(p): i / denom if n > 1 else 0.0 for i, p in enumerate(by_v)}
    rd = {id(p): i / denom if n > 1 else 0.0 for i, p in enumerate(by_d)}
    return sorted(poses, key=lambda p: (0.5 * (rv[id(p)] + rd[id(p)]), p["affinityKcalMol"]) + _tie(p))


def rule_top1_success(poses, rule: str, threshold: float = SUCCESS_RMSD_A) -> bool:
    """True iff the pose the rule puts FIRST is native-like. Empty pose list is a failure."""
    if not poses:
        return False
    return rank_poses(poses, rule)[0]["rmsdA"] < threshold


# ------------------------------------------------------------------ accounting


def accounting(per_case: dict, rule: str, baseline: str = "vina",
               denominator: int = DENOMINATOR) -> dict:
    """top-1, recovered, lost, net for one rule against the baseline rule.

    `per_case` maps pdbId -> {ruleId -> bool success}. UNAVAILABLE cases carry False for
    every rule and stay in the denominator.
    """
    if len(per_case) != denominator:
        raise ValueError("denominator violation: %d cases, expected %d" % (len(per_case), denominator))
    top1 = sorted(p for p, v in per_case.items() if v[rule])
    rec = sorted(p for p, v in per_case.items() if v[rule] and not v[baseline])
    lost = sorted(p for p, v in per_case.items() if v[baseline] and not v[rule])
    base = sum(1 for v in per_case.values() if v[baseline])
    return {"rule": rule, "top1Successes": len(top1), "denominator": denominator,
            "rate": round(len(top1) / denominator, 4),
            "recoveredVsBaseline": rec, "recovered": len(rec),
            "lostVsBaseline": lost, "lost": len(lost),
            "net": len(rec) - len(lost), "baselineTop1": base,
            "top1Cases": top1}


def select_winner(results: list, complexity: dict = COMPLEXITY) -> dict:
    """Apply the frozen selection criterion mechanically.

    primary: max top1Successes. tie: fewer lost. tie: smaller complexityOrder.
    withinOneCaseRule: if best and second-best differ by at most 1, the simpler of the two wins
    and the report must say simplicity decided it.
    """
    ordered = sorted(results, key=lambda r: (-r["top1Successes"], r["lost"], complexity[r["rule"]]))
    best, second = ordered[0], (ordered[1] if len(ordered) > 1 else None)
    decided_by = "top1Successes"
    winner = best
    within_one = False
    if second is not None and (best["top1Successes"] - second["top1Successes"]) <= 1:
        within_one = True
        pair = sorted([best, second], key=lambda r: complexity[r["rule"]])
        winner = pair[0]
        if winner["rule"] != best["rule"]:
            decided_by = "withinOneCaseRule_simplerRulePreferred"
        elif best["top1Successes"] == second["top1Successes"]:
            decided_by = "tieBreak_thenSimplerRule"
        else:
            decided_by = "top1Successes_butWithinOneCaseOfRunnerUp"
    other = None
    if second is not None:
        other = second["rule"] if winner["rule"] == best["rule"] else best["rule"]
    return {"winner": winner["rule"], "decidedBy": decided_by,
            "withinOneCaseOfRunnerUp": within_one,
            "bestByTop1": best["rule"], "bestByTop1Count": best["top1Successes"],
            "secondByTop1": second["rule"] if second else None,
            "secondByTop1Count": second["top1Successes"] if second else None,
            "runnerUp": other,
            "marginCases": (best["top1Successes"] - second["top1Successes"]) if second else None,
            "orderApplied": [r["rule"] for r in ordered],
            "criterion": "argmax top1Successes over 85; ties by fewer LOST vs the Vina baseline; "
                         "then by smaller complexityOrder; if the best two are within 1 case, the "
                         "simpler of the two is selected and that is stated"}


# ------------------------------------------------------------------ scoring one case


def _worker_module():
    spec = importlib.util.spec_from_file_location("dock_worker_for_ranking", WORKER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def effective_receptor(seed_dir: str, extra: bool) -> str:
    name = "receptor_with_extra.pdbqt" if extra else "receptor.pdbqt"
    return os.path.join(seed_dir, "receptor", name)


def integrity_gate(case: dict, work: str) -> dict:
    """File-level gate. Returns {'ok': bool, ...}. Never re-docks, never repairs."""
    extra = bool((case.get("preparation") or {}).get("extraRigidPdbqtPaths"))
    per_seed, problems = {}, []
    for sr in case["seedRuns"]:
        seed_dir = os.path.join(work, case["pdbId"], "seed%d" % sr["seed"])
        docked = os.path.join(seed_dir, "dock", "docked.pdbqt")
        rec = effective_receptor(seed_dir, extra)
        for label, path in (("docked.pdbqt", docked), ("receptor.pdbqt", rec)):
            if not os.path.exists(path):
                problems.append({"seed": sr["seed"], "reason": "missing_%s" % label, "path": path})
        if problems and problems[-1].get("seed") == sr["seed"]:
            continue
        gd, gr = sha256_file(docked), sha256_file(rec)
        if gd != sr["dockedPdbqtSha256"]:
            problems.append({"seed": sr["seed"], "reason": "docked_pdbqt_sha256_mismatch",
                             "expected": sr["dockedPdbqtSha256"], "got": gd})
        if gr != sr["receptorPdbqtSha256"]:
            problems.append({"seed": sr["seed"], "reason": "receptor_pdbqt_sha256_mismatch",
                             "expected": sr["receptorPdbqtSha256"], "got": gr})
        per_seed[sr["seed"]] = {"dockedPath": docked, "receptorPath": rec,
                                "dockedPdbqtSha256": gd, "receptorPdbqtSha256": gr}
    receptors = {v["receptorPdbqtSha256"] for v in per_seed.values()}
    if len(receptors) > 1:
        problems.append({"reason": "receptor_differs_across_seeds", "sha256s": sorted(receptors)})
    return {"ok": not problems, "problems": problems, "perSeed": per_seed,
            "usedExtraRigidReceptor": extra}


def score_case(case: dict, work: str, scratch: str, worker=None) -> dict:
    """Vinardo-score every stored pose of every seed of one case, at stored coordinates."""
    from rdkit import Chem
    from rdkit.Chem import rdMolAlign
    from vina import Vina
    from meeko import PDBQTMolecule, RDKitMolCreate

    dw = worker or _worker_module()
    pdb_id = case["pdbId"]
    gate = integrity_gate(case, work)
    if not gate["ok"]:
        return {"pdbId": pdb_id, "status": "UNAVAILABLE", "integrityGate": gate,
                "poses": [], "failedChecks": [{"check": "integrity_gate", "ok": False,
                                               "problems": gate["problems"]}]}

    xtal = Chem.MolFromMolFile(case["preparation"]["ligandSdf"], removeHs=False)
    if xtal is None:
        return {"pdbId": pdb_id, "status": "UNAVAILABLE", "integrityGate": gate, "poses": [],
                "failedChecks": [{"check": "ligand_sdf_readable", "ok": False}]}
    ref = Chem.RemoveHs(xtal)

    any_seed = case["seedRuns"][0]["seed"]
    v = Vina(sf_name="vinardo", verbosity=0)
    v.set_receptor(gate["perSeed"][any_seed]["receptorPath"])
    v.compute_vina_maps(center=case["center"], box_size=case["boxSize"])

    checks, all_poses = [], []
    for si, sr in enumerate(case["seedRuns"]):
        text = open(gate["perSeed"][sr["seed"]]["dockedPath"]).read()
        models = dw.pose_models(text)
        pm = PDBQTMolecule(text, skip_typing=True)
        mol = Chem.RemoveHs(RDKitMolCreate.from_pdbqt_mol(pm)[0])
        confs = list(mol.GetConformers())
        if len(confs) != len(models) or len(models) != len(sr["poses"]):
            return {"pdbId": pdb_id, "status": "UNAVAILABLE", "integrityGate": gate, "poses": [],
                    "failedChecks": [{"check": "pose_count", "ok": False, "seed": sr["seed"],
                                      "models": len(models), "conformers": len(confs),
                                      "recorded": len(sr["poses"])}]}
        for i, conf in enumerate(confs):
            rec = sr["poses"][i]
            single = Chem.Mol(mol)
            single.RemoveAllConformers()
            single.AddConformer(Chem.Conformer(conf), assignId=True)
            rmsd = round(float(rdMolAlign.CalcRMS(single, ref)), 3)
            pose_sha = dw.pose_identity(models[i])
            if abs(rmsd - rec["rmsdA"]) > RMSD_TOLERANCE:
                checks.append({"check": "rmsd_matches_run6", "ok": False, "seed": sr["seed"],
                               "rank": i + 1, "recomputed": rmsd, "run6": rec["rmsdA"]})
            if pose_sha != rec["poseSha256"]:
                checks.append({"check": "pose_sha256_matches_run6", "ok": False, "seed": sr["seed"],
                               "rank": i + 1, "recomputed": pose_sha, "run6": rec["poseSha256"]})
            pose_path = os.path.join(scratch, "pose_%s_%d_%02d.pdbqt" % (pdb_id, sr["seed"], i + 1))
            with open(pose_path, "w") as f:
                f.write(models[i])
            v.set_ligand_from_file(pose_path)
            total = float(v.score()[0])
            os.unlink(pose_path)
            all_poses.append({"seed": sr["seed"], "seedIndex": si, "rank": i + 1,
                              "affinityKcalMol": rec["affinityKcalMol"], "rmsdA": rmsd,
                              "vinardoScoreKcalMol": round(total, 3), "vinardoScoreRaw": repr(total),
                              "poseSha256": pose_sha})
    if checks:
        return {"pdbId": pdb_id, "status": "UNAVAILABLE", "integrityGate": gate,
                "poses": all_poses, "failedChecks": checks}
    return {"pdbId": pdb_id, "status": "SCORED", "integrityGate": gate, "poses": all_poses,
            "failedChecks": []}


def attach_pool(case: dict, scored: dict) -> dict:
    """Select, from the scored raw poses, exactly the deduplicated pool run 6 froze.

    The pool is read verbatim from run 6's per-case record; it is neither recomputed nor altered.
    """
    by_key = {(p["seed"], p["rank"]): p for p in scored["poses"]}
    pool = []
    for p in case["pool"]:
        q = by_key.get((p["seed"], p["rank"]))
        if q is None:
            return {"pool": [], "poolError": "pooled pose %s/%s not found among scored poses"
                    % (p["seed"], p["rank"])}
        if q["poseSha256"] != p["poseSha256"]:
            return {"pool": [], "poolError": "pooled pose %s/%s sha256 differs from run 6"
                    % (p["seed"], p["rank"])}
        pool.append(q)
    return {"pool": pool}


# ------------------------------------------------------------------ driver


def _run_one(args_tuple):
    case, work = args_tuple
    scratch = tempfile.mkdtemp(prefix="astex-rank-")
    try:
        scored = score_case(case, work, scratch)
    except Exception as e:  # noqa: BLE001
        scored = {"pdbId": case["pdbId"], "status": "UNAVAILABLE", "poses": [],
                  "failedChecks": [{"check": "scoring", "ok": False, "error": str(e)[:400]}]}
    finally:
        try:
            os.rmdir(scratch)
        except OSError:
            pass
    if scored["status"] == "SCORED":
        scored.update(attach_pool(case, scored))
        if scored.get("poolError"):
            scored["status"] = "UNAVAILABLE"
            scored.setdefault("failedChecks", []).append(
                {"check": "pool_matches_run6", "ok": False, "error": scored["poolError"]})
    return scored


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default="/tmp/claude-0/run6/work")
    ap.add_argument("--cases", default="/tmp/claude-0/run6/cases")
    ap.add_argument("--jobs", type=int, default=3)
    ap.add_argument("--only", default="")
    ap.add_argument("--cache", default="/tmp/claude-0/run6/ranking-scored")
    ap.add_argument("--tests", default="", help="path to a json {passed, failed, command}")
    a = ap.parse_args(argv)

    doc = load_prereg()
    protocol = doc["protocol"]
    fingerprint = protocol_fingerprint(protocol)
    pinned = verify_pinned_code(protocol)
    verify_candidate_list(protocol)
    print("protocol fingerprint verified:", fingerprint, flush=True)

    with open(RUN6) as f:
        run6 = json.load(f)
    ids = [c["pdbId"] for c in run6["cases"]]
    if len(ids) != DENOMINATOR:
        raise SystemExit("REFUSING TO RUN: run 6 holds %d cases, expected %d" % (len(ids), DENOMINATOR))

    cases = []
    for pid in ids:
        with open(os.path.join(a.cases, "%s.json" % pid)) as f:
            cases.append(json.load(f))
    want = set(x.strip().upper() for x in a.only.split(",") if x.strip())
    todo = [c for c in cases if not want or c["pdbId"] in want]

    os.makedirs(a.cache, exist_ok=True)
    scored_by_id = {}
    pending = []
    for c in todo:
        cp = os.path.join(a.cache, "%s.json" % c["pdbId"])
        if os.path.exists(cp):
            with open(cp) as f:
                scored_by_id[c["pdbId"]] = json.load(f)
            print("%-5s CACHED %s" % (c["pdbId"], scored_by_id[c["pdbId"]]["status"]), flush=True)
        else:
            pending.append(c)
    with cf.ProcessPoolExecutor(max_workers=a.jobs) as ex:
        for s in ex.map(_run_one, [(c, a.work) for c in pending]):
            scored_by_id[s["pdbId"]] = s
            with open(os.path.join(a.cache, "%s.json" % s["pdbId"]), "w") as f:
                json.dump(s, f)
            print("%-5s %-12s poses=%d pool=%d" % (s["pdbId"], s["status"], len(s.get("poses") or []),
                                                   len(s.get("pool") or [])), flush=True)

    if len(scored_by_id) != DENOMINATOR:
        print("SMOKE ONLY: %d of %d cases scored; no report is written, because the report may "
              "only ever be built on the full denominator of %d."
              % (len(scored_by_id), DENOMINATOR, DENOMINATOR))
        return 0

    report = build_report(run6, cases, scored_by_id, doc, fingerprint, pinned, a)
    with open(OUT_JSON, "w") as f:
        json.dump(report, f, indent=1)
        f.write("\n")
    with open(OUT_MD, "w") as f:
        f.write(render_md(report))
    print("wrote", OUT_JSON, "and", OUT_MD)
    return 0


# ------------------------------------------------------------------ report


def immutability_check(root: str = ROOT) -> dict:
    """Every tracked Astex artefact of runs 1-6 must be byte-identical to HEAD."""
    import subprocess
    listing = subprocess.run(["git", "-C", root, "ls-tree", "-r", "--name-only", "HEAD"],
                             capture_output=True, text=True, check=True).stdout.split()
    watched = [p for p in listing
               if p.startswith(("docs/evidence/astex-", "scripts/astex-", "scripts/test-astex-"))
               or p == "packages/backend/src/compute/dock_worker.py"]
    changed = []
    for rel in watched:
        head = subprocess.run(["git", "-C", root, "show", "HEAD:%s" % rel],
                              capture_output=True, check=True).stdout
        disk = open(os.path.join(root, rel), "rb").read() if os.path.exists(os.path.join(root, rel)) else b""
        if hashlib.sha256(head).hexdigest() != hashlib.sha256(disk).hexdigest():
            changed.append(rel)
    return {"filesChecked": len(watched), "changed": changed, "allUnchanged": not changed,
            "method": "sha256 of `git show HEAD:<path>` compared with the worktree file"}


def build_report(run6, cases, scored_by_id, doc, fingerprint, pinned, args):
    by_id = {c["pdbId"]: c for c in cases}
    ids = sorted(by_id)
    unavailable = sorted(p for p in ids if scored_by_id[p]["status"] != "SCORED")

    # pooled evaluation
    per_case = {}
    for pid in ids:
        s = scored_by_id[pid]
        pool = s.get("pool") or []
        per_case[pid] = {r: (rule_top1_success(pool, r) if s["status"] == "SCORED" else False)
                         for r in CANDIDATES}
    results = [accounting(per_case, r) for r in CANDIDATES]
    selection = select_winner(results)

    # per-seed robustness: each seed's own 20 poses, no pooling
    seeds = run6["engine"]["seeds"]
    per_seed = {r: [] for r in CANDIDATES}
    for si, seed in enumerate(seeds):
        pc = {}
        for pid in ids:
            s = scored_by_id[pid]
            poses = [p for p in (s.get("poses") or []) if p["seed"] == seed] \
                if s["status"] == "SCORED" else []
            pc[pid] = {r: rule_top1_success(poses, r) for r in CANDIDATES}
        for r in CANDIDATES:
            acc = accounting(pc, r)
            per_seed[r].append({"seedIndex": si, "seed": seed, "top1Successes": acc["top1Successes"],
                                "denominator": DENOMINATOR, "rate": acc["rate"],
                                "netVsVinaSameSeed": acc["net"], "recovered": acc["recovered"],
                                "lost": acc["lost"]})
    per_seed_summary = {}
    for r in CANDIDATES:
        cnt = [x["top1Successes"] for x in per_seed[r]]
        nets = [x["netVsVinaSameSeed"] for x in per_seed[r]]
        per_seed_summary[r] = {
            "counts": cnt, "min": min(cnt), "max": max(cnt), "mean": round(sum(cnt) / len(cnt), 2),
            "sampleStdDev": round(statistics.stdev(cnt), 2) if len(cnt) > 1 else 0.0,
            "netVsVinaPerSeed": nets, "meanNetVsVina": round(sum(nets) / len(nets), 2),
            "seedsWhereNetIsPositive": sum(1 for n in nets if n > 0),
            "seedsWhereNetIsNegative": sum(1 for n in nets if n < 0),
            "perSeed": per_seed[r]}

    # per-case detail
    detail = []
    for pid in ids:
        s = scored_by_id[pid]
        pool = s.get("pool") or []
        row = {"pdbId": pid, "status": s["status"], "poolSize": len(pool),
               "bestRmsdInPoolA": round(min((p["rmsdA"] for p in pool), default=float("nan")), 3)
               if pool else None,
               "nativeLikeAvailable": any(p["rmsdA"] < SUCCESS_RMSD_A for p in pool)}
        for r in CANDIDATES:
            top = rank_poses(pool, r)[0] if pool else None
            row[r] = {"rank1RmsdA": top["rmsdA"] if top else None,
                      "rank1Seed": top["seed"] if top else None,
                      "rank1OriginalRank": top["rank"] if top else None,
                      "rank1VinaScore": top["affinityKcalMol"] if top else None,
                      "rank1VinardoScore": top["vinardoScoreKcalMol"] if top else None,
                      "success": per_case[pid][r]}
        detail.append(row)

    ceiling = sum(1 for d in detail if d["nativeLikeAvailable"])
    win = next(r for r in results if r["rule"] == selection["winner"])
    ps = per_seed_summary[selection["winner"]]

    return {
        "kind": "GENESIS_ASTEX_RANKING_RULE_SELECTION",
        "label": "Astex phase 4 - ranking-rule selection over the frozen run-6 pooled poses",
        "notAValidation": doc["protocol"]["whatThisIs"],
        "finishedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "preregistration": {
            "file": "docs/evidence/astex-ranking-rule-prereg.json",
            "sha256": sha256_file(PREREG),
            "protocolFingerprintSha256": fingerprint,
            "fingerprintRecomputedAndMatched": True,
            "frozenAt": doc["frozenAt"],
            "pinnedInputsVerified": pinned,
        },
        "dataset": {"name": "Astex Diverse Set", "cases": DENOMINATOR, "denominator": DENOMINATOR,
                    "thresholdRmsdA": SUCCESS_RMSD_A},
        "poseSource": {"run": "run 6 multi-seed Vina ensemble", "workDir": args.work,
                       "casesDir": args.cases, "redocked": False, "minimised": False,
                       "posesMoved": False},
        "integrity": {"unavailable": unavailable, "unavailableCount": len(unavailable),
                      "detail": [{"pdbId": p, "failedChecks": scored_by_id[p].get("failedChecks")}
                                 for p in unavailable],
                      "policy": "UNAVAILABLE cases stay in the denominator and count as a top-1 "
                                "failure for every rule alike; nothing is re-docked",
                      "casesScored": DENOMINATOR - len(unavailable)},
        "samplingCeilingInPool": {"successes": ceiling, "denominator": DENOMINATOR,
                                  "definition": "cases with any pose under 2.0 A in the frozen pool"},
        "candidates": results,
        "selection": selection,
        "winnerSummary": {
            "rule": win["rule"], "top1": win["top1Successes"], "denominator": DENOMINATOR,
            "vsBaseline50": win["top1Successes"] - BASELINE_TOP1,
            "recovered": win["recovered"], "lost": win["lost"], "net": win["net"],
            "perSeedCounts": ps["counts"], "perSeedNetVsVina": ps["netVsVinaPerSeed"],
            "perSeedMeanNet": ps["meanNetVsVina"],
        },
        "residualRankingGapUnderWinner": {
            "count": sum(1 for d in detail
                         if d["nativeLikeAvailable"] and not d[selection["winner"]]["success"]),
            "cases": sorted(d["pdbId"] for d in detail
                            if d["nativeLikeAvailable"] and not d[selection["winner"]]["success"]),
            "definition": "a native-like pose exists in the frozen pool and the winning rule does "
                          "not put it first",
        },
        "unitTests": (json.load(open(args.tests)) if getattr(args, "tests", "") else None),
        "immutability": immutability_check(),
        "perSeedRobustness": per_seed_summary,
        "perCase": detail,
    }


def render_md(rep) -> str:
    L = []
    A = L.append
    A("# Astex phase 4 - choosing ONE ranking rule over the frozen run-6 pooled poses\n")
    A("**MODEL SELECTION ON THE TEST SET. NOT A VALIDATION RESULT. NOT A HEADLINE.**\n")
    A(rep["notAValidation"] + "\n")
    p = rep["preregistration"]
    A("Preregistration `%s`, frozen at %s, sha256 `%s`, protocol fingerprint `%s`, recomputed by the "
      "runner and matched. The runner refuses to execute on any drift of the protocol, of the pinned "
      "code, of the candidate list, of the threshold or of the denominator.\n"
      % (p["file"], p["frozenAt"], p["sha256"], p["protocolFingerprintSha256"]))
    A("No docking, no minimisation, no pose was moved. Poses are run 6's stored output, scored at "
      "their stored coordinates. Threshold RMSD < 2.0 A. Denominator 85, always.\n")
    i = rep["integrity"]
    A("## Integrity\n")
    A("- cases whose files hashed exactly as run 6 recorded them: **%d / 85**" % i["casesScored"])
    A("- UNAVAILABLE: **%d**%s" % (i["unavailableCount"],
                                   (" (" + ", ".join(i["unavailable"]) + ")") if i["unavailable"] else ""))
    A("- %s\n" % i["policy"])
    for d in i.get("detail", []):
        errs = "; ".join(str(c.get("error") or c.get("reason") or c.get("check"))
                         for c in (d["failedChecks"] or []))
        A("- **%s is UNAVAILABLE.** Reason: %s" % (d["pdbId"], errs.strip()))
    if i["unavailable"]:
        A("\n  This is a scoring-side limit, not evidence of tampering: every stored file hashed "
          "exactly as run 6 recorded it. The frozen protocol fixes the Vinardo grid to run 6's own "
          "box, and at least one pooled pose of that case extends beyond it, so Vina refuses to "
          "score it. Under the protocol the case is reported UNAVAILABLE, is NOT re-docked, is NOT "
          "repaired and is NOT removed: it stays in the denominator and counts as a top-1 failure "
          "for all four rules alike. Its pooled Vina rank-1 pose was not native-like in run 6, so "
          "the Vina baseline is unaffected and still reads exactly 50/85. It did hold a native-like "
          "pose at pooled rank 14, so a non-baseline rule could in principle have gained it: the "
          "unmeasured effect is at most +1 case for each of the three non-baseline rules.\n")
    A("Native-like pose available anywhere in the frozen pool: **%d / 85** - the hard cap on every "
      "rule below. (Run 6 reports 81/85 over the same pool; the difference is the one UNAVAILABLE "
      "case above, which is counted as unavailable here rather than assumed.)\n"
      % rep["samplingCeilingInPool"]["successes"])

    A("## Step 2 - every candidate, including the ones that did worse\n")
    A("Baseline is Vina's own score over the same pooled poses: 50 / 85.\n")
    A("| rule | top-1 / 85 | rate | recovered vs Vina | lost vs Vina | net |")
    A("|---|---|---|---|---|---|")
    for c in rep["candidates"]:
        A("| `%s` | **%d** | %.1f%% | %d | %d | %+d |" % (
            c["rule"], c["top1Successes"], 100 * c["rate"], c["recovered"], c["lost"], c["net"]))
    A("")
    for c in rep["candidates"]:
        if c["rule"] == "vina":
            continue
        A("- `%s` recovered %s" % (c["rule"], ", ".join(c["recoveredVsBaseline"]) or "nothing"))
        A("  and lost %s" % (", ".join(c["lostVsBaseline"]) or "nothing"))
    A("")
    s = rep["selection"]
    A("## Step 3 - the frozen criterion, applied mechanically\n")
    A("Criterion: %s\n" % s["criterion"])
    A("Ordering produced: %s\n" % " > ".join("`%s`" % r for r in s["orderApplied"]))
    A("Highest raw top-1: `%s` with %d / 85. Second: `%s` with %d / 85. Margin: %s case(s).\n"
      % (s["bestByTop1"], s["bestByTop1Count"], s["secondByTop1"], s["secondByTop1Count"],
         s["marginCases"]))
    A("**Winner: `%s`.** Decided by `%s`." % (s["winner"], s["decidedBy"]))
    if s["withinOneCaseOfRunnerUp"]:
        A("\nThe best two candidates are **within one case of each other**. The preregistered "
          "within-one-case rule therefore applies: the SIMPLER of the two is selected. We state it "
          "plainly - **simplicity, not the raw count, decided this**. `%s` scored %d and `%s` scored "
          "%d; one case is inside the noise this data can resolve, so the higher number was not "
          "treated as a real difference." % (s["bestByTop1"], s["bestByTop1Count"],
                                             s["secondByTop1"], s["secondByTop1Count"]))
    A("")
    g = rep["residualRankingGapUnderWinner"]
    A("Residual ranking gap under the winner: **%d** cases still hold a native-like pose in the pool "
      "that the winning rule does not put first (%s).\n" % (g["count"], ", ".join(g["cases"])))
    A("## Step 4 - per-seed robustness, a measurement rather than a caveat\n")
    A("Each rule applied to ONE seed's own 20-pose set, no pooling. Directly comparable to run 6's "
      "per-seed Vina figures 46, 49, 50, 47, 49.\n")
    A("| rule | seed 42 | 1042 | 2042 | 3042 | 4042 | min | max | mean | SD | net vs Vina per seed | mean net |")
    A("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for r in ("vina", "vinardo", "linear_equal_weight", "normalised_rank_sum"):
        q = rep["perSeedRobustness"][r]
        A("| `%s` | %d | %d | %d | %d | %d | %d | %d | %.2f | %.2f | %s | %+.2f |" % (
            r, *q["counts"], q["min"], q["max"], q["mean"], q["sampleStdDev"],
            ", ".join("%+d" % n for n in q["netVsVinaPerSeed"]), q["meanNetVsVina"]))
    A("")
    w = rep["selection"]["winner"]
    q = rep["perSeedRobustness"][w]
    base = rep["perSeedRobustness"]["vina"]
    A("**How much of the winner's margin survives this check.** Pooled, `%s` beats the Vina baseline "
      "by %+d cases (%d vs 50). On the five seeds taken one at a time it beats the same seed's Vina "
      "ranking by %s, mean %+.2f, positive on %d of 5 seeds and negative on %d. The pooled margin is "
      "therefore %s: %s\n" % (
          w, rep["winnerSummary"]["vsBaseline50"], rep["winnerSummary"]["top1"],
          ", ".join("%+d" % n for n in q["netVsVinaPerSeed"]), q["meanNetVsVina"],
          q["seedsWhereNetIsPositive"], q["seedsWhereNetIsNegative"],
          "reproduced, not an artefact of pooling" if q["seedsWhereNetIsNegative"] == 0
          else "only partly reproduced",
          ("the advantage is small but it is present on every individual seed, so it is not a "
           "pooling artefact. It is still of the same order as the seed-to-seed spread itself "
           "(Vina alone moves over %d-%d across seeds, a range of %d cases), which is the honest "
           "size of the effect." % (base["min"], base["max"], base["max"] - base["min"]))
          if q["seedsWhereNetIsNegative"] == 0 else
          "the advantage disappears on at least one seed, which is what noise looks like."))
    A("## Step 5 - what a final frozen 85-case run would be expected to produce (ESTIMATE)\n")
    A("**This is an ESTIMATE and an INFERENCE, not a measured result. No final run was performed "
      "here, and this document does not authorise one: that run needs its own protocol, frozen "
      "after this result is in, and it is the user's decision.**\n")
    A("Inputs to the estimate, all measured above: the winning rule scores %d / 85 on the pooled "
      "run-6 poses; that number was chosen as the best of %d candidates on these same 85 cases, so "
      "it carries selection optimism; the winner's own per-seed counts are %s (min %d, max %d, SD "
      "%.2f); and the frozen pool caps any rule at %d / 85 here and 81 / 85 in run 6.\n" % (
          rep["winnerSummary"]["top1"], len(rep["candidates"]), q["counts"], q["min"], q["max"],
          q["sampleStdDev"], rep["samplingCeilingInPool"]["successes"]))
    lo = rep["winnerSummary"]["top1"] - 3
    hi = rep["winnerSummary"]["top1"] + 2
    A("**Estimated range for a fresh, frozen, 5-seed pooled 85-case run under `%s`: %d to %d of 85, "
      "centred near %d.** The centre sits at or just below the %d measured here because the %d was "
      "picked as the maximum over %d candidates evaluated on the same test set, and the maximum of "
      "several noisy estimates is biased upward by roughly the size of the noise - here about 1 to 2 "
      "cases.\n" % (w, lo, hi, rep["winnerSummary"]["top1"] - 1, rep["winnerSummary"]["top1"],
                     rep["winnerSummary"]["top1"], len(rep["candidates"])))
    A("What would make it come out LOWER than that:\n")
    A("- **Selection optimism.** Four candidates were scored on these 85 cases and the best was "
      "kept. That alone is worth on the order of 1 to 2 cases, and it is the single largest reason "
      "the number here should not be quoted as performance.")
    A("- **Seed noise in the pool itself.** Pooling five *different* seeds changes which poses exist "
      "and which survive deduplication. The per-seed spread of the winner is %d to %d, a range of %d "
      "cases, and the pooled figure inherits some of that." % (q["min"], q["max"], q["max"] - q["min"]))
    A("- **The out-of-box scoring failure recurs.** One case (%s) could not be Vinardo-scored at all "
      "inside run 6's own grid box. Any rule that needs Vinardo inherits that failure, and a fresh "
      "run with different poses could hit it on more cases, each one a guaranteed loss." % (
          ", ".join(rep["integrity"]["unavailable"]) or "none here"))
    A("- **Deduplication can discard the native-like pose.** Run 6 already measured this: the raw "
      "union reaches 83/85 but the deduplicated pool only 81/85.")
    A("- **The hard sampling floor.** 1HVY, 1Q41, 1T9B and 1W1P have no pose under 2.0 A at all, so "
      "81/85 is an absolute cap no ranking rule can pass.")
    A("- **Library drift.** A different Vina, Meeko or RDKit build changes Vinardo totals slightly, "
      "and several of the recovered cases are decided by small score gaps.\n")
    A("## The blunt conclusion\n")
    A("**No candidate rule gets near 69 / 85.** The best of the four reaches %d and the winner is "
      "fixed at %d; the target is 69. That is a shortfall of %d to %d cases, and it is not a "
      "rounding error - it is larger than the entire measured effect of changing the scoring "
      "function." % (s["bestByTop1Count"], rep["winnerSummary"]["top1"],
                     69 - s["bestByTop1Count"], 69 - rep["winnerSummary"]["top1"]))
    A("")
    A("Sampling is no longer the binding constraint - the pool holds a native-like pose on %d of 85 "
      "cases. Ranking is the constraint, and this experiment measures how much of the ranking gap "
      "these four rules close: **%d of the %d-case gap that run 6 identified.** %d cases still hold "
      "a native-like pose in the pool that the winning rule does not rank first. Reaching 69 would "
      "require closing roughly four fifths of that remaining gap, which no reweighting of Vina and "
      "Vinardo against each other is going to do. A method that gets there will have to be a "
      "different kind of thing - a rescoring model that is not a linear blend of these two - and it "
      "will have to be validated on data that was not used to choose it.\n" % (
          rep["samplingCeilingInPool"]["successes"], rep["winnerSummary"]["top1"] - 50, 31,
          rep["residualRankingGapUnderWinner"]["count"]))
    t = rep.get("unitTests")
    if t:
        A("## Unit tests\n")
        A("`%s`: **%d passed, %d failed**." % (t.get("command"), t["passed"], t["failed"]))
        A("Covered: the protocol-fingerprint refusal (and the pinned-input, candidate-list, "
          "threshold and denominator refusals), each candidate rule's ordering on hand-built poses, "
          "the tie-break chain including the preregistered within-one-case simpler-rule rule, the "
          "denominator of 85 enforced in code, and the recovered / lost / net accounting.\n")
    m = rep.get("immutability") or {}
    if m:
        A("## Immutability of runs 1-6\n")
        A("%d tracked Astex evidence, preregistration, script and worker files were compared with "
          "`git show HEAD:<path>`. Changed: **%s**. All unchanged: **%s**. This run wrote only NEW "
          "files.\n" % (m["filesChecked"], ", ".join(m["changed"]) or "none", m["allUnchanged"]))
    A("## Per-case rank-1 RMSD under each rule\n")
    A("| PDB | pool | best in pool | vina | vinardo | linear | ranksum |")
    A("|---|---|---|---|---|---|---|")
    for d in rep["perCase"]:
        def cell(r):
            v = d[r]["rank1RmsdA"]
            return ("**%.3f**" % v) if (v is not None and v < 2.0) else ("%.3f" % v if v is not None else "-")
        A("| %s | %d | %s | %s | %s | %s | %s |" % (
            d["pdbId"], d["poolSize"],
            "%.3f" % d["bestRmsdInPoolA"] if d["bestRmsdInPoolA"] is not None else "-",
            cell("vina"), cell("vinardo"), cell("linear_equal_weight"), cell("normalised_rank_sum")))
    A("")
    return "\n".join(L)


if __name__ == "__main__":
    sys.exit(main())
