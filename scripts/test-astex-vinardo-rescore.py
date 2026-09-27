#!/usr/bin/env python3
"""Focused unit tests for scripts/astex-vinardo-rescore.py (Astex run 5, Vinardo rescoring).

    python3 scripts/test-astex-vinardo-rescore.py

No docking, no Vina execution, no network. Pure logic + the real prereg file.
"""

import importlib.util
import inspect
import json
import os
import re
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


RS = _load("astex_vinardo_rescore", os.path.join(HERE, "astex-vinardo-rescore.py"))


def _executable_source(path):
    """Source with every comment and string literal (docstrings included) removed, so a
    prose mention of a forbidden call cannot pass or fail the check."""
    import io
    import tokenize
    out = []
    with open(path, "rb") as f:
        for tok in tokenize.tokenize(io.BytesIO(f.read()).readline):
            if tok.type in (tokenize.COMMENT, tokenize.STRING):
                continue
            out.append(tok.string)
    return " ".join(out)


class TestFingerprintGate(unittest.TestCase):
    def test_real_prereg_fingerprint_matches(self):
        prereg = RS.load_prereg()
        self.assertEqual(prereg["protocolFingerprintSha256"],
                         RS.protocol_fingerprint(prereg["protocol"]))
        self.assertEqual(prereg["protocolFingerprintSha256"],
                         "0c9c5f92799e187aa18674b248762ab3e5de1ea9d66d78142966908723f9e5c7")

    def test_refuses_on_protocol_drift(self):
        with open(RS.PREREG) as f:
            prereg = json.load(f)
        prereg["protocol"]["forbidden"].append("something invented later")
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(prereg, f)
            path = f.name
        try:
            with self.assertRaises(SystemExit) as cm:
                RS.load_prereg(path)
            self.assertIn("REFUSING TO RUN", str(cm.exception))
        finally:
            os.unlink(path)

    def test_refuses_on_threshold_drift(self):
        with open(RS.PREREG) as f:
            prereg = json.load(f)
        prereg["protocol"]["inputs"]["denominator"] = "the 68 cases with a native-like pose"
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(prereg, f)
            path = f.name
        try:
            self.assertRaises(SystemExit, RS.load_prereg, path)
        finally:
            os.unlink(path)


class TestIntegrityGate(unittest.TestCase):
    def _case(self, extra=None):
        return {"pdbId": "XXXX", "dockedPdbqtSha256": "d" * 64, "receptorPdbqtSha256": "r" * 64,
                "extraRigidPdbqt": extra or []}

    def _dir(self, extra=False):
        d = tempfile.mkdtemp()
        os.makedirs(os.path.join(d, "run/dock"))
        os.makedirs(os.path.join(d, "run/receptor"))
        open(os.path.join(d, "run/dock/docked.pdbqt"), "w").write("x")
        open(os.path.join(d, "ligand.sdf"), "w").write("x")
        name = "receptor_with_extra.pdbqt" if extra else "receptor.pdbqt"
        open(os.path.join(d, "run/receptor", name), "w").write("x")
        return d

    def test_passes_when_hashes_match(self):
        d = self._dir()
        got = RS.integrity_gate(self._case(), d, hasher=lambda p: "d" * 64 if "docked" in p else "r" * 64)
        self.assertTrue(got["ok"])
        self.assertTrue(got["receptorPath"].endswith("run/receptor/receptor.pdbqt"))

    def test_uses_combined_receptor_when_extra_rigid_recorded(self):
        d = self._dir(extra=True)
        case = self._case(extra=[{"sha256": "c" * 64, "atoms": 33}])
        got = RS.integrity_gate(case, d, hasher=lambda p: "d" * 64 if "docked" in p else "r" * 64)
        self.assertTrue(got["ok"])
        self.assertTrue(got["receptorPath"].endswith("receptor_with_extra.pdbqt"))

    def test_docked_mismatch_is_unavailable_not_redock(self):
        d = self._dir()
        got = RS.integrity_gate(self._case(), d, hasher=lambda p: "0" * 64)
        self.assertFalse(got["ok"])
        self.assertEqual(got["reason"], "docked_pdbqt_sha256_mismatch")

    def test_receptor_mismatch_detected(self):
        d = self._dir()
        got = RS.integrity_gate(self._case(), d,
                                hasher=lambda p: "d" * 64 if "docked" in p else "0" * 64)
        self.assertFalse(got["ok"])
        self.assertEqual(got["reason"], "receptor_pdbqt_sha256_mismatch")

    def test_missing_file_is_unavailable(self):
        d = tempfile.mkdtemp()
        got = RS.integrity_gate(self._case(), d)
        self.assertFalse(got["ok"])
        self.assertTrue(got["reason"].startswith("missing_"))


class TestReranking(unittest.TestCase):
    def test_sorts_ascending_by_vinardo_score(self):
        poses = [{"rank": 1, "vinardoScoreKcalMol": -5.0},
                 {"rank": 2, "vinardoScoreKcalMol": -7.5},
                 {"rank": 3, "vinardoScoreKcalMol": -6.0}]
        out = RS.rerank(poses)
        self.assertEqual([p["rank"] for p in out], [2, 3, 1])
        self.assertEqual([p["vinardoRank"] for p in out], [1, 2, 3])

    def test_ties_broken_by_original_vina_rank_ascending(self):
        poses = [{"rank": 7, "vinardoScoreKcalMol": -6.0},
                 {"rank": 2, "vinardoScoreKcalMol": -6.0},
                 {"rank": 5, "vinardoScoreKcalMol": -6.0}]
        out = RS.rerank(poses)
        self.assertEqual([p["rank"] for p in out], [2, 5, 7])

    def test_rerank_does_not_mutate_input(self):
        poses = [{"rank": 1, "vinardoScoreKcalMol": -5.0}, {"rank": 2, "vinardoScoreKcalMol": -9.0}]
        RS.rerank(poses)
        self.assertEqual([p["rank"] for p in poses], [1, 2])
        self.assertNotIn("vinardoRank", poses[0])


class TestOutcomes(unittest.TestCase):
    def test_threshold_is_strictly_less_than_2(self):
        self.assertEqual(RS.SUCCESS_RMSD_A, 2.0)
        self.assertTrue(RS.is_native_like(1.999))
        self.assertFalse(RS.is_native_like(2.0))
        self.assertFalse(RS.is_native_like(None))

    def test_outcome_matrix(self):
        self.assertEqual(RS.outcome(True, True), "UNCHANGED_SUCCESS")
        self.assertEqual(RS.outcome(True, False), "LOST")
        self.assertEqual(RS.outcome(False, True), "RECOVERED")
        self.assertEqual(RS.outcome(False, False), "STILL_FAILING")


class TestDenominatorAndCounting(unittest.TestCase):
    def setUp(self):
        self.prereg = RS.load_prereg()
        with open(RS.RUN4) as f:
            self.run4 = json.load(f)

    def test_denominator_constant_is_85(self):
        self.assertEqual(RS.DENOMINATOR, 85)
        self.assertEqual(RS.RUN4_VINA_TOP1, 46)
        self.assertEqual(len(self.run4["cases"]), 85)

    def test_run4_has_20_ranking_and_17_sampling_failures(self):
        cc = self.run4["summary"]["classificationCounts"]
        self.assertEqual(cc["A_RANKING_FAILURE"], 20)
        self.assertEqual(cc["B_SAMPLING_FAILURE"], 17)

    def _synthetic(self, vinardo_flags):
        """One synthetic result per real run-4 case, with a chosen vinardo outcome."""
        results = []
        for c in self.run4["cases"]:
            ok = vinardo_flags.get(c["pdbId"], False)
            vina_ok = RS.is_native_like(c["rank1RmsdA"])
            results.append({"pdbId": c["pdbId"], "status": "SCORED",
                            "vinaRank1RmsdA": c["rank1RmsdA"],
                            "vinaRank1ScoreKcalMol": c["rank1VinaScoreKcalMol"],
                            "vinardoRank1": {"originalVinaRank": 1, "rmsdA": 1.0 if ok else 9.0,
                                             "vinardoScoreKcalMol": -6.0, "vinaAffinityKcalMol": -8.0},
                            "vinaTop1Success": vina_ok, "vinardoTop1Success": ok,
                            "outcome": RS.outcome(vina_ok, ok), "failedChecks": [], "poses": []})
        return results

    def test_unavailable_stays_in_denominator(self):
        results = self._synthetic({})
        results[0] = {"pdbId": results[0]["pdbId"], "status": "UNAVAILABLE", "outcome": "UNAVAILABLE",
                      "poses": [], "failedChecks": [{"check": "integrity_gate", "ok": False}],
                      "vinaRank1RmsdA": None, "vinaRank1ScoreKcalMol": None}
        rep = RS.build_report(results, self.run4, self.prereg, "/nonexistent", {"method": "x", "cases": []})
        self.assertEqual(rep["summary"]["denominator"], 85)
        self.assertEqual(rep["summary"]["casesConsidered"], 85)
        self.assertEqual(rep["summary"]["unavailableCount"], 1)
        # rate is over 85 regardless
        self.assertEqual(rep["summary"]["vinardoTop1Rate"],
                         round(rep["summary"]["vinardoTop1Successes"] / 85, 4))

    def test_recovered_counted_only_within_the_20(self):
        a_ids = [c["pdbId"] for c in self.run4["run3FailureClassification"]
                 if c["classification"] == "A_RANKING_FAILURE"]
        flags = {pid: True for pid in a_ids[:6]}
        results = self._synthetic(flags)
        rep = RS.build_report(results, self.run4, self.prereg, "/nonexistent", {"method": "x", "cases": []})
        self.assertEqual(rep["summary"]["recoveredOfA_rankingFailures"], 6)
        self.assertEqual(rep["summary"]["vinardoTop1Successes"], 6)
        self.assertEqual(rep["summary"]["netGain"], 6 - 46)

    def test_lost_counting(self):
        # every case that Vina already got right, Vinardo now loses; nothing recovered
        results = self._synthetic({})
        rep = RS.build_report(results, self.run4, self.prereg, "/nonexistent", {"method": "x", "cases": []})
        vina_ok = sum(1 for c in self.run4["cases"] if RS.is_native_like(c["rank1RmsdA"]))
        self.assertEqual(rep["summary"]["lostCount"], vina_ok)
        self.assertEqual(rep["summary"]["vinardoTop1Successes"], 0)


class TestResidualRankingGapAndPoseSha(unittest.TestCase):
    def setUp(self):
        self.prereg = RS.load_prereg()
        with open(RS.RUN4) as f:
            self.run4 = json.load(f)

    def _result(self, pid, vinardo_rmsd, best_rmsd, best_vinardo_rank):
        vinardo_ok = RS.is_native_like(vinardo_rmsd)
        return {"pdbId": pid, "status": "SCORED", "vinaRank1RmsdA": 9.0,
                "vinaRank1ScoreKcalMol": -8.0,
                "vinardoRank1": {"originalVinaRank": 3, "rmsdA": vinardo_rmsd,
                                 "vinardoScoreKcalMol": -7.0, "vinaAffinityKcalMol": -8.0,
                                 "poseSha256": "a" * 64},
                "bestRmsdPose": {"originalVinaRank": 11, "vinardoRank": best_vinardo_rank,
                                 "rmsdA": best_rmsd, "vinardoScoreKcalMol": -6.0,
                                 "vinaAffinityKcalMol": -7.0},
                "vinaTop1Success": False, "vinardoTop1Success": vinardo_ok,
                "nativeLikePoseStillAvailable": RS.is_native_like(best_rmsd),
                "residualRankingGap": RS.is_native_like(best_rmsd) and not vinardo_ok,
                "outcome": RS.outcome(False, vinardo_ok), "failedChecks": [], "poses": []}

    def test_residual_gap_counted_only_when_pose_available_and_not_first(self):
        results = [self._result("AAAA", 9.0, 1.2, 7),    # gap
                   self._result("BBBB", 1.1, 1.1, 1),    # recovered, no gap
                   self._result("CCCC", 8.0, 6.5, 4)]    # no native-like pose at all
        rep = RS.build_report(results, self.run4, self.prereg, "/nonexistent",
                              {"method": "x", "cases": []})
        s = rep["summary"]
        self.assertEqual(s["residualRankingGapCount"], 1)
        self.assertEqual(s["residualRankingGapIds"], ["AAAA"])
        self.assertEqual(s["residualRankingGap"][0]["vinardoRankOfBestRmsdPose"], 7)
        self.assertEqual(s["nativeLikePoseAvailableAnywhereInTop20"], 2)

    def test_pose_sha256_appears_in_the_markdown_row(self):
        row = RS.md_row(self._result("AAAA", 9.0, 1.2, 7))
        self.assertIn("a" * 64, row)
        self.assertEqual(row.count("|"), 9)
        self.assertEqual(RS.MD_HEADER.splitlines()[0].count("|"), 9)


class TestInterpretationBranches(unittest.TestCase):
    def setUp(self):
        self.rules = RS.load_prereg()["protocol"]["prespecifiedInterpretation"]

    def test_bottleneck_requires_both(self):
        self.assertEqual(RS.interpretation(5, 8, self.rules)["branch"], "scoringIsTheBottleneck")
        self.assertEqual(RS.interpretation(12, 8, self.rules)["branch"], "scoringIsTheBottleneck")

    def test_not_bottleneck(self):
        self.assertEqual(RS.interpretation(2, 10, self.rules)["branch"], "scoringIsNotTheBottleneck")
        self.assertEqual(RS.interpretation(9, 3, self.rules)["branch"], "scoringIsNotTheBottleneck")
        self.assertEqual(RS.interpretation(-4, 0, self.rules)["branch"], "scoringIsNotTheBottleneck")

    def test_inconclusive_band(self):
        self.assertEqual(RS.interpretation(3, 5, self.rules)["branch"], "inconclusive")
        self.assertEqual(RS.interpretation(5, 7, self.rules)["branch"], "inconclusive")

    def test_proposal_gated_on_bottleneck(self):
        self.assertFalse(RS.interpretation(3, 5, self.rules)["nextSamplingExperimentProposed"])
        self.assertTrue(RS.interpretation(6, 9, self.rules)["nextSamplingExperimentProposed"])


class TestNoDockingInScoringPath(unittest.TestCase):
    def test_no_optimize_or_dock_calls_anywhere_in_the_runner(self):
        code = _executable_source(os.path.join(HERE, "astex-vinardo-rescore.py"))
        for bad in (".optimize(", ".dock(", "write_poses(", "randomize("):
            self.assertNotIn(bad, code, "forbidden call %s present in runner" % bad)

    def test_score_case_uses_only_scoring_api(self):
        src = inspect.getsource(RS.score_case)
        self.assertIn("sf_name=\"vinardo\"", src)
        self.assertIn("v.score()", src)
        self.assertIn("compute_vina_maps", src)
        self.assertIn("set_ligand_from_file", src)
        for bad in ("optimize", "dock(", "exhaustiveness", "n_poses"):
            self.assertNotIn(bad, src)

    def test_exactly_one_vina_construction_and_it_is_vinardo(self):
        src = open(os.path.join(HERE, "astex-vinardo-rescore.py")).read()
        ctors = re.findall(r"Vina\(([^)]*)\)", src)
        self.assertEqual(len(ctors), 1, ctors)
        self.assertIn('sf_name="vinardo"', ctors[0])


class TestImmutableInputsUntouched(unittest.TestCase):
    def test_runner_never_opens_protected_files_for_writing(self):
        src = open(os.path.join(HERE, "astex-vinardo-rescore.py")).read()
        self.assertNotIn('open(PREREG, "w")', src)
        self.assertNotIn('open(RUN4, "w")', src)
        # the only files written are the two run-5 outputs
        writes = sorted(set(re.findall(r'open\((\w+), "w"\)', src)))
        # OUT_JSON/OUT_MD are the two run-5 outputs; pose_path is a single-pose scratch
        # PDBQT written under the temp scratch dir and unlinked immediately after scoring.
        self.assertEqual(writes, ["OUT_JSON", "OUT_MD", "pose_path"])
        self.assertIn("os.unlink(pose_path)", src)
        self.assertIn('os.path.join(scratch, "pose_', src)

    def test_output_paths_are_new_files(self):
        self.assertTrue(RS.OUT_JSON.endswith("docs/evidence/astex-vinardo-rescore.json"))
        self.assertTrue(RS.OUT_MD.endswith("docs/evidence/astex-vinardo-rescore.md"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
