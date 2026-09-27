# Genesis OS — Operator Guide (v1.0)

How to run Genesis OS day-to-day: start it, verify health, and drive each major workflow. This guide
is task-oriented; for the exhaustive endpoint list see `API_REFERENCE.md`, for hosting see
`DEPLOYMENT.md`.

## 1. Start and verify

```bash
npm ci && npm run build
PORT=8080 GENESIS_DB_PATH=/data/genesis.db node packages/backend/src/server.mjs
curl -s localhost:8080/api/health   # ok:true, persistence:"ready"
```

`ai:"no-key"` is expected without `ANTHROPIC_API_KEY` — the AI Narrator is the only feature that
needs it; everything else runs.

## 2. Accounts, projects, roles

- Register: `POST /api/auth/register {email,password,displayName}` → returns a bearer `token`.
- Create a project (you become `owner`): `POST /api/projects {name}`.
- Add teammates: `POST /api/projects/:id/members {email, role}` (`viewer|editor|admin|owner`).
- A **project is the tenant boundary**: campaigns, truth analyses, and failure memory never cross it.

## 3. Truth Engine / R&D kill-switch

Submit a research proposal and get a reproducible decision:

```bash
curl -X POST localhost:8080/api/projects/$PID/truth-analyses \
  -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
  -d '{"problemStatement":"…","claimedResult":"…","assumptions":["…"],"requiredCapabilities":["molecular-docking"]}'
```

Returns `GO` / `WARN` / `BLOCK` / `INSUFFICIENT_DATA` with a hashed **decision certificate**. Fetch
`/truth-analyses/:id/certificate` (reproducible hash), `/report` (pilot report), or
`compare?a=…&b=…`. A capability the platform cannot actually run is an honest gap (WARN), never a
fabricated GO. Real UI: the **Truth Engine** screen.

## 4. Scientific campaigns (server-side)

- Create: `POST /api/projects/:id/campaigns`.
- Start the real orchestrator: `POST …/campaigns/:cid/start` → `202 {jobId}`; poll `…/jobs/:jid`.
- Inspect: `…/campaigns/:cid` plus `/candidates`, `/decisions`, `/events`, `/graph`, `/why`,
  `/conflicts` (MCRE), `/science-runs`.
- **Reproducibility**: every real engine run is a `science-run` with artifacts + SHA-256; replay it
  with `POST …/science-runs/:rid/verify` (editor+, costs real compute) and read the verification
  history. Ranking is deterministic and policy-versioned.

## 5. Real Scientific Campaign #001 (external official data)

This is the flagship "computational scientific campaign on externally supplied official data"
workflow. Two paths — both end in the identical real RDKit + ADMET-AI execution and a provenance
dossier. Full detail in `../campaigns/real-scientific-campaign-001/OPERATOR_RUN.md` and
`EXTERNAL_DATA_ACQUISITION_PLAN.md`.

**Path A — networked runner** (the machine has egress to UniProt/ChEMBL/PubChem/Europe PMC/RCSB):
```bash
node scripts/run-campaign-001.mjs            # preflight → acquire → verify → execute → dossier
```

**Path B — externally supplied official payloads** (runner has NO egress; this sandbox, air-gapped):
```bash
# 1. On any networked machine: download the OFFICIAL payloads per REAL_CAMPAIGN_INPUT_REQUIREMENTS.json,
#    place them + a filled SUPPLIED_INPUTS.json (from SUPPLIED_INPUTS_TEMPLATE.json) in a directory.
# 2. On the (possibly offline) Genesis machine:
node scripts/run-campaign-001.mjs --supplied campaigns/real-scientific-campaign-001/supplied
```

Both fail **closed**: no mandatory source (ChEMBL/PubChem/UniProt), a hash mismatch, a missing
provenance record, a stub/wrong-type payload, or a mislabelled bundle aborts the run — nothing is
fabricated and no fixture is silently substituted. Docking stays `BLOCKED_BY_RUNTIME` unless a real
prepared receptor is supplied; it is never replaced by a heuristic score.

Honest expectation: even on genuine data this produces an **auditable computational triage** with
provenance and a Truth-Engine gate — not drug discovery. The dossier's mandatory answer to "did
Genesis find a drug?" is **NO** absent independent experimental/clinical validation.

## 6. Autonomous Discovery Forge

- Run a closed-loop campaign: `POST /api/projects/:id/discovery-campaigns`.
- Read the dossier: `…/discovery-campaigns/:cid/dossier` — includes generation history, plan
  mutations, novelty assessment, and `didGenesisDiscoverADrug`.

## 7. Necropolis (failure memory)

- Stats: `GET /api/projects/:id/necropolis`. Record a dead end: `POST …/necropolis/failures`.
- Portable failure memory: `GET …/necropolis/export` / `POST …/necropolis/import` (admin+, SHA-256).
- Failure memory is tenant-isolated and feeds plan mutation in the Discovery Forge.

## 8. Compute engine (public)

- `GET /api/compute/capabilities`, `/models`, `/toolchain`, `/environment`, `/admet/endpoints` —
  all report **runtime-verified** engine status. `POST /api/compute/run {modelId,inputs}` runs a
  deterministic model (persisted if a token is attached).

## 8b. Research Campaigns sharing + version history (Scientific Version Control)

Distinct from §4/§5's cognitive discovery-campaign engine — this is the product's
`/api/campaigns/:id` Research Campaigns (Compare/Campaigns UI). There is no separate admin
console for this; owners self-manage sharing from the product UI's version-history panel.
Operationally relevant for an administrator:

- A campaign has exactly one **owner** (the creator) plus any number of invited members
  with role `collaborator` or `viewer`. Manage via `POST/PUT/DELETE
  /api/campaigns/:id/members[/:userId]` (owner-only; full reference in
  `docs/SCIENTIFIC_VERSION_CONTROL.md` §6).
- Invites resolve by e-mail against `users.email` — **the invitee must already have a
  Genesis account**. There is no invite-then-signup flow and no e-mail is sent; the
  invited user only sees the shared campaign next time they open it.
- Snapshots are immutable and additive (`campaign_snapshots` never has rows deleted or
  updated) — a campaign's disk footprint grows with its snapshot count. At pilot scale
  (a handful of campaigns per lab, each with a few hundred snapshot events) this is
  negligible; there is no retention/pruning policy yet if that changes.
- No new environment variables. Standard `VACUUM INTO` backups (see §"Persistence &
  backup" in `DEPLOYMENT.md`) already capture these tables — nothing extra to configure.

## 9. Troubleshooting

| Symptom | Cause | Action |
|---|---|---|
| `persistence:"unavailable"` in health | SQLite dir not writable | Fix `GENESIS_DB_PATH` / volume perms. |
| `/api/ask` → 503 | `ANTHROPIC_API_KEY` unset | Set the key (Narrator only). |
| Campaign engine `BLOCKED_BY_RUNTIME` | RDKit/ADMET/Vina not installed | Install the Python deps (see `DEPLOYMENT.md`). Expected & honest otherwise. |
| Campaign #001 aborts at preflight/acquire | No egress / mandatory source down | Use Path B (supplied payloads). |
| 404 on someone else's project | Not a member | By design — no existence leak. |
