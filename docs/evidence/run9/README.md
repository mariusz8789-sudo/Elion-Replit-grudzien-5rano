# Run 9 - preregistration, seal A

`run9-ranking-prereg.json`, fingerprint `7f9981173699aa917fa3299c904c23a8749a656b0720200a48caee0d2c017762`
(recipe `sha256(json.dumps(protocol, sort_keys=True))`). Frozen on the owner's word of
2026-10-03 00:14Z.

**Status 2026-10-03:** the fresh set is downloaded and verified, phase D is done (C1(0.7) selected,
217/308, +4.22 pp in-sample) and seal B is frozen; see `run9-phase-d-report.md` (D-160).
**Status 2026-10-04:** the final Run 9 **started** on the owner's explicit GO of 2026-10-03 18:30Z
and is **IN_PROGRESS / FROZEN / PRE-REGISTERED**: 300 cases under seal B, ranker C1(0.7), the same
GNINA binary, state written as it goes, around two days of compute. Nothing about it may be changed
while it runs, and no post-hoc tuning or reinterpretation is permitted. The verdict is whatever the
preregistration returns.

**Run 8 is untouched.** Its verdict, DOES_NOT_GENERALISE, stands. PoseBusters is now a
development set, so nothing measured on it can validate anything.

## What is frozen now

- **Only the ranking changes.** The search is Run 8's, unchanged. Three other changes are
  allowed in development and are listed exhaustively: an input adapter for the fresh set's
  file format, a fix for the receptor atom types GNINA could not read in Run 8, and the
  partial-seed glue fix that is already in place.
- **Nine candidate rankers and a mechanical rule that picks one** on PoseBusters: rank-sum
  consensus of GNINA and Vina at three weights, the same after a physical-plausibility
  filter, and the same again with a cluster-support tie-break. The candidate with the
  highest top-1 wins. If it does not beat the Run 8 rule by at least 2 points, the result
  is NO_RANKER_SELECTED and the final run does not happen. No human picks the ranker.
- **A fresh set Genesis has never opened:** Runs N' Poses (Skrinjar et al. 2025). The
  eligibility filters and a hash-ordered draw of 300 cases are fixed. Every PDB id in the
  PoseBusters set, the Astex set or GNINA's published training lists is excluded.
- **Metric and verdict:** top-1 under 2.0 A, with every failure kept in the denominator.
  GENERALISES needs at least +3.0 points over the Run 8 rule, p < 0.05 on a paired
  McNemar test, and no loss on at least 4 of 5 seeds. DOES_NOT_GENERALISE is +1.0 point
  or less, or a loss on 2 or more seeds. Anything else is PARTIAL.
- **A product-eligible arm without GNINA** gets its own verdict. Any ranker that uses GNINA
  stays out of the product even if it wins, until GNINA's licensing is resolved.
- **Prediction:** +1.5 to +4.0 points, most likely PARTIAL.

## What is not frozen yet, and why

The case list and the file hashes. The fresh set lives on zenodo.org, and this
environment's network policy denies that host. It also denies files.rcsb.org,
files.wwpdb.org, www.ebi.ac.uk and pdbj.org. Seal B will append the case list, the file
hashes, the final code hashes and the selected ranker before anything is docked. If
zenodo.org stays blocked, Run 9 does not run, and no substitute source is used.

## Order from here, each step on the owner's word

1. Unblock zenodo.org.
2. Phase D: development on the PoseBusters pools. This needs no docking.
3. Seal B.
4. Phase F: one run on the fresh set.
