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
transcription slip on either end. This now looks like either (a) a
normalisation this text channel applies consistently and invisibly to both
attempts, or (b) an error in the declared hash itself. Not diagnosable further
from inside this container — no resend over this channel is expected to
change the outcome. Left as unresolved drift; the pinned bytes are the best
available record of the three assay descriptions, used as a reading aid, not
as verified provenance.

```
assay_chembl_id|target_chembl_id|assay_type|bao_format|bao_label|assay_description
```

**The target filter is recovered by join, not by re-sending A1.** All 45
received assays carry `target_chembl_id = CHEMBL1784`, so every A1 row that
joins is confirmed on-target. The D-094 format defect is repaired without
invalidating the byte-verified A1 chunks.

Provenance class: `user-supplied-reference`. See D-092a.
