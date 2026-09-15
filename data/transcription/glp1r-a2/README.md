# GLP-1R structure dictionary — set A2, received by text transcription

**STATUS: all 8 chunks delivered; chunks 1, 2, 3, 4, 7, 8 re-transmitted once.
3 of 8 verify byte-exactly (3, 5, 6). 5 of 8 FAIL custody and are excluded in
full. 99 of A1's 300 molecules carry a custody-verified structure — enough to
CLOSE C1 on CAMP.**

The re-transmission was accompanied by the claim that all six re-sent chunks
carried hashes "zgodne z deklarowanymi". Recomputed from the received bytes,
that holds for chunk 3 only. Chunks 1, 2, 4, 7 and 8 do not match. The claim is
recorded here as made and as measured, without adjusting either.

Requested because C1 (the endpoint noise floor) cannot be measured without real
`canonicalSmiles`: `replicateGroups()` keys its Map on `r.canonicalSmiles`, and
using `molecule_chembl_id` as a stand-in splits groups that structure would
merge, biasing the floor DOWNWARD — the direction that falsely excuses a model's
MAE. That substitution was used once, loudly labelled PROVISIONAL (D-102), and
withdrawn from the final measurement (D-103).

Delivery spec: `molecule_chembl_id|canonical_smiles`, `||notRetrieved` where no
structure can be obtained, sorted by `molecule_chembl_id`, 8 chunks, each with
`ROWS=`, `FIRST_KEY=`, `LAST_KEY=` and a `SHA256=` over the exact delivered bytes.

## Per-chunk custody

Hashes recomputed under the convention that verified all seven A1 chunks
byte-exactly: data rows only, no header lines, LF separators, one trailing LF.
Chunks 5 and 6 matching under exactly that convention is what proves the
convention is right — the other six mismatches are the delivery's, not the
reader's.

Every attempt is pinned under its own name (`A2-chunk-0N.attemptM.psv`) and none
is ever edited. A chunk is adopted **iff its bytes hash to the declared value** —
never because one attempt looks better than another.

| chunk | rows | attempts | sha256 | custody |
|---|---|---|---|---|
| 1 | 18/18 | 2, differing | `0ee287d3…` ≠ `839a82ed…` | **FAILED** |
| 2 | 17/17 | 2, **identical** | `73d267bd…` ≠ `cd258eeb…` | **FAILED** |
| 3 | 12/12 | 2, differing | `ab509947…` (attempt 2) | **VERIFIED** |
| 4 | 11/11 | 2, differing | `58fea53f…` ≠ `91d98f0b…` | **FAILED** |
| 5 | 15/15 | 1 | `32c6d9e6…` | **VERIFIED** |
| 6 | 68/68 | 1 | `d27693d5…` | **VERIFIED** |
| 7 | 106/106 | 2, differing | `11fb6869…` ≠ `709acca9…` | **FAILED** |
| 8 | 53/53 | 2, differing | `37946708…` ≠ `f6efaa6c…` | **FAILED** |

All 300 declared rows have now arrived. `CHEMBL4088708`, missing from chunk 1's
first attempt, was supplied in the second — but chunk 1 still fails custody, so
that row is delivered, not verified, and is not used. It was never reconstructed
by this repository.

### What re-transmission proved about the channel

Comparing two transmissions of the same chunk needs no external ground truth,
and it is the sharpest evidence here:

- **Chunk 2 came back byte-identical** and still misses its declared hash. The
  corruption is **reproducible, not random noise** — the same signature as A3
  chunk 3 (D-101). Re-sending will not fix it.
- **Chunk 4 disagrees with itself in BOTH directions**: two rows shorter in
  attempt 2, two rows longer. Neither transmission can be the source, so for
  those rows the true value is simply unknown.
- **Chunk 3's verified attempt is the SHORTER one.** `CHEMBL4753375` came back
  938 characters against attempt 1's 951, and it is attempt 2 whose bytes hash
  to the declared value. So "longer is truer" is not merely unprincipled as a
  repair heuristic — on this data it is **wrong**. Adoption by hash is the only
  rule that survives contact with the evidence.
- **Chunk 1 carries an equal-length divergence.** `CHEMBL3616718` is 572
  characters in both attempts, differing in a 6-character window:
  `Cc1c[nH]cn1` against `Cc1cnc[nH]1` — the histidine imidazole, written with
  the N-H on the other ring nitrogen. Both parse. Both give formula
  C152H230N42O47. Both give the **same InChIKey**
  (`LQBSSRMCYDZQLJ-WDOXRSBNSA-N`). But RDKit's canonical SMILES differ, so the
  two strings are different keys.

  That last point deserves care, because `replicateGroups()` keys on the
  canonical SMILES **string**: two rows for one compound written with different
  histidine tautomers would land in different groups. Measured across the 306
  usable structures: 306 distinct canonical SMILES, 306 distinct InChIKeys, and
  **zero** cases where one InChIKey spans two canonical SMILES. So the current
  measurement is unaffected. The identity key was **not** changed — swapping
  canonical SMILES for InChIKey would alter the sealed methodology in the
  direction of more groups, which is exactly the change that must not be made to
  reach a threshold. It is recorded here as an open question for a human seal.

## What the failed chunks actually contain — and why none of them can be used

Three independent checks were run over all 299 delivered rows.

**1. RDKit rejects four structures outright.** `CHEMBL4079909` (chunk 1),
`CHEMBL4753375` (chunk 3), `CHEMBL6162510` and `CHEMBL6174707` (chunk 8) do not
parse. The last two contain `Cb3cccc` — a boron atom where the molecule needs a
carbon. Every rejection falls in a chunk that already failed on its hash.

**2. Six of seven structures cross-checked against the frozen D-076/077 pin are
byte-identical.** That is strong evidence the delivery is genuine ChEMBL data
rather than invention, and it is worth stating plainly.

**3. The seventh is corrupted silently, and this is the decisive finding.**
`CHEMBL414357` (chunk 2) is 672 characters against the pin's 700. The two agree
on a 359-character prefix and a 313-character suffix; between them a single
contiguous run — `H](CCC(=O)O)NC(=O)CNC(=O)[C@` — is simply **absent**, with
nothing substituted in its place. **And the shortened string still parses as a
valid molecule.**

That last fact is why no failed chunk can be partially rescued. This channel can
delete a run of characters from a SMILES and leave behind something chemically
valid but structurally wrong — a different molecule, entering a replicate group
it does not belong to, with no error anywhere to notice. "It parses" is therefore
not a weaker form of custody; it is no custody at all. A chunk whose hash does
not match is unknown **in full**, and only the byte-verified chunks are used.

The corruption was caught here only because the pin happened to contain that one
molecule. How many silent corruptions sit in the 283 rows of the six failed
chunks is **unknown**, and unknowable from inside this container.

### The channel's actual signature: `c` → `b`

Lowercase `b` is **aromatic boron** in SMILES, and it is vanishingly rare in
drug-like ChEMBL space. Every occurrence in this delivery sits in the identical
local context **`Cb3cccc(`**, where the source plainly reads `Cc3cccc(` — a
one-character substitution turning an aromatic carbon into boron. Chunk 8's first
attempt carried two such rows (`CHEMBL6162510`, `CHEMBL6174707`); its second
attempt carries **four** — the same two plus `CHEMBL6150767` and `CHEMBL6167903`.
Re-sending made that chunk worse.

The substitution is **reported, never repaired**, and the second reason matters
more than the first:

1. Editing delivered bytes ends custody, whatever the edit's merit.
2. **It would not be enough anyway.** Chunk 7 contains zero boron artifacts and
   still misses its declared hash — so `c`→`b` is demonstrably not the only thing
   this channel does. Patching the visible damage would leave the invisible
   damage in place while making the data *look* repaired. That is strictly worse
   than leaving it plainly broken.

For whoever re-sends: grep the source for `Cb3cccc(`. It should read `Cc3cccc(`.
That will fix chunk 8's visible damage and nothing else.

## What survives

- **94** structures from the byte-verified chunks 3, 5 and 6.
- **7** from the frozen D-076/077 pin, of which 2 also appear in those chunks.
- **99 distinct A1 molecules** with a custody-verified structure. **201 without.**

Declared `notRetrieved`: `CHEMBL2108724`, `CHEMBL5314341`. Both were delivered
with an empty SMILES field rather than the specified `||notRetrieved` marker —
recorded, not rewritten, because silently editing delivered bytes is how a
custody record stops being one.

## Consequence for C1 — CLOSED

Measured in D-105 on those 99 structures, with the sealed prereg, replicate rule,
classifier and exclusions all unchanged:

| family | rows | molecules | groups | status |
|---|---|---|---|---|
| **CAMP** | 82 | 41 | **28** | **MEASURED** — medianSpread 1.4949, medianSd 1.0005 |
| ARRESTIN | 35 | 24 | 7 | NOT_MEASURED |
| OTHER | 19 | 16 | 2 | NOT_MEASURED |
| CALCIUM | 67 | 65 | 1 | NOT_MEASURED |
| INTERNALIZATION | 1 | 1 | 0 | NOT_MEASURED |
| BINDING | 1 | 1 | 0 | NOT_MEASURED |

CAMP went 5 groups (D-103) → 16 (first A2 delivery) → **28**, against a sealed
minimum of 20. **C1 is CLOSED**, on CAMP alone, reached by adding data and
without moving a single threshold. Three further re-transmissions (chunks 1, 2,
4, 7, 8) did not change this number, because none of them verified.

### The number the noise floor actually produced

**medianSd = 1.0005 pActivity units. The frozen gate's MAX_MAE = 1.0.**

The gate's own rationale calls 1.0 "the outer bound of a QSAR estimate this
project will call 'validated' rather than 'noise'". Measured against real
replicates, the endpoint's own noise is 1.0005 — the a-priori boundary and the
empirical floor coincide to within 0.0005. A model that just clears MAX_MAE is
therefore predicting CAMP EC50 about as precisely as two independent assays
measure it. That is a finding about the data, recorded here unchanged; it makes
a passing result harder to interpret, not easier, and neither number was moved.

Provenance class: `user-supplied-reference`. See D-092a, D-104, D-105, D-106.
