# Genesis — ONE BRAIN

Date: 2026-10-04. Base: `claude/human-explorer-mobile-tap-nrboog` **59e3822f** (= `origin/main`
286822e7 after PR #83, plus the time-to-discovery work and schema v17).
Machine form of this document: `packages/backend/src/architecturalInvariants.test.mjs` (40 tests,
`node --test`). Every verdict below is a test there; if a verdict and the test disagree, the test is
the one that will notice.

**Question.** Does Genesis have ONE canonical scientific loop, or two competing execution systems?

**Answer.** One. The canonical loop is the backend **ResearchRun**, and every hop of it exists in a
single module with a single authority (§1, §2). There is exactly one engine table, one Evidence
ledger seam, one Replay implementation, one DecisionTrace builder, one research-state chain, one
schema authority and one stage-timing authority.

Three things that *look* like second brains are not, and each is recorded rather than hidden:

| | What | Verdict |
|---|---|---|
| RED-1 | `compute/{openmm,pyscf,vina}ResearchRunExecutor.mjs`, `compute/localCanonicalScientificExecutor.mjs` | **Orphaned**, not a second path. Reference cases, reached from their own tests only. Pinned out of the loop. |
| RED-2 | Two machine-worker systems: the pull-lease ResearchRun worker vs the push-RPC capability worker | **Two systems on purpose**, two credentials, two placement deciders that must not meet. Pinned apart. |
| RED-3 | `packages/frontend/src/core/discovery/*` — the browser-local Discovery Engine | **A genuine second Evidence+Replay implementation.** Contained to one demo surface; removal is not small. RED_INTEGRATION. |

The older `remoteScientificWorkerClient` / `routeCapability` / `workerServer` code the brief asked
about is **not** a superseded predecessor of the PR #81 remote ResearchRun worker. They are two
different systems with two different jobs (§3). Nothing needed deleting; what was missing was the
machine check that they stay apart, which §3 now has.

---

## 1. The canonical path, hop by hop

Read as: *hop* — *the one module that owns it* — *file:line*.

| # | Hop | Owner | Evidence |
|---|---|---|---|
| 1 | Science Chat asks | frontend `core/scienceChat/researchRunTurn.ts`, over `core/backend/client.ts` | `packages/frontend/src/core/backend/client.ts:705` (`POST /projects/:id/research-runs/:id/proposals`) |
| 1b | Research Intake resolves a question into a governed draft | `campaign/researchIntake.mjs::resolveResearchIntake` | `packages/backend/src/api.mjs:107` (import), `api.mjs:1263` (route segment), `api.mjs:1864` (the `POST /api/projects/:id/research-intake` contract) |
| 2 | ResearchRun starts | `researchRun.mjs::startResearchRun` | `packages/backend/src/researchRun.mjs:300`; the only caller is the HTTP seam `api.mjs:834` |
| 3 | Hypotheses are proposed and validated | `researchRun.mjs::proposeResearchPlan` / `validateResearchPlan` | `researchRun.mjs:429`, `researchRun.mjs:341`; bounded by `MAX_HYPOTHESES` `researchRun.mjs:46` |
| 4 | Preregistration is frozen | `researchRunExecution.mjs` | key `researchRunExecution.mjs:63`, taken `:215`, refusal `:235`, `frozenBefore: 'ENGINE_EXECUTION'` `:253` |
| 5 | The experiment runs | `researchRunExecution.mjs::executeResearchExperiment` | `researchRunExecution.mjs:618` — the single function every route reaches |
| 6 | An engine is chosen | `researchRunEngines.mjs::RESEARCH_RUN_EXECUTORS` | table `researchRunEngines.mjs:29`; injectable seam `DEFAULT_RESEARCH_TOOLS` `:210`; dispatch `researchRunExecution.mjs:271` |
| 7 | Falsification against the frozen prediction | `researchRunExecution.mjs::executeAndFalsify` | `researchRunExecution.mjs:270`; the seal event `SELF_FALSIFICATION` `:361`; verdict vocabulary `:49`; scope sentence `:47` |
| 8 | Evidence is **proposed** (never published by the machine) | `knowledgeApi.mjs::proposeStructuredEvidence` | definition `knowledgeApi.mjs:353`; the loop's call site `researchRunExecution.mjs:35` + `:619`; durable ledger opened once at boot `knowledgeApi.mjs:281` |
| 9 | Replay | `campaign/verify.mjs::verifyScienceRun` | called `researchRunExecution.mjs:458` (post-execution) and `:703` (`replayResearchExperiment`); the customer report reuses the same replayer `genesisVerify.mjs:35`, `:130` |
| 10 | DecisionTrace | `decisionTrace.mjs::buildDecisionTrace` | definition `decisionTrace.mjs:42`; the only caller `researchRunExecution.mjs:503` |
| 11 | Next justified experiment | `researchRunExecution.mjs::nextExperimentProposal` + `nextExperimentDecisionTrace` | `researchRunExecution.mjs:166`, `:482`; non-advanceable paths stop at `HUMAN_REVIEW` `:168`, `:203` |
| 12 | Lab handoff | `researchRunLab.mjs::prepareLabRequest` / `exportLabPackage` | `researchRunLab.mjs:84`, `:155`, verification `:197` |
| 13 | Observation comes back | `researchRunLab.mjs::ingestLabObservation` | `researchRunLab.mjs:226`; model-vs-measurement `:319` |
| 14 | Human review | `researchRunLab.mjs::reviewLabObservation`; `researchRunAdvance.mjs` stop reasons | `researchRunLab.mjs:286`; `researchRunAdvance.mjs:16`, `:27` (`AWAITING_HUMAN_REVIEW`) |
| 14b | Reviewed observation becomes an Evidence proposal | `researchRunLab.mjs::proposeLabEvidence` | `researchRunLab.mjs:359` |
| ⏱ | Stage timing of hops 1–12 | `discoveryTiming.mjs` | written only from `researchRun.mjs:40` and `researchRunExecution.mjs:44` (and `:422`); read-only at `api.mjs:82` |

The chain that makes the above a *run* and not a sequence of calls: one hash-chained research state,
one append primitive, `agentRun.mjs::appendServerResearchStateEvent`, and nine writers — all of them
hops of this loop (invariant 7 lists them). No `campaign/`, `compute/`, `literature/` or `security/`
module may append to it.

**Tools, not brains.** Virtual Lab (`campaign/virtualLabClosedLoop.mjs`), the campaign discovery
loop (`campaign/orchestrator.mjs`, `campaign/nextExperiment.mjs`), Worlds, literature
(`researchRunLiterature.mjs`), the engines and the two worker systems are all called *by* the loop.
The direction is pinned: no `campaign/*` module may start, steer or advance a ResearchRun, and
`campaign/nextExperiment.mjs::analyzeAndDecide` — which picks the next *generation inside one
campaign* — may not produce a DecisionTrace, propose Evidence, or name a ResearchRun.

---

## 2. Verdict per invariant

Each row is a `describe` block in `packages/backend/src/architecturalInvariants.test.mjs`.

| # | Invariant | Verdict | Why / what the test pins |
|---|---|---|---|
| 1 | **One Evidence path** | **ONE AUTHORITY** | One ledger, opened only as a process bootstrap (`researchRunChild.mjs`, `server.mjs`). Exactly five modules may name `proposeStructuredEvidence`, four of them bridges into the one seam: the loop's own result, a reviewed external-lab observation, the HTTP routes that carry a reviewed lab / virtual-lab result in, and `campaign/virtualLabClosedLoop.mjs`, which builds the input only (`api.mjs:1523`, `:1574` perform the propose). `campaign/orchestrator.mjs` may not propose Evidence at all. |
| 2 | **One Replay authority** | **ONE AUTHORITY** | `campaign/verify.mjs` is the only module that re-runs a capability to compare it. Four consumers, closed list; `genesisVerify.mjs` is the customer-facing report and *calls* the replayer rather than owning one. |
| 3 | **One DecisionTrace authority** | **ONE AUTHORITY** | `buildDecisionTrace` has exactly one caller. The campaign loop's own next-generation decider is forbidden from producing one, so there is only one "next justified experiment" that is traced, replayed and shown to a human. |
| 4 | **One engine authority** | **ONE AUTHORITY** | `RESEARCH_RUN_EXECUTORS` is the single table. The remote worker imports the same table rather than defining an engine set, which is what makes it a worker. The in-process worker excludes `RESEARCH_REMOTE_CAPABILITY` from its claim filter (`researchRunJobs.mjs:217`), so one frozen experiment cannot be claimed twice. One module serves `/api/worker/v1` (`remoteWorkerApi.mjs:22`, dispatched at `server.mjs:535`, `:354`). |
| 5 | **No orphaned second execution path** | **ORPHANS FOUND, PINNED OUT (RED-1)** | `compute/{openmm,pyscf,vina}ResearchRunExecutor.mjs` and `compute/localCanonicalScientificExecutor.mjs` are named as if they were the ResearchRun executor and are not: their only importers are their own tests (and each other). Kept for their canonical engine reference cases; the test fails the moment the loop, a worker, `api.mjs` or `server.mjs` imports one. `compute/admetResearchRunExecutor.mjs` is the one exception and the loop may take exactly one name from it — `admitAdmetUse`, the D-057 licence gate — never an execution port. |
| 6 | **One identity model** | **ONE MODEL for science and for humans; SPLIT BY DESIGN for machines (RED-2)** | The entity record `GENESIS_IDENTITY` is never an input to a measurement, a gate or a verdict. One password/session implementation (`auth.mjs`), one project role model (`access.mjs`). Machine identity is genuinely two credentials — `GENESIS_WORKER_TOKEN` (remote ResearchRun worker) and `GENESIS_SCIENTIFIC_WORKER_TOKEN` (private capability workers) — and the test forbids any module from reading both, so one leaked token cannot open both doors. |
| 7 | **One ResearchRun scientific loop** | **ONE LOOP** | One freeze-and-apply function with five callers, all routes into it. One research-state chain with one append primitive and nine writers, every one a hop of the loop. The lab hop binds `campaign/labClosedLoop.mjs` and `campaign/labEvidenceBridge.mjs` instead of re-implementing an observation record. No campaign module drives a run. A run is started from the HTTP seam only. |
| 8 | **One stage-timing authority** (schema v17) | **ONE AUTHORITY** | `discoveryTiming.mjs` is written from `researchRun.mjs` and `researchRunExecution.mjs` and nowhere else — the timing is part of the loop's own write transaction, so a rolled-back step leaves no timing and there is no second clock. `api.mjs` may import readers only. The four tables (`discovery_stage_marks`, `discovery_stage_facts`, `discovery_timing_campaign_links`, `discovery_competitor_baselines`) are named in exactly two places: that module and the schema. The module contains no `UPDATE` and no `DELETE FROM`, so a slow run cannot be made fast retroactively. A competitor time can enter only as a provenance-gated row, and no module may declare its own copy of the speedup vocabulary. |
| 9 | **One schema authority** | **ONE AUTHORITY** | `store.mjs` is the only module that writes `PRAGMA user_version`, and `CURRENT_SCHEMA_VERSION = 17` is declared once. (`access.mjs` and `sourceRecordStore.mjs` also contain `CREATE TABLE`; they create their own tables inside the same database and never move the version — so they are not a second *migration* authority, and the test is written against the version, which is the thing that can diverge.) |
| 10 | **The browser-local Discovery Engine** | **DUPLICATE FOUND — contained, not removed (RED-3)** | See §4. Four primitives, one product surface each; no route from any of them into the canonical ledger. |
| 11 | **The two worker systems** | **TWO SYSTEMS, pinned apart (RED-2)** | See §3. |

No invariant came out "cannot determine".

---

## 3. RED-2 — the two worker systems are not two brains

The brief asked whether the older `remoteScientificWorkerClient` / `routeCapability` / `workerServer`
code is a superseded predecessor of the remote ResearchRun worker merged as PR #81. It is not.

| | Capability worker (older) | ResearchRun worker (PR #81) |
|---|---|---|
| Modules | `compute/workerServer.mjs`, `compute/remoteScientificWorkerClient.mjs`, `compute/workerEntrypoint.mjs`, `compute/workerRuntimeProbe.mjs` | `remoteWorkerApi.mjs`, `remoteWorker.mjs`, `remoteWorkerMain.mjs`, `remoteEngineChild.mjs` |
| Unit of work | a **capability** (`POST /capabilities/:id/execute`) | a **frozen ResearchRun experiment** |
| Model | push RPC: the server calls out to a configured worker and waits | pull lease: the worker claims a job over `/api/worker/v1` (`remoteWorkerApi.mjs:22`, `server.mjs:535`) |
| Placement decider | `routeCapability` — LOCAL vs a configured private worker (`compute/remoteScientificWorkerClient.mjs:122`) | `RESEARCH_REMOTE_CAPABILITY` + the lease queue (`researchRunJobs.mjs:23`, `:67`, `:217`) |
| Callers | exactly two, both tools of the loop: `campaign/virtualLabClosedLoop.mjs:719` (Virtual Lab) and `campaign/verify.mjs:285` (Replay) | the loop itself, through the executor table |
| Credential | `GENESIS_SCIENTIFIC_WORKER_TOKEN` | `GENESIS_WORKER_TOKEN` |

Both systems run the **same engines**: the ResearchRun worker imports `RESEARCH_RUN_EXECUTORS`
(invariant 4), and the capability worker executes a capability contract
(`compute/scientificCapabilityContract.mjs`) rather than choosing an engine. So there is one engine
authority with two transports, not two engine authorities.

The real hazard is not duplication but *merging*: two answers to "where does this experiment run" for
the same experiment. Both directions are now pinned:

- no `researchRun*` / `remoteWorker*` / `remoteEngineChild*` module may call `routeCapability`
  (invariant 4);
- `compute/workerServer.mjs` and `compute/remoteScientificWorkerClient.mjs` may not mention
  `ResearchRun` at all, and `routeCapability`'s importer list is closed to Virtual Lab and Replay
  (invariant 11, added here).

**Nothing to remove.** Deleting the capability worker would delete Virtual Lab dispatch and remote
Replay. Deleting the ResearchRun worker would delete the lease model PR #81 exists for.

---

## 4. RED-3 — the browser-local Discovery Engine (the one genuine duplicate)

`packages/frontend/src/core/discovery/*` is a complete second Evidence + Replay implementation
inside the browser:

| Canonical (backend) | Browser-local (frontend) |
|---|---|
| `researchRunExecution.mjs::executeResearchExperiment` | `core/discovery/discoveryEngine.ts::runDiscoveryCase` |
| `campaign/verify.mjs::verifyScienceRun` | `core/discovery/discoveryReplay.ts::replayDiscoveryCase` |
| `knowledgeApi.mjs` evidence ledger (hash-chained, server) | `core/discovery/evidenceStore.ts::LocalEvidenceStore` (the viewer's `localStorage`) |
| evidence content hashes in the ledger | `core/discovery/evidenceCrypto.ts::computeEvidencePackSha256` |

It runs the in-browser `core/simulation/scenarioEngine` (the SEIR epidemic model), mints its own
evidence pack, hashes it, and produces its own replay verdict with the same words the canonical path
uses (`MATCH` / `DRIFT` / `WITHIN_TOLERANCE`). Nothing it produces is in the canonical ledger, and
nothing in the canonical ledger comes from it.

**Why it is not a second brain in practice.** It has exactly **one** product surface:
`components/visual-simulation/EvidenceReplayPanel.tsx`, reached only from the City 3D demo screen
(`components/visual-simulation/City3DWebGLScreen.tsx:29`, `:822`) — a Worlds demo, not the research
product. Every other consumer of the four primitives is a test. No ResearchRun-facing frontend module
(`core/backend/client.ts`, `core/verifyTarget.ts`, `core/scienceChat/*`, `components/verify/*`,
`components/labHandoff/*`, `components/reports/*`) touches any of them, so a `localStorage` artefact
has no route into the one ledger.

**Why it was not removed here.** Not a small, safe, mechanical change. It is ~16 modules, a shipped
demo panel, and ten test files (`discoveryEngine`, `evidenceStore`, `evidenceStoreConvergence`,
`evidenceReplayIntegration`, `evidenceCrypto`, `replayDriftCoverage`, `discoveryFollowUp`,
`protectionPriority`, `experimentComparison`, `contactNetwork`), plus a further frontend family built
on the same `core/provenance/recordStore.ts` (`core/hazard/hazardReplay.ts`,
`core/hazard/hazardProvenanceStore.ts`, `core/matrixFoundation/replayVerdict.ts`,
`core/evidenceConnectors/store.ts`). D-161 is also a *correctness fix inside this duplicate*, so it
is load-bearing for a decision already recorded.

**RED_INTEGRATION item (exact files, owner decision).** Either
(a) keep it as a declared demo: rename the vocabulary so a browser pack cannot be mistaken for
Genesis Evidence (`DiscoveryEvidencePack` → `LocalDemoEvidencePack`, the replay verdict prefixed
`DEMO_`), touching `core/discovery/discoveryCase.ts`, `evidenceStore.ts`, `evidenceCrypto.ts`,
`discoveryReplay.ts`, `EvidenceReplayPanel.tsx` and the ten tests; or
(b) redirect the panel at the canonical loop: replace `runDiscoveryCase` / `replayDiscoveryCase` in
`EvidenceReplayPanel.tsx` with a ResearchRun started through `core/backend/client.ts`, and delete
`core/discovery/{discoveryEngine,discoveryReplay,evidenceStore,evidenceCrypto}.ts`. (b) is the
architecture; it is a feature-sized change, not a mechanical one, and it needs the epidemic scenario
available as a ResearchRun engine first.

Until one is chosen, invariant 10 makes the containment a test rather than a habit.

---

## 5. What was changed on this branch

- `packages/backend/src/architecturalInvariants.test.mjs`: **25 → 40 tests.** Added invariant 8 (one
  stage-timing authority, 5 tests), invariant 9 (one schema authority, 2), invariant 10 (browser-local
  Discovery Engine containment, 5), invariant 11 (the two worker systems, 2), and one test in
  invariant 7 (a ResearchRun is started from the HTTP seam only). Added `frontendModules()` /
  `frontendMentions()` so an invariant can see across the package boundary, because the duplicate
  Genesis actually has is in the browser.
- No allowlist or verdict in the inherited 25 tests was wrong; none was changed. One new check had to
  be weakened from "no module may name the speedup vocabulary" to "no module may *declare* it",
  because `api.mjs:902` documents in a comment what its route reports — the file's own rule that a
  module naming a symbol in a comment is documenting the architecture, not joining it.
- This document, which the test header already pointed at.
- No production module was edited. Nothing was removed or redirected: the only genuine duplicate
  (RED-3) is not a small change, and is reported above instead.

**Negative check.** Appending `import { routeCapability } ...` and `openStage()` to
`researchRunJobs.mjs` turns invariants 4 and 11 red; reverting turns them green. The tests fail on a
second path rather than merely passing on today's one.
