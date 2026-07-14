# Genesis — Scientific Acceleration Engine · Final Report

Adaptive, evidence-driven computational campaign control layered above the
existing verified scientific engines. This report maps every directive priority
and hard constraint to what was actually built and how it is proven. Numbers are
from executed tests and one recorded reference run (`npm run campaign:demo`).

**Honesty contract (persisted, enforced):** No fake science. No fake autonomy.
No fake self-learning. No fake counters. No fake discoveries. No LLM-generated
numerical scientific evidence. This is not consciousness, not AGI, not
self-learning. Rule-based, deterministic, evidence-backed.

---

### 1. Repository state
Built on HEAD `4081739` (engine core). Milestones pushed to
`claude/quantum-forge-p845ux`: `4081739` → `16cd658` → `5982ced` → `7a87fe9`.

### 2. Scientific Campaign persistence (P1)
`store.mjs` schema v6 adds `campaigns`, `campaign_candidates` (full lineage),
`campaign_decisions` (append-only), `campaign_events` (append-only). Access via
`campaign/persistence.mjs`. Objective, domain, objective vector, constraints,
budget, stopping, strategy, generation, status, candidates, decisions, events,
Pareto flags and final result set are all persisted. Decisions/events are never
rewritten.

### 3. Genesis Scientific Orchestrator (P2)
`campaign/orchestrator.mjs` runs the loop and persists every runtime state
(OBJECTIVE_RECEIVED, ANALYZING_DOMAIN, EXECUTING, VALIDATING_RESULT,
SELECTING_NEXT_EXPERIMENT, SEARCH_STRATEGY_UPDATED, STOPPING_CONDITION_REACHED)
as real events. No fake progress: progress = generation/budget, and every state
corresponds to a persisted row.

### 4. Universal Discovery Loop (P3)
DEFINE → GENERATE → VALIDATE → EXECUTE → EVALUATE → COMPARE → REJECT/RETAIN →
ANALYZE → SELECT NEXT → MODIFY STRATEGY → GENERATE → RECOMPUTE → RANK. The first
real domain adapter is DRUG_DISCOVERY; other domains are explicit CAPABILITY_GAP
(rejected at the API), never faked.

### 5. Drug Discovery adapter (P4/P5)
`campaign/drugAdapter.mjs` on real RDKit (`rdkit_worker.py`): canonicalization,
malformed rejection, real Crippen logP / MolWt / TPSA / HBD / HBA descriptors,
deterministic SMARTS-reaction transformations (no random string mutation),
canonical dedup, objective vectors, explicit constraints, Pareto, Morgan-Tanimoto
diversity, per-transformation success/Pareto-contribution stats.

### 6. Adaptive Next-Experiment Engine (P6, core differentiator)
`campaign/nextExperiment.mjs` analyzes persisted campaign data and chooses among
DISABLE_LOW_VALUE_TRANSFORMATION, INCREASE_DIVERSITY,
INCREASE_HIGH_VALUE_TRANSFORMATION, CHANGE_TRANSFORMATION_WEIGHTS, and STOP_*.
Each decision is persisted; the next generation uses the changed strategy. Proven
in `campaignCore.test.mjs` (a disabled transformation gets weight 0) and
`campaignEngine.test.mjs` (a weight-0 transformation is not executed).

### 7. Toolchain Registry (P6)
`campaign/toolchain.mjs` + `GET /api/compute/toolchain`. Status is determined at
runtime by executing real reference cases. RDKit is `AVAILABLE` only after aspirin
logP = 1.31 (±0.1) and benzene → methylation = `Cc1ccccc1` both pass; otherwise
`BLOCKED_BY_RUNTIME`/`VALIDATION_FAILED`. Advanced engines are honest
`CAPABILITY_GAP`.

### 8. Capability Gap Resolution
Unsupported domains are rejected with an explicit reason; the molecular engine
reports `BLOCKED_BY_RUNTIME` when RDKit is absent instead of returning numbers.
The UI surfaces a capability-gap banner.

### 9. Verified Scientific Adapter Contract (P8)
DETECT → VERSION → VALIDATE_INPUT → EXECUTE → PARSE → HASH/PROVENANCE →
VALIDATE_REFERENCE_CASE → REGISTER. An engine is `AVAILABLE` only after passing a
real reference case (see §7). Every descriptor computation is saved as a
Scientific Run with provenance.

### 10. Reference Scientific Campaign (P9)
`scripts/campaign-demo.mjs`, one command `npm run campaign:demo`. Documented
non-novel reference chemicals (benzene, phenol, aniline, toluene). Answers all 15
required questions from persisted data. Recorded run: 196 candidates, 196 valid,
0 invalid, 24 duplicates, HV 10.96 → 18.79, 17 on the Pareto front, 172 Scientific
Runs, 4 strategy changes, STOP_RESOURCE_LIMIT. Full details in
`docs/REFERENCE_CAMPAIGN.md`. No therapeutic/clinical claims.

### 11. WHY Engine (P10)
`campaign/why.mjs`: deterministic, evidence-backed answers for candidate
existence, retain/reject, Pareto membership, strategy change, next experiment,
stop reason, and which engine/version/inputs/run produced a result — all from
persisted rows. When evidence is absent it says so; it never fabricates.

### 12. Discovery Graph (P11)
`campaign/discoveryGraph.mjs`: nodes (OBJECTIVE, CANDIDATE, TRANSFORMATION,
SCIENTIFIC_RUN, STRATEGY_DECISION) and edges (GENERATED_FROM, TRANSFORMED_BY,
EXECUTED_AS, REJECTED/RETAINED_BECAUSE, CAUSED_STRATEGY_CHANGE, STOPPED_BECAUSE)
built only from persisted events. Tests assert every edge connects existing nodes
(no decorative data).

### 13. Scientific Acceleration UI (P12)
`CampaignScreen.tsx` at `#/campaign`: verified engines, capability gaps, objective,
status, current generation, candidates generated/valid/invalid/duplicates/
rejected/retained, Pareto front, diversity, hypervolume, current strategy, last
decision, next-experiment history, stopping condition, Discovery Graph stats, and
WHY buttons. Every counter/message polls real persisted state — no fake counters,
no fake terminal.

### 14. Acceleration Report (P13)
Printed by the demo and captured in `docs/REFERENCE_CAMPAIGN.md`: wall-clock and
engine runtime, generations, candidates generated/validated, invalid, duplicates,
Scientific Runs, retained/rejected, strategy changes, next-experiment decisions,
Pareto size, hypervolume, stop reason, graph size. **No "one day in one hour"
claim** — that requires a controlled baseline this benchmark does not measure.

### 15. Resource Control (P14)
Budgets enforced in the orchestrator (max generations, max generated candidates);
API clamps to hard limits (≤ 8 generations, ≤ 400 candidates). No infinite loops:
every loop has an explicit stopping decision, and cancellation is checked between
generations.

### 16. API surface
`/api/projects/:id/campaigns` (list/create), `/:cid` (inspect), `/:cid/start`,
`/:cid/cancel`, `/:cid/candidates|decisions|events|graph|why`, and public
`/api/compute/toolchain`. RBAC: create/start/cancel editor+, reads viewer+.

### 17. Background execution
`start` enqueues a `campaign-run` job (`compute/jobs.mjs`) that runs the real
orchestrator via the async Job System; cancel is honored between generations.

### 18. Determinism
No RNG anywhere in the loop: sorted parent/transformation selection, canonical
dedup, fixed reference cases. Same engines + same seeds → same campaign.

### 19. Multi-objective correctness
`campaign/pareto.mjs`: minimization dominance, Pareto front, and a **monotonic**
2D hypervolume (fixed from an earlier non-monotonic bug). Unit-tested.

### 20. Provenance
Each candidate's descriptors are a persisted Scientific Run (model id, version,
inputs, provenance). `whichEngine` traces a candidate to its run(s).

### 21. Lineage
Every generated candidate stores parent id, parent SMILES and the transformation
that produced it; tests assert lineage survives persistence.

### 22. Rejection reasons
Invalid structures and constraint violations are persisted with explicit reasons;
duplicates recorded as `duplicate`. The demo reports the reason histogram.

### 23. Strategy → execution proof
A transformation with weight 0 is never executed (`campaignEngine.test.mjs`);
the demo confirms later generations consume the updated strategy.

### 24. Tests added
`campaignCore.test.mjs`, `campaignEngine.test.mjs`, `campaignAux.test.mjs`,
`apiCampaign.test.mjs`. Backend suite: **181 tests pass** across 49 suites.

### 25. Frontend verification
`tsc --noEmit` clean; **601 vitest tests pass**; production build succeeds;
`#/campaign` added to the runtime smoke sweep.

### 26. Lint & drift
`eslint .` clean; `compute:bundle:check` confirms the shared compute core bundle
is in sync (no formula drift).

### 27. What is real
Canonicalization, descriptors, transformations, dedup, Pareto/hypervolume,
diversity, adaptive decisions, persistence, WHY, Discovery Graph, resource limits.

### 28. What is explicitly NOT claimed
No docking, MD, QM, ADMET, toxicity, binding affinity, therapeutic value, or
clinical outcome. Descriptors are 2D cheminformatics. The MPO objective is a
synthetic search target, not a biological endpoint.

### 29. Honest capability gaps
Non-DRUG_DISCOVERY domains and advanced engines are surfaced as CAPABILITY_GAP;
RDKit-absent environments report BLOCKED_BY_RUNTIME. No gap is masked with numbers.

### 30. No fake self-learning
Decisions are rule-based over persisted metrics. There is no model training, no
weights learned from gradients, no hidden state — the "adaptation" is transparent
and inspectable via WHY.

### 31. Preserved prior functionality
Backend Compute Engine, ModelGraph, Scientific Runs, Scientific Git, MCRE,
Measurement Market, Trial Series, Machine Pre-Build, CDE, Drug Discovery, RDKit,
Job System, Candidate Passport/Lineage, all labs — unchanged and still green.

### 32. Out-of-scope items not started
No FMEA, Material Discovery, Science Worlds, multiplayer, wormholes, or portals —
per directive, deferred.

### 33. Reproduction command
`npm run campaign:demo` (deterministic; prints the 15 answers + Acceleration
Report; exits non-zero if the required behaviour is not demonstrated).

### 34. Files
Backend: `campaign/{persistence,pareto,drugAdapter,nextExperiment,orchestrator,
why,discoveryGraph,toolchain}.mjs`, `store.mjs` (v6), `api.mjs`, `compute/jobs.mjs`.
Frontend: `components/CampaignScreen.tsx`, `core/backend/client.ts`, `App.tsx`,
`styles.css`. Scripts/docs: `scripts/campaign-demo.mjs`,
`docs/REFERENCE_CAMPAIGN.md`, this report.

### 35. Verification summary
tsc clean · eslint clean · backend 181/181 · frontend 601/601 · build OK ·
bundle drift-check OK · reference campaign PASS on real RDKit 2026.03.3.

### 36. Bottom line
The campaign-control layer is real and evidence-driven end to end: it generates on
real chemistry, ranks with correct multi-objective math, adapts its own next
experiment from persisted data in a way that measurably changes execution, stops
on explicit resource limits, and can justify every decision from stored evidence —
without a single fabricated number, and without overclaiming what it is.
