# Astex redocking — top-N pose diagnostic (run 4)

**DIAGNOSTIC, NOT PREREGISTERED.** Additive to the preregistered top-pose benchmark, which is
unchanged: `scripts/astex-redock-benchmark.py` and runs 1-3 are untouched and the 46/85 headline
stays reproducible. No per-target tuning, no threshold change, no case excluded: the denominator
is all 85 cases. No new scoring function or rescoring model is used.

Question: does Vina generate native-like poses and rank them badly, or does the search fail to
generate one at all?

## Protocol difference from run 3

- Vina num_modes (n_poses) raised from 1 to the requested number of retained poses
- pose-retention energy window widened from Vina's default 3.0 kcal/mol so it does not truncate the requested modes

num_modes and the energy window are applied after the Monte-Carlo runs (redundant-mode removal at min_rmsd, then truncation), so the reported pose set can differ from the single-pose run; rank-1 RMSD is recorded alongside the run-3 top-1 RMSD per case so the perturbation is measurable

## Top-K coverage (a case counts if ANY pose in the window has RMSD < 2.0 A)

| window | successes / 85 | rate |
|---|---|---|
| TOP-1 | 46 / 85 | 54.12% |
| TOP-3 | 59 / 85 | 69.41% |
| TOP-5 | 63 / 85 | 74.12% |
| TOP-10 | 66 / 85 | 77.65% |
| TOP-20 | 68 / 85 | 80.00% |

### Honest cost of raising num_modes

Retaining 20 modes instead of 1 measurably perturbs the pose set: the rank-1 RMSD is identical to
run 3 in only 5 of 85 cases and differs in 80 (median absolute shift 0.015 A, max 5.878 A).
Most of those differences are numerical noise — only 9 shifts exceed 0.5 A and 6 exceed 2.0 A —
but the tail is real and it moves individual cases in both directions.
This diagnostic's own TOP-1 window succeeds on 46 cases against run 3's 46, and not on exactly the
same cases: 1L2S, 1SG0 succeed here but not in run 3, 1HP0, 1TOW succeed in run 3 but not here. The preregistered
headline stays the run-3 number from the untouched single-pose path; this run neither restates nor
replaces it. It also means the TOP-K numbers below describe the 20-mode pose sets, not run 3's.

14 of 85 cases retained fewer than 20 poses (Vina's redundant-mode removal at min_rmsd 1.0 A), so for
those cases the top-20 window is every pose Vina generated; the fewest retained was 14.

Preregistered run-3 top-1 baseline: **46 / 85** (54.12%).

## Key result

**If perfect ranking were available among the generated top-20 poses, the maximum observed
success would be 68/85 (80.00%).** That is +22 cases over the run-3 top-1 result of 46/85.

## Classification of the 39 run-3 top-1 failures

| class | count |
|---|---|
| A_RANKING_FAILURE | 20 |
| B_SAMPLING_FAILURE | 17 |
| C_PIPELINE_CHEMISTRY | 0 |
| D_UNCERTAIN | 2 |

## Scoring diagnostic (ranking-failure cases)

Gap = Vina score of the best native-like pose minus Vina score of the rank-1 pose; positive means
Vina scores the native-like pose worse than the pose it puts first.

- ranking failures: 20
- median score gap: 0.37 kcal/mol
- gap <= 0.5 kcal/mol: 11
- gap <= 1.0 kcal/mol: 20
- gap > 1.0 kcal/mol: 0

## Every run-3 top-1 failure

| PDB | run-3 top-1 RMSD | best RMSD in top-20 | rank of that pose | Vina score rank-1 | Vina score best-RMSD pose | class | reason |
|---|---|---|---|---|---|---|---|
| 1G9V | 4.915 | 1.579 | 18 | -8.309 | -7.376 | A | a pose at 1.579 A exists at rank 18 of 20 generated; Vina ranks a 10.129 A pose first (score -8.309 vs -7.376 kcal/mol for the native-like pose) |
| 1GKC | 6.434 | 3.935 | 17 | -5.369 | -4.007 | B | no pose among the 20 generated reaches 2.0 A; the closest is 3.935 A at rank 17 (score -4.007 vs -5.369 kcal/mol at rank 1) |
| 1GM8 | 3.523 | 3.292 | 2 | -8.143 | -7.348 | B | no pose among the 20 generated reaches 2.0 A; the closest is 3.292 A at rank 2 (score -7.348 vs -8.143 kcal/mol at rank 1) |
| 1HVY | 3.479 | 2.009 | 15 | -9.011 | -8.289 | B | no pose among the 20 generated reaches 2.0 A; the closest is 2.009 A at rank 15 (score -8.289 vs -9.011 kcal/mol at rank 1) |
| 1HWI | 7.087 | 1.014 | 2 | -6.331 | -6.255 | A | a pose at 1.014 A exists at rank 2 of 20 generated; Vina ranks a 7.306 A pose first (score -6.331 vs -6.255 kcal/mol for the native-like pose) |
| 1IG3 | 9.385 | 1.729 | 2 | -6.579 | -6.528 | A | a pose at 1.729 A exists at rank 2 of 20 generated; Vina ranks a 9.333 A pose first (score -6.579 vs -6.528 kcal/mol for the native-like pose) |
| 1JD0 | 5.546 | 1.873 | 2 | -6.254 | -6.247 | A | a pose at 1.873 A exists at rank 2 of 20 generated; Vina ranks a 5.549 A pose first (score -6.254 vs -6.247 kcal/mol for the native-like pose) |
| 1JJE | 7.979 | 0.377 | 5 | -8.995 | -8.607 | A | a pose at 0.377 A exists at rank 5 of 20 generated; Vina ranks a 8.050 A pose first (score -8.995 vs -8.607 kcal/mol for the native-like pose) |
| 1KE5 | 3.012 | 2.765 | 11 | -8.697 | -8.098 | B | no pose among the 20 generated reaches 2.0 A; the closest is 2.765 A at rank 11 (score -8.098 vs -8.697 kcal/mol at rank 1) |
| 1L2S | 5.319 | 0.492 | 1 | -7.742 | -7.742 | D | rank 1 of this diagnostic pose set is already native-like (0.492 A) while run-3 top-1 was 5.319 A: raising num_modes perturbed the pose set, so this case is neither a clean ranking nor a sampling failure |
| 1L7F | 4.765 | 3.653 | 7 | -7.729 | -6.618 | B | no pose among the 20 generated reaches 2.0 A; the closest is 3.653 A at rank 7 (score -6.618 vs -7.729 kcal/mol at rank 1) |
| 1MEH | 4.175 | 2.326 | 10 | -7.651 | -6.918 | B | no pose among the 20 generated reaches 2.0 A; the closest is 2.326 A at rank 10 (score -6.918 vs -7.651 kcal/mol at rank 1) |
| 1MMV | 7.057 | 2.093 | 6 | -7.379 | -6.754 | B | no pose among the 20 generated reaches 2.0 A; the closest is 2.093 A at rank 6 (score -6.754 vs -7.379 kcal/mol at rank 1) |
| 1MZC | 7.707 | 0.496 | 12 | -8.148 | -7.565 | A | a pose at 0.496 A exists at rank 12 of 20 generated; Vina ranks a 7.693 A pose first (score -8.148 vs -7.565 kcal/mol for the native-like pose) |
| 1N2J | 6.904 | 1.463 | 4 | -4.547 | -4.443 | A | a pose at 1.463 A exists at rank 4 of 20 generated; Vina ranks a 7.044 A pose first (score -4.547 vs -4.443 kcal/mol for the native-like pose) |
| 1N2V | 2.744 | 0.554 | 3 | -7.294 | -7.084 | A | a pose at 0.554 A exists at rank 3 of 20 generated; Vina ranks a 2.743 A pose first (score -7.294 vs -7.084 kcal/mol for the native-like pose) |
| 1OWE | 2.334 | 1.04 | 4 | -8.597 | -7.702 | A | a pose at 1.040 A exists at rank 4 of 20 generated; Vina ranks a 2.484 A pose first (score -8.597 vs -7.702 kcal/mol for the native-like pose) |
| 1P2Y | 4.326 | 1.458 | 6 | -7.176 | -6.442 | A | a pose at 1.458 A exists at rank 6 of 19 generated; Vina ranks a 4.344 A pose first (score -7.176 vs -6.442 kcal/mol for the native-like pose) |
| 1Q1G | 6.281 | 0.827 | 3 | -7.567 | -7.416 | A | a pose at 0.827 A exists at rank 3 of 20 generated; Vina ranks a 6.279 A pose first (score -7.567 vs -7.416 kcal/mol for the native-like pose) |
| 1Q41 | 2.742 | 2.362 | 5 | -9.831 | -9.741 | B | no pose among the 17 generated reaches 2.0 A; the closest is 2.362 A at rank 5 (score -9.741 vs -9.831 kcal/mol at rank 1) |
| 1R58 | 3.476 | 2.748 | 5 | -8.546 | -8.157 | B | no pose among the 20 generated reaches 2.0 A; the closest is 2.748 A at rank 5 (score -8.157 vs -8.546 kcal/mol at rank 1) |
| 1R9O | 7.773 | 0.33 | 6 | -8.37 | -8.22 | A | a pose at 0.330 A exists at rank 6 of 20 generated; Vina ranks a 7.794 A pose first (score -8.370 vs -8.220 kcal/mol for the native-like pose) |
| 1S19 | 9.347 | 1.612 | 5 | -10.561 | -10.001 | A | a pose at 1.612 A exists at rank 5 of 20 generated; Vina ranks a 9.348 A pose first (score -10.561 vs -10.001 kcal/mol for the native-like pose) |
| 1S3V | 6.414 | 0.459 | 3 | -9.42 | -9.331 | A | a pose at 0.459 A exists at rank 3 of 20 generated; Vina ranks a 6.397 A pose first (score -9.420 vs -9.331 kcal/mol for the native-like pose) |
| 1SG0 | 5.398 | 0.913 | 9 | -8.462 | -7.803 | D | rank 1 of this diagnostic pose set is already native-like (1.723 A) while run-3 top-1 was 5.398 A: raising num_modes perturbed the pose set, so this case is neither a clean ranking nor a sampling failure |
| 1SJ0 | 4.806 | 1.814 | 3 | -9.562 | -8.601 | A | a pose at 1.814 A exists at rank 3 of 19 generated; Vina ranks a 4.803 A pose first (score -9.562 vs -8.601 kcal/mol for the native-like pose) |
| 1SQ5 | 5.768 | 2.642 | 12 | -6.064 | -5.266 | B | no pose among the 20 generated reaches 2.0 A; the closest is 2.642 A at rank 12 (score -5.266 vs -6.064 kcal/mol at rank 1) |
| 1T9B | 8.733 | 5.799 | 3 | -6.702 | -6.633 | B | no pose among the 20 generated reaches 2.0 A; the closest is 5.799 A at rank 3 (score -6.633 vs -6.702 kcal/mol at rank 1) |
| 1TT1 | 3.651 | 2.441 | 7 | -7.149 | -6.626 | B | no pose among the 20 generated reaches 2.0 A; the closest is 2.441 A at rank 7 (score -6.626 vs -7.149 kcal/mol at rank 1) |
| 1TZ8 | 3.438 | 3.103 | 4 | -8.029 | -7.672 | B | no pose among the 20 generated reaches 2.0 A; the closest is 3.103 A at rank 4 (score -7.672 vs -8.029 kcal/mol at rank 1) |
| 1U4D | 4.219 | 2.21 | 4 | -6.962 | -6.306 | B | no pose among the 20 generated reaches 2.0 A; the closest is 2.210 A at rank 4 (score -6.306 vs -6.962 kcal/mol at rank 1) |
| 1UOU | 7.087 | 1.739 | 10 | -7.985 | -7.294 | A | a pose at 1.739 A exists at rank 10 of 20 generated; Vina ranks a 7.089 A pose first (score -7.985 vs -7.294 kcal/mol for the native-like pose) |
| 1V0P | 3.176 | 1.143 | 3 | -8.93 | -8.578 | A | a pose at 1.143 A exists at rank 3 of 20 generated; Vina ranks a 3.194 A pose first (score -8.930 vs -8.578 kcal/mol for the native-like pose) |
| 1W1P | 10.85 | 2.096 | 4 | -5.885 | -5.499 | B | no pose among the 20 generated reaches 2.0 A; the closest is 2.096 A at rank 4 (score -5.499 vs -5.885 kcal/mol at rank 1) |
| 1XM6 | 2.222 | 0.963 | 2 | -8.995 | -8.728 | A | a pose at 0.963 A exists at rank 2 of 20 generated; Vina ranks a 2.224 A pose first (score -8.995 vs -8.728 kcal/mol for the native-like pose) |
| 1YVF | 4.209 | 3.759 | 17 | -7.998 | -6.98 | B | no pose among the 20 generated reaches 2.0 A; the closest is 3.759 A at rank 17 (score -6.980 vs -7.998 kcal/mol at rank 1) |
| 1YWR | 7.434 | 1.76 | 8 | -9.836 | -9.267 | A | a pose at 1.760 A exists at rank 8 of 20 generated; Vina ranks a 7.434 A pose first (score -9.836 vs -9.267 kcal/mol for the native-like pose) |
| 2BM2 | 4.196 | 2.926 | 2 | -8.466 | -8.172 | B | no pose among the 20 generated reaches 2.0 A; the closest is 2.926 A at rank 2 (score -8.172 vs -8.466 kcal/mol at rank 1) |
| 2BR1 | 7.348 | 1.356 | 5 | -8.179 | -7.673 | A | a pose at 1.356 A exists at rank 5 of 20 generated; Vina ranks a 7.462 A pose first (score -8.179 vs -7.673 kcal/mol for the native-like pose) |

## What the numbers say, and the single next experiment

- Perfect reranking of the generated top-20 poses caps out at **68/85**. That is a ceiling, not a
  forecast: no rescoring function, however good, can exceed it, because 17 cases never produce a
  pose under 2.0 A at all. **70/85 is therefore NOT reachable by reranking alone** (68 < 70).
- Ranking is nevertheless the larger single lever: 20 of the 39 run-3 failures already contain a
  native-like pose, and every one of them sits within 1.0 kcal/mol of the pose Vina ranks first
  (median gap 0.37 kcal/mol, 11 within 0.5, none worse than 1.0). A gap that small is inside the
  Vina function's own resolution, so a different scoring function plausibly reorders them.
- The sampling failures are mostly near misses rather than catastrophes, which is a separate and
  also-tractable problem, but a different one.

**Recommended next experiment (one):** rescore the pose sets this run already saved with Vinardo
(`sf_name="vinardo"`, shipped in the installed AutoDock Vina 1.2.7 — no new model, no new
dependency, no new search) and recompute TOP-1 over the same 85 cases and the same stored poses.
It costs minutes instead of hours because the search is not repeated, it changes exactly one
variable, and its outcome decides where the next real effort goes: if Vinardo recovers a large
share of the 20 ranking failures, scoring is the bottleneck; if it recovers few, the 20-case
ranking gap is not a scoring-function artefact and the work moves to sampling and preparation.
Reaching 70/85 will in any case also require raising the 68/85 sampling ceiling.

Not done here and deliberately not implemented in this task: Vinardo, AutoDock4 scoring, CNN
rescoring, protonation/tautomer enumeration, conserved waters, receptor ensembles.

## Pipeline / chemistry evidence found

3 case(s) carry recorded evidence of a preparation or receptor-representation defect, reported
alongside (not instead of) their ranking-vs-sampling verdict:

- **1MEH** — a HETATM residue lining the site was left out of the receptor: CSO:A319 (no_ccd_template_with_7_heavy_atoms); the receptor cleaner keeps only ATOM records plus metal ions, so a modified residue deposited as HETATM is absent from the receptor model
- **1NAV** — 2 ligand element symbol(s) in the deposited file disagreed with the CCD entry and were corrected from the CCD
- **1XM6** — a HETATM residue lining the site was left out of the receptor: CME:A432 (no_ccd_template_with_10_heavy_atoms); the receptor cleaner keeps only ATOM records plus metal ions, so a modified residue deposited as HETATM is absent from the receptor model

## Reproducibility

- dataset: github.com/rdk/p2rank-datasets, directory joined/astex, commit `0236ecb38cbb60b89849a1ea36fbd9ee93f3e906`
- preregistration SHA-256: `923fba66f0d4b22142506c6064b68a09f1bcd70094c76618c7db95762ebe58af`
- run-3 evidence SHA-256: `b07eb0a000f69b8660fd120886735c182c230e39b9a2c3cb547c8b883cdd9ec6`
- protocol fingerprint inherited from run 3: `6a6217aac78edb8ed5e4bb83e0e6c17385871f64e69dc027709de6fd6561c71a`
- engine: {"scoringFunction": "vina", "exhaustiveness": 32, "seed": 42, "numModes": 20, "energyRange": 20.0, "successCriterion": "RMSD < 2.0 A", "metric": "symmetry-aware heavy-atom RMSD of each retained pose vs the crystal pose, no superposition (RDKit CalcRMS)"}
- versions: {"vina": "1.2.7", "meeko": "0.8.0", "rdkit": "2026.03.6", "biotite": "1.6.0", "python": "3.11.15"}
- finished at: 2026-09-27T20:48:42+00:00
- deterministic replay, executed: a second run of this diagnostic on 1G9V, 1HNN with the same seed produced
  bit-identical pose sets — pose SHA-256 identities, Vina scores and per-pose RMSDs all matched in rank order.
- backward compatibility, executed: the untouched preregistered top-1 benchmark rerun on 1G9V, 1HNN reproduced the run-3 record exactly (RMSD, Vina score, pose SHA-256, receptor SHA-256).
  Protocol fingerprint identical to run 3: True.
- per case: input SHA-256, receptor PDBQT SHA-256, ligand PDBQT SHA-256, docked PDBQT SHA-256;
  per pose: a coordinate-derived SHA-256 pose identity (element + x/y/z at 3 decimals).
