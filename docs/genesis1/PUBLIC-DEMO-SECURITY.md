# PUBLIC-DEMO SECURITY — what a visitor can see

**Date:** 2026-10-04. **Branch:** `g1/demo-security`. **Decision:** D-168.
**Scope:** everything a person who is not the operator can reach — the unauthenticated API,
the built frontend, every tracked file that ships with the repository, and the frames a
screenshot or an Evidence Pack can carry.

## Verdict today: **GREEN**

Green means exactly this and nothing more: the standing gate
(`packages/backend/src/publicDemoSecurityGate.test.mjs`, 12 tests, ~3.5 s) passes on this
branch, every finding below is either fixed or recorded as a known open item with its
severity, and **no secret, real or expired, was found committed anywhere in the working tree**.

Green is not "nothing is open". Four items in *Still open* below are real and unfixed;
none of them is a credential leak, and each is a product decision rather than a bug.

---

## What was checked

| Surface | How |
|---|---|
| Secrets in the working tree | Pattern scan over every tracked file: AWS key ids, PEM private-key headers, GitHub/GitLab/Slack tokens, Google API keys, Anthropic/OpenAI keys, Google OAuth tokens, SendGrid keys, JWTs, literal bearer tokens, URL-embedded credentials |
| Tracked `.env*` files | Only `.env.example` is tracked; every credential variable in it is empty; `.env` is in `.gitignore` |
| Worker credentials | `GENESIS_WORKER_TOKEN`, `GENESIS_SCIENTIFIC_WORKER_TOKEN` — never committed with a value, never in a response, never rendered |
| The API route table | Every family `api.mjs` routes **before** its single `getUserByToken` gate was driven unauthenticated through the real router and the response body scanned |
| Debug / diagnostic endpoints | `/api/health`, `/api/genesis/self`, `/api/system/telemetry`, `/api/compute/environment`, `/api/security/dependency-audit`, `/api/worker/v1/*` |
| Stack traces and internal paths | Scanned in responses, in the production bundle, and in every tracked file that ships publicly |
| The production build | `vite build` run, then all 180+ emitted assets scanned (no `VITE_`-prefixed variable exists, so nothing client-inlined can carry a secret) |
| Test users and passwords | Every `password123` registration in the tree traced to its target |
| Evidence Pack / report export | `researchRunEvidencePack.mjs`, `genesisVerify.mjs` HTML report, `campaign/toolchain.mjs` |
| Committed screenshots | `artifacts/demo/*.png` — the frames a grant deck is built from — inspected |

---

## Findings

Severity is about a public demo, not about a breach in the abstract.

### Fixed

**F-1 · MEDIUM · `GET /api/compute/environment` returned the host's filesystem layout, unauthenticated.**
`packages/backend/src/compute/env_probe.py:41` and `:45` report, for every binary engine found,
the absolute path `shutil.which()` resolved — `/usr/bin/obabel`, `/opt/conda/envs/.../bin/vina`.
`packages/backend/src/api.mjs:2070` returned that probe verbatim on a route that requires no
token. Verified live: the probe returns `{"status":"AVAILABLE","path":"/opt/node22/bin/node",…}`.
On a deployment with the scientific engines installed, any visitor could read where they live and
what the environments are called.
**Fix:** `publicEnvironment()` in `packages/backend/src/api.mjs` — an allowlist projection, the
same pattern `publicLocalVideoRuntime()` already used to keep `ffmpeg.executable` off that route.
`path` is dropped; `reason` and `detail` are path-redacted. The **stored** env audit keeps the full
probe, because the operator needs it. Test: *"A: GET /api/compute/environment never returns the
interpreter or binary location"* — red on the unmodified handler (`engine vina still exposes its
filesystem location`), green now.

**F-2 · MEDIUM · The environment probe's own failure text carried two host paths.**
`packages/backend/src/compute/scienceEnv.mjs:29` returned the raw `execFileSync` message, which is
literally `Command failed: <interpreter path> <probe script path>`, and `api.mjs:2066` returned it
as the 503 body on the same unauthenticated route.
**Fix:** `redact()` at the source in `scienceEnv.mjs`. Test: *"A: the environment probe's own
failure text is path-redacted before it can be returned"*.

**F-3 · LOW · The remote-worker API returned the server's internal error text.**
`packages/backend/src/remoteWorkerApi.mjs:272` returned `reason: String(error.message)` on a 500 —
a SQLite path, a module URL. The surface needs the shared worker token, so this is not visitor-reachable,
but the worker host is not the operator either.
**Fix:** `redact()`. Test: *"A: the remote-worker surface is off without a token and leaks nothing
when it is on"*, which also asserts the expected token never appears in a response.

**F-4 · LOW · A developer's machine and username were committed in evidence artefacts.**
A developer's full Windows checkout path, naming their account, appeared in nine files under
`artifacts/human-twin-review/` and in `artifacts/vision-review/cinematic-final/manifest.json:10` —
vitest reports and build logs, exactly the kind of file attached to a grant pack.
**Fix:** rewritten to `<repo>` / `<path-redacted>`. Every edited JSON still parses.

**F-5 · LOW · Foreign-machine absolute paths hard-coded in scripts and documents.**
- `scripts/astex-phase2b/{classify,combine,emit,md,measure,vinardo_xtal}.py` — a hard-coded absolute repository root under another container's home directory. Now derived from the script's own location; all six still compile.
- `artifacts/{capture-city3d,benchmark-city3d,earthquake-city3d-runtime-proof}.mjs` — wrote into an absolute output directory under another machine's home. Now derived from the file's own directory; all three still parse.
- `scripts/genesis-voice-lines-export.mjs:29-31` — used a literal home-directory path as a string-substitution sentinel. Now a `${REPO}` template.
- `docs/GENESIS_COMPETITIVE_USP_DECISION.md:62`, `docs/GENESIS_FIRST_REAL_SOLVER_READINESS.md:54`, `docs/GENESIS_QUANTUM_EVIDENCE_CARD.md:47` — footnote links into two home directories of machines that are not this one. Two of the three targets are not in this repository at all; those now say so instead of pointing at a stranger's VM.
- `docs/EARTHQUAKE_VERTICAL_SLICE_INDEPENDENT_AUDIT.md:10`, `docs/P0_EVIDENCE.md:489` — redacted in place.

### Recorded as exceptions (not leaks)

Each is an entry in `packages/backend/src/security/public-surface-exceptions.json` with a reason
and this decision id. The gate validates their shape and fails on a malformed one.

- `docs/BRAKUJACA_WIEDZA.md:23` — the document's subject *is* this defect; it quotes a foreign path as the example.
- `artifacts/human-twin-review/full-vitest.json`, `full-vitest-verified.json` — V8 frames in a committed vitest report. After F-4 the frames are `<repo>`-relative and `node:` internal; they name no host.
- `docs/RAILWAY_SCIENTIFIC_WORKERS.md:384` — a Railway `*.railway.internal` hostname in operator instructions. It is derived mechanically from the service name and has no public route.
- `packages/frontend/dist/assets/experimentGraph.js` — the RO-Crate JSON-LD vocabulary namespace of the Evidence Pack, whose host label is `.local` (`packages/frontend/src/core/experimentFabric/evidencePackRoCrate.ts:33`). A JSON-LD namespace is an identifier, never resolved.

### Still open — reported, not changed

**O-1 · MEDIUM · `GET /api/knowledge/proposals` publishes every pending Evidence Ledger proposal to anyone.**
`packages/backend/src/api.mjs:414` → `knowledgeApi.mjs:330`. The response carries each proposal's
free-text `claim`, its `sourceUrl`, its `contentHash` and the approver id. `publish` and `reject`
on the same family *do* require a session (`api.mjs:417-418`); the listing does not.
This is unpublished scientific material readable without logging in.
**Why not fixed here:** `KnowledgeSourcesScreen.tsx` reads it unauthenticated
(`core/backend/client.ts:1939` sends no token), so gating it changes product behaviour.
**Proposed patch:** split the route — keep the public read restricted to *published* records
(`ledger.getActive()`), and require a session for `PENDING` proposals:
```js
if (seg[1] === 'proposals' && seg.length === 2 && method === 'GET') {
  const viewer = getUserByToken(db, ctx.token);
  return ok(listProposals({ includePending: Boolean(viewer) }));
}
```
**Until that lands: the deployment used for the public demo must hold no real unpublished claim.**

**O-2 · MEDIUM · `POST /api/worlds` and `PUT /api/worlds/:id` write with no authentication and no ownership.**
`packages/backend/src/api.mjs:493-500`, annotated in the source as "public — no project/user concept
today". Any visitor can create a world snapshot, and can overwrite *any* existing one by naming its id.
Rate-limited to 60/min per IP (`server.mjs:363`), so this is defacement and storage growth, not a breach.
**Why not fixed here:** world snapshots genuinely have no owner column; adding one is a schema and
product change, not a redaction.
**Proposed patch:** give `world_snapshots` a `created_by` column, require a session for `POST`, and
on `PUT` require that the session owns the snapshot (404 otherwise, matching the project rule).

**O-3 · LOW · `POST /api/compute/run` answers an invalid request with HTTP 500.**
`packages/backend/src/api.mjs` — an unknown model id produces `status: 500` with
`{"run":{…,"error":"unknown_model"}}`. The body leaks nothing; the status code is simply wrong, and
a 500 on a public route invites someone to keep pulling at it. Should be 400.

**O-4 · LOW · Host fingerprinting on two unauthenticated routes.**
`/api/compute/environment` returns `runtime.osRelease` (the exact kernel string) and
`/api/system/telemetry` returns `process.pid` and the exact Node patch version
(`manifoldApi.mjs:62`). Neither is a path or a secret, and the telemetry HUD in the product
renders the CPU/memory sample on screen by design. Accepted for the demo; narrow them if the
deployment is ever exposed to an untrusted network for a long period.

### Checked and clean

- **No committed secret, anywhere.** No credential-shaped value in any tracked file, including `docs/`, `data/`, fixtures and tests. Every worker-token value in the test suite is `'x'.repeat(32)` or similar. **Nothing needs rotation** (see below).
- `docs/keys/genesis-csrn-signing-key.json` and `packages/frontend/public/.well-known/genesis-csrn-key.json` hold `"status": "NOT_YET_GENERATED"` and a `null` key. No private key material exists in the repository, and the files say plainly that nothing is signed.
- The production bundle contains no secret shape, no `/home` or `/Users` path, and no `VITE_`-prefixed variable (there are none in the source, so Vite can inline none).
- `/api/health` deliberately omits the database path and says so in a comment (`server.mjs:494`); its `scientificWorkers` block reports `online` and an error *code* per group, never a worker URL.
- `/api/genesis/self` carries `reasoningProvider.describe()`, which returns the provider id and model name only — never the key, never the base URL.
- `server.mjs:442` converts any uncaught handler error into `{"error":"internal"}`; no `.stack` is read anywhere in `packages/backend/src`, `packages/frontend/src`, `packages/core/src` or `packages/ui/src`.
- `compute/scientificObservabilityContract.mjs:6` already forbids `stdout`/`stderr`/`token`/`secret` keys in observability records; the generated-analysis path stores `stderrHash`, never `stderr`.
- `genesisVerify.mjs:277` HTML-escapes every interpolated value in the report page, and that route is behind the session gate.
- `campaign/toolchain.mjs:289` already path-redacts adapter failure text on `/api/compute/toolchain`.
- `artifacts/demo/0{1,2,3}-*.png` — the committed grant-demo frames — show no email, no token, no path. The HUD line (`CPU 4 · MEM 1.3/16.9G · LOAD 2.18`) is the telemetry of O-4.
- `password123` appears only in tests, proof scripts and `.github/workflows/ci.yml:523`. The CI use targets `http://127.0.0.1:8080` inside a throwaway container on an ephemeral Docker volume, both of which are destroyed in the same job. **No test account with a known password exists on a real deployment.** The proof scripts register a fresh timestamped account against whatever base URL they are pointed at — see the screenshot rules below.

---

## What must be rotated

**Nothing.** No secret, current or historical, was found committed. The repository has never
needed a history rewrite for this reason, and none is proposed. Should a real value ever be found
in a past commit, the rule stands: **the history is not rewritten — the credential is rotated.**

---

## The standing gate

`packages/backend/src/publicDemoSecurityGate.test.mjs`, built on
`packages/backend/src/security/publicSurface.mjs`. Twelve tests, about 3.5 seconds, run by
`node --test` with the rest of the backend suite.

- **A — the live API.** Every family `api.mjs` routes before its single `getUserByToken` gate is driven unauthenticated through the real router and the response body scanned. One test reads `api.mjs` itself and fails if a new public family appears that the probe list does not cover, so the gate cannot silently fall behind the router.
- **B — the files that ship.** Every tracked file under `docs/`, `artifacts/`, `scripts/`, `knowledge/`, `packages/frontend/public/`, plus `README.md` and `SECURITY.md`.
- **C — the production build.** Every asset in `packages/frontend/dist`, when a build exists, plus a check that no `VITE_`-prefixed variable has appeared in the frontend source.

Two scan profiles, because the two surfaces tolerate different things. `response` is strict: any
absolute system path is a finding. `artifact` only flags home/user paths, secrets, stack traces and
internal hosts — `/usr/bin/python3` written in a document as an example is documentation, not a leak.
URLs are replaced with a token before the path patterns run, so a public allowlist entry like
`https://www.ebi.ac.uk/chembl/api/data/molecule/<ID>.json` is not mistaken for a filesystem path.

**A finding never carries the matched value** — only its pattern id, line number and length. A gate
that prints the secret it found puts the secret in the CI log.

### How to add a legitimate exception

An exception is a decision, not a mute button.

1. Be able to say in one checkable sentence why the match is not a leak: the value is public, or it is a placeholder, or the surface is not visitor-reachable. If you cannot, fix the leak instead.
2. Record it in `docs/DECISIONS.md` under the next free `D-` number.
3. Add an entry to `packages/backend/src/security/public-surface-exceptions.json` with `surface` (exactly one route, file path or build path), `patterns` (the specific pattern ids — `"*"` is refused), `reason` and `decision`.

The gate validates the file's shape before it scans anything, so an entry without a reason or
without a `D-` id fails the suite rather than widening the gate. For a build asset, use the
**stable** name (`assets/experimentGraph.js`): the gate strips Vite's content hash, so the exception
survives a rebuild instead of quietly expiring.

---

## Must never appear in a screenshot, a report or a public Evidence Pack

1. Any value of `ANTHROPIC_API_KEY`, `GENESIS_WORKER_TOKEN`, `GENESIS_SCIENTIFIC_WORKER_TOKEN`, `GENESIS_RESEARCH_API_KEY`, `GENESIS_INSTITUTIONAL_API_KEY`, `GENESIS_REASONING_API_KEY`, `QPU_API_KEY`, `YOUTUBE_API_KEY`, `X_API_KEY`, `FACEBOOK_API_KEY` — including a truncated prefix.
2. A session bearer token or an API key: the browser devtools pane, a `localStorage` inspector, a network tab showing an `authorization:` header, or a terminal still holding a `TOKEN=` line. The grant-demo capture injects a real token into `localStorage` (`packages/e2e/src/grantDemoCapture.e2e.spec.ts:49`) — **never photograph that browser with devtools open.**
3. Any absolute filesystem path of the host or of a developer's machine — a home directory under any OS, a conda environment prefix, the SQLite file's location.
4. A stack trace, a Python traceback, or the raw body of a 500.
5. Any `*.railway.internal` worker URL, and the `/api/worker/v1` surface at all.
6. The raw body of `GET /api/compute/environment` from a machine where the engines are installed — the projection now strips the paths, but a terminal running the probe directly does not.
7. The output of `GET /api/knowledge/proposals` from any deployment holding real unpublished claims (O-1), and any `PENDING` proposal's claim text.
8. Unpublished candidate structures or SMILES that are not already in the committed, public pins: anything from a live campaign that has not been sealed and published. An Evidence Pack built from a real customer or partner run is not demo material.
9. The demo account's email address, if a screen shows the signed-in user.
10. `docs/evidence/run8-status.json`, the Run 8 / Run 9 preregistration, and Run 9 numbers — not for security reasons, but because they are preregistered and not yet reported.

## Language rules that apply to anything shown publicly

These are not security findings; they are what the material must not claim.

- Never write "validated" or "signed evidence". There is no CSRN key: nothing is signed, and the public key file says so.
- Never call the engines open source.
- A prediction is `MODEL_ESTIMATE`. A replay is a replay. Neither is laboratory validation.
