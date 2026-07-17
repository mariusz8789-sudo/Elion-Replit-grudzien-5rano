# Genesis OS — Deployment Runbook (v1.0)

Production deployment of Genesis OS. The runtime is a single Node ≥ 22 process
(`packages/backend/src/server.mjs`) that (1) serves the built frontend PWA and (2) exposes the
JSON API. There is no external database dependency — persistence uses the built-in `node:sqlite`.

## Runtime requirements

- **Node.js ≥ 22** (uses `node:sqlite`, global `fetch`). Node 22 is what the Docker image and CI use.
- Optional **Python 3.11+** with **RDKit** + **ADMET-AI** on `PATH` for the real scientific engines.
  Without them the platform runs fully; affected capabilities report `BLOCKED_BY_RUNTIME` honestly.
- A writable directory for the SQLite file (or `:memory:` for stateless/ephemeral deployments).

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | HTTP listen port. `0` = ephemeral (tests). |
| `ANTHROPIC_API_KEY` | *(unset)* | Enables the AI Narrator (`/api/ask`). Unset ⇒ `ai: "no-key"`, `/api/ask` returns `503` — the rest of the platform is unaffected. The key never leaves the server. |
| `GENESIS_AI_MODEL` | `claude-opus-4-8` | Narrator model id. |
| `GENESIS_DB_PATH` | `packages/backend/data/genesis.db` | SQLite path. `:memory:` for no persistence. Put on a **persistent volume** for a stateful deployment. |
| `GENESIS_STATIC_DIR` | `packages/frontend/dist` | Built PWA to serve. |
| `GENESIS_KNOWLEDGE_DIR` | `knowledge/` | Narrator grounding corpus (loaded once at boot). |

## Build

```bash
npm ci
npm run build            # builds the frontend into packages/frontend/dist
npm run compute:bundle   # (re)generate the shared compute bundle if core/compute changed
```

## Run (production)

```bash
NODE_ENV=production PORT=8080 GENESIS_DB_PATH=/data/genesis.db \
  node packages/backend/src/server.mjs
```

The server logs a single structured JSON line per event (`started`, `ask`, `shutdown`, errors),
suitable for log shippers. It handles `SIGTERM`/`SIGINT` with graceful shutdown (safe for autoscale).

## Docker

The repository ships a production multi-stage `Dockerfile` (build in full Node, run on slim without
devDependencies) and a `docker-compose.yml`.

```bash
docker compose up --build          # or:
docker build -t genesis-os .
docker run -p 8080:8080 -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  -v genesis-data:/app/packages/backend/data genesis-os
```

- Runs as non-root (`USER node`), `EXPOSE 8080`.
- Built-in `HEALTHCHECK` polls `/api/health`.
- Mount a volume at `packages/backend/data` (or set `GENESIS_DB_PATH` to a mounted path) to persist
  projects, campaigns, and failure memory across restarts.

## Replit

`.replit` starts the dev workflow (`npm run dev`, Vite on port 5000) for iteration. For a **deployed**
Replit, run the production server instead so the API + built PWA are served together:

```bash
npm ci && npm run build
PORT=8080 node packages/backend/src/server.mjs
```

Set `ANTHROPIC_API_KEY` as a Replit Secret to enable the Narrator. Replit egress is open by default,
which also enables the network campaign acquisition path (see `OPERATOR_GUIDE.md`).

## Health, readiness, monitoring

- **Liveness / readiness**: `GET /api/health` → `200` with `{ ok, version, persistence, ai, static }`.
  Treat `persistence: "unavailable"` as degraded (project APIs return `503`) but still live.
- **Rate limits**: `/api/ask` 10/min per IP; persistence 60/min per IP (in-memory, auto-cleaned).
- **Sessions**: expired sessions are purged hourly; no action needed.

## Persistence & backup

- Schema is versioned via `PRAGMA user_version` and migrates **additively** on boot
  (currently v27 — v27 adds Scientific Version Control: `campaign_members`,
  `campaign_snapshots`, `campaign_comments`; see `docs/SCIENTIFIC_VERSION_CONTROL.md`).
  No new environment variables or configuration are required for this feature — it reuses
  the existing `GENESIS_DB_PATH` database and existing auth/session infrastructure.
- Back up by copying the SQLite file while the process is quiescent, or use `sqlite3 .backup`.
- The schema is portable to Postgres if a managed DB is later required (no code path assumes SQLite
  internals beyond the store layer).

## Scaling notes

- The process is stateless apart from the SQLite file and in-memory rate limiters. For horizontal
  scale, either (a) run a single instance with a persistent volume, or (b) migrate the store layer to
  a shared DB (Postgres) — the store module is the only seam that must change.
- Heavy scientific engines (RDKit/ADMET/docking/QM) run as short-lived Python subprocesses; size the
  host for those bursts if campaigns run server-side. CPU/RAM contention (not correctness) is the
  limiting factor.

## Security posture

- Bearer-token auth; project-scoped RBAC; non-member ⇒ 404 (no existence leak).
- Security headers on every response; path-traversal-safe static serving; request-size caps.
- The Anthropic key is server-only. See `SECURITY.md` for the full posture and disclosure policy.
