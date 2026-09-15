# GLP-1R structure dictionary — set A2, received by text transcription

**STATUS: all 8 chunks delivered. 2 of 8 verify byte-exactly. 6 of 8 FAIL custody
and are excluded in full. 87 of A1's 300 molecules end up with a custody-verified
structure.**

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

| chunk | declared rows | received | keys | sorted | sha256 | custody |
|---|---|---|---|---|---|---|
| 1 | 18 | **17** | ok | yes | `0ee287d3…` ≠ `b5285da5…` | **FAILED** |
| 2 | 17 | 17 | ok | yes | `73d267bd…` ≠ `cd258eeb…` | **FAILED** |
| 3 | 12 | 12 | ok | yes | `ab509947…` ≠ `089b7332…` | **FAILED** |
| 4 | 11 | 11 | ok | yes | `58fea53f…` ≠ `22b341d7…` | **FAILED** |
| 5 | 15 | 15 | ok | yes | `32c6d9e6…` | **VERIFIED** |
| 6 | 68 | 68 | ok | yes | `d27693d5…` | **VERIFIED** |
| 7 | 106 | 106 | ok | yes | `11fb6869…` ≠ `c4204d65…` | **FAILED** |
| 8 | 53 | 53 | ok | yes | `37946708…` ≠ `a499ee9b…` | **FAILED** |

299 rows received against a declared 300. Every delivered id belongs to A1; none
is foreign; every chunk is correctly sorted and carries its declared first and
last key. So the damage is inside rows, not in their arrangement.

### Chunk 1: one row lost in transit, identified from A1

The declared row count is **correct**. A1 (byte-verified) holds 300 distinct
`molecule_chembl_id`; exactly 18 sort into `[CHEMBL2108724, CHEMBL4098061]`, and
exactly one — **`CHEMBL4088708`** — is absent, sorting between the delivered
`CHEMBL4087789` and `CHEMBL4091638`. Decided from frozen data, with no hypothesis
tested against the declared hash.

Its SMILES is **not** reconstructed: not in the D-076/077 pin, not fetchable
(every chemistry host is egress-blocked — D-092b), and inventing one is the
fabrication the standing rules forbid.

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

## What survives

- **82** structures from the byte-verified chunks 5 and 6 (of 83 rows; one,
  `CHEMBL5314341`, is a declared `notRetrieved` with an empty field).
- **7** from the frozen D-076/077 pin, of which 2 also appear in the verified
  chunks.
- **87 distinct A1 molecules** with a custody-verified structure. **213 without.**

Declared `notRetrieved`: `CHEMBL2108724`, `CHEMBL5314341`. Both were delivered
with an empty SMILES field rather than the specified `||notRetrieved` marker —
recorded, not rewritten, because silently editing delivered bytes is how a
custody record stops being one.

## Consequence for C1

Measured in D-105 on those 87 structures: CAMP reaches **16** replicate groups,
up from 5 in D-103. The sealed D-102 prereg requires **20** per readout family.
16 < 20, so **C1 remains NOT_CLOSED**, and the threshold is not moved to meet the
result. The blocker is still data volume, not methodology — and it is now close
enough that a clean re-transmission of the six failed chunks would plausibly
settle it.

Provenance class: `user-supplied-reference`. See D-092a, D-104, D-105.
