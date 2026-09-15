# GLP-1R EC50 — set A1, received by text transcription

**STATUS: INCOMPLETE — 5 of 7 chunks, 597 of 757 declared rows.**

These files are NOT a dataset pin and MUST NOT be loaded as one. They are the
raw transcription as received, kept verbatim so the audit is reproducible.

| chunk | rows | declared sha256 | verified here |
|---|---|---|---|
| 01 | 121 | `5cba441b861af0817c56a68d9e4cc0281b550b26058763eaf79e4b47cdadbabf` | MATCH |
| 02 | 112 | `371521e2b85e120056ccc4036ab010a7073a51de59b6b3b0b5db39e2c13e3358` | MATCH |
| 03 | 121 | `71d2cc660ef27bfc4640861f12a9c9c6fb3aed56846d426ba2e9f36b6b5f2e1f` | MATCH |
| 04 | 125 | `3a784a977cad05e66e367489fb5e52d26da73df718801b05676fbd48b6a3e871` | MATCH |
| 05 | 124 | `ca0f3f311dbd0c578c7db0890087bf9ab2adee29f0a2b29cfe7e1c4d586d0758` | MATCH |
| 06-07 | — | — | NOT_RECEIVED |

## Same-assay duplicate observation (informational, no code change)

19 (molecule, assay) pairs carry two rows with different `activity_id`. Two
regimes: 4 pairs (docs `CHEMBL3351313`) spread ~0.00-0.02 log — re-curated
entries of one measurement. 15 pairs, all from screening document
`CHEMBL5726519`, spread 0.5-1.5 log — genuinely different activity records for
the same molecule in the same assay.

This is exactly the case `REPLICATE_RULE` (>=2 DISTINCT `assayId`) is designed
to exclude: counting two same-assay rows as a replicate group would produce a
falsely LOW spread, the dangerous direction (D-091, D-089's withdrawn 1.1212).
`replicateGrouping.mjs` already excludes these into `rejected.sameAssayOnly`
without any change. Recorded here so the pattern is visible before the
canonical loader runs, not discovered by it.

Provenance class: `user-supplied-reference`. The bytes never travelled from
ChEMBL to this container; a transcriber produced them. Fidelity rests on the
transcriber, not on a server response hash. See D-092a.

Column order (13 fields, `|`-separated, empty string for null):

```
activity_id|molecule_chembl_id|assay_chembl_id|standard_type|standard_relation|
standard_value|standard_units|pchembl_value|document_chembl_id|assay_type|
action_type|data_validity_comment|potential_duplicate
```

**Two fields are missing and both matter** — see D-094:
`target_chembl_id` (so the most important filter cannot be verified per row)
and any readout descriptor (`bao_label` / `assay_description`), without which
homogeneous replicate grouping is impossible.

Verify with: `node scripts/d094-verify-transcription.mjs`
