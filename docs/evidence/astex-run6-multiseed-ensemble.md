# Astex redocking - multi-seed Vina ensemble (run 6)

**DIAGNOSTIC. NOT A HEADLINE. NO RANKING IS CHANGED.** DIAGNOSTIC. This run does NOT produce a new headline. The preregistered headline stays run 3's 46/85 top-1 until a separately frozen full run replaces it. No ranking change is made here.

Protocol frozen and fingerprinted before any result was computed:
`docs/evidence/astex-multiseed-ensemble-prereg.json`, fingerprint `e183a4f7255d50c0d85832c240d815637ea6b871d99fe6506adc878d46446651`, recomputed by the runner from the `protocol` object and matched.
The runner also verified the sha256 of all 5 pinned code files and refuses to run on drift.

Five seeds [42, 1042, 2042, 3042, 4042], identical for all 85 cases. Identical preparation, box, exhaustiveness 32,
num_modes 20, energy_range 20.0 everywhere. Threshold RMSD < 2.0 A. Denominator 85, no case excluded.

## 1. The new sampling ceiling

**81 / 85** cases have at least one pose under 2.0 A somewhere in the deduplicated five-seed pool.
Run 4's single-seed top-20 ceiling was **68 / 85**. Change: **+13**.

Did we pass 68/85? **YES.**

### What deduplication costs, stated rather than hidden

The frozen ceiling is defined on the *deduplicated* pool, and 81/85 is that number. Deduplication
can discard a pose under 2.0 A when a better-scoring pose within 1.0 A of it survives in its place,
so the raw union of all 5 x 20 poses reaches **83 / 85** -- 2 case(s) more than the frozen metric.
The affected cases are:
- **1HVY**: best raw pose 1.962 A, best surviving pooled pose 2.041 A.
- **1W1P**: best raw pose 1.816 A, best surviving pooled pose 2.106 A.
Both numbers are real; 81/85 is the one the preregistration defines and the one quoted above.

## 2. Did we reach 73-75/85?

**YES.** The actual number is 81 / 85; the target band was 73-75.

## 3. Cases sampling recovered (native-like pose available in run 6, not in run 4's top 20)

13 case(s): 1GKC, 1GM8, 1KE5, 1L7F, 1MEH, 1MMV, 1R58, 1SQ5, 1TT1, 1TZ8, 1U4D, 1YVF, 2BM2

## 4. Cases broken relative to run 4

**None.** No case that had a native-like pose available in run 4's top-20 lost one in run 6.
Stated explicitly because it is the failure mode that a net gain would otherwise hide.

## 5. Cases still with no pose under 2.0 A

4 case(s): 1HVY, 1Q41, 1T9B, 1W1P

## Top-K coverage over the pooled poses

A case counts if any of the first K poses of the pooled, deduplicated, score-ordered list is under 2.0 A.
Run 4's numbers are the single-seed 20-mode windows.

| window | run 6 pooled | run 4 | delta |
|---|---|---|---|
| TOP-1 | 50 / 85 | 46 / 85 | +4 |
| TOP-3 | 65 / 85 | 59 / 85 | +6 |
| TOP-5 | 70 / 85 | 63 / 85 | +7 |
| TOP-10 | 74 / 85 | 66 / 85 | +8 |
| TOP-20 | 79 / 85 | 68 / 85 | +11 |

The pooled TOP-1 column is **not** a headline and does not restate the preregistered 46/85: it is
simply what Vina's own score picks out of a five-times-larger candidate set. Against run 4's own
rank-1 pose it gains 1GKC, 1HWI, 1IG3, 1KE5, 1R9O, 1TT1 and loses 1N1M, 1YGC, which is ranking noise over a bigger pool, not an improvement
in ranking. **No ranking change is made by this run.**

Pool sizes after deduplication: min 21, max 97, mean 46.95 (from 8396 raw poses down to 3991).

## Per-seed single-seed top-1: the error bar on 46/85

Each row is the top-1 result of ONE seed's own run, scored exactly as run 4 scores its rank-1 pose.
This is the stochastic uncertainty on the preregistered single-seed headline. It does not replace it.

| seed index | seed | top-1 / 85 | rate |
|---|---|---|---|
| 0 | 42 | 46 | 54.12% |
| 1 | 1042 | 49 | 57.65% |
| 2 | 2042 | 50 | 58.82% |
| 3 | 3042 | 47 | 55.29% |
| 4 | 4042 | 49 | 57.65% |

Spread: min 46, max 50, range 4 cases, mean 48.2, sample SD 1.64.
Union of the five seeds' top-1 successes: 59 cases. Intersection (all five agree): 37 cases.
So the single-seed top-1 figure carries an uncertainty of about +/- 1.64 cases from seed choice alone,
and only 37 of the 59 cases that any seed gets right at rank 1 are gotten right by every seed.

## Per-case table

| PDB | best RMSD (A) | seed | rank in seed | pooled rank | run-4 best in top-20 | vs run 4 | pool size |
|---|---|---|---|---|---|---|---|
| 1G9V | 1.707 | 1042 | 18 | 39 | 1.579 | SAME | 42 |
| 1GKC | 1.075 | 3042 | 1 | 1 | 3.935 | GAINED | 58 |
| 1GM8 | 1.848 | 2042 | 8 | 14 | 3.292 | GAINED | 58 |
| 1GPK | 0.517 | 42 | 1 | 1 | 0.517 | SAME | 35 |
| 1HNN | 0.449 | 1042 | 2 | 2 | 1.016 | SAME | 53 |
| 1HP0 | 0.421 | 4042 | 2 | 2 | 1.05 | SAME | 43 |
| 1HQ2 | 0.404 | 42 | 1 | 1 | 0.404 | SAME | 32 |
| 1HVY | 2.041 | 3042 | 10 | 18 | 2.009 | SAME | 50 |
| 1HWI | 1.324 | 2042 | 1 | 1 | 1.014 | SAME | 57 |
| 1HWW | 0.29 | 42 | 1 | 1 | 0.29 | SAME | 39 |
| 1IA1 | 0.345 | 1042 | 1 | 1 | 0.387 | SAME | 35 |
| 1IG3 | 0.749 | 2042 | 4 | 6 | 1.729 | SAME | 47 |
| 1J3J | 0.516 | 42 | 1 | 1 | 0.516 | SAME | 26 |
| 1JD0 | 1.293 | 1042 | 15 | 33 | 1.873 | SAME | 48 |
| 1JJE | 0.808 | 1042 | 5 | 5 | 0.377 | SAME | 42 |
| 1JLA | 0.582 | 3042 | 1 | 1 | 0.594 | SAME | 37 |
| 1K3U | 0.637 | 4042 | 1 | 1 | 0.64 | SAME | 45 |
| 1KE5 | 0.37 | 1042 | 2 | 2 | 2.765 | GAINED | 54 |
| 1KZK | 0.315 | 4042 | 1 | 1 | 1.149 | SAME | 74 |
| 1L2S | 0.492 | 42 | 1 | 1 | 0.492 | SAME | 37 |
| 1L7F | 1.556 | 1042 | 3 | 4 | 3.653 | GAINED | 76 |
| 1LPZ | 0.684 | 4042 | 1 | 1 | 0.694 | SAME | 43 |
| 1LRH | 0.395 | 42 | 2 | 2 | 0.395 | SAME | 30 |
| 1M2Z | 0.321 | 3042 | 1 | 1 | 0.596 | SAME | 43 |
| 1MEH | 0.954 | 1042 | 4 | 11 | 2.326 | GAINED | 58 |
| 1MMV | 1.992 | 1042 | 5 | 10 | 2.093 | GAINED | 61 |
| 1MZC | 0.496 | 42 | 12 | 38 | 0.496 | SAME | 63 |
| 1N1M | 0.834 | 2042 | 2 | 2 | 0.871 | SAME | 43 |
| 1N2J | 1.452 | 2042 | 1 | 5 | 1.463 | SAME | 58 |
| 1N2V | 0.569 | 1042 | 4 | 3 | 0.554 | SAME | 30 |
| 1N46 | 0.559 | 3042 | 1 | 1 | 0.523 | SAME | 24 |
| 1NAV | 0.759 | 4042 | 1 | 1 | 0.741 | SAME | 23 |
| 1OF1 | 0.496 | 2042 | 1 | 1 | 0.773 | SAME | 34 |
| 1OF6 | 0.811 | 2042 | 1 | 1 | 0.804 | SAME | 43 |
| 1OPK | 0.536 | 3042 | 3 | 2 | 0.65 | SAME | 22 |
| 1OQ5 | 0.882 | 3042 | 1 | 1 | 0.877 | SAME | 26 |
| 1OWE | 0.846 | 2042 | 3 | 4 | 1.04 | SAME | 40 |
| 1OYT | 0.595 | 2042 | 1 | 1 | 0.479 | SAME | 60 |
| 1P2Y | 1.472 | 1042 | 6 | 8 | 1.458 | SAME | 47 |
| 1P62 | 0.432 | 1042 | 1 | 1 | 0.984 | SAME | 51 |
| 1PMN | 0.835 | 1042 | 1 | 1 | 0.805 | SAME | 61 |
| 1Q1G | 0.819 | 3042 | 3 | 6 | 0.827 | SAME | 56 |
| 1Q41 | 2.362 | 42 | 5 | 6 | 2.362 | SAME | 38 |
| 1Q4G | 0.296 | 4042 | 1 | 1 | 0.324 | SAME | 27 |
| 1R1H | 1.143 | 1042 | 1 | 1 | 1.125 | SAME | 43 |
| 1R55 | 1.029 | 3042 | 6 | 27 | 1.138 | SAME | 49 |
| 1R58 | 1.906 | 4042 | 10 | 25 | 2.748 | GAINED | 75 |
| 1R9O | 0.418 | 3042 | 4 | 4 | 0.33 | SAME | 39 |
| 1S19 | 1.534 | 4042 | 2 | 9 | 1.612 | SAME | 97 |
| 1S3V | 0.459 | 42 | 3 | 2 | 0.459 | SAME | 26 |
| 1SG0 | 0.913 | 42 | 9 | 7 | 0.913 | SAME | 21 |
| 1SJ0 | 0.715 | 3042 | 2 | 3 | 1.814 | SAME | 64 |
| 1SQ5 | 1.331 | 2042 | 10 | 36 | 2.642 | GAINED | 62 |
| 1SQN | 0.426 | 4042 | 1 | 1 | 0.428 | SAME | 29 |
| 1T40 | 1.344 | 4042 | 1 | 1 | 1.162 | SAME | 44 |
| 1T46 | 0.727 | 42 | 1 | 1 | 0.727 | SAME | 63 |
| 1T9B | 5.799 | 42 | 3 | 5 | 5.799 | SAME | 37 |
| 1TOW | 0.596 | 4042 | 2 | 2 | 0.582 | SAME | 29 |
| 1TT1 | 0.361 | 2042 | 1 | 1 | 2.441 | GAINED | 77 |
| 1TZ8 | 0.407 | 4042 | 1 | 3 | 3.103 | GAINED | 25 |
| 1U1C | 0.776 | 4042 | 5 | 7 | 1.159 | SAME | 45 |
| 1U4D | 0.989 | 1042 | 1 | 2 | 2.21 | GAINED | 73 |
| 1UML | 1.196 | 1042 | 2 | 2 | 1.42 | SAME | 57 |
| 1UNL | 0.446 | 1042 | 2 | 2 | 0.602 | SAME | 52 |
| 1UOU | 0.545 | 1042 | 3 | 5 | 1.739 | SAME | 46 |
| 1V0P | 0.744 | 4042 | 2 | 3 | 1.143 | SAME | 45 |
| 1V48 | 0.852 | 2042 | 1 | 1 | 1.026 | SAME | 65 |
| 1V4S | 0.723 | 1042 | 1 | 1 | 0.772 | SAME | 40 |
| 1VCJ | 0.859 | 4042 | 1 | 2 | 0.972 | SAME | 59 |
| 1W1P | 2.106 | 4042 | 4 | 5 | 2.096 | SAME | 33 |
| 1W2G | 0.879 | 3042 | 1 | 1 | 0.795 | SAME | 47 |
| 1X8X | 0.67 | 4042 | 1 | 1 | 0.741 | SAME | 37 |
| 1XM6 | 1.024 | 3042 | 2 | 2 | 0.963 | SAME | 46 |
| 1XOQ | 0.538 | 42 | 1 | 1 | 0.538 | SAME | 33 |
| 1XOZ | 0.353 | 42 | 1 | 1 | 0.353 | SAME | 58 |
| 1Y6B | 0.922 | 42 | 1 | 1 | 0.922 | SAME | 53 |
| 1YGC | 1.372 | 3042 | 3 | 4 | 1.185 | SAME | 61 |
| 1YQY | 0.409 | 42 | 1 | 1 | 0.409 | SAME | 41 |
| 1YV3 | 0.494 | 2042 | 1 | 1 | 0.492 | SAME | 38 |
| 1YVF | 0.818 | 2042 | 1 | 3 | 3.759 | GAINED | 64 |
| 1YWR | 1.396 | 3042 | 7 | 20 | 1.76 | SAME | 58 |
| 1Z95 | 0.41 | 4042 | 1 | 1 | 0.74 | SAME | 42 |
| 2BM2 | 1.317 | 4042 | 1 | 7 | 2.926 | GAINED | 79 |
| 2BR1 | 1.304 | 1042 | 4 | 6 | 1.356 | SAME | 34 |
| 2BSM | 0.457 | 42 | 1 | 1 | 0.457 | SAME | 36 |

## Cross-check: seed 42 against run 4

Seed 42 is run 4's seed, so on every case the phase-2 preparation rules do not touch, seed 42's
whole 20-pose set must be bit-identical to run 4's. It is, on **80** such cases.
Cases where phase-2 preparation did change the input (and identity is therefore not expected): 1GKC, 1HVY, 1JLA, 1MEH, 1XM6.
Unexplained drift on untouched cases: none.

## Deterministic replay

One seed was re-run from scratch on 2 case(s); pose sets compared bit for bit.

| PDB | seed | docked PDBQT sha256 identical | pose hashes identical | scores identical | RMSDs identical |
|---|---|---|---|---|---|
| 1G9V | 42 | True | True | True | True |
| 1GKC | 42 | True | True | True | True |

All identical: **True**.

## Unit tests

`scripts/test-astex-multiseed.py`: 23 passed, 0 failed.
Covered: dedup rule (1.0 A symmetry-aware, strict), tie-break (seed index then rank), pooled ordering (Vina score ascending), denominator 85, protocol-fingerprint refusal, pinned-code-hash refusal, pairwise RMSD agrees with rdMolAlign.CalcRMS

## What this means for the 69/85 target

Reaching 69/85 at top-1 needs two things at once: a ceiling above 69, and a ranking that picks the
native-like pose out of what is available. Before this run the ceiling was run 4's 68/85, which is
*below* 69, so no ranking function however perfect could have reached the target and the ceiling was
the binding constraint. Pooling five independent seeds raises it to 81/85 (83/85 before
deduplication), which is 12 cases above the target. **The ceiling is therefore no longer the binding
constraint; ranking is.** Vina's own score, given the whole pooled set, puts a native-like pose first
on 50 of 85, so 31 cases now hold a native-like pose that exists in the pool and is not ranked first.
That 31-case gap, not sampling, is what stands between the current result and 69/85. The 4 cases with
no pose under 2.0 A at all (1HVY, 1Q41, 1T9B, 1W1P) remain a hard sampling floor and cap any ranking method at 81/85, but
that cap is now comfortably above the target rather than below it. This run changes no ranking and
proposes no next experiment; it only moves the constraint.

## Reproducibility

- preregistration sha256: `84a907029cab34af74f0d47b0acc9cca54966cbf1c377e26936b3f6df9be1ca5`
- protocol fingerprint (recomputed, matched): `e183a4f7255d50c0d85832c240d815637ea6b871d99fe6506adc878d46446651`
- run-4 baseline evidence sha256: `8cab3b217f4371987c7bafa0d3dcc64f393d74757258fc63f1f69ed3ecc70689`
- pinned code sha256, all verified before the run:
  - `packages/backend/src/compute/dock_worker.py` = `859d07316c92f853c95cdb0df1ee4049e35c8e4166012065e293cc2b3aa7398e`
  - `scripts/astex-phase2-redock.py` = `1c9c76b516f8b57e42bdedcd7b4e577a84d5f3e8866bc501c90dbc30a333a416`
  - `scripts/astex-redock-benchmark.py` = `81aa6e9bdb9724ccc637b9ba9fb3d638613339f4d4ebf81fad6f7db761fc6dd0`
  - `scripts/astex-redock-topn-diagnostic.py` = `b1e9651b889eeaa56d9ca34fb7761d859e1124c7b1e65e6560e1d1b5cc0342d6`
  - `scripts/astex_phase2_prep.py` = `8cf5e3dc2ce92d0ff05808896782efc527e89678548a5873f0c036e5203b8d67`
- versions: {"vina": "1.2.7", "meeko": "0.8.0", "rdkit": "2026.03.6", "biotite": "1.6.0", "python": "3.11.15"}
- engine: {"scoringFunction": "vina", "exhaustiveness": 32, "numModes": 20, "energyRange": 20.0, "minRmsd": 1.0, "seeds": [42, 1042, 2042, 3042, 4042]}
- finished at: 2026-09-28T03:36:26+00:00
- pose output, kept as plain files on disk (no archive of any kind was created):
  - per (case, seed) Vina output PDBQT: `/tmp/claude-0/run6/work/<PDBID>/seed<SEED>/dock/docked.pdbqt`
  - prepared receptor / ligand / cofactor / modified-residue files per case: `/tmp/claude-0/run6/work`
  - per-case incremental result JSON, written as the run progressed: `/tmp/claude-0/run6/cases`
  - progress log: `/tmp/claude-0/run6/run.log`
