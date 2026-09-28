# Astex run 7 - GNINA CNN rescoring of the frozen run-6 pooled poses

**DIAGNOSTIC. NOT A HEADLINE. NOT A VALIDATION.**

DIAGNOSTIC. The preregistered headline stays run 3's 46/85 top-1. This run produces no new headline and authorises no claim about generalisation.

This is post-hoc development on the same 85 test cases that runs 1-6 used. It is NOT an independent validation. No number here may be quoted as prospective performance.

GNINA is used here ONLY as an experimental benchmark scorer. It is NOT integrated into the product and must not be, until the GPL question and the licence of its training data are resolved.

Preregistration `docs/evidence/astex-gnina-rescoring-prereg.json`, frozen at 2026-09-28T18:05:01+00:00, sha256 `01e2b00a44d1f59842d2cb278cbcfdb4570eb35eaf96a2ebf9f5fc2c195df7a4`, protocol fingerprint `b19eab7b191f4ffe76e04f69d1f007dc84cd9d1fe3fde183f7dea0bfbc38f655`, recomputed by the runner and matched. The runner refuses to execute on any drift of the protocol, of the pinned code, of the gnina binary sha256 or of its version banner.

Engine: `gnina v1.3 master:97fa6bc+   Built Oct  3 2024.`, sha256 `c7e40b0258ff55941b0a0716d28ec9661b2917d809a04bcbab20c20a13b4beb9`, model `crossdock_default2018_ensemble`. Invocation: `--score_only --no_gpu --cpu 1 --cnn crossdock_default2018_ensemble -r <receptor.pdbqt> -l <pooled poses .sdf>`. No docking, no minimisation, no pose was moved; the runner refuses to emit any of `--minimize`, `--local_only`, `--cnn_scoring`, `--autobox_ligand`, `--randomize_only`, `--exhaustiveness`, `--num_modes`, `--seed`.

Git HEAD `a9ba71ffa1746bf69f46ff9b5b6f2588fcbe6589`. Host CPU count **4**. **8396** stored poses were scored (of which **3991** are the frozen deduplicated pooled poses that the rule ranks); the GNINA processes themselves consumed **18166.1 s** of summed per-case wall time, and the full 85-case scoring pass took **4538.9 s** end to end with 4 job(s) of 1 CPU each. This reporting pass reused the cached per-case scores and took 2.4 s.

## Integrity

- cases whose files hashed exactly as run 6 recorded them and whose every pose RMSD and identity hash was recomputed and matched: **85 / 85**
- UNAVAILABLE: **0**
- UNAVAILABLE cases stay in the denominator and count as a top-1 failure; nothing is re-docked and nothing is removed

## 1. Top-N under the single frozen GNINA rule

Rule: rank the pooled poses by GNINA CNNscore DESCENDING (higher is better). Tie-break: by the pooled order run 6 defines, i.e. Vina score ascending, then (seed index, rank) ascending. Denominator 85, always.

| window | successes / 85 | rate |
|---|---|---|
| top-1 | **63** | 74.1% |
| top-3 | **73** | 85.9% |
| top-5 | **76** | 89.4% |
| top-10 | **81** | 95.3% |
| top-20 | **81** | 95.3% |

Sampling ceiling in the frozen pool: **81 / 85**.

## 2. Versus the Vina baseline on the same pooled poses

Vina over these same pooled poses: **50 / 85** (the prereg records 50). GNINA: **63 / 85**. Recovered **17**, lost **4**, net **+13**.

- recovered: 1JD0, 1MEH, 1MZC, 1N1M, 1N2V, 1OWE, 1S19, 1S3V, 1SJ0, 1TOW, 1U4D, 1UOU, 1V0P, 1YVF, 1YWR, 2BM2, 2BR1
- lost: 1IG3, 1L2S, 1VCJ, 1XOQ

## 3. Versus the frozen phase-4 `linear_equal_weight` rule

Phase 4's frozen rule: **53 / 85** (the prereg records 53). GNINA: **63 / 85**. Recovered **14**, lost **4**, net **+10**.

- recovered: 1GPK, 1JD0, 1MEH, 1MZC, 1N1M, 1N2V, 1OWE, 1S19, 1SJ0, 1TT1, 1UOU, 1YVF, 2BM2, 2BR1
- lost: 1HP0, 1IG3, 1VCJ, 1XOQ

## 4. Per-seed top-1, the same rule on each seed's own 20 poses

| | seed 42 | 1042 | 2042 | 3042 | 4042 | mean | SD |
|---|---|---|---|---|---|---|---|
| GNINA CNNscore | 60 | 60 | 60 | 61 | 61 | 60.40 | 0.55 |
| Vina (run 6) | 46 | 49 | 50 | 47 | 49 | 48.20 | 1.64 |

## 5. Every case still failing at top-1, kept and published

ranking failure = a sub-2.0 A pose exists in the frozen pool and the rule does not put it first; sampling failure = no sub-2.0 A pose exists anywhere in the pool (UNAVAILABLE cases are counted here too)

**Ranking failures (18)** - a sub-2.0 A pose is in the pool and the rule does not put it first:

1G9V, 1GM8, 1HP0, 1IG3, 1JJE, 1L2S, 1L7F, 1MMV, 1N2J, 1P2Y, 1Q1G, 1R58, 1SQ5, 1TZ8, 1VCJ, 1XM6, 1XOQ, 1YGC

**Sampling failures (4)** - no sub-2.0 A pose exists anywhere in the pool:

1HVY, 1Q41, 1T9B, 1W1P

## 6. Per case

CNNaffinity is recorded because GNINA reports it. **The frozen rule uses CNNscore only.** No rule was switched, blended or reconsidered after seeing these numbers.

| PDB | pool | top-1 CNNscore | top-1 CNNaff | top-1 RMSD | best RMSD in pool | CNNscore rank of that best pose |
|---|---|---|---|---|---|---|
| 1G9V | 42 | 0.77629 | 5.746 | 10.648 | 1.707 | 5 |
| 1GKC | 58 | 0.87094 | 6.265 | **1.075** | 1.075 | 1 |
| 1GM8 | 58 | 0.81071 | 5.273 | 3.292 | 1.848 | 2 |
| 1GPK | 35 | 0.90118 | 6.370 | **0.517** | 0.517 | 1 |
| 1HNN | 53 | 0.96089 | 6.177 | **1.016** | 0.449 | 4 |
| 1HP0 | 43 | 0.90990 | 6.069 | 2.104 | 0.421 | 3 |
| 1HQ2 | 32 | 0.99078 | 6.516 | **0.404** | 0.404 | 1 |
| 1HVY | 50 | 0.72846 | 6.847 | 9.906 | 2.041 | 9 |
| 1HWI | 57 | 0.73626 | 6.100 | **1.324** | 1.324 | 1 |
| 1HWW | 39 | 0.91693 | 5.360 | **0.290** | 0.290 | 1 |
| 1IA1 | 35 | 0.99202 | 7.472 | **0.345** | 0.345 | 1 |
| 1IG3 | 47 | 0.86284 | 6.132 | 3.450 | 0.749 | 3 |
| 1J3J | 26 | 0.99301 | 7.387 | **0.516** | 0.516 | 1 |
| 1JD0 | 48 | 0.88038 | 5.455 | **1.293** | 1.293 | 1 |
| 1JJE | 42 | 0.98215 | 6.664 | 8.036 | 0.808 | 3 |
| 1JLA | 37 | 0.91197 | 7.511 | **0.859** | 0.582 | 2 |
| 1K3U | 45 | 0.97733 | 6.794 | **0.637** | 0.637 | 1 |
| 1KE5 | 54 | 0.96580 | 6.717 | **1.319** | 0.370 | 2 |
| 1KZK | 74 | 0.94818 | 8.705 | **0.315** | 0.315 | 1 |
| 1L2S | 37 | 0.81614 | 6.154 | 4.825 | 0.492 | 13 |
| 1L7F | 76 | 0.63698 | 5.892 | 2.533 | 1.556 | 6 |
| 1LPZ | 43 | 0.93385 | 7.621 | **0.684** | 0.684 | 1 |
| 1LRH | 30 | 0.72029 | 5.506 | **0.395** | 0.395 | 1 |
| 1M2Z | 43 | 0.97595 | 7.617 | **0.321** | 0.321 | 1 |
| 1MEH | 58 | 0.77444 | 5.908 | **0.954** | 0.954 | 1 |
| 1MMV | 61 | 0.76808 | 5.649 | 6.943 | 1.992 | 6 |
| 1MZC | 63 | 0.85836 | 7.977 | **1.976** | 0.496 | 2 |
| 1N1M | 43 | 0.92627 | 5.495 | **0.834** | 0.834 | 1 |
| 1N2J | 58 | 0.83759 | 4.371 | 2.155 | 1.452 | 7 |
| 1N2V | 30 | 0.89296 | 5.908 | **0.569** | 0.569 | 1 |
| 1N46 | 24 | 0.96427 | 7.856 | **0.559** | 0.559 | 1 |
| 1NAV | 23 | 0.96726 | 7.769 | **0.759** | 0.759 | 1 |
| 1OF1 | 34 | 0.97022 | 6.424 | **0.496** | 0.496 | 1 |
| 1OF6 | 43 | 0.89876 | 4.655 | **0.811** | 0.811 | 1 |
| 1OPK | 22 | 0.99586 | 8.621 | **1.788** | 0.536 | 2 |
| 1OQ5 | 26 | 0.79473 | 6.812 | **0.882** | 0.882 | 1 |
| 1OWE | 40 | 0.86587 | 5.913 | **0.846** | 0.846 | 1 |
| 1OYT | 60 | 0.92537 | 7.269 | **0.595** | 0.595 | 1 |
| 1P2Y | 47 | 0.78045 | 6.049 | 4.808 | 1.472 | 13 |
| 1P62 | 51 | 0.97971 | 5.949 | **0.984** | 0.432 | 2 |
| 1PMN | 61 | 0.99191 | 9.120 | **1.361** | 0.835 | 2 |
| 1Q1G | 56 | 0.80291 | 6.063 | 2.216 | 0.819 | 4 |
| 1Q41 | 38 | 0.81502 | 6.159 | 2.362 | 2.362 | 1 |
| 1Q4G | 27 | 0.95123 | 6.008 | **0.296** | 0.296 | 1 |
| 1R1H | 43 | 0.93678 | 7.061 | **1.143** | 1.143 | 1 |
| 1R55 | 49 | 0.94158 | 6.092 | **1.138** | 1.029 | 2 |
| 1R58 | 75 | 0.69709 | 6.945 | 3.448 | 1.906 | 10 |
| 1R9O | 39 | 0.92241 | 6.041 | **1.656** | 0.418 | 2 |
| 1S19 | 97 | 0.91535 | 8.215 | **1.984** | 1.534 | 8 |
| 1S3V | 26 | 0.98693 | 7.587 | **0.459** | 0.459 | 1 |
| 1SG0 | 21 | 0.75120 | 4.976 | **1.723** | 0.913 | 6 |
| 1SJ0 | 64 | 0.98480 | 8.526 | **0.715** | 0.715 | 1 |
| 1SQ5 | 62 | 0.78214 | 4.802 | 5.710 | 1.331 | 4 |
| 1SQN | 29 | 0.94127 | 7.331 | **0.426** | 0.426 | 1 |
| 1T40 | 44 | 0.94900 | 7.874 | **1.344** | 1.344 | 1 |
| 1T46 | 63 | 0.89668 | 8.653 | **0.727** | 0.727 | 1 |
| 1T9B | 37 | 0.68977 | 5.317 | 7.369 | 5.799 | 21 |
| 1TOW | 29 | 0.90597 | 5.920 | **0.596** | 0.596 | 1 |
| 1TT1 | 77 | 0.94978 | 5.800 | **0.361** | 0.361 | 1 |
| 1TZ8 | 25 | 0.89610 | 6.530 | 2.288 | 0.407 | 2 |
| 1U1C | 45 | 0.98620 | 6.112 | **1.688** | 0.776 | 3 |
| 1U4D | 73 | 0.96159 | 6.441 | **0.989** | 0.989 | 1 |
| 1UML | 57 | 0.90199 | 8.179 | **1.196** | 1.196 | 1 |
| 1UNL | 52 | 0.96031 | 7.391 | **0.446** | 0.446 | 1 |
| 1UOU | 46 | 0.98414 | 6.663 | **1.739** | 0.545 | 2 |
| 1V0P | 45 | 0.94602 | 7.617 | **0.744** | 0.744 | 1 |
| 1V48 | 65 | 0.96611 | 6.422 | **0.852** | 0.852 | 1 |
| 1V4S | 40 | 0.96129 | 7.335 | **0.723** | 0.723 | 1 |
| 1VCJ | 59 | 0.87660 | 6.297 | 4.162 | 0.859 | 4 |
| 1W1P | 33 | 0.90384 | 4.727 | 2.106 | 2.106 | 1 |
| 1W2G | 47 | 0.96858 | 5.504 | **0.879** | 0.879 | 1 |
| 1X8X | 37 | 0.91641 | 5.281 | **0.670** | 0.670 | 1 |
| 1XM6 | 46 | 0.99143 | 7.039 | 2.235 | 1.024 | 2 |
| 1XOQ | 33 | 0.94508 | 7.239 | 2.415 | 0.538 | 2 |
| 1XOZ | 58 | 0.93638 | 7.101 | **0.353** | 0.353 | 1 |
| 1Y6B | 53 | 0.97755 | 8.294 | **0.922** | 0.922 | 1 |
| 1YGC | 61 | 0.98526 | 8.212 | 3.825 | 1.372 | 9 |
| 1YQY | 41 | 0.96342 | 7.023 | **0.409** | 0.409 | 1 |
| 1YV3 | 38 | 0.90745 | 6.577 | **0.494** | 0.494 | 1 |
| 1YVF | 64 | 0.90210 | 6.788 | **0.818** | 0.818 | 1 |
| 1YWR | 58 | 0.97393 | 8.629 | **1.396** | 1.396 | 1 |
| 1Z95 | 42 | 0.90056 | 7.603 | **0.410** | 0.410 | 1 |
| 2BM2 | 79 | 0.89559 | 6.736 | **1.317** | 1.317 | 1 |
| 2BR1 | 34 | 0.80048 | 6.964 | **1.304** | 1.304 | 1 |
| 2BSM | 36 | 0.98498 | 7.623 | **0.457** | 0.457 | 1 |

## 7. The prespecified interpretation branch

Preregistered before any score existed: positive >= 60/85, negative <= 56/85, inconclusive 57-59.

**Measured top-1: 63 / 85. Branch: POSITIVE (top-1 >= 60/85).** Stated without spin, exactly as measured; no attempt was made to reach any target.

Falsifiable prediction recorded before the run: top-1 will land between 54 and 62, centred near 58, and will NOT reach 69. Recorded before the run. Held: **NO**.

The prediction is recorded as WRONG. The measured 63 is above the preregistered band of 54-62. The half of the prediction that said it would not reach 69 still holds: it did not. Stating the miss rather than quietly widening the band is the point of having written it down.

## 8. Contamination and status of this number

Astex complexes appear in PDBbind, so this pretrained model has likely seen some of these structures. This is disclosed, is weaker than fitting on the test set as phase 4 had to, and still does not make the result an independent validation.

This is post-hoc development on the same 85 test cases that runs 1-6 used. It is NOT an independent validation. No number here may be quoted as prospective performance.

### 1GM8, disclosed explicitly

- phase 4: UNAVAILABLE - a pooled pose falls outside phase 4's frozen Vinardo grid box, so phase 4 could not score the case at all and counted it as a failure for all four of its rules
- run 7: SCORED
- GNINA --score_only autoboxes around each ligand and uses no grid box, so it can score poses phase 4's box excluded. This is a property of the scorer, not a tuning decision, not a per-PDB exception, and not a change to the protocol. The pool itself is run 6's own frozen pool, re-derived by run 6's pooling code.
- The phase-4 linear rule therefore keeps 1GM8 as a failure while the GNINA rule can win or lose it on its merits. Any GNINA-vs-phase-4 difference that turns on 1GM8 is flagged in the recovered list and must be read with this in mind.
- As measured, 1GM8 is a **ranking failure** under the GNINA rule: its native-like pose (1.848 A) sits at CNNscore rank 2, so the rule does not put it first. 1GM8 therefore appears in neither recovered list and contributes **nothing** to the +13 over Vina or the +10 over phase 4. The extra availability GNINA has here did not buy a single case.

## 9. Validation of this run itself

`python3 scripts/test-astex-gnina-rescore.py`: **57 passed, 0 failed**.
Covered: the protocol-fingerprint refusal on drift, the hash-gate refusal on a tampered pose, the ranking rule and its tie-break, the top-N counting, the per-seed computation, and the denominator staying 85 with a forced UNAVAILABLE case.

Deterministic replay: 1G9V, 1KZK rescored a second time from scratch; CNNscores compared byte-for-byte on 199 poses. Identical: **True**.

Immutability of runs 1-6: 50 tracked Astex evidence, preregistration, script and worker files compared with `git show HEAD:<path>`. Changed: **none**. All unchanged: **True**. This run wrote only NEW files.
