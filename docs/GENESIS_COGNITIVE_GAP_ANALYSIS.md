# Genesis Cognitive Gap Analysis (Priority 0)

**Date:** 2026-07-14 · **Branch:** development
**Purpose:** Forensic map of the *current* repository against the target
**Scientific Cognitive Architecture v3**, so that evolution reuses validated
infrastructure and never rewrites working science to "look cleaner."

**Method (per directive):** maturity is judged from **execution paths and
tests**, not filenames. Evidence cites `file:line` and test names. Four
independent read-only inspections mapped orchestration, the epistemic subsystem,
persistence/provenance, and the AI/agent/model layer; findings were
cross-checked against verified test runs from the Priority-0 / Step-H session
(all 7 engines installed and reference-validated; backend **245/245**, frontend
**601/601**, build green).

**Maturity scale:** 0 absent · 1 stub/naming-only · 2 partial · 3 works
(limited/untested edges) · 4 works + tested · 5 production-hardened + benchmarked.

**Honesty note on runtime:** the scientific engines (RDKit, PySCF, OpenMM,
Vina+Meeko, Biopython, ADMET-AI) were installed and validated into *this
ephemeral container* during Step H. A fresh session starts with them absent, at
which point the engine-gated tests self-skip and the corresponding capabilities
report `BLOCKED_BY_RUNTIME` — honestly, never faked. Where a maturity below rests
on code inspection rather than observed execution, it is marked.

---

## 1. Executive synthesis

The repository already contains a **real, deterministic, evidence-persisted
first-generation discovery engine** — the "Scientific Acceleration Engine": a
single-domain (DRUG_DISCOVERY) generational optimization loop with rule-based
per-generation adaptation, multi-fidelity capability gating over genuinely
validated engines, append-only provenance, replay verification, cross-engine
conflict surfacing, and an evidence-backed WHY layer.

It is **not yet a cognitive architecture**. The target loop
(GOAL → UNDERSTAND → DECOMPOSE → COMPETING HYPOTHESES → TASK DAG → ESTIMATE →
SELECT ENGINES → AGENT TEAM → EXECUTE → EVIDENCE → CRITICIZE → VERIFY →
ACCEPT/REJECT → MUTATE → ITERATE) maps onto the existing engine as follows:

- **Strong and reusable (keep, extend):** scientific compute engines + toolchain
  validation, provenance/contentHash, Scientific Run records, replay
  verification, persistence (node:sqlite, 18 tables, migrations, RBAC), the
  adaptive next-experiment rule engine, MCRE conflict detection, the WHY engine,
  the frontend ModelGraph causal-DAG engine, and the honest capability-gap
  labelling.
- **Partial (generalize):** the orchestrator (fixed generational loop → needs a
  scheduler), strategy mutation (parameter-level → needs first-class
  `WorkflowMutation`), the Discovery Graph (post-hoc lineage tree → needs
  execution/DAG semantics), and the fragmented epistemic-status vocabulary.
- **Absent (build):** a Mission Planner, a Scientific Task DAG with lifecycle
  states, a competing-Hypothesis Engine, an independent Critic Swarm, a
  generalized Evidence Store ontology (Mission/Question/Hypothesis/Finding/
  Observation/WorkflowMutation), a Model Abstraction + Routing layer, and the
  Dynamic Agent Fabric.

**Design consequence:** the target architecture is largely a **generalization
and re-layering of what exists**, plus three genuinely new modules (Hypothesis
Engine, Critic Swarm, Agent Fabric). The biggest single lever is promoting the
Discovery Graph from a post-hoc lineage tree to a real **Scientific Task DAG**
with lifecycle states, because the DAG is the spine the whole loop hangs on — and
a working DAG-propagation engine already exists on the frontend (`ModelGraph`)
that can seed its design.

---

## 2. Capability matrix

Columns: **Capability · Current implementation · Evidence · Maturity (0-5) ·
Reusable · Missing components · Target module.**

### A. Scientific compute substrate (existing strength)

| Capability | Current implementation | Evidence | Maturity | Reusable | Missing components | Target module |
|---|---|---|---|---|---|---|
| Scientific compute engines | RDKit, PySCF, OpenMM, AutoDock Vina+Meeko, Biopython, ADMET-AI via short-lived Python workers behind Node adapters | `compute/{rdkit,qm,md,docking,protein,admet}Adapter.mjs` + `*_worker.py`; `heavyEngines.test.mjs` 11/11; toolchain all AVAILABLE this session | 5 | **Yes (core)** | reproducible install baked into image (ephemeral now) | Scientific Compute Engines (tools) |
| Toolchain registry + capability validation | Runtime validation by real reference cases before `AVAILABLE` | `campaign/toolchain.mjs:115-227`; `TOOL_STATUS` enum `:19-27`; `heavyEngines.test.mjs` §6 | 4 | **Yes** | engine *selection* logic (registry lists, doesn't choose) | Engine Selection / Capability Gate |
| Verified Scientific Adapter Contract | DETECT→VERSION→VALIDATE→EXECUTE→PARSE→HASH→VALIDATE_REF→REGISTER | `docs/SCIENTIFIC_ACCELERATION_ENGINE.md §9`; adapter `detect()`/reference cases | 4 | **Yes** | contract not enforced by a shared base (copied per adapter) | Compute Engine SDK |
| Capability-gap / honesty labelling | `AVAILABLE/UNVALIDATED/CAPABILITY_GAP/BLOCKED_BY_RUNTIME/_LICENSE/_RESOURCES/VALIDATION_FAILED` | `toolchain.mjs:19-27`; `client.ts:415-417`; surfaced in `CampaignScreen.tsx`, `DrugDiscoveryScreen.tsx:199-207` | 4 | **Yes** | unify with epistemic status (row D-18) | Honesty/Evidence layer |
| Sandbox / controlled execution | Engines run as short-lived subprocesses: hard timeouts, fixed non-shell argv (`execFileSync`), input/size validation, artifact dirs | `rdkitAdapter.mjs:28-36`; `admetAdapter.mjs:18-40`; `docs/HEAVY_ENGINES_FINAL_REPORT.md §42` | 3 | **Yes** | true isolation (container/seccomp), per-exec CPU/mem caps, artifact retention | Sandbox / Controlled Execution |

### B. Orchestration & workflow

| Capability | Current implementation | Evidence | Maturity | Reusable | Missing components | Target module |
|---|---|---|---|---|---|---|
| Mission Planner (goal→plan) | None; free-text `objective` string + **hardcoded** default objective vector/constraints | `api.mjs:532-535`; `drugAdapter.mjs:13-23`; `orchestrator.mjs:68-69` | 1 | Partial (objective/constraint schema) | goal decomposition; extract questions/assumptions/unknowns; required-evidence + verification requirements; engine/compute estimation; stop conditions | **Mission Planner (P2)** |
| Scientific Task DAG + lifecycle states | Absent as specified. Campaign status 4-state (`created/running/completed/cancelled`); candidate 2-state (`retained/rejected`); "graph" is a post-hoc lineage **tree** | `orchestrator.mjs:41,79,114-119`; `discoveryGraph.mjs:9-57`; requested enum (READY/RUNNING/BLOCKED/COMPLETED/FAILED/REJECTED/SUPERSEDED) grep-absent | 1 | Partial (node/edge builder; event log) | task graph + scheduler + dependency resolution + the 7-state lifecycle | **Scientific Task Graph / DAG (P2)** |
| Meta-orchestrator (select engines, schedule stages) | Fixed generational `while` loop; hardcoded stage if-chain ADMET→docking→QM gated by caller-passed booleans; **real** capability-availability gate | `orchestrator.mjs:64-201`; `multiFidelity.mjs:264-340`; `capabilityAvailable` `toolchain.mjs:224-227` | 2 | Partial (loop, capability gate, job system) | engine *selection*, stage *scheduling*, DAG traversal, compute estimation | **Meta-Orchestrator** |
| Dynamic workflow mutation | Mutates **strategy parameters** (transformation weights, parent-selection) fed forward; persisted as `campaign_decisions` with `state_hash`+evidence; **no** structural mutation, **no** `WorkflowMutation` entity | `orchestrator.mjs:173-183`; `nextExperiment.mjs:33-101`; proof weight-0→not executed `campaignEngine.test.mjs:18-26`, `campaignCore.test.mjs:43-53` | 3 | **Yes** (decision loop + append-only store) | `WorkflowMutation` record (prev-workflow-hash, trigger, reason, changed-tasks, expected info-gain, compute-Δ, risk-Δ); structural (not just parametric) mutation; "strategy is failing" trigger | **Dynamic Scientific Workflow Engine (P3)** |
| Adaptive next-experiment selection | Real evidence-driven rule cascade over persisted metrics (Pareto size, HV delta, diversity, per-transform success) | `nextExperiment.mjs:33-101`; `DECISIONS` enum `:11-20`; `campaignCore.test.mjs:34-88` | 4 | **Yes** | information-gain / acquisition function; surrogate model (it is heuristic, not info-gain) | Workflow Engine (P3) |
| Stop conditions / budgets | Four explicit stop reasons + generation/candidate **count** budgets + API hard caps (≤8 gen, ≤400 cand) | `nextExperiment.mjs:22-53`; `orchestrator.mjs:112-133`; `api.mjs:526-527,540-541`; `campaignCore.test.mjs:66-87` | 4 | **Yes** | compute/wall-clock/FLOP budget; cumulative campaign compute budget | Compute & Evidence Estimator |

### C. Epistemic engine (scientific method as software)

| Capability | Current implementation | Evidence | Maturity | Reusable | Missing components | Target module |
|---|---|---|---|---|---|---|
| Competing-hypothesis engine (H1..Hn) | Absent as specified; only a single frontend correlation-note tagged `kind:'hypothesis'` (|r|>0.7) | `experimentAnalysis.ts:163-178`; `experimentAnalysis.test.ts:80-97`; `types.ts:70` | 1 | No | full generator: claim / assumptions / predicted + **disconfirming** observations / required evidence / confidence / status | **Hypothesis Engine (P4)** |
| Independent critic (proposer≠verifier, adversarial) | Only engine-vs-engine disagreement (MCRE) + replay (same engine judges itself); no critic agent | `multiFidelity.mjs:239-257`; `verify.mjs` | 2 | Partial (MCRE + verify separation patterns) | independent critic agents; adversarial/refutation verification; multi-critic voting with info-value gating | **Independent Critic Swarm (P4)** |
| Scientific verification engine (replay + tolerance) | `replayScienceRun` re-executes the **real** engine from stored inputs; per-capability tolerance; non-binary verdicts; append-only audit | `verify.mjs:50-167`; `VERDICT` enum `:50-56`; `TOLERANCE` `:69-74`; `campaignVerify.test.mjs` (positive paths ran green this session) | 4 | **Yes (strong)** | falsification-test design; cross-method (not just replay) verification | **Scientific Verification Engine** |
| MCRE conflict detection (never averaged) | Backend: descriptor-favorable vs weak-docking → persisted `MODEL_CONFLICT` event, both values surfaced + resolving action. Frontend: physics variant-spread engine, unit-tested | `multiFidelity.mjs:239-257`; `why.mjs:84-88`; frontend `core/mcre.ts:95-118`, `mcre.test.ts:25-44` | 3 (backend) / 4 (frontend) | **Yes** | generalized N-engine conflict; resolution workflow feeding the DAG | Critic / Verification |
| Consequence-chain / causal derivation | Real `ModelGraph` DAG of pure-function nodes: topo propagation, `causedBy` provenance, cycle-proof by construction, 13 lab graphs, cross-domain edges structural | `core/modelGraph/graph.ts:67-235`; `modelGraph.test.ts`; `labConsequence.test.ts:33-40` | 4 | **Yes (pattern seeds the Task DAG)** | tie to backend campaign/evidence; currently frontend physics-education only | Task DAG / Causal Reasoning |
| WHY engine (evidence-backed answers) | Deterministic answers for candidate/status/Pareto/strategy/next/stop/stage/conflict/engine, strictly from persisted rows; "no evidence" when absent | `why.mjs:12-101`; `campaignAux.test.mjs:40-109` | 4 | **Yes** | generalize beyond campaign vocabulary | Evidence Query / Audit |
| Discovery Graph | Read-projection: nodes (OBJECTIVE/CANDIDATE/TRANSFORMATION/SCIENTIFIC_RUN/STRATEGY_DECISION), edges (GENERATED_FROM/…/STOPPED_BECAUSE); connectivity asserted | `discoveryGraph.mjs:9-57`; `campaignAux.test.mjs:90-101` | 4 (thin) | **Yes** | query/path engine; execution (schedulable) semantics vs read-only | Discovery / Evidence Graph |
| Epistemic status taxonomy | Fragmented across **three** enums: verify verdicts, tool status, `evidence_class` (`DETERMINISTIC`/`MODEL_ESTIMATE`). Only `BLOCKED_BY_RESOURCES` + `CAPABILITY_GAP` exist verbatim | `verify.mjs:50-56`; `toolchain.mjs:19-27`; `store.mjs:306` | 2 | Partial | unified `VERIFIED/SUPPORTED/PROVISIONAL/UNVERIFIED/CONTRADICTED/BLOCKED_BY_RESOURCES/CAPABILITY_GAP` + confidence updated from evidence | Evidence Store epistemic layer (P1) |

### D. Evidence store, provenance & persistence

| Capability | Current implementation | Evidence | Maturity | Reusable | Missing components | Target module |
|---|---|---|---|---|---|---|
| Persistent datastore | `node:sqlite` `DatabaseSync` (real transactional DB), 18 tables, forward migrations to v8 via `PRAGMA user_version`, WAL, FK cascade | `store.mjs:22,39-386`; `store.test.mjs` (FK cascade `:230`); `storeGit.test.mjs` | 5 | **Yes (foundation)** | — | Evidence Store backbone (P1) |
| Evidence Store canonical entities | Partial ontology via campaigns+runs: **exist** — ScientificRun, VerificationAttempt (append-only), Decision (`state_hash`+evidence), Contradiction (as `MODEL_CONFLICT` event), Artifact-ref, evidence_class. **Absent** — ResearchMission, ResearchQuestion, Hypothesis, Finding, Observation, WorkflowMutation | `store.mjs:223-338`; `persistence.mjs:110-120`; mapping in inspection | 2 | Partial | 6 missing entities; a generic `Evidence` object (stable id, mission id, source+location, timestamp, contentHash, provenance ref, engine/agent origin, epistemic status, confidence, verification status, parent, related hypothesis, artifact refs) | **Evidence Store (P1)** |
| Provenance / contentHash | `sha256Hex16` (order-sensitive, legacy-identical) + `canonicalHash` (key-sorted full sha256) + `maxRelativeDiff` + `snapshotEnvironment` | `provenance.mjs:31-81`; `provenance.test.mjs:12,26`; used for BRICS proof hash this session | 5 | **Yes (must preserve semantics)** | — | Provenance (cross-cutting) |
| Scientific Run records | `science_runs`: engine/version/capability/method/status/evidence_class/inputs/outputs/units/warnings/provenance/input_hash/output_hash/artifacts/duration/env_hash | `store.mjs:296-320`; writer `saveScienceRun` | 5 | **Yes** | — | Evidence Store |
| Reproducibility / replay verification | Re-executes real engine, classifies MATCH/DRIFT/ENGINE_VERSION_CHANGED/BLOCKED/REPLAY_UNSUPPORTED; append-only history | `verify.mjs:115-167`; `campaignVerify.test.mjs` (positive paths green with engines installed; skip when absent) | 4 | **Yes** | verification of non-replayable/stochastic methods | Verification Engine |
| Artifact storage | Python workers write PDBQT etc. to tmp dir; `{kind,path,sha256_16}` persisted | `dock_worker.py:101-136`; `dockingAdapter.mjs:22,36-44`; `multiFidelity.mjs:103` | 4 | **Yes** | durable artifact store + retention/GC (bytes live in ephemeral tmp) | Artifact Store |
| Job system | In-process async lifecycle `queued→running→completed/failed/cancelled`, idempotent, cancel at safe yield points; handlers batch-eval/campaign-run/campaign-stage | `compute/jobs.mjs:18-120`; `jobs.test.mjs` | 4 | **Yes** | distributed execution; compute-budget scheduler | Execution layer |
| Benchmark infrastructure | 6 real per-engine benchmarks + pure `stats.mjs` (rmse/mae/pearson/accuracy) + fabricated-data guards (blocked-path honesty, labeled published metrics) | `benchmark/runner.mjs`, `stats.mjs`, `dockingBenchmark.mjs:60-64`; `benchmarkSuite.test.mjs` | 3-4 | **Yes** | decision-quality benchmarks; per-engine numbers unverified when engines absent | Benchmark layer |
| RBAC / auth | `ROLE_RANK viewer<editor<admin<owner`; scrypt hashing, timing-safe verify, 256-bit sessions | `store.mjs:28-34`; `auth.mjs`; `auth.test.mjs` | 4 | **Yes** | — | Access control |

### E. Agents, models & cognitive UI

| Capability | Current implementation | Evidence | Maturity | Reusable | Missing components | Target module |
|---|---|---|---|---|---|---|
| Model abstraction / provider routing | Single direct `Anthropic` call; one env-configurable model id; no provider interface | `server.mjs:26,43,54,164-165`; `narrator/engine.ts:22-43` (unused provider hook) | 1 | Partial (narrator provider swap-point) | provider interface; role routing REASONING/CODE/FAST/CRITIC; fallback | **Model Abstraction & Routing (P6)** |
| Dynamic Agent Fabric (roles/team/count) | Absent — no multi-agent/role concept anywhere | grep `Lead Scientist|Critic|AgentRole|team` → 0 matches; `nextExperiment.mjs:6-9` "not AGI, deterministic rules" | 0 | No | agent roles, dynamic team composition, model routing per role, shared mission state (not full transcripts) | **Dynamic Agent Fabric (P5)** |
| LLM grounding & honesty | Context-only grounding + KB RAG-lite excerpt + refusal handling + prompt-enforced confidence labels + no-key 503 | `server.mjs:81-90,106-184`; `lib.mjs:43-60,153`; `askAI.test.ts` (8 cases) | 3 | **Yes (pattern)** | programmatic (not prompt-only) honesty checks; `/api/ask` server integration test | Agent grounding |
| Deterministic narrator engine | Always-on Layer-0: computes real physical quantities from live sim state; LLM never computes numbers | `narrator/engine.ts:27-32`; `knowledge/ai-discovery.md:9-13` | 4 | **Yes** | — | Deterministic reasoning layer |
| Model cost / latency / token accounting | Latency + returned model id logged for AI; **no** token/usage/cost (`response.usage` never read) | `server.mjs:174,178`; `max_tokens:600 :166` | 1 | Partial | token/compute/cost recording per call & per role | Model Routing telemetry (P6) |
| Frontend cognitive surfaces | `CampaignScreen.tsx` (live 2s polling of persisted state, Pareto, WHY buttons, MCRE panel, run verification) and `DrugDiscoveryScreen.tsx` (target→candidate→passport→ranking, explicit CAPABILITY GAP) — wired to real backend, no mock | `CampaignScreen.tsx:13-17,115-125,307-417`; `DrugDiscoveryScreen.tsx:199-207`; `client.ts` status enums | 4 | **Yes** | mission/DAG/hypothesis/critic UI surfaces | Cognitive UI |

---

## 3. Reuse & preservation directives (do NOT rewrite)

These are validated and load-bearing; the new architecture must **wrap/extend**,
not replace:

1. **Compute engines + adapters + toolchain validation** — the real science.
2. **Provenance primitives** (`provenance.mjs`) — preserve `sha256Hex16` /
   `canonicalHash` semantics byte-for-byte (legacy hashes depend on them).
3. **Persistence** (`store.mjs`, migrations, RBAC) — extend the schema forward
   (v9+), never recreate.
4. **Scientific Run + replay verification + append-only audit** — the
   reproducibility spine.
5. **Adaptive next-experiment rule engine + WHY + MCRE** — genuine, tested
   evidence-driven logic; generalize, keep the tests green.
6. **Frontend `ModelGraph` causal-DAG engine** — the best existing DAG code;
   reuse its propagation/`causedBy` design for the backend Task DAG.
7. **Honesty labelling & capability gaps** — never remove; unify into one
   epistemic taxonomy.

## 4. Net-new modules required (ranked by leverage)

1. **Scientific Task DAG with lifecycle states** (P2) — the spine; promote the
   Discovery Graph from post-hoc tree to schedulable DAG (seed from `ModelGraph`).
2. **Evidence Store ontology** (P1) — add Mission/Question/Hypothesis/Finding/
   Observation/WorkflowMutation entities + a generic Evidence object atop the
   existing DB; unify epistemic status.
3. **Mission Planner** (P2) — goal → questions/assumptions/unknowns/required-
   evidence/engine-selection/verification/stop-conditions.
4. **Dynamic Workflow Engine + first-class `WorkflowMutation`** (P3) — structural
   (not just parametric) mutation triggered by information-gain, fully recorded.
5. **Hypothesis Engine** (P4) — competing H1..Hn with disconfirming predictions.
6. **Independent Critic Swarm** (P4) — proposer≠verifier, adversarial, info-value-
   gated agent count.
7. **Model Abstraction & Routing** (P6) — provider interface + role routing +
   token/cost/latency telemetry.
8. **Dynamic Agent Fabric** (P5) — role-based teams sized by task complexity.

## 5. Aggregate maturity snapshot

| Target layer | Weighted maturity | One-line state |
|---|---|---|
| Compute substrate + toolchain | **4.5** | Real, validated, honest — the crown jewel |
| Provenance + persistence + runs | **4.5** | Production-grade DB, hashing, append-only audit |
| Verification + reproducibility | **4** | Real replay + tolerances; positive paths engine-gated |
| Adaptive optimization loop | **3.5** | Real rule-based adaptation; heuristic, single-domain |
| Epistemic labelling | **2.5** | Present but fragmented across 3 enums |
| Orchestration / DAG / planner | **1.5** | Generational loop; no planner, no lifecycle DAG |
| Hypothesis / critic (scientific method) | **1.5** | Reproducibility ≠ hypothesis generation |
| Model routing + agent fabric | **0.5** | Single LLM call; no agents, no routing |

**Conclusion:** Genesis has a **world-class evidence & compute floor** and a
**missing cognitive ceiling**. The path forward is generalization of proven parts
(DAG, evidence store, workflow mutation) plus three new modules (hypothesis,
critic, agent fabric) — executed incrementally, each gated by the same honesty
contract and the existing test/provenance discipline. No validated science is to
be discarded.

---

*This document is Priority-0 output only. No implementation of Priorities 1-6 has
begun. Recommended first implementation step: extend the persistence schema (v9)
with the Evidence Store ontology and a Scientific Task DAG table + lifecycle
states, because every later module reads and writes through them.*
