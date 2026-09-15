# GLP-1R EC50 — set A1, received by text transcription

**STATUS: INCOMPLETE — 2 of 7 chunks, 233 of 757 declared rows.**

These files are NOT a dataset pin and MUST NOT be loaded as one. They are the
raw transcription as received, kept verbatim so the audit is reproducible.

| chunk | rows | declared sha256 | verified here |
|---|---|---|---|
| 01 | 121 | `5cba441b861af0817c56a68d9e4cc0281b550b26058763eaf79e4b47cdadbabf` | MATCH |
| 02 | 112 | `371521e2b85e120056ccc4036ab010a7073a51de59b6b3b0b5db39e2c13e3358` | MATCH |
| 03-07 | — | — | NOT_RECEIVED |

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
