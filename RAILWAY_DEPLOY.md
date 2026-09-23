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
