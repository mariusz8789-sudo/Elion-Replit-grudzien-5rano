# GLP-1R assay dictionary — set A3, received by text transcription

**STATUS: INCOMPLETE — 1 of 4 chunks, 45 of 90 declared assays.**

One row per distinct assay, not per activity. Requested in D-094 after the A1
format was found to make two things impossible: verifying target identity per
row, and grouping by readout.

| chunk | rows | declared sha256 | verified |
|---|---|---|---|
| 01 | 45 | `a78c96be1b6c273837ce23989faded32c73c044ec762a326268507d9025cccad` | MATCH |
| 02-04 | — | — | NOT_RECEIVED |

```
assay_chembl_id|target_chembl_id|assay_type|bao_format|bao_label|assay_description
```

**The target filter is recovered by join, not by re-sending A1.** All 45
received assays carry `target_chembl_id = CHEMBL1784`, so every A1 row that
joins is confirmed on-target. The D-094 format defect is repaired without
invalidating the byte-verified A1 chunks.

Provenance class: `user-supplied-reference`. See D-092a.
