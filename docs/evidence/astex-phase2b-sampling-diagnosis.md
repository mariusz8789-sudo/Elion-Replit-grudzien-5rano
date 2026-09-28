# Astex phase 2B - diagnosis of the 17 B_SAMPLING_FAILURE cases

**No docking was performed for this document.** Nothing here changes a benchmark number. The 2.0 A threshold stands, the denominator stays 85, no case is excluded, and runs 1-5 and both preregistrations are untouched. Every measurement below was made on the run-4 artefacts already on disk (`/tmp/genesis-astex-topn-9wvus3jl/`) and the deposited Astex structures (`p2rank-datasets` 0236ecb38cbb60b89849a1ea36fbd9ee93f3e906).

Machine-readable companion: `docs/evidence/astex-phase2b-sampling-diagnosis.json`.

Engine used for the probes: AutoDock Vina 1.2.7, Meeko 0.8.0, RDKit 2026.03.6, biotite 1.6.0 - the same versions as run 4.

## Headline

| question | answer |
| --- | --- |
| of the 17, how many have a concrete identified cause | **17 of 17** |
| of the 17, how many could NOT be explained | **0** |
| near-misses (best pose in the stored 20 within 0.5 A of the threshold) | **7** |
| of the 17, how many are a genuine search failure by the crystal-pose test | **5** |
| of the 17, how many are a scoring failure | **6** |
| of the 17, how many are a preparation / receptor-or-ligand-model failure | **6** |
| single proposed protocol change | dock with the **Vinardo** scoring function instead of docking with `vina` and rescoring afterwards |
| bounded ESTIMATE of cases that change from those 17 | **3 to 6**, hard upper bound 8, lower bound 0 |

The blunt version: **the run-4 label `B_SAMPLING_FAILURE` is mostly wrong.** Only one of the 17 (1YVF) has a native binding mode that is clearly better-scoring than what Vina returned and was nevertheless never visited. For the other 16 the search is not the limiting step - the energy function, the prepared ligand conformer, or the prepared chemical entity is.

## The decisive measurement: scoring the crystal pose itself

For all 85 cases the deposited crystal ligand was scored, at its deposited coordinates, against the *exact* rigid receptor PDBQT run 4 docked into (including the extra rigid cofactor atoms where run 3 kept any), in the same box. Two numbers per case: the score at fixed coordinates, and the score after a Vina local minimisation only (`optimize()`, no search). This is a diagnostic probe, not a rescoring run and not a benchmark result.

The quantity that decides everything is

> **delta_opt = (crystal pose after local minimisation) - (Vina rank-1 pose of the stored 20-pose set)**

A negative delta_opt means the native basin is the better-scoring one and the search missed it - a real search failure. A positive delta_opt means Vina correctly preferred a non-native pose, and no amount of extra exhaustiveness can help.

| group | n | median delta_opt | count with delta_opt < 0 | count with delta_opt < -0.5 |
| --- | ---: | ---: | ---: | ---: |
| 46 run-3 successes | 46 | 0.142 | 15 (rank 1 IS the native pose here, so this is relaxation slop) | 6 |
| 20 A_RANKING_FAILURE | 20 | 0.468 | 5 | 4 |
| **17 B_SAMPLING_FAILURE** | 17 | **0.769** | **6** | **1 (1YVF only)** |

Read the last column. Across the whole 17 there is exactly ONE case where the native basin is better than what Vina returned by more than half a kcal/mol. That is the entire evidential basis for "the search failed".

### The three-way split the user asked for

- **1_SEARCH** (5 cases): The crystal pose scores acceptably on the prepared rigid receptor and does not clash, and its locally minimised score is at least as good as the Vina rank-1 pose, yet no pose within 2.0 A appears in the 20 modes. Vina simply never found it.
- **2_SCORING** (6 cases): The crystal pose scores acceptably and does not clash, but Vina ranks another pose above the locally minimised native basin (delta_opt > 0). The function, not the search, chose wrongly.
- **3_PREPARATION_OR_MODEL** (6 cases): The crystal pose itself is defective on our prepared inputs. Triggered by ANY of: (a) clash - min ligand-receptor heavy-atom distance < 2.2 A or crystal-pose relaxation drift > 0.6 A; (b) the crystal-pose ligand efficiency is worse than the worst of the 46 successes (-0.227 kcal/mol per heavy atom); (c) the prepared ligand's rigid-fragment RMSD floor is >= 1.0 A, so the prepared conformer cannot reproduce the crystal pose; (d) direct inspection shows the docked entity is not the deposited ligand, or a residue lining the site is absent from the prepared receptor.

  Note: This three-way label is a strict mechanical test on the prepared inputs and is reported alongside, not instead of, the C1-C5 class. Where they differ (1HVY, 1MEH, 1T9B are C3 but flagged 3_PREPARATION_OR_MODEL because their crystal pose scores worse than any success; 1Q41 and 1GM8 are C2 and flagged 3 because of the ligand-conformer floor), both labels are true statements about different tests.

  A caution on group 1: four of its five members (1KE5 -0.389, 1L7F -0.495, 1TT1 -0.160, 2BM2 -0.377 kcal/mol) are inside scoring noise, so 'the search never found it' is literally true but the native basin carries almost no advantage to find. Only 1YVF (-0.618) has a margin worth calling a search failure.

| group | cases |
| --- | --- |
| 1_SEARCH | 1KE5, 1L7F, 1TT1, 1YVF, 2BM2 |
| 2_SCORING | 1MMV, 1R58, 1SQ5, 1TZ8, 1U4D, 1W1P |
| 3_PREPARATION_OR_MODEL | 1GKC, 1GM8, 1HVY, 1MEH, 1Q41, 1T9B |

## What is NOT the cause - factors checked and ruled out across all 85

- **boxCoverage** - RULED OUT for all 85. The worst per-case margin over the whole set is 3.167 A (1SJ0, a success); over the 17 it is 4.158 A (1HVY). No crystal ligand comes close to a box wall.
- **stericClashWithTheRigidReceptor** - RULED OUT. The smallest ligand-receptor heavy-atom distance over the 17 is 2.286 A and that is a Mn coordination bond (1R58), not a clash; over all 85 the minimum is 1.934 A. Crystal-pose relaxation drift is 0.08-0.65 A over the 17 and 0.18-0.46 A over the 46 successes - the crystal ligand sits comfortably in every prepared rigid receptor. Receptor side-chain flexibility is not the missing ingredient; this is redocking into the ligand's own holo structure, so the side chains are already in the bound rotamer.
- **covalentOrCoordinatedLigands** - No ligand among the 17 is covalently bound: the smallest ligand-to-protein-ATOM heavy-atom distance is 2.52 A (1MEH, a hydrogen bond to Ser263 OG). Exactly one, 1R58, is metal-coordinated (two Mn at 2.29 and 2.34 A).
- **ligandFlexibility** - RULED OUT as a discriminator. Rotatable bonds: the 17 failures have mean 4.41, median 4, max 9; the 46 successes have mean 4.41, median 4.0, max 11. The distributions are indistinguishable. Heavy atoms: 20.8 mean for the 17 vs 23.6 for the 46 - the failures are if anything SMALLER. 'The ligand is too flexible for exhaustiveness 32' is not supported by the data.
- **crystallographicWater** - NOT SUPPORTED as a discriminator. Waters within 5 A of the ligand: median 0 for the 17, median 3.5 for the 46 successes. Bridging waters (within 3.5 A of both ligand and protein polar atoms): mean 1.00 for the 17, mean 1.04 for the 46 successes, medians both 0. Seven of the 17 have NO water at all within 5 A. Keeping conserved waters cannot be the general fix for this class.
- **missingCofactors** - NOT the cause for the 17. Every cofactor the rule identifies next to these ligands was kept: UMP (1HVY), IMP (1MEH), HEM + BH4 (1MMV), ADP (1SQ5), FAD (1T9B). The only recorded cofactorsNotKept entry among the 17 is CSO:A319 in 1MEH, which is a modified residue, not a cofactor.
- **modifiedResiduesDroppedByTheCleaner** - REAL but RARE. Over the whole 85 only two cases have a modified amino acid deposited as HETATM within 6 A of the ligand: 1MEH (CSO A319, 4.32 A, dropped, class B) and 1XM6 (CME A432, 4.35 A, dropped, class A_RANKING_FAILURE). No MSE, SEP, TPO or PTR lines any of the 85 sites. Fixing the cleaner would touch at most 1 of the 17.

### Correlations found but not proven causal

- **unionisedIonisableGroups** - The prepared ligand keeps the CCD protonation state: carboxylic acids stay neutral COOH, guanidines and amines stay neutral. 13 of the 17 failures (76%) carry at least one such group against 20 of the 46 successes (43%). This is a real association, but Vina's scoring function is charge-blind (no Coulomb term), so the mechanism can only be a change in donor/acceptor typing and torsion count - it is INFERRED, not measured, that correcting protonation would change these poses. Treat as a hypothesis, not a cause.
- **lowLigandEfficiencyOfTheCrystalPose** - The crystal pose of the 17 is scored at a median -0.306 kcal/mol per heavy atom against -0.389 for the 46 successes. Four of the ten worst crystal-pose ligand efficiencies in the whole 85 belong to the 17 (1T9B 2nd, 1HVY 4th, 1GM8 6th, 1GKC 8th). This is the quantitative statement of 'Vina does not see these complexes'.

### Distributions (the 17 against the 46 successes), not cherry-picked examples

| quantity | 46 successes (min / median / mean / max) | 17 B failures | 20 A failures |
| --- | --- | --- | --- |
| rotatable bonds | 0.000 / 4.000 / 4.413 / 11.000 | 0.000 / 4.000 / 4.412 / 9.000 | 1.000 / 5.000 / 4.700 / 8.000 |
| heavy atoms | 12.000 / 23.000 / 23.630 / 41.000 | 10.000 / 23.000 / 20.824 / 32.000 | 10.000 / 23.500 / 23.100 / 35.000 |
| rigid-fragment RMSD floor (A) | 0.012 / 0.354 / 0.395 / 1.243 | 0.020 / 0.437 / 0.473 / 1.654 | 0.027 / 0.363 / 0.336 / 0.777 |
| delta_opt (kcal/mol) | -1.746 / 0.142 / 0.129 / 1.272 | -0.618 / 0.769 / 0.660 / 2.334 | -2.140 / 0.468 / 0.252 / 1.334 |
| crystal-pose Vina (kcal/mol) | -13.371 / -8.613 / -8.829 / -4.826 | -9.591 / -6.545 / -6.538 / -2.548 | -11.725 / -7.388 / -7.307 / -3.582 |
| crystal-pose kcal/mol per heavy atom | -0.607 / -0.389 / -0.393 / -0.227 | -0.457 / -0.306 / -0.324 / -0.198 | -0.438 / -0.340 / -0.334 / -0.162 |
| worst box margin (A) | 3.485 / 4.944 / 5.209 / 7.575 | 4.158 / 5.309 / 5.499 / 7.416 | 3.167 / 4.911 / 5.061 / 7.307 |
| min lig-receptor heavy dist (A) | 1.938 / 2.619 / 2.583 / 3.078 | 2.286 / 2.630 / 2.657 / 2.977 | 1.934 / 2.660 / 2.603 / 3.224 |
| waters within 5 A | 0.000 / 3.500 / 5.087 / 15.000 | 0.000 / 0.000 / 5.000 / 15.000 | 0.000 / 3.000 / 5.500 / 20.000 |
| bridging waters | 0.000 / 0.000 / 1.043 / 5.000 | 0.000 / 0.000 / 1.000 / 3.000 | 0.000 / 0.000 / 1.000 / 5.000 |
| crystal-pose relaxation drift (A) | 0.137 / 0.274 / 0.277 / 0.460 | 0.081 / 0.328 / 0.335 / 0.650 | 0.120 / 0.290 / 0.306 / 0.489 |
| unionised ionisable groups | 0.000 / 0.000 / 0.630 / 3.000 | 0.000 / 1.000 / 1.294 / 4.000 | 0.000 / 1.000 / 0.650 / 2.000 |
| polar heavy-atom fraction | 0.091 / 0.241 / 0.252 / 0.500 | 0.100 / 0.300 / 0.292 / 0.400 | 0.100 / 0.240 / 0.258 / 0.538 |

## Near-misses

**Criterion, applied uniformly to all 17:** best RMSD anywhere in the stored 20-pose set < 2.5 A, i.e. within 0.5 A of the preregistered 2.0 A threshold. No other rule was used and no case was re-labelled by hand.

**7 of 17 are near-misses:** 1HVY (2.009 A), 1MMV (2.093 A), 1W1P (2.096 A), 1U4D (2.210 A), 1MEH (2.326 A), 1Q41 (2.362 A), 1TT1 (2.441 A).

The remaining 10 are not: 1SQ5 (2.642 A), 1R58 (2.748 A), 1KE5 (2.765 A), 2BM2 (2.926 A), 1TZ8 (3.103 A), 1GM8 (3.292 A), 1L7F (3.653 A), 1YVF (3.759 A), 1GKC (3.935 A), 1T9B (5.799 A).

## Per-case table, all 17

Columns: bestR = best RMSD anywhere in the stored 20-pose set; xtal = Vina score of the crystal pose at deposited coordinates; opt = after local minimisation only; r1 = Vina rank-1 score; d_opt = opt - r1; floor = rigid-fragment RMSD floor (lower bound on any achievable RMSD); drift = how far the crystal pose moves under local minimisation; marg = worst box margin; minD = min ligand-receptor heavy-atom distance; w5 / bridge = waters within 5 A / bridging waters; d_vrd = Vinardo(relaxed crystal pose) - best Vinardo score among the 20 stored poses.

| PDB | bestR | class | 3-way | conf | HA | rot | chg | xtal | opt | r1 | d_opt | floor | drift | marg | minD | w5 / bridge | d_vrd | global rule? |
| --- | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| **1HVY** | 2.009 | C3 | 3 | M | 32 | 9 | +0 | -7.22 | -7.61 | -9.01 | +1.41 | 0.632 | 0.33 | 4.16 | 2.63 | 0 / 0 | +1.49 | yes |
| **1MMV** | 2.093 | C3 | 2 | M | 15 | 7 | +1 | -6.08 | -6.46 | -7.38 | +0.92 | 0.062 | 0.21 | 6.36 | 2.52 | 0 / 0 | +0.47 | yes |
| **1W1P** | 2.096 | C3 | 2 | M | 11 | 0 | +0 | -4.42 | -4.95 | -5.88 | +0.93 | 0.146 | 0.42 | 7.42 | 2.67 | 0 / 0 | +0.11 | yes |
| **1U4D** | 2.210 | C4 | 2 | M | 18 | 0 | +0 | -6.31 | -6.74 | -6.96 | +0.23 | 0.437 | 0.31 | 6.16 | 2.67 | 0 / 0 | -0.74 | yes |
| **1MEH** | 2.326 | C3 | 3 | M | 23 | 6 | +0 | -6.54 | -6.88 | -7.65 | +0.77 | 0.742 | 0.16 | 5.41 | 2.52 | 9 / 3 | +0.50 | yes |
| **1Q41** | 2.362 | C2 | 3 | H | 21 | 0 | +0 | -9.59 | -10.17 | -9.83 | -0.34 | 1.654 | 0.33 | 5.31 | 2.62 | 0 / 0 | -1.75 | yes |
| **1TT1** | 2.441 | C4 | 1 | M | 15 | 4 | +0 | -6.86 | -7.31 | -7.15 | -0.16 | 0.438 | 0.37 | 6.28 | 2.59 | 0 / 0 | -0.26 | yes |
| **1SQ5** | 2.642 | C3 | 2 | M | 15 | 6 | +0 | -4.58 | -5.00 | -6.06 | +1.07 | 0.144 | 0.36 | 5.79 | 2.63 | 0 / 0 | +1.06 | yes |
| **1R58** | 2.748 | C3 | 2 | H | 23 | 7 | +0 | -6.51 | -6.71 | -8.55 | +1.84 | 0.053 | 0.08 | 4.99 | 2.29 | 12 / 2 | +1.71 | yes |
| **1KE5** | 2.765 | C4 | 1 | M | 23 | 4 | +0 | -8.38 | -9.09 | -8.70 | -0.39 | 0.169 | 0.25 | 4.43 | 2.89 | 7 / 1 | -1.06 | yes |
| **2BM2** | 2.926 | C4 | 1 | M | 30 | 6 | +0 | -8.04 | -8.84 | -8.47 | -0.38 | 0.673 | 0.34 | 4.44 | 2.63 | 12 / 1 | -1.00 | yes |
| **1TZ8** | 3.103 | C4 | 2 | M | 20 | 4 | +0 | -7.40 | -7.82 | -8.03 | +0.21 | 0.094 | 0.44 | 4.88 | 2.64 | 4 / 2 | -0.43 | yes |
| **1GM8** | 3.292 | C2 | 3 | H | 24 | 4 | +0 | -5.89 | -6.30 | -8.14 | +1.84 | 1.064 | 0.53 | 4.83 | 2.53 | 15 / 3 | +1.74 | yes |
| **1L7F** | 3.653 | C4 | 1 | M | 23 | 7 | +0 | -7.85 | -8.22 | -7.73 | -0.49 | 0.401 | 0.29 | 5.81 | 2.69 | 14 / 3 | -0.91 | yes |
| **1YVF** | 3.759 | C5 | 1 | M | 28 | 6 | +0 | -8.35 | -8.62 | -8.00 | -0.62 | 0.877 | 0.29 | 5.29 | 2.79 | 12 / 2 | -0.98 | yes |
| **1GKC** | 3.935 | C1 | 3 | H | 10 | 1 | +0 | -2.55 | -3.04 | -5.37 | +2.33 | 0.020 | 0.65 | 6.88 | 2.89 | 0 / 0 | +1.54 | yes |
| **1T9B** | 5.799 | C3 | 3 | H | 23 | 4 | +0 | -4.55 | -4.64 | -6.70 | +2.06 | 0.438 | 0.32 | 5.05 | 2.98 | 0 / 0 | +0.71 | yes |

conf: H = HIGH, M = MEDIUM. 3-way: 1 = search, 2 = scoring, 3 = preparation/model.

### HETATM environment of each of the 17 (5 A shell, waters counted separately)

| PDB | non-water HETATM within 5 A of the crystal ligand (the ligand residue itself excluded), and whether the prepared receptor keeps it | cofactor bookkeeping from run 3 | waters <=5 A / <=3.5 A / bridging | modified residues within 6 A |
| --- | --- | --- | --- | --- |
| 1HVY | UMP at 3.10 A - KEPT (rigid cofactor) | kept: UMP:A314; NOT kept: - | 0 / 0 / 0 | none |
| 1MMV | HEM at 2.86 A - KEPT (rigid cofactor) | kept: HEM:A1750, BH41760; NOT kept: - | 0 / 0 / 0 | none |
| 1W1P | GOL at 2.56 A - DROPPED (crystallisation additive); GOL at 3.76 A - DROPPED (crystallisation additive) | kept: -; NOT kept: - | 0 / 0 / 0 | none |
| 1U4D | none | kept: -; NOT kept: - | 0 / 0 / 0 | none |
| 1MEH | IMP at 3.20 A - KEPT (rigid cofactor); CSO at 4.32 A - DROPPED (not kept by any rule) | kept: IMP602; NOT kept: CSO:A319 (no_ccd_template_with_7_heavy_atoms) | 9 / 3 / 3 | CSO A319 at 4.32 A |
| 1Q41 | none | kept: -; NOT kept: - | 0 / 0 / 0 | none |
| 1TT1 | none | kept: -; NOT kept: - | 0 / 0 / 0 | none |
| 1SQ5 | none | kept: ADP5001; NOT kept: - | 0 / 0 / 0 | none |
| 1R58 | MN at 2.29 A - KEPT (metal ion, clean_receptor); MN at 2.34 A - KEPT (metal ion, clean_receptor) | kept: -; NOT kept: - | 12 / 3 / 2 | none |
| 1KE5 | none | kept: -; NOT kept: - | 7 / 4 / 1 | none |
| 2BM2 | none | kept: -; NOT kept: - | 12 / 3 / 1 | none |
| 1TZ8 | GOL at 4.82 A - DROPPED (crystallisation additive) | kept: -; NOT kept: - | 4 / 2 / 2 | none |
| 1GM8 | none | kept: -; NOT kept: - | 15 / 5 / 3 | none |
| 1L7F | none | kept: -; NOT kept: - | 14 / 4 / 3 | none |
| 1YVF | GOL at 3.73 A - DROPPED (crystallisation additive) | kept: -; NOT kept: - | 12 / 5 / 2 | none |
| 1GKC | BUM at 1.35 A - DROPPED (not kept by any rule) | kept: -; NOT kept: - | 0 / 0 / 0 | BUM A1449 at 1.35 A |
| 1T9B | FAD at 3.52 A - KEPT (rigid cofactor) | kept: FAD701; NOT kept: - | 0 / 0 / 0 | none |

## Class grouping

Classes are defined by a test applied uniformly, in this order. No class is a list of PDB IDs; each is a property any case in the set can have.

### C1_LIGAND_DEFINITION_TRUNCATED - 1 case: 1GKC

The deposited ligand spans more than one HETATM residue joined by a covalent bond, and the preregistered ligand rule (chain L, or the single residue carrying the listed code) takes only one of them, so a fragment is docked instead of the inhibitor.

### C2_FIXED_INTERNAL_GEOMETRY_FLOOR - 2 cases: 1GM8, 1Q41

The rigid-fragment RMSD floor of the single ETKDGv3+MMFF conformer is >= 1.0 A. Vina never changes intra-fragment geometry, so the crystal RMSD cannot go below that floor no matter how the search behaves.

### C3_SCORING_FUNCTION_PREFERS_A_NON_NATIVE_POSE - 7 cases: 1HVY, 1MEH, 1MMV, 1R58, 1SQ5, 1T9B, 1W1P

The crystal pose, locally minimised in the prepared rigid receptor, scores MORE THAN 0.5 kcal/mol WORSE than the pose Vina ranked first. The search did its job: the native pose is not the optimum of the Vina function in this receptor representation. More search effort cannot recover these.

### C4_NEAR_DEGENERATE_BASINS - 6 cases: 1KE5, 1L7F, 1TT1, 1TZ8, 1U4D, 2BM2

The locally minimised crystal pose and the Vina rank-1 pose are within +/-0.5 kcal/mol of each other. The native basin carries no decisive energetic advantage, so which one the search returns is close to a coin flip.

### C5_TRUE_SEARCH_FAILURE - 1 case: 1YVF

The locally minimised crystal pose scores MORE THAN 0.5 kcal/mol BETTER than the pose Vina ranked first, yet no pose within 2.0 A appears in the 20 modes. This is the only pattern for which 'the search failed' is the literal explanation.

## Per-case evidence and confidence

### 1HVY - C3_SCORING_FUNCTION_PREFERS_A_NON_NATIVE_POSE - three-way 3_PREPARATION_OR_MODEL - confidence MEDIUM

- Best RMSD in the stored 20-pose set: **2.009 A** (near-miss). Run-3 top-1 RMSD 3.479 A.
- Ligand as docked: `Cc1nc(=O)c2cc(CN(C)c3ccc(C(=O)N[C@@H](CCC(=O)O)C(=O)O)s3)ccc2[nH]1` - 32 heavy atoms, 9 rotatable bonds, formal charge +0, 2 unionised acidic and 0 unionised basic group(s), polar heavy-atom fraction 0.312.
- **Cause:** Relaxed crystal pose is 1.405 kcal/mol worse than Vina rank 1 (-7.606 vs -9.011). D16 is an antifolate whose glutamate tail (two carboxylic acids, prepared neutral) binds an arginine cluster; crystal-pose ligand efficiency -0.226 kcal/mol per heavy atom is the 4th worst of 85. The UMP cofactor IS kept. No waters within 5 A, no dropped residue, box margin 4.158 A, no clash (min lig-receptor heavy distance 2.63 A). The native pose is simply not the Vina optimum here.
- **Three-way evidence:** crystal-pose ligand efficiency -0.226 is worse than the worst of the 46 successes (-0.227)
- **Confidence basis:** The +1.405 kcal/mol adverse gap and the -0.226 ligand efficiency are measured, but that marginally crosses the 'worse than any success' line (-0.227) and the attribution to the unionised glutamate tail is inference, not measurement.
- **Could the fix be a global rule rather than a PDB-specific hack?** YES - Rule: change the docking scoring function globally (the proposal). Applies to all 85 identically.
- Recoverable by the proposed Vinardo docking change (native basin out-scores every stored pose under Vinardo)? **no** (Vinardo delta +1.49 kcal/mol).

### 1MMV - C3_SCORING_FUNCTION_PREFERS_A_NON_NATIVE_POSE - three-way 2_SCORING - confidence MEDIUM

- Best RMSD in the stored 20-pose set: **2.093 A** (near-miss). Run-3 top-1 RMSD 7.057 A.
- Ligand as docked: `CCCNC(=[NH2+])NCCC[C@H](N)C(=O)O` - 15 heavy atoms, 7 rotatable bonds, formal charge +1, 1 unionised acidic and 1 unionised basic group(s), polar heavy-atom fraction 0.400.
- **Cause:** Relaxed crystal pose 0.919 kcal/mol worse than Vina rank 1. 3AR is N-omega-propyl-L-arginine, the only formally charged (+1) ligand among the 17 as prepared; its guanidinium stacks on the haem. HEM (43 heavy atoms) and BH4 ARE kept as rigid cofactors, so the cofactor is not missing. Floor 0.062 A, no clash, no waters within 5 A. The failure is that Vina's charge-blind function does not reward the cation-haem/Glu592 electrostatics that define the pose.
- **Three-way evidence:** crystal pose scores acceptably (LE -0.405) and does not clash (drift 0.21 A), but Vina ranks another pose 0.919 kcal/mol above the relaxed native basin
- **Confidence basis:** The +0.919 kcal/mol adverse gap is measured. The mechanism (charge-blind scoring of a +1 guanidinium over the haem) is inferred; HEM and BH4 are confirmed present, so the obvious alternative is excluded.
- **Could the fix be a global rule rather than a PDB-specific hack?** YES - Rule: change the docking scoring function globally (the proposal). Applies to all 85 identically.
- Recoverable by the proposed Vinardo docking change (native basin out-scores every stored pose under Vinardo)? **no** (Vinardo delta +0.47 kcal/mol).

### 1W1P - C3_SCORING_FUNCTION_PREFERS_A_NON_NATIVE_POSE - three-way 2_SCORING - confidence MEDIUM

- Best RMSD in the stored 20-pose set: **2.096 A** (near-miss). Run-3 top-1 RMSD 10.850 A.
- Ligand as docked: `O=C1NCC(=O)N2CCC[C@@H]12` - 11 heavy atoms, 0 rotatable bonds, formal charge +0, 0 unionised acidic and 0 unionised basic group(s), polar heavy-atom fraction 0.364.
- **Cause:** Relaxed crystal pose 0.933 kcal/mol worse than Vina rank 1. GIO is an 11-heavy-atom rigid bicyclic fragment (0 rotatable bonds); its crystal-pose Vina score is -4.425 kcal/mol, 4th worst of 85 - too weak a signal for the function to locate. Two glycerol molecules sit 2.56 and 3.76 A from the ligand and are dropped as crystallisation additives; they occupy part of the site the docked fragment can wander into. No waters within 5 A.
- **Three-way evidence:** crystal pose scores acceptably (LE -0.402) and does not clash (drift 0.42 A), but Vina ranks another pose 0.933 kcal/mol above the relaxed native basin
- **Confidence basis:** +0.933 kcal/mol adverse gap and a crystal-pose score of -4.425 kcal/mol (4th worst of 85) are measured. The role of the two glycerols dropped at 2.56/3.76 A is inferred, not tested.
- **Could the fix be a global rule rather than a PDB-specific hack?** YES - Global scoring-function change; a second candidate global rule is to keep, rather than drop, crystallisation additives whose heavy atoms come within 4 A of the crystal ligand (here two glycerols at 2.56 and 3.76 A). Both are general rules.
- Recoverable by the proposed Vinardo docking change (native basin out-scores every stored pose under Vinardo)? **no** (Vinardo delta +0.11 kcal/mol).

### 1U4D - C4_NEAR_DEGENERATE_BASINS - three-way 2_SCORING - confidence MEDIUM

- Best RMSD in the stored 20-pose set: **2.210 A** (near-miss). Run-3 top-1 RMSD 4.219 A.
- Ligand as docked: `NC1=NC(=C2CCNC(=O)c3[nH]ccc32)C(=O)N1` - 18 heavy atoms, 0 rotatable bonds, formal charge +0, 0 unionised acidic and 3 unionised basic group(s), polar heavy-atom fraction 0.389.
- **Cause:** Near-degenerate: delta_opt +0.226 kcal/mol. DBQ has ZERO acyclic rotatable bonds but Meeko opens a flexible ring (two G0 ring-closure pseudo-atoms in the ligand PDBQT), so the effective degrees of freedom are not what the rotatable-bond count suggests. Floor 0.437 A. Highly polar (0.389), three neutral basic nitrogens.
- **Three-way evidence:** crystal pose scores acceptably (LE -0.351) and does not clash (drift 0.31 A), but Vina ranks another pose 0.226 kcal/mol above the relaxed native basin
- **Confidence basis:** Near-degeneracy (+0.226 kcal/mol) is measured, as is the presence of Meeko ring-opening pseudo-atoms. Why the search settles on the other basin is not established.
- **Could the fix be a global rule rather than a PDB-specific hack?** YES - Rule: change the docking scoring function globally (the proposal). Applies to all 85 identically.
- Recoverable by the proposed Vinardo docking change (native basin out-scores every stored pose under Vinardo)? **yes** (Vinardo delta -0.74 kcal/mol).

### 1MEH - C3_SCORING_FUNCTION_PREFERS_A_NON_NATIVE_POSE - three-way 3_PREPARATION_OR_MODEL - confidence MEDIUM

- Best RMSD in the stored 20-pose set: **2.326 A** (near-miss). Run-3 top-1 RMSD 4.175 A.
- Ligand as docked: `COc1c(C)c2c(c(O)c1CC=C(C)CCC(=O)O)C(=O)OC2` - 23 heavy atoms, 6 rotatable bonds, formal charge +0, 1 unionised acidic and 0 unionised basic group(s), polar heavy-atom fraction 0.261.
- **Cause:** Relaxed crystal pose 0.769 kcal/mol worse than Vina rank 1. This is the one case of the 17 where the receptor cleaner demonstrably drops a residue lining the site: CSO A319 (S-hydroxy-cysteine) has its nearest heavy atom 4.32 A from the ligand and is recorded in run 3 as cofactorsNotKept with reason no_ccd_template_with_7_heavy_atoms - so neither the ATOM path nor the cofactor path keeps it. The IMP cofactor IS kept. 3 waters within 3.5 A. Geometric floor 0.742 A.
- **Three-way evidence:** CSO A319, a modified residue lining the site 4.32 A from the ligand, is absent from the prepared receptor (run 3 cofactorsNotKept: no_ccd_template_with_7_heavy_atoms)
- **Confidence basis:** That CSO A319 is dropped is a recorded fact; that it causes the failure is inferred - the residue is 4.32 A away, in the second shell. The +0.769 kcal/mol gap is measured.
- **Could the fix be a global rule rather than a PDB-specific hack?** YES - Rule: any HETATM residue carrying N/CA/C/O backbone atoms is a modified amino acid and is kept as rigid receptor atoms (templated from the CCD, or from its heavy atoms with RDKit/Meeko typing). General; it would also pick up 1XM6's CME.
- Recoverable by the proposed Vinardo docking change (native basin out-scores every stored pose under Vinardo)? **no** (Vinardo delta +0.50 kcal/mol).

### 1Q41 - C2_FIXED_INTERNAL_GEOMETRY_FLOOR - three-way 3_PREPARATION_OR_MODEL - confidence HIGH

- Best RMSD in the stored 20-pose set: **2.362 A** (near-miss). Run-3 top-1 RMSD 2.742 A.
- Ligand as docked: `O=C1Nc2ccccc2C1=C1Nc2ccccc2C1=NO` - 21 heavy atoms, 0 rotatable bonds, formal charge +0, 0 unionised acidic and 0 unionised basic group(s), polar heavy-atom fraction 0.238.
- **Cause:** Rigid-fragment RMSD floor 1.654 A - the largest of all 85 cases, and the only one above 1.3 A. IXM (indirubin-3'-monoxime) has ZERO rotatable bonds and just 2 rigid fragments, so the pose is fully determined by the ETKDGv3+MMFF internal geometry of the bis-indolinone/oxime system; that geometry is 1.654 A (lower bound) from the crystal geometry before any docking happens. Delta_opt is only -0.341 kcal/mol, so the energetics are near-degenerate; the barrier is geometric, not energetic, and no amount of search can cross it.
- **Three-way evidence:** prepared-ligand rigid-fragment RMSD floor 1.654 A >= 1.0 A
- **Confidence basis:** Measured rigid-fragment RMSD floor 1.654 A, the largest of all 85 and the only one above 1.3 A, on a ligand with zero rotatable bonds. The barrier is geometric and cannot be argued away.
- **Could the fix be a global rule rather than a PDB-specific hack?** YES - Rule: generate an N-conformer ETKDG ensemble (or enumerate ring conformers) and dock each, keep the best-scoring. General.
- Recoverable by the proposed Vinardo docking change (native basin out-scores every stored pose under Vinardo)? **yes** (Vinardo delta -1.75 kcal/mol).

### 1TT1 - C4_NEAR_DEGENERATE_BASINS - three-way 1_SEARCH - confidence MEDIUM

- Best RMSD in the stored 20-pose set: **2.441 A** (near-miss). Run-3 top-1 RMSD 3.651 A.
- Ligand as docked: `C=C(C)[C@H]1CN[C@H](C(=O)O)[C@H]1CC(=O)O` - 15 heavy atoms, 4 rotatable bonds, formal charge +0, 2 unionised acidic and 1 unionised basic group(s), polar heavy-atom fraction 0.333.
- **Cause:** Near-degenerate: delta_opt -0.160 kcal/mol. KAI is kainate, a zwitterion in reality (two carboxylic acids and a secondary amine, all prepared neutral) bound in the GluR2 ligand-binding cleft, where the pose is set entirely by ion pairs. Floor 0.438 A, no waters, no dropped residue, no clash.
- **Three-way evidence:** crystal pose scores acceptably (LE -0.457), does not clash (drift 0.37 A), and the relaxed native basin is -0.160 kcal/mol BETTER than Vina rank 1 - the search simply never returned it
- **Confidence basis:** Near-degeneracy (-0.160 kcal/mol) is measured. That the missing zwitterion is what flattens the landscape is inference under a charge-blind function.
- **Could the fix be a global rule rather than a PDB-specific hack?** YES - Rule: change the docking scoring function globally (the proposal). Applies to all 85 identically.
- Recoverable by the proposed Vinardo docking change (native basin out-scores every stored pose under Vinardo)? **yes** (Vinardo delta -0.26 kcal/mol).

### 1SQ5 - C3_SCORING_FUNCTION_PREFERS_A_NON_NATIVE_POSE - three-way 2_SCORING - confidence MEDIUM

- Best RMSD in the stored 20-pose set: **2.642 A**. Run-3 top-1 RMSD 5.768 A.
- Ligand as docked: `CC(C)(CO)[C@@H](O)C(=O)NCCC(=O)O` - 15 heavy atoms, 6 rotatable bonds, formal charge +0, 1 unionised acidic and 0 unionised basic group(s), polar heavy-atom fraction 0.400.
- **Cause:** Relaxed crystal pose 1.069 kcal/mol worse than Vina rank 1. PAU is pantothenate: 15 heavy atoms, 6 rotatable bonds, 40% polar, one carboxylic acid prepared neutral. The ADP cofactor IS kept. Crystal-pose Vina score -4.583 kcal/mol, 6th worst of 85. A small, very flexible, very polar ligand whose native pose the Vina function does not distinguish.
- **Three-way evidence:** crystal pose scores acceptably (LE -0.306) and does not clash (drift 0.36 A), but Vina ranks another pose 1.069 kcal/mol above the relaxed native basin
- **Confidence basis:** +1.069 kcal/mol adverse gap measured; ADP cofactor confirmed present, no waters, no dropped residue, no clash. The residual attribution to a small polar flexible ligand is descriptive.
- **Could the fix be a global rule rather than a PDB-specific hack?** YES - Rule: change the docking scoring function globally (the proposal). Applies to all 85 identically.
- Recoverable by the proposed Vinardo docking change (native basin out-scores every stored pose under Vinardo)? **no** (Vinardo delta +1.06 kcal/mol).

### 1R58 - C3_SCORING_FUNCTION_PREFERS_A_NON_NATIVE_POSE - three-way 2_SCORING - confidence HIGH

- Best RMSD in the stored 20-pose set: **2.748 A**. Run-3 top-1 RMSD 3.476 A.
- Ligand as docked: `CC(C)SCC[C@@H](N)[C@H](O)C(=O)NNC(=O)c1cccc(Cl)c1` - 23 heavy atoms, 7 rotatable bonds, formal charge +0, 0 unionised acidic and 1 unionised basic group(s), polar heavy-atom fraction 0.261.
- **Cause:** Relaxed crystal pose 1.838 kcal/mol worse than Vina rank 1. The ligand's hydroxamate-like group coordinates TWO manganese ions at 2.29 and 2.34 A (the shortest ligand-receptor heavy-atom distances in the whole set after the metals are included). Both Mn are kept, but as bare AD4 metal atoms: Vina's scoring function has no metal-coordination term, so the single interaction that fixes the pose contributes almost nothing. Crystal-pose relaxation drift 0.08 A - the pose fits the rigid receptor perfectly, it just does not score.
- **Three-way evidence:** crystal pose scores acceptably (LE -0.283) and does not clash (drift 0.08 A), but Vina ranks another pose 1.838 kcal/mol above the relaxed native basin
- **Confidence basis:** Measured +1.838 kcal/mol adverse gap with zero relaxation drift (0.08 A) - the pose fits perfectly and still loses. The ligand coordinates two Mn at 2.29/2.34 A and Vina has no metal-coordination term; that is a documented property of the function, not a guess.
- **Could the fix be a global rule rather than a PDB-specific hack?** YES - Rule: a scoring function with a metal-coordination term, applied to all 85. NOT satisfied by the proposed Vinardo change, which is also charge- and coordination-blind (measured Vinardo delta +1.706).
- Recoverable by the proposed Vinardo docking change (native basin out-scores every stored pose under Vinardo)? **no** (Vinardo delta +1.71 kcal/mol).

### 1KE5 - C4_NEAR_DEGENERATE_BASINS - three-way 1_SEARCH - confidence MEDIUM

- Best RMSD in the stored 20-pose set: **2.765 A**. Run-3 top-1 RMSD 3.012 A.
- Ligand as docked: `CNS(=O)(=O)c1ccc(NC=C2C(=O)Nc3ccccc32)cc1` - 23 heavy atoms, 4 rotatable bonds, formal charge +0, 0 unionised acidic and 0 unionised basic group(s), polar heavy-atom fraction 0.261.
- **Cause:** Relaxed crystal pose and Vina rank 1 are within scoring noise (-9.086 vs -8.697; delta -0.389 kcal/mol). Geometric floor 0.169 A, box margin 4.432 A, no clash, 4 waters within 3.5 A of the ligand (CDK2 hinge). Nothing structural is missing; the two basins are near-degenerate under the Vina function and the search returned the other one.
- **Three-way evidence:** crystal pose scores acceptably (LE -0.364), does not clash (drift 0.25 A), and the relaxed native basin is -0.389 kcal/mol BETTER than Vina rank 1 - the search simply never returned it
- **Confidence basis:** Measured -0.389 kcal/mol: the native basin is very slightly better and was not returned. No structural defect found. The cause is the flatness of the landscape, which is measured; the reason the search chose otherwise is not.
- **Could the fix be a global rule rather than a PDB-specific hack?** YES - Rule: change the docking scoring function globally (the proposal). Applies to all 85 identically.
- Recoverable by the proposed Vinardo docking change (native basin out-scores every stored pose under Vinardo)? **yes** (Vinardo delta -1.06 kcal/mol).

### 2BM2 - C4_NEAR_DEGENERATE_BASINS - three-way 1_SEARCH - confidence MEDIUM

- Best RMSD in the stored 20-pose set: **2.926 A**. Run-3 top-1 RMSD 4.196 A.
- Ligand as docked: `NCc1cccc(C2CCN(C(=O)c3cncc(CCc4ccccc4)c3)CC2)c1` - 30 heavy atoms, 6 rotatable bonds, formal charge +0, 0 unionised acidic and 1 unionised basic group(s), polar heavy-atom fraction 0.133.
- **Cause:** Near-degenerate: delta_opt -0.377 kcal/mol. PM2 is a 30-heavy-atom, 6-rotatable-bond thrombin/factor-Xa-type ligand with a benzylamine (prepared neutral) that should be an ammonium engaging the S1 aspartate. Floor 0.673 A, 3 waters within 3.5 A, no dropped residue, no clash.
- **Three-way evidence:** crystal pose scores acceptably (LE -0.268), does not clash (drift 0.34 A), and the relaxed native basin is -0.377 kcal/mol BETTER than Vina rank 1 - the search simply never returned it
- **Confidence basis:** Measured -0.377 kcal/mol. No structural defect found. Same caveat as 1KE5.
- **Could the fix be a global rule rather than a PDB-specific hack?** YES - Rule: change the docking scoring function globally (the proposal). Applies to all 85 identically.
- Recoverable by the proposed Vinardo docking change (native basin out-scores every stored pose under Vinardo)? **yes** (Vinardo delta -1.00 kcal/mol).

### 1TZ8 - C4_NEAR_DEGENERATE_BASINS - three-way 2_SCORING - confidence MEDIUM

- Best RMSD in the stored 20-pose set: **3.103 A**. Run-3 top-1 RMSD 3.438 A.
- Ligand as docked: `CCC(=C(CC)c1ccc(O)cc1)c1ccc(O)cc1` - 20 heavy atoms, 4 rotatable bonds, formal charge +0, 0 unionised acidic and 0 unionised basic group(s), polar heavy-atom fraction 0.100.
- **Cause:** Near-degenerate: delta_opt +0.213 kcal/mol. DES (diethylstilbestrol) is an almost apolar, pseudo-symmetric ligand (polar fraction 0.100) in the oestrogen-receptor pocket; the crystal pose and a flipped pose are within scoring noise. Floor 0.094 A, 2 bridging waters, one glycerol at 4.82 A (dropped as an additive, too far to matter).
- **Three-way evidence:** crystal pose scores acceptably (LE -0.370) and does not clash (drift 0.44 A), but Vina ranks another pose 0.213 kcal/mol above the relaxed native basin
- **Confidence basis:** Near-degeneracy (+0.213 kcal/mol) is measured. The pseudo-symmetry explanation for a flipped pose is inference.
- **Could the fix be a global rule rather than a PDB-specific hack?** YES - Rule: change the docking scoring function globally (the proposal). Applies to all 85 identically.
- Recoverable by the proposed Vinardo docking change (native basin out-scores every stored pose under Vinardo)? **yes** (Vinardo delta -0.43 kcal/mol).

### 1GM8 - C2_FIXED_INTERNAL_GEOMETRY_FLOOR - three-way 3_PREPARATION_OR_MODEL - confidence HIGH

- Best RMSD in the stored 20-pose set: **3.292 A**. Run-3 top-1 RMSD 3.523 A.
- Ligand as docked: `CC1(C)[C@H](C(=O)O)N2C(=O)[C@@H](NC(=O)Cc3ccccc3)[C@H]2[S@H]1O` - 24 heavy atoms, 4 rotatable bonds, formal charge +0, 1 unionised acidic and 0 unionised basic group(s), polar heavy-atom fraction 0.292.
- **Cause:** Rigid-fragment RMSD floor 1.064 A (lower bound). SOX is the ring-opened penicilloate with a saturated thiazolidine and a sulfoxide stereocentre; the single ETKDGv3+MMFF conformer's internal geometry cannot be superposed on the crystal geometry to better than 1.064 A even with every torsion set perfectly, and Vina cannot change intra-fragment geometry. The relaxed crystal pose also scores 1.843 kcal/mol WORSE than Vina rank 1, so both barriers are present.
- **Three-way evidence:** prepared-ligand rigid-fragment RMSD floor 1.064 A >= 1.0 A
- **Confidence basis:** Measured floor 1.064 A AND a measured +1.843 kcal/mol adverse energetic gap. Two independent barriers, both measured.
- **Could the fix be a global rule rather than a PDB-specific hack?** YES - Same conformer-ensemble rule as 1Q41.
- Recoverable by the proposed Vinardo docking change (native basin out-scores every stored pose under Vinardo)? **no** (Vinardo delta +1.74 kcal/mol).

### 1L7F - C4_NEAR_DEGENERATE_BASINS - three-way 1_SEARCH - confidence MEDIUM

- Best RMSD in the stored 20-pose set: **3.653 A**. Run-3 top-1 RMSD 4.765 A.
- Ligand as docked: `CCC(CC)[C@H](NC(C)=O)[C@@H]1[C@H](O)[C@@H](C(=O)O)C[C@H]1NC(=N)N` - 23 heavy atoms, 7 rotatable bonds, formal charge +0, 1 unionised acidic and 3 unionised basic group(s), polar heavy-atom fraction 0.348.
- **Cause:** Relaxed crystal pose 0.495 kcal/mol BETTER than Vina rank 1 but the native basin was not returned in 20 modes. BCZ is a neuraminidase transition-state analogue with a guanidine and a carboxylic acid, both prepared neutral (3 neutral base groups, 1 neutral acid); the real complex is a salt bridge network. 3 bridging waters. Floor 0.401 A.
- **Three-way evidence:** crystal pose scores acceptably (LE -0.341), does not clash (drift 0.29 A), and the relaxed native basin is -0.495 kcal/mol BETTER than Vina rank 1 - the search simply never returned it
- **Confidence basis:** Measured -0.495 kcal/mol: native basin better, not returned. The salt-bridge network of a neuraminidase transition-state analogue is prepared fully neutral, which is a fact about the input, but its causal role is inference.
- **Could the fix be a global rule rather than a PDB-specific hack?** YES - Rule: change the docking scoring function globally (the proposal). Applies to all 85 identically.
- Recoverable by the proposed Vinardo docking change (native basin out-scores every stored pose under Vinardo)? **yes** (Vinardo delta -0.91 kcal/mol).

### 1YVF - C5_TRUE_SEARCH_FAILURE - three-way 1_SEARCH - confidence MEDIUM

- Best RMSD in the stored 20-pose set: **3.759 A**. Run-3 top-1 RMSD 4.209 A.
- Ligand as docked: `O=C(O)C(=Cc1ccc(Oc2ccccc2Br)cc1)NC(=O)c1ccccc1` - 28 heavy atoms, 6 rotatable bonds, formal charge +0, 1 unionised acidic and 0 unionised basic group(s), polar heavy-atom fraction 0.179.
- **Cause:** The only case of the 17 where the relaxed crystal pose is more than 0.5 kcal/mol BETTER than anything the search returned (-8.616 vs -7.998; delta_opt -0.618) - i.e. a genuinely better-scoring native basin existed and 32-exhaustiveness/20-mode search did not visit it. Floor 0.877 A (high, but below the 1.0 A class threshold), 2 bridging waters, one glycerol at 3.73 A dropped.
- **Three-way evidence:** crystal pose scores acceptably (LE -0.298), does not clash (drift 0.29 A), and the relaxed native basin is -0.618 kcal/mol BETTER than Vina rank 1 - the search simply never returned it
- **Confidence basis:** Measured -0.618 kcal/mol: the only case where the native basin is clearly better and the search still missed it. The classification is solid; no mechanism for WHY the search missed it was established.
- **Could the fix be a global rule rather than a PDB-specific hack?** YES - Rule: change the docking scoring function globally (the proposal). Applies to all 85 identically.
- Recoverable by the proposed Vinardo docking change (native basin out-scores every stored pose under Vinardo)? **yes** (Vinardo delta -0.98 kcal/mol).

### 1GKC - C1_LIGAND_DEFINITION_TRUNCATED - three-way 3_PREPARATION_OR_MODEL - confidence HIGH

- Best RMSD in the stored 20-pose set: **3.935 A**. Run-3 top-1 RMSD 6.434 A.
- Ligand as docked: `CNC(=O)[C@@H](N)C(C)(C)C` - 10 heavy atoms, 1 rotatable bonds, formal charge +0, 0 unionised acidic and 1 unionised basic group(s), polar heavy-atom fraction 0.300.
- **Cause:** The deposited ligand is TWO HETATM residues joined by a covalent bond: BUM A1449 (12 heavy atoms) -C ... N- BUM L1448 (10 heavy atoms), C-N distance 1.35 A. The preregistered ligand rule ('the HETATM residue in chain L') takes only BUM L1448, so 10 of 22 heavy atoms are docked. The docked SMILES is CNC(=O)[C@@H](N)C(C)(C)C - a tert-leucine N-methylamide fragment, not the hydroxamate inhibitor. Its crystal-pose Vina score is -2.548 kcal/mol, the worst of all 85 cases. A 10-atom fragment in an open MMP groove has no unique energetic minimum; the RMSD is meaningless as a sampling measurement.
- **Three-way evidence:** clash/large relaxation drift (drift 0.65 A, min heavy dist 2.89 A); the docked chemical entity is not the deposited ligand (10 of 22 heavy atoms)
- **Confidence basis:** Direct structural fact from the deposited file: two BUM residues joined by a 1.35 A C-N bond, only one of them docked. Nothing inferred.
- **Could the fix be a global rule rather than a PDB-specific hack?** YES - Rule: treat covalently bonded HETATM residues (heavy-atom distance < 1.9 A between residues sharing the ligand's chain/site) as one ligand. General, no PDB named.
- Recoverable by the proposed Vinardo docking change (native basin out-scores every stored pose under Vinardo)? **no** (Vinardo delta +1.54 kcal/mol).

### 1T9B - C3_SCORING_FUNCTION_PREFERS_A_NON_NATIVE_POSE - three-way 3_PREPARATION_OR_MODEL - confidence HIGH

- Best RMSD in the stored 20-pose set: **5.799 A**. Run-3 top-1 RMSD 8.733 A.
- Ligand as docked: `COc1nc(C)nc(NC(=O)NS(=O)(=O)c2ccccc2Cl)n1` - 23 heavy atoms, 4 rotatable bonds, formal charge +0, 1 unionised acidic and 0 unionised basic group(s), polar heavy-atom fraction 0.391.
- **Cause:** Relaxed crystal pose 2.059 kcal/mol worse than Vina rank 1 and the crystal-pose ligand efficiency, -0.198 kcal/mol per heavy atom, is the SECOND WORST of all 85 cases for a 23-heavy-atom ligand. The FAD cofactor (53 heavy atoms) IS kept. 1CS is a chlorsulfuron-type sulfonylurea bound in the long AHAS substrate channel; Vina scores the crystal pose at -4.548 kcal/mol, essentially indistinguishable from a generic channel position, which is why the search ends 5.799 A away - the worst of the 17.
- **Three-way evidence:** crystal-pose ligand efficiency -0.198 is worse than the worst of the 46 successes (-0.227)
- **Confidence basis:** Measured: crystal-pose ligand efficiency -0.198 kcal/mol per heavy atom, worse than any of the 46 successes and 2nd worst of all 85; relaxed crystal pose 2.059 kcal/mol worse than Vina rank 1. The conclusion 'Vina does not see this complex' follows from the numbers.
- **Could the fix be a global rule rather than a PDB-specific hack?** YES - Rule: change the docking scoring function globally (the proposal). Applies to all 85 identically.
- Recoverable by the proposed Vinardo docking change (native basin out-scores every stored pose under Vinardo)? **no** (Vinardo delta +0.71 kcal/mol).

## The one proposed protocol change

**Dock with the Vinardo scoring function (vina.Vina(sf_name='vinardo')) instead of docking with 'vina' and rescoring afterwards. One global constant in dock_worker; nothing per-target, no new box, no new preparation step.**

The diagnosis says the search is not the bottleneck: only 1 of the 17 (1YVF) has a native basin more than 0.5 kcal/mol better than what the search returned, so raising exhaustiveness addresses at most 1 case. 10 of the 17 fail because the native pose is not the optimum of the energy function being searched (7 in C3, plus C1 and the 2 in C2 where the energetics are also adverse). The only way to recover those is to change the energy landscape, and of the changes available, changing the scoring function is the one the existing evidence already quantifies from two independent directions: run 5 showed Vinardo re-ranking alone moves 46 -> 50 on the SAME pose sets, and the crystal-pose probe here shows that for 8 of the 17 (1KE5, 1L7F, 1Q41, 1TT1, 1TZ8, 1U4D, 1YVF, 2BM2) the locally minimised crystal pose out-scores EVERY one of the 20 stored poses under Vinardo, by 0.26 to 1.75 kcal/mol - a native basin that is the Vinardo optimum but not the Vina optimum. Docking with Vinardo makes the search follow that landscape instead of merely re-reading it at the end.

### Alternatives considered and why they lose

| alternative | why it is not the best single change |
| --- | --- |
| raiseExhaustiveness | Addresses only C5 (1 case). For the 7 C3 cases the search already found something the function likes better than the native pose; more search makes that worse, not better. |
| keepConservedWaters | The water statistics do not separate the 17 from the 46 successes, and 7 of the 17 have no water within 5 A. |
| flexibleReceptorSideChains | Redocking uses the holo receptor; the crystal pose relaxes by at most 0.65 A in every prepared receptor, so there is nothing to relieve. |
| keepModifiedResiduesDepositedAsHETATM | Correct to do, but touches 1 of the 17 (1MEH) and 1 of the 20 A cases (1XM6). |
| multipleETKDGconformers | Addresses C2 (2 cases) and would lower the floor generally, but the floor exceeds 1.0 A in only 2 of the 17 and in 1 of the 46 successes. |
| protonateLigandsAtPH7.4 | Best-supported correlation but no measured mechanism under a charge-blind scoring function. |

### Bounded estimate - LABELLED AS AN ESTIMATE, NOT A MEASUREMENT

> ESTIMATE, NOT A MEASUREMENT. No docking was run for this document.

- **Hard upper bound: 8 of the 17.** Exactly 8 of the 17 have vinardoDeltaOptMinusBestStored < 0, i.e. a native basin that out-scores every pose the Vina search produced under Vinardo: 1KE5, 1L7F, 1Q41, 1TT1, 1TZ8, 1U4D, 1YVF, 2BM2. For the other 9 Vinardo still prefers a non-native pose by +0.11 to +1.74 kcal/mol, so re-docking with Vinardo cannot recover them.
- **Lower bound: 0.** A better-scoring basin is necessary, not sufficient: the Vinardo search must also visit it, and it must produce a pose under 2.0 A once there. 1Q41 in particular has a 1.654 A rigid-fragment floor, so even a perfect Vinardo search may land at ~1.7-2.4 A.
- **Most likely: 3 to 6 of the 17.** Of the 8, six have a Vinardo margin >= 0.73 kcal/mol (1KE5 -1.06, 2BM2 -1.00, 1YVF -0.98, 1L7F -0.91, 1U4D -0.74, 1Q41 -1.75) and two are marginal (1TT1 -0.26, 1TZ8 -0.43). Discount 1Q41 for its geometric floor. That leaves ~5 plausible plus 2 marginal, and any global search change converts basins to sub-2.0 A poses imperfectly, so 3 to 6 is the honest interval.
- **Caveat that matters:** This is a bound on the 17 only. Run 5 also showed Vinardo re-ranking LOSES 5 cases that Vina got right (1L2S, 1OF1, 1OQ5, 1U1C, 1UML). Re-docking with Vinardo re-rolls all 85, so the net effect on the headline 46/85 is NOT bounded by this estimate and could be negative.

### The one next experiment

Re-run the full 85-case protocol unchanged except sf_name='vinardo' at docking time (same preparation, same boxes, same exhaustiveness 32, same seed 42, same 2.0 A threshold, same denominator 85), preregistered before it is run, and report it as run 6 alongside run 3 rather than replacing it. Prespecify the two numbers that decide it: successes/85, and the count among the 17 diagnosed here. The falsifiable prediction from this diagnosis is that of the 17, between 3 and 6 are recovered and none of the 9 with a positive Vinardo delta is.

## What could not be determined

- Whether any of the C3 cases would be recovered by a protonation fix: Vina and Vinardo are both charge-blind, so the prepared protonation state could not be tested with the existing scoring machinery. The association (76% vs 43%) is reported, the causation is not established.
- The true RMSD floor including fragment connectivity. The reported floor is a lower bound obtained by fitting each rigid fragment independently; the achievable floor is higher by an unmeasured amount.
- Whether the Vinardo search would actually visit the better-scoring native basins. Only the scores of the basins were measured, never a Vinardo docking run.
- For 1GKC, what the benchmark result would be with the full 22-heavy-atom two-residue ligand. It was not re-docked, because that requires changing the preregistered ligand rule.

Cases of the 17 left with no identified cause: **0**. That is a statement about having *a* mechanism supported by measurement for each case, not a claim that each mechanism is proven - the per-case confidence column says which are HIGH (5 cases: 1GKC, 1GM8, 1Q41, 1R58, 1T9B) and which are MEDIUM (12 cases). None is HIGH by inference alone; every HIGH rests on a number in the table above.

