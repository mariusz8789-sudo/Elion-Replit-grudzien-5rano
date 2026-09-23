# Railway scientific workers (2026-09-23)

This document is the reference for the private Railway scientific workers:
`claude/genesis-railway-scientific-workers` (images, pins, readiness matrix —
§1–§8) and `claude/genesis-railway-remote-dispatch` (the canonical remote
execution path from the Virtual Lab to those workers — §9). It covers every
heavy scientific engine in the canonical registry
(`packages/backend/src/campaign/toolchain.mjs`) plus the two non-toolchain,
stdlib-only data adapters, the worker grouping decision, the HTTP seam, and
the exact lines Codex must integrate in files these branches do not own.

Nothing here creates a second Virtual Lab, solver registry, or engine
definition. Every worker file reuses `campaign/toolchain.mjs`, the existing
per-engine adapters, `redact.mjs`, and `provenance.mjs`.

## 1. Complete engine matrix

Live-verified in this sandbox on 2026-09-23 (`python3 packages/backend/src/
compute/env_probe.py`, `pip show <pkg>`, `pip index versions <pkg>`). Real
local reference-case results are produced by
`npm run --workspace=packages/backend test` (`heavyEngines.test.mjs`,
`admetEngine.test.mjs`) and the new
`node scripts/railway-worker-readiness.mjs`.

| Engine | Live version here | License | Deployment class | Worker group | System packages | Python packages (pinned) |
| --- | --- | --- | --- | --- | --- | --- |
| RDKit | 2026.03.6 | BSD-3-Clause | EMBEDDED_MAIN_SERVICE (already in root Dockerfile) | — | none beyond `python3`/`python3-venv` | `requirements-rdkit.txt`: `rdkit==2026.3.6` |
| PySCF | 2.14.0 | Apache-2.0 | RAILWAY_CPU_WORKER | chem-light | none beyond `python3`/`python3-venv` | `requirements-pyscf.txt`: `pyscf==2.14.0` |
| Biopython | 1.88 | BSD | RAILWAY_CPU_WORKER | chem-light | none | `requirements-biopython.txt`: `biopython==1.88` |
| OpenMM | 8.6.1 | MIT/LGPL | RAILWAY_CPU_WORKER | structural | none (CPU platform used explicitly; no CUDA/OpenCL driver required) | `requirements-openmm.txt`: `openmm==8.6.1` |
| AutoDock Vina (Python binding) | 1.2.7 | Apache-2.0 | RAILWAY_CPU_WORKER | structural | none | `requirements-vina.txt`: `vina==1.2.7` |
| Meeko | 0.8.0 | LGPL | RAILWAY_CPU_WORKER | structural (paired with Vina; needs RDKit) | none | `requirements-meeko.txt`: `meeko==0.8.0` (+ `requirements-rdkit.txt` in the same worker) |
| ADMET-AI (ADMET) | 2.0.1 | MIT | RAILWAY_CPU_WORKER | admet (isolated) | none | `requirements-admet.txt`: `admet-ai==2.0.1` (pulls `torch`, `chemprop`, `lightning`, `pandas`, `seaborn`) |
| ADMET-AI (toxicity) | 2.0.1 | MIT | RAILWAY_CPU_WORKER | admet (same engine as above, different capabilityId) | none | same as ADMET |
| PyMeep | not installed | GPL-2.0-or-later | GENUINE_EXTERNAL_BLOCKER | — (proposal only) | HDF5, MPICH/OpenMPI, harminv, libctl, guile, swig, GSL — conda-forge only | not pip-installable; see §5 |
| CMS Open Data Z→μμ (record 5208) | dataset present, checksum-verified | CC0-1.0 (dataset) | EMBEDDED_MAIN_SERVICE | — | none | none — Python stdlib only (`csv`/`hashlib`/`statistics`) |
| DepMap 24Q2 senescence panel | data not present | DepMap Public 24Q2 terms | GENUINE_EXTERNAL_BLOCKER today | — | none | none — Python stdlib only; blocked purely on `GENESIS_DEPMAP_24Q2_DATA_DIR` not being populated with the (uncommitted, large) hash-verified dataset |

Torch's installed footprint was measured directly in this sandbox:
`/usr/local/lib/python3.11/dist-packages/torch` = **1.2 GB**. That single
number is why ADMET/toxicity gets its own worker instead of sharing chem-light
or structural.

## 2. Worker grouping decision (RWK-3)

- **chem-light** (PySCF + Biopython): both are comparatively small,
  numpy/scipy-class installs with fast, deterministic pip installs. Combined
  into one worker to avoid a fourth Railway service for two lightweight
  engines.
- **structural** (OpenMM + Vina + Meeko, + RDKit as Meeko's own dependency):
  these three are used together in a docking → MD pipeline and Meeko already
  requires RDKit for ligand/receptor prep, so splitting them further would
  just duplicate the RDKit install across two images.
- **admet** (ADMET-AI, serving both the `admet` and `toxicity` toolIds — they
  are literally the same Chemprop D-MPNN ensemble, split only by
  `capabilityId`): isolated in its own worker specifically because of the
  ~1.2GB PyTorch footprint, so a memory spike or slow model load in this
  worker cannot destabilize the smaller chem-light/structural workers.
- **RDKit** stays embedded in the main service image (already the case on
  `main`; this branch does not touch the root Dockerfile).
- **CMS Open Data / DepMap**: no worker at all. Both workers are pure
  Python-stdlib data adapters (verified by reading `cms_zmumu_worker.py` and
  `depmap_worker.py` — only `csv`, `hashlib`, `json`, `math`, `os`,
  `statistics`, `sys`, `pathlib`). They already run wherever the main
  service's `python3` runs; their only real blocker is data presence, not
  runtime.
- **PyMeep**: no working worker. See §5.

## 3. Worker HTTP contract

`packages/backend/src/compute/workerServer.mjs` exports
`createWorkerServer({ workerGroup, engineIds, authToken })`, a small
`node:http` server built entirely from the existing registry. Its fourth
route, the authenticated execution endpoint, is specified in §9:

- `GET /health` — `{ ok, workerGroup, engineIds, uptimeSeconds, node,
  contractVersion, executableCapabilities, executionAuth }`.
- `GET /engines` — `listToolchain()` filtered to this worker's allowlist
  (same redacted shape as `GET /api/compute/toolchain`).
- `POST /engines/:toolId/reference-case` — calls `getTool(toolId)` (runs the
  real reference case, cached per process exactly like the main service) and
  returns `{ ok, requestId, toolId, workerGroup, durationMs, outputHash,
  status, availability, executionStatus, version, engine, fingerprint,
  environment, validation, reason, limitations }`. A `toolId` outside the
  worker's allowlist is refused with `404 ENGINE_NOT_IN_WORKER` — never
  proxied or executed.

Bounding, concretely:

- **Timeout**: every adapter already enforces its own `execFileSync` timeout
  (e.g. `meepAdapter.mjs` TIMEOUT_MS=120000); that is the real, authoritative
  bound on a hanging computation. `workerServer.mjs` additionally calls
  `server.setTimeout(330_000)` (a genuine Node HTTP socket timeout, set above
  the slowest adapter — docking, 300 s — so the adapter decides) as an outer
  bound at the transport layer.
- **Resource limits**: every adapter's subprocess call already caps
  `maxBuffer` (4–32MB); the HTTP layer adds `MAX_RESPONSE_BYTES` (8MB),
  `MAX_BODY_BYTES` (64KB) and, for execution requests that may carry a PDB or
  PDBQT text, `MAX_EXECUTION_BODY_BYTES` (4MB), so a malformed or oversized
  request/response can never reach an adapter or leave the process uncapped.
- **Malformed input**: `POST` bodies are JSON-parsed before use; a body that
  fails to parse returns `400 MALFORMED_INPUT` without touching an adapter.
- **Path/secret redaction**: `/engines` and `/engines/:id/reference-case`
  return the same `redact()`-wrapped `environment`/`reason`/`failureReason`
  fields as the existing public `GET /api/compute/toolchain/:toolId` route —
  no absolute local filesystem path or interpreter path ever leaves the
  worker.
- **Non-root / clean shutdown**: every worker Dockerfile runs
  `USER node` (or `USER genesis` for the PyMeep proposal) after setup, and
  `workerEntrypoint.mjs` handles `SIGTERM`/`SIGINT` by closing the HTTP
  server before exiting.
- **No arbitrary execution**: the HTTP layer never accepts a shell command,
  file path, or module name from the request. The free variables are a
  `toolId`/`capabilityId` matched against a fixed, per-worker allowlist
  validated at server-construction time against the canonical registry, and
  (execution endpoint only) an input that must pass that capability's strict
  schema (§9.2).

`packages/backend/src/compute/workerEntrypoint.mjs` is the container's `CMD`
target: it reads `GENESIS_WORKER_GROUP`, resolves the group's fixed
`engineIds`, and starts the server on `PORT` (Railway injects this, matching
the convention already used by `start.mjs`).

## 4. Worker Dockerfiles (additive; do not touch the root Dockerfile)

- `packages/backend/workers/chem-light/Dockerfile`
- `packages/backend/workers/structural/Dockerfile`
- `packages/backend/workers/admet/Dockerfile`
- `packages/backend/workers/pymeep/Dockerfile.proposal` (untested — see §5)

Each follows the same shape as the root Dockerfile's existing Python venv
pattern: `node:22-slim` base, `apt-get install python3 python3-venv
ca-certificates`, a dedicated venv at `/opt/genesis-science`, pinned
`pip install -r requirements-*.txt`, `USER node`, `EXPOSE 8090`, and a
`HEALTHCHECK` that calls `GET /health` exactly like the root Dockerfile's
`HEALTHCHECK` calls `GET /api/health`. Build context is the **repository
root** (each Dockerfile `COPY`s `packages/backend/...` paths), e.g.:

```
docker build -f packages/backend/workers/structural/Dockerfile -t genesis-worker-structural .
```

This repository's sandbox has a Docker **client** (`29.3.1`) but no reachable
daemon (`docker info` fails: `dial unix /var/run/docker.sock: connect: no
such file or directory`), so these Dockerfiles could not be `docker build`-ed
or `docker run`-tested from here. They were written from the same proven
pattern as the root Dockerfile (which does build and run in production today)
and pinned against package versions verified to install and pass their real
reference case in this exact Linux x86_64 sandbox. Codex or CI, which do have
Docker daemon access, should run one real `docker build` + `docker run` +
`curl /health` per worker before relying on them.

## 5. PyMeep — genuine external blocker (real feasibility check performed)

Rule: PyMeep must be tested for real installation feasibility before being
declared blocked — not just assumed blocked. This was tested here, honestly,
and failed for a documented reason rather than skipped:

1. `pip index versions meep` → `meep (1.0.6)`. Installing it
   (`pip install meep` dry-run) resolves to a real PyPI package — but its
   dependencies are `gitapi`/`hgapi`: this is a **namespace collision**, an
   unrelated git/hg release-automation tool, not the MIT electromagnetics
   FDTD engine `meepAdapter.mjs`/`meep_worker.py` expect. Installing it would
   satisfy `import meep` while providing zero FDTD capability — exactly the
   silent-fake result this repository's adapters are built to refuse, so it
   was **not** installed.
2. The real PyMeep is documented upstream as conda-forge only. `which conda
   mamba micromamba` found none of the three in this sandbox.
3. `docker info` confirmed no reachable Docker daemon here (client-only), so
   a conda-forge-based container could not be built or its reference case
   run from this environment either.

Given both the pip and conda paths are genuinely unavailable here, PyMeep is
classified `GENUINE_EXTERNAL_BLOCKER` / `BLOCKED_RUNTIME` — never `READY` —
in `railwayWorkerReadiness.mjs`. A documented, best-effort
`packages/backend/workers/pymeep/Dockerfile.proposal` (conda-forge miniforge
base, `conda install -c conda-forge pymeep=*=mpi_mpich_*`) is committed for
whoever next has Docker daemon access to actually build and validate. It is
named `.proposal`, not `Dockerfile`, specifically so nothing accidentally
treats it as a working, tested artifact — rename it to `Dockerfile` only
after a real build passes `meep_worker.py`'s reference case.

## 6. Shared-file patches from the worker-preparation branch

Status at `a6e5abb4`: Codex applied 6.1 and 6.3; 6.2 remains optional and
unapplied. The remote-dispatch branch's own shared-file changes are in §9.8.

### 6.1 Root `package.json` — add the readiness CLI script (applied)

```diff
     "engine-readiness": "node scripts/engine-readiness-report.mjs",
+    "railway-worker-readiness": "node scripts/railway-worker-readiness.mjs",
```

(The script itself, `scripts/railway-worker-readiness.mjs`, is already
committed on this branch — only the npm alias is missing.)

### 6.2 `packages/backend/src/api.mjs` — read-only readiness route (optional, safe)

Add next to the existing toolchain route (around line 245), reusing the new,
read-only `railwayWorkerReadiness.mjs` exactly the way `toolchain.mjs` is
already used two lines above:

```diff
     if (seg[1] === 'toolchain' && seg.length === 3 && method === 'GET') {
       const t = getTool(seg[2]);
       return t ? ok({ tool: t }) : err(404, 'not_found');
     }
+    // Railway worker readiness matrix (read-only; reuses the canonical toolchain).
+    if (seg[1] === 'railway-workers' && seg.length === 2 && method === 'GET') {
+      return ok(buildRailwayWorkerReadiness());
+    }
```

and add the import near the existing toolchain import:

```diff
 import { listToolchain, getTool } from './campaign/toolchain.mjs';
+import { buildRailwayWorkerReadiness } from './compute/railwayWorkerReadiness.mjs';
```

This route only exposes the matrix. The actual main-service → worker
execution path is not a proxy route; it is the canonical Virtual Lab
dispatch described in §9.

### 6.3 `RAILWAY_DEPLOY.md` — one new section (applied; §9.8 updates one paragraph)

Append, do not replace:

```markdown
## Scientific workers (optional, CPU-only)

Three additional Railway services can run heavier engines outside the main
web container: `packages/backend/workers/chem-light/Dockerfile` (PySCF +
Biopython), `packages/backend/workers/structural/Dockerfile` (OpenMM + Vina +
Meeko), and `packages/backend/workers/admet/Dockerfile` (ADMET-AI). Each
builds from the repository root, exposes `GET /health` and `GET /engines`,
and reports `GET /engines/<engineId>/reference-case`. Set `GENESIS_WORKER_GROUP`
(`chem-light` | `structural` | `admet`) per service; `PORT` is injected by
Railway. None is required for the main product to run — RDKit stays embedded
in the main image. See docs/RAILWAY_SCIENTIFIC_WORKERS.md for the full matrix
and the genuine PyMeep blocker.
```

## 7. Railway resource expectations (estimated, not Railway-measured)

No worker has actually run on Railway from this branch — these are estimates
from package sizes verified in this sandbox, not a Railway benchmark:

| Worker | Estimated image size | Suggested RAM | Suggested CPU |
| --- | --- | --- | --- |
| chem-light | ~400–600MB (python3-venv + pyscf + biopython + numpy/scipy) | 512MB–1GB | 1 vCPU |
| structural | ~700MB–1.1GB (adds rdkit + openmm's bundled CPU/OpenCL/CUDA shared libs, unused on CPU, + vina + meeko) | 1–2GB | 1–2 vCPU |
| admet | ~2–3GB (CPU-only torch ≈1.2GB verified here + chemprop + lightning + admet-ai bundled model weights) | 2–4GB (PyTorch model load observed to take several seconds even on CPU) | 1–2 vCPU |
| pymeep (proposal, untested) | ~1–2GB (miniforge + conda-forge pymeep + MPI runtime), unverified | unverified | unverified |

## 8. Genuine external blockers (deliverable R)

- **PyMeep** — see §5. No pip path exists; conda-forge path untested here for
  lack of conda and a reachable Docker daemon.
- **DepMap 24Q2 dataset** — the multi-file, hash-pinned CRISPR dataset
  (`CRISPRGeneEffect.csv`, `Model.csv`, two Achilles control files) is not
  committed in-repo (unlike the CMS `Zmumu.csv`, which is). An operator must
  set `GENESIS_DEPMAP_24Q2_DATA_DIR` to a copy matching the SHA-256 pins in
  `depmap_worker.py` before this capability leaves `DATA_REQUIRED`.
- **Real Docker build/run verification for the three real worker Dockerfiles**
  — written and reviewed against the proven root-Dockerfile pattern, but not
  actually `docker build`/`docker run`-tested from this sandbox (no daemon).

## 9. Remote scientific execution (`claude/genesis-railway-remote-dispatch`)

### 9.1 Flow, and what stays in the main service

```
Virtual Lab plan (planVirtualExperiment)
  → capability resolution      remoteScientificWorkerClient.routeCapability
  → local adapter | worker     executeVirtualExperimentDispatched
  → real engine execution      existing adapters (on the worker: via scientificCapabilityContract.executeCapability)
  → canonical ScienceRun       store.saveScienceRun            — main service only
  → derived result + class.    virtualLabClosedLoop.finalizeExecution — main service only, same code for both routes
  → Evidence proposal          api.mjs → knowledgeApi.proposeStructuredEvidence — main service only, propose-only
  → replay                     campaign/verify.mjs (unchanged) — main service only
  → next experiment            deriveNextVirtualAction
```

A worker executes one bounded computation and returns data. It never sees a
project, campaign, candidate id or hypothesis, never persists, never
classifies, and never touches Evidence or campaign state. No second Virtual
Lab, registry, ScienceRun store, Evidence ledger, replay engine or campaign
orchestrator exists.

| File | Role |
| --- | --- |
| `compute/scientificCapabilityContract.mjs` | The one contract: worker groups, dispatch states, strict per-capability input/result schemas, worker-side execution through existing adapters, shared ScienceRun builders |
| `compute/remoteScientificWorkerClient.mjs` | Provider-neutral client: config, routing, auth, timeout/abort, bounded reads, strict response validation, retries |
| `compute/workerServer.mjs` | + `POST /capabilities/:capabilityId/execute` (authenticated, idempotent) |
| `compute/workerEntrypoint.mjs` | passes `GENESIS_SCIENTIFIC_WORKER_TOKEN`; `WORKER_GROUPS` now lives in the contract |
| `campaign/virtualLabClosedLoop.mjs` | `executeVirtualExperimentDispatched`; `executeVirtualExperiment` refactored into shared prepare/execute/finalize steps with unchanged behaviour |
| `api.mjs` | the virtual-lab execute route awaits the dispatched entry point (§9.8) |

### 9.2 Execution contract (`WORKER_CONTRACT_VERSION` 1.0.0)

`POST /capabilities/:capabilityId/execute`, `Authorization: Bearer <GENESIS_SCIENTIFIC_WORKER_TOKEN>`:

```json
{ "contractVersion": "1.0.0", "executionId": "VEXP-…", "capabilityId": "quantum-chemistry",
  "inputFingerprint": "<sha256 of key-sorted {capabilityId, input}>", "input": { … } }
```

| Capability | Worker group | Engine | Strict input (no other field accepted) |
| --- | --- | --- | --- |
| `quantum-chemistry` | chem-light | PySCF | `smiles`, `method` ∈ RHF/UHF/RKS/UKS, `basis` ∈ 7 supported bases, `charge` −10…10, `forceField`, `atoms[1..60]{element,x,y,z}` — geometry embedded by the main service's RDKit (seeded ETKDG, deterministic) |
| `protein-structure-ingestion` | chem-light | Biopython | `pdbText` (20 … 2 000 000 chars) |
| `molecular-dynamics` | structural | OpenMM | `steps` 100 … 5000 (the adapter's bounded TIP3P reference) |
| `molecular-docking` | structural | AutoDock Vina + Meeko | `ligandSmiles`, `receptorSmiles` and/or `receptorPdbqt` (≤ 1 000 000 chars), optional `center[3]`, `boxSize[3]` 1…126 Å, `exhaustiveness` 1…32, `nPoses` 1…20, `seed` |
| `admet-estimation`, `toxicity-risk-estimation` | admet | ADMET-AI | `smiles` |

SMILES accept only the SMILES alphabet (≤ 500 chars; no leading `/`, no `..`).
Success response — exactly these keys, all verified by the client:

```json
{ "contractVersion", "ok": true, "executionId", "capabilityId", "toolId", "workerGroup",
  "inputFingerprint", "engine": { "toolId", "name", "version", "fingerprint" },
  "result": { …capability-specific, schema-checked… }, "outputFingerprint",
  "environmentFingerprint", "durationMs", "limitations", "idempotentReplay" }
```

The client rejects (`WORKER_RESPONSE_INVALID`) any extra or missing key, a
mismatched execution id / capability / tool / group / input fingerprint, an
engine name other than the capability's engine, an engine version the result
itself contradicts (PySCF `meta.engine`, Vina `vinaVersion`), a recomputed
output fingerprint that differs, a result outside its schema, and any
main-service-only key anywhere in the result (`epistemicClassification`,
`classification`, `derivedOutput`, `evidenceClass`, `evidence`, `claim`,
`clinicalEfficacy`, tenancy ids). Docking artifacts come back as
`{kind, sha256}` only — never a path on the worker's disk.

### 9.3 Environment variables

| Variable | Service | Meaning |
| --- | --- | --- |
| `GENESIS_CHEM_LIGHT_WORKER_URL` | main web/API | private URL of the chem-light worker, e.g. `http://genesis-worker-chem-light.railway.internal:8090` |
| `GENESIS_STRUCTURAL_WORKER_URL` | main web/API | private URL of the structural worker |
| `GENESIS_ADMET_WORKER_URL` | main web/API | private URL of the admet worker |
| `GENESIS_SCIENTIFIC_WORKER_TOKEN` | main **and** every worker | shared bearer secret, ≥ 32 characters (e.g. `openssl rand -hex 32`); shorter counts as not configured |
| `GENESIS_WORKER_GROUP` | each worker (existing) | `chem-light` \| `structural` \| `admet` |

A URL must be `https://…`, or `http://` only for `*.railway.internal`,
`localhost`, `127.0.0.1`, `[::1]`; URLs with credentials, a query or a
fragment are refused.

### 9.4 Routing rules

- `molecular-descriptors` (RDKit) is always LOCAL — embedded in the main image.
- `maxwell-fdtd` (PyMeep) has no remote contract: it stays `BLOCKED_UNBOUND_ENGINE`.
- A worker capability whose group URL variable is **unset** runs LOCAL,
  exactly as before. If its engine is not installed locally either, the
  persisted result is `BLOCKED_RUNTIME_UNAVAILABLE` with
  `dispatch.state = BLOCKED_WORKER_NOT_CONFIGURED` and a reason naming the
  variable to set.
- A worker capability whose group URL variable is **set** (even to an
  unusable value) runs REMOTE. A remote failure never falls back to a local
  or different engine; no capability currently permits a fallback.
- Every routed result records `dispatch.mode` (`LOCAL_EXECUTION` |
  `REMOTE_EXECUTION`) and the precise `dispatch.state`; the classic
  `executeVirtualExperiment` payload is unchanged.

### 9.5 Security behaviour

- Execution requires `Authorization: Bearer`; compared with `timingSafeEqual`
  over SHA-256 digests. A worker without a ≥ 32-character token refuses every
  execution (`503 WORKER_AUTH_NOT_CONFIGURED`) — it fails closed.
- Authentication happens before the body is read or any capability detail is
  revealed. `/health`, `/engines` and the reference-case route are unchanged
  (unauthenticated, no input, no secrets).
- Only a capability in the worker's fixed group allowlist runs
  (`404 CAPABILITY_NOT_IN_WORKER` otherwise); the envelope's `capabilityId`
  must equal the route's; the input must pass the strict schema and hash to
  the declared fingerprint. No command, module, executable or path can be
  expressed in the contract.
- The client never follows redirects (the token cannot be forwarded), bounds
  every response (8 MB, streamed), and aborts on a per-capability timeout.
- The token is a non-enumerable property of the client config: it is never
  serialized, logged, returned or described (`describeWorkerConfig` prints
  origins and `configured`/`missing`/`too_short` only). Every failure reason
  on both sides is path-redacted (`redact.mjs`) and token-scrubbed.
- Tenancy is enforced in the main service (`requireCampaignCandidate`, plan
  ownership) before dispatch; the wire request contains only scientific input.

### 9.6 Failure states and idempotency

| `dispatch.state` | Persisted as RESULT? | Result `status` | API | Retry |
| --- | --- | --- | --- | --- |
| `LOCAL_EXECUTION` / `REMOTE_EXECUTION` | yes (+1 ScienceRun) | `EXECUTED_COMPUTATIONAL_EXPERIMENT` | 201 | deduped |
| `BLOCKED_INVALID_INPUT` (params outside schema, worker 400/413/409) | yes | `BLOCKED_INVALID_INPUT` | 201 | deduped |
| `ENGINE_FAILED` (engine ran and failed) | yes | `FAILED_ENGINE` | 201 | deduped |
| `BLOCKED_ENGINE_UNAVAILABLE` (worker's engine failed its reference case) | yes | `BLOCKED_RUNTIME_UNAVAILABLE` | 201 | deduped |
| `BLOCKED_WORKER_NOT_CONFIGURED` — local route, no engine anywhere | yes | `BLOCKED_RUNTIME_UNAVAILABLE` | 201 | deduped |
| `BLOCKED_WORKER_NOT_CONFIGURED` — remote route, unusable URL/token | no — audit event only | — | 503 | allowed |
| `BLOCKED_WORKER_UNAVAILABLE` (unreachable, 5xx, auth rejected, misrouted) | no — audit event only | — | 503 | allowed |
| `WORKER_TIMEOUT` | no — audit event only | — | 503 | allowed |
| `WORKER_RESPONSE_INVALID` | no — audit event only | — | 503 | allowed |

Transport failures are recorded as `VIRTUAL_EXPERIMENT_DISPATCH_FAILED`
events, shown in the dossier (`dispatchFailures`, an `EXECUTION_BLOCKED`
timeline entry, `nextAction.reason = REMOTE_DISPATCH_FAILED_RETRYABLE`), and
never become a RESULT, so the same execution can still succeed later.

Idempotency, end to end:

- The execution id is the plan's deterministic `VEXP-<fingerprint>`; QM
  geometry is seeded, so a retry sends a byte-identical request.
- Worker: same execution id + same input fingerprint → the cached response
  with `idempotentReplay: true`, no second engine run (successes and
  deterministic engine failures are cached, 128 entries); same id + different
  input → `409 IDEMPOTENCY_CONFLICT`.
- Client: only transport failures are retried (once by default), with the
  same execution id; timeouts are not retried.
- Main service: concurrent calls for one execution share one in-flight
  dispatch; the RESULT check is repeated after the worker returns, and the
  ScienceRun + RESULT writes happen synchronously together, so a retry can
  never create a second ScienceRun. Evidence proposals are content-hashed
  (`knowledgeApi`) and links deduplicated on `(executionId, proposalId)`.

### 9.7 ScienceRun, Evidence and replay

- A remote run is persisted by the same `saveScienceRun` with the same
  scientific fields a local run of that capability produces — the parity
  tests compare engine, version, method, inputs, outputs, units, hashes and
  provenance for QM, docking and ADMET. Additions: `provenance.execution`
  (mode, worker group, contract version, execution id, input/output/
  environment/engine fingerprints); `environmentHash` and `durationMs` are
  the worker's (where the engine ran); docking artifacts are hash-only with
  `location: REMOTE_WORKER_EPHEMERAL` and an explicit warning.
- `selectedEngine.engineVersion` is the version the worker proved, not
  whatever is (not) installed in the main service.
- Classification (`evaluateExpectation` + the forbidden-promotion guard)
  runs once, in `finalizeExecution`, for both routes.
- Evidence stays propose-only through the existing api.mjs bridge.
- Replay is unchanged (`campaign/verify.mjs`): it re-executes locally from
  the persisted inputs. Where the main service has the engine, a remote run
  replays to `REPLAY_MATCH`; where it does not (the production topology),
  it reports `REPLAY_BLOCKED_BY_RUNTIME` — honest, never a fabricated MATCH.
  MD and protein runs remain `REPLAY_UNSUPPORTED`, as locally.

### 9.8 Shared files

**`packages/backend/src/api.mjs` (applied on this branch — the narrowest
change that makes the feature reachable).** The execute route now returns a
Promise, following the router's existing async precedent
(`/api/knowledge/ingest`; `server.mjs` awaits `handleApi`):

```diff
-  executeVirtualExperiment,
+  executeVirtualExperimentDispatched,
 …
-        const executed = executeVirtualExperiment(db, {
+        return executeVirtualExperimentDispatched(db, {
           campaignId, candidateId: body.candidateId, executionId: body.executionId, executedBy: user.id,
-        });
-        if (!executed.ok) return err(400, executed.error);
+        }).then((executed) => {
+          if (!executed.ok) return err(executed.retryable ? 503 : 400, executed.error, executed.reason);
           …unchanged Evidence bridge…
-        return ok({ result: executed.result, evidenceProposal, deduped: executed.deduped }, 201);
+          return ok({ result: executed.result, evidenceProposal, deduped: executed.deduped }, 201);
+        });
```

**`.env.example` (not modified here — add after the existing
`GENESIS_WORKER_GROUP=` block):**

```
# Prywatne workery naukowe Railway (główny serwis web/API). Ustaw URL grupy,
# aby jej zdolności wykonywały się zdalnie; puste = wykonanie lokalne jak dotąd.
# Dozwolone: https://… albo http:// wyłącznie dla *.railway.internal / loopback.
GENESIS_CHEM_LIGHT_WORKER_URL=
GENESIS_STRUCTURAL_WORKER_URL=
GENESIS_ADMET_WORKER_URL=
# Wspólny sekret (≥ 32 znaki) — ustaw identycznie w serwisie web/API i w każdym
# workerze. Nigdy nie commituj wartości.
GENESIS_SCIENTIFIC_WORKER_TOKEN=
```

**`RAILWAY_DEPLOY.md` (not modified here — replace the paragraph beginning
"Keep these services on Railway's private network" with):**

```markdown
Keep these services on Railway's private network and do not assign public
domains. Set the same `GENESIS_SCIENTIFIC_WORKER_TOKEN` (at least 32
characters) on the web/API service and on every worker. On the web/API
service, set `GENESIS_CHEM_LIGHT_WORKER_URL`, `GENESIS_STRUCTURAL_WORKER_URL`
and/or `GENESIS_ADMET_WORKER_URL` to each worker's private URL (for example
`http://<worker-service>.railway.internal:<PORT>`); the Virtual Lab then
executes those capabilities on the worker and still persists the ScienceRun,
classification, Evidence proposal and replay in the main service. A group
whose URL is unset keeps running locally. RDKit and the checksum-pinned CMS
Open Data analysis remain embedded in the main service. A worker counts as
ready only after a real execution succeeds inside its Railway container.
Run `npm run railway-worker-readiness` for the honest local-reference matrix.
See `docs/RAILWAY_SCIENTIFIC_WORKERS.md` §9 for the execution contract.
```

### 9.9 Remaining Railway deployment work (not done here, not claimed)

No worker has run on Railway. Before any worker may be called READY:

1. `docker build` each of `workers/chem-light`, `workers/structural`,
   `workers/admet` from the repository root (never done in this sandbox — no
   Docker daemon) and fix anything the build surfaces.
2. Create three private Railway services from those Dockerfiles; no public
   domain; set `GENESIS_WORKER_GROUP` and `GENESIS_SCIENTIFIC_WORKER_TOKEN`;
   size them per §7 (admet needs the most memory).
3. On the web/API service set the three worker URLs (private
   `*.railway.internal` hostnames and the worker's `PORT`) and the same token.
4. From inside the web/API service, confirm `GET <worker>/health` shows
   `executionAuth: "configured"` and the expected `executableCapabilities`.
5. Run one real Virtual Lab experiment per capability through the deployed
   API and check: `dispatch.mode = REMOTE_EXECUTION`, one ScienceRun, one
   Evidence proposal, and the expected replay status. Only then is that
   worker ready.
6. Measure real image size, cold-start and per-capability latency on
   Railway; the §7 figures are estimates. If ADMET-AI's model load exceeds
   the 150 s client ceiling on Railway CPUs, raise that capability's timeout
   rather than retrying.
7. Optional follow-up (not required for correctness): make
   `campaign/multiFidelity.mjs` build its QM/docking/ADMET ScienceRuns via
   `buildScienceRunRecord`, removing the remaining duplicated record shape
   (currently guarded by the parity tests).
