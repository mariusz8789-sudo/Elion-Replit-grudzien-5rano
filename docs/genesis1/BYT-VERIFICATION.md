# BYT / persistent scientific state — verification

Branch `g1/byt-verified` (from `a16c22ce`). Date 2026-10-03. Scope: `packages/backend`.

## What BYT is (no second memory system)

BYT is a **read model** (`src/bytProjection.mjs`, built by `src/cognitiveState.mjs`). It owns no rows. The
persistent scientific state it projects is the canonical set, unchanged by this work:

| Piece | Where | Durable form |
|---|---|---|
| ResearchRun identity + state | `src/agentRun.mjs`, `src/researchRun.mjs` | `agent_runs` + hash-chained `agent_run_steps` (`RESEARCH_STATE_EVENT_TYPES`) |
| Scientific Memory | `src/experimentMemory.mjs` | `experiment_records` (append-only by DB trigger, hash-chained per key) |
| Engine output + replays | `src/store.mjs`, `src/campaign/verify.mjs` | `science_runs`, `science_run_verifications` |
| Evidence ledger | `src/knowledgeApi.mjs` | `evidence_ledger_entries` (schema V16, append-only + chained by DB trigger) in the same SQLite file; JSON beside the DB kept as an export |
| Lease queue | `src/researchRunJobs.mjs`, `src/compute/workerInfrastructureContract.mjs` | `jobs` (V15 lease columns) |
| Evidence Pack | `src/researchRunEvidencePack.mjs` | derived, every hash recomputable |

New tests: `src/bytVerification.test.mjs` (in-process, real RDKit) and `src/bytRecovery.e2e.test.mjs`
(child processes, real SIGKILL, real RDKit). Both use `engineUnavailable('rdkit', …)`: without RDKit they are
**SKIPPED with `ENGINE_UNAVAILABLE (BLOCKED_BY_RUNTIME)`**, never passed; `GENESIS_REQUIRE_ENGINES=rdkit`
turns the skip into a failure. The only fixture is the model's JSON plan (served over HTTP by a local fake
OpenAI-compatible endpoint in the E2E). The engine is real RDKit 2026.03.6 in this run.

## Requirement → evidence

Legend: **PASS** = proven by a passing test in this run. **GAP** = not proven / known limitation (stated, not hidden).

| # | Requirement | Test (file : name) | Status |
|---|---|---|---|
| 1 | Persistent identity across restarts (run id, Genesis identity) | `bytRecovery.e2e.test.mjs` : *SIGKILL inside the engine call and inside the replay…* (same `researchRunId`, same login, `byt.identity` identical across process 3 → 4); `genesisSelfModel.test.mjs` : *a restart, even onto a new database, is still the same entity* | PASS |
| 2 | Durable ResearchRun state | same E2E (state read back from the file after each SIGKILL and by the next process, event for event); `researchStatePersistence.test.mjs` : *events written before a restart are read back…*; `researchRunExecution.test.mjs` : *plan → restart without RDKit → BLOCKED → …* | PASS |
| 3 | Hypothesis / protocol / evidence lineage and artifact references survive | E2E: frozen prediction (preregistration fingerprint) from process 1 is the one executed in process 2 and judged in process 3; `ARTIFACT_PERSISTED` once, artifact read back `verified: true`; Evidence Pack verifies `anchored: true` against the records | PASS |
| 3b | Candidate lineage survives | `candidateLabHandoff.test.mjs` : *server projects persisted candidate evidence, creates one governed request and recovers it after restart* (existing; DB reopen, not a process kill) | PASS (reopen only) |
| 4 | Scientific Memory continuity | E2E: exactly 2 `experiment_records` (preregistration + 1 seal) after two kills; `goldenResearchRun.e2e.test.mjs` : *GOLDEN …* (synthesis recall after restart); `knowledgeLoop.test.mjs` : *real ResearchRuns: the synthesis endpoint recalls both runs and the Necropolis after a restart* | PASS |
| 5 | Deterministic restoration (same hashes / projection) | E2E process 3 → 4: `researchState` and `experiments` deep-equal, BYT deep-equal (except `capabilities`, see note), Evidence Pack `stateChainHead` and `experiments` equal; `bytVerification.test.mjs` : *a tail lost after the last Scientific Memory record is restored deterministically: same events, same head, nothing re-run*; `bytProjectionRestart.test.mjs` | PASS |
| 6 | No duplicate execution after recovery | E2E: `EXPERIMENT_HANDOFF` written by process 2 is byte-identical after process 3 finished; one `science_runs` row; one verification row; one evidence proposal; jobs end `DEAD_LETTER, DEAD_LETTER, SUCCEEDED`; process 4 claims nothing | PASS |
| 7 | Idempotency: repeat submit / claim / complete | `bytVerification.test.mjs` : *repeat submit, claim, complete, fail and cancel never change a finished job or execute it twice*; E2E: resubmit while the dead lease is live dedupes to the same job; `researchStatePersistence.test.mjs` : *… the same event twice is a no-op* | PASS |
| 8a | Tampered chain row detected | `researchStatePersistence.test.mjs` : *a tampered row is reported as a broken chain…*; `researchRunJobs.test.mjs` : *… a corrupted run chain dead-letters on the first attempt* | PASS |
| 8b | Truncated (partially written) event detected | `bytVerification.test.mjs` : *a partially written (truncated) event row is detected…* | PASS (after fix 2) |
| 8c | Truncated chain **tail** detected | `bytVerification.test.mjs` : *tail truncation that loses {PREDICTIONS_FROZEN, EXPERIMENT_HANDOFF, SELF_FALSIFICATION} and everything after it is detected against Scientific Memory…* (3 tests) | PASS (after fix 1) |
| 8d | Job row with missing run | `bytVerification.test.mjs` : *a job row whose ResearchRun does not exist dead-letters on its only attempt…* | PASS |
| 8e | Never a phantom COMPLETED | `bytVerification.test.mjs` : *a forged SUCCEEDED job row creates no result…*; every corruption test asserts `job.result === null`, empty Prediction Ledger, Evidence Pack refused | PASS |
| 9 | Schema/version migration | `bytVerification.test.mjs` : *a schema v14 database holding a ResearchRun opens as v15 with the same chain, BYT and Evidence Pack, and its queue works*; `storeMigration.test.mjs` : pre-v2 legacy DB, downgrade guard (*kod ODMAWIA otwarcia bazy nowszej…*), idempotent reopen | PASS (v14 fixture is synthesized by dropping the V15 columns, not a historical file) |
| 10 | Shared durable storage, multiple workers (processes) | `bytRecovery.e2e.test.mjs` : *six processes race for one job: exactly one claims it; an expired lease of a SIGKILLed holder is reclaimed exactly once* | PASS (one host, one SQLite file) |
| 11 | Multi-instance consistency | `bytRecovery.e2e.test.mjs` : *two backend instances on one database: every queued experiment is executed exactly once and both read the same state* (now also: each run's evidence proposal is in the one ledger exactly once, both instances serve the identical ledger, `PROPOSE` rows = runs); `knowledgeLedgerMultiInstance.test.mjs` : *four processes propose concurrently…*, *two server.mjs instances… concurrent publish/reject of one proposal has one winner; a restart serves the same ledger* | PASS (SQLite state and evidence ledger; one host, one SQLite file) |
| 11b | Evidence ledger: restart, migration, tampering | `knowledgeLedgerMultiInstance.test.mjs` : *a restart preserves the ledger…*, *an existing JSON ledger migrates once, with identical entries and hashes, even when two processes boot on it at once*, *tampering is detected…*, *a stale or edited JSON export… is ignored*; `knowledgeLedgerPersistence.test.mjs` (legacy no-DB mode, unchanged) | PASS |
| 12 | Restart/recovery E2E with real process kill | `bytRecovery.e2e.test.mjs` : *SIGKILL inside the engine call and inside the replay: a new process restores the same run and produces exactly one valid result* | PASS |

### The kill E2E, step by step (req. 12)

`src/server.mjs` runs as a child process on a temp SQLite file with its own queue worker
(`GENESIS_RESEARCH_WORKER_LEASE_MS=5000`). `GENESIS_RDKIT_PYTHON` points at a gate that passes every RDKit call to
the real interpreter except the N-th `descriptors` call for the experiment's molecule (glycerol — no toolchain probe
uses it), where it signals and blocks. The test SIGKILLs only the PID it spawned.

1. **P1**: register, project, ResearchRun, plan, async experiment job J1 → killed **inside the engine call**.
   File: `PROBLEM_FORMALIZED, HYPOTHESES_GENERATED, PREDICTIONS_FROZEN`; 1 preregistration; 0 science runs;
   J1 `CLAIMED` by `worker-research-run-<P1 pid>`, `result_json NULL`.
2. **P2**: same run id, plan and frozen event restored exactly; resubmit dedupes to J1; J1 is dead-lettered
   (`LEASE_EXPIRED_AFTER_MAX_ATTEMPTS`, result null); J2 resumes **the same experiment** → RDKit runs, seal +
   `EXPERIMENT_HANDOFF` + `SELF_FALSIFICATION` committed, evidence proposed → killed **inside the replay**.
3. **P3** (no gate): exact chain restored; J2 dead-lettered; J3 → `SUCCEEDED`. Exactly one of each event, the
   P2 engine output unchanged, replay `MATCH`, one evidence proposal, artifact verified, Evidence Pack verified and
   anchored, BYT shows 1 verified run, verdict `SUPPORTED_WITHIN_PROTOCOL`.
4. **P4**: identical run state, BYT and Evidence Pack; no job is claimed.

## Real bugs fixed (minimal changes)

1. **Tail truncation was invisible.** Every prefix of a valid hash chain is valid, so a chain that lost its tail
   verified `ok`. Losing `EXPERIMENT_HANDOFF…` made recovery **re-run the engine** and then crash with
   `UNIQUE constraint failed: science_runs.id` (an exception escaping the worker, leaving a zombie lease);
   losing `SELF_FALSIFICATION…` crashed with `TypeError: Cannot read properties of null (reading 'verdict')`;
   BYT counted the run as verified. Fix: `anchoredResearchState()` in `src/researchRun.mjs` cross-checks the chain
   against append-only Scientific Memory (every preregistration must be named by a `PREDICTIONS_FROZEN`, every
   sealed session by a `SELF_FALSIFICATION`; they are written in the same transaction). Used by the run view,
   run control and the BYT projection (`src/cognitiveState.mjs`). Result: `STATE_INTEGRITY_FAILURE`
   (`chain_truncated_behind_scientific_memory`), no engine call, job dead-lettered with that code, BYT
   `brokenRuns: 1`, Evidence Pack refused. Defensive guard added in `proposeEvidenceAndNext`
   (`src/researchRunExecution.mjs`) for an execution without falsification.
2. **A partially written event row crashed the run view** (`TypeError … reading 'type'` → HTTP 500) instead of
   reporting the broken chain. Fix: null-safe derivation in `experimentsOf` / `view` / `researchSteeringOf`
   (`src/researchRun.mjs`); the chain verdict (`malformed_event`) was already correct.
3. **A live worker was treated as dead.** Engine calls are synchronous (`execFileSync`), so heartbeats cannot fire
   during them. An execution longer than the lease wrote its full scientific result and then `complete()` was
   refused (`LEASE_LOST`) because the lease had *expired*, although no other worker had taken it — the job ended
   `DEAD_LETTER` while the run held a valid result (seen as a flake in the two-instance test). Fix
   (`src/compute/workerInfrastructureContract.mjs`): heartbeat / complete / fail require the row to be `CLAIMED`
   with the same `lease_id`, not an unexpired clock. A lease taken over by `claim()` (new `lease_id`), swept to
   `DEAD_LETTER` or cancelled is still refused. Test: *an engine call that blocks the event loop past the lease
   still completes its job once…*; the existing contract test now asserts the stale-worker refusal **after** a
   takeover (`workerInfrastructureContract.test.mjs`).
4. **Operability (not a correctness bug):** `src/server.mjs` gives each process its own worker id
   (`worker-research-run-<pid>`, so a lease left by a killed process is attributable) and reads
   `GENESIS_RESEARCH_WORKER_LEASE_MS` (default unchanged, 30 s; invalid values fail at boot).

## Evidence ledger with several instances (fix 5, branch `g1/ledger-multi`)

**Before:** each process held the ledger in memory and rewrote `evidence-ledger.json` from that memory after every
append. Measured with the old code path (JSON-only mode, 4 processes × 25 concurrent proposals): **25 of 100 entries
survived** in the file — every process overwrote the others. With the fix, the same race keeps 100.

**Design (the canonical ledger, `src/knowledgeApi.mjs`; no second ledger, `EvidenceLedger` in core unchanged):**

- SQLite (the same `genesis.db` as the run state) is the source of truth when the server has a database
  (`openKnowledgeLedgerPersistence(path, { db })` in `src/server.mjs`). Schema **V16** adds
  `evidence_ledger_entries` (one row per chain entry: the entry JSON verbatim, its columns, and `effect_json` — what the
  entry did: the proposed record, or the decided proposal and approver) and `evidence_ledger_base` (one row, only for
  a migrated JSON ledger). Both are append-only by trigger; a further `BEFORE INSERT` trigger refuses any entry whose
  `idx` is not the row count or whose `prev_hash` is not the hash of the previous row, so no code path can fork,
  reorder or skip the chain.
- Every mutation (propose, structured-evidence propose incl. its dedupe check, publish, reject, ingest batch) runs
  under `BEGIN IMMEDIATE` (a `SAVEPOINT` if the caller is already in a transaction): the process catches up to the
  database head, applies the mutation on the current head, inserts its entries, rewrites the JSON export, commits.
  On any error the whole write rolls back and the in-memory ledger is reloaded from the database. Reads catch up first
  (a one-row head query; a full reload only when another process appended).
- Loading = base state + replay of every effect in order; each row is checked against its entry JSON, each effect
  against its entry (record id, content hash, recomputed `contentHashOf`), then `EvidenceLedger.fromSnapshot`
  re-verifies the whole hash chain. Any failure: `REJECTED_IN_MEMORY` with a reason, nothing written (same
  semantics as a rejected JSON snapshot before).
- **Migration:** at boot, if the table is empty and a JSON ledger exists, it is verified with the existing
  `restoreLedger` and imported in the same `BEGIN IMMEDIATE` transaction (two processes booting at once import it
  exactly once): entries verbatim, state as the base row, source SHA-256 recorded. A tampered JSON is refused, not
  imported, left untouched. The export rewritten from the database is **byte-for-byte the legacy file** (tested).
- **JSON is now an export** (same `evidence-ledger-snapshot/1` schema, still at `GENESIS_LEDGER_PATH`), rewritten
  inside the write transaction so exports land in database order; it is never read back while the table has rows,
  so a stale file written by an old process cannot win. Without a database the old single-process JSON mode is
  unchanged; `':memory:'` stays in memory.

**Why not a file lock + re-read + atomic rename:** it would be correct only if every process honoured the lock
(an advisory lock on a JSON file is not enforced against an older binary still running), Node has no portable
`flock`, and a lock file left by a SIGKILLed holder needs staleness heuristics. SQLite already gives the backend a
tested cross-process write lock (`BEGIN IMMEDIATE`, WAL, `busy_timeout`) that the job queue relies on, plus
crash-atomic commits and triggers that make the chain invariants hold regardless of the writer.

## Remaining gaps (honest)

- **Evidence ledger: open-time downgrade guard only.** The schema is now V16, so an older backend refuses to open the
  database (`GENESIS DB SCHEMA TOO NEW`) instead of writing the old JSON beside it. A tamper made *while* a process
  runs is caught at that process's next reload (another process's append or a restart), not on every read —
  as before with the JSON snapshot. `CURRENT_WORKER_INFRASTRUCTURE.multiReplicaSafe` stays `false` because of the
  multi-host gap below, not the ledger.

- **Multi-host / network storage (GAP).** Proven: several OS processes on one host sharing one SQLite file
  (`BEGIN IMMEDIATE`, WAL). Not proven and still blocked by `admitMultiReplicaWorkerInfrastructure`: replicas on
  different hosts, network-mounted SQLite, object storage.
- **Cross-process sweep of a slow live job (GAP, documented).** With several instances, another instance's
  `claim()` may dead-letter a final-attempt job whose holder is still blocked in a synchronous engine call longer
  than the lease. The run's result is then valid but the job says `DEAD_LETTER` — never a phantom success, and
  the run is not executed twice (ResearchRun jobs have `maxAttempts: 1`, execution is idempotent). Mitigation:
  set `GENESIS_RESEARCH_WORKER_LEASE_MS` above the worst-case synchronous engine time.
- **Recovery after a crash needs a resubmit.** By design (`maxAttempts: 1`, no silent retry) an abandoned job is
  dead-lettered after its lease and a person (or caller) resubmits; the resubmitted job resumes the same frozen
  experiment. There is no automatic re-enqueue at boot.
- **Tail truncation after the last Scientific Memory record** (`EVIDENCE_UPDATE` / `NEXT_EXPERIMENT` lost) is not
  reported as an error: it is re-derived from append-only sources and proven to give the identical head. A loss of
  `ARTIFACT_PERSISTED`, `RUN_CONTROLLED`, `RESEARCH_STEERING` or literature events at the tail is **not** anchored
  and would go unnoticed by the chain check (GAP).
- **BYT `capabilities` is live, not restored.** It reflects whether this process has validated an engine yet, so
  it can differ right after a restart; all persisted-state sections are compared and equal.
- **Event contract version is not checked on read.** Events carry `contractVersion: 'research-run@1'` but readers
  do not refuse an unknown version; the DB-level guard (`PRAGMA user_version` > 15 refuses to open) is the only
  version check. Tested by `storeMigration.test.mjs`.
- **Durability against power loss** (fsync of SQLite WAL / ledger snapshot) is not tested; SIGKILL keeps the OS
  page cache.
- **Candidate lineage** is proven across a DB reopen, not across a real process kill.

## Runs (this branch, 2026-10-03, Node 22, RDKit 2026.03.6 present)

- `cd packages/backend && npm test`: **1638 tests, 1550 pass, 0 fail, 88 skipped** (skips are engines absent from
  this container, classified `ENGINE_UNAVAILABLE`; none of the BYT tests skipped). Baseline before this work:
  1625 tests, 1537 pass, 0 fail, 88 skipped.
- `npx eslint packages/backend/src --quiet`: clean.
- New tests: `bytVerification.test.mjs` 10 tests, `bytRecovery.e2e.test.mjs` 3 tests — all PASS.

### Runs after the evidence-ledger fix (branch `g1/ledger-multi` from `4399e9e9`, 2026-10-03)

- `cd packages/backend && npm test`: **1651 tests, 1563 pass, 0 fail, 88 skipped** (same 88 `ENGINE_UNAVAILABLE`
  skips; +13 tests: 6 in `knowledgeLedgerMultiInstance.test.mjs` and its suites, ledger assertions added to the
  two-instance E2E).
- `GENESIS_REQUIRE_ENGINES=rdkit node --test src/bytRecovery.e2e.test.mjs src/bytVerification.test.mjs`: 13/13 PASS.
- `npx eslint packages/backend/src --quiet`: clean.
