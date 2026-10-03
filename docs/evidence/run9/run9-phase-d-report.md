# Run 9 - phase D (development) and seal B

Decision **D-160**. Ordered by the owner on 2026-10-03 02:24Z: development phase only, on the
Run 8 poses, no docking, no access to the 300 fresh cases' results, select the ranker exactly
as seal A says, prove determinism, freeze the configuration, prepare seal B, STOP before Run 9.

**Run 9 has not run.** Nothing in the fresh set has been docked or scored. Run 8 and its
verdict, DOES_NOT_GENERALISE, are untouched. Seal A is untouched
(fingerprint `7f998117...7762`, re-verified by every script below).

## What phase D did

It read the 308 Run 8 case files and their pooled poses (16,013 poses in 290 scored cases),
re-verified every docked-pose and receptor file against the sha256 Run 8 recorded, rebuilt
each pose, and added two features seal A names:

- **plausibility**: PoseBusters 0.6.5, the eight seal A checks; 930 poses in 91 cases fail one;
- **cluster support**: other pooled poses within 2.0 A (symmetry-aware, no superposition).

The 18 cases Run 8 could not score stay failures for every rule, as in Run 8.

**Run 8 reproduced first, or nothing else counts:** the Run 8 rule gives 204/308 and Vina
202/308 here, identical to the published Run 8 numbers. The script stops with FIX REQUIRED
if either differs.

## Result: the selection rule picked C1(0.7)

| Rule | top-1 / 308 |
|---|---|
| C0, Run 8 rule (GNINA) | 204 |
| C1 rank-sum, GNINA weight 0.3 / 0.5 / **0.7** | 216 / 215 / **217** |
| C2 = C1 + plausibility filter, 0.3 / 0.5 / 0.7 | 214 / 213 / 215 |
| C3 = C2 + cluster-support tie-break, 0.3 / 0.5 / 0.7 | 185 / 187 / 191 |
| C4, no GNINA (own verdict, not selectable) | 167 |
| Vina alone | 202 |

Winner **C1(0.7)**, 217/308, **+4.22 pp** over C0, above the +2.0 pp floor, so a ranker
is selected. No human chose it; `run9_rankers.select` applied seal A's rule.

How to read it:

- **This is in-sample.** The nine candidates and the winner were all measured on the same
  set they are chosen on. +4.22 pp is the development number, not a result. Only the fresh
  set can say whether it holds; seal A's prediction (+1.5 to +4.0 pp, most likely PARTIAL)
  is unchanged.
- **The tie-break hurts.** C3 loses 35-40 cases to C2 and gains 10-11. Wrong poses form big
  clusters too. This was checked as a possible bug, not tuned: correct poses do have more
  support on average (3.9 vs 2.0 neighbours), so the feature is computed the right way
  round; the rule simply does not help. It stays as sealed.
- **C4, the only arm that could enter the product**, is worse than Vina alone (167 vs 202)
  for the same reason. It still gets its own verdict in Run 9, as seal A requires.
- **C1(0.7) uses GNINA**, so it does not enter the product whatever Run 9 shows, until
  GNINA's licensing is resolved.

## Determinism

- Two full phase D runs on the same inputs with different worker counts (4 and 3) gave
  byte-identical output; both sha256 are in seal B.
- 32 unit tests (`scripts/test-run9-rankers.py`): orders, exact integer ties, filter
  fallback, tie-break, C4 needs no GNINA field, independence from input order, no mutation,
  the selection floor at +1.95 pp (fails) and +2.27 pp (passes), the similarity thirds and
  the exact McNemar test and three-way verdict.
- Every rule is a total order (ties end on seed index and rank), PoseBusters' energy
  check uses a fixed ETKDG seed (42) inside the library, and no output field holds a time or a path.

## Two allowed changes, checked without Run 9 data

- **GNINA receptor fix** (`run9_gnina_receptor.py`): Meeko's macrocycle glue types CG0-CG9
  become C and dummy atoms G0-G9 are dropped, only in the copy handed to GNINA. Of 1,915
  Run 8 receptor files only 7SUC, 7UMW and 7XRL change, and GNINA now reads all three.
  The receptor Vina docks against is never touched.
- **Fresh-set input adapter** (`run9_fresh_inputs.py`): the PLINDER system file goes through
  Run 8's own receptor builder. Checked on the dataset's public example system, which is not
  in the draw: same ligand (InChIKey), RMSD 0.0000 to the distributed ground truth.

## One gap closed before sealing

Seal A asks for the result split into thirds of the authors' `sucos_shape_pocket_qcov`
similarity but does not say how to cut them. Fixed now, from the annotations alone, before
any Run 9 docking (`run9_similarity_bins.py`): 285 cases with a value split 95 / 95 / 95 by
value; the 15 with no value are reported on their own as NO_SIMILARITY_VALUE and never
imputed. It is descriptive and decides nothing.

## Seal B

`run9-seal-b.json`, built by `scripts/run9-seal-b.py`, which refuses unless seal A
recomputes and the two phase D runs are identical. It pins: the selected ranker, the phase D
result and its sha256, the 300-case list and draw manifest, the Zenodo record 18366081 with
the annotations and ground-truth archive hashes, the similarity bins, every Run 9 script,
the Run 8 runner and the five Run 8 pinned files, the GNINA binary, and the library versions.
`scripts/run9-final.py` refuses to start if any of them differs.

**Next step, only on the owner's explicit GO:** the one final Run 9.
