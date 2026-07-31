# Genesis OS — HTTP API Reference (v1.0)

Complete reference for the Genesis OS backend HTTP API. The router is the single pure function
`handleApi(db, ctx)` in `packages/backend/src/api.mjs`; `server.mjs` reads the request body + the
`Authorization` header and delegates. Everything below is enforced (auth, RBAC, validation), not
aspirational.

## Conventions

- **Base**: all endpoints are under `/api`. Bodies and responses are `application/json; charset=utf-8`.
- **Auth**: `Authorization: Bearer <token>` where `<token>` comes from `POST /api/auth/register`
  or `POST /api/auth/login`. Endpoints below are marked **public** or **auth**.
- **RBAC** (project = tenant): roles are ordered `viewer < editor < admin < owner`. A caller who is
  not a member of a project receives **404** (existence is never leaked), not 403.
- **Status codes**: `200` ok · `201` created (verification) · `202` accepted (async job queued) ·
  `400` bad input · `401` no/invalid token · `403` role too low · `404` not found / not a member ·
  `405` method not allowed · `409` state conflict · `429` rate limited · `500` internal · `503`
  capability/persistence unavailable.
- **Rate limits** (per IP): `/api/ask` 10/min; all persistence endpoints 60/min.
- **Body size**: `/api/ask` 16 KB; persistence endpoints 64 KB.

---

## System

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | public | Liveness + capability snapshot (see below). |
| POST | `/api/ask` | public* | AI Narrator proxy (Anthropic). `503 ai_unavailable` when `ANTHROPIC_API_KEY` is unset. |

`GET /api/health` →
```json
{ "ok": true, "version": "1.0.0", "uptimeSec": 12, "ai": "ready|no-key",
  "model": "claude-opus-4-8|null", "static": true, "knowledgeLabs": 15,
  "persistence": "ready|unavailable" }
```
This is the single source of truth the frontend `MissionStatusBar` renders — no invented numbers.

---

## Auth  `/api/auth`

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/api/auth/register` | public | `{ email, password, displayName }` | `{ user, token }` (validates registration) |
| POST | `/api/auth/login` | public | `{ email, password }` | `{ user, token }` or `401` |
| POST | `/api/auth/logout` | auth | — | `{ ok: true }` (revokes the session) |
| GET | `/api/auth/me` | auth | — | `{ user }` or `401` |

Passwords are hashed (`auth.mjs` `hashPassword`/`verifyPassword`); tokens are opaque session tokens
with server-side expiry (purged hourly).

---

## Compute engine  `/api/compute` (public, read-mostly)

| Method | Path | Description |
|---|---|---|
| GET | `/api/compute/capabilities` | List capability descriptors with runtime `status` (`AVAILABLE` / `BLOCKED_BY_RUNTIME` / `NOT_IMPLEMENTED`). |
| GET | `/api/compute/models` | List deterministic public compute models. |
| GET | `/api/compute/models/:id` | Model metadata, or `404`. |
| POST | `/api/compute/run` | Run a model: `{ modelId, inputs }` → `{ run, persisted }`. Persisted iff a valid token is attached. |
| GET | `/api/compute/toolchain` | Toolchain registry — engine statuses established by **real** runtime validation. |
| GET | `/api/compute/toolchain/:id` | One tool, or `404`. |
| GET | `/api/compute/environment` | Runtime scientific-environment audit (real probe + persistence). |
| GET | `/api/compute/admet/endpoints` | Catalogue of the 52 ADMET-AI endpoints (category, task type, published TDC metric). `503 BLOCKED_BY_RUNTIME` if ADMET-AI is not installed. |

Capability honesty: a capability is `AVAILABLE` only if the platform has a verified engine. Unknown
⇒ `false` ⇒ an honest capability gap (WARN in the Truth Engine), never a fabricated GO.

---

## Projects  `/api/projects` (auth; RBAC per project)

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/projects` | auth | Projects the caller belongs to. |
| POST | `/api/projects` | auth | Create project (caller becomes `owner`): `{ name, description }`. |
| GET | `/api/projects/:id` | viewer | `{ project: { …, role } }`. |
| GET/POST | `/api/projects/:id/members` | GET viewer / POST admin | List / add-or-update a member `{ email, role }`. |
| GET/POST | `/api/projects/:id/branches` | GET viewer / POST editor | Hypothesis branches (fork/main). |
| GET | `/api/projects/:id/contributions` | viewer | Contribution graph. |
| GET | `/api/projects/:id/runs` | viewer | Auditable compute runs for the project. |
| GET/POST | `/api/projects/:id/trials` | GET viewer / POST editor | Experiment trials. Query: `experimentId`, `branchId`. |
| PATCH/DELETE | `/api/projects/:id/trials/:tid` | editor | Update / delete a trial. |

### Drug discovery
| Method | Path | Role | Description |
|---|---|---|---|
| GET/POST | `/api/projects/:id/targets` | GET viewer / POST editor | Targets. |
| GET/POST | `/api/projects/:id/candidates` | GET viewer / POST editor | Candidates. Query: `targetId`. |
| GET | `/api/projects/:id/candidates/ranking` | viewer | Deterministic ranking of candidate passports. Query: `targetId`. |
| GET | `/api/projects/:id/candidates/:cid/passport` | viewer | Candidate passport (evidence + provenance). |

### Compute jobs (async)
| Method | Path | Role | Description |
|---|---|---|---|
| GET/POST | `/api/projects/:id/jobs` | GET viewer / POST editor | List / enqueue a job. |
| GET | `/api/projects/:id/jobs/:jid` | viewer | Job status. |
| POST | `/api/projects/:id/jobs/:jid/cancel` | editor | Cancel a running job (`409` if already finished). |

### Merge requests
| Method | Path | Role | Description |
|---|---|---|---|
| GET/POST | `/api/projects/:id/merge-requests` | GET viewer / POST editor | List / open a merge request. |
| GET | `/api/projects/:id/merge-requests/:mrid` | viewer | One merge request. |
| POST | `/api/projects/:id/merge-requests/:mrid/decide` | editor | Approve/reject `{ decision }`. |

### Scientific campaigns (Acceleration Engine)
| Method | Path | Role | Description |
|---|---|---|---|
| GET/POST | `/api/projects/:id/campaigns` | GET viewer / POST editor | List / create a campaign. |
| GET | `/api/projects/:id/campaigns/:cid` | viewer | Inspect campaign (status, generations). |
| POST | `/api/projects/:id/campaigns/:cid/start` | editor | Enqueue the real orchestrator → `202 { campaign, jobId }`. `409` unless `created`/`cancelled`. |
| POST | `/api/projects/:id/campaigns/:cid/cancel` | editor | Cancel (`stopReason: CANCELLED_BY_USER`). |
| POST | `/api/projects/:id/campaigns/:cid/stage` | editor | Queue a heavy multi-fidelity stage (docking/QM) → `202 { jobId }`. `409` unless base campaign `completed`. |
| GET | `/api/projects/:id/campaigns/:cid/candidates` | viewer | Candidates. Query: `generation`. |
| GET | `/api/projects/:id/campaigns/:cid/decisions` | viewer | Decision log. |
| GET | `/api/projects/:id/campaigns/:cid/events` | viewer | Append-only event log. |
| GET | `/api/projects/:id/campaigns/:cid/graph` | viewer | Discovery graph. |
| GET | `/api/projects/:id/campaigns/:cid/why` | viewer | Decision rationale (`why.mjs`). Query params passed through. |
| GET | `/api/projects/:id/campaigns/:cid/conflicts` | viewer | MCRE `MODEL_CONFLICT` events. |
| GET | `/api/projects/:id/campaigns/:cid/science-runs` | viewer | Real engine runs with artifacts + SHA-256. |
| GET | `/api/projects/:id/campaigns/:cid/science-runs/:rid` | viewer | One science run. |
| POST | `/api/projects/:id/campaigns/:cid/science-runs/:rid/verify` | editor | Replay the real engine → `201 { verification }` (costs real compute). |
| GET | `/api/projects/:id/campaigns/:cid/science-runs/:rid/verifications` | viewer | Verification history. |

### Truth Engine / R&D Kill-Switch
| Method | Path | Role | Description |
|---|---|---|---|
| GET/POST | `/api/projects/:id/truth-analyses` | GET viewer / POST editor | List / run a real Truth Engine analysis → decision (`GO`/`WARN`/`BLOCK`/`INSUFFICIENT_DATA`) + hashed certificate. |
| GET | `/api/projects/:id/truth-analyses/:aid` | viewer | Stored analysis (tenant-isolated). |
| GET | `/api/projects/:id/truth-analyses/:aid/certificate` | viewer | Reproducible decision certificate (hash). |
| GET | `/api/projects/:id/truth-analyses/:aid/report` | viewer | Pilot report. |
| GET | `/api/projects/:id/truth-analyses/compare?a=ID&b=ID` | viewer | Compare two analyses. |

### Autonomous Discovery Forge
| Method | Path | Role | Description |
|---|---|---|---|
| GET/POST | `/api/projects/:id/discovery-campaigns` | GET viewer / POST editor | List / run a real closed-loop discovery campaign. |
| GET | `/api/projects/:id/discovery-campaigns/:cid` | viewer | Campaign summary. |
| GET | `/api/projects/:id/discovery-campaigns/:cid/dossier` | viewer | Discovery dossier (includes `didGenesisDiscoverADrug`). |

### Necropolis (tenant failure memory)
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/projects/:id/necropolis` | viewer | Accumulated failure-region stats. |
| POST | `/api/projects/:id/necropolis/failures` | editor | Record a failure region. |
| GET | `/api/projects/:id/necropolis/export` | **admin** | Export the failure-memory artifact (SHA-256). |
| POST | `/api/projects/:id/necropolis/import` | **admin** | Import a failure-memory artifact `{ artifact }`. |

---

## Error shape

All errors return `{ "error": "<code>", "message"?: "<human message>" }`. Codes are stable strings
(e.g. `unauthorized`, `forbidden`, `not_found`, `method_not_allowed`, `already_started`,
`campaign_not_completed`, `rate_limited`, `persistence_unavailable`).

## Security headers

Every response (API and static) carries the `SECURITY_HEADERS` set (CSP, X-Frame-Options,
Permissions-Policy, …) from `lib.mjs`. Static assets are served with path-traversal-safe resolution
and Vite hashed-asset immutable caching.
