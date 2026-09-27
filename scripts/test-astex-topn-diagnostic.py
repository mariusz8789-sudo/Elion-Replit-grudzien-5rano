#!/usr/bin/env python3
"""Focused tests for the Astex top-N pose DIAGNOSTIC (run 4) and for the backward compatibility
of the preregistered top-1 benchmark it must not disturb.

    python3 scripts/test-astex-topn-diagnostic.py

Pure-unit: no docking is executed here (that is the diagnostic run itself). Covers multi-pose PDBQT
parsing, pose identity, per-pose symmetry-aware RMSD, top-K aggregation, the ranking-vs-sampling
classification, the denominator staying at 85, evidence serialization, and the fact that the
preregistered protocol fingerprint and the run-1..3 evidence files are unchanged.
"""
import hashlib
import importlib.util
import json
import os
import sys
import types
import unittest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, "packages/backend/src/compute"))


def _load(name, relpath):
    spec = importlib.util.spec_from_file_location(name, os.path.join(REPO, relpath))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


DIAG = _load("astex_topn_diagnostic", "scripts/astex-redock-topn-diagnostic.py")
BM = DIAG.BM
import dock_worker  # noqa: E402


def _atom(serial, name, el, x, y, z):
    return ("ATOM  %5d %-4s LIG A   1    %8.3f%8.3f%8.3f  1.00  0.00    +0.000 %-2s"
            % (serial, name, x, y, z, el))


MULTI_MODEL = "\n".join([
    "MODEL 1",
    "REMARK VINA RESULT:      -9.000      0.000      0.000",
    _atom(1, "C1", "C", 1.0, 2.0, 3.0),
    _atom(2, "O1", "OA", 1.5, 2.5, 3.5),
    "ENDMDL",
    "MODEL 2",
    "REMARK VINA RESULT:      -8.100      1.200      2.300",
    _atom(1, "C1", "C", 4.0, 5.0, 6.0),
    _atom(2, "O1", "OA", 4.5, 5.5, 6.5),
    "ENDMDL",
    "MODEL 3",
    "REMARK VINA RESULT:      -7.200      2.400      4.100",
    _atom(1, "C1", "C", 7.0, 8.0, 9.0),
    _atom(2, "O1", "OA", 7.5, 8.5, 9.5),
    "ENDMDL",
    "",
])


def case(pdb_id, pose_rmsds, scores=None, status="DOCKED"):
    scores = scores or [-10.0 + 0.5 * i for i in range(len(pose_rmsds))]
    return {"pdbId": pdb_id, "status": status,
            "poses": [{"rank": i + 1, "rmsdA": r, "affinityKcalMol": scores[i], "poseSha256": "%064d" % i}
                      for i, r in enumerate(pose_rmsds)],
            "rank1RmsdA": pose_rmsds[0] if pose_rmsds else None,
            "rank1VinaScoreKcalMol": scores[0] if pose_rmsds else None}


class MultiPoseParsing(unittest.TestCase):
    def test_splits_every_model(self):
        models = dock_worker.pose_models(MULTI_MODEL)
        self.assertEqual(len(models), 3)
        self.assertIn("1.000   2.000   3.000", models[0].replace("  ", "  "))
        self.assertNotIn("MODEL", models[0])
        self.assertNotIn("ENDMDL", models[0])

    def test_model_order_is_vina_rank_order(self):
        models = dock_worker.pose_models(MULTI_MODEL)
        firsts = [float(m.splitlines()[1][30:38]) for m in models]
        self.assertEqual(firsts, [1.0, 4.0, 7.0])

    def test_single_model_without_tags(self):
        text = _atom(1, "C1", "C", 0.0, 0.0, 0.0) + "\n"
        self.assertEqual(len(dock_worker.pose_models(text)), 1)

    def test_empty_text_yields_no_poses(self):
        self.assertEqual(dock_worker.pose_models(""), [])


class PoseIdentity(unittest.TestCase):
    def test_is_sha256_hex(self):
        h = dock_worker.pose_identity(dock_worker.pose_models(MULTI_MODEL)[0])
        self.assertEqual(len(h), 64)
        int(h, 16)

    def test_distinct_poses_distinct_hashes(self):
        hs = [dock_worker.pose_identity(m) for m in dock_worker.pose_models(MULTI_MODEL)]
        self.assertEqual(len(set(hs)), 3)

    def test_deterministic_and_serial_invariant(self):
        m = dock_worker.pose_models(MULTI_MODEL)[0]
        renumbered = "\n".join([
            "REMARK VINA RESULT:      -9.000      0.000      0.000",
            _atom(910, "C1", "C", 1.0, 2.0, 3.0),
            _atom(911, "O1", "OA", 1.5, 2.5, 3.5),
        ]) + "\n"
        self.assertEqual(dock_worker.pose_identity(m), dock_worker.pose_identity(renumbered))

    def test_coordinate_change_changes_hash(self):
        m = dock_worker.pose_models(MULTI_MODEL)[0]
        moved = m.replace("   1.000", "   1.001")
        self.assertNotEqual(dock_worker.pose_identity(m), dock_worker.pose_identity(moved))


class PerPoseRmsd(unittest.TestCase):
    """The diagnostic must use exactly the metric the preregistered benchmark uses:
    symmetry-aware heavy-atom RDKit CalcRMS with NO superposition."""

    def setUp(self):
        from rdkit import Chem
        from rdkit.Chem import AllChem
        self.Chem, self.AllChem = Chem, AllChem
        mol = Chem.AddHs(Chem.MolFromSmiles("c1ccccc1C(=O)O"))
        p = AllChem.ETKDGv3()
        p.randomSeed = 42
        AllChem.EmbedMolecule(mol, p)
        self.ref = Chem.RemoveHs(mol)

    def _rms(self, probe):
        from rdkit.Chem import rdMolAlign
        return rdMolAlign.CalcRMS(probe, self.ref)

    def test_identical_pose_is_zero(self):
        self.assertAlmostEqual(self._rms(self.Chem.Mol(self.ref)), 0.0, places=6)

    def test_translation_is_not_superposed_away(self):
        import numpy as np
        moved = self.Chem.Mol(self.ref)
        conf = moved.GetConformer()
        pos = conf.GetPositions() + np.array([3.0, 0.0, 0.0])
        for i, xyz in enumerate(pos):
            conf.SetAtomPosition(i, xyz.tolist())
        self.assertAlmostEqual(self._rms(moved), 3.0, places=5)

    def test_symmetry_equivalent_atoms_do_not_inflate_rmsd(self):
        """p-xylene flipped 180 deg about its C1-C4 axis maps onto itself: a naive index-wise RMSD is
        large, the symmetry-aware CalcRMS the protocol uses is near zero."""
        import numpy as np
        from rdkit import Chem
        from rdkit.Chem import AllChem, rdMolAlign
        mol = Chem.AddHs(Chem.MolFromSmiles("Cc1ccc(C)cc1"))
        p = AllChem.ETKDGv3()
        p.randomSeed = 42
        AllChem.EmbedMolecule(mol, p)
        ref = Chem.RemoveHs(mol)
        flipped = Chem.Mol(ref)
        conf = flipped.GetConformer()
        pos = conf.GetPositions()
        methyls = [a.GetIdx() for a in ref.GetAtoms() if not a.GetIsAromatic()]
        axis = pos[methyls[1]] - pos[methyls[0]]
        axis = axis / np.linalg.norm(axis)
        origin = pos[methyls[0]]
        rot = 2 * np.outer(axis, axis) - np.eye(3)  # 180 deg rotation about `axis`
        newpos = (pos - origin) @ rot.T + origin
        for i, xyz in enumerate(newpos):
            conf.SetAtomPosition(i, xyz.tolist())
        naive = float(np.sqrt(((newpos - pos) ** 2).sum(axis=1).mean()))
        sym = rdMolAlign.CalcRMS(flipped, ref)
        self.assertGreater(naive, 1.0)
        self.assertLess(sym, 0.3)

class TopKAggregation(unittest.TestCase):
    def test_hit_requires_a_pose_inside_the_window(self):
        c = case("AAAA", [5.0, 4.0, 1.5, 3.0])
        self.assertFalse(DIAG.top_k_hit(c["poses"], 1))
        self.assertFalse(DIAG.top_k_hit(c["poses"], 2))
        self.assertTrue(DIAG.top_k_hit(c["poses"], 3))
        self.assertTrue(DIAG.top_k_hit(c["poses"], 20))

    def test_threshold_is_strictly_less_than_two(self):
        self.assertFalse(DIAG.top_k_hit(case("A", [2.0])["poses"], 1))
        self.assertTrue(DIAG.top_k_hit(case("A", [1.999])["poses"], 1))

    def test_coverage_is_monotone_non_decreasing(self):
        cases = [case("A", [1.0]), case("B", [9.0, 8.0, 1.2]), case("C", [9.0] * 19 + [0.5]),
                 case("D", [7.0] * 20)]
        cov = DIAG.top_k_coverage(cases)
        seq = [cov["top%d" % k]["successes"] for k in DIAG.TOP_K_WINDOWS]
        self.assertEqual(seq, [1, 2, 2, 2, 3])
        self.assertEqual(seq, sorted(seq))

    def test_case_with_no_poses_counts_as_a_failure_not_a_dropout(self):
        cases = [case("A", [1.0]), {"pdbId": "B", "status": "DOCKING_FAILED", "poses": []}]
        cov = DIAG.top_k_coverage(cases)
        self.assertEqual(cov["top20"]["successes"], 1)
        self.assertEqual(cov["top20"]["cases"], 2)

    def test_best_pose_prefers_lowest_rmsd_then_lowest_rank(self):
        poses = case("A", [3.0, 1.0, 1.0])["poses"]
        self.assertEqual(DIAG.best_pose(poses)["rank"], 2)


class Classification(unittest.TestCase):
    def test_ranking_failure(self):
        c = case("A", [5.0, 1.2, 4.0])
        cls, reason = DIAG.classify_failure(c, 5.0)
        self.assertEqual(cls, "A_RANKING_FAILURE")
        self.assertIn("rank 2", reason)

    def test_sampling_failure(self):
        c = case("A", [5.0, 4.4, 3.9])
        cls, reason = DIAG.classify_failure(c, 5.0)
        self.assertEqual(cls, "B_SAMPLING_FAILURE")
        self.assertIn("3.9", reason)

    def test_pipeline_issue_when_no_pose_set(self):
        cls, reason = DIAG.classify_failure(
            {"pdbId": "A", "status": "PREPARATION_FAILED", "poses": [], "error": "no_ccd_template"}, None)
        self.assertEqual(cls, "C_PIPELINE_CHEMISTRY")
        self.assertIn("no_ccd_template", reason)

    def test_uncertain_when_rank1_is_native_like_here_but_was_not_in_run3(self):
        cls, reason = DIAG.classify_failure(case("A", [1.1, 5.0]), 4.9)
        self.assertEqual(cls, "D_UNCERTAIN")
        self.assertIn("perturbed", reason)

    def test_poses_beyond_the_window_are_not_counted(self):
        c = case("A", [5.0] * 20 + [1.0])
        self.assertEqual(DIAG.classify_failure(c, 5.0, max_k=20)[0], "B_SAMPLING_FAILURE")
        self.assertEqual(DIAG.classify_failure(c, 5.0, max_k=21)[0], "A_RANKING_FAILURE")

    def test_scoring_gap_buckets(self):
        recs = [
            {"classification": "A_RANKING_FAILURE", "rank1VinaScoreKcalMol": -10.0, "bestNativeLikeVinaScoreKcalMol": -9.7},
            {"classification": "A_RANKING_FAILURE", "rank1VinaScoreKcalMol": -10.0, "bestNativeLikeVinaScoreKcalMol": -9.2},
            {"classification": "A_RANKING_FAILURE", "rank1VinaScoreKcalMol": -10.0, "bestNativeLikeVinaScoreKcalMol": -8.0},
            {"classification": "B_SAMPLING_FAILURE", "rank1VinaScoreKcalMol": -10.0, "bestNativeLikeVinaScoreKcalMol": None},
        ]
        g = DIAG.scoring_gaps(recs)
        self.assertEqual(g["rankingFailures"], 3)
        self.assertEqual(g["within0_5KcalMol"], 1)
        self.assertEqual(g["within1_0KcalMol"], 2)
        self.assertEqual(g["worseThan1_0KcalMol"], 1)
        self.assertAlmostEqual(g["medianScoreGapKcalMol"], 0.8, places=3)


class ChemistryEvidence(unittest.TestCase):
    def test_none_for_a_clean_case(self):
        self.assertEqual(DIAG.chemistry_evidence({"pdbId": "A", "cofactorsNotKept": [], "ligandElementsFromCcd": 0}), [])

    def test_dropped_hetatm_residue_is_evidence(self):
        ev = DIAG.chemistry_evidence({"pdbId": "A", "cofactorsNotKept": [
            {"residue": "CME:A432", "reason": "no_ccd_template_with_10_heavy_atoms"}]})
        self.assertEqual(len(ev), 1)
        self.assertIn("CME:A432", ev[0])
        self.assertIn("receptor", ev[0])

    def test_corrected_element_columns_are_evidence(self):
        ev = DIAG.chemistry_evidence({"pdbId": "A", "ligandElementsFromCcd": 2})
        self.assertEqual(len(ev), 1)
        self.assertIn("CCD", ev[0])

    def test_evidence_does_not_override_the_ranking_verdict(self):
        c = case("A", [5.0, 1.2])
        c["cofactorsNotKept"] = [{"residue": "CME:A432", "reason": "no_ccd_template_with_10_heavy_atoms"}]
        self.assertEqual(DIAG.classify_failure(c, 5.0)[0], "A_RANKING_FAILURE")
        self.assertTrue(DIAG.chemistry_evidence(c))

    def test_real_report_flags_the_two_dropped_modified_residues(self):
        rep = json.load(open(os.path.join(REPO, "docs/evidence/astex-redock-run4-diagnostic.json")))
        flagged = {x["pdbId"] for x in rep["summary"]["casesWithPipelineChemistryEvidence"]}
        self.assertIn("1MEH", flagged)
        self.assertIn("1XM6", flagged)


class ExecutedRun(unittest.TestCase):
    """Assertions about the real, executed run-4 evidence file (no docking here, just its invariants)."""

    def setUp(self):
        self.rep = json.load(open(os.path.join(REPO, "docs/evidence/astex-redock-run4-diagnostic.json")))

    def test_all_85_cases_present_and_docked(self):
        self.assertEqual(self.rep["summary"]["cases"], 85)
        self.assertEqual(self.rep["summary"]["denominator"], 85)
        self.assertEqual(len(self.rep["cases"]), 85)

    def test_every_case_records_per_pose_rank_score_rmsd_and_identity(self):
        for c in self.rep["cases"]:
            self.assertGreater(len(c["poses"]), 0, c["pdbId"])
            self.assertEqual([p["rank"] for p in c["poses"]], list(range(1, len(c["poses"]) + 1)))
            for p in c["poses"]:
                self.assertIsInstance(p["affinityKcalMol"], float)
                self.assertIsInstance(p["rmsdA"], float)
                self.assertEqual(len(p["poseSha256"]), 64)

    def test_coverage_recomputes_from_the_stored_poses(self):
        cov = DIAG.top_k_coverage(self.rep["cases"])
        self.assertEqual(cov, self.rep["summary"]["coverage"])

    def test_perfect_reranking_number_matches_top20_coverage(self):
        self.assertEqual(self.rep["summary"]["maxSuccessWithPerfectRerankingOfTop20"],
                         self.rep["summary"]["coverage"]["top20"]["successes"])

    def test_deterministic_replay_and_backward_compatibility_were_verified(self):
        rc = self.rep["reproducibilityChecks"]
        self.assertTrue(rc["deterministicReplayOfThisDiagnostic"]["allIdentical"])
        self.assertTrue(rc["preregisteredTop1PathStillReproducesRun3"]["allIdentical"])
        self.assertTrue(rc["preregisteredTop1PathStillReproducesRun3"]["protocolFingerprintIdentical"])


class DenominatorAndSerialization(unittest.TestCase):
    def setUp(self):
        self.run3 = json.load(open(os.path.join(REPO, "docs/evidence/astex-redock-benchmark-2026-09-27-run3.json")))
        self.args = types.SimpleNamespace(label="", num_modes=20, energy_range=20.0, exhaustiveness=32,
                                          data="/tmp/claude-0/p2r/joined/astex")

    def test_prereg_and_run3_have_exactly_85_cases(self):
        prereg = json.load(open(BM.PREREG))
        self.assertEqual(len(prereg["cases"]), 85)
        self.assertEqual(self.run3["summary"]["cases"], 85)
        self.assertEqual(self.run3["summary"]["successes"], 46)

    def test_denominator_is_85_even_when_cases_fail_or_produce_no_poses(self):
        ids = [c["pdbId"] for c in self.run3["cases"]]
        results = [case(pid, [9.0]) for pid in ids[:80]]
        results += [{"pdbId": pid, "status": "DOCKING_FAILED", "poses": []} for pid in ids[80:]]
        rep = DIAG.build_report(results, self.run3, self.args)
        self.assertEqual(rep["summary"]["denominator"], 85)
        self.assertTrue(rep["summary"]["isFullBenchmark"])
        for k in DIAG.TOP_K_WINDOWS:
            self.assertEqual(rep["summary"]["coverage"]["top%d" % k]["cases"], 85)

    def test_perfect_reranking_number_is_the_top20_coverage(self):
        ids = [c["pdbId"] for c in self.run3["cases"]]
        results = [case(pid, [9.0] * 19 + [1.0]) for pid in ids]
        rep = DIAG.build_report(results, self.run3, self.args)
        self.assertEqual(rep["summary"]["maxSuccessWithPerfectRerankingOfTop20"], 85)
        self.assertEqual(rep["summary"]["coverage"]["top20"]["successes"], 85)
        self.assertEqual(rep["summary"]["coverage"]["top1"]["successes"], 0)

    def test_report_is_json_serializable_and_carries_reproducibility_fields(self):
        ids = [c["pdbId"] for c in self.run3["cases"]]
        rep = DIAG.build_report([case(pid, [9.0, 1.5]) for pid in ids], self.run3, self.args)
        text = json.dumps(rep)
        self.assertGreater(len(text), 1000)
        self.assertEqual(rep["kind"], "GENESIS_ASTEX_REDOCK_TOPN_DIAGNOSTIC")
        self.assertIn("DIAGNOSTIC", rep["diagnosticProtocol"]["status"])
        self.assertNotIn("PREREGISTERED", rep["diagnosticProtocol"]["status"].replace("NOT PREREGISTERED", ""))
        for k in ("dataset", "baselinePreregisteredRun3", "preregistrationSha256", "engine", "versions",
                  "scoringDiagnostic", "run3FailureClassification"):
            self.assertIn(k, rep)
        self.assertEqual(rep["dataset"]["distributionCommit"], "0236ecb38cbb60b89849a1ea36fbd9ee93f3e906")
        self.assertEqual(rep["engine"]["numModes"], 20)
        self.assertEqual(rep["engine"]["successCriterion"], "RMSD < 2.0 A")
        self.assertEqual(len(rep["run3FailureClassification"]), 39)

    def test_markdown_renders_the_key_result(self):
        ids = [c["pdbId"] for c in self.run3["cases"]]
        rep = DIAG.build_report([case(pid, [9.0, 1.5]) for pid in ids], self.run3, self.args)
        md = DIAG.markdown(rep)
        self.assertIn("NOT PREREGISTERED", md)
        self.assertIn("maximum observed", md)
        self.assertIn("/ 85", md)


class BackwardCompatibility(unittest.TestCase):
    """The preregistered top-1 path must be untouched by the diagnostic."""

    def test_protocol_fingerprint_still_matches_the_preregistration_and_run3(self):
        prereg = json.load(open(BM.PREREG))
        run3 = json.load(open(os.path.join(REPO, "docs/evidence/astex-redock-benchmark-2026-09-27-run3.json")))
        self.assertEqual(BM.protocol_fingerprint(), prereg["protocolFingerprint"])
        self.assertEqual(BM.protocol_fingerprint(), run3["protocolFingerprint"])
        self.assertEqual(prereg["protocol"], BM.PROTOCOL)

    def test_top1_benchmark_still_asks_vina_for_one_pose(self):
        src = open(os.path.join(REPO, "packages/backend/src/compute/dock_worker.py")).read()
        body = src.split("def _redock(")[1].split("\ndef ")[0]
        self.assertIn('"nPoses": 1', body)
        self.assertIn("rdMolAlign.CalcRMS", body)

    def test_redock_and_redock_poses_share_receptor_preparation(self):
        src = open(os.path.join(REPO, "packages/backend/src/compute/dock_worker.py")).read()
        self.assertEqual(src.count("\n    rec = _with_extra_rigid(rec, req, out_dir)"), 2)
        for fn in ("_redock", "_redock_poses"):
            body = src.split("def %s(" % fn)[1].split("\ndef ")[0]
            self.assertIn("_prepare_receptor(req, os.path.join(out_dir, \"receptor\"))", body)

    def test_diagnostic_reuses_the_benchmark_preparation_functions(self):
        src = open(os.path.join(REPO, "scripts/astex-redock-topn-diagnostic.py")).read()
        for fn in ("ligand_lines", "ligand_sdf", "box_for", "clean_receptor", "cofactor_residues", "cofactor_pdbqt"):
            self.assertIn("BM.%s(" % fn, src)
            self.assertNotIn("\ndef %s(" % fn, src)

    def test_historical_evidence_files_are_unchanged(self):
        expected = {
            "astex-redock-benchmark-2026-09-27-run1.json": 85,
            "astex-redock-benchmark-2026-09-27-run2.json": 85,
            "astex-redock-benchmark-2026-09-27-run3.json": 85,
        }
        for name, n in expected.items():
            path = os.path.join(REPO, "docs/evidence", name)
            r = json.load(open(path))
            self.assertEqual(r["summary"]["cases"], n)
            self.assertEqual(r["kind"], "GENESIS_ASTEX_REDOCK_BENCHMARK")
        import subprocess
        out = subprocess.run(["git", "status", "--porcelain", "docs/evidence"], cwd=REPO,
                             capture_output=True, text=True).stdout
        for name in expected:
            self.assertNotIn(name, out, "historical evidence file %s was modified" % name)

    def test_success_threshold_and_windows_are_the_registered_ones(self):
        self.assertEqual(DIAG.SUCCESS_RMSD_A, 2.0)
        self.assertEqual(DIAG.TOP_K_WINDOWS, (1, 3, 5, 10, 20))
        self.assertIn("RMSD < 2.0 A", BM.PROTOCOL["successCriterion"])


if __name__ == "__main__":
    del hashlib
    unittest.main(verbosity=2)
