# Railway staging deployment

The supported first staging topology is one Railway service built from the
repository `Dockerfile`, plus one persistent Railway Volume mounted at `/data`.
It intentionally ships the full Genesis UI/API and one real campaign engine
(RDKit). It also ships the checksum-pinned CMS Open Data Z→μμ analysis. Heavy
optional scientific engines remain honestly blocked until they have their own
measured worker image and a canonical remote-dispatch binding.

See [`docs/GENESIS_RAILWAY_STAGING.md`](docs/GENESIS_RAILWAY_STAGING.md) for the
audited engine matrix, persistence plan, risks, and future worker split.

## Railway UI steps

1. Create a **staging** environment/project and add a service from this GitHub
   repository. Select the reviewed integration branch; do not select `main`
   until the staging commit has been accepted.
2. Keep the repository root as the service root. Railway detects the root
   `Dockerfile`; do not add a Railpack build/start override.
3. Add a Railway Volume to the service and mount it at `/data`.
4. Set these non-secret variables:
   - `GENESIS_DB_PATH=/data/genesis.db`
   - `GENESIS_LEDGER_PATH=/data/evidence-ledger.json`
   - `GENESIS_ARTIFACT_DIR=/data/artifacts`
   - `GENESIS_BACKUP_DIR=/data/backups`
   - `GENESIS_AI_MODEL=claude-opus-4-8` only if the optional Anthropic guide is enabled.
5. Add `ANTHROPIC_API_KEY` as a sealed secret only if AI narration and LLM
   world proposals are required. Genesis and the scientific runtime work
   without it; `/api/ask` and `/api/world-proposal` return an honest 503.
6. Leave `PORT`, `GENESIS_RDKIT_PYTHON`, `GENESIS_STATIC_DIR`,
   `RAILWAY_GIT_COMMIT_SHA`, and `RAILWAY_RUN_UID` unset. Railway supplies
   `PORT` and the Git SHA; the image configures RDKit and safely handles volume
   permissions before dropping to the `node` user.
7. In service settings set the healthcheck path to `/api/health`, timeout to
   180 seconds, restart policy `ON_FAILURE`, and enable a public HTTPS domain.
8. Enable scheduled backups for the `/data` volume. Perform a restore drill
   before treating the staging data as recoverable.
9. Deploy the selected integration commit. Confirm `/api/health` reports the
   expected 40-character commit, `static: true`, `db.ok: true`,
   `db.persistent: true`, and RDKit `AVAILABLE`.
10. From a trusted workstation run:

```powershell
$env:GENESIS_STAGING_BASE_URL='https://<your-railway-domain>'
npm run staging:verify
```

The verifier is read-only. It checks release identity, durable SQLite, path
redaction, a real RDKit aspirin calculation, and the real checksum-pinned CMS
Open Data path. A mutating Virtual Lab plan→execute→Evidence→replay journey is
then run with the existing Chromium/API E2E against the staging URL.

Do not deploy automatically from this document. Linking the Railway project,
adding the volume/domain, setting secrets, and triggering the first staging
deployment remain operator actions.

## Scientific workers (optional, CPU-only)

Three additional private Railway services can isolate heavier engines from the
public web/API service:

- `packages/backend/workers/chem-light/Dockerfile` — PySCF + Biopython
- `packages/backend/workers/structural/Dockerfile` — OpenMM + Vina + Meeko
- `packages/backend/workers/admet/Dockerfile` — ADMET-AI

Each image builds from the repository root and exposes `GET /health`,
`GET /engines`, and `POST /engines/<engineId>/reference-case`. Set
`GENESIS_WORKER_GROUP` to `chem-light`, `structural`, or `admet`; Railway
injects `PORT`.

Keep these services on Railway's private network and do not assign public
domains. The current campaign runtime still executes scientific adapters in
process, so these workers are deployment-ready isolation targets and health
probes, not a claimed remote Virtual Lab dispatch path. RDKit and the
checksum-pinned CMS Open Data analysis remain embedded in the main service.
Run `npm run railway-worker-readiness` for the honest local-reference matrix.
See `docs/RAILWAY_SCIENTIFIC_WORKERS.md` for dependency pins, resource
estimates, the untested PyMeep proposal, and remaining external blockers.

Before creating Railway worker services, manually run the GitHub Actions
workflow **Railway scientific workers — real container gate** on the exact
candidate commit. It builds and starts all three pinned images and requires a
real `AVAILABLE` reference result from every provisioned engine. The workflow
is deliberately `workflow_dispatch` only because ADMET's CPU image is several
gigabytes; it does not consume CI resources on every source commit.
