# Astex phase 4 - choosing ONE ranking rule over the frozen run-6 pooled poses

**MODEL SELECTION ON THE TEST SET. NOT A VALIDATION RESULT. NOT A HEADLINE.**

MODEL SELECTION ON THE TEST SET. Astex has been inspected repeatedly in this project, and this step chooses one ranking rule by its score on those same 85 cases. The number the winning rule attains here is therefore a POST-HOC DEVELOPMENT NUMBER and is NOT a validation result, NOT a measurement of generalisation, and NOT a headline. It may not be quoted as the method's performance. Any claim about how this rule generalises requires a separate, separately frozen, prospective run whose protocol is written after this result is in.

Preregistration `docs/evidence/astex-ranking-rule-prereg.json`, frozen at 2026-09-28T04:22:53+00:00, sha256 `8ddc6496e7bdbd642e8b8a4649be25733acaaaf760ba9ea7cdaae9f0f91c0dd9`, protocol fingerprint `fc7b3177851faa12a487af3c69e3e0e16cab4068f492c39b13cef04a77d5c0f5`, recomputed by the runner and matched. The runner refuses to execute on any drift of the protocol, of the pinned code, of the candidate list, of the threshold or of the denominator.

No docking, no minimisation, no pose was moved. Poses are run 6's stored output, scored at their stored coordinates. Threshold RMSD < 2.0 A. Denominator 85, always.

## Integrity

- cases whose files hashed exactly as run 6 recorded them: **84 / 85**
- UNAVAILABLE: **1** (1GM8)
- UNAVAILABLE cases stay in the denominator and count as a top-1 failure for every rule alike; nothing is re-docked

- **1GM8 is UNAVAILABLE.** Reason: Vina runtime error: The ligand is outside the grid box. Increase the size of the grid box or center it accordingly around the ligand.

  This is a scoring-side limit, not evidence of tampering: every stored file hashed exactly as run 6 recorded it. The frozen protocol fixes the Vinardo grid to run 6's own box, and at least one pooled pose of that case extends beyond it, so Vina refuses to score it. Under the protocol the case is reported UNAVAILABLE, is NOT re-docked, is NOT repaired and is NOT removed: it stays in the denominator and counts as a top-1 failure for all four rules alike. Its pooled Vina rank-1 pose was not native-like in run 6, so the Vina baseline is unaffected and still reads exactly 50/85. It did hold a native-like pose at pooled rank 14, so a non-baseline rule could in principle have gained it: the unmeasured effect is at most +1 case for each of the three non-baseline rules.

Native-like pose available anywhere in the frozen pool: **80 / 85** - the hard cap on every rule below. (Run 6 reports 81/85 over the same pool; the difference is the one UNAVAILABLE case above, which is counted as unavailable here rather than assumed.)

## Step 2 - every candidate, including the ones that did worse

Baseline is Vina's own score over the same pooled poses: 50 / 85.

| rule | top-1 / 85 | rate | recovered vs Vina | lost vs Vina | net |
|---|---|---|---|---|---|
| `vina` | **50** | 58.8% | 0 | 0 | +0 |
| `vinardo` | **53** | 62.4% | 9 | 6 | +3 |
| `linear_equal_weight` | **53** | 62.4% | 6 | 3 | +3 |
| `normalised_rank_sum` | **54** | 63.5% | 5 | 1 | +4 |

- `vinardo` recovered 1HP0, 1MZC, 1OWE, 1S3V, 1SJ0, 1TOW, 1U4D, 1V0P, 1YWR
  and lost 1GPK, 1L2S, 1OQ5, 1P62, 1TT1, 1U1C
- `linear_equal_weight` recovered 1HP0, 1S3V, 1TOW, 1U4D, 1V0P, 1YWR
  and lost 1GPK, 1L2S, 1TT1
- `normalised_rank_sum` recovered 1JD0, 1SJ0, 1TOW, 1V0P, 1YVF
  and lost 1U1C

## Step 3 - the frozen criterion, applied mechanically

Criterion: argmax top1Successes over 85; ties by fewer LOST vs the Vina baseline; then by smaller complexityOrder; if the best two are within 1 case, the simpler of the two is selected and that is stated

Ordering produced: `normalised_rank_sum` > `linear_equal_weight` > `vinardo` > `vina`

Highest raw top-1: `normalised_rank_sum` with 54 / 85. Second: `linear_equal_weight` with 53 / 85. Margin: 1 case(s).

**Winner: `linear_equal_weight`.** Decided by `withinOneCaseRule_simplerRulePreferred`.

The best two candidates are **within one case of each other**. The preregistered within-one-case rule therefore applies: the SIMPLER of the two is selected. We state it plainly - **simplicity, not the raw count, decided this**. `normalised_rank_sum` scored 54 and `linear_equal_weight` scored 53; one case is inside the noise this data can resolve, so the higher number was not treated as a real difference.

Residual ranking gap under the winner: **27** cases still hold a native-like pose in the pool that the winning rule does not put first (1G9V, 1GPK, 1JD0, 1JJE, 1L2S, 1L7F, 1MEH, 1MMV, 1MZC, 1N1M, 1N2J, 1N2V, 1OWE, 1P2Y, 1Q1G, 1R58, 1S19, 1SJ0, 1SQ5, 1TT1, 1TZ8, 1UOU, 1XM6, 1YGC, 1YVF, 2BM2, 2BR1).

## Step 4 - per-seed robustness, a measurement rather than a caveat

Each rule applied to ONE seed's own 20-pose set, no pooling. Directly comparable to run 6's per-seed Vina figures 46, 49, 50, 47, 49.

| rule | seed 42 | 1042 | 2042 | 3042 | 4042 | min | max | mean | SD | net vs Vina per seed | mean net |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `vina` | 46 | 49 | 50 | 47 | 49 | 46 | 50 | 48.20 | 1.64 | +0, +0, +0, +0, +0 | +0.00 |
| `vinardo` | 51 | 52 | 50 | 47 | 48 | 47 | 52 | 49.60 | 2.07 | +5, +3, +0, +0, -1 | +1.40 |
| `linear_equal_weight` | 50 | 54 | 52 | 48 | 50 | 48 | 54 | 50.80 | 2.28 | +4, +5, +2, +1, +1 | +2.60 |
| `normalised_rank_sum` | 49 | 54 | 51 | 49 | 50 | 49 | 54 | 50.60 | 2.07 | +3, +5, +1, +2, +1 | +2.40 |

**How much of the winner's margin survives this check.** Pooled, `linear_equal_weight` beats the Vina baseline by +3 cases (53 vs 50). On the five seeds taken one at a time it beats the same seed's Vina ranking by +4, +5, +2, +1, +1, mean +2.60, positive on 5 of 5 seeds and negative on 0. The pooled margin is therefore reproduced, not an artefact of pooling: the advantage is small but it is present on every individual seed, so it is not a pooling artefact. It is still of the same order as the seed-to-seed spread itself (Vina alone moves over 46-50 across seeds, a range of 4 cases), which is the honest size of the effect.

## Step 5 - what a final frozen 85-case run would be expected to produce (ESTIMATE)

**This is an ESTIMATE and an INFERENCE, not a measured result. No final run was performed here, and this document does not authorise one: that run needs its own protocol, frozen after this result is in, and it is the user's decision.**

Inputs to the estimate, all measured above: the winning rule scores 53 / 85 on the pooled run-6 poses; that number was chosen as the best of 4 candidates on these same 85 cases, so it carries selection optimism; the winner's own per-seed counts are [50, 54, 52, 48, 50] (min 48, max 54, SD 2.28); and the frozen pool caps any rule at 80 / 85 here and 81 / 85 in run 6.

**Estimated range for a fresh, frozen, 5-seed pooled 85-case run under `linear_equal_weight`: 50 to 55 of 85, centred near 52.** The centre sits at or just below the 53 measured here because the 53 was picked as the maximum over 4 candidates evaluated on the same test set, and the maximum of several noisy estimates is biased upward by roughly the size of the noise - here about 1 to 2 cases.

What would make it come out LOWER than that:

- **Selection optimism.** Four candidates were scored on these 85 cases and the best was kept. That alone is worth on the order of 1 to 2 cases, and it is the single largest reason the number here should not be quoted as performance.
- **Seed noise in the pool itself.** Pooling five *different* seeds changes which poses exist and which survive deduplication. The per-seed spread of the winner is 48 to 54, a range of 6 cases, and the pooled figure inherits some of that.
- **The out-of-box scoring failure recurs.** One case (1GM8) could not be Vinardo-scored at all inside run 6's own grid box. Any rule that needs Vinardo inherits that failure, and a fresh run with different poses could hit it on more cases, each one a guaranteed loss.
- **Deduplication can discard the native-like pose.** Run 6 already measured this: the raw union reaches 83/85 but the deduplicated pool only 81/85.
- **The hard sampling floor.** 1HVY, 1Q41, 1T9B and 1W1P have no pose under 2.0 A at all, so 81/85 is an absolute cap no ranking rule can pass.
- **Library drift.** A different Vina, Meeko or RDKit build changes Vinardo totals slightly, and several of the recovered cases are decided by small score gaps.

## The blunt conclusion

**No candidate rule gets near 69 / 85.** The best of the four reaches 54 and the winner is fixed at 53; the target is 69. That is a shortfall of 15 to 16 cases, and it is not a rounding error - it is larger than the entire measured effect of changing the scoring function.

Sampling is no longer the binding constraint - the pool holds a native-like pose on 80 of 85 cases. Ranking is the constraint, and this experiment measures how much of the ranking gap these four rules close: **3 of the 31-case gap that run 6 identified.** 27 cases still hold a native-like pose in the pool that the winning rule does not rank first. Reaching 69 would require closing roughly four fifths of that remaining gap, which no reweighting of Vina and Vinardo against each other is going to do. A method that gets there will have to be a different kind of thing - a rescoring model that is not a linear blend of these two - and it will have to be validated on data that was not used to choose it.

## Unit tests

`python3 scripts/test-astex-ranking.py`: **52 passed, 0 failed**.
Covered: the protocol-fingerprint refusal (and the pinned-input, candidate-list, threshold and denominator refusals), each candidate rule's ordering on hand-built poses, the tie-break chain including the preregistered within-one-case simpler-rule rule, the denominator of 85 enforced in code, and the recovered / lost / net accounting.

## Immutability of runs 1-6

43 tracked Astex evidence, preregistration, script and worker files were compared with `git show HEAD:<path>`. Changed: **none**. All unchanged: **True**. This run wrote only NEW files.

## Per-case rank-1 RMSD under each rule

| PDB | pool | best in pool | vina | vinardo | linear | ranksum |
|---|---|---|---|---|---|---|
| 1G9V | 42 | 1.707 | 4.915 | 4.915 | 4.915 | 4.915 |
| 1GKC | 58 | 1.075 | **1.075** | **1.075** | **1.075** | **1.075** |
| 1GM8 | 0 | - | - | - | - | - |
| 1GPK | 35 | 0.517 | **0.517** | 3.664 | 3.664 | **0.517** |
| 1HNN | 53 | 0.449 | **1.016** | **1.016** | **1.016** | **1.016** |
| 1HP0 | 43 | 0.421 | 2.104 | **0.421** | **0.421** | 2.104 |
| 1HQ2 | 32 | 0.404 | **0.404** | **0.404** | **0.404** | **0.404** |
| 1HVY | 50 | 2.041 | 3.270 | 9.674 | 3.270 | 3.270 |
| 1HWI | 57 | 1.324 | **1.324** | **1.324** | **1.324** | **1.324** |
| 1HWW | 39 | 0.290 | **0.290** | **0.290** | **0.290** | **0.290** |
| 1IA1 | 35 | 0.345 | **0.345** | **0.345** | **0.345** | **0.345** |
| 1IG3 | 47 | 0.749 | **1.886** | **0.971** | **0.971** | **1.886** |
| 1J3J | 26 | 0.516 | **0.516** | **0.516** | **0.516** | **0.516** |
| 1JD0 | 48 | 1.293 | 5.231 | 5.825 | 5.825 | **1.939** |
| 1JJE | 42 | 0.808 | 8.036 | 8.036 | 8.036 | 8.036 |
| 1JLA | 37 | 0.582 | **0.582** | **0.582** | **0.582** | **0.582** |
| 1K3U | 45 | 0.637 | **0.637** | **0.637** | **0.637** | **0.637** |
| 1KE5 | 54 | 0.370 | **1.319** | **1.319** | **1.319** | **1.319** |
| 1KZK | 74 | 0.315 | **0.315** | **0.315** | **0.315** | **0.315** |
| 1L2S | 37 | 0.492 | **0.492** | 5.333 | 5.333 | **0.492** |
| 1L7F | 76 | 1.556 | 4.471 | 4.746 | 4.471 | 4.471 |
| 1LPZ | 43 | 0.684 | **0.684** | **0.684** | **0.684** | **0.684** |
| 1LRH | 30 | 0.395 | **0.615** | **0.615** | **0.615** | **0.615** |
| 1M2Z | 43 | 0.321 | **0.321** | **0.321** | **0.321** | **0.321** |
| 1MEH | 58 | 0.954 | 4.207 | 4.207 | 4.207 | 4.207 |
| 1MMV | 61 | 1.992 | 7.095 | 7.095 | 7.095 | 7.095 |
| 1MZC | 63 | 0.496 | 7.755 | **1.311** | 7.755 | 7.755 |
| 1N1M | 43 | 0.834 | 2.009 | 4.723 | 4.723 | 2.009 |
| 1N2J | 58 | 1.452 | 6.933 | 7.564 | 6.933 | 6.933 |
| 1N2V | 30 | 0.569 | 2.743 | 2.743 | 2.743 | 2.743 |
| 1N46 | 24 | 0.559 | **0.559** | **0.559** | **0.559** | **0.559** |
| 1NAV | 23 | 0.759 | **0.759** | **0.759** | **0.759** | **0.759** |
| 1OF1 | 34 | 0.496 | **0.496** | **0.496** | **0.496** | **0.496** |
| 1OF6 | 43 | 0.811 | **0.811** | **0.811** | **0.811** | **0.811** |
| 1OPK | 22 | 0.536 | **1.788** | **0.536** | **0.536** | **1.788** |
| 1OQ5 | 26 | 0.882 | **0.882** | 4.428 | **0.882** | **0.882** |
| 1OWE | 40 | 0.846 | 2.518 | **1.660** | 2.518 | 2.518 |
| 1OYT | 60 | 0.595 | **0.595** | **0.595** | **0.595** | **0.595** |
| 1P2Y | 47 | 1.472 | 4.344 | 4.394 | 4.344 | 4.394 |
| 1P62 | 51 | 0.432 | **0.432** | 5.653 | **0.432** | **0.432** |
| 1PMN | 61 | 0.835 | **0.835** | **0.835** | **0.835** | **0.835** |
| 1Q1G | 56 | 0.819 | 6.393 | 2.960 | 6.393 | 6.393 |
| 1Q41 | 38 | 2.362 | 6.667 | 6.667 | 6.667 | 6.667 |
| 1Q4G | 27 | 0.296 | **0.296** | **0.296** | **0.296** | **0.296** |
| 1R1H | 43 | 1.143 | **1.143** | **1.143** | **1.143** | **1.143** |
| 1R55 | 49 | 1.029 | **1.138** | **1.138** | **1.138** | **1.138** |
| 1R58 | 75 | 1.906 | 3.478 | 3.478 | 3.478 | 3.478 |
| 1R9O | 39 | 0.418 | **1.656** | **1.656** | **1.656** | **1.656** |
| 1S19 | 97 | 1.534 | 2.193 | 2.193 | 2.193 | 2.193 |
| 1S3V | 26 | 0.459 | 6.397 | **0.459** | **0.459** | 6.397 |
| 1SG0 | 21 | 0.913 | **1.723** | **1.723** | **1.723** | **1.723** |
| 1SJ0 | 64 | 0.715 | 5.372 | **1.661** | 5.372 | **1.661** |
| 1SQ5 | 62 | 1.331 | 5.805 | 5.984 | 5.984 | 5.984 |
| 1SQN | 29 | 0.426 | **0.426** | **0.426** | **0.426** | **0.426** |
| 1T40 | 44 | 1.344 | **1.344** | **1.344** | **1.344** | **1.344** |
| 1T46 | 63 | 0.727 | **0.727** | **0.727** | **0.727** | **0.727** |
| 1T9B | 37 | 5.799 | 7.587 | 7.861 | 7.587 | 7.587 |
| 1TOW | 29 | 0.596 | 4.620 | **0.596** | **0.596** | **0.596** |
| 1TT1 | 77 | 0.361 | **0.361** | 3.760 | 3.760 | **0.361** |
| 1TZ8 | 25 | 0.407 | 3.416 | 2.288 | 2.288 | 3.416 |
| 1U1C | 45 | 0.776 | **1.688** | 6.307 | **1.688** | 6.307 |
| 1U4D | 73 | 0.989 | 4.274 | **0.989** | **0.989** | 4.274 |
| 1UML | 57 | 1.196 | **1.860** | **1.860** | **1.860** | **1.860** |
| 1UNL | 52 | 0.446 | **1.636** | **0.446** | **0.446** | **0.446** |
| 1UOU | 46 | 0.545 | 4.933 | 5.523 | 4.933 | 4.933 |
| 1V0P | 45 | 0.744 | 3.194 | **0.744** | **0.744** | **0.744** |
| 1V48 | 65 | 0.852 | **0.852** | **0.852** | **0.852** | **0.852** |
| 1V4S | 40 | 0.723 | **0.723** | **0.723** | **0.723** | **0.723** |
| 1VCJ | 59 | 0.859 | **1.246** | **1.246** | **1.246** | **1.246** |
| 1W1P | 33 | 2.106 | 9.437 | 10.852 | 10.852 | 10.852 |
| 1W2G | 47 | 0.879 | **0.879** | **0.879** | **0.879** | **0.879** |
| 1X8X | 37 | 0.670 | **0.670** | **0.670** | **0.670** | **0.670** |
| 1XM6 | 46 | 1.024 | 2.235 | 2.235 | 2.235 | 2.235 |
| 1XOQ | 33 | 0.538 | **0.538** | **0.538** | **0.538** | **0.538** |
| 1XOZ | 58 | 0.353 | **0.353** | **0.353** | **0.353** | **0.353** |
| 1Y6B | 53 | 0.922 | **0.922** | **0.922** | **0.922** | **0.922** |
| 1YGC | 61 | 1.372 | 3.825 | 3.825 | 3.825 | 3.825 |
| 1YQY | 41 | 0.409 | **0.409** | **0.409** | **0.409** | **0.409** |
| 1YV3 | 38 | 0.494 | **0.494** | **0.494** | **0.494** | **0.494** |
| 1YVF | 64 | 0.818 | 8.905 | 5.931 | 5.931 | **0.818** |
| 1YWR | 58 | 1.396 | 7.107 | **1.738** | **1.738** | 7.107 |
| 1Z95 | 42 | 0.410 | **0.410** | **0.410** | **0.410** | **0.410** |
| 2BM2 | 79 | 1.317 | 4.213 | 4.225 | 4.213 | 4.213 |
| 2BR1 | 34 | 1.304 | 7.426 | 8.306 | 6.347 | 4.432 |
| 2BSM | 36 | 0.457 | **0.457** | **0.457** | **0.457** | **0.457** |
