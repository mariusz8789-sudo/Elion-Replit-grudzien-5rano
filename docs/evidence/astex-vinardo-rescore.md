# Astex run 5 - Vinardo rescoring of the stored run-4 top-20 pose sets

**No docking was performed.** No pose was minimised or moved. The poses are exactly the ones AutoDock Vina wrote in run 4; only the scoring function that ranks them changed.

- Preregistration: `docs/evidence/astex-vinardo-rescoring-prereg.json`
- Frozen protocol fingerprint: `0c9c5f92799e187aa18674b248762ab3e5de1ea9d66d78142966908723f9e5c7`
- Recomputed from the `protocol` object at run time: `0c9c5f92799e187aa18674b248762ab3e5de1ea9d66d78142966908723f9e5c7`
- The protocol was **frozen at 2026-09-27T21:03:50+00:00, before any result in this document was computed**; the runner refuses to execute if the recomputed fingerprint differs.
- Finished: 2026-09-27T21:22:37+00:00
- Engine: AutoDock Vina 1.2.7 (`sf_name="vinardo"`), Meeko 0.8.0, RDKit 2026.03.6

## Headline

| quantity | value |
| --- | --- |
| Vinardo top-1 successes (RMSD < 2.0 A) | **50 / 85** (58.8%) |
| Vina top-1 on the SAME pose sets (run-4 diagnostic) | 46 / 85 |
| Net gain | **+4** |
| RECOVERED of the 20 A_RANKING_FAILURE cases | **7** |
| LOST (Vina rank-1 was native-like, Vinardo rank-1 is not) | **5** |
| RECOVERED overall | 9 |
| Residual ranking gap (native-like pose still in top-20 but not Vinardo rank 1) | **18** |
| UNAVAILABLE (integrity gate) | 0 |
| cases with a failed check | 0 |
| denominator | 85, always |

Lost cases: `1L2S`, `1OF1`, `1OQ5`, `1U1C`, `1UML`

Recovered of the 20 ranking failures: `1IG3`, `1MZC`, `1Q1G`, `1R9O`, `1S3V`, `1V0P`, `1YWR`

## Residual ranking gap after Vinardo

Cases that still contain a native-like pose (RMSD < 2.0 A) somewhere in the stored top-20 but do NOT have it at Vinardo rank 1 - i.e. the native-like pose is available and still mis-ranked. Count: **18**.

| PDB | best RMSD in pose set | Vinardo rank of that pose | original Vina rank of that pose | Vinardo rank-1 RMSD |
| --- | --- | --- | --- | --- |
| 1G9V | 1.579 | 13 | 18 | 10.129 |
| 1HWI | 1.014 | 2 | 2 | 6.452 |
| 1JD0 | 1.873 | 3 | 2 | 5.863 |
| 1JJE | 0.377 | 2 | 5 | 8.050 |
| 1L2S | 0.492 | 3 | 1 | 5.333 |
| 1N2J | 1.463 | 6 | 4 | 7.568 |
| 1N2V | 0.554 | 3 | 3 | 2.743 |
| 1OF1 | 0.773 | 2 | 1 | 3.718 |
| 1OQ5 | 0.877 | 2 | 1 | 5.784 |
| 1OWE | 1.040 | 6 | 4 | 2.484 |
| 1P2Y | 1.458 | 9 | 6 | 4.394 |
| 1S19 | 1.612 | 4 | 5 | 9.041 |
| 1SJ0 | 1.814 | 14 | 3 | 5.083 |
| 1U1C | 1.159 | 7 | 8 | 6.307 |
| 1UML | 1.420 | 6 | 1 | 8.313 |
| 1UOU | 1.739 | 11 | 10 | 4.977 |
| 1XM6 | 0.963 | 2 | 2 | 2.224 |
| 2BR1 | 1.356 | 3 | 5 | 4.425 |

For reference, 68 of the 85 cases have a native-like pose anywhere in the stored top-20 (the run-4 ceiling), and Vinardo puts it first in 50 of them.

## Prespecified interpretation, applied verbatim

- `scoringIsTheBottleneck`: net gain >= +5 AND at least 8 of the 20 A_RANKING_FAILURE cases recovered
- `scoringIsNotTheBottleneck`: net gain <= +2 OR fewer than 4 of the 20 recovered
- `inconclusive`: anything between the two - reported as inconclusive, not spun either way  <- **THIS BRANCH**

Net gain = +4, recovered of 20 = 7 -> branch **inconclusive**.

Consequence rule: only if scoringIsTheBottleneck is met is a next SAMPLING experiment proposed for the 17 B_SAMPLING_FAILURE cases; otherwise the proposal is stated to be premature

**A next sampling experiment for the 17 B_SAMPLING_FAILURE cases is premature.** The prereg allows that proposal only if `scoringIsTheBottleneck` is met, and it is not. No proposal is made here.

## Deterministic replay

| case | poses | scores bit-identical |
| --- | --- | --- |
| 1G9V | 20 | YES |
| 1T46 | 20 | YES |

Replay method: the whole scoring path is executed a second time in a fresh Vina object and the full-precision Python float repr of every pose's Vinardo total is compared exactly

## Unit tests

`scripts/test-astex-vinardo-rescore.py`: 29 tests, 29 passed, 0 failed (python3 scripts/test-astex-vinardo-rescore.py)

## Failed checks

None. For every scored case, every recomputed pose RMSD equals run 4's recorded value to 3 decimals and every recomputed pose SHA-256 equals run 4's.

## The 20 run-4 A_RANKING_FAILURE cases

| PDB | Vina r1 RMSD | Vina r1 score | Vinardo r1 RMSD | Vinardo r1 score | Vina rank now first | outcome | Vinardo r1 pose SHA-256 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1G9V | 10.129 | -8.309 | 10.129 | -6.062 | 1 | STILL_FAILING | `67e8e5cb0c9bb21c4fef10f36780d6e3554ecddbc82654949028768488e33fff` |
| 1HWI | 7.306 | -6.331 | 6.452 | -4.707 | 11 | STILL_FAILING | `e87a4a5c3f027ba5b033a9e506dd65870ad082d224b1161cb8635c6a32b884c8` |
| 1IG3 | 9.333 | -6.579 | 1.729 | -5.488 | 2 | RECOVERED | `53d2625320ea9aaba7a0813325c1c5a6cd890a2688b92295dae68c7b8f8337c7` |
| 1JD0 | 5.549 | -6.254 | 5.863 | -4.620 | 3 | STILL_FAILING | `cd6ad868716a2b066220367e55fe62dff407ff86333c26e155be8df8356476e2` |
| 1JJE | 8.050 | -8.995 | 8.050 | -8.203 | 1 | STILL_FAILING | `ad53edc239b2ef625ab3c81cf4642b887ab984338df5065eb6863110123f99fa` |
| 1MZC | 7.693 | -8.148 | 0.496 | -5.932 | 12 | RECOVERED | `3ca18acd2f65e13cb2304fc0a4d68ee96ed5dd6f0942cfad73e71abe820f14bf` |
| 1N2J | 7.044 | -4.547 | 7.568 | -3.572 | 9 | STILL_FAILING | `17ef11f9d881ca90499dfc02431c3c55ca0acb470269108788f58d1b76565644` |
| 1N2V | 2.743 | -7.294 | 2.743 | -5.074 | 1 | STILL_FAILING | `284996dc877dddf8e901a64a0deeb92d3526dc92ad12aa3ff9413932f1cfff45` |
| 1OWE | 2.484 | -8.597 | 2.484 | -6.292 | 1 | STILL_FAILING | `392227524cd27b4bbffc7ee5bbdd855cf7ef315f6f0cf08ce6b4484c711bc3c6` |
| 1P2Y | 4.344 | -7.176 | 4.394 | -4.891 | 2 | STILL_FAILING | `53848afaa614529652cf02f59d1c56213db9397001dc5159a55b07353798ca68` |
| 1Q1G | 6.279 | -7.567 | 0.827 | -5.107 | 3 | RECOVERED | `1699f06f64e15e87c22cf6ce707766301f682a3c647a92eb26f25faac11ca3ed` |
| 1R9O | 7.794 | -8.370 | 1.655 | -6.832 | 4 | RECOVERED | `2403bf1e89745a13adbf02cbad87ff0dd55bff309d49e40aafa23e05b9872076` |
| 1S19 | 9.348 | -10.561 | 9.041 | -7.747 | 10 | STILL_FAILING | `01a58625d32a24ae55a2aacb13c5d8fae905b63ca5913f14652794877a3d5e68` |
| 1S3V | 6.397 | -9.420 | 0.459 | -6.830 | 3 | RECOVERED | `dc227be69568edf26110e07595c2d3a694ea2e664fa23c5a8e5f3548066970bc` |
| 1SJ0 | 4.803 | -9.562 | 5.083 | -5.905 | 2 | STILL_FAILING | `dcfc7526eaa931eda265604e55edd968499ef7792c6ef1bc6f390a28d989db32` |
| 1UOU | 7.089 | -7.985 | 4.977 | -5.485 | 2 | STILL_FAILING | `472354e3a305c6c7dd4bdcba4a5048ef1838bfea6e14e254c3983a52ffc93429` |
| 1V0P | 3.194 | -8.930 | 1.595 | -5.281 | 4 | RECOVERED | `cfb8b27131d6157ceac392a6961d2b0af9e54281cf22fd0921512e44d871906b` |
| 1XM6 | 2.224 | -8.995 | 2.224 | -6.915 | 1 | STILL_FAILING | `5f2fa86218ed791c78dc3ed3e980208cac713e97eec861fde28dd1594f6dbe0c` |
| 1YWR | 7.434 | -9.836 | 1.760 | -7.058 | 8 | RECOVERED | `160d9ee240192fc5b070b0b7613b2afce812e05dcd5325f676ec34d17c240a4b` |
| 2BR1 | 7.462 | -8.179 | 4.425 | -5.146 | 4 | STILL_FAILING | `fa0913c17ea894e9228db79bc83997e2dc4e119326953eb9011aac43191db494` |

## All 85 cases

RMSD in angstrom, scores in kcal/mol. "Vina rank now first" is the original Vina rank of the pose Vinardo puts first.

| PDB | Vina r1 RMSD | Vina r1 score | Vinardo r1 RMSD | Vinardo r1 score | Vina rank now first | outcome | Vinardo r1 pose SHA-256 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1G9V | 10.129 | -8.309 | 10.129 | -6.062 | 1 | STILL_FAILING | `67e8e5cb0c9bb21c4fef10f36780d6e3554ecddbc82654949028768488e33fff` |
| 1GKC | 6.421 | -5.369 | 6.126 | -4.213 | 11 | STILL_FAILING | `6bc8e425815e1c611b8ef1679ba7e0b5bb23b51a3c1922bcc0775cae574eef08` |
| 1GM8 | 3.540 | -8.143 | 3.540 | -5.610 | 1 | STILL_FAILING | `e7567c808f7148ee06f5823b4f749fecd040c8ca16cdbe2de4a00b5aeae0fe4c` |
| 1GPK | 0.517 | -10.510 | 0.517 | -8.161 | 1 | UNCHANGED_SUCCESS | `91e6bf06066c04b08584bcad6d894d6cd83369a866672470830f3c92c28bfdbe` |
| 1HNN | 1.016 | -8.929 | 1.016 | -7.310 | 1 | UNCHANGED_SUCCESS | `f3b44d8a80fad15995f3b3edcfae24ab55e08d0987ce6f4df30b9841ecd0676b` |
| 1HP0 | 2.808 | -8.163 | 1.050 | -5.215 | 2 | RECOVERED | `5027013021f72216425616c51ba560272bd6e5205bbd6526693aaefe7e035acb` |
| 1HQ2 | 0.404 | -9.433 | 0.404 | -6.411 | 1 | UNCHANGED_SUCCESS | `f1e5e684a6e5f7dd13f547825e6d92958eefcc3646bebe365cd2ec7ea963d331` |
| 1HVY | 9.357 | -9.011 | 9.357 | -6.373 | 1 | STILL_FAILING | `b85c957c1a7d68e226afcd63c26a2829c1e67371e70e8d1ec199cd39caf49560` |
| 1HWI | 7.306 | -6.331 | 6.452 | -4.707 | 11 | STILL_FAILING | `e87a4a5c3f027ba5b033a9e506dd65870ad082d224b1161cb8635c6a32b884c8` |
| 1HWW | 0.290 | -6.957 | 0.290 | -5.431 | 1 | UNCHANGED_SUCCESS | `b9e13cc05f577c718daf7e94c6e46f571ed17e2bb957605b86969557eb3231fc` |
| 1IA1 | 0.387 | -8.580 | 0.387 | -6.746 | 1 | UNCHANGED_SUCCESS | `fd58b8b35713e4b1f7fca492ddc23fe1d2d6458ee6a4a1b44384005295ea69ae` |
| 1IG3 | 9.333 | -6.579 | 1.729 | -5.488 | 2 | RECOVERED | `53d2625320ea9aaba7a0813325c1c5a6cd890a2688b92295dae68c7b8f8337c7` |
| 1J3J | 0.516 | -8.764 | 0.516 | -7.184 | 1 | UNCHANGED_SUCCESS | `bce9b9695242ed296f819f82361d1657142a29d821650f8a7213437b8fffaba9` |
| 1JD0 | 5.549 | -6.254 | 5.863 | -4.620 | 3 | STILL_FAILING | `cd6ad868716a2b066220367e55fe62dff407ff86333c26e155be8df8356476e2` |
| 1JJE | 8.050 | -8.995 | 8.050 | -8.203 | 1 | STILL_FAILING | `ad53edc239b2ef625ab3c81cf4642b887ab984338df5065eb6863110123f99fa` |
| 1JLA | 0.594 | -11.766 | 0.594 | -9.746 | 1 | UNCHANGED_SUCCESS | `a73ea944ad78e1a952a66ef66c6319a64519c1a4b65836e07da9708d110fb9ab` |
| 1K3U | 0.640 | -10.549 | 0.640 | -8.492 | 1 | UNCHANGED_SUCCESS | `6fb3f0850983d71247121162e2a26d2be2aef479cdc70fd4eeb283521c536494` |
| 1KE5 | 2.978 | -8.697 | 2.861 | -5.887 | 2 | STILL_FAILING | `ce4e3160a77bb74caf57012e07f210939e877b926bc63fa1d191fdd87d8a8275` |
| 1KZK | 1.149 | -11.113 | 1.721 | -7.463 | 2 | UNCHANGED_SUCCESS | `f09ca73e8e9d1acb4781933f568e58841d793250cedbd594b770bbe19948b45d` |
| 1L2S | 0.492 | -7.742 | 5.333 | -5.122 | 2 | LOST | `57e4dcbaf8bcad2657f37c94bffcfb3f951c47f16cc396d2f2ac50639eb7fccc` |
| 1L7F | 4.762 | -7.729 | 4.762 | -5.129 | 1 | STILL_FAILING | `f7ba51d42f103ca72a0234b1e7ea56488f92128286ee65954e2bf7cc5048120a` |
| 1LPZ | 0.694 | -10.484 | 0.694 | -8.390 | 1 | UNCHANGED_SUCCESS | `b5a8436541c24834ec6c644bdf499aa377a374d8478147d225b69fd453e5a547` |
| 1LRH | 0.745 | -7.875 | 0.745 | -6.296 | 1 | UNCHANGED_SUCCESS | `7bfdb91c0a1224969672f1368e8a10e9013f4453564e499a66bf5525dea7c5fe` |
| 1M2Z | 0.596 | -10.557 | 0.596 | -6.727 | 1 | UNCHANGED_SUCCESS | `b5560a9d9e596a7597bcde30a3b23c6787b669b5201980c6e6e2e8328f710e9b` |
| 1MEH | 4.177 | -7.651 | 4.511 | -5.417 | 2 | STILL_FAILING | `0618567dc83a268d52247ecdb5069f9280732e25893a8dbf2f0c1db9b404602b` |
| 1MMV | 7.074 | -7.379 | 7.074 | -6.008 | 1 | STILL_FAILING | `8618e1385570ff1e39f7977199c4163ab99923434fb186f2d538c4401180b905` |
| 1MZC | 7.693 | -8.148 | 0.496 | -5.932 | 12 | RECOVERED | `3ca18acd2f65e13cb2304fc0a4d68ee96ed5dd6f0942cfad73e71abe820f14bf` |
| 1N1M | 1.967 | -5.872 | 1.967 | -4.361 | 1 | UNCHANGED_SUCCESS | `9b6113612e63bc359ecb5eb3db7b8bb8c95d923eee585a257ae5bbfda1d92a6b` |
| 1N2J | 7.044 | -4.547 | 7.568 | -3.572 | 9 | STILL_FAILING | `17ef11f9d881ca90499dfc02431c3c55ca0acb470269108788f58d1b76565644` |
| 1N2V | 2.743 | -7.294 | 2.743 | -5.074 | 1 | STILL_FAILING | `284996dc877dddf8e901a64a0deeb92d3526dc92ad12aa3ff9413932f1cfff45` |
| 1N46 | 0.560 | -11.913 | 0.523 | -9.338 | 2 | UNCHANGED_SUCCESS | `15e46919d3c1897cab27e40ad9c8ecaee91c7cfe52b2e4ae4a8b881d5200e9ee` |
| 1NAV | 0.741 | -10.278 | 0.741 | -7.939 | 1 | UNCHANGED_SUCCESS | `1b860f24fedc16eff2a15323b23a3c5a53335b5dc24a24d05d5708fd51c91718` |
| 1OF1 | 0.773 | -7.477 | 3.718 | -4.706 | 3 | LOST | `d3731ef5e8c5714c5d833d73088f58ac1dd444dcea31feff81ee0373c11d288f` |
| 1OF6 | 0.804 | -6.371 | 0.804 | -5.440 | 1 | UNCHANGED_SUCCESS | `ff58a333d86b6d9a35523f7a003255b390b2df3428617c545ea96a06032cc4a5` |
| 1OPK | 1.765 | -11.959 | 0.650 | -8.414 | 3 | UNCHANGED_SUCCESS | `8455e0be442d107f02f84d0d6d7503d8169658663a33d32125f154a94392da87` |
| 1OQ5 | 0.877 | -8.731 | 5.784 | -6.220 | 2 | LOST | `d27db29e2269685c184b740105811c3284ba1e402fc93cab6b5d7db44cb431e5` |
| 1OWE | 2.484 | -8.597 | 2.484 | -6.292 | 1 | STILL_FAILING | `392227524cd27b4bbffc7ee5bbdd855cf7ef315f6f0cf08ce6b4484c711bc3c6` |
| 1OYT | 0.479 | -10.953 | 0.479 | -7.872 | 1 | UNCHANGED_SUCCESS | `66fdb66967586269bef6f0306ad6d80bf94bf356bff3e9504d13cb034f5b1837` |
| 1P2Y | 4.344 | -7.176 | 4.394 | -4.891 | 2 | STILL_FAILING | `53848afaa614529652cf02f59d1c56213db9397001dc5159a55b07353798ca68` |
| 1P62 | 0.984 | -7.968 | 0.984 | -5.338 | 1 | UNCHANGED_SUCCESS | `937892a9935d62c2b4e803f1fcd95502be31690d57c706d302ef96a8afa0d5ee` |
| 1PMN | 0.805 | -9.837 | 0.805 | -6.887 | 1 | UNCHANGED_SUCCESS | `3087d1c6858e456629b7632cdf4e00cea9bc26e9b391f6aeb5cef9c01da5c7ba` |
| 1Q1G | 6.279 | -7.567 | 0.827 | -5.107 | 3 | RECOVERED | `1699f06f64e15e87c22cf6ce707766301f682a3c647a92eb26f25faac11ca3ed` |
| 1Q41 | 6.457 | -9.831 | 2.362 | -6.321 | 5 | STILL_FAILING | `14f4434564a0b1d9d9ac1c25a3fd718bbff51be823ea8db3532517cbe2126c50` |
| 1Q4G | 0.324 | -9.177 | 0.371 | -7.315 | 2 | UNCHANGED_SUCCESS | `f7c59fa914b1065c4b919780a09c4f605fa9111c2d03f710923cfd7ff042fecd` |
| 1R1H | 1.125 | -10.036 | 1.125 | -7.982 | 1 | UNCHANGED_SUCCESS | `5cf8d79836b308af62b7eff874ace52f262d6f0dc36606512ca227a8d171df27` |
| 1R55 | 1.138 | -7.592 | 1.138 | -6.254 | 1 | UNCHANGED_SUCCESS | `a3a961222fb72557735c278e7c6ad1b0e4865d3a241b44072776df8feef3b138` |
| 1R58 | 3.478 | -8.546 | 3.478 | -6.581 | 1 | STILL_FAILING | `bd773f9aa7c612d43cd0502488378e511ef32951caebe1a1f62d1804e97838ec` |
| 1R9O | 7.794 | -8.370 | 1.655 | -6.832 | 4 | RECOVERED | `2403bf1e89745a13adbf02cbad87ff0dd55bff309d49e40aafa23e05b9872076` |
| 1S19 | 9.348 | -10.561 | 9.041 | -7.747 | 10 | STILL_FAILING | `01a58625d32a24ae55a2aacb13c5d8fae905b63ca5913f14652794877a3d5e68` |
| 1S3V | 6.397 | -9.420 | 0.459 | -6.830 | 3 | RECOVERED | `dc227be69568edf26110e07595c2d3a694ea2e664fa23c5a8e5f3548066970bc` |
| 1SG0 | 1.723 | -8.462 | 1.660 | -6.646 | 4 | UNCHANGED_SUCCESS | `caed4dc5ef1d9478d01c62c0ad3cbcd902df9d84e9b0971368fa4ab121466d1d` |
| 1SJ0 | 4.803 | -9.562 | 5.083 | -5.905 | 2 | STILL_FAILING | `dcfc7526eaa931eda265604e55edd968499ef7792c6ef1bc6f390a28d989db32` |
| 1SQ5 | 5.755 | -6.064 | 5.984 | -4.515 | 2 | STILL_FAILING | `13b4410b753796a2fd681d277e2abe6cba5e11e2bda6aadc59fdfa309c94e852` |
| 1SQN | 0.428 | -11.498 | 0.428 | -9.142 | 1 | UNCHANGED_SUCCESS | `5495b14799b14ad15aa1cf967912a0163e3392744cba04a84de3392f40761244` |
| 1T40 | 1.162 | -10.939 | 1.162 | -8.202 | 1 | UNCHANGED_SUCCESS | `c5ae70639f8cf8956a2cc97e5c4d44417fc8d1652fb31de0be231ca651a4de4f` |
| 1T46 | 0.727 | -13.145 | 0.727 | -8.073 | 1 | UNCHANGED_SUCCESS | `83b5ec69f036687230ed3f74ebb7905c23b57e4ac7cbe96c1a4be35bac4eee0f` |
| 1T9B | 7.889 | -6.702 | 7.889 | -4.496 | 1 | STILL_FAILING | `a3de60d9d124b83cf4657fddf731705745df9d2bf7972e2c99f49b5b678123b6` |
| 1TOW | 4.604 | -7.832 | 0.582 | -5.898 | 4 | RECOVERED | `a3f7f1b988e2433bacf826d002a62df21e0f7c246576d8e48f8a16c43ce96e45` |
| 1TT1 | 3.645 | -7.149 | 3.645 | -5.628 | 1 | STILL_FAILING | `b5d975c17a10ee85db07eed32998eb93928319d94808fe4f1e5764a2ef65c3f4` |
| 1TZ8 | 3.429 | -8.029 | 3.417 | -5.630 | 2 | STILL_FAILING | `1708e547cead4a49b14739efc0e5f76dec05dc59200efb39f07e48966e38430a` |
| 1U1C | 1.738 | -8.340 | 6.307 | -6.738 | 3 | LOST | `2b297659bf4707172cb250093026491c48b9f3d5b61c6f30fab82d8e40680ccf` |
| 1U4D | 4.213 | -6.962 | 4.213 | -3.947 | 1 | STILL_FAILING | `447d0fccebbde329a54e46d25313734dbaf2770ccbb3963244f4e988ea7e6dea` |
| 1UML | 1.420 | -9.828 | 8.313 | -7.139 | 3 | LOST | `f478a7a0dbea9d8c55a5a6ac71663395b6e1dd1d87734071ed6d19dbb9815d4d` |
| 1UNL | 1.636 | -8.492 | 0.602 | -6.021 | 2 | UNCHANGED_SUCCESS | `f3622a60be2c2e63336283eafe4eda1bf001e24c1b941bed361e40ee82e49299` |
| 1UOU | 7.089 | -7.985 | 4.977 | -5.485 | 2 | STILL_FAILING | `472354e3a305c6c7dd4bdcba4a5048ef1838bfea6e14e254c3983a52ffc93429` |
| 1V0P | 3.194 | -8.930 | 1.595 | -5.281 | 4 | RECOVERED | `cfb8b27131d6157ceac392a6961d2b0af9e54281cf22fd0921512e44d871906b` |
| 1V48 | 1.026 | -8.416 | 1.026 | -6.420 | 1 | UNCHANGED_SUCCESS | `4bbf40a25fd08b3cf6d14e26bfa28b6cbc1448ff1139c00b65ee896087c42ef1` |
| 1V4S | 0.772 | -8.485 | 0.772 | -6.078 | 1 | UNCHANGED_SUCCESS | `d80ad7a7bac184fd711d7f09b0fd6525b9664b4ebfd37522eb5ca59b6840a16a` |
| 1VCJ | 1.246 | -8.059 | 0.972 | -6.105 | 2 | UNCHANGED_SUCCESS | `2d718b408f7493b8da76e611554c6b5103eebee71d7d882112baaece6d005d4b` |
| 1W1P | 10.850 | -5.885 | 10.850 | -4.256 | 1 | STILL_FAILING | `6c3204a13862362e2675f41a39e611eb8f3d8af04c0b79d639eb23c94e9d6213` |
| 1W2G | 0.795 | -8.255 | 0.795 | -6.115 | 1 | UNCHANGED_SUCCESS | `596a46bfd4b223dc413229a77fdc0724ff46cf19c4140e56944f69eb1158d1ab` |
| 1X8X | 0.794 | -6.901 | 0.794 | -5.250 | 1 | UNCHANGED_SUCCESS | `9bd142f48af00738ce3ecdfe8c85d2a17e5eb11c77649ce41dadf4677d81868d` |
| 1XM6 | 2.224 | -8.995 | 2.224 | -6.915 | 1 | STILL_FAILING | `5f2fa86218ed791c78dc3ed3e980208cac713e97eec861fde28dd1594f6dbe0c` |
| 1XOQ | 0.538 | -9.458 | 0.538 | -6.870 | 1 | UNCHANGED_SUCCESS | `ddb98b50b60bc4a5e627cddd6edf1eec96ffa582febdbd62467ffc10f2255488` |
| 1XOZ | 0.353 | -12.558 | 0.353 | -9.339 | 1 | UNCHANGED_SUCCESS | `bd343ce97ce31483ae0cd1a85a1fc345643173ceb6d14bd6339be05aea631b92` |
| 1Y6B | 0.922 | -9.618 | 0.922 | -6.949 | 1 | UNCHANGED_SUCCESS | `e62d0a5b018b5fe52e70dfea0f433ad604cb5d098b07e5018e67cd912d109c6c` |
| 1YGC | 1.660 | -10.089 | 1.660 | -8.021 | 1 | UNCHANGED_SUCCESS | `10819b8e42839d04f15c574224422a8be95b8f4e1571c8e1292ed41a8cfd40fa` |
| 1YQY | 0.409 | -10.186 | 0.409 | -8.354 | 1 | UNCHANGED_SUCCESS | `23e5f79a70ae0e0c2c76b6bfa5cd32c5a4f412cff14451f1ae4856648dc7a71c` |
| 1YV3 | 0.492 | -12.709 | 0.492 | -9.162 | 1 | UNCHANGED_SUCCESS | `f1fd7799de88e28b0738dd8b37b91e4bf760ad251f3c5c964d34b2f303483b49` |
| 1YVF | 4.206 | -7.998 | 8.549 | -5.286 | 6 | STILL_FAILING | `154021f0b5871a6c4d9ecbfd376db2465e71e29e3f57076a6dea89b930310c68` |
| 1YWR | 7.434 | -9.836 | 1.760 | -7.058 | 8 | RECOVERED | `160d9ee240192fc5b070b0b7613b2afce812e05dcd5325f676ec34d17c240a4b` |
| 1Z95 | 0.740 | -10.420 | 0.740 | -7.403 | 1 | UNCHANGED_SUCCESS | `e6b1bb6460c8ac990e4728db0aef702c75d86a003247fdef89928d74be688606` |
| 2BM2 | 4.213 | -8.466 | 4.213 | -6.198 | 1 | STILL_FAILING | `fbfeb56280078836ee596dd3f6542813ed3acbb54e42d4146d0f76ad456a6e65` |
| 2BR1 | 7.462 | -8.179 | 4.425 | -5.146 | 4 | STILL_FAILING | `fa0913c17ea894e9228db79bc83997e2dc4e119326953eb9011aac43191db494` |
| 2BSM | 0.457 | -9.243 | 0.457 | -6.372 | 1 | UNCHANGED_SUCCESS | `40db169e218812241e225da8cfadf47a43f268229615581b7a01f4afc1cbf5af` |

## Immutability

- Runs 1-4 and the run-1 preregistration were not modified by this run.
- The Vinardo preregistration was not modified: file SHA-256 `d86b5bb4d70bdc0a738055f77e8b7dbd98b79fecba2bac36797098793cf8bb87`.
- Pose sets read from `/tmp/genesis-astex-topn-9wvus3jl` (read-only).
- run-4 evidence SHA-256: `8cab3b217f4371987c7bafa0d3dcc64f393d74757258fc63f1f69ed3ecc70689`

