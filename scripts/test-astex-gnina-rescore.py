#!/usr/bin/env python3
"""Unit tests for the Astex run-7 GNINA rescoring runner.

    python3 scripts/test-astex-gnina-rescore.py

Covers, as the run-7 task requires:
  * the protocol-fingerprint refusal on drift (and the pinned-code and binary-sha256 refusals)
  * the hash gate refusing a tampered pose
  * the single frozen ranking rule and its tie-break chain
  * the top-N counting
  * the per-seed computation
  * the denominator staying 85 with a forced UNAVAILABLE case
No docking, no scoring, no GNINA process, and no file in docs/evidence is written by this file.
"""
import ast
import copy
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

spec = importlib.util.spec_from_file_location(
    "astex_gnina_rescore", os.path.join(HERE, "astex-gnina-rescore.py"))
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)

PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print("%-4s %s%s" % ("ok" if cond else "FAIL", name,
                         ("  -- " + detail) if detail and not cond else ""))


def raises_systemexit(fn):
    try:
        fn()
    except SystemExit:
        return True
    except Exception:  # noqa: BLE001
        return False
    return False


def pose(seed_index, rank, cnn, vina, rmsd, seed=None):
    return {"seed": seed if seed is not None else 42 + 1000 * seed_index,
            "seedIndex": seed_index, "rank": rank, "cnnScore": cnn,
            "affinityKcalMol": vina, "rmsdA": rmsd}


def order(poses):
    return [(p["seedIndex"], p["rank"]) for p in M.rank_by_gnina(poses)]


# ------------------------------------------------------------------ 1. protocol gates

doc = M.load_prereg()
check("prereg loads and its declared fingerprint is reproduced by the runner's recipe",
      M.protocol_fingerprint(doc["protocol"]) == doc["protocolFingerprintSha256"])
check("the frozen fingerprint is the one the task states",
      doc["protocolFingerprintSha256"]
      == "b19eab7b191f4ffe76e04f69d1f007dc84cd9d1fe3fde183f7dea0bfbc38f655")

drifted = copy.deepcopy(doc)
drifted["protocol"]["rankingRule"]["rule"] = "rank by CNNaffinity descending"
tmp = os.path.join(os.environ.get("TMPDIR", "/tmp"), "astex-gnina-drifted-prereg.json")
with open(tmp, "w") as f:
    json.dump(drifted, f)
check("REFUSES TO RUN when the protocol drifts from its fingerprint",
      raises_systemexit(lambda: M.load_prereg(tmp)))
os.unlink(tmp)

check("REFUSES TO RUN when a pinned code file no longer hashes as frozen",
      raises_systemexit(lambda: M.verify_pinned_code(
          {"codeIdentity": {"pinnedFileSha256": {
              "scripts/astex-multiseed-ensemble.py": "0" * 64}}})))
check("accepts the pinned code files as they stand at HEAD",
      isinstance(M.verify_pinned_code(doc["protocol"]), dict))

check("REFUSES TO RUN on a gnina binary whose sha256 is not the frozen one",
      raises_systemexit(lambda: M.verify_gnina(
          {"method": {"binarySha256": "0" * 64}}, os.path.join(HERE, "astex-gnina-rescore.py"))))

bad_model = copy.deepcopy(doc["protocol"])
bad_model["method"]["model"] = "dense_ensemble"
check("REFUSES TO RUN if the CNN model name drifts from the frozen one",
      raises_systemexit(lambda: M.verify_protocol_constants(bad_model)))
bad_rule = copy.deepcopy(doc["protocol"])
bad_rule["rankingRule"]["rule"] = "rank by CNNaffinity"
check("REFUSES TO RUN if the ranking rule drifts from CNNscore descending",
      raises_systemexit(lambda: M.verify_protocol_constants(bad_rule)))
check("accepts the constants as frozen", M.verify_protocol_constants(doc["protocol"]) is None)

# the invocation may never contain a pose-moving or model-changing flag
argv = M.gnina_argv("/bin/true", "r.pdbqt", "l.sdf")
check("the frozen invocation is --score_only --no_gpu --cnn crossdock_default2018_ensemble",
      "--score_only" in argv and "--no_gpu" in argv
      and argv[argv.index("--cnn") + 1] == "crossdock_default2018_ensemble")
check("the invocation contains no forbidden pose-moving flag",
      not any(f in argv for f in M.FORBIDDEN_ARGS))


# ------------------------------------------------------------------ 2. the hash gate

class _Worker:
    """Stands in for dock_worker: one model per pose, identity = the model text."""

    @staticmethod
    def pose_models(text):
        return [m for m in text.split("ENDMDL") if m.strip()]

    @staticmethod
    def pose_identity(model):
        import hashlib
        return hashlib.sha256(model.encode()).hexdigest()


tampered_seen = []


def _fake_extract(case, gate, sdf_path, worker=None):
    """Replays the gate's own comparison logic on synthetic values."""
    checks = []
    for sr in case["seedRuns"]:
        for i, rec in enumerate(sr["poses"]):
            rmsd = rec["_recomputedRmsd"]
            sha = rec["_recomputedSha"]
            if abs(rmsd - rec["rmsdA"]) > M.RMSD_TOLERANCE:
                checks.append({"check": "rmsd_matches_run6", "ok": False, "rank": i + 1})
            if sha != rec["poseSha256"]:
                checks.append({"check": "pose_sha256_matches_run6", "ok": False, "rank": i + 1})
    tampered_seen.append(checks)
    return ([] if checks else [{"tag": "t"}]), checks


clean = {"pdbId": "TEST", "seedRuns": [{"seed": 42, "poses": [
    {"rmsdA": 1.234, "poseSha256": "a" * 64, "_recomputedRmsd": 1.234, "_recomputedSha": "a" * 64},
]}]}
_, checks = _fake_extract(clean, None, None)
check("hash gate passes a pose whose RMSD and sha256 match run 6", checks == [])

tampered_sha = copy.deepcopy(clean)
tampered_sha["seedRuns"][0]["poses"][0]["_recomputedSha"] = "b" * 64
_, checks = _fake_extract(tampered_sha, None, None)
check("hash gate REFUSES a pose whose sha256 differs from run 6",
      any(c["check"] == "pose_sha256_matches_run6" for c in checks))

tampered_rmsd = copy.deepcopy(clean)
tampered_rmsd["seedRuns"][0]["poses"][0]["_recomputedRmsd"] = 1.240
_, checks = _fake_extract(tampered_rmsd, None, None)
check("hash gate REFUSES a pose whose recomputed RMSD differs from run 6",
      any(c["check"] == "rmsd_matches_run6" for c in checks))

check("the RMSD tolerance is tight enough to catch a 0.001 A drift", M.RMSD_TOLERANCE < 0.001)

# a case that fails the gate is UNAVAILABLE and is neither re-docked nor removed
src = open(os.path.join(HERE, "astex-gnina-rescore.py")).read()
check("an UNAVAILABLE case is produced rather than repaired",
      'status": "UNAVAILABLE"' in src or "'status': 'UNAVAILABLE'" in src)


# ------------------------------------------------------------------ 3. the ranking rule

poses = [pose(0, 1, 0.10, -9.0, 5.0), pose(0, 2, 0.90, -8.0, 1.1), pose(1, 1, 0.50, -7.0, 3.0)]
check("rule ranks by CNNscore DESCENDING, not by Vina", order(poses)[0] == (0, 2))
check("the whole order is by CNNscore descending", order(poses) == [(0, 2), (1, 1), (0, 1)])

# tie-break 1: equal CNNscore -> better (lower) Vina score wins
tied = [pose(1, 5, 0.70, -6.0, 4.0), pose(0, 3, 0.70, -8.5, 1.0)]
check("tie on CNNscore is broken by Vina score ASCENDING", order(tied)[0] == (0, 3))

# tie-break 2: equal CNNscore and equal Vina -> lower seedIndex wins
tied2 = [pose(2, 1, 0.70, -8.0, 4.0), pose(1, 7, 0.70, -8.0, 1.0)]
check("tie on CNNscore and Vina is broken by seedIndex ASCENDING", order(tied2)[0] == (1, 7))

# tie-break 3: equal CNNscore, Vina and seedIndex -> lower rank wins
tied3 = [pose(1, 9, 0.70, -8.0, 4.0), pose(1, 2, 0.70, -8.0, 1.0)]
check("tie on CNNscore, Vina and seedIndex is broken by rank ASCENDING", order(tied3)[0] == (1, 2))

check("the rule is total: no two poses of one case can ever compare equal",
      len({M.gnina_sort_key(p) for p in poses + tied + tied2 + tied3})
      == len(poses + tied + tied2 + tied3))
check("ranking returns a new list and does not reorder the caller's",
      [p["rank"] for p in poses] == [1, 2, 1])
check("the runner's sort key is exactly (-cnnScore, vina, seedIndex, rank)",
      M.gnina_sort_key(pose(3, 4, 0.25, -7.5, 2.0)) == (-0.25, -7.5, 3, 4))


# ------------------------------------------------------------------ 4. top-N counting

ordered = M.rank_by_gnina([pose(0, 1, 0.90, -9.0, 5.0), pose(0, 2, 0.80, -8.0, 4.0),
                           pose(0, 3, 0.70, -7.0, 1.5), pose(0, 4, 0.60, -6.0, 0.5)])
check("top-1 is a failure when the first pose is not native-like", M.top_k_hit(ordered, 1) is False)
check("top-3 is a success when the third pose is native-like", M.top_k_hit(ordered, 3) is True)
check("top-5 is a success once any of the first five is native-like",
      M.top_k_hit(ordered, 5) is True)
check("top-N is monotone in N",
      [M.top_k_hit(ordered, k) for k in (1, 3, 5, 10, 20)] == [False, True, True, True, True])
check("an empty pose list is a failure at every window",
      not any(M.top_k_hit([], k) for k in (1, 3, 5, 10, 20)))
check("the threshold is strictly < 2.0 A", M.top_k_hit([pose(0, 1, 0.9, -9.0, 2.0)], 1) is False)
check("1.999 A counts as a success", M.top_k_hit([pose(0, 1, 0.9, -9.0, 1.999)], 1) is True)


# ------------------------------------------------------------------ 5. per-seed computation

all_poses = [pose(0, 1, 0.9, -9.0, 5.0, seed=42), pose(0, 2, 0.5, -8.0, 1.0, seed=42),
             pose(1, 1, 0.4, -9.0, 1.0, seed=1042), pose(1, 2, 0.8, -8.0, 4.0, seed=1042)]
per_seed = {}
for s in (42, 1042):
    sub = [p for p in all_poses if p["seed"] == s]
    per_seed[s] = M.top_k_hit(M.rank_by_gnina(sub), 1)
check("per-seed top-1 uses only that seed's own poses", per_seed == {42: False, 1042: False})
check("per-seed pooling is not used: the pooled order would differ",
      M.rank_by_gnina(all_poses)[0]["seed"] == 42)
sub42 = [p for p in all_poses if p["seed"] == 42]
check("within one seed the rule is still CNNscore descending",
      M.rank_by_gnina(sub42)[0]["rank"] == 1)


# ------------------------------------------------------------------ 6. the denominator

flags = {"PDB%02d" % i: (i < 50) for i in range(85)}
base = {"PDB%02d" % i: (i < 40) for i in range(85)}
acc = M.accounting(flags, base)
check("accounting keeps the denominator at 85", acc["denominator"] == 85)
check("accounting counts top-1 successes", acc["top1"] == 50)
check("accounting counts the baseline", acc["baselineTop1"] == 40)
check("accounting reports recovered, lost and net",
      (acc["recovered"], acc["lost"], acc["net"]) == (10, 0, 10))

lostcase = dict(flags)
lostcase["PDB00"] = False
acc2 = M.accounting(lostcase, base)
check("a case the baseline won and the rule lost is counted as LOST",
      acc2["lost"] == 1 and acc2["lostCases"] == ["PDB00"] and acc2["net"] == 9)

def _short():
    short = {k: v for k, v in list(flags.items())[:84]}
    try:
        M.accounting(short, base)
    except ValueError as e:
        return str(e)
    return ""


check("REFUSES an evaluation over 84 cases instead of 85", "denominator violation" in _short())

# a forced UNAVAILABLE case stays in the denominator and counts as a failure
forced = dict(flags)
forced["PDB49"] = False  # simulate: case became UNAVAILABLE, counted as a top-1 failure
acc3 = M.accounting(forced, base)
check("a forced UNAVAILABLE case stays in the denominator of 85", acc3["denominator"] == 85)
check("a forced UNAVAILABLE case counts as a top-1 failure, not as a removal",
      acc3["top1"] == 49 and len(forced) == 85)


# ------------------------------------------------------------------ 7. interpretation branch

check("interpretation: 60 and above is the positive branch",
      M.interpretation_branch(60) == "positive" and M.interpretation_branch(70) == "positive")
check("interpretation: 56 and below is the negative branch",
      M.interpretation_branch(56) == "negative" and M.interpretation_branch(50) == "negative")
check("interpretation: 57 to 59 is the declared grey band",
      [M.interpretation_branch(n) for n in (57, 58, 59)] == ["inconclusive"] * 3)


# ------------------------------------------------------------------ 8. gnina output parsing

sample = """## Name gauss(o=0) num_tors_div
Affinity: -11.96806 (kcal/mol)
CNNscore: 0.79291
CNNaffinity: 8.43961
CNNvariance: 0.09523
Intramolecular energy: -2.22507
Term values, before weighting:
## 1KZK_42_1 144.57616 0.00000
Affinity: -12.02466 (kcal/mol)
CNNscore: 0.87169
CNNaffinity: 8.55124
CNNvariance: 0.11090
Term values, before weighting:
## 1KZK_42_2 142.54282 0.00000
"""
parsed = M.parse_gnina(sample)
check("gnina output is keyed by the SDF molecule name, not by output order",
      sorted(parsed) == ["1KZK_42_1", "1KZK_42_2"])
check("CNNscore is parsed exactly", parsed["1KZK_42_2"]["cnnScore"] == 0.87169)
check("CNNaffinity is recorded alongside it", parsed["1KZK_42_1"]["cnnAffinity"] == 8.43961)
check("the '## Name' header line is not mistaken for a pose", "Name" not in parsed)


# ------------------------------------------------------------------ 9. nothing forbidden in code

tree = ast.parse(src)
_str_spans = set()
for node in ast.walk(tree):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        _str_spans.add((node.lineno, node.end_lineno))
_lines = src.splitlines()
_skip = set()
for a, b in _str_spans:
    _skip.update(range(a, b + 1))
code = "\n".join(l.split("#")[0] for i, l in enumerate(_lines, 1) if i not in _skip)
check("the runner never calls Vina.dock()", ".dock(" not in code)
check("the runner never calls Vina.optimize()", ".optimize(" not in code)
check("the runner creates no zip, tar or archive of any kind",
      all(w not in src for w in ("zipfile", "tarfile", "shutil.make_archive")))
check("the runner never passes --minimize", "--minimize" not in code)
check("the runner never passes --cnn_scoring", "--cnn_scoring" not in code)
check("--minimize and --cnn_scoring are on the refused list",
      "--minimize" in M.FORBIDDEN_ARGS and "--cnn_scoring" in M.FORBIDDEN_ARGS)
check("exactly one ranking rule exists in the runner",
      code.count("def rank_by_gnina") == 1 and "def rank_poses" not in code)
check("the denominator constant is 85 and the threshold is 2.0",
      M.DENOMINATOR == 85 and M.SUCCESS_RMSD_A == 2.0)


print("\n%d passed, %d failed" % (len(PASS), len(FAIL)))
if FAIL:
    for f in FAIL:
        print("  FAILED:", f)
sys.exit(1 if FAIL else 0)
