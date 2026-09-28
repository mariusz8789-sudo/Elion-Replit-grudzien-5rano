# Astex phase 2 — global preparation fixes: implementation, audit and bounded validation

**Nothing in this document changes a benchmark headline.** The preregistered 46/85 stands. The
2.0 A threshold stands, the denominator stays 85, no case is excluded. Runs 1-5, both
preregistrations, `docs/evidence/astex-posesets/` and the three preregistered astex scripts are
byte-identical to HEAD `5e18ce62`; this was verified with `git show HEAD:<path>` against the
working tree. **Nothing was committed, pushed, merged or deployed.** The full 85-case benchmark was
NOT run.

Machine-readable companion: `docs/evidence/astex-phase2-preparation-fixes.json`.

New code, none of it touching the preregistered path:

| file | what it is |
| --- | --- |
| `scripts/astex_phase2_prep.py` | the three rules, as importable functions |
| `scripts/astex-phase2-redock.py` | a subset redock driver that *imports* `scripts/astex-redock-benchmark.py` and reuses its functions |
| `scripts/test-astex-phase2-preparation.py` | unit tests — **27 passed, 0 failed, 0 skipped** |

Engine: AutoDock Vina 1.2.7, Meeko 0.8.0, RDKit 2026.03.6, biotite 1.6.0 — the run-4 versions.

## Baseline used for comparison

Run 3 is the preregistered top-1 path (`redock`, `num_modes` 1). The new numbers come from
`redock_poses` with `numModes` 20, which is the **run-4 diagnostic** path
(`docs/evidence/astex-redock-run4-diagnostic.json`). Run 4 used the run-3 preparation with the same
exhaustiveness 32 and seed 42, so **run 4 is the like-for-like baseline** and every before/after
below is against it. Run-3 top-1 numbers are listed too, but the run-4 diagnostic already
documented that rank 1 of the 20-mode path is not bit-identical to the 1-mode path in 80 of 85
cases.

---

## RULE 1 — multi-residue covalently linked ligands

**Statement (general, no PDB named).** After the preregistered ligand residue is selected, absorb —
transitively — every other HETATM residue that has a heavy atom within covalent bonding distance of
a ligand heavy atom:

> d(A,B) <= r_cov(A) + r_cov(B) + 0.40 A

with Cordero (2008) covalent radii and a 0.40 A tolerance (the OpenBabel/ASE connectivity
convention). Excluded by class, never by distance: water, single-atom metal ions, the pipeline's
crystallisation-additive list, and any residue the run-3 cofactor rule already keeps. The criterion
is element-dependent, not a single hard-coded number: the C-N cutoff is 1.870 A, the S-S cutoff is
2.500 A, the C-C cutoff is 1.920 A.

### Audit over all 85 — the rule changes exactly one case

| PDB | absorbed residue | heavy atoms before -> after | bond | bond length | cutoff | margin |
| --- | --- | ---: | --- | ---: | ---: | ---: |
| **1GKC** | BUM:A1449 (12 heavy atoms) | **10 -> 22** | N...C | **1.350 A** | 1.870 A | **+0.520 A** |

No other case of the 85 absorbs anything.

### False positives — the margin

The nearest *rejected* contact anywhere in the 85, i.e. the closest any non-absorbed HETATM residue
comes to a ligand:

| closest contact | PDB | residue | what it is |
| ---: | --- | --- | --- |
| 4.325 A | 1MEH | CSO:A319 | modified residue, second shell (handled by rule 2, not rule 1) |
| 4.352 A | 1XM6 | CME:A432 | modified residue (rule 2) |
| 6.799 A | 2BM2 | PM23211 | second ligand-like HETATM |
| 8.024 A | 1OYT | NA601 | ion |
| 8.184 A | 1KZK | EGL801 | additive-like |
| **8.574 A** | **1G9V** | **RQ3802** | **a second copy of the ligand — correctly not absorbed** |
| 8.600 A | 1Q4G | HEM:A801 | cofactor |
| 8.910 A | 1N1M | HG950 | ion |

The accepted bond is 1.350 A. The nearest rejected contact is 4.325 A — **2.975 A further out than
the accepted bond, and 2.455 A outside its own covalent cutoff.** There is no case anywhere near
the decision boundary. The one structure with a genuine second copy of the ligand (1G9V) misses the
cutoff by 6.7 A.

### Why 1GKC needed it

The deposited 1GKC ligand is two HETATM residues both labelled `BUM`: L1448 (10 heavy atoms) and
A1449 (12 heavy atoms), joined by a 1.350 A N...C amide bond. The preregistered rule ("the HETATM
residue in chain L") took only L1448 — the tert-leucine-N-methylamide half, **without** the
N-formyl-N-hydroxy (hydroxamate) zinc-binding group. The merged 22 heavy atoms match the
`NFH` CCD entry exactly, so the existing CCD chemistry path assigns the full inhibitor with no new
chemistry machinery.

---

## RULE 2 — modified amino-acid residues of the protein chain

**Statement (general).** A HETATM residue is a modified residue *of the chain*, and is kept as part
of the rigid receptor, when all of the following hold:

1. it carries a complete amino-acid backbone by atom name (N, CA, C, O);
2. it is not water, not a metal ion, not on the crystallisation-additive list, not the ligand, and
   not a residue the cofactor rule already keeps;
3. its backbone N or C is within covalent bonding distance (the rule-1 criterion) of a backbone N
   or C of an `ATOM` record — i.e. it is peptide-bonded into the polymer.

It is typed with the repository's existing CCD infrastructure: the wwPDB CCD entry (as shipped in
biotite) is restricted to the atom names the deposited residue actually carries — polymer leaving
atoms such as OXT are removed and the open valences capped with implicit hydrogens — then RDKit
`AssignBondOrdersFromTemplate` + `AddHs(addCoords)`, Meeko AD4 typing, torsion tree discarded, and
the atoms appended through the existing `extraRigidPdbqtPaths` channel. **No residue name is
special-cased**; CSO, CME and CSD are found by the backbone test and typed by the CCD lookup alone.

The OXT-removal step is the whole fix: run 3 rejected these residues with
`no_ccd_template_with_7_heavy_atoms` / `..._10_...` precisely because the free-amino-acid CCD entry
has one more oxygen than a residue inside a chain.

**Deterministic handling of the untypable.** A residue that passes the class test but cannot be
typed is left out and recorded under `rule2ModifiedResiduesNotTyped` with the exception text — never
silently dropped. Over all 85 that list is **empty**: every residue the rule keeps was typed.

### Audit over all 85 — the rule changes four cases

| PDB | residues kept | heavy atoms added | receptor heavy atoms before -> after | nearest to the crystal ligand |
| --- | --- | ---: | ---: | ---: |
| 1HVY | CME:A43 | 10 | 2339 -> 2349 | 19.485 A (outside the box) |
| 1JLA | CSD:A280 | 8 | 7813 -> 7821 | 32.780 A (outside the box) |
| **1MEH** | CSO:A319 | 7 | 2725 -> 2732 | **4.325 A (lines the site)** |
| **1XM6** | CME:A194, CME:A320, CME:A432 | 30 | 2719 -> 2749 | **4.352 A (A432 lines the site)** |

This confirms Phase 2B: over all 85 only two *sites* are affected, 1MEH and 1XM6. No MSE, SEP, TPO
or PTR occurs in any of the 85. 1HVY and 1JLA gain a residue far outside the docking box and
therefore act as built-in null controls (see below — both reproduce run 4 bit for bit).

### Residues the class test deliberately rejects

| PDB | residue | why not |
| --- | --- | --- |
| 1N2J | BAL802 (beta-alanine) | has a backbone, but its nearest backbone-to-chain contact is 3.500 A — a free molecule, not a chain residue |
| 1GKC | BUM:A1449 | has a backbone, but is 4.039 A from the chain; rule 1 absorbs it into the ligand instead |
| 1HNN | SAH2001 | has a backbone, but the run-3 cofactor rule already keeps it |

---

## RULE 3 — receptor protonation and histidine states: **audited, nothing implemented**

### What the pipeline actually does

- Every deposited receptor hydrogen is dropped (`clean_receptor` in the preregistered script).
- `meeko mk_prepare_receptor` adds hydrogens from its residue templates: **55 168 polar hydrogens
  (AD4 type HD) over 307 569 receptor atoms across the 85**.
- There is no pH model, no titration, no hydrogen-bond-network optimisation, no Asn/Gln/His flip.

### Histidine — measured, all 85 receptors

**895 histidine residues audited across the 85 prepared receptors. All 895 are the same tautomer:
NE2-H (HIE), ND1 an acceptor.** Zero HID, zero HIP. This is a fixed Meeko template, so the current
handling is *already* one deterministic global rule — the same choice for every histidine in every
structure, never chosen per PDB.

### Is there a failure class pointing at it? No.

| exposure | 46 run-3 successes | 22 A_RANKING_FAILURE | 17 B_SAMPLING_FAILURE |
| --- | ---: | ---: | ---: |
| cases with a histidine ring N within 4.5 A of the ligand | 18 / 46 (39%) | 11 / 22 (50%) | **2 / 17 (12%)** |
| cases with a rotatable Ser/Thr/Tyr hydroxyl H within 4.0 A | 38 / 46 (83%) | 14 / 22 (64%) | 12 / 17 (71%) |

Neither failure class is enriched. The B_SAMPLING class — the one Phase 2B was about — is the
*least* exposed to histidine of the three groups (12% against 39% for the successes), and the
successes are the *most* exposed to fixed hydroxyl hydrogens. Phase 2B independently ruled out
steric clash and receptor flexibility, and its only protonation finding was about the **ligand**,
where it noted that Vina is charge-blind so no mechanism could be tested.

### Verdict

**No rule implemented.** The current handling is deterministic, global, and identical for all 85; no
measured failure class points at it. Adding a hydrogen-bond-network optimiser (Reduce, PDB2PQR)
would be new machinery chosen on no evidence, and any per-structure tautomer assignment would be
exactly the per-PDB tuning that is forbidden. **What this does not rule out:** that such an
optimiser would move some poses. That was not measured and is not claimed either way.

---

## Validation — limited in scope

**5 cases any rule changes** (1GKC, 1HVY, 1JLA, 1MEH, 1XM6) **plus 8 control cases no rule
changes.**

**Control selection criterion, stated before the run and applied mechanically:** the run-3 successes
that no rule changes (45 of them), sorted by PDB id ascending, taking indices 0, 6, 12, 18, 24, 30,
36, 42 — every sixth. That gives 1GPK, 1J3J, 1N1M, 1OQ5, 1R55, 1UML, 1X8X, 1YV3. No hand-picking.

Protocol: the run-3 protocol otherwise completely unchanged — vina scoring, exhaustiveness 32, seed
42, same box rule, same cofactor rule — with `numModes` 20 so top-K is reportable.

### Crystal-pose scores on the newly prepared receptors

Recomputed with the Phase 2B scoring calls (`Vina(sf_name='vina', seed=42)`, `score()` at deposited
coordinates, `optimize()` for the relaxed reference). The "before" column was recomputed on the
run-4 receptors **with the identical code**, and reproduces Phase 2B's published values exactly
(e.g. 1MEH -6.545, relaxation drift 0.161 A), so the two columns are directly comparable.

| PDB | rule | crystal-pose Vina before -> after | after local opt | min lig-receptor heavy dist | relaxation drift |
| --- | --- | ---: | ---: | ---: | ---: |
| **1GKC** | 1 | **-2.548 -> -5.290** | -3.035 -> -6.229 | 2.894 -> **2.074** A | 0.650 -> 0.461 A |
| 1HVY | 2 | -7.222 -> -7.222 | -7.606 -> -7.606 | 2.630 -> 2.630 | 0.330 -> 0.330 |
| 1JLA | 2 | -10.840 -> -10.840 | -11.394 -> -11.394 | 2.702 -> 2.702 | 0.291 -> 0.291 |
| **1MEH** | 2 | **-6.545 -> -6.628** | -6.882 -> -6.955 | 2.520 -> 2.520 | 0.161 -> 0.225 |
| **1XM6** | 2 | **-7.638 -> -7.711** | -8.070 -> -8.141 | 3.026 -> 3.026 | 0.236 -> 0.224 |
| all 8 controls | none | unchanged to 3 decimals | unchanged | unchanged | unchanged |

The 2.074 A contact in 1GKC is the new hydroxamate oxygen to the catalytic **ZN 1450** — a
coordination bond, not a clash. With the truncated 10-atom fragment the closest ligand-receptor
contact was 2.894 A: the fragment had no zinc-binding group at all.

### Re-docked results

| PDB | group | run-3 class | old rank-1 RMSD | new rank-1 RMSD | old rank-1 score | new rank-1 score | old best-in-20 | new best-in-20 | crosses 2.0 A |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| **1GKC** | changed | B_SAMPLING | 6.421 | 6.650 | -5.369 | **-6.796** | 3.935 (@17) | **1.447 (@3)** | no |
| 1HVY | changed | B_SAMPLING | 9.357 | 9.357 | -9.011 | -9.011 | 2.009 (@15) | 2.009 (@15) | no |
| 1JLA | changed | SUCCESS | 0.594 | 0.594 | -11.766 | -11.766 | 0.594 (@1) | 0.594 (@1) | no |
| 1MEH | changed | B_SAMPLING | 4.177 | **4.660** | -7.651 | -7.447 | 2.326 (@10) | **2.455 (@4)** | no |
| 1XM6 | changed | A_RANKING | 2.224 | 2.235 | -8.995 | -9.049 | 0.963 (@2) | 0.956 (@2) | no |
| 1GPK | control | SUCCESS | 0.517 | 0.517 | -10.510 | -10.510 | 0.517 (@1) | 0.517 (@1) | no |
| 1J3J | control | SUCCESS | 0.516 | 0.516 | -8.764 | -8.764 | 0.516 (@1) | 0.516 (@1) | no |
| 1N1M | control | SUCCESS | 1.967 | 1.967 | -5.872 | -5.872 | 0.871 (@2) | 0.871 (@2) | no |
| 1OQ5 | control | SUCCESS | 0.877 | 0.877 | -8.731 | -8.731 | 0.877 (@1) | 0.877 (@1) | no |
| 1R55 | control | SUCCESS | 1.138 | 1.138 | -7.592 | -7.592 | 1.138 (@1) | 1.138 (@1) | no |
| 1UML | control | SUCCESS | 1.420 | 1.420 | -9.828 | -9.828 | 1.420 (@1) | 1.420 (@1) | no |
| 1X8X | control | SUCCESS | 0.794 | 0.794 | -6.901 | -6.901 | 0.741 (@2) | 0.741 (@2) | no |
| 1YV3 | control | SUCCESS | 0.492 | 0.492 | -12.709 | -12.709 | 0.492 (@1) | 0.492 (@1) | no |

**No control case moved.** All 8 reproduce the run-4 diagnostic rank-1 RMSD, rank-1 score and
best-in-20 RMSD exactly. 1HVY and 1JLA — which *are* changed by rule 2, but with the new residue 19
and 33 A from the ligand, outside the box — also reproduce run 4 exactly, which is the strongest
form of the control: the rule fires and provably perturbs nothing it should not.

**No case crossed 2.0 A in either direction.** Nothing was gained and, importantly, **nothing was
broken**.

### The three cases that did move

- **1GKC (rule 1).** The correct 22-atom ligand scores -5.290 kcal/mol at its crystal pose against
  -2.548 for the truncated fragment — it was the worst crystal-pose score of all 85 and is no longer
  an outlier. The best pose in the 20 goes from **3.935 A at rank 17 to 1.447 A at rank 3**, and the
  rank-1 score improves from -5.369 to -6.796. Rank 1 is still 6.650 A, so 1GKC remains a failure at
  top-1 — but it changes class: it is no longer a sampling failure (a sub-2 A pose is now generated,
  near the top of the list), it is a ranking failure. This is the clearest single result in the
  document: the preregistered rule was docking the wrong molecule, and the fix makes the native
  basin reachable.
- **1MEH (rule 2). This one got slightly worse.** Rank-1 RMSD 4.177 -> 4.660 A, best-in-20 2.326 ->
  2.455 A, rank-1 score -7.651 -> -7.447. The crystal-pose score improved by only 0.083 kcal/mol and
  the closest ligand-receptor contact did not change at all, because CSO:A319 sits in the second
  shell 4.325 A away. Keeping the residue is chemically correct, but on this case it is worth
  -0.129 A of best-pose quality. Honest reading: **the measurable benefit of rule 2 for 1MEH is not
  there.**
- **1XM6 (rule 2).** Rank-1 RMSD 2.224 -> 2.235 A (still above threshold), best-in-20 0.963 ->
  0.956 A, crystal-pose score improved by 0.073 kcal/mol, rank-1 score improved by 0.054. Within
  noise in every direction.

### What this means for the two headline numbers — MEASURED, then ESTIMATED

The rules change the prepared input for **exactly 5 of 85** cases. For the other 80 the ligand SDF,
the box, the cleaned receptor and the extra rigid PDBQT files are produced by the same functions
from the same inputs, so they are byte-identical to run 4; the run-4 replay check already
established that identical inputs give identical poses. The 8 controls plus 1HVY and 1JLA confirm
this empirically on 10 cases.

**Measured (not estimated):**

- **top-1: 46/85 is unchanged.** None of the 5 changed cases crosses 2.0 A.
- **the 68/85 top-20 sampling ceiling becomes 69/85.** 1GKC's best-in-20 goes from 3.935 A to
  1.447 A, so it enters the set of cases with a sub-2 A pose somewhere in the 20. No other case
  enters or leaves.
- **top-3 coverage 59/85 becomes 60/85**, for the same reason (1GKC at rank 3).

**ESTIMATE, NOT A MEASUREMENT — how many cases preparation fixes alone could plausibly recover:**

- **Measured lower bound and current value: 0.** Zero cases crossed 2.0 A.
- **Upper bound: 1.** Only one case (1GKC) gained a sub-2 A pose, and only one case in the whole 85
  had a ligand definition or a site-lining residue wrong. There is no further preparation defect of
  this class left in the set to find — the 85-case audits above are exhaustive for both rules.
- **The honest statement: 0 recovered now, 0 to 1 recovered in combination with a later ranking or
  scoring change,** that 1 being 1GKC, which now sits at rank 3 with a 1.447 A pose and needs only a
  reranking that prefers it. Whether Vinardo or a multi-seed consensus would pick it was not
  measured for the corrected 1GKC ligand, so it is not claimed.

**Is rule 2 worth having?** On the evidence here: marginally, and not for the reason it was
proposed. It is chemically correct, it is deterministic, it costs nothing on 81 of 85 cases, it
improves the crystal-pose score on both affected sites (by 0.083 and 0.073 kcal/mol) — and it makes
1MEH's best pose 0.129 A worse and recovers nothing. Both effects are within noise. I would keep it
because a modified residue lining the site is a hole in the receptor model that will matter on some
future target, not because it earns anything on the Astex 85. Reported as a near-null result rather
than dressed up.

**Rule 1 is unambiguously worth having.** It fixes a case where the benchmark was docking a
different molecule from the one deposited.

---

## Unit tests

`python3 scripts/test-astex-phase2-preparation.py` — **27 passed, 0 failed, 0 skipped.** Coverage:
the rule-1 distance criterion at 1.35 / 1.80 / 1.90 / 2.40 A; its element dependence (S-S at 2.10 A
is a bond, C-C at 2.10 A is not); **negative cases that must not be absorbed** — a second copy of
the ligand, a glycerol in contact distance, a water, a metal ion, an already-kept cofactor;
transitive absorption of a 3-residue chain; 1GKC 10 -> 22 with the NFH template; the whole-85 check
that rule 1 fires exactly once and that the nearest rejected contact is >= 4.0 A; rule 2's CCD
subset template for CSO and CME including the OXT removal and the error on an unknown atom name; the
polymer-bond requirement separating a chain residue from a free amino acid; the whole-85 check that
rule 2 fires on exactly 1HVY, 1JLA, 1MEH, 1XM6 and types every residue it keeps; the rule-3 audit
helper; and a guard test that fails if a protonation-setting function is ever added without this
document changing.
