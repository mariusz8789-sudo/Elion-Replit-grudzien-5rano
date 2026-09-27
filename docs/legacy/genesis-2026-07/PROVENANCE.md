# Provenance & Reproducibility

Every value Genesis displays can answer: *how was this produced, by which engine, which
algorithm, which version, and how confident should I be?* This is what separates Genesis
from a black-box predictor — and it is what a reviewer or auditor needs.

Module: `packages/frontend/src/core/provenance.ts`.

---

## Per-descriptor provenance
For each RDKit descriptor the report exposes a `Provenance` record:

```
descriptor      Masa molowa (MW)
source          RDKit (local computation)
engine          RDKit
algorithm       Descriptors.MolWt (average atomic masses)
engineVersion   2026.03.3
timestamp       <ms>
confidence      HIGH | MEDIUM | MODEL_ESTIMATE
confidenceNote  e.g. "empirical model; typical error ~±0.5 logP units"
reproducibility DETERMINISTIC
```

Confidence is honest per descriptor: **LogP is `MEDIUM` (~±0.5)**; exact/topological
descriptors (MW, TPSA, HBD, HBA, InChIKey, formula) are `HIGH`.

## Analysis Hash (reproducible)
`analysisHash(input)` = SHA-256 over **canonical JSON** (sorted keys, deterministic
stringify) of:

```json
{ "canonicalSmiles": "...", "inchiKey": "...", "properties": { ... }, "rdkitVersion": "2026.03.3" }
```

Same molecule + same RDKit version → **same hash**. A second scientist can recompute and
compare hashes to confirm reproduction. The hash is **version-scoped**: it embeds
`rdkitVersion`, so a different RDKit release legitimately produces a different hash (LogP/TPSA
may shift). This is intentional and disclosed.

## Reproducibility metadata (on every report)
```
Report ID          GEN-2026-<base36>-<hex>
Analysis Hash      <sha256>
Genesis Version    <app version>
RDKit Version      2026.03.3
Grounding Version  genesis-grounding/1
Generated At       <ISO timestamp>
```

`Report ID` uses a random+timestamp component and is **not** part of the scientific hash — it
identifies a report instance; the Analysis Hash identifies the scientific content. The two are
deliberately separate so a non-deterministic ID never contaminates reproducibility.

## Campaign & export provenance
CSV / JSON campaign exports (`core/campaignExport.ts`) carry engine + version + grounding
version on every row/record, mark invalid molecules with their validation error, and set
`experimentalValidationRequired: true`. Exports contain **only** verified computations,
grounded interpretations, and provenance — never unsupported claims. See CAMPAIGNS.md.

See also: SCIENTIFIC_ENGINE.md, KNOWN_LIMITATIONS.md.
