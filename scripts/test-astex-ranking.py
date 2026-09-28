#!/usr/bin/env python3
"""Unit tests for the Astex phase-4 ranking-rule selection.

    python3 scripts/test-astex-ranking.py

Covers, as the phase-4 task requires:
  * the protocol-fingerprint refusal (and the pinned-input / candidate-list / threshold refusals)
  * each candidate rule's ordering, as an explicit expected order on hand-built poses
  * the tie-break chain, including the preregistered within-one-case simpler-rule rule
  * the denominator of 85, enforced in code and not by convention
  * the recovered / lost / net accounting against the Vina baseline
No docking, no scoring, no file in docs/evidence is written by this file.
"""
import copy
import hashlib
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

spec = importlib.util.spec_from_file_location(
    "astex_ranking_rule_select", os.path.join(HERE, "astex-ranking-rule-select.py"))
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)

PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print("%-4s %s%s" % ("ok" if cond else "FAIL", name, ("  -- " + detail) if detail and not cond else ""))


def raises_systemexit(fn):
    try:
        fn()
    except SystemExit:
        return True
    except Exception:  # noqa: BLE001
        return False
    return False


# ------------------------------------------------------------------ helpers


def pose(seed_index, rank, vina, vinardo, rmsd, seed=None):
    return {"seed": seed if seed is not None else 42 + 1000 * seed_index,
            "seedIndex": seed_index, "rank": rank,
            "affinityKcalMol": vina, "vinardoScoreKcalMol": vinardo, "rmsdA": rmsd}


def order(poses, rule):
    return [(p["seedIndex"], p["rank"]) for p in M.rank_poses(poses, rule)]


# ------------------------------------------------------------------ 1. fingerprint refusal

doc = json.load(open(M.PREREG))
check("prereg fingerprint on disk recomputes exactly",
      M.protocol_fingerprint(doc["protocol"]) == doc["protocolFingerprintSha256"])
check("load_prereg accepts the unmodified prereg",
      M.load_prereg(M.PREREG)["protocolFingerprintSha256"] == doc["protocolFingerprintSha256"])

import tempfile

def _write_tmp(d):
    fd, p = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, "w") as f:
        json.dump(d, f)
    return p

drifted = copy.deepcopy(doc)
drifted["protocol"]["successThresholdRmsdA"] = 2.5
p1 = _write_tmp(drifted)
check("load_prereg REFUSES a protocol whose threshold was edited after freezing",
      raises_systemexit(lambda: M.load_prereg(p1)))

drifted2 = copy.deepcopy(doc)
drifted2["protocol"]["candidateRules"]["rules"].append({"id": "sneaky_fifth_rule"})
p2 = _write_tmp(drifted2)
check("load_prereg REFUSES a protocol with a candidate appended after freezing",
      raises_systemexit(lambda: M.load_prereg(p2)))

drifted3 = copy.deepcopy(doc)
drifted3["protocolFingerprintSha256"] = "0" * 64
p3 = _write_tmp(drifted3)
check("load_prereg REFUSES a forged declared fingerprint",
      raises_systemexit(lambda: M.load_prereg(p3)))

for p in (p1, p2, p3):
    os.unlink(p)

check("fingerprint recipe is sha256 over json.dumps(protocol, sort_keys=True)",
      M.protocol_fingerprint(doc["protocol"]) ==
      hashlib.sha256(json.dumps(doc["protocol"], sort_keys=True).encode()).hexdigest())

# pinned-input refusal
bad_protocol = copy.deepcopy(doc["protocol"])
bad_protocol["pinnedCodeSha256"]["packages/backend/src/compute/dock_worker.py"] = "f" * 64
check("verify_pinned_code REFUSES when a pinned code file does not hash as frozen",
      raises_systemexit(lambda: M.verify_pinned_code(bad_protocol)))
bad_protocol2 = copy.deepcopy(doc["protocol"])
bad_protocol2["poseSource"]["evidenceSha256"] = "e" * 64
check("verify_pinned_code REFUSES when the run-6 evidence file has changed",
      raises_systemexit(lambda: M.verify_pinned_code(bad_protocol2)))
check("verify_pinned_code accepts the real, unmodified inputs",
      isinstance(M.verify_pinned_code(doc["protocol"]), dict))

# candidate-list / threshold refusals in the runner's own constants
bad3 = copy.deepcopy(doc["protocol"])
bad3["candidateRules"]["rules"][2]["weight"] = 0.7
check("verify_candidate_list REFUSES a linear weight that differs from the frozen 0.5",
      raises_systemexit(lambda: M.verify_candidate_list(bad3)))
bad4 = copy.deepcopy(doc["protocol"])
bad4["denominator"] = 84
check("verify_candidate_list REFUSES a denominator that is not 85",
      raises_systemexit(lambda: M.verify_candidate_list(bad4)))
bad5 = copy.deepcopy(doc["protocol"])
bad5["candidateRules"]["rules"] = list(reversed(bad5["candidateRules"]["rules"]))
check("verify_candidate_list REFUSES a reordered candidate list",
      raises_systemexit(lambda: M.verify_candidate_list(bad5)))
check("verify_candidate_list accepts the frozen list", M.verify_candidate_list(doc["protocol"]) is None)

check("the closed candidate list has exactly 4 rules and matches the prereg",
      list(M.CANDIDATES) == [r["id"] for r in doc["protocol"]["candidateRules"]["rules"]]
      and len(M.CANDIDATES) == 4)
def _raises_value_error(fn):
    try:
        fn()
    except ValueError:
        return True
    except Exception:  # noqa: BLE001
        return False
    return False


check("rank_poses REFUSES a rule outside the closed list",
      _raises_value_error(lambda: M.rank_poses([pose(0, 1, -8.0, -6.0, 1.0)], "vina_plus_gnina")))


# ------------------------------------------------------------------ 2. each rule's ordering

# Vina prefers A; Vinardo prefers B; the two disagree, which is the whole point.
#   A: vina -9.0  vinardo -5.0
#   B: vina -8.0  vinardo -7.0
#   C: vina -8.5  vinardo -6.0
A = pose(0, 1, -9.0, -5.0, 8.0)
B = pose(1, 1, -8.0, -7.0, 0.5)
C = pose(2, 1, -8.5, -6.0, 4.0)
P = [C, A, B]  # deliberately not in any rule's order

check("rule `vina` orders by Vina score ascending",
      order(P, "vina") == [(0, 1), (2, 1), (1, 1)])
check("rule `vinardo` orders by Vinardo score ascending",
      order(P, "vinardo") == [(1, 1), (2, 1), (0, 1)])
# linear: A -7.0, B -7.5, C -7.25  -> B, C, A
check("rule `linear_equal_weight` orders by 0.5*vina + 0.5*vinardo ascending",
      order(P, "linear_equal_weight") == [(1, 1), (2, 1), (0, 1)])
# ranksum with N=3: vina ranks A0 C1 B2 -> 0,.5,1 ; vinardo ranks B0 C1 A2 -> 0,.5,1
#   A .5*(0+1)=.5 ; B .5*(1+0)=.5 ; C .5*(.5+.5)=.5  -> all tie, broken by vina score: A, C, B
check("rule `normalised_rank_sum` normalises both ranks to [0,1] and averages them",
      order(P, "normalised_rank_sum") == [(0, 1), (2, 1), (1, 1)])

# a case where rank-sum genuinely differs from the linear rule.
#   linear:  P1 -8.20, P2 -8.00, P3 -8.00, P4 -7.85          -> P1
#   ranksum: rv/3 = 0, 1/3, 2/3, 1 ; rd/3 = 1, 1/3, 0, 2/3
#            S = 0.500, 0.333, 0.333, 0.833 -> P2 and P3 tie, vina breaks it -> P2
D = [pose(0, 1, -12.0, -4.4, 9.0),   # vina best by a mile, vinardo worst by a mile
     pose(0, 2, -8.0, -8.0, 0.4),    # second on both
     pose(0, 3, -7.9, -8.1, 7.0),    # vinardo best by a hair
     pose(0, 4, -7.8, -7.9, 7.5)]
check("linear rule is driven by the score gap (picks the -12.0 vina outlier)",
      order(D, "linear_equal_weight")[0] == (0, 1), str(order(D, "linear_equal_weight")))
check("rank-sum rule is scale-free and does NOT follow that outlier",
      order(D, "normalised_rank_sum")[0] == (0, 2), str(order(D, "normalised_rank_sum")))

check("every rule is a total order: no two poses ever compare equal",
      all(len(set(order(P, r))) == len(P) for r in M.CANDIDATES))
check("rank_poses does not mutate its input",
      (lambda before: (M.rank_poses(P, "vinardo"), before == [(p["seedIndex"], p["rank"]) for p in P])[1])(
          [(p["seedIndex"], p["rank"]) for p in P]))
check("single-pose pool is handled by every rule (rank-sum N==1 guard)",
      all(len(M.rank_poses([A], r)) == 1 for r in M.CANDIDATES))
check("empty pool is a top-1 FAILURE, never an exclusion",
      all(M.rule_top1_success([], r) is False for r in M.CANDIDATES))

# threshold is strict: exactly 2.0 A is a failure
check("RMSD exactly 2.000 A is NOT a success (threshold is strict <)",
      M.rule_top1_success([pose(0, 1, -9.0, -6.0, 2.0)], "vina") is False)
check("RMSD 1.999 A IS a success",
      M.rule_top1_success([pose(0, 1, -9.0, -6.0, 1.999)], "vina") is True)

# tie-break inside a rule: identical scores fall back to (seedIndex, rank)
T = [pose(3, 2, -8.0, -6.0, 5.0), pose(1, 5, -8.0, -6.0, 0.9), pose(1, 2, -8.0, -6.0, 3.0)]
check("within-rule ties fall back to (seedIndex, rank) ascending, deterministically",
      all(order(T, r) == [(1, 2), (1, 5), (3, 2)] for r in M.CANDIDATES))


# ------------------------------------------------------------------ 3. accounting and denominator

def make_cases(n, spec_fn):
    return {"CASE%03d" % i: spec_fn(i) for i in range(n)}


# 85 synthetic cases: vina right on 50, candidate right on 55 of which 8 are new, 3 are lost
per_case = {}
for i in range(85):
    pid = "C%03d" % i
    vina_ok = i < 50
    if i < 47:
        cand_ok = True           # 47 kept
    elif i < 50:
        cand_ok = False          # 3 lost
    elif i < 58:
        cand_ok = True           # 8 recovered
    else:
        cand_ok = False
    per_case[pid] = {"vina": vina_ok, "vinardo": cand_ok,
                     "linear_equal_weight": vina_ok, "normalised_rank_sum": False}

acc = M.accounting(per_case, "vinardo")
check("accounting: denominator is 85", acc["denominator"] == 85 and len(per_case) == 85)
check("accounting: top-1 count is right", acc["top1Successes"] == 55, str(acc["top1Successes"]))
check("accounting: recovered is right", acc["recovered"] == 8, str(acc["recovered"]))
check("accounting: lost is right", acc["lost"] == 3, str(acc["lost"]))
check("accounting: net = recovered - lost", acc["net"] == 5)
check("accounting: baseline recomputed from the same table is 50", acc["baselineTop1"] == 50)
check("accounting: recovered and lost are disjoint",
      not (set(acc["recoveredVsBaseline"]) & set(acc["lostVsBaseline"])))
check("accounting: top1 - baseline == net",
      acc["top1Successes"] - acc["baselineTop1"] == acc["net"])
check("accounting: baseline rule scores net 0 against itself",
      M.accounting(per_case, "vina")["net"] == 0)
check("accounting: a rule that gets nothing right scores top-1 0 and loses all 50",
      M.accounting(per_case, "normalised_rank_sum")["top1Successes"] == 0
      and M.accounting(per_case, "normalised_rank_sum")["lost"] == 50)

short = {k: v for k, v in list(per_case.items())[:84]}
try:
    M.accounting(short, "vina")
    ok = False
except ValueError:
    ok = True
check("accounting REFUSES a denominator of 84 - no case may ever be dropped", ok)

extra = dict(per_case)
extra["C085"] = {r: False for r in M.CANDIDATES}
try:
    M.accounting(extra, "vina")
    ok = False
except ValueError:
    ok = True
check("accounting REFUSES a denominator of 86 - no case may ever be added", ok)

check("an UNAVAILABLE case counts as a failure for every rule alike and stays in the denominator",
      (lambda d: M.accounting(d, "vina")["denominator"] == 85
       and M.accounting(d, "vina")["top1Successes"] == 49)(
          {**per_case, "C000": {r: False for r in M.CANDIDATES}}))


# ------------------------------------------------------------------ 4. the selection criterion

def res(rule, top1, lost=0):
    return {"rule": rule, "top1Successes": top1, "lost": lost}


# clear winner, margin 3
s = M.select_winner([res("vina", 50), res("vinardo", 53), res("linear_equal_weight", 47),
                     res("normalised_rank_sum", 45)])
check("selection: a clear 3-case margin picks the top scorer",
      s["winner"] == "vinardo" and s["decidedBy"] == "top1Successes" and s["marginCases"] == 3)

# margin 1 -> the preregistered within-one-case rule prefers the SIMPLER rule
s = M.select_winner([res("vina", 50), res("vinardo", 51), res("linear_equal_weight", 47),
                     res("normalised_rank_sum", 45)])
check("selection: a 1-case margin triggers the within-one-case rule",
      s["withinOneCaseOfRunnerUp"] is True)
check("selection: within one case, the SIMPLER rule wins even though it scored lower",
      s["winner"] == "vina" and s["decidedBy"] == "withinOneCaseRule_simplerRulePreferred",
      str(s))

# tieBreak1 (fewer LOST) decides WHICH two candidates reach the within-one-case comparison
s = M.select_winner([res("vina", 40, lost=0), res("vinardo", 52, lost=6),
                     res("linear_equal_weight", 52, lost=2), res("normalised_rank_sum", 52, lost=9)])
check("selection: fewer LOST orders the tied candidates, keeping the worst-losing one out of the top two",
      s["orderApplied"][:3] == ["linear_equal_weight", "vinardo", "normalised_rank_sum"], str(s))
check("selection: among those top two, the frozen within-one-case rule then takes the simpler",
      s["winner"] == "vinardo" and s["decidedBy"] == "withinOneCaseRule_simplerRulePreferred", str(s))

# exact tie on top-1 AND on lost -> simpler rule
s = M.select_winner([res("vina", 52, lost=0), res("vinardo", 52, lost=0),
                     res("linear_equal_weight", 40), res("normalised_rank_sum", 39)])
check("selection: a tie on top-1 and on LOST is broken by the simpler rule",
      s["winner"] == "vina", str(s))

# the simpler rule is preferred only among the best TWO, not over a clearly better third
s = M.select_winner([res("vina", 44), res("vinardo", 44), res("linear_equal_weight", 56),
                     res("normalised_rank_sum", 55)])
check("selection: the within-one-case rule applies to the best two only, not to the whole list",
      s["winner"] == "linear_equal_weight" and s["runnerUp"] == "normalised_rank_sum", str(s))

check("selection: the ordering applied is reported in full, winners and losers alike",
      len(s["orderApplied"]) == 4)


# ------------------------------------------------------------------ 5. no docking anywhere

src = open(os.path.join(HERE, "astex-ranking-rule-select.py")).read()
import ast
tree = ast.parse(src)
_docstrings = set()
for node in ast.walk(tree):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        _docstrings.add((node.lineno, node.end_lineno))
_lines = src.splitlines()
_skip = set()
for a, b in _docstrings:
    _skip.update(range(a, b + 1))
code = "\n".join(l.split("#")[0] for i, l in enumerate(_lines, 1) if i not in _skip)
check("the runner never calls Vina.dock()", "v.dock(" not in code and ".dock()" not in code)
check("the runner never calls Vina.optimize()",
      "v.optimize(" not in code and ".optimize()" not in code)
check("the runner creates no zip or tar archive",
      all(w not in src for w in ("zipfile", "tarfile", "shutil.make_archive")))


print("\n%d passed, %d failed" % (len(PASS), len(FAIL)))
if FAIL:
    for f in FAIL:
        print("  FAILED:", f)
sys.exit(1 if FAIL else 0)
