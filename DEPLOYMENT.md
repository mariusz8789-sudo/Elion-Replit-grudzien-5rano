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

## Persistence & backups
- Storage is a **single SQLite file** with WAL enabled (`node:sqlite`).
- **There is no backup, replication, or checkpoint-tuning strategy** — the `genesis.db`
  file is a single point of failure. For any real deployment: put it on a durable volume and
  add scheduled file-level backups (WAL-aware) or migrate to a networked DB.
- Product data for Assistant/Compare/Campaigns is **client-side `localStorage`**, not in the
  server DB — it does not survive a browser/device change and is not backed up. See
  KNOWN_LIMITATIONS.md §3.

## RDKit / compute engines
RDKit (and optionally ADMET-AI, AutoDock Vina) must be installed in the runtime
(`requirements-compute.txt`, `GENESIS_PYTHON`). If absent, compute endpoints return
`BLOCKED_BY_RUNTIME` — the app stays up and honest rather than fabricating.

---

## Production readiness — remaining blockers (be honest with yourself)
**Resolved (Stage 8 + Genesis 2.0):** unauthenticated compute (now auth-gated), proxy-aware
rate limiting, hashed credential storage, crash handlers, per-account login lockout, CORS for
the public API, transactional key regeneration. See SECURITY.md.

**Still blocking a public, multi-tenant launch:**

1. **Blocking event loop** (sync SQLite + sync compute). Fine for a pilot / low concurrency;
   a hard ceiling for scale — needs a worker pool / async queue (major redesign — deferred).
2. **In-process jobs, no orphan recovery** (same execution refactor).
3. **No DB backup/disaster-recovery plan** — the single `genesis.db` (WAL) is a SPOF. Ops
   task: durable volume + scheduled WAL-aware file backups (e.g. checkpoint then copy), or
   migrate the `store.mjs` boundary to a networked DB.
4. **No metrics/tracing/request-IDs** — logging is ad-hoc JSON to stdout.
5. **Server-side campaign persistence** — campaigns are still browser-local (a new subsystem,
   deliberately deferred; not a security blocker but a commercial one). See FUTURE_WORK.md.

**Recommended posture today:** single-tenant or trusted-pilot deployment behind your own
auth/proxy, with the DB on a backed-up volume. Not yet a hardened public SaaS.
