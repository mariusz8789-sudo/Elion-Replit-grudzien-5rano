# Run 8 - the frozen Genesis pipeline on the unseen PoseBusters benchmark

**The first Genesis docking result measured on complexes that are provably absent from the published training id lists of its scorer. The protocol was frozen and pushed before the set was docked.**

Absolute rates on different benchmarks are NOT comparable one to one: this set and Astex differ in difficulty. The verdict is decided by the paired GNINA-minus-Vina difference measured on this set alone.

GNINA is an external benchmark executable only. It is not in any package manifest and not in any product code path.

Preregistration `docs/evidence/posebusters-unseen-benchmark-prereg.json`, frozen at 2026-09-28T20:39:24+00:00, fingerprint `5ba0e8559eb3a411697b2db46467ac7ba8b8b3635126cebf8eff03aad8c3d47c`, recomputed by the runner and matched.

Wall clock **2974 s** on **4** CPUs with 4 parallel cases.

## Contamination, measured before the run

| set | in CrossDocked2020 | in PDBbind2016 | in either |
|---|---|---|---|
| PoseBusters (this benchmark, 308) | 0 | 0 | 0 |
| Astex (85) | 63 | 47 | 76 |

## 1. Primary metric

Rule: GNINA CNNscore descending, tie-broken by the pooled order. Denominator 308, always.

| window | GNINA | Vina on the same pooled poses |
|---|---|---|
| top-1 | **204** (66.2%) | 202 (65.6%) |
| top-3 | **251** (81.5%) | 239 (77.6%) |
| top-5 | **262** (85.1%) | 246 (79.9%) |
| top-10 | **267** (86.7%) | 256 (83.1%) |
| top-20 | **272** (88.3%) | 263 (85.4%) |

Sampling ceiling in the pool: **275 / 308**.

Paired against Vina on the same pooled poses: recovered **34**, lost **32**, net **+2**.

## 2. Per seed, the same two rules on each seed's own poses

| seed | GNINA | Vina | difference |
|---|---|---|---|
| 42 | 111 | 96 | +15 |
| 1042 | 96 | 87 | +9 |
| 2042 | 108 | 101 | +7 |
| 3042 | 106 | 99 | +7 |
| 4042 | 95 | 89 | +6 |

## 3. Verdict, by the criterion fixed before the run

GNINA minus Vina: **+0.65 percentage points**. Seeds where the advantage reverses: **0**.

**Verdict: DOES_NOT_GENERALISE.**

Criterion, fixed in the preregistration: GENERALISES >= +8.0 pp and no seed reverses; DOES_NOT_GENERALISE <= +2.0 pp or >= 2 seeds reverse; PARTIAL anything between.

Reference effect on Astex: +15.3 pp (63 vs 50 of 85), all five seeds.

Prediction recorded before the run: absolute top-1 55 to 68%, gap +8 to +16, verdict GENERALISES.

## 4. Every failure, kept and published

Status counts: {"DOCKING_FAILED": 7, "PREPARATION_FAILED": 8, "SCORED": 290, "UNAVAILABLE": 3}

**Ranking failures (71)** - a sub-2.0 A pose is in the pool and the rule does not rank it first:

5SAK, 6TW7, 6YJA, 6YMS, 6YYO, 7A9E, 7BJJ, 7BKA, 7C3U, 7C8Q, 7CD9, 7CTM, 7CUO, 7DQL, 7ED2, 7F51, 7F8T, 7FRX, 7FT9, 7JG0, 7KZ9, 7LOU, 7LT0, 7MY1, 7NGW, 7NUT, 7NXO, 7OLI, 7OMX, 7OPG, 7OSO, 7P4C, 7P5T, 7PGX, 7PIH, 7PJQ, 7PRI, 7Q2B, 7QFM, 7QTA, 7R59, 7R6J, 7RH3, 7SUC, 7T0D, 7TB0, 7TH4, 7TM6, 7TS6, 7TXK, 7U0U, 7UJ4, 7UMW, 7V43, 7VB8, 7VKZ, 7WKL, 7WL4, 7WPW, 7WUY, 7XBV, 7XFA, 7XPO, 7Z1Q, 7ZOC, 7ZTL, 7ZZW, 8A2D, 8AUH, 8GFD, 8HO0

**Sampling failures (17)** - no sub-2.0 A pose anywhere in the pool:

6VTA, 6YQV, 7JY3, 7LJN, 7OZ9, 7Q25, 7QE4, 7WJB, 7WUX, 7X9K, 7ZXV, 8AAU, 8AIE, 8B8H, 8D19, 8F4J, 8G6P

**Preparation failures (8)**, all declared in the preregistration in advance and kept in the denominator:

6ZAE, 7CNQ, 7JHQ, 7L00, 7NF0, 7NF3, 7OP9, 7V3N

**Docking failures (7):** 6XM9, 6Z4N, 6ZPB, 7L5F, 7L7C, 7M31, 7QF4

**UNAVAILABLE (3):** 7SUC, 7UMW, 7XRL

## 5. Per case

| PDB | ligand | status | pool | GNINA top-1 RMSD | Vina top-1 RMSD | best in pool | GNINA hit | Vina hit |
|---|---|---|---|---|---|---|---|---|
| 5SAK | ZRY | SCORED | 42 | 5.618 | 0.367 | 0.367 | no | yes |
| 5SB2 | 1K2 | SCORED | 46 | 0.372 | 0.372 | 0.372 | yes | yes |
| 5SD5 | HWI | SCORED | 48 | 1.157 | 4.572 | 0.852 | yes | no |
| 5SIS | JSM | SCORED | 57 | 0.855 | 9.075 | 0.855 | yes | no |
| 6M2B | EZO | SCORED | 43 | 1.763 | 1.763 | 0.576 | yes | yes |
| 6M73 | FNR | SCORED | 56 | 1.065 | 1.065 | 0.792 | yes | yes |
| 6T88 | MWQ | SCORED | 55 | 1.359 | 0.796 | 0.796 | yes | yes |
| 6TW5 | 9M2 | SCORED | 42 | 0.646 | 0.646 | 0.646 | yes | yes |
| 6TW7 | NZB | SCORED | 52 | 6.824 | 1.091 | 1.091 | no | yes |
| 6VTA | AKN | SCORED | 96 | 7.765 | 7.375 | 2.001 | no | no |
| 6WTN | RXT | SCORED | 55 | 0.41 | 2.552 | 0.41 | yes | no |
| 6XBO | 5MC | SCORED | 71 | 0.657 | 0.673 | 0.657 | yes | yes |
| 6XCT | 478 | SCORED | 68 | 1.763 | 9.032 | 0.825 | yes | no |
| 6XG5 | TOP | SCORED | 19 | 0.277 | 0.277 | 0.277 | yes | yes |
| 6XHT | V2V | SCORED | 89 | 1.463 | 1.724 | 1.463 | yes | yes |
| 6XM9 | V55 | DOCKING_FAILED | 0 | None | None | None | no | no |
| 6YJA | 2BA | SCORED | 83 | 2.884 | 4.705 | 1.16 | no | no |
| 6YMS | OZH | SCORED | 56 | 2.927 | 1.154 | 1.154 | no | yes |
| 6YQV | 8K2 | SCORED | 21 | 13.663 | 8.385 | 5.732 | no | no |
| 6YQW | 82I | SCORED | 33 | 0.527 | 0.527 | 0.527 | yes | yes |
| 6YR2 | T1C | SCORED | 56 | 1.013 | 10.934 | 1.013 | yes | no |
| 6YRV | PJ8 | SCORED | 59 | 1.832 | 1.147 | 1.018 | yes | yes |
| 6YSP | PAL | SCORED | 57 | 0.288 | 0.288 | 0.288 | yes | yes |
| 6YT6 | PKE | SCORED | 64 | 0.494 | 2.596 | 0.494 | yes | no |
| 6YYO | Q1K | SCORED | 42 | 5.629 | 8.055 | 0.828 | no | no |
| 6Z0R | Q4H | SCORED | 34 | 0.3 | 0.3 | 0.3 | yes | yes |
| 6Z14 | Q4Z | SCORED | 88 | 0.878 | 0.878 | 0.878 | yes | yes |
| 6Z1C | 7EY | SCORED | 45 | 0.442 | 0.442 | 0.442 | yes | yes |
| 6Z2C | Q5E | SCORED | 62 | 0.99 | 1.411 | 0.752 | yes | yes |
| 6Z4N | Q7B | DOCKING_FAILED | 0 | None | None | None | no | no |
| 6ZAE | ACV | PREPARATION_FAILED | 0 | None | None | None | no | no |
| 6ZC3 | JOR | SCORED | 43 | 0.952 | 0.952 | 0.952 | yes | yes |
| 6ZCY | QF8 | SCORED | 55 | 0.404 | 0.404 | 0.404 | yes | yes |
| 6ZK5 | IMH | SCORED | 65 | 1.789 | 1.436 | 0.885 | yes | yes |
| 6ZPB | 3D1 | DOCKING_FAILED | 0 | None | None | None | no | no |
| 7A1P | QW2 | SCORED | 51 | 0.631 | 3.074 | 0.564 | yes | no |
| 7A9E | R4W | SCORED | 44 | 9.091 | 3.188 | 1.274 | no | no |
| 7A9H | TPP | SCORED | 67 | 0.769 | 1.569 | 0.769 | yes | yes |
| 7AFX | R9K | SCORED | 39 | 0.298 | 0.298 | 0.298 | yes | yes |
| 7AKL | RK5 | SCORED | 20 | 0.323 | 0.323 | 0.323 | yes | yes |
| 7AN5 | RDH | SCORED | 54 | 0.583 | 0.583 | 0.583 | yes | yes |
| 7B2C | TP7 | SCORED | 53 | 1.787 | 1.644 | 1.039 | yes | yes |
| 7B94 | ANP | SCORED | 71 | 1.938 | 1.831 | 1.831 | yes | yes |
| 7BCP | GCO | SCORED | 41 | 0.531 | 1.506 | 0.531 | yes | yes |
| 7BJJ | TVW | SCORED | 31 | 2.973 | 2.968 | 0.566 | no | no |
| 7BKA | 4JC | SCORED | 38 | 5.883 | 5.56 | 1.137 | no | no |
| 7BMI | U4B | SCORED | 42 | 0.32 | 0.32 | 0.32 | yes | yes |
| 7BNH | BEZ | SCORED | 35 | 1.966 | 3.799 | 0.659 | yes | no |
| 7BTT | F8R | SCORED | 68 | 0.923 | 0.923 | 0.923 | yes | yes |
| 7C0U | FGO | SCORED | 76 | 0.777 | 0.777 | 0.777 | yes | yes |
| 7C3U | AZG | SCORED | 29 | 2.587 | 2.587 | 0.435 | no | no |
| 7C8Q | DSG | SCORED | 49 | 3.304 | 0.655 | 0.655 | no | yes |
| 7CD9 | FVR | SCORED | 85 | 8.322 | 10.186 | 1.996 | no | no |
| 7CIJ | G0C | SCORED | 54 | 0.656 | 0.656 | 0.656 | yes | yes |
| 7CL8 | TES | SCORED | 49 | 0.332 | 0.332 | 0.332 | yes | yes |
| 7CNQ | G8X | PREPARATION_FAILED | 0 | None | None | None | no | no |
| 7CNS | PMV | SCORED | 57 | 0.899 | 0.899 | 0.899 | yes | yes |
| 7CTM | BDP | SCORED | 59 | 2.908 | 0.494 | 0.494 | no | yes |
| 7CUO | PHB | SCORED | 22 | 3.289 | 3.289 | 0.375 | no | no |
| 7D5C | GV6 | SCORED | 59 | 0.746 | 0.746 | 0.746 | yes | yes |
| 7DKT | GLF | SCORED | 56 | 1.282 | 1.282 | 1.282 | yes | yes |
| 7DQL | 4CL | SCORED | 24 | 4.619 | 0.272 | 0.272 | no | yes |
| 7DUA | HJ0 | SCORED | 47 | 0.961 | 0.961 | 0.961 | yes | yes |
| 7E4L | MDN | SCORED | 41 | 1.37 | 0.876 | 0.729 | yes | yes |
| 7EBG | J0L | SCORED | 25 | 0.524 | 0.524 | 0.524 | yes | yes |
| 7ECR | SIN | SCORED | 39 | 0.65 | 3.719 | 0.65 | yes | no |
| 7ED2 | A3P | SCORED | 63 | 5.003 | 0.494 | 0.494 | no | yes |
| 7ELT | TYM | SCORED | 72 | 0.409 | 0.409 | 0.409 | yes | yes |
| 7EPV | FDA | SCORED | 80 | 1.817 | 1.817 | 1.032 | yes | yes |
| 7ES1 | UDP | SCORED | 69 | 0.887 | 1.89 | 0.728 | yes | yes |
| 7F51 | BA7 | SCORED | 83 | 3.251 | 0.992 | 0.992 | no | yes |
| 7F5D | EUO | SCORED | 38 | 0.535 | 0.535 | 0.535 | yes | yes |
| 7F8T | FAD | SCORED | 71 | 5.432 | 0.739 | 0.739 | no | yes |
| 7FB7 | 8NF | SCORED | 39 | 0.476 | 0.476 | 0.476 | yes | yes |
| 7FHA | ADX | SCORED | 65 | 0.587 | 1.989 | 0.587 | yes | yes |
| 7FRX | O88 | SCORED | 43 | 10.191 | 2.251 | 1.594 | no | no |
| 7FT9 | 4MB | SCORED | 38 | 5.609 | 5.776 | 0.815 | no | no |
| 7JG0 | GAR | SCORED | 91 | 5.39 | 1.607 | 0.974 | no | yes |
| 7JHQ | VAJ | PREPARATION_FAILED | 0 | None | None | None | no | no |
| 7JMV | 4NC | SCORED | 35 | 0.426 | 0.426 | 0.426 | yes | yes |
| 7JXX | VP7 | SCORED | 46 | 0.442 | 0.442 | 0.442 | yes | yes |
| 7JY3 | VUD | SCORED | 43 | 6.889 | 6.335 | 2.308 | no | no |
| 7K0V | VQP | SCORED | 50 | 0.643 | 0.643 | 0.643 | yes | yes |
| 7KB1 | WBJ | SCORED | 54 | 1.405 | 1.152 | 0.831 | yes | yes |
| 7KC5 | BJZ | SCORED | 53 | 0.993 | 0.993 | 0.993 | yes | yes |
| 7KM8 | WPD | SCORED | 43 | 1.025 | 1.025 | 0.938 | yes | yes |
| 7KQU | YOF | SCORED | 57 | 1.787 | 2.67 | 0.341 | yes | no |
| 7KRU | ATP | SCORED | 74 | 0.799 | 0.799 | 0.799 | yes | yes |
| 7KZ9 | XN7 | SCORED | 34 | 5.694 | 5.713 | 1.059 | no | no |
| 7L00 | XCJ | PREPARATION_FAILED | 0 | None | None | None | no | no |
| 7L03 | F9F | SCORED | 45 | 1.312 | 1.312 | 1.312 | yes | yes |
| 7L5F | XNG | DOCKING_FAILED | 0 | None | None | None | no | no |
| 7L7C | XQ1 | DOCKING_FAILED | 0 | None | None | None | no | no |
| 7LCU | XTA | SCORED | 69 | 1.17 | 10.55 | 1.142 | yes | no |
| 7LEV | 0JO | SCORED | 46 | 0.727 | 0.727 | 0.727 | yes | yes |
| 7LJN | GTP | SCORED | 81 | 5.362 | 6.457 | 3.112 | no | no |
| 7LMO | NYO | SCORED | 65 | 1.582 | 1.828 | 1.104 | yes | yes |
| 7LOE | Y84 | SCORED | 29 | 0.752 | 0.752 | 0.752 | yes | yes |
| 7LOU | IFM | SCORED | 35 | 3.972 | 1.903 | 0.548 | no | yes |
| 7LT0 | ONJ | SCORED | 38 | 2.818 | 6.422 | 1.218 | no | no |
| 7LZD | YHY | SCORED | 56 | 0.85 | 1.553 | 0.85 | yes | yes |
| 7M31 | TDR | DOCKING_FAILED | 0 | None | None | None | no | no |
| 7M3H | YPV | SCORED | 39 | 1.915 | 0.618 | 0.618 | yes | yes |
| 7M6K | YRJ | SCORED | 49 | 1.201 | 0.778 | 0.778 | yes | yes |
| 7MFP | Z7P | SCORED | 88 | 1.396 | 7.821 | 1.396 | yes | no |
| 7MGT | ZD4 | SCORED | 59 | 1.705 | 1.036 | 1.036 | yes | yes |
| 7MGY | ZD1 | SCORED | 76 | 0.819 | 0.819 | 0.819 | yes | yes |
| 7MMH | ZJY | SCORED | 99 | 1.757 | 1.757 | 1.337 | yes | yes |
| 7MOI | HPS | SCORED | 41 | 0.587 | 0.587 | 0.508 | yes | yes |
| 7MSR | DCA | SCORED | 87 | 1.029 | 1.766 | 1.029 | yes | yes |
| 7MWN | WI5 | SCORED | 47 | 0.756 | 0.756 | 0.756 | yes | yes |
| 7MWU | ZPM | SCORED | 48 | 0.705 | 0.705 | 0.606 | yes | yes |
| 7MY1 | IPE | SCORED | 76 | 9.844 | 11.678 | 0.743 | no | no |
| 7MYU | ZR7 | SCORED | 82 | 0.652 | 0.652 | 0.652 | yes | yes |
| 7N03 | ZRP | SCORED | 55 | 0.731 | 0.731 | 0.731 | yes | yes |
| 7N4N | 0BK | SCORED | 79 | 1.222 | 1.222 | 1.222 | yes | yes |
| 7N4W | P4V | SCORED | 52 | 0.28 | 0.28 | 0.28 | yes | yes |
| 7N6F | 0I1 | SCORED | 72 | 1.243 | 1.2 | 1.03 | yes | yes |
| 7N7B | T3F | SCORED | 83 | 1.876 | 1.876 | 1.272 | yes | yes |
| 7N7H | CTP | SCORED | 74 | 1.557 | 1.557 | 0.865 | yes | yes |
| 7NF0 | BYN | PREPARATION_FAILED | 0 | None | None | None | no | no |
| 7NF3 | 4LU | PREPARATION_FAILED | 0 | None | None | None | no | no |
| 7NFB | GEN | SCORED | 29 | 0.765 | 7.052 | 0.765 | yes | no |
| 7NGW | UAW | SCORED | 42 | 6.996 | 0.552 | 0.552 | no | yes |
| 7NLV | UJE | SCORED | 68 | 0.722 | 1.299 | 0.722 | yes | yes |
| 7NP6 | UK8 | SCORED | 38 | 0.302 | 0.302 | 0.302 | yes | yes |
| 7NPL | UKZ | SCORED | 35 | 0.292 | 0.292 | 0.292 | yes | yes |
| 7NR8 | UOE | SCORED | 74 | 0.667 | 0.667 | 0.667 | yes | yes |
| 7NSW | HC4 | SCORED | 42 | 0.347 | 0.347 | 0.347 | yes | yes |
| 7NU0 | DCL | SCORED | 38 | 0.506 | 0.506 | 0.506 | yes | yes |
| 7NUT | GLP | SCORED | 73 | 2.477 | 0.495 | 0.495 | no | yes |
| 7NXO | UU8 | SCORED | 48 | 3.275 | 0.52 | 0.52 | no | yes |
| 7O0N | CDP | SCORED | 62 | 0.632 | 0.904 | 0.632 | yes | yes |
| 7O1T | 5X8 | SCORED | 75 | 1.3 | 1.518 | 1.3 | yes | yes |
| 7ODY | DGI | SCORED | 63 | 0.473 | 0.473 | 0.473 | yes | yes |
| 7OEO | V9Z | SCORED | 27 | 0.862 | 0.862 | 0.862 | yes | yes |
| 7OFF | VCB | SCORED | 40 | 0.769 | 8.248 | 0.633 | yes | no |
| 7OFK | VCH | SCORED | 41 | 1.0 | 0.74 | 0.74 | yes | yes |
| 7OLI | 8HG | SCORED | 52 | 2.641 | 5.485 | 0.675 | no | no |
| 7OMX | CNA | SCORED | 79 | 2.024 | 1.216 | 1.216 | no | yes |
| 7OP9 | 06K | PREPARATION_FAILED | 0 | None | None | None | no | no |
| 7OPG | 06N | SCORED | 50 | 5.653 | 0.918 | 0.54 | no | yes |
| 7OSO | 0V1 | SCORED | 42 | 10.863 | 10.863 | 1.372 | no | no |
| 7OZ9 | NGK | SCORED | 98 | 8.041 | 7.269 | 6.937 | no | no |
| 7OZC | G6S | SCORED | 73 | 0.283 | 0.283 | 0.283 | yes | yes |
| 7P1F | KFN | SCORED | 69 | 1.359 | 5.131 | 1.283 | yes | no |
| 7P1M | 4IU | SCORED | 64 | 0.693 | 0.693 | 0.693 | yes | yes |
| 7P2I | MFU | SCORED | 58 | 0.36 | 0.36 | 0.36 | yes | yes |
| 7P4C | 5OV | SCORED | 49 | 10.243 | 0.358 | 0.358 | no | yes |
| 7P5T | 5YG | SCORED | 41 | 10.347 | 1.504 | 1.504 | no | yes |
| 7PGX | FMN | SCORED | 57 | 2.005 | 2.005 | 1.324 | no | no |
| 7PIH | 7QW | SCORED | 55 | 2.021 | 2.608 | 0.997 | no | no |
| 7PJQ | OWH | SCORED | 58 | 4.31 | 1.819 | 0.75 | no | yes |
| 7PK0 | BYC | SCORED | 90 | 0.891 | 12.289 | 0.891 | yes | no |
| 7PL1 | SFG | SCORED | 64 | 1.132 | 1.132 | 1.132 | yes | yes |
| 7POM | 7VZ | SCORED | 54 | 0.942 | 0.942 | 0.942 | yes | yes |
| 7PRI | 7TI | SCORED | 36 | 4.538 | 5.052 | 1.429 | no | no |
| 7PRM | 81I | SCORED | 64 | 1.501 | 11.381 | 1.262 | yes | no |
| 7PT3 | 3KK | SCORED | 94 | 0.935 | 5.897 | 0.794 | yes | no |
| 7PUV | 84Z | SCORED | 45 | 1.218 | 2.058 | 1.023 | yes | no |
| 7Q25 | 8J9 | SCORED | 65 | 11.053 | 9.057 | 7.165 | no | no |
| 7Q27 | 8KC | SCORED | 52 | 1.851 | 7.33 | 1.589 | yes | no |
| 7Q2B | M6H | SCORED | 29 | 4.306 | 3.598 | 1.2 | no | no |
| 7Q5I | I0F | SCORED | 65 | 0.7 | 0.7 | 0.7 | yes | yes |
| 7QE4 | NGA | SCORED | 62 | 8.401 | 12.848 | 5.108 | no | no |
| 7QF4 | RBF | DOCKING_FAILED | 0 | None | None | None | no | no |
| 7QFM | AY3 | SCORED | 45 | 3.156 | 0.397 | 0.397 | no | yes |
| 7QGP | DJ8 | SCORED | 60 | 1.961 | 0.623 | 0.623 | yes | yes |
| 7QHG | T3B | SCORED | 57 | 0.427 | 0.427 | 0.427 | yes | yes |
| 7QHL | D5P | SCORED | 63 | 1.483 | 1.424 | 1.424 | yes | yes |
| 7QPP | VDX | SCORED | 98 | 0.934 | 0.934 | 0.934 | yes | yes |
| 7QTA | URI | SCORED | 53 | 2.652 | 1.258 | 0.323 | no | yes |
| 7R3D | APR | SCORED | 77 | 1.454 | 5.997 | 0.891 | yes | no |
| 7R59 | I5F | SCORED | 28 | 3.365 | 0.395 | 0.395 | no | yes |
| 7R6J | 2I7 | SCORED | 60 | 9.162 | 7.193 | 1.087 | no | no |
| 7R7R | AWJ | SCORED | 54 | 0.59 | 0.59 | 0.59 | yes | yes |
| 7R9N | F97 | SCORED | 52 | 0.999 | 0.999 | 0.999 | yes | yes |
| 7RC3 | SAH | SCORED | 59 | 0.91 | 0.91 | 0.91 | yes | yes |
| 7RH3 | 59O | SCORED | 91 | 2.001 | 2.001 | 0.642 | no | no |
| 7RKW | 5TV | SCORED | 19 | 1.002 | 1.002 | 1.002 | yes | yes |
| 7RNI | 60I | SCORED | 83 | 0.602 | 5.209 | 0.602 | yes | no |
| 7ROR | 69X | SCORED | 63 | 0.891 | 0.891 | 0.891 | yes | yes |
| 7ROU | 66I | SCORED | 75 | 0.865 | 1.277 | 0.865 | yes | yes |
| 7RSV | 7IQ | SCORED | 42 | 0.858 | 0.858 | 0.858 | yes | yes |
| 7RWS | 4UR | SCORED | 89 | 1.013 | 1.013 | 1.013 | yes | yes |
| 7RZL | NPO | SCORED | 27 | 0.913 | 12.368 | 0.841 | yes | no |
| 7SCW | GSP | SCORED | 85 | 0.663 | 1.015 | 0.663 | yes | yes |
| 7SDD | 4IP | SCORED | 86 | 1.467 | 1.508 | 1.128 | yes | yes |
| 7SFO | 98L | SCORED | 40 | 0.441 | 0.441 | 0.441 | yes | yes |
| 7SIU | 9ID | SCORED | 59 | 0.245 | 0.245 | 0.245 | yes | yes |
| 7SUC | COM | UNAVAILABLE | 47 | None | None | 0.789 | no | no |
| 7SZA | DUI | SCORED | 43 | 0.696 | 0.696 | 0.696 | yes | yes |
| 7T0D | FPP | SCORED | 85 | 2.027 | 5.04 | 0.886 | no | no |
| 7T1D | E7K | SCORED | 47 | 0.559 | 0.559 | 0.559 | yes | yes |
| 7T3E | SLB | SCORED | 97 | 0.413 | 0.413 | 0.413 | yes | yes |
| 7TB0 | UD1 | SCORED | 83 | 3.55 | 7.36 | 1.564 | no | no |
| 7TBU | S3P | SCORED | 39 | 0.488 | 9.215 | 0.488 | yes | no |
| 7TE8 | P0T | SCORED | 39 | 0.988 | 0.988 | 0.942 | yes | yes |
| 7TH4 | FFO | SCORED | 66 | 2.599 | 1.996 | 1.298 | no | yes |
| 7THI | PGA | SCORED | 66 | 1.091 | 1.091 | 0.714 | yes | yes |
| 7TM6 | GPJ | SCORED | 47 | 8.53 | 1.02 | 0.713 | no | yes |
| 7TOM | 5AD | SCORED | 35 | 0.288 | 0.288 | 0.288 | yes | yes |
| 7TS6 | KMI | SCORED | 33 | 3.068 | 3.068 | 0.853 | no | no |
| 7TSF | H4B | SCORED | 64 | 0.389 | 0.389 | 0.389 | yes | yes |
| 7TUO | KL9 | SCORED | 50 | 0.868 | 0.868 | 0.616 | yes | yes |
| 7TXK | LW8 | SCORED | 31 | 2.817 | 1.815 | 1.258 | no | yes |
| 7TYP | KUR | SCORED | 55 | 1.043 | 1.043 | 1.043 | yes | yes |
| 7U0U | FK5 | SCORED | 99 | 6.326 | 1.482 | 1.177 | no | yes |
| 7U3J | L6U | SCORED | 53 | 0.946 | 0.946 | 0.946 | yes | yes |
| 7UAS | MBU | SCORED | 64 | 0.535 | 0.535 | 0.535 | yes | yes |
| 7UAW | MF6 | SCORED | 82 | 0.621 | 0.621 | 0.621 | yes | yes |
| 7UJ4 | OQ4 | SCORED | 98 | 2.851 | 1.881 | 1.398 | no | yes |
| 7UJ5 | DGL | SCORED | 51 | 0.686 | 0.261 | 0.261 | yes | yes |
| 7UJF | R3V | SCORED | 69 | 1.146 | 1.146 | 0.788 | yes | yes |
| 7ULC | 56B | SCORED | 59 | 1.51 | 0.987 | 0.987 | yes | yes |
| 7UMW | NAD | UNAVAILABLE | 84 | None | None | 1.153 | no | no |
| 7UQ3 | O2U | SCORED | 40 | 0.462 | 0.462 | 0.462 | yes | yes |
| 7USH | 82V | SCORED | 37 | 1.768 | 7.479 | 1.651 | yes | no |
| 7UTW | NAI | SCORED | 74 | 1.069 | 1.228 | 1.046 | yes | yes |
| 7UXS | OJC | SCORED | 83 | 1.732 | 4.16 | 1.166 | yes | no |
| 7UY4 | SMI | SCORED | 53 | 0.415 | 0.415 | 0.415 | yes | yes |
| 7UYB | OK0 | SCORED | 56 | 0.828 | 0.907 | 0.828 | yes | yes |
| 7V14 | ORU | SCORED | 48 | 0.528 | 0.528 | 0.528 | yes | yes |
| 7V3N | AKG | PREPARATION_FAILED | 0 | None | None | None | no | no |
| 7V3S | 5I9 | SCORED | 49 | 0.519 | 1.445 | 0.519 | yes | yes |
| 7V43 | C4O | SCORED | 24 | 3.576 | 0.555 | 0.555 | no | yes |
| 7VB8 | STL | SCORED | 14 | 9.408 | 5.7 | 0.305 | no | no |
| 7VBU | 6I4 | SCORED | 33 | 0.436 | 0.436 | 0.436 | yes | yes |
| 7VC5 | 9SF | SCORED | 60 | 1.775 | 1.775 | 0.481 | yes | yes |
| 7VKZ | NOJ | SCORED | 38 | 6.44 | 0.802 | 0.802 | no | yes |
| 7VQ9 | ISY | SCORED | 74 | 1.523 | 1.523 | 1.191 | yes | yes |
| 7VWF | K55 | SCORED | 45 | 1.244 | 1.244 | 0.61 | yes | yes |
| 7VYJ | CA0 | SCORED | 59 | 0.751 | 8.213 | 0.751 | yes | no |
| 7W05 | GMP | SCORED | 45 | 0.564 | 1.759 | 0.564 | yes | yes |
| 7W06 | ITN | SCORED | 55 | 0.403 | 2.227 | 0.403 | yes | no |
| 7WCF | ACP | SCORED | 75 | 0.775 | 0.775 | 0.775 | yes | yes |
| 7WDT | NGS | SCORED | 77 | 1.379 | 1.476 | 1.379 | yes | yes |
| 7WJB | BGC | SCORED | 62 | 11.975 | 11.098 | 6.406 | no | no |
| 7WKL | CAQ | SCORED | 13 | 2.632 | 2.632 | 0.192 | no | no |
| 7WL4 | JFU | SCORED | 52 | 2.27 | 8.184 | 0.553 | no | no |
| 7WPW | F15 | SCORED | 89 | 4.427 | 5.688 | 1.666 | no | no |
| 7WQQ | 5Z6 | SCORED | 30 | 0.429 | 0.429 | 0.429 | yes | yes |
| 7WUX | 6OI | SCORED | 53 | 2.171 | 2.643 | 2.01 | no | no |
| 7WUY | 76N | SCORED | 59 | 2.141 | 2.141 | 0.89 | no | no |
| 7WY1 | D0L | SCORED | 75 | 0.88 | 0.88 | 0.88 | yes | yes |
| 7X5N | 5M5 | SCORED | 34 | 0.534 | 0.534 | 0.534 | yes | yes |
| 7X9K | 8OG | SCORED | 58 | 11.152 | 9.525 | 8.691 | no | no |
| 7XBV | APC | SCORED | 79 | 3.83 | 3.83 | 1.311 | no | no |
| 7XFA | D9J | SCORED | 56 | 2.317 | 6.302 | 0.995 | no | no |
| 7XG5 | PLP | SCORED | 41 | 0.722 | 0.722 | 0.722 | yes | yes |
| 7XI7 | 4RI | SCORED | 43 | 0.808 | 0.808 | 0.808 | yes | yes |
| 7XJN | NSD | SCORED | 52 | 0.714 | 1.484 | 0.714 | yes | yes |
| 7XPO | UPG | SCORED | 77 | 2.897 | 2.521 | 1.206 | no | no |
| 7XQZ | FPF | SCORED | 80 | 1.205 | 1.205 | 0.5 | yes | yes |
| 7XRL | FWK | UNAVAILABLE | 36 | None | None | 2.065 | no | no |
| 7YZU | DO7 | SCORED | 80 | 0.587 | 0.587 | 0.587 | yes | yes |
| 7Z1Q | NIO | SCORED | 45 | 3.684 | 9.39 | 1.348 | no | no |
| 7Z2O | IAJ | SCORED | 33 | 0.308 | 0.308 | 0.308 | yes | yes |
| 7Z7F | IF3 | SCORED | 31 | 0.17 | 0.17 | 0.17 | yes | yes |
| 7ZCC | OGA | SCORED | 55 | 0.825 | 0.77 | 0.77 | yes | yes |
| 7ZDY | 6MJ | SCORED | 68 | 0.391 | 0.391 | 0.391 | yes | yes |
| 7ZF0 | DHR | SCORED | 23 | 0.577 | 4.051 | 0.577 | yes | no |
| 7ZHP | IQY | SCORED | 36 | 0.311 | 0.311 | 0.311 | yes | yes |
| 7ZL5 | IWE | SCORED | 46 | 0.798 | 0.798 | 0.798 | yes | yes |
| 7ZOC | T8E | SCORED | 35 | 10.331 | 1.736 | 1.561 | no | yes |
| 7ZTL | BCN | SCORED | 41 | 2.592 | 2.715 | 0.655 | no | no |
| 7ZU2 | DHT | SCORED | 25 | 0.574 | 0.574 | 0.574 | yes | yes |
| 7ZXV | 45D | SCORED | 100 | 16.641 | 17.223 | 15.631 | no | no |
| 7ZZW | KKW | SCORED | 92 | 2.083 | 2.083 | 1.335 | no | no |
| 8A1H | DLZ | SCORED | 45 | 0.872 | 0.872 | 0.872 | yes | yes |
| 8A2D | KXY | SCORED | 67 | 2.207 | 2.224 | 1.162 | no | no |
| 8AAU | LH0 | SCORED | 27 | 7.206 | 7.058 | 6.009 | no | no |
| 8AEM | LVF | SCORED | 35 | 0.445 | 0.445 | 0.445 | yes | yes |
| 8AIE | M7L | SCORED | 71 | 8.635 | 8.471 | 7.074 | no | no |
| 8AP0 | PRP | SCORED | 69 | 0.594 | 0.594 | 0.594 | yes | yes |
| 8AQL | PLG | SCORED | 41 | 0.452 | 0.452 | 0.452 | yes | yes |
| 8AUH | L9I | SCORED | 67 | 2.457 | 1.269 | 1.269 | no | yes |
| 8AY3 | OE3 | SCORED | 30 | 0.392 | 0.392 | 0.392 | yes | yes |
| 8B8H | OJQ | SCORED | 40 | 10.253 | 10.304 | 8.653 | no | no |
| 8BOM | QU6 | SCORED | 40 | 1.167 | 1.167 | 1.167 | yes | yes |
| 8BTI | RFO | SCORED | 37 | 1.023 | 5.473 | 0.977 | yes | no |
| 8C3N | ADP | SCORED | 62 | 1.627 | 4.01 | 0.821 | yes | no |
| 8C5M | MTA | SCORED | 63 | 0.457 | 0.457 | 0.457 | yes | yes |
| 8CNH | V6U | SCORED | 28 | 0.29 | 0.29 | 0.29 | yes | yes |
| 8CSD | C5P | SCORED | 57 | 0.995 | 0.995 | 0.767 | yes | yes |
| 8D19 | GSH | SCORED | 75 | 6.748 | 7.408 | 6.555 | no | no |
| 8D39 | QDB | SCORED | 35 | 0.354 | 0.354 | 0.354 | yes | yes |
| 8D5D | 5DK | SCORED | 70 | 0.607 | 0.607 | 0.607 | yes | yes |
| 8DHG | T78 | SCORED | 46 | 1.604 | 0.44 | 0.44 | yes | yes |
| 8DKO | TFB | SCORED | 47 | 0.536 | 2.041 | 0.536 | yes | no |
| 8DP2 | UMA | SCORED | 98 | 1.193 | 2.669 | 1.193 | yes | no |
| 8DSC | NCA | SCORED | 37 | 0.291 | 0.291 | 0.291 | yes | yes |
| 8EAB | VN2 | SCORED | 37 | 0.734 | 0.734 | 0.734 | yes | yes |
| 8EX2 | Q2Q | SCORED | 28 | 0.64 | 0.64 | 0.64 | yes | yes |
| 8EXL | 799 | SCORED | 61 | 0.567 | 0.567 | 0.567 | yes | yes |
| 8EYE | X4I | SCORED | 17 | 1.004 | 3.846 | 0.827 | yes | no |
| 8F4J | PHO | SCORED | 60 | 10.72 | 9.563 | 6.379 | no | no |
| 8F8E | XJI | SCORED | 48 | 0.933 | 0.933 | 0.933 | yes | yes |
| 8FAV | 4Y5 | SCORED | 37 | 1.232 | 0.393 | 0.393 | yes | yes |
| 8FLV | ZB9 | SCORED | 57 | 0.63 | 0.63 | 0.63 | yes | yes |
| 8FO5 | Y4U | SCORED | 38 | 0.415 | 0.415 | 0.415 | yes | yes |
| 8G0V | YHT | SCORED | 66 | 1.276 | 1.276 | 1.276 | yes | yes |
| 8G6P | API | SCORED | 63 | 11.273 | 11.531 | 2.346 | no | no |
| 8GFD | ZHR | SCORED | 73 | 2.831 | 7.169 | 0.682 | no | no |
| 8HFN | XGC | SCORED | 49 | 0.431 | 0.431 | 0.431 | yes | yes |
| 8HO0 | 3ZI | SCORED | 37 | 2.811 | 0.487 | 0.487 | no | yes |
| 8J79 | MTE | SCORED | 64 | 0.505 | 0.505 | 0.505 | yes | yes |
| 8SLG | G5A | SCORED | 71 | 0.516 | 1.891 | 0.516 | yes | yes |


## 6. Infrastructure during the run, reported in full

This run was not a single uninterrupted process. Everything below is reported because
the number in section 1 is only worth as much as the account of how it was produced.
No parameter, criterion, preparation step or ranking rule was changed at any point,
and no case was removed, re-docked because its result was poor, or recomputed.

Run started 2026-09-28 21:02:04 UTC. Finished 2026-09-30 19:13:13 UTC.

**Three platform restarts killed the runner process. Each was resumed with the identical
command `python3 scripts/posebusters-unseen-benchmark.py --jobs 4`.** On every resume the
runner re-verified the preregistration fingerprint, the pinned code hashes, the case-list
hash and the gnina binary sha256 before doing any work, and reloaded the already finished
per-case results from disk.

| # | last case before the stop | cases done | idle window with no computation |
|---|---|---|---|
| 1 | 7PUV, 2026-09-29 13:32:38 UTC | 159 / 308 | 13:32:38 -> 18:08 UTC, about 4 h 35 min |
| 2 | 7R3D, 2026-09-29 23:24:44 UTC | 174 / 308 | about 11 min |
| 3 | 7R9N, 2026-09-30 00:01:54 UTC | 175 / 308 | about 3 min |

A fourth stop, at 307 / 308, was a defect in this runner and not a platform restart.
Case 8F4J docked in only 3 of its 5 seeds, and the glue code handed the pose extractor
all five seed records while the gate held only the three that docked, which raised
`KeyError: 1042`. The fix passes the docked seeds only - exactly the set that was pooled
and gate-verified - and lives in this runner, not in the pinned scorer, so the freeze
check still passes. It was verified to change nothing on a normal case: re-running the
already scored case 8HO0 with the fix reproduced its pool, its GNINA ordering and its
top-1 verdict identically. 8F4J was then scored from its three docked seeds, which is
what the preregistration says to do - a case counts as DOCKING_FAILED only when every
seed fails - and it ended a failure for both arms anyway.

**The `wallClockSeconds` field measures only the final resumed process. It is not the
compute cost of 308 cases and must not be quoted as one.**

### The three UNAVAILABLE cases

7SUC, 7UMW and 7XRL all failed for the same external reason: gnina refused to parse the
receptor file because a cofactor atom type it does not know appears in it, for example

```
Parse error on line 4608 ... ATOM syntax incorrect: "CG0" is not a valid AutoDock type.
```

Per the frozen rules each stays in the denominator of 308 as a failure, was never
re-docked and never removed, and no parameter was changed in response.

Note, against our own interest: Vina had docked all five seeds of these three cases and
two of them contain a sub-2.0 A pose in the pool (7SUC best 0.789 A, 7UMW best 1.153 A).
Because the comparison is paired on the same pooled poses, both arms are counted as
failures here. Vina's 202 is therefore, if anything, slightly understated, which makes
the measured GNINA advantage of +0.65 pp an upper bound rather than a lower one.
