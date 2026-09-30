# Run 9 plan - better pose ranking. Not started, awaiting a decision.

Run 8 stands closed and unamended: GNINA cnnScore top-1 204/308, verdict
DOES_NOT_GENERALISE, published at `docs/evidence/posebusters-run8-unseen-benchmark.md`.
Nothing here reinterprets it.

From this point **PoseBusters is a DEVELOPMENT / DIAGNOSTIC set.** We have seen its
results, so every number in this directory is a development observation, never a
benchmark result, and any ranker chosen with its help has to be preregistered and
measured once on a fresh, unseen set before it means anything. No new ranker goes
near the product before that.

## Where the 104 misses of Run 8 come from

| cause | count | can a better ranker fix it? |
|---|---|---|
| ranking | 71 | yes, this is the whole target |
| sampling | 17 | no - no sub-2.0 A pose exists in the pool |
| preparation | 8 | no - the complex never reached docking |
| docking | 7 | no - no pose was produced |
| unavailable | 3 | no - gnina could not read the receptor |

Of the 71 ranking failures, 69 have a GNINA ordering to examine; 7SUC and 7UMW are
UNAVAILABLE cases that hold a good pose in the pool but were never scored, so they
are listed under both causes and are excluded from the diagnostic below.

The sampling ceiling is 275/308. A perfect ranker could reach it and no more.
Everything in this plan competes for the 71 - 204 = the gap between 204 and 275.

## The diagnostic, reproducible

`scripts/run8-ranking-diagnostic.py <per-case dir>` reads the Run 8 pools and docks
nothing. Its output is kept verbatim in `ranking-diagnostic-output.txt`. What it found:

- **In 36 of the 69 ranking failures the correct pose is GNINA's number two, and in
  47 of 69 it is inside its top three.** Median position: 2. The search and the
  scorer both nearly worked; the selection step lost it.
- **When Vina's best-affinity pose and GNINA's best-cnnScore pose are the same pose,
  that pose is correct in 128 of 138 cases (93%).** When they disagree - 152 cases -
  GNINA is right 76 times, Vina 74 times, and one of the two is right 108 times.
- Single-score swaps buy nearly nothing: cnnAffinity 200, Vina affinity 202,
  cnnScore x cnnAffinity 207, variance-penalised cnnScore 199, against 204.
- A plain rank-sum consensus of the two scores gives 215 to 217 depending on the
  weight, i.e. about +11 to +13 over 204, with no new model and no training.

## The single biggest improvement point

**The disagreement set.** Agreement is already a 93% decision and needs nothing.
The 152 cases where the two scorers disagree carry 108 recoverable cases, of which
we currently take 76. A tie-breaker that decided those correctly would put the
pipeline at 128 + 108 = 236/308 (76.6%) - and that ceiling, not a new scoring
function, is what a Run 9 should be aimed at. A rank-sum consensus is the cheap
first step toward it and it is not the interesting part: what the cases need is a
reason to prefer one of the two poses, which is what pose-quality and interaction
features are for.

## What a Run 9 would be, in order

1. Split PoseBusters into a development half and a held-back half, by release date,
   before looking at anything further. Fit and compare on the development half only.
2. Rank-sum consensus as the baseline to beat, since it needs no training.
3. Physical-plausibility filters before scoring: internal clash, bond geometry,
   protein-ligand steric overlap, ligand strain. A pose that cannot exist should
   never be rankable, and this is also the honest thing to have in the product.
4. Interaction features for the tie-break: buried fraction, hydrogen bonds to the
   pocket, hydrophobic contact count, how many seeds landed in the same cluster.
5. Only if 2-4 fall short: a second rescoring stage over the top-N, which costs
   compute and buys a model we would then have to validate separately.
6. Nothing is tuned toward whatever benchmark will judge it. The final set is chosen
   and frozen before the final run, and its results are seen once.

## The confidence label, which is worth shipping either way

"Both scorers agree" is a measurable confidence signal: 93% correct on agreement,
about 50% on disagreement, measured here on a development set and to be re-measured
on the fresh set. That belongs in the product as an honest label on a result, and it
needs no new ranker at all.

## Known blocker before the final run

A fresh unseen set has to be built from structures we have not touched, and the
obvious clean choice is a time split of recent PDB releases. Downloading them needs
RCSB access, which this sandbox's network policy currently denies - the same click
that the GLP-1R ingest is waiting on.
