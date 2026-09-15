# GLP-1R assay dictionary — set A3, received by text transcription

**STATUS: 90/90 assays received. Custody VERIFIED for 3 of 4 chunks. Chunk 3 has a HASH MISMATCH — recorded as drift, not silently accepted.**

One row per distinct assay, not per activity. Requested in D-094 after the A1
format was found to make two things impossible: verifying target identity per
row, and grouping by readout.

| chunk | rows | declared sha256 | recomputed sha256 | verified |
|---|---|---|---|---|
| 01 | 45 | `a78c96be1b6c273837ce23989faded32c73c044ec762a326268507d9025cccad` | (same) | MATCH |
| 02 | 19 | `75b0758720b00c40884eda384d14cad365de7e4754d7edd2ba6971b965db74fd` | (same) | MATCH |
| 03 | 3 | `e5bb6931568d9694a3a58eebb9aa6f6f2d904ce1166cf5688ddabc044f471e38` | `dd8bf5c58959f432bccc0d50116e7d4a8fe78284d289840121511af356fb6f6f` | **MISMATCH — DRIFT** |
| 04 | 23 | `973f6331ca81a6755dcd8432f18f9955d5af2fc103fb1a5d099ff8408e019614` | (same) | MATCH |

## Chunk 3 drift — investigated, not resolved, not silently accepted

Row count matches (3), `CHEMBL5732843`/`CHEMBL5734588`/`CHEMBL5734589`
transcribed as received, but the sha256 of the saved bytes does not match the
declared value. Diagnosed rather than shrugged off:

- scanned every non-ASCII character in the file (24 found: `×` U+00D7, `°`
  U+00B0, `μ` U+03BC, `é` U+00E9 — all in plausible, expected positions for
  lab-protocol text: temperatures, volumes, centrifuge speeds, an author name)
- tested three concrete hypotheses against the declared hash: Greek mu
  (U+03BC) vs micro sign (U+00B5), a missing/extra trailing newline, CRLF line
  endings. **None reproduced the declared hash.**

Stopped the search there rather than continuing to guess-and-check — that
search pattern (try a variant, see if the hash matches, try another) is the
same shape as tuning an analysis toward a result, and it does not become
acceptable just because the target here is a hash instead of a scientific
conclusion. The bytes actually saved are pinned below with BOTH hashes, per
the accepted transfer rule: on a mismatch, record drift and pin your own
bytes rather than claim verification that didn't happen.

**Consequence: chunk 3's three assay descriptions (`CHEMBL5732843`,
`CHEMBL5734588`, `CHEMBL5734589`) are NOT custody-verified.** They are
retained as received-but-unverified text, usable as a lead for a human reading
the description, not as a verified provenance record. A clean re-transmission
of chunk 3 alone, with its own sha256, would resolve this without redoing
chunks 1/2/4.

**Update: a full resend of chunks 2-4 was received and checked.** Chunks 2 and
4 are byte-identical to the already-verified copies (no new information).
Chunk 3 is **byte-identical to the FIRST mismatched attempt** — same
`dd8bf5c5…`, still not `e5bb6931…`. Two independently-typed transmissions of
the same source text converging on identical bytes rules out a one-off
transcription slip on either end.

**A specific, testable hypothesis was proposed and falsified.** The claim: the
source contains `Flp-In™ T-Rex™ System` (U+2122 TRADEMARK SIGN, twice), and
this text channel silently strips it to `Flp-In T-Rex System`, which would
explain why chunks 2/4 (no trademark symbols) matched and chunk 3 (one
trademark symbol pair) did not. Tested directly: inserted U+2122 at both
specified positions and recomputed the sha256 — **no match**
(`46876689a2ae91c4818a9107d65209d9594618dab25691c765231ddf77689738`). Tested
nine further variants (ThermoFisher's actual product capitalisation
`T-REx` vs `T-Rex`, `®` instead of `™`, the symbol on only one of the two
words, a third symbol after `System`) — **none matched the declared hash**.
The U+2122 hypothesis is therefore falsified, not confirmed, and no further
guess-and-check against the target hash was attempted: that search pattern
(propose a variant, test it, propose another) is the same shape of tuning
toward a result already named and refused in D-096/D-099/D-100, and refusing
it does not depend on whose hypothesis is being tested.

**Cause remains unidentified.** Not diagnosable further from inside this
container. Left as unresolved drift; the pinned bytes (`dd8bf5c5…`) are the
best available record of the three assay descriptions, used as a reading aid,
not as verified provenance. No provenance label asserting a specific cause
(e.g. `CHANNEL_NORMALIZED_U2122`) is applied, because the one specific cause
proposed did not hold up when tested — labelling a cause that was falsified
would misstate what is known.

```
assay_chembl_id|target_chembl_id|assay_type|bao_format|bao_label|assay_description
```

**The target filter is recovered by join, not by re-sending A1.** All 45
received assays carry `target_chembl_id = CHEMBL1784`, so every A1 row that
joins is confirmed on-target. The D-094 format defect is repaired without
invalidating the byte-verified A1 chunks.

Provenance class: `user-supplied-reference`. See D-092a.

---

## Chunk 3, third attempt: byte export as 7 base64 pieces (D-104)

A third delivery of chunk 3 arrived, this time as the chunk's **base64** split
into 7 pieces, each with its own declared `LEN` and `SHA256`, plus a declared
sha256 over the concatenation
(`b1c7b2351518ee5d513d40d6bc6e166255c20688bb32dbe1d8008f2a5306a0e2`, LEN 12448).
The protocol agreed in advance was: verify the pieces, concatenate, then run
TEST 1 (decode → sha256 must equal the declared `e5bb6931…` → custody ORIGINAL)
and TEST 2 (strip U+0080–U+009F → must equal the pinned `dd8bf5c5…` →
`CHANNEL_STRIPPED_C1`); if neither matches, the cause stays UNKNOWN and no
further variants are tried.

**Five of seven pieces verify byte-exactly. Two do not.**

| piece | declared LEN | received LEN | declared sha256 | result |
|---|---|---|---|---|
| 1/7 | 1779 | 1779 | `726c5764…` | **MATCH** |
| 2/7 | 1779 | **1781** | `bd63dcc7…` | **MISMATCH** (`f89b3297…`) |
| 3/7 | 1779 | **1782** | `34f1c9f3…` | **MISMATCH** (`51767107…`) |
| 4/7 | 1779 | 1779 | `7630dba1…` | **MATCH** |
| 5/7 | 1779 | 1779 | `7d81c5e8…` | **MATCH** |
| 6/7 | 1779 | 1779 | `335cbca9…` | **MATCH** |
| 7/7 | 1774 | 1774 | `5147564c…` | **MATCH** |

Concatenation: 12453 bytes, sha256
`9cb972c79628ea99d550c61bfd47f7727b2b3b95c16645c3aade8a1b06d3ce32` — not the
declared `b1c7b235…`. The excess is exactly 5 bytes (2 in piece 2, 3 in piece 3),
matching 12453 − 12448.

### TEST 1 and TEST 2 were not run, because the input is not decodable base64

Not a judgement call — two structural facts decide it, and neither involves
testing a hypothesis against a target hash:

1. **12453 is not a multiple of 4.** A base64 stream's length always is. The
   declared 12448 is (12448 = 4 × 3112). So the received stream cannot be a
   complete base64 encoding of anything.
2. **There is base64 terminal padding in the middle of the stream.** `=` occurs
   at offsets 3558, 3559, 5340, 5341 and 12452 — i.e. pieces 2 and 3 each end in
   `==`, exactly as a *self-contained* base64 string would, while pieces 1 and
   4-7 end mid-alphabet as slices of one stream do. A strict decoder rejects
   padding anywhere but the end.

So the seven pieces are not seven slices of one encoding; pieces 2 and 3 are
separately terminated. Decoding the concatenation would silently produce bytes
that are not the sender's bytes, and hashing those would be a custody claim
about a file this channel never carried. TEST 1 and TEST 2 have no valid input
and were therefore not executed.

No repair was attempted. Dropping the stray `==`, shifting the piece
boundaries, or re-slicing until the concatenation hashes to `b1c7b235…` is
guess-and-check against a known target — the same search pattern refused for
the U+2122 hypothesis in D-101, and refusing it does not depend on how plausible
the fix looks.

**Chunk 3 custody: still UNKNOWN.** Three transmissions, none verified. The
received pieces are pinned above as `A3-chunk-03.piece-0N.b64` and
`A3-chunk-03.retransmit.b64` with their real hashes, so a future attempt can be
diffed against them rather than starting over. The three assay descriptions
remain a reading aid, not verified provenance, and remain excluded from the
D-102/D-103 measurements via `UNVERIFIED_LABEL_ASSAYS`.
