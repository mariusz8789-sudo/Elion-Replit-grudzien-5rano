# Genesis Scientific Corpus Factory V1

Provenance-saturated, campaign-scoped scientific evidence ingestion feeding the existing
Genesis brain (Evidence Intelligence → Truth Engine → Target Intelligence → Discovery Forge).

## Orthogonal classifications (never collapsed)

- **Ingestion mode** (how it arrived): `LIVE_API` · `VERIFIED_BUNDLE` · `USER_SUPPLIED` · `BULK_IMPORT` · `TEST_FIXTURE`
- **Evidence origin** (what kind): `PUBLISHER_REPORTED` · `DATABASE_REPORTED` · `USER_SUPPLIED` · `COMPUTED` · `MODEL_INFERRED` · `HEURISTIC` · `TEST_FIXTURE`
- **Rights/licence** (legal reuse): `CC0` · `CC-BY` · `PUBLISHER_SPECIFIC` · `PUBLIC_DOMAIN` · `UNKNOWN`
- **Quality** (epistemic): assessed downstream by Evidence Intelligence.

Licence status is **not** evidence quality. A non-CC0 record is not "unverified".

## Source status in THIS environment

External scientific hosts are policy-blocked at the egress gateway (403 CONNECT), and there is
no configured live model. Therefore:

| Source | Status here | Notes |
|--------|-------------|-------|
| Europe PMC | **CAPABILITY_BLOCKED (live)** / **BUNDLE_VERIFIED** | live adapter implemented; 403 at egress. Parser + bundle path verified. |
| RCSB PDB | **CAPABILITY_BLOCKED (live)** / **BUNDLE_VERIFIED** | structure existence ≠ docking validity (enforced). |
| PubChem | **CAPABILITY_BLOCKED (live)** / **BUNDLE_VERIFIED** | representation vs identity separated. |
| ChEMBL | **CAPABILITY_BLOCKED (live)** / **BUNDLE_VERIFIED** | standard_type/relation/value/units preserved (Ki≠IC50). |
| UniProt | **CAPABILITY_BLOCKED (live)** / **BUNDLE_VERIFIED** | identity by accession, never by name. |

`BUNDLE_VERIFIED` here means the parser + Local Bundle Adapter path is exercised on a
**SYNTHETIC TEST_FIXTURE** bundle (SHA-256 verified). It is **not** a real acquired corpus.

## Building a REAL bundle (outside the restricted environment)

The Local Bundle Adapter and parsers are production-capable. To build a real
`genesis-scientific-evidence-bundle-v1` where networking is available:

1. Author a campaign query plan (`corpus/queryPlanner.mjs` → `planQueries(...)`).
2. Acquire records via the live adapters with rate-aware access (respect each source's usage
   policy; PubChem/large acquisition should prefer bulk/offline dumps, not PUG brute force).
3. For each record, preserve the RAW payload, compute **SHA-256**, capture source id/url,
   retrieval timestamp, and licence metadata **without inventing it** (store `UNKNOWN` when
   unknown — never guess CC-BY or peer-review state).
4. Write a `provenance/<entryId>.json` per record and assemble `manifest.json`
   (`manifestVersion: genesis-scientific-evidence-bundle-v1`, `ingestionMode: VERIFIED_BUNDLE`).
5. Verify with `openBundle(root).verifyAll()` — it fails closed on any hash mismatch, missing
   provenance, path traversal, duplicate identity, or unsupported version/algorithm/service.

The synthetic fixture builder (`packages/backend/scripts/build-fixture-bundle.mjs`) shows the
exact manifest/provenance/SHA-256 shape; a real builder swaps synthetic payloads for acquired
ones and sets `ingestionMode: VERIFIED_BUNDLE`.

## What this does NOT claim

Record existence is not claim support. A compound in PubChem is not evidence of efficacy. A PDB
structure existing is not evidence a generated molecule binds. A ChEMBL activity is not proof of
therapeutic effect. **Genesis has not found a drug.** The pipeline produces auditable,
provenance-preserving computational evidence handling — nothing more is asserted.
