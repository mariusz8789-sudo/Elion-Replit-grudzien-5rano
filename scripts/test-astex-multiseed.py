#!/usr/bin/env python3
"""Unit tests for the run-6 multi-seed ensemble pooling rules.

Covers the five things the frozen protocol pins down and that a wrong implementation would
silently get wrong: the deduplication rule, the tie-break, the pooled ordering, the fixed
denominator of 85, and the runner's refusal to run on protocol-fingerprint drift.

    python3 scripts/test-astex-multiseed.py [--json out.json]

No test network, no docking: these are pure-function tests on the pooling code the real run uses,
imported from `scripts/astex-multiseed-ensemble.py` itself so they cannot drift from it.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import os
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_spec = importlib.util.spec_from_file_location(
    "astex_multiseed_ensemble", os.path.join(REPO, "scripts/astex-multiseed-ensemble.py"))
M = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(M)

PASSED, FAILED, LOG = [], [], []


def check(name, cond, detail=""):
    (PASSED if cond else FAILED).append(name)
    LOG.append("%s %s%s" % ("PASS" if cond else "FAIL", name, (" - " + detail) if detail else ""))


def pose(seed_index, seed, rank, score, rmsd=9.0, tag=None):
    return {"seedIndex": seed_index, "seed": seed, "rank": rank, "affinityKcalMol": score,
            "rmsdA": rmsd, "tag": tag if tag is not None else "s%dr%d" % (seed_index, rank)}


def rmsd_from_table(table, default=99.0):
    """A pairwise-RMSD stand-in driven by a dict keyed on the unordered pair of pose tags."""
    def f(a, b):
        return table.get(frozenset((a["tag"], b["tag"])), default)
    return f


# ---------------------------------------------------------------- 1. dedup rule


def test_dedup_collapses_below_cutoff():
    a = pose(0, 42, 1, -9.5, tag="A")     # best score
    b = pose(1, 1042, 1, -9.0, tag="B")   # 0.4 A from A -> duplicate, dropped
    c = pose(2, 2042, 1, -8.0, tag="C")   # far from both -> kept
    table = {frozenset(("A", "B")): 0.4, frozenset(("A", "C")): 5.0, frozenset(("B", "C")): 5.0}
    surv, dropped = M.deduplicate_pool([c, b, a], rmsd_from_table(table))
    check("dedup: pose within 1.0 A of a better-scoring pose is dropped",
          [p["tag"] for p in surv] == ["A", "C"], str([p["tag"] for p in surv]))
    check("dedup: the survivor of a duplicate pair is the better Vina score",
          len(dropped) == 1 and dropped[0]["duplicateOfSeed"] == 42 and dropped[0]["seed"] == 1042,
          str(dropped))


def test_dedup_boundary_is_strict_below_one_angstrom():
    a = pose(0, 42, 1, -9.5, tag="A")
    b = pose(1, 1042, 1, -9.0, tag="B")
    exactly = {frozenset(("A", "B")): 1.0}
    just_under = {frozenset(("A", "B")): 0.999}
    s1, _ = M.deduplicate_pool([a, b], rmsd_from_table(exactly))
    s2, _ = M.deduplicate_pool([a, b], rmsd_from_table(just_under))
    check("dedup: RMSD exactly 1.0 A is NOT a duplicate (strictly below)", len(s1) == 2)
    check("dedup: RMSD 0.999 A IS a duplicate", len(s2) == 1)


def test_dedup_compares_against_survivors_only():
    """A-B 1.5 A, B-C 0.5 A, A-C 0.5 A: C is within cutoff of surviving A, so C goes."""
    a = pose(0, 42, 1, -9.5, tag="A")
    b = pose(1, 1042, 1, -9.0, tag="B")
    c = pose(2, 2042, 1, -8.5, tag="C")
    table = {frozenset(("A", "B")): 1.5, frozenset(("B", "C")): 0.5, frozenset(("A", "C")): 0.5}
    surv, _ = M.deduplicate_pool([a, b, c], rmsd_from_table(table))
    check("dedup: a pose is compared against surviving poses, not dropped ones",
          [p["tag"] for p in surv] == ["A", "B"], str([p["tag"] for p in surv]))


def test_dedup_is_order_independent():
    import itertools
    ps = [pose(0, 42, 1, -9.5, tag="A"), pose(1, 1042, 1, -9.0, tag="B"),
          pose(2, 2042, 3, -8.0, tag="C"), pose(3, 3042, 2, -7.0, tag="D")]
    table = {frozenset(("A", "B")): 0.3, frozenset(("C", "D")): 0.2}
    results = set()
    for perm in itertools.permutations(ps):
        surv, _ = M.deduplicate_pool(list(perm), rmsd_from_table(table))
        results.add(tuple(p["tag"] for p in surv))
    check("dedup: the result does not depend on the order poses are handed in",
          results == {("A", "C")}, str(results))


# ---------------------------------------------------------------- 2. tie-break


def test_tie_break_seed_index_then_rank():
    ps = [pose(2, 2042, 1, -8.0, tag="s2r1"), pose(0, 42, 3, -8.0, tag="s0r3"),
          pose(0, 42, 2, -8.0, tag="s0r2"), pose(1, 1042, 1, -8.0, tag="s1r1")]
    order = [p["tag"] for p in sorted(ps, key=M.pool_sort_key)]
    check("tie-break: equal scores order by (seed index, rank) ascending",
          order == ["s0r2", "s0r3", "s1r1", "s2r1"], str(order))


def test_tie_break_decides_the_survivor():
    """Two identical-score poses that are duplicates: seed index 0 must survive."""
    a = pose(1, 1042, 1, -8.0, tag="later")
    b = pose(0, 42, 5, -8.0, tag="earlier")
    surv, dropped = M.deduplicate_pool([a, b], rmsd_from_table({frozenset(("later", "earlier")): 0.2}))
    check("tie-break: on an exact score tie the lower seed index survives",
          [p["tag"] for p in surv] == ["earlier"] and dropped[0]["seed"] == 1042, str(surv))


# ---------------------------------------------------------------- 3. pooled ordering


def test_pooled_ordering_is_score_ascending():
    ps = [pose(0, 42, 2, -7.1, tag="a"), pose(3, 3042, 1, -10.4, tag="b"),
          pose(1, 1042, 7, -8.8, tag="c"), pose(4, 4042, 20, -8.8, tag="d")]
    surv, _ = M.deduplicate_pool(ps, rmsd_from_table({}))  # nothing is a duplicate
    check("ordering: pooled poses are ordered by Vina score ascending, ties by (seed, rank)",
          [p["tag"] for p in surv] == ["b", "c", "d", "a"], str([p["tag"] for p in surv]))
    check("ordering: nothing is lost when no pair is within the dedup cutoff", len(surv) == 4)


def test_top_k_window_uses_pooled_order():
    pool = [pose(0, 42, 1, -10.0, rmsd=6.0), pose(1, 1042, 1, -9.0, rmsd=5.0),
            pose(2, 2042, 1, -8.0, rmsd=1.4)]
    check("top-K: a native-like pose at pooled rank 3 hits top-3 but not top-1",
          (not M.top_k_hit(pool, 1)) and M.top_k_hit(pool, 3))
    check("top-K: the 2.0 A threshold is strict", not M.top_k_hit([pose(0, 42, 1, -9.0, rmsd=2.0)], 1))


# ---------------------------------------------------------------- 4. denominator 85


def test_denominator_is_always_all_cases():
    cases = [{"pdbId": "X%02d" % i, "pooledTopK": []} for i in range(85)]
    cases[0]["pooledTopK"] = [pose(0, 42, 1, -9.0, rmsd=0.5)]
    cov = M.top_k_coverage(cases)
    check("denominator: coverage is reported over all 85 cases",
          all(cov["top%d" % k]["cases"] == 85 for k in M.TOP_K_WINDOWS), json.dumps(cov))
    check("denominator: cases with no pose set are counted as failures, never excluded",
          cov["top1"]["successes"] == 1 and cov["top20"]["successes"] == 1, json.dumps(cov))
    # the reported rate is rounded to 4 decimals by top_k_coverage, so compare at that precision
    check("denominator: the rate divides by 85 (reported rounded to 4 dp)",
          cov["top1"]["rate"] == round(1 / 85, 4), str(cov["top1"]["rate"]))


def test_denominator_matches_the_real_preregistered_case_list():
    import importlib.util as iu
    spec = iu.spec_from_file_location("bm", os.path.join(REPO, "scripts/astex-redock-benchmark.py"))
    bm = iu.module_from_spec(spec)
    spec.loader.exec_module(bm)
    n = len(json.load(open(bm.PREREG))["cases"])
    check("denominator: the preregistered case list really is 85 cases", n == 85, str(n))


# ---------------------------------------------------------------- 5. fingerprint refusal


def _tmp_prereg(mutate):
    doc = json.load(open(M.PREREG6))
    mutate(doc)
    fd, path = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, "w") as f:
        json.dump(doc, f)
    return path


def test_fingerprint_accepts_the_frozen_protocol():
    doc, protocol, fp = M.load_frozen_protocol()
    check("fingerprint: the frozen prereg recomputes to its recorded fingerprint",
          fp == doc["protocolFingerprintSha256"], fp)
    recipe = hashlib.sha256(json.dumps(protocol, sort_keys=True).encode()).hexdigest()
    check("fingerprint: the recipe is sha256(json.dumps(protocol, sort_keys=True))", recipe == fp)


def test_fingerprint_refuses_on_protocol_drift():
    def bump_exhaustiveness(d):
        d["protocol"]["search"]["exhaustiveness"] = 16
    path = _tmp_prereg(bump_exhaustiveness)
    try:
        M.load_frozen_protocol(path)
        check("fingerprint: the runner refuses when the protocol object drifts", False, "no refusal raised")
    except SystemExit as e:
        check("fingerprint: the runner refuses when the protocol object drifts",
              "REFUSING TO RUN" in str(e), str(e)[:80])
    finally:
        os.unlink(path)


def test_fingerprint_refuses_on_seed_list_drift():
    def add_seed(d):
        d["protocol"]["seeds"]["list"].append(5042)
    path = _tmp_prereg(add_seed)
    try:
        M.load_frozen_protocol(path)
        check("fingerprint: adding a sixth seed is refused", False, "no refusal raised")
    except SystemExit as e:
        check("fingerprint: adding a sixth seed is refused", "REFUSING TO RUN" in str(e))
    finally:
        os.unlink(path)


def test_code_identity_refusal():
    _, protocol, _ = M.load_frozen_protocol()
    ok = M.verify_code_identity(protocol)
    check("code identity: the pinned uncommitted files hash exactly as frozen", len(ok) == 5, str(sorted(ok)))
    tampered = copy.deepcopy(protocol)
    tampered["codeIdentity"]["uncommittedFileSha256"]["scripts/astex_phase2_prep.py"] = "0" * 64
    try:
        M.verify_code_identity(tampered)
        check("code identity: a changed pinned file is refused", False, "no refusal raised")
    except SystemExit as e:
        check("code identity: a changed pinned file is refused", "REFUSING TO RUN" in str(e))


# ---------------------------------------------------------------- symmetry cross-check


def test_pairwise_rmsd_matches_rdkit_calcrms():
    """The fast automorphism-reuse RMSD must agree with rdMolAlign.CalcRMS, which is the
    metric the rest of the project uses."""
    import numpy as np
    from rdkit import Chem
    from rdkit.Chem import AllChem, rdMolAlign
    mol = Chem.AddHs(Chem.MolFromSmiles("c1ccc(cc1)C(=O)Nc1ccc(O)cc1"))
    p = AllChem.ETKDGv3()
    p.randomSeed = 7
    AllChem.EmbedMultipleConfs(mol, numConfs=4, params=p)
    mol = Chem.RemoveHs(mol)
    f = M.pairwise_rmsd_fn(mol)
    confs = [np.array(c.GetPositions()) for c in mol.GetConformers()]
    worst = 0.0
    for i in range(len(confs)):
        for j in range(i + 1, len(confs)):
            a, b = Chem.Mol(mol), Chem.Mol(mol)
            a.RemoveAllConformers(); b.RemoveAllConformers()
            a.AddConformer(Chem.Conformer(mol.GetConformer(i)), assignId=True)
            b.AddConformer(Chem.Conformer(mol.GetConformer(j)), assignId=True)
            worst = max(worst, abs(f(confs[i], confs[j]) - rdMolAlign.CalcRMS(a, b)))
    check("pairwise RMSD: the pooled dedup metric agrees with rdMolAlign.CalcRMS on a symmetric ligand",
          worst < 1e-6, "max |delta| = %.3g A" % worst)


TESTS = [v for k, v in sorted(globals().items()) if k.startswith("test_")]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", default="")
    args = ap.parse_args()
    for t in TESTS:
        try:
            t()
        except Exception as e:  # noqa: BLE001
            check("%s (raised)" % t.__name__, False, "%s: %s" % (type(e).__name__, e))
    print("\n".join(LOG))
    print("\n%d passed, %d failed (%d assertions in %d test functions)" % (
        len(PASSED), len(FAILED), len(PASSED) + len(FAILED), len(TESTS)))
    if args.json:
        with open(args.json, "w") as f:
            json.dump({"file": "scripts/test-astex-multiseed.py",
                       "testFunctions": len(TESTS),
                       "assertions": len(PASSED) + len(FAILED),
                       "passed": len(PASSED), "failed": len(FAILED),
                       "failedNames": FAILED,
                       "covers": ["dedup rule (1.0 A symmetry-aware, strict)",
                                  "tie-break (seed index then rank)",
                                  "pooled ordering (Vina score ascending)",
                                  "denominator 85",
                                  "protocol-fingerprint refusal",
                                  "pinned-code-hash refusal",
                                  "pairwise RMSD agrees with rdMolAlign.CalcRMS"],
                       "log": LOG}, f, indent=1)
            f.write("\n")
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
