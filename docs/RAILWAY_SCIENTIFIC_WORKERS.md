# Railway scientific workers — preparation (2026-09-23)

This document is the reference for `claude/genesis-railway-scientific-workers`.
It covers every heavy scientific engine in the canonical registry
(`packages/backend/src/campaign/toolchain.mjs`) plus the two non-toolchain,
stdlib-only data adapters, the worker grouping decision, the new HTTP seam,
and the exact patches Codex must apply to files this branch does not touch
(root `Dockerfile`, root `package.json`, `RAILWAY_DEPLOY.md`, `api.mjs`).

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
`createWorkerServer({ workerGroup, engineIds })`, a small `node:http` server
with three routes, built entirely from the existing registry:

- `GET /health` — `{ ok, workerGroup, engineIds, uptimeSeconds, node }`.
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
  `server.setTimeout(150_000)` (a genuine Node HTTP socket timeout) as an
  outer bound at the transport layer.
- **Resource limits**: every adapter's subprocess call already caps
  `maxBuffer` (4MB); the HTTP layer adds `MAX_RESPONSE_BYTES` (8MB) and
  `MAX_BODY_BYTES` (64KB) so a malformed or oversized request/response can
  never reach an adapter or leave the process uncapped.
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
  file path, or module name from the request. The only free variable is
  `toolId`, matched against a fixed, per-worker allowlist validated at
  server-construction time against the canonical registry.

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

## 6. Exact patches Codex must apply in shared files

This branch does not modify the root `Dockerfile`, root `package.json`,
`RAILWAY_DEPLOY.md`, `.env.example`, or `api.mjs`. The following are the
exact, minimal diffs Codex should apply there when integrating:

### 6.1 Root `package.json` — add the readiness CLI script

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

This is intentionally the only `api.mjs` change proposed. It exposes the
matrix, not a proxy to the worker containers — wiring a real
`GENESIS_STRUCTURAL_WORKER_URL`-style HTTP proxy from the main service to
each Railway worker service is a deployment-topology decision (worker
service URLs, auth between services, retry policy) that belongs to whoever
is standing up the actual Railway services, so it is deliberately left
undecided here rather than guessed.

### 6.3 `RAILWAY_DEPLOY.md` — one new section (not a rewrite)

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
