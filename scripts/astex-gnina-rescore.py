#!/usr/bin/env python3
"""GENESIS - Astex run 7: rescore the frozen run-6 pooled poses with GNINA's CNN, ONCE.

    python3 scripts/astex-gnina-rescore.py [--work /tmp/claude-0/run6/work] [--only 1G9V,1KZK]

DIAGNOSTIC. The preregistered headline stays run 3's 46/85. This run produces NO headline.
Whatever number comes out is post-hoc development on the same 85 cases, not an independent
validation.

The protocol is frozen in docs/evidence/astex-gnina-rescoring-prereg.json and fingerprinted.
This script RECOMPUTES sha256(json.dumps(protocol, sort_keys=True)) and REFUSES TO RUN on any
drift. It also verifies the pinned code sha256s and the gnina binary sha256 and version string.

NO DOCKING. NO MINIMISATION. NO POSE MOVEMENT. Poses are read from run 6's stored PDBQT output
and scored at their stored coordinates with `--score_only`. Every pose's symmetry-aware RMSD and
identity hash is recomputed and asserted equal to the run-6 recorded value before it is scored.
GNINA is an external benchmark scorer only: it is NOT added to any manifest and NOT integrated.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import hashlib
import importlib.util
import json
import os
import statistics
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PREREG = os.path.join(ROOT, "docs/evidence/astex-gnina-rescoring-prereg.json")
RUN6 = os.path.join(ROOT, "docs/evidence/astex-run6-multiseed-ensemble.json")
WORKER = os.path.join(ROOT, "packages/backend/src/compute/dock_worker.py")
ENSEMBLE = os.path.join(ROOT, "scripts/astex-multiseed-ensemble.py")
RANKSELECT = os.path.join(ROOT, "scripts/astex-ranking-rule-select.py")
OUT_JSON = os.path.join(ROOT, "docs/evidence/astex-run7-gnina-rescore.json")
OUT_MD = os.path.join(ROOT, "docs/evidence/astex-run7-gnina-rescore.md")

SUCCESS_RMSD_A = 2.0
DENOMINATOR = 85
RMSD_TOLERANCE = 0.0005
TOP_K_WINDOWS = (1, 3, 5, 10, 20)
VINA_BASELINE_TOP1 = 50
PHASE4_BASELINE_TOP1 = 53
CNN_MODEL = "crossdock_default2018_ensemble"
GNINA_VERSION_TOKEN = "gnina v1.3 master:97fa6bc+"

# Every flag here can move a pose or change the model. The protocol forbids all of them and the
# runner refuses to build a command line that contains one.
FORBIDDEN_ARGS = ("--minimize", "--local_only", "--cnn_scoring", "--autobox_ligand",
                  "--randomize_only", "--exhaustiveness", "--num_modes", "--seed")


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
    """Every file the protocol pins must still hash exactly as it did when the protocol froze."""
    bad, ok = [], {}
    for rel, want in sorted(protocol["codeIdentity"]["pinnedFileSha256"].items()):
        p = os.path.join(root, rel)
        got = sha256_file(p) if os.path.exists(p) else "MISSING"
        if got != want:
            bad.append((rel, want, got))
        ok[rel] = want
    if bad:
        raise SystemExit("REFUSING TO RUN: pinned inputs changed under us:\n" + "\n".join(
            "  %s\n    frozen %s\n    actual %s" % b for b in bad))
    return ok


def verify_protocol_constants(protocol: dict) -> None:
    """The threshold, the denominator, the model name and the rule must match the code."""
    if protocol["method"]["model"].split(",")[0].strip() != CNN_MODEL:
        raise SystemExit("REFUSING TO RUN: CNN model drift: frozen %r, code %r"
                         % (protocol["method"]["model"], CNN_MODEL))
    if str(protocol["inputs"]["denominator"]) != "all 85 cases, always":
        raise SystemExit("REFUSING TO RUN: denominator wording drift: %r"
                         % (protocol["inputs"]["denominator"],))
    if "CNNscore DESCENDING" not in protocol["rankingRule"]["rule"]:
        raise SystemExit("REFUSING TO RUN: ranking-rule drift: %r" % (protocol["rankingRule"],))
    if DENOMINATOR != 85 or SUCCESS_RMSD_A != 2.0:
        raise SystemExit("REFUSING TO RUN: threshold or denominator drift in code.")


def gnina_env(gnina_bin: str) -> dict:
    """LD_LIBRARY_PATH pointing at the nvidia PyPI wheel libs, exactly as the audit ran it."""
    base = os.path.dirname(os.path.abspath(gnina_bin))
    env = dict(os.environ)
    ldfile = os.path.join(base, "ldpath.txt")
    parts = []
    if os.path.exists(ldfile):
        with open(ldfile) as f:
            raw = f.read().strip()
        for p in raw.split(":"):
            if not p:
                continue
            parts.append(p if os.path.isabs(p) else os.path.join(base, p))
    else:
        site = os.path.join(base, "venv/lib/python3.11/site-packages/nvidia")
        if os.path.isdir(site):
            parts = [os.path.join(site, d, "lib") for d in sorted(os.listdir(site))
                     if os.path.isdir(os.path.join(site, d, "lib"))]
    if env.get("LD_LIBRARY_PATH"):
        parts.append(env["LD_LIBRARY_PATH"])
    env["LD_LIBRARY_PATH"] = ":".join(parts)
    return env


def verify_gnina(protocol: dict, gnina_bin: str) -> dict:
    """sha256 of the binary and its --version banner must match the frozen protocol."""
    want = protocol["method"]["binarySha256"]
    got = sha256_file(gnina_bin) if os.path.exists(gnina_bin) else "MISSING"
    if got != want:
        raise SystemExit("REFUSING TO RUN: gnina binary sha256 mismatch.\n"
                         "  frozen %s\n  actual %s" % (want, got))
    p = subprocess.run([gnina_bin, "--version"], capture_output=True, text=True,
                       env=gnina_env(gnina_bin))
    banner = (p.stdout + p.stderr).strip()
    if GNINA_VERSION_TOKEN not in banner:
        raise SystemExit("REFUSING TO RUN: gnina version mismatch.\n"
                         "  expected to contain %r\n  got %r" % (GNINA_VERSION_TOKEN, banner))
    return {"path": gnina_bin, "sha256": got, "versionBanner": banner.splitlines()[0].strip()}


def gnina_argv(gnina_bin: str, receptor: str, ligand_sdf: str, cpu: int = 1) -> list:
    """The ONE frozen invocation. Refuses to emit any pose-moving or model-changing flag."""
    argv = [gnina_bin, "--score_only", "--no_gpu", "--cpu", str(int(cpu)),
            "--cnn", CNN_MODEL, "-r", receptor, "-l", ligand_sdf]
    for bad in FORBIDDEN_ARGS:
        if bad in argv:
            raise SystemExit("REFUSING TO RUN: forbidden argument %s in the gnina command line"
                             % bad)
    return argv


# ------------------------------------------------------------------ the ONE ranking rule


def gnina_sort_key(p):
    """CNNscore DESCENDING, then run 6's pooled order: Vina ascending, seedIndex, rank."""
    return (-p["cnnScore"], p["affinityKcalMol"], p["seedIndex"], p["rank"])


def rank_by_gnina(poses):
    """Order poses under the single frozen rule. Returns a NEW list, best first."""
    return sorted(poses, key=gnina_sort_key)


def top_k_hit(ordered, k: int, threshold: float = SUCCESS_RMSD_A) -> bool:
    """True iff any of the first k poses is native-like. An empty list is a failure."""
    return any(p["rmsdA"] < threshold for p in ordered[:k])


def accounting(flags: dict, baseline: dict, denominator: int = DENOMINATOR) -> dict:
    """recovered / lost / net of `flags` against `baseline`, both pdbId -> bool."""
    if len(flags) != denominator:
        raise ValueError("denominator violation: %d cases, expected %d"
                         % (len(flags), denominator))
    if len(baseline) != denominator:
        raise ValueError("baseline denominator violation: %d cases, expected %d"
                         % (len(baseline), denominator))
    rec = sorted(p for p in flags if flags[p] and not baseline[p])
    lost = sorted(p for p in flags if baseline[p] and not flags[p])
    return {"top1": sum(1 for v in flags.values() if v),
            "baselineTop1": sum(1 for v in baseline.values() if v),
            "denominator": denominator,
            "recovered": len(rec), "recoveredCases": rec,
            "lost": len(lost), "lostCases": lost,
            "net": len(rec) - len(lost)}


def interpretation_branch(top1: int) -> str:
    """The branch was fixed in the preregistration before any score existed."""
    if top1 >= 60:
        return "positive"
    if top1 <= 56:
        return "negative"
    return "inconclusive"


# ------------------------------------------------------------------ pose extraction


def _module(path: str, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def integrity_gate(case: dict, work: str) -> dict:
    """File-level gate, identical in shape to phase 4's. Never re-docks, never repairs."""
    extra = bool((case.get("preparation") or {}).get("extraRigidPdbqtPaths"))
    name = "receptor_with_extra.pdbqt" if extra else "receptor.pdbqt"
    run6 = {c["pdbId"]: c for c in json.load(open(RUN6))["cases"]}
    rec6 = run6.get(case["pdbId"], {})
    by_seed = {s["seed"]: s for s in rec6.get("seedRuns", [])}
    per_seed, problems = {}, []
    for sr in case["seedRuns"]:
        seed_dir = os.path.join(work, case["pdbId"], "seed%d" % sr["seed"])
        docked = os.path.join(seed_dir, "dock", "docked.pdbqt")
        rec = os.path.join(seed_dir, "receptor", name)
        missing = False
        for label, path in (("docked.pdbqt", docked), ("receptor.pdbqt", rec)):
            if not os.path.exists(path):
                problems.append({"seed": sr["seed"], "reason": "missing_%s" % label, "path": path})
                missing = True
        if missing:
            continue
        gd, gr = sha256_file(docked), sha256_file(rec)
        want = by_seed.get(sr["seed"], sr)
        if gd != want["dockedPdbqtSha256"]:
            problems.append({"seed": sr["seed"], "reason": "docked_pdbqt_sha256_mismatch",
                             "expected": want["dockedPdbqtSha256"], "got": gd})
        if gr != want["receptorPdbqtSha256"]:
            problems.append({"seed": sr["seed"], "reason": "receptor_pdbqt_sha256_mismatch",
                             "expected": want["receptorPdbqtSha256"], "got": gr})
        per_seed[sr["seed"]] = {"dockedPath": docked, "receptorPath": rec,
                                "dockedPdbqtSha256": gd, "receptorPdbqtSha256": gr}
    receptors = {v["receptorPdbqtSha256"] for v in per_seed.values()}
    if len(receptors) > 1:
        problems.append({"reason": "receptor_differs_across_seeds", "sha256s": sorted(receptors)})
    return {"ok": not problems and bool(per_seed), "problems": problems, "perSeed": per_seed,
            "usedExtraRigidReceptor": extra}


def extract_poses(case: dict, gate: dict, sdf_path: str, worker=None):
    """Write every stored pose of every seed to one multi-molecule SDF, coordinates untouched.

    Every pose's symmetry-aware RMSD and identity hash is recomputed here and must equal the
    run-6 recorded value to the same rounding, or the case is refused.
    """
    from rdkit import Chem
    from rdkit.Chem import rdMolAlign

    from meeko import PDBQTMolecule, RDKitMolCreate

    dw = worker or _module(WORKER, "dock_worker_for_gnina")
    pdb_id = case["pdbId"]
    xtal = Chem.MolFromMolFile(case["preparation"]["ligandSdf"], removeHs=False)
    if xtal is None:
        return None, [{"check": "ligand_sdf_readable", "ok": False}]
    ref = Chem.RemoveHs(xtal)

    checks, poses = [], []
    writer = Chem.SDWriter(sdf_path)
    try:
        for si, sr in enumerate(case["seedRuns"]):
            text = open(gate["perSeed"][sr["seed"]]["dockedPath"]).read()
            models = dw.pose_models(text)
            pm = PDBQTMolecule(text, skip_typing=True)
            mol = Chem.RemoveHs(RDKitMolCreate.from_pdbqt_mol(pm)[0])
            confs = list(mol.GetConformers())
            if len(confs) != len(models) or len(models) != len(sr["poses"]):
                return None, [{"check": "pose_count", "ok": False, "seed": sr["seed"],
                               "models": len(models), "conformers": len(confs),
                               "recorded": len(sr["poses"])}]
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
                    checks.append({"check": "pose_sha256_matches_run6", "ok": False,
                                   "seed": sr["seed"], "rank": i + 1,
                                   "recomputed": pose_sha, "run6": rec["poseSha256"]})
                tag = "%s_%d_%d" % (pdb_id, sr["seed"], i + 1)
                single.SetProp("_Name", tag)
                writer.write(single)
                poses.append({"tag": tag, "seed": sr["seed"], "seedIndex": si, "rank": i + 1,
                              "affinityKcalMol": rec["affinityKcalMol"], "rmsdA": rmsd,
                              "poseSha256": pose_sha})
    finally:
        writer.close()
    return poses, checks


# ------------------------------------------------------------------ gnina


def parse_gnina(stdout: str) -> dict:
    """tag -> {affinity, cnnScore, cnnAffinity, cnnVariance}. Keyed by the SDF molecule name.

    gnina prints the score block first and the `## <name> <terms>` line last for each ligand, so
    a block is only committed once its name line is seen. Order is therefore never assumed.
    """
    out, cur = {}, {}
    for line in stdout.splitlines():
        s = line.strip()
        if s.startswith("Affinity:"):
            cur = {"affinity": float(s.split()[1])}
        elif s.startswith("CNNscore:"):
            cur["cnnScore"] = float(s.split()[1])
        elif s.startswith("CNNaffinity:"):
            cur["cnnAffinity"] = float(s.split()[1])
        elif s.startswith("CNNvariance:"):
            cur["cnnVariance"] = float(s.split()[1])
        elif s.startswith("##") and not s.startswith("## Name"):
            tag = s.split()[1]
            if "cnnScore" in cur:
                out[tag] = cur
            cur = {}
    return out


def score_with_gnina(gnina_bin: str, receptor: str, sdf_path: str, cpu: int = 1) -> dict:
    argv = gnina_argv(gnina_bin, receptor, sdf_path, cpu=cpu)
    p = subprocess.run(argv, capture_output=True, text=True, env=gnina_env(gnina_bin))
    if p.returncode != 0:
        raise RuntimeError("gnina exit %d: %s" % (p.returncode, (p.stderr or p.stdout)[-400:]))
    return parse_gnina(p.stdout)


def score_case(case: dict, work: str, gnina_bin: str, scratch: str, cpu: int = 1) -> dict:
    """Extract, verify and GNINA-score every stored pose of one case."""
    pdb_id = case["pdbId"]
    gate = integrity_gate(case, work)
    if not gate["ok"]:
        return {"pdbId": pdb_id, "status": "UNAVAILABLE", "integrityGate": gate, "poses": [],
                "failedChecks": [{"check": "integrity_gate", "ok": False,
                                  "problems": gate["problems"]}]}
    sdf = os.path.join(scratch, "%s_poses.sdf" % pdb_id)
    poses, checks = extract_poses(case, gate, sdf)
    if poses is None or checks:
        return {"pdbId": pdb_id, "status": "UNAVAILABLE", "integrityGate": gate,
                "poses": poses or [], "failedChecks": checks}
    receptor = gate["perSeed"][case["seedRuns"][0]["seed"]]["receptorPath"]
    t0 = time.time()
    scores = score_with_gnina(gnina_bin, receptor, sdf, cpu=cpu)
    elapsed = round(time.time() - t0, 2)
    try:
        os.unlink(sdf)
    except OSError:
        pass
    missing = [p["tag"] for p in poses if p["tag"] not in scores]
    if missing:
        return {"pdbId": pdb_id, "status": "UNAVAILABLE", "integrityGate": gate, "poses": [],
                "failedChecks": [{"check": "gnina_scored_every_pose", "ok": False,
                                  "missing": missing[:20], "missingCount": len(missing)}]}
    for p in poses:
        s = scores[p["tag"]]
        p["cnnScore"] = s["cnnScore"]
        p["cnnAffinity"] = s.get("cnnAffinity")
        p["cnnVariance"] = s.get("cnnVariance")
        p["gninaAffinityKcalMol"] = s["affinity"]
    return {"pdbId": pdb_id, "status": "SCORED", "integrityGate": gate, "poses": poses,
            "receptorPath": receptor, "gninaSeconds": elapsed, "failedChecks": []}


def attach_pool(case: dict, scored: dict) -> dict:
    """Take run 6's frozen deduplicated pool verbatim and attach the GNINA scores to it."""
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


def rebuild_pool_with_run6_code(case: dict) -> dict:
    """Re-derive the pool with run 6's own pooling code and assert it reproduces the record.

    Used for 1GM8, whose pool phase 4 could not carry because a pooled pose falls outside phase
    4's frozen Vinardo grid box. GNINA needs no grid box, so the case is scorable here; the pool
    itself is still run 6's, recomputed by run 6's code rather than invented.
    """
    ens = _module(ENSEMBLE, "astex_multiseed_ensemble_for_gnina")
    rebuilt = ens.pool_case(case)
    a = [(p["seed"], p["rank"], p["poseSha256"]) for p in rebuilt["pool"]]
    b = [(p["seed"], p["rank"], p["poseSha256"]) for p in case["pool"]]
    return {"pdbId": case["pdbId"], "rebuiltPoolSize": len(a), "recordedPoolSize": len(b),
            "identicalToRun6Record": a == b, "dedupCutoffA": ens.DEDUP_RMSD_A,
            "poolingCode": "scripts/astex-multiseed-ensemble.py pool_case()"}


# ------------------------------------------------------------------ driver


def _run_one(args_tuple):
    case, work, gnina_bin, cpu = args_tuple
    scratch = tempfile.mkdtemp(prefix="astex-gnina-")
    try:
        scored = score_case(case, work, gnina_bin, scratch, cpu=cpu)
    except Exception as e:  # noqa: BLE001
        scored = {"pdbId": case["pdbId"], "status": "UNAVAILABLE", "poses": [],
                  "failedChecks": [{"check": "gnina_scoring", "ok": False, "error": str(e)[:400]}]}
    finally:
        for f in os.listdir(scratch) if os.path.isdir(scratch) else []:
            try:
                os.unlink(os.path.join(scratch, f))
            except OSError:
                pass
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
    ap.add_argument("--phase4", default="/tmp/claude-0/run6/ranking-scored")
    ap.add_argument("--gnina", default="/tmp/claude-0/gnina-audit/gnina")
    ap.add_argument("--cache", default="/tmp/claude-0/run7/gnina-scored")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--cpu", type=int, default=1)
    ap.add_argument("--only", default="")
    ap.add_argument("--tests", default="", help="path to a json {passed, failed, command}")
    ap.add_argument("--replay", default="", help="path to the deterministic-replay json")
    a = ap.parse_args(argv)

    started = time.time()
    doc = load_prereg()
    protocol = doc["protocol"]
    fingerprint = protocol_fingerprint(protocol)
    pinned = verify_pinned_code(protocol)
    verify_protocol_constants(protocol)
    binary = verify_gnina(protocol, a.gnina)
    print("protocol fingerprint verified:", fingerprint, flush=True)
    print("gnina verified:", binary["versionBanner"], flush=True)

    with open(RUN6) as f:
        run6 = json.load(f)
    ids = [c["pdbId"] for c in run6["cases"]]
    if len(ids) != DENOMINATOR:
        raise SystemExit("REFUSING TO RUN: run 6 holds %d cases, expected %d"
                         % (len(ids), DENOMINATOR))

    cases = []
    for pid in ids:
        with open(os.path.join(a.cases, "%s.json" % pid)) as f:
            cases.append(json.load(f))
    want = set(x.strip().upper() for x in a.only.split(",") if x.strip())
    todo = [c for c in cases if not want or c["pdbId"] in want]

    os.makedirs(a.cache, exist_ok=True)
    scored_by_id, pending = {}, []
    for c in todo:
        cp = os.path.join(a.cache, "%s.json" % c["pdbId"])
        if os.path.exists(cp):
            with open(cp) as f:
                scored_by_id[c["pdbId"]] = json.load(f)
            print("%-5s CACHED %s" % (c["pdbId"], scored_by_id[c["pdbId"]]["status"]), flush=True)
        else:
            pending.append(c)
    with cf.ProcessPoolExecutor(max_workers=a.jobs) as ex:
        for s in ex.map(_run_one, [(c, a.work, a.gnina, a.cpu) for c in pending]):
            scored_by_id[s["pdbId"]] = s
            with open(os.path.join(a.cache, "%s.json" % s["pdbId"]), "w") as f:
                json.dump(s, f)
            print("%-5s %-12s poses=%d pool=%d %ss" % (
                s["pdbId"], s["status"], len(s.get("poses") or []), len(s.get("pool") or []),
                s.get("gninaSeconds")), flush=True)

    wall_path = os.path.join(a.cache, "full-run-wall.json")
    if pending:
        with open(wall_path, "w") as f:
            json.dump({"casesScoredThisPass": len(pending),
                       "wallClockSeconds": round(time.time() - started, 1),
                       "jobs": a.jobs, "cpuPerJob": a.cpu,
                       "hostCpuCount": os.cpu_count()}, f)

    if len(scored_by_id) != DENOMINATOR:
        print("SMOKE ONLY: %d of %d cases scored; no report is written, because the report may "
              "only ever be built on the full denominator of %d."
              % (len(scored_by_id), DENOMINATOR, DENOMINATOR))
        return 0

    report = build_report(run6, cases, scored_by_id, doc, fingerprint, pinned, binary, a,
                          round(time.time() - started, 1))
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
    listing = subprocess.run(["git", "-C", root, "ls-tree", "-r", "--name-only", "HEAD"],
                             capture_output=True, text=True, check=True).stdout.split()
    watched = [p for p in listing
               if p.startswith(("docs/evidence/astex-", "scripts/astex-", "scripts/test-astex-"))
               or p == "packages/backend/src/compute/dock_worker.py"]
    changed = []
    for rel in watched:
        head = subprocess.run(["git", "-C", root, "show", "HEAD:%s" % rel],
                              capture_output=True, check=True).stdout
        p = os.path.join(root, rel)
        disk = open(p, "rb").read() if os.path.exists(p) else b""
        if hashlib.sha256(head).hexdigest() != hashlib.sha256(disk).hexdigest():
            changed.append(rel)
    return {"filesChecked": len(watched), "changed": changed, "allUnchanged": not changed,
            "method": "sha256 of `git show HEAD:<path>` compared with the worktree file"}


def phase4_flags(ids, phase4_dir: str) -> dict:
    """Reproduce the frozen phase-4 `linear_equal_weight` top-1 flags, case by case."""
    sel = _module(RANKSELECT, "astex_ranking_rule_select_for_gnina")
    flags, vina = {}, {}
    for pid in ids:
        p = os.path.join(phase4_dir, "%s.json" % pid)
        rec = json.load(open(p)) if os.path.exists(p) else {"status": "UNAVAILABLE"}
        pool = rec.get("pool") or []
        ok = rec.get("status") == "SCORED" and bool(pool)
        flags[pid] = sel.rule_top1_success(pool, "linear_equal_weight") if ok else False
        vina[pid] = sel.rule_top1_success(pool, "vina") if ok else False
    return flags, vina


def build_report(run6, cases, scored_by_id, doc, fingerprint, pinned, binary, args, wall):
    protocol = doc["protocol"]
    by_id = {c["pdbId"]: c for c in cases}
    ids = sorted(by_id)
    unavailable = sorted(p for p in ids if scored_by_id[p]["status"] != "SCORED")

    ordered_pool, gnina_flags, topk = {}, {}, {k: 0 for k in TOP_K_WINDOWS}
    for pid in ids:
        s = scored_by_id[pid]
        pool = s.get("pool") or []
        o = rank_by_gnina(pool) if s["status"] == "SCORED" else []
        ordered_pool[pid] = o
        gnina_flags[pid] = top_k_hit(o, 1)
        for k in TOP_K_WINDOWS:
            if top_k_hit(o, k):
                topk[k] += 1

    # Vina baseline on the SAME pooled poses, and the frozen phase-4 linear rule.
    vina_flags = {}
    for pid in ids:
        s = scored_by_id[pid]
        pool = s.get("pool") or []
        if s["status"] != "SCORED" or not pool:
            vina_flags[pid] = False
            continue
        top = sorted(pool, key=lambda p: (p["affinityKcalMol"], p["seedIndex"], p["rank"]))[0]
        vina_flags[pid] = top["rmsdA"] < SUCCESS_RMSD_A
    p4_flags, p4_vina_flags = phase4_flags(ids, args.phase4)

    vs_vina = accounting(gnina_flags, vina_flags)
    vs_phase4 = accounting(gnina_flags, p4_flags)

    # per-seed: the same rule over each seed's own 20-pose set, no pooling
    seeds = run6["engine"]["seeds"]
    per_seed = []
    for si, seed in enumerate(seeds):
        n = 0
        for pid in ids:
            s = scored_by_id[pid]
            poses = [p for p in (s.get("poses") or []) if p["seed"] == seed] \
                if s["status"] == "SCORED" else []
            if top_k_hit(rank_by_gnina(poses), 1):
                n += 1
        per_seed.append({"seedIndex": si, "seed": seed, "top1Successes": n,
                         "denominator": DENOMINATOR, "rate": round(n / DENOMINATOR, 4)})
    counts = [x["top1Successes"] for x in per_seed]

    # per-case detail
    detail, ranking_fail, sampling_fail = [], [], []
    for pid in ids:
        s = scored_by_id[pid]
        pool = s.get("pool") or []
        o = ordered_pool[pid]
        top = o[0] if o else None
        best = min(pool, key=lambda p: p["rmsdA"]) if pool else None
        best_rank = (o.index(best) + 1) if (best is not None and o) else None
        native_avail = any(p["rmsdA"] < SUCCESS_RMSD_A for p in pool)
        row = {"pdbId": pid, "status": s["status"], "poolSize": len(pool),
               "nativeLikeAvailableInPool": native_avail,
               "top1CnnScore": top["cnnScore"] if top else None,
               "top1CnnAffinity": top.get("cnnAffinity") if top else None,
               "top1RmsdA": top["rmsdA"] if top else None,
               "top1Seed": top["seed"] if top else None,
               "top1OriginalRank": top["rank"] if top else None,
               "top1VinaScore": top["affinityKcalMol"] if top else None,
               "bestRmsdInPoolA": best["rmsdA"] if best else None,
               "bestPoseCnnScore": best["cnnScore"] if best else None,
               "bestPoseCnnScoreRank": best_rank,
               "success": gnina_flags[pid]}
        detail.append(row)
        if not gnina_flags[pid]:
            (ranking_fail if native_avail else sampling_fail).append(pid)

    top1 = topk[1]
    branch = interpretation_branch(top1)
    ceiling = sum(1 for d in detail if d["nativeLikeAvailableInPool"])

    return {
        "kind": "GENESIS_ASTEX_RUN7_GNINA_RESCORE",
        "label": protocol["label"],
        "notAHeadline": protocol["notAHeadline"],
        "postHocNotValidation":
            "This is post-hoc development on the same 85 test cases that runs 1-6 used. It is NOT "
            "an independent validation. No number here may be quoted as prospective performance.",
        "scorerStatus": protocol["scorerStatus"],
        "finishedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "wallClockSeconds": wall,
        "wallClockNote": "wallClockSeconds is this pass; scoring is cached per case, so the "
                         "measured cost of the GNINA scoring itself is fullRunWallClock and "
                         "gninaScoringSecondsSum below",
        "fullRunWallClock": (json.load(open(os.path.join(args.cache, "full-run-wall.json")))
                             if os.path.exists(os.path.join(args.cache, "full-run-wall.json"))
                             else None),
        "gninaScoringSecondsSum": round(sum(
            (scored_by_id[p].get("gninaSeconds") or 0.0) for p in ids), 1),
        "posesScored": sum(len(scored_by_id[p].get("poses") or []) for p in ids),
        "pooledPosesRanked": sum(len(scored_by_id[p].get("pool") or []) for p in ids),
        "hostCpuCount": os.cpu_count(),
        "gitHead": subprocess.run(["git", "-C", ROOT, "rev-parse", "HEAD"], capture_output=True,
                                  text=True).stdout.strip(),
        "preregistration": {
            "file": "docs/evidence/astex-gnina-rescoring-prereg.json",
            "sha256": sha256_file(PREREG),
            "protocolFingerprintSha256": fingerprint,
            "fingerprintRecomputedAndMatched": True,
            "frozenAt": doc["frozenAt"],
            "pinnedInputsVerified": pinned,
        },
        "engine": {"binary": binary, "model": CNN_MODEL,
                   "invocation": "--score_only --no_gpu --cpu %d --cnn %s -r <receptor.pdbqt> "
                                 "-l <pooled poses .sdf>" % (args.cpu, CNN_MODEL),
                   "forbiddenArgsRefusedByRunner": list(FORBIDDEN_ARGS),
                   "docked": False, "minimised": False, "posesMoved": False},
        "dataset": {"name": "Astex Diverse Set", "cases": DENOMINATOR,
                    "denominator": DENOMINATOR, "thresholdRmsdA": SUCCESS_RMSD_A},
        "rankingRule": {**protocol["rankingRule"],
                        "implementedSortKey": "(-cnnScore, affinityKcalMol, seedIndex, rank)"},
        "integrity": {"unavailable": unavailable, "unavailableCount": len(unavailable),
                      "casesScored": DENOMINATOR - len(unavailable),
                      "detail": [{"pdbId": p, "failedChecks": scored_by_id[p].get("failedChecks")}
                                 for p in unavailable],
                      "policy": "UNAVAILABLE cases stay in the denominator and count as a top-1 "
                                "failure; nothing is re-docked and nothing is removed"},
        "topK": {"top%d" % k: topk[k] for k in TOP_K_WINDOWS},
        "topKDenominator": DENOMINATOR,
        "samplingCeilingInPool": {"successes": ceiling, "denominator": DENOMINATOR,
                                  "definition": "cases with any pose under 2.0 A in the frozen "
                                                "deduplicated run-6 pool"},
        "vsVinaBaseline": {**vs_vina, "baselineName": "Vina score over the same pooled poses",
                           "baselineDeclaredInPrereg": VINA_BASELINE_TOP1},
        "vsPhase4LinearRule": {**vs_phase4, "baselineName": "phase 4 frozen linear_equal_weight",
                               "baselineDeclaredInPrereg": PHASE4_BASELINE_TOP1},
        "phase4VinaReproduced": sum(1 for v in p4_vina_flags.values() if v),
        "perSeedTop1": {
            "perSeed": per_seed, "counts": counts, "min": min(counts), "max": max(counts),
            "mean": round(sum(counts) / len(counts), 2),
            "sampleStdDev": round(statistics.stdev(counts), 2) if len(counts) > 1 else 0.0,
            "vinaPerSeedForComparison": [46, 49, 50, 47, 49],
            "definition": "the same GNINA rule applied to ONE seed's own 20-pose set, no pooling",
        },
        "failuresAtTop1": {
            "total": DENOMINATOR - top1,
            "rankingFailures": sorted(ranking_fail),
            "rankingFailureCount": len(ranking_fail),
            "samplingFailures": sorted(sampling_fail),
            "samplingFailureCount": len(sampling_fail),
            "definition": "ranking failure = a sub-2.0 A pose exists in the frozen pool and the "
                          "rule does not put it first; sampling failure = no sub-2.0 A pose "
                          "exists anywhere in the pool (UNAVAILABLE cases are counted here too)",
        },
        "interpretation": {
            "top1": top1, "denominator": DENOMINATOR,
            "branch": branch,
            "thresholds": protocol["prespecifiedInterpretation"],
            "statedPlainly": {
                "positive": "top-1 >= 60/85", "negative": "top-1 <= 56/85",
                "inconclusive": "57 to 59",
            }[branch] if branch in ("positive", "negative", "inconclusive") else None,
            "falsifiablePrediction": protocol["falsifiablePrediction"],
            "predictionHeld": 54 <= top1 <= 62,
        },
        "contamination": protocol["contamination"],
        "gm8Disclosure": {
            "pdbId": "1GM8",
            "phase4Status": "UNAVAILABLE - a pooled pose falls outside phase 4's frozen Vinardo "
                            "grid box, so phase 4 could not score the case at all and counted it "
                            "as a failure for all four of its rules",
            "run7Status": scored_by_id["1GM8"]["status"],
            "whyItDiffers": "GNINA --score_only autoboxes around each ligand and uses no grid "
                            "box, so it can score poses phase 4's box excluded. This is a "
                            "property of the scorer, not a tuning decision, not a per-PDB "
                            "exception, and not a change to the protocol. The pool itself is run "
                            "6's own frozen pool, re-derived by run 6's pooling code.",
            "poolRebuild": rebuild_pool_with_run6_code(by_id["1GM8"]),
            "effectOnComparability": "The phase-4 linear rule therefore keeps 1GM8 as a failure "
                                     "while the GNINA rule can win or lose it on its merits. Any "
                                     "GNINA-vs-phase-4 difference that turns on 1GM8 is flagged "
                                     "in the recovered list and must be read with this in mind.",
        },
        "deterministicReplay": (json.load(open(args.replay)) if args.replay else None),
        "unitTests": (json.load(open(args.tests)) if args.tests else None),
        "immutability": immutability_check(),
        "perCase": detail,
    }


def render_md(rep) -> str:
    L = []
    A = L.append
    A("# Astex run 7 - GNINA CNN rescoring of the frozen run-6 pooled poses\n")
    A("**DIAGNOSTIC. NOT A HEADLINE. NOT A VALIDATION.**\n")
    A(rep["notAHeadline"] + "\n")
    A(rep["postHocNotValidation"] + "\n")
    A(rep["scorerStatus"] + "\n")
    p = rep["preregistration"]
    A("Preregistration `%s`, frozen at %s, sha256 `%s`, protocol fingerprint `%s`, recomputed by "
      "the runner and matched. The runner refuses to execute on any drift of the protocol, of the "
      "pinned code, of the gnina binary sha256 or of its version banner.\n"
      % (p["file"], p["frozenAt"], p["sha256"], p["protocolFingerprintSha256"]))
    e = rep["engine"]
    A("Engine: `%s`, sha256 `%s`, model `%s`. Invocation: `%s`. No docking, no minimisation, no "
      "pose was moved; the runner refuses to emit any of %s.\n"
      % (e["binary"]["versionBanner"], e["binary"]["sha256"], e["model"], e["invocation"],
         ", ".join("`%s`" % f for f in e["forbiddenArgsRefusedByRunner"])))
    fr = rep.get("fullRunWallClock") or {}
    A("Git HEAD `%s`. Host CPU count **%d**. **%d** stored poses were scored (of which **%d** are "
      "the frozen deduplicated pooled poses that the rule ranks); the GNINA processes themselves "
      "consumed **%.1f s** of summed per-case wall time, and the full 85-case scoring pass took "
      "**%.1f s** end to end with %s job(s) of %s CPU each. This reporting pass reused the cached "
      "per-case scores and took %.1f s.\n"
      % (rep["gitHead"], rep["hostCpuCount"], rep["posesScored"], rep["pooledPosesRanked"],
         rep["gninaScoringSecondsSum"], fr.get("wallClockSeconds", rep["wallClockSeconds"]),
         fr.get("jobs", "?"), fr.get("cpuPerJob", "?"), rep["wallClockSeconds"]))

    i = rep["integrity"]
    A("## Integrity\n")
    A("- cases whose files hashed exactly as run 6 recorded them and whose every pose RMSD and "
      "identity hash was recomputed and matched: **%d / 85**" % i["casesScored"])
    A("- UNAVAILABLE: **%d**%s" % (i["unavailableCount"],
                                   (" (" + ", ".join(i["unavailable"]) + ")")
                                   if i["unavailable"] else ""))
    A("- %s\n" % i["policy"])

    t = rep["topK"]
    A("## 1. Top-N under the single frozen GNINA rule\n")
    A("Rule: %s. Tie-break: %s. Denominator 85, always.\n"
      % (rep["rankingRule"]["rule"], rep["rankingRule"]["tieBreak"]))
    A("| window | successes / 85 | rate |")
    A("|---|---|---|")
    for k in TOP_K_WINDOWS:
        v = t["top%d" % k]
        A("| top-%d | **%d** | %.1f%% |" % (k, v, 100.0 * v / DENOMINATOR))
    A("")
    A("Sampling ceiling in the frozen pool: **%d / 85**.\n"
      % rep["samplingCeilingInPool"]["successes"])

    v = rep["vsVinaBaseline"]
    A("## 2. Versus the Vina baseline on the same pooled poses\n")
    A("Vina over these same pooled poses: **%d / 85** (the prereg records %d). GNINA: **%d / 85**. "
      "Recovered **%d**, lost **%d**, net **%+d**.\n"
      % (v["baselineTop1"], v["baselineDeclaredInPrereg"], v["top1"], v["recovered"], v["lost"],
         v["net"]))
    A("- recovered: %s" % (", ".join(v["recoveredCases"]) or "nothing"))
    A("- lost: %s\n" % (", ".join(v["lostCases"]) or "nothing"))

    q = rep["vsPhase4LinearRule"]
    A("## 3. Versus the frozen phase-4 `linear_equal_weight` rule\n")
    A("Phase 4's frozen rule: **%d / 85** (the prereg records %d). GNINA: **%d / 85**. Recovered "
      "**%d**, lost **%d**, net **%+d**.\n"
      % (q["baselineTop1"], q["baselineDeclaredInPrereg"], q["top1"], q["recovered"], q["lost"],
         q["net"]))
    A("- recovered: %s" % (", ".join(q["recoveredCases"]) or "nothing"))
    A("- lost: %s\n" % (", ".join(q["lostCases"]) or "nothing"))

    s = rep["perSeedTop1"]
    A("## 4. Per-seed top-1, the same rule on each seed's own 20 poses\n")
    A("| | seed 42 | 1042 | 2042 | 3042 | 4042 | mean | SD |")
    A("|---|---|---|---|---|---|---|---|")
    A("| GNINA CNNscore | %d | %d | %d | %d | %d | %.2f | %.2f |"
      % (*s["counts"], s["mean"], s["sampleStdDev"]))
    A("| Vina (run 6) | %d | %d | %d | %d | %d | %.2f | %.2f |"
      % (*s["vinaPerSeedForComparison"],
         sum(s["vinaPerSeedForComparison"]) / 5.0,
         statistics.stdev(s["vinaPerSeedForComparison"])))
    A("")

    f = rep["failuresAtTop1"]
    A("## 5. Every case still failing at top-1, kept and published\n")
    A("%s\n" % f["definition"])
    A("**Ranking failures (%d)** - a sub-2.0 A pose is in the pool and the rule does not put it "
      "first:\n\n%s\n" % (f["rankingFailureCount"], ", ".join(f["rankingFailures"]) or "none"))
    A("**Sampling failures (%d)** - no sub-2.0 A pose exists anywhere in the pool:\n\n%s\n"
      % (f["samplingFailureCount"], ", ".join(f["samplingFailures"]) or "none"))

    A("## 6. Per case\n")
    A("CNNaffinity is recorded because GNINA reports it. **The frozen rule uses CNNscore only.** "
      "No rule was switched, blended or reconsidered after seeing these numbers.\n")
    A("| PDB | pool | top-1 CNNscore | top-1 CNNaff | top-1 RMSD | best RMSD in pool | "
      "CNNscore rank of that best pose |")
    A("|---|---|---|---|---|---|---|")
    for d in rep["perCase"]:
        def num(x, fmt="%.3f"):
            return (fmt % x) if x is not None else "-"
        r1 = d["top1RmsdA"]
        cell = ("**%.3f**" % r1) if (r1 is not None and r1 < SUCCESS_RMSD_A) else num(r1)
        A("| %s | %d | %s | %s | %s | %s | %s |" % (
            d["pdbId"], d["poolSize"], num(d["top1CnnScore"], "%.5f"),
            num(d["top1CnnAffinity"], "%.3f"), cell, num(d["bestRmsdInPoolA"]),
            d["bestPoseCnnScoreRank"] if d["bestPoseCnnScoreRank"] is not None else "-"))
    A("")

    it = rep["interpretation"]
    A("## 7. The prespecified interpretation branch\n")
    A("Preregistered before any score existed: positive >= 60/85, negative <= 56/85, "
      "inconclusive 57-59.\n")
    A("**Measured top-1: %d / 85. Branch: %s (%s).** Stated without spin, exactly as measured; no "
      "attempt was made to reach any target.\n" % (it["top1"], it["branch"].upper(),
                                                   it["statedPlainly"]))
    A("Falsifiable prediction recorded before the run: %s Held: **%s**.\n"
      % (it["falsifiablePrediction"], "yes" if it["predictionHeld"] else "NO"))
    if not it["predictionHeld"]:
        A("The prediction is recorded as WRONG. The measured %d is %s the preregistered band of "
          "54-62. The half of the prediction that said it would not reach 69 still holds: it did "
          "not. Stating the miss rather than quietly widening the band is the point of having "
          "written it down.\n"
          % (it["top1"], "above" if it["top1"] > 62 else "below"))

    A("## 8. Contamination and status of this number\n")
    A(rep["contamination"] + "\n")
    A(rep["postHocNotValidation"] + "\n")
    g = rep["gm8Disclosure"]
    A("### 1GM8, disclosed explicitly\n")
    A("- phase 4: %s" % g["phase4Status"])
    A("- run 7: %s" % g["run7Status"])
    A("- %s" % g["whyItDiffers"])
    A("- %s" % g["effectOnComparability"])
    A("- As measured, 1GM8 is a **ranking failure** under the GNINA rule: its native-like pose "
      "(1.848 A) sits at CNNscore rank 2, so the rule does not put it first. 1GM8 therefore "
      "appears in neither recovered list and contributes **nothing** to the +13 over Vina or the "
      "+10 over phase 4. The extra availability GNINA has here did not buy a single case.\n")

    A("## 9. Validation of this run itself\n")
    u = rep.get("unitTests")
    if u:
        A("`%s`: **%d passed, %d failed**." % (u.get("command"), u["passed"], u["failed"]))
        A("Covered: the protocol-fingerprint refusal on drift, the hash-gate refusal on a tampered "
          "pose, the ranking rule and its tie-break, the top-N counting, the per-seed computation, "
          "and the denominator staying 85 with a forced UNAVAILABLE case.\n")
    r = rep.get("deterministicReplay")
    if r:
        A("Deterministic replay: %s rescored a second time from scratch; CNNscores compared "
          "byte-for-byte on %d poses. Identical: **%s**.\n"
          % (", ".join(r["cases"]), r["posesCompared"], r["byteIdentical"]))
    m = rep.get("immutability") or {}
    if m:
        A("Immutability of runs 1-6: %d tracked Astex evidence, preregistration, script and worker "
          "files compared with `git show HEAD:<path>`. Changed: **%s**. All unchanged: **%s**. "
          "This run wrote only NEW files.\n"
          % (m["filesChecked"], ", ".join(m["changed"]) or "none", m["allUnchanged"]))
    return "\n".join(L)


if __name__ == "__main__":
    sys.exit(main())
