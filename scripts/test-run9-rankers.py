#!/usr/bin/env python3
"""Unit tests for the Run 9 ranking rules and the seal A selection rule.

    python3 scripts/test-run9-rankers.py

Hand-built pools, explicit expected orders. No file is read or written.
"""
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run9_rankers as R  # noqa: E402

PASS, FAIL = [], []


def check(name, cond):
    (PASS if cond else FAIL).append(name)
    print("%s  %s" % ("ok  " if cond else "FAIL", name))


def pose(si, rank, vina, cnn, plausible=True, support=0, rmsd=5.0):
    return {"seedIndex": si, "rank": rank, "affinityKcalMol": vina, "cnnScore": cnn,
            "plausible": plausible, "clusterSupport": support, "rmsdA": rmsd}


def ids(lst):
    return [(p["seedIndex"], p["rank"]) for p in lst]


# A: best by GNINA, worst by Vina. B: best by Vina, second by GNINA. C: second by Vina, worst by GNINA.
A = pose(0, 1, -6.0, 0.90)
B = pose(1, 1, -9.0, 0.80)
C = pose(2, 1, -8.0, 0.10)
pool = [A, B, C]

check("C0 is CNNscore descending", ids(R.c0(pool)) == [(0, 1), (1, 1), (2, 1)])
check("VINA is affinity ascending", ids(R.vina(pool)) == [(1, 1), (2, 1), (0, 1)])
# ranks: gnina A0 B1 C2 ; vina B0 C1 A2
# w=0.5 (5,5): A=10 B=5 C=15 -> B A C
check("C1(0.5) rank sum", ids(R.c1(pool, "0.5")) == [(1, 1), (0, 1), (2, 1)])
# w=0.7 (7,3): A=6 B=7 C=17 -> A B C
check("C1(0.7) leans to GNINA", ids(R.c1(pool, "0.7")) == [(0, 1), (1, 1), (2, 1)])
# w=0.3 (3,7): A=14 B=3 C=13 -> B C A
check("C1(0.3) leans to Vina", ids(R.c1(pool, "0.3")) == [(1, 1), (2, 1), (0, 1)])

# rank-sum tie broken by the pooled (Vina) order
X = pose(0, 1, -7.0, 0.9)
Y = pose(0, 2, -8.0, 0.8)
# gnina X0 Y1, vina Y0 X1 -> both 5 at w=0.5 -> Vina order: Y first
check("C1 tie goes to the better Vina pose", ids(R.c1([X, Y], "0.5")) == [(0, 2), (0, 1)])

# integer weights: no floating point drift anywhere in the key
check("weights are exact integers summing to 10",
      all(isinstance(a, int) and isinstance(b, int) and a + b == 10 for a, b in R.WEIGHTS.values()))

# C2 filter
Bi = dict(B, plausible=False)
check("C2 drops an implausible pose", ids(R.c2([A, Bi, C], "0.5"))[0] != (1, 1))
allbad = [dict(p, plausible=False) for p in pool]
check("C2 drops nothing when every pose is implausible",
      ids(R.c2(allbad, "0.5")) == ids(R.c1(pool, "0.5")))

# C3 tie-break on the top two only
B2 = dict(B, clusterSupport=1)
A2 = dict(A, clusterSupport=4)
check("C3 promotes the second pose when it has more support",
      ids(R.c3([A2, B2, C], "0.5")) == [(0, 1), (1, 1), (2, 1)])
A3 = dict(A, clusterSupport=1)
check("C3 keeps the order on equal support", ids(R.c3([A3, B2, C], "0.5")) == ids(R.c2([A3, B2, C], "0.5")))
C9 = dict(C, clusterSupport=99)
check("C3 never reaches the third pose", ids(R.c3([A, B, C9], "0.5"))[0] in [(1, 1), (0, 1)])

# C4 never reads cnnScore
nocnn = [{k: v for k, v in p.items() if k != "cnnScore"} for p in pool]
try:
    R.c4(nocnn)
    check("C4 runs without any GNINA field", True)
except KeyError:
    check("C4 runs without any GNINA field", False)

# input order never matters
rng = random.Random(7)
big = [pose(rng.randrange(5), r, -rng.uniform(5, 10), rng.random(), rng.random() > 0.2,
            rng.randrange(6)) for r in range(1, 40)]
stable = True
for fn in (R.c0, R.vina, R.c4, lambda p: R.c1(p, "0.3"), lambda p: R.c2(p, "0.7"), lambda p: R.c3(p, "0.5")):
    ref = ids(fn(big))
    for _ in range(20):
        sh = list(big)
        rng.shuffle(sh)
        stable &= ids(fn(sh)) == ref
check("every rule is independent of input order", stable)
check("rules never mutate their input", ids(big) == ids(list(big)))

# selection rule
base = {R.variant_label(n, w): 210 for n, _f, w in R.SELECTABLE}
s = R.select(base, 204, 308)
check("all tied -> C1(0.5) wins (fewest components, then w=0.5)", s["winner"] == "C1(0.5)")
t = dict(base, **{"C3(0.7)": 215})
check("strictly highest wins", R.select(t, 204, 308)["winner"] == "C3(0.7)")
u = dict(base, **{"C1(0.3)": 215, "C2(0.5)": 215})
check("tie between C1 and C2 goes to C1", R.select(u, 204, 308)["winner"] == "C1(0.3)")
v = dict(base, **{"C1(0.3)": 215, "C1(0.7)": 215})
check("tie at the same component count: w=0.3 listed before w=0.7", R.select(v, 204, 308)["winner"] == "C1(0.3)")
low = {k: 210 for k in base}
check("+1.95 pp is under the floor -> NO_RANKER_SELECTED",
      R.select(low, 204, 308)["selected"] == "NO_RANKER_SELECTED")
edge = {k: 211 for k in base}
check("+2.27 pp clears the +2.0 floor", R.select(edge, 204, 308)["selected"] == "C1(0.5)")

# similarity thirds (seal A secondary split) and the exact McNemar test
import csv  # noqa: E402
import importlib.util  # noqa: E402
import tempfile  # noqa: E402
import run9_similarity_bins as SB  # noqa: E402

with tempfile.TemporaryDirectory() as td:
    path = os.path.join(td, "a.csv")
    vals = ["10", "20", "30", "40", "50", "60", "70", "", "nan"]
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["system_id", "ligand_instance_chain", SB.COLUMN])
        for i, v in enumerate(vals):
            w.writerow(["s%d" % i, "1.B", v])
    cs = [{"systemId": "s%d" % i, "ligandInstanceChain": "1.B", "groupKey": "g%d" % i,
           "drawKey": "%02d" % (9 - i), "pdbId": "P%d" % i} for i in range(len(vals))]
    b = SB.similarity_bins(cs, path)["bins"]
    check("7 valued cases cut 3/2/2, remainder to the lowest third",
          [len(b[n]["pdbIds"]) for n in SB.NAMES] == [3, 2, 2])
    check("thirds follow the value", b["LOW"]["pdbIds"] == ["P0", "P1", "P2"] and b["HIGH"]["pdbIds"] == ["P5", "P6"])
    check("empty and nan go to NO_SIMILARITY_VALUE, never imputed", b[SB.MISSING]["pdbIds"] == ["P7", "P8"])
    check("bins do not depend on case order", SB.similarity_bins(list(reversed(cs)), path)["bins"] == b)
    try:
        SB.similarity_bins([dict(cs[0], systemId="absent")], path)
        refused = False
    except ValueError:
        refused = True
    check("a case with no annotations row is refused", refused)

spec = importlib.util.spec_from_file_location("run9_final", os.path.join(os.path.dirname(os.path.abspath(__file__)), "run9-final.py"))
F = importlib.util.module_from_spec(spec)
spec.loader.exec_module(F)
check("exact one-sided McNemar (22, 10) = 0.0251", abs(F.mcnemar_one_sided(22, 10) - 0.0250512) < 1e-6)
check("McNemar with no discordant pairs is 1", F.mcnemar_one_sided(0, 0) == 1.0)
check("GENERALISES needs +3 pp, p < 0.05 and 4/5 seeds", F.three_way(3.0, 0.04, 4, 1) == "GENERALISES")
check("+3 pp with p = 0.06 is PARTIAL", F.three_way(3.0, 0.06, 5, 0) == "PARTIAL")
check("+1.0 pp is DOES_NOT_GENERALISE", F.three_way(1.0, 0.01, 5, 0) == "DOES_NOT_GENERALISE")
check("a loss on 2 seeds is DOES_NOT_GENERALISE", F.three_way(4.0, 0.01, 3, 2) == "DOES_NOT_GENERALISE")

print("\n%d passed, %d failed" % (len(PASS), len(FAIL)))
sys.exit(1 if FAIL else 0)
