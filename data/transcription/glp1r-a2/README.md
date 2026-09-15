# GLP-1R structure dictionary — set A2, received by text transcription

**STATUS: 1 of 8 chunks delivered as data; 7 of 8 delivered as inventory lines only.
The one delivered chunk FAILS custody. A2 is NOT complete and no chunk of it is
custody-verified.**

Requested in D-103 because C1 (the endpoint noise floor) cannot be measured
without real `canonicalSmiles`: `replicateGroups()` keys its Map on
`r.canonicalSmiles`, and using `molecule_chembl_id` as a stand-in splits groups
that structure would merge, which biases the floor DOWNWARD — i.e. toward
falsely excusing a model's MAE. That substitution was used once, loudly labelled
PROVISIONAL (D-102), and withdrawn from the final measurement (D-103).

Requested format (D-103 delivery spec, verbatim): `molecule_chembl_id|canonical_smiles`,
with `molecule_chembl_id||notRetrieved` for structures that cannot be obtained,
sorted by `molecule_chembl_id`, split into 8 chunks, each carrying
`ROWS=`, `FIRST_KEY=`, `LAST_KEY=` and a `SHA256=` computed over the exact
delivered bytes.

## Chunk 1/8 — custody FAILED on two independent grounds

| field | declared | received |
|---|---|---|
| rows | 18 | **17** |
| FIRST_KEY | `CHEMBL2108724` | `CHEMBL2108724` (match) |
| LAST_KEY | `CHEMBL4098061` | `CHEMBL4098061` (match) |
| sha256 | `0ee287d34316b4e222982e1daa3c7be0e4aab897a09be1e763e3dee9d6b36340` | `b5285da5605caf709612d81f737fc4a274f4ad6c94e36da40bb71f3d0d8009a6` | 

The hash was recomputed under the same convention that verified all seven A1
chunks byte-exactly: data rows only, no header lines, LF separators, one
trailing LF. It does not match. (Recomputed without the trailing LF it is
`c596566cc45bdbb959aca216074b05ae5a94a154bdc728da9e775d910960e171` — also not
the declared value. No further encodings were tried: enumerating conventions
until one matches a known target hash is guess-and-check, the search pattern
already named and refused in D-099 and D-101.)

### The missing row is identified — from A1, not by fitting to the hash

The declared row count is **correct** and the transmission is what lost a row.
This is decidable from data already frozen in this repo, with no hypothesis
testing at all:

- A1 (seven chunks, all byte-verified) contains exactly 300 distinct
  `molecule_chembl_id`.
- Sorted lexicographically, exactly **18** of those 300 ids fall in the closed
  range `[CHEMBL2108724, CHEMBL4098061]` declared by this chunk's FIRST_KEY and
  LAST_KEY.
- Exactly **17** of those 18 appear in the delivered rows. The one absent is
  **`CHEMBL4088708`**, which sorts between the delivered `CHEMBL4087789` and
  `CHEMBL4091638` — i.e. a single interior row was dropped in transit.

All 17 delivered ids are present in A1; none is foreign to the set. So the
defect is a clean single-row loss, not a scrambled or mismatched chunk.

**`CHEMBL4088708`'s SMILES is NOT reconstructed here.** It is not in the frozen
D-076/077 pin, it cannot be fetched (every chemistry host is egress-blocked in
this container — D-092b), and inventing a structure for it would be the exact
fabrication the standing rules forbid. It stays absent.

### One further deviation from the delivery spec

The single structure-less row was delivered as `CHEMBL2108724|` (empty second
field) rather than the specified `CHEMBL2108724||notRetrieved`. Recorded, not
corrected: silently rewriting delivered bytes is how a custody record stops
being a custody record.

## Chunks 2-8 — inventory only, no data

Chunks 2-8 arrived as a single summary line (`2/8 73d267bd… (17, CHEMBL4098545→CHEMBL4533613) · …`),
declaring 283 further rows and a total of 300. A declared hash over bytes that
were never sent is not a delivery and cannot be verified. Per D-095, a
declaration is never promoted to a measurement.

Declared totals, recorded as claims awaiting delivery: 300 rows across 8 chunks
(18+17+12+11+15+68+106+53 = 300, arithmetic checked), with two structures
declared `notRetrieved` (`CHEMBL2108724`, `CHEMBL5314341`).

## Consequence for C1

Unchanged from D-103: **C1 is NOT_CLOSED.** Even taking the 16 non-empty
delivered SMILES at face value — which custody does not permit — coverage would
reach at most 23 of 300 A1 molecules (16 delivered + the 7 already frozen in the
D-076/077 pin), far short of what the D-102 prereg requires
(`minGroupsForNoiseFloor: 20` per readout family, against the 5 CAMP groups
measured in D-103). The blocker remains data volume, not methodology.

Provenance class: `user-supplied-reference`, custody `FAILED`. See D-092a, D-104.
