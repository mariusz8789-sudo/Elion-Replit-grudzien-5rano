#!/usr/bin/env python3
"""Run 8 ranking diagnostic - DEVELOPMENT ONLY.

Reads the per-case pools produced by Run 8 and asks one question: of the poses
the search already found, how often does a different ranking rule pick a
sub-2.0 A pose? It docks nothing and it does not touch Run 8.

Run 8's published result stands as it is: GNINA cnnScore top-1 204/308,
verdict DOES_NOT_GENERALISE. Nothing printed here amends it. From this point
PoseBusters is a DEVELOPMENT / DIAGNOSTIC set: any number below is a
development observation on a set we have now seen, never a benchmark result,
and a ranker chosen with its help has to be preregistered and measured on a
fresh, unseen set before it means anything.

Usage: run8-ranking-diagnostic.py <dir of per-case json files>
"""
import collections
import glob
import json
import os
import statistics
import sys

NATIVE_LIKE_A = 2.0  # the frozen Run 7/Run 8 success threshold, not a knob


def load(case_dir):
    cases = [json.load(open(f)) for f in sorted(glob.glob(os.path.join(case_dir, "*.json")))]
    if not cases:
        sys.exit("no per-case json found in %s" % case_dir)
    return cases


def top1_hit(case, key):
    best = max(case["pool"], key=key)
    return best["rmsdA"] < NATIVE_LIKE_A


def rank_sum_hit(case, w_gnina):
    pool = case["pool"]
    g = {p["poseSha256"]: i for i, p in enumerate(sorted(pool, key=lambda p: -p["cnnScore"]))}
    v = {p["poseSha256"]: i for i, p in enumerate(sorted(pool, key=lambda p: p["affinityKcalMol"]))}
    best = min(pool, key=lambda p: w_gnina * g[p["poseSha256"]] + (1 - w_gnina) * v[p["poseSha256"]])
    return best["rmsdA"] < NATIVE_LIKE_A


def main():
    case_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    cases = load(case_dir)
    denominator = len(cases)
    scored = [c for c in cases if c["status"] == "SCORED"]

    print("cases %d, scored %d, denominator %d" % (len(cases), len(scored), denominator))
    print("\nsingle-score rules, top-1 over the same pooled poses:")
    for name, key in (
        ("GNINA cnnScore (the Run 8 rule)", lambda p: p["cnnScore"]),
        ("GNINA cnnAffinity", lambda p: p["cnnAffinity"]),
        ("Vina affinity", lambda p: -p["affinityKcalMol"]),
        ("cnnScore x cnnAffinity", lambda p: p["cnnScore"] * p["cnnAffinity"]),
        ("cnnScore - cnnVariance", lambda p: p["cnnScore"] - p["cnnVariance"]),
    ):
        print("  %-34s %d/%d" % (name, sum(1 for c in scored if top1_hit(c, key)), denominator))

    print("\nrank-sum consensus of the two scores:")
    for w in (0.3, 0.5, 0.7):
        hits = sum(1 for c in scored if rank_sum_hit(c, w))
        print("  weight on GNINA %.1f                 %d/%d" % (w, hits, denominator))

    failures = [c for c in scored if c["anyNativeLike"] and not c["top1Success"]]
    ranks = []
    for c in failures:
        ordered = sorted(c["pool"], key=lambda p: -p["cnnScore"])
        ranks.append(next(i + 1 for i, p in enumerate(ordered) if p["rmsdA"] < NATIVE_LIKE_A))
    print("\nranking failures: %d" % len(failures))
    print("  position of the first sub-2.0 A pose in the GNINA order: %s"
          % sorted(collections.Counter(ranks).items()))
    print("  median position %s" % statistics.median(ranks))
    print("  of those, Vina alone would have been right: %d"
          % sum(1 for c in failures if c["vinaTop1Success"]))

    def picks_same(c):
        return (min(c["pool"], key=lambda p: p["affinityKcalMol"])["poseSha256"]
                == max(c["pool"], key=lambda p: p["cnnScore"])["poseSha256"])

    agree = [c for c in scored if picks_same(c)]
    disagree = [c for c in scored if not picks_same(c)]
    print("\nthe two scorers pick the same pose: %d cases, correct %d"
          % (len(agree), sum(1 for c in agree if c["top1Success"])))
    print("they pick different poses: %d cases, GNINA correct %d, Vina correct %d, either correct %d"
          % (len(disagree),
             sum(1 for c in disagree if c["top1Success"]),
             sum(1 for c in disagree if c["vinaTop1Success"]),
             sum(1 for c in disagree if c["top1Success"] or c["vinaTop1Success"])))


if __name__ == "__main__":
    main()
