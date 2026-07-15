# Real Scientific Campaign #001 — External Data Acquisition Plan

Genesis cannot reach external scientific hosts in the current environment (egress policy blocks
Europe PMC / RCSB PDB / PubChem / ChEMBL / UniProt at the gateway — verified 403 CONNECT). This
plan lets a **network-enabled external operator** acquire the genuine payloads so Genesis can
execute Campaign #001 with **no code changes** — the only remaining blocker is real data delivery.

## Scientific question

Computational triage of candidate small-molecule inhibitors for human BRAF (V600E context). This
is a **computational** campaign; it makes no clinical/efficacy claim.

## What must be acquired

See `REAL_CAMPAIGN_INPUT_REQUIREMENTS.json` — it lists, per source, the official endpoint, format,
required fields, licence + provenance requirements, expected parser, and whether mandatory.
Mandatory for a ranking: **ChEMBL, PubChem, UniProt**.

## Command sequence

```
# 1. BUILD EXTERNAL REAL BUNDLE (on a network-enabled machine, outside the restricted env)
node scripts/build-real-campaign-001-bundle.mjs \
     --out campaigns/real-scientific-campaign-001/bundle

# 2. VERIFY BUNDLE (fail-closed on any hash/provenance/identity problem)
node -e "import('./packages/backend/src/corpus/bundleAdapter.mjs').then(m=>{const b=m.openBundle('campaigns/real-scientific-campaign-001/bundle');console.log(b.verifyAll());})"

# 3. INGEST + 4. EXECUTE CAMPAIGN #001 + 5. GENERATE DOSSIER (one command)
node scripts/genesis-campaign-001.mjs --bundle campaigns/real-scientific-campaign-001/bundle
#    (the runner ingests the bundle, runs the target gate + real RDKit/ADMET engines,
#     MCRE conflict resolution, deterministic ranking, Truth-Engine final gate, and dossier.)
```

The runner is source-agnostic: a `VERIFIED_BUNDLE` (real) and a `TEST_FIXTURE` bundle traverse
the identical code path. Only the evidence **origin** label differs (DATABASE_REPORTED /
PUBLISHER_REPORTED vs TEST_FIXTURE), which flows into the dossier honestly.

## Builder guarantees (`scripts/build-real-campaign-001-bundle.mjs`)

- Only official/public endpoints from the requirements file.
- Rate-aware access (bounded concurrency + conservative delay; respects PubChem ≤5 req/s), retries
  with exponential backoff, 429/5xx handling, timeouts.
- Records retrieval timestamps, source URLs, source IDs.
- Preserves the RAW payload; computes **SHA-256**; writes a provenance record per entry.
- Records licence metadata **without inventing it** (`UNKNOWN` when unknown; never guess CC-BY or
  peer-review state).
- Builds the manifest (`ingestionMode: VERIFIED_BUNDLE`) and **validates required mandatory
  sources — fails closed** if any mandatory evidence is missing.
- **Never** fabricates a record. If a source is unreachable, it aborts; it does not synthesise data.

## Honesty

A real bundle enables a real, provenance-grounded computational campaign. It still does **not**
constitute drug discovery: computational ranking is not binding/activity/safety/efficacy, and no
experimental or clinical validation is performed. The dossier's mandatory final answer remains
evidence-driven: today, on fixtures, it is **NO**.
