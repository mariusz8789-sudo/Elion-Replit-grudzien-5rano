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

## Two acquisition paths (pick one — both end in the identical campaign)

### Path A — the runner acquires (network-enabled runner)

The machine running Genesis has egress to the official hosts.

```
# ONE command: preflight → acquire → verify → execute → dossier (fail-closed at every stage)
node scripts/run-campaign-001.mjs [--with-structure]
```

### Path B — externally supplied official payloads (NO egress from the runner)  ← this sandbox

When the runner has **no egress** (this agent sandbox, an air-gapped host), a network-enabled
operator downloads the OFFICIAL payloads elsewhere and hands over the raw files. Genesis assembles,
verifies, and executes the bundle **offline, with zero network**:

```
# 1. On ANY machine: download each OFFICIAL payload per REAL_CAMPAIGN_INPUT_REQUIREMENTS.json,
#    save the RAW response bytes into a directory, and fill SUPPLIED_INPUTS.json
#    (copy SUPPLIED_INPUTS_TEMPLATE.json; ingestionMode = VERIFIED_BUNDLE). E.g.:
mkdir -p campaigns/real-scientific-campaign-001/supplied
curl -s "https://rest.uniprot.org/uniprotkb/P15056.json" \
     -o campaigns/real-scientific-campaign-001/supplied/uniprot_P15056.json
curl -s "https://www.ebi.ac.uk/chembl/api/data/activity/<ACTIVITY_ID>.json" \
     -o campaigns/real-scientific-campaign-001/supplied/chembl_activity_<ACTIVITY_ID>.json
curl -s "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/<CID>/property/CanonicalSMILES,InChIKey,MolecularFormula,MolecularWeight/JSON" \
     -o campaigns/real-scientific-campaign-001/supplied/pubchem_cid_<CID>.json
# (Europe PMC + RCSB PDB optional; CHEMBL + PUBCHEM + UNIPROT mandatory.)

# 2. On the (possibly offline) Genesis machine: ONE command — assemble → verify → execute → dossier
node scripts/run-campaign-001.mjs --supplied campaigns/real-scientific-campaign-001/supplied
```

`run-campaign-001.mjs --supplied` invokes `build-bundle-from-supplied.mjs` (offline assembly:
real SHA-256 from the supplied bytes + parse-identity validation), then the same verify + execute.

### Verify / execute directly (either path)

```
# Verify a bundle (fail-closed on any hash/provenance/identity problem)
node -e "import('./packages/backend/src/corpus/bundleAdapter.mjs').then(m=>{const b=m.openBundle('campaigns/real-scientific-campaign-001/bundle');console.log(b.verifyAll());})"

# Execute Campaign #001 on a verified bundle → real RDKit/ADMET, MCRE, ranking, Truth gate, dossier
node scripts/genesis-campaign-001.mjs --bundle campaigns/real-scientific-campaign-001/bundle
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

## Offline builder guarantees (`scripts/build-bundle-from-supplied.mjs`, Path B)

- Reads each operator-supplied raw payload **exactly as downloaded** (bytes preserved) — **no network**.
- Computes the real **SHA-256** of those bytes; never accepts a hand-authored hash.
- Validates each payload **parses to a usable entity of its claimed type** (`assertUsableIdentity`):
  a UniProt file must yield an accession, a ChEMBL file an `activity_id` + `standard_type`, a
  PubChem file a CID/InChIKey **and** a SMILES. A stub `{}` or wrong-type file **fails closed**.
- Refuses path traversal / absolute paths, duplicate source identity, non-JSON payloads, unsupported
  schema, and (for `VERIFIED_BUNDLE`) any missing mandatory source — all fail closed.
- Honours the manifest's `ingestionMode`: `VERIFIED_BUNDLE` for genuine official payloads,
  `TEST_FIXTURE` for synthetic pipeline self-checks — so nothing is ever mislabelled.

## Honesty

A real bundle enables a real, provenance-grounded computational campaign. It still does **not**
constitute drug discovery: computational ranking is not binding/activity/safety/efficacy, and no
experimental or clinical validation is performed. The dossier's mandatory final answer remains
evidence-driven: today, on fixtures, it is **NO**.
