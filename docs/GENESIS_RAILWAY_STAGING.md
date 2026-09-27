# Genesis Railway staging feasibility — 2026-09-23

## Decision

The smallest defensible investor/grant staging setup is **one Railway web/API
service plus one `/data` volume**. The image contains Node, the production UI,
Python, RDKit, and the committed CMS Z→μμ source dataset. This gives Virtual
Lab one real molecular engine and CERN one real measured-data analysis without
making the image depend on the heaviest optional engines.

Railway currently has no GPU instances. GPU video generation therefore stays
outside Railway and remains `BLOCKED_GPU`/`BLOCKED_MODEL` until an authorized
external adapter is configured. Railway also does not advertise the compliance
needed for government production; this plan is staging/demo infrastructure,
not an assertion of certified public-sector hosting.

Official operational references:

- https://docs.railway.com/guides/ai-api-hosted-inference
- https://docs.railway.com/platform/use-cases
- https://docs.railway.com/volumes
- https://docs.railway.com/volumes/backups
- https://docs.railway.com/builds/dockerfiles
- https://docs.railway.com/variables/reference

## Canonical execution architecture

```text
Browser
  -> Railway Service A: Genesis UI + API + canonical registries
       -> embedded Node scientific models / SEIR / CERN toy runtime in browser
       -> embedded RDKit Python worker
       -> embedded checksum-pinned CMS Open Data Python analysis
       -> SQLite + Evidence Ledger + artifacts on /data
       -> future private HTTP adapter -> Railway Service B scientific worker
       -> future authenticated adapter -> external GPU compute
```

There is no Railway-specific Virtual Lab. The existing capability/toolchain
registry remains authoritative. A future worker may change where an adapter
runs, but not candidate identity, ScienceRun, Evidence, provenance, replay, or
BLOCKED/READY semantics.

The repository does **not** yet contain a canonical remote scientific-worker
transport. Consequently Service B is an architectural recommendation, not a
pretend-ready deployment. Adding heavy packages to Service A before measuring
them would increase build time, cold-start time, memory, and failure coupling.

## Railway engine matrix

Planning RAM/storage ranges are conservative deployment envelopes, not measured
Railway benchmarks. `RAILWAY_READY` means the current image has a runnable path;
all other engines require an actual Railway reference run before promotion.

| Engine / runtime | Current adapter | Python/system/executable requirements | CPU/GPU | Planning RAM / added storage | Railway status | Strategy and reference case |
|---|---|---|---|---|---|---|
| Genesis deterministic model registry (SEMF, relativity, chemistry, quantum teaching models, etc.) | `compute/registry.mjs`, bundled canonical core | Node 22; no extra executable | CPU | 0.1–0.4 GB / bundled | `RAILWAY_READY` | **A embedded**. Existing model tests; staging smoke exercises API routing. |
| RDKit 2026.3.6 | `compute/rdkitAdapter.mjs` | pinned `rdkit==2026.3.6`; Python 3 venv; `ca-certificates` | CPU | 0.2–0.8 GB / ~0.2–0.5 GB | `RAILWAY_READY` | **A embedded**. Docker installs the pinned package; aspirin descriptor reference and staging verifier required. |
| CMS Open Data Z→μμ | `compute/cmsOpenDataAdapter.mjs` | Python stdlib; committed CC0 CSV with fixed SHA-256; no executable | CPU | <0.2 GB / bundled dataset | `RAILWAY_READY` | **A embedded**. Staging verifier runs the real dataset and checks source provenance. |
| CERN collision runtime | `packages/core/src/cern/*`, frontend collider | Browser/Node JavaScript; no Python | client CPU/GPU rendering only | browser-dependent / bundled | `RAILWAY_READY` | **A embedded web assets**. It remains labelled `TOY_MC_MODEL`; it is distinct from CMS measured data. |
| SEIR / SW-4 | canonical frontend world runtime | Browser JavaScript/TypeScript; no Python | client CPU | browser-dependent / bundled | `RAILWAY_READY` | **A embedded web assets**. Deterministic browser E2E remains the reference path. |
| Biopython 1.88 | `compute/proteinAdapter.mjs` | `biopython`; Python only | CPU | 0.2–0.6 GB / <0.1 GB | `RAILWAY_READY_WITH_EXTRA_PACKAGES` | **B scientific worker**. Light enough for CPU, but not installed in Service A; validate PDB reference in Railway before READY. |
| PySCF 2.14.0 | `compute/qmAdapter.mjs` | pinned `pyscf==2.14.0`; wheel/BLAS supplied by package | CPU; no GPU required by adapter | 0.5–4 GB input-dependent / ~0.3–1 GB | `RAILWAY_CPU_ONLY` | **B scientific worker**. H₂ RHF/STO-3G reference must pass on Railway; enforce existing timeout. |
| OpenMM 8.6.x | `compute/mdAdapter.mjs`, `compute/openmmRuntime.mjs` | `openmm`; Python; adapter explicitly selects CPU and one thread | CPU | 0.5–3 GB / ~0.3–1 GB | `RAILWAY_CPU_ONLY` | **B scientific worker**. TIP3P minimization/NVT reference; do not imply candidate MD because current binding is a reference system. |
| AutoDock Vina + Meeko | `compute/dockingAdapter.mjs` | `vina`, `meeko`, `scipy`, `gemmi`; Python bindings, no CLI invoked | CPU | 0.5–3 GB / ~0.5–1.5 GB | `RAILWAY_READY_WITH_EXTRA_PACKAGES` | **B scientific worker**. Run the bounded hashed docking reference; store artifacts on the worker volume/object store. |
| ADMET-AI / toxicity | `compute/admetAdapter.mjs` | `admet-ai` plus bundled Chemprop/PyTorch dependencies and weights | CPU supported; GPU not requested | 2–8 GB / potentially multiple GB | `UNKNOWN_NEEDS_TEST` | **B on-demand scientific worker**. First-load and inference memory must be measured; aspirin 52-endpoint reference required. Do not put it in Service A blindly. |
| PyMeep | `compute/meepAdapter.mjs` | `pymeep/meep`, normally conda-forge plus native MPI/HDF5/FFTW stack | CPU | 1–8+ GB / multi-GB image | `RAILWAY_BLOCKED_RUNTIME` | **D blocked** for the baseline. A dedicated, licensed, reproducible image and Railway reference run are prerequisites. |
| Local Genesis AI-video | `cinematic/genesisVideoEngine.mjs`, Stage A/B adapter | legal checkpoint, PyTorch/DirectML/CUDA-class runtime, FFmpeg | GPU required for useful inference | >8–24 GB VRAM class; large weights | `RAILWAY_UNSUITABLE_GPU` | **C external compute adapter**, currently honestly blocked because no legal checkpoint/runtime is configured. |
| DepMap panel | `compute/depmapAdapter.mjs` | approved, checksum-verified DepMap 24Q2 dataset | CPU/RAM data-dependent | dataset-dependent | `RAILWAY_BLOCKED_LICENSE` | **D blocked** until the approved licensed dataset is mounted/configured. |
| Hybrid cloud QPU | `quantumApi.mjs` | `QPU_API_URL` and bearer secret | external | external | `RAILWAY_BLOCKED_CONFIGURATION` | **C external adapter**. Without credentials the canonical local statevector fallback stays labelled `MODEL_ESTIMATE`. |

## Packages and image policy

Service A installs only:

- Debian: `python3`, `python3-venv`, `ca-certificates`, `gosu`.
- Python: `rdkit==2026.3.6` from `packages/backend/requirements-rdkit.txt`.
- Node production dependency: `@anthropic-ai/sdk` (the API remains optional).

`gosu` is used only by the fixed entrypoint: Railway mounts `/data` as root,
the entrypoint repairs that mount's ownership, then replaces itself with the
server running as `node`. No shell input from an API is evaluated.

The broad root `requirements-compute.txt` remains an optional development
manifest with minimum versions. It is deliberately not installed in staging.
Before Service B exists, its versions must be pinned, its complete image must
be license-reviewed, and its real peak resource usage must be recorded.

## Persistence and database

The implemented database is `node:sqlite`; there is no Postgres adapter and the
code does not read `DATABASE_URL`. Therefore the honest staging database is
SQLite on a Railway Volume, not an invented Postgres migration.

| Data | Staging location | Required variable |
|---|---|---|
| Users, projects, campaigns, ScienceRun/replay metadata | `/data/genesis.db` | `GENESIS_DB_PATH=/data/genesis.db` |
| Canonical knowledge Evidence Ledger snapshot | `/data/evidence-ledger.json` | `GENESIS_LEDGER_PATH=/data/evidence-ledger.json` |
| Docking/QM/scientific artifacts | `/data/artifacts` | `GENESIS_ARTIFACT_DIR=/data/artifacts` |
| SQLite backups | `/data/backups` | `GENESIS_BACKUP_DIR=/data/backups` |
| Frontend/static assets | immutable container image | none |
| Committed CMS fixture | immutable container image | none unless explicitly overridden |
| Large licensed datasets/checkpoints | not in image; approved volume/object storage later | engine-specific variable only after approval |
| Logs | Railway log stream; do not persist secrets | none |

Attach one volume at `/data`, enable scheduled backups, and run a restore drill.
SQLite is appropriate for a single-replica investor staging service. Do not
horizontally scale the write service against one SQLite file. A real Postgres
migration is future software work and must be implemented/tested before a
`DATABASE_URL` is added.

## Exact staging variables

Required non-secret values:

```text
GENESIS_DB_PATH=/data/genesis.db
GENESIS_LEDGER_PATH=/data/evidence-ledger.json
GENESIS_ARTIFACT_DIR=/data/artifacts
GENESIS_BACKUP_DIR=/data/backups
```

Optional, real code paths:

```text
ANTHROPIC_API_KEY=<sealed secret; enables /api/ask and /api/world-proposal>
GENESIS_AI_MODEL=claude-opus-4-8
GENESIS_RESEARCH_API_KEY=<sealed secret for authenticated research sources>
GENESIS_INSTITUTIONAL_API_KEY=<sealed secret for restricted sources>
QPU_API_URL=<authorized external QPU endpoint>
QPU_API_KEY=<sealed bearer secret>
```

Railway supplies `PORT` and `RAILWAY_GIT_COMMIT_SHA`. The image supplies
`GENESIS_RDKIT_PYTHON`. Do not set test/capture variables, local filesystem
fixture overrides, `GENESIS_STATIC_DIR`, `GENESIS_LOCAL_VIDEO_MODELS_DIR`, or
`RAILWAY_RUN_UID` for baseline staging.

## Anthropic status

Anthropic is a real optional integration, not a stray variable:

- `packages/backend/src/server.mjs` imports `@anthropic-ai/sdk`.
- `POST /api/ask` and `POST /api/world-proposal` call `client.messages.create`.
- The key stays server-side and is never returned.
- Requests are bounded and rate-limited.
- Without the key both routes return an honest `503 ai_unavailable`; core UI,
  deterministic worlds, Virtual Lab, RDKit, CMS, Evidence, and replay do not
  require the key.

No staging Anthropic call can be verified without an operator-provided secret;
that is an external credential gate, not a scientific-runtime blocker.

## Health and staging verification

`GET /api/health` is the public safe health surface. It returns only engine id,
status, and version, plus release/persistence state. Absolute paths and secrets
are excluded. The canonical detailed toolchain endpoint also redacts paths.

Run after Railway deploy:

```bash
GENESIS_STAGING_BASE_URL=https://<domain> npm run staging:verify
```

The read-only verifier requires:

1. the production UI is served;
2. SQLite answers and reports durable storage;
3. the 40-character deployed commit is present;
4. health/toolchain responses contain no local path;
5. RDKit is `AVAILABLE` with a validated reference fingerprint;
6. a real aspirin descriptor call returns the expected molecular weight;
7. the checksum-pinned CMS Z→μμ run returns source events and provenance.

After that, run the existing authenticated Virtual Lab Chromium/API E2E against
the staging domain. It must prove project/campaign/candidate isolation and the
RDKit plan→execute→Evidence proposal→replay MATCH path. This cannot be claimed
before an actual Railway deployment exists.

## Resource/cost risks

- Keep Service A at one replica because of SQLite. Start with a measured memory
  limit around 1 GB; adjust from Railway metrics, not guesses.
- The RDKit subprocess is bounded (10 s). Heavy adapters have longer existing
  limits and belong in a separate worker so they cannot starve the API.
- ADMET model loading and scientific Python wheels can dominate image size and
  memory. Measure them in an isolated worker before enabling always-on service.
- Serverless sleep can reduce staging cost but adds cold-start latency during a
  live investor demo; keep the demo service awake only for the scheduled window.
- Railway has no GPU; do not upload local AI-video weights there.
- Railway databases/volumes require backups and restore testing; a green health
  check alone is not disaster recovery.

## Promotion rule

An engine becomes Railway `READY` only after the deployed adapter resolves, its
real reference case passes, result/output hash and provenance are present, and
the Virtual Lab receives the result. Local Windows or another sandbox result is
supporting evidence, not Railway proof.
