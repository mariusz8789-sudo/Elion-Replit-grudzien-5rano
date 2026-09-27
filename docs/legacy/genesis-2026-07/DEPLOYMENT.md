# Deployment

Genesis deploys as a **single origin**: the Node backend (`packages/backend`) serves the
built frontend static bundle and the `/api` routes on one port. Node **22+ required**
(`node:sqlite`).

---

## Build & run
```bash
npm ci
npm run build                         # tsc -b + vite build → packages/frontend/dist
node packages/backend/src/server.mjs  # serves dist + /api on PORT (default 8080)
```
Health check: `GET /api/health` → `{ ok, version, static, persistence, ... }`.

## Container
- `Dockerfile` — multi-stage, non-root `USER node`, `HEALTHCHECK` on `/api/health`, port
  8080.
- `docker-compose.yml`, `deploy/genesis-k8s.yaml`, `.replit` (`deploymentTarget =
  "autoscale"`).
- `.dockerignore` present.

## Configuration (`.env.example`)
| Var | Purpose |
|-----|---------|
| `PORT` | HTTP port (default 8080) |
| `GENESIS_DB_PATH` | SQLite file path; `:memory:` for ephemeral (data lost on restart). **Set to a persistent volume in production.** |
| `GENESIS_STATIC_DIR` | Static build dir (defaults to `../../frontend/dist`) |
| `ANTHROPIC_API_KEY` | Optional — enables "Ask AI"; without it the app runs fully with an honest "AI unavailable" message |
| `GENESIS_AI_MODEL` | AI model (default `claude-opus-4-8`) |
| `GROUNDING_ENABLED` | `false` (default) → AI pass-through; `true` → grounded (see GROUNDING.md) |
| `GENESIS_TRUST_PROXY` | `true` only behind a trusted reverse proxy — then the rate limiter reads the real client IP from `X-Forwarded-For` (spoof-safe otherwise). Default `false`. |
| `GENESIS_CORS_ORIGINS` | Comma-separated allowlist (or `*`) enabling CORS on the public `/api/v1`. Empty (default) = CORS off, same-origin only. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `BILLING_SUCCESS_URL`, `BILLING_CANCEL_URL` | Stripe billing; without them `/api/billing/*` returns `503 billing_not_configured` and the rest of the app is unaffected |

## CI/CD
`.github/workflows/ci.yml` (single `verify` job, Node 22): `npm ci` → lint → test → build →
uploads `dist` artifact. **No separate deploy workflow** — deployment is manual/container.

## Persistence & backups (Genesis 2.1)
- Storage is a **single SQLite file** with WAL enabled (`node:sqlite`). Put it on a **durable
  volume** in production (`GENESIS_DB_PATH`).
- **Automatic backups** (Part 3): set `GENESIS_BACKUP_DIR` to enable periodic `VACUUM INTO`
  snapshots (consistent, non-blocking) with rotation (`GENESIS_BACKUP_KEEP`, default 7;
  `GENESIS_BACKUP_INTERVAL_MS`, default 6 h). Manual: `npm run backup`.
- **Research Campaigns now persist server-side** (Part 2, `user_campaigns` table, per-owner)
  — they survive logout, restart, and a new device. The Assistant analysis history remains
  client-side `localStorage` (a per-browser convenience cache). See KNOWN_LIMITATIONS.md §3.

### Disaster recovery procedure (tested)
Verified live: create data → backup → destroy DB → restore → all rows recovered.
1. **Backups** run automatically (if `GENESIS_BACKUP_DIR` set) or on demand:
   `GENESIS_DB_PATH=… GENESIS_BACKUP_DIR=… npm run backup` → writes `genesis-<ts>.db`.
2. **Restore:** stop the server, then
   `GENESIS_DB_PATH=… GENESIS_BACKUP_DIR=… npm run restore [backup-file]`
   (defaults to the newest snapshot). It backs up the current DB to `*.pre-restore`, removes
   stale `-wal`/`-shm`, copies the snapshot into place, and validates it opens + reports the
   user count. Restart the server.
3. **RPO/RTO:** RPO = backup interval (default 6 h — lower `GENESIS_BACKUP_INTERVAL_MS` for
   tighter). RTO = seconds (a file copy + restart). For near-zero RPO, migrate the `store.mjs`
   boundary to a replicated/networked DB (future work).

## Async execution (Part 1)
`ASYNC_EXECUTION=false` (default) keeps the original synchronous compute path untouched.
`ASYNC_EXECUTION=true` routes heavy RDKit work (`laboratory-readiness`, `molecule/render`)
to a persistent worker-thread pool (`GENESIS_WORKER_POOL_SIZE`, default `min(4, cores-1)`),
so the event loop stays responsive under load. Verified live: with the flag on, `/api/health`
answered in ~1 ms while 6 heavy analyses ran concurrently. RDKit logic is unchanged.

## Monitoring (Part 4)
- `GET /api/health` — liveness + version + `asyncExecution` + CPU load + memory.
- `GET /api/metrics` — CPU (cores/load), memory (rss/heap/host), and request counters
  (total, errors, by-status, **average response time**).
- Every response carries an `X-Request-Id` (echoed from the client's if provided); each
  `/api/*` request logs `{reqId, method, path, status, ms}` as structured JSON to stdout.

## RDKit / compute engines
RDKit (and optionally ADMET-AI, AutoDock Vina) must be installed in the runtime
(`requirements-compute.txt`, `GENESIS_PYTHON`). If absent, compute endpoints return
`BLOCKED_BY_RUNTIME` — the app stays up and honest rather than fabricating.

---

## Production readiness — remaining blockers (be honest with yourself)
**Resolved (Stage 8 + Genesis 2.0):** unauthenticated compute (now auth-gated), proxy-aware
rate limiting, hashed credential storage, crash handlers, per-account login lockout, CORS for
the public API, transactional key regeneration. See SECURITY.md.

**Resolved in Genesis 2.1:** blocking event loop (flag-gated async worker pool, verified
non-blocking), DB backup/disaster-recovery (automatic + tested restore), server-side campaign
persistence (survives restart/new device), monitoring (health/metrics/request-IDs).

**Still open before a public, multi-tenant launch:**

1. **Async execution is flag-gated (`ASYNC_EXECUTION`), off by default.** Turn it on in
   production and load-test it; the sync path remains the default until then.
2. **SQLite is still single-node.** Backups + DR are in place, but true HA needs a
   replicated/networked DB (migrate the `store.mjs` boundary — future work).
3. **In-process background jobs** (the cognitive campaign runner) still lack orphan recovery
   after a crash (separate from the RDKit pool).
4. **Team accounts** for shared campaigns are an **open question** (see KNOWN_LIMITATIONS.md)
   — the persistence layer is per-owner; sharing needs a membership/permission model.
5. **Metrics are in-process counters** (reset on restart, per-instance) — wire to an external
   metrics system for multi-instance/history.

**Recommended posture today:** single-tenant or trusted-pilot deployment behind your own
auth/proxy, with the DB on a backed-up volume. Not yet a hardened public SaaS.
