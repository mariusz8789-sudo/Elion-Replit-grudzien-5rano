# Genesis OS — Remaining External Dependencies (v1.0)

Everything Genesis OS cannot do **by itself in software**, classified honestly. Each item is blocked
by data, infrastructure, laboratory reality, or law — not by missing Genesis code. Where Genesis has
already built the seam that consumes the external input, that seam is named.

Classification: **DATA** (needs external scientific data) · **INFRA** (needs external infrastructure)
· **LAB** (needs physical/experimental validation) · **LEGAL** (needs legal/regulatory approval).

| # | Dependency | Class | Why it's external | Genesis-side seam (ready) |
|---|---|---|---|---|
| 1 | Live scientific sources (UniProt, ChEMBL, PubChem, Europe PMC, RCSB) | DATA/INFRA | The agent sandbox egress policy blocks these hosts (verified 403 CONNECT). Not a Genesis defect. | `build-real-campaign-001-bundle.mjs` (networked) **and** the offline `build-bundle-from-supplied.mjs` (operator supplies official payloads). Both fail closed, never fabricate. |
| 2 | AI Narrator / reasoning brain live model | INFRA | Requires `ANTHROPIC_API_KEY`; none is provisioned in this environment. | `/api/ask` proxy + `modelRouter`/`reasoningBrain` return `CAPABILITY_BLOCKED` honestly; set the key to enable. |
| 3 | Molecular docking (AutoDock Vina) on a real target | DATA/INFRA | Needs a **prepared receptor** (protonation, binding-site definition, PDBQT via Meeko). An mmCIF download is not docking-ready. | Engine matrix reports `BLOCKED_BY_RUNTIME`; docking is never substituted by a heuristic. Supply a prepared receptor to run real Vina. |
| 4 | Experimental / assay validation of any computational candidate | LAB | Binding, activity, ADMET, and efficacy must be measured in a wet lab. Software cannot assert them. | Truth Engine + dossier explicitly refuse efficacy/clinical claims; `didGenesisDiscoverADrug: "NO"`. |
| 5 | Clinical validation | LAB/LEGAL | Human efficacy/safety requires trials under regulatory oversight. | Forbidden-claim gate blocks clinical language in campaign output. |
| 6 | Regulatory / IP / licensing review | LEGAL | Data-reuse licences (e.g. ChEMBL CC-BY-SA), patentability, and regulatory pathway are legal judgements. | Provenance preserves per-record licence verbatim (`UNKNOWN` when unknown — never guessed). |
| 7 | Heavy quantum chemistry at scale (PySCF beyond reference) | INFRA | Production QM campaigns need HPC/GPU capacity. | Reference QM runs execute; large campaigns report `NOT_IMPLEMENTED`/resource-bounded honestly. |
| 8 | Shared multi-instance persistence (Postgres) | INFRA | Horizontal scale beyond one node needs a shared DB. | The store layer is the single seam; schema is Postgres-portable. SQLite serves single-node v1.0. |

## What is NOT externally blocked (delivered in software)

- Deterministic compute models, cheminformatics (real RDKit), ADMET-AI inference (when installed).
- The full offline evidence pipeline: SHA-256-verified bundles, provenance, entity resolution,
  MCRE conflict handling, deterministic versioned ranking, Truth-Engine gating, dossiers.
- The complete API, RBAC/tenanting, auth, campaigns, Discovery Forge, Necropolis, and the frontend
  surfaces that consume them.

## Removing a dependency

Each row is actionable without touching Genesis internals: provision the API key (row 2), run the
campaign on a networked host or hand it supplied payloads (row 1), prepare a receptor (row 3), or
commission lab work (rows 4–5). Genesis already has the code path waiting for each input.
