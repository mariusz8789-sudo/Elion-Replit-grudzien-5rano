# Run 9 seal B draft - the Run 9 owner's decisions on the three open points

Decided 2026-10-03 by the Run 9 thread, which owns Run 8 and Run 9. No rule in seal A
changes. Seal B itself is not frozen yet. It also needs the final code hashes and the
ranker selected in phase D, and phase D waits for the owner's word.

## Independent reproduction of the draw

I re-implemented `protocol.freshSet` from the text of seal A, without using
`scripts/run9-seal-b-draft.py`, and ran it on `annotations.csv` (v18366081).
- It found 2098 eligible systems.
- The 300 drawn cases are identical to `fresh-set-cases.json`, in the same order. The
  file's sha256 is `92bf6db7…ad89`.
- The earliest release date in the drawn set is 2021-10-06.

## 1. Zenodo version: v18366081, as downloaded

Seal A names the concept DOI and no version. On 2026-10-03 the concept record redirected
to v18366081, and that is the only version downloaded. Taking it is the mechanical
reading of seal A. Choosing an older variant now, after its list has been compared, would
itself be a choice made with knowledge of the outcome. The older annotations variant would
give 299 of the same 300 cases; this is recorded and not used. `ground_truth.tar.gz` is
byte-identical in all six versions.

## 2. PDBbind2016 id count: recorded, no effect on Run 9 or Run 8

The draft counts 11577 ids where the Run 8 preregistration states 12670. CrossDocked2020
(25752) and the Astex intersections (63 / 47 / 76) reproduce exactly. The discrepancy
cannot affect this draw: every drawn entry was released on or after 2021-10-06, years
after PDBbind2016 and CrossDocked2020 were published. It also cannot affect Run 8's
contamination result, which was 0 against the larger number and stays 0 against a
subset of it. Run 8 is closed and is not amended. The cause of the difference stays an
open item for whoever next reuses the list.

## 3. AlphaFold 3 Output Terms: they do not apply to what Run 9 uses

The record points to the AlphaFold 3 Output Terms of Use. Those terms cover AlphaFold 3
predictions, which ship in the record's `predictions.tar.gz`. That file was not
downloaded and Run 9 does not use it. Run 9 uses `annotations.csv` and
`ground_truth.tar.gz`: annotations and the experimental PDB structures, under the
record's CC-BY-4.0 licence. Attribution in the Run 9 report: Skrinjar et al., Runs N'
Poses, doi 10.5281/zenodo.18366081.
