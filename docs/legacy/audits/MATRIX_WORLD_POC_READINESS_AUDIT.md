# Matrix World POC — Technical Readiness Audit

**Status:** Audit only. No Matrix World code, no agents, no City3D / Earthquake / Epidemic Core / Scientific Core / routing / GIS / live data / EvidenceStore / HazardProvenanceStore / deploy change. Nothing in this document was implemented.

**Baseline:** `origin/manus/high-fidelity-epidemic-digital-twin` @ `b3e117b` ("test: cover retained hazard input shapes"). Audit branch: `claude/matrix-world-poc-readiness-audit`.

**Scope of the question:** is Genesis technically ready to host a future POC of 50–100 agents with `World + Agents + Time + Rules + Events + Scenario A/B + Determinism + Replay + Evidence`?

Every row below cites a real file and a real exported symbol or test. Classification: **EXISTS** (usable as-is), **REUSABLE WITH ADAPTER** (real, but needs a wrapper for this purpose), **MISSING** (does not exist today), **OUT OF SCOPE** (exists but must not be touched/reused for this).

---

## 1. Capability inventory

| Capability | Verdict | Evidence (file → symbol) |
|---|---|---|
| **World** (spatial container, buildings, layout) | EXISTS | `core/world/cityWorld.ts` → `buildCity()`, `CityLayout`, `Building`, `buildingAt()`, `pointInBuilding()` |
| **World** (read-only projection contract for a consumer) | EXISTS | `core/simulation/worldEngineContract.ts` → `WorldStateView`, `projectWorldState()`, `WORLD_ENGINE_CONTRACT_VERSION = '1.0.0'` |
| **World** (field-level governance: what is modelled vs not) | EXISTS | `core/world/worldEngineInterface.ts` → `FieldProvenance` (`'MODEL_DERIVED' \| 'WORLD_DERIVED' \| 'NOT_MODELED'`), `WORLD_ENGINE_FIELD_CONTRACT`, `validateWorldPayload()` |
| **Agents** (identity, home, goal, role, age, movement) | EXISTS | `core/agents/cityAgent.ts` → `CityAgent`, `spawnAgents()`, `chooseDestination()`, `stepMovement()` |
| **Agents** (population cohorts / age bands) | EXISTS | `core/agents/cohortModel.ts` → `AGE_BANDS` (`'child' \| 'adult' \| 'senior'`); per-band outcomes in `core/simulation/scenarioEngine.ts` → `BandOutcome` |
| **Agents** (beliefs, memory, utility, planning, cognition) | **MISSING** | No such symbol anywhere in `core/`. `CityAgent` carries only `homeIdx`, `destIdx`, `destKind`, `dwell`, `exposedAt`, `infectedAt` plus spatial `goalX/goalY`. No LLM/agent-reasoning infrastructure exists in `core/` (no `anthropic`/`openai`/`llm` import in any `core/**/*.ts`). |
| **Time** (headless, deterministic, fixed-step) | EXISTS | `core/simulation/scenarioEngine.ts` → `runScenario()` loop at lines 472–479: `for day … for step … sim.tick(dt)`, `dt = 1 / stepsPerDay`. No wall clock involved. |
| **Time** (interactive, wall-clock driven) | OUT OF SCOPE for replay | `core/simulationClock/clock.ts` → `SimulationClock.advance(realSeconds, step)`. Fixed-step internally, but driven by `requestAnimationFrame` elapsed time and clamped by `maxDaysPerFrame`. Frame timing decides how many steps run. Must **not** be in a replayable POC path. |
| **Rules** (declarative, domain-neutral consequence engine) | EXISTS | `core/events/consequence.ts` → `GenesisRule` (`trigger`/`when`/`emit`), `runRules()`, `runRulesOverRegistry()`. Ordering is documented deterministic: "kolejność reguł × kolejność `emit` = kolejność rejestracji". |
| **Events** (domain-neutral event contract) | EXISTS | `core/events/genesisEvent.ts` → `GenesisEvent`, `EntityRef`, `GenesisLocation`, `EventProvenance` (carries `seed`, `paramsHash`), `parentEventId` causal chain, `validateEvent()`, `EVENT_TYPE_PATTERN` |
| **Events** (deterministic registry + streaming cursor) | EXISTS | `core/events/eventRegistry.ts` → `EventRegistry.add()`, `makeId()` (canonical-content FNV-1a + `seq`), `since(cursor)`, `children()`, `provenanceOf()`. Refuses events without `provenance.origin` — "no fake events". |
| **Events** (causal chain reconstruction) | EXISTS | `core/events/replay.ts` → `provenanceChain()`, `reconstructionKey()` |
| **Scenario A/B** (named scenarios, run, compare) | EXISTS | `core/simulation/scenarioEngine.ts` → `SCENARIOS`, `ScenarioRun`, `runScenario()`, `compareScenarios()`, `ScenarioComparison` with `BLOCKED_NOT_COMPARABLE` guard |
| **Determinism** (seeded PRNG, stateful stream) | EXISTS | `core/epidemic/agents.ts` → `makeRng(seed)` (mulberry32). Wired at `core/simulation/epidemicCity.ts:147,152` → `this.rng = makeRng(this.params.seed)` |
| **Replay** (recompute + verdict) | EXISTS | `core/simulation/scenarioEngine.ts` → `replayScenario()`, `ScenarioReplayStatus = 'MATCH' \| 'DRIFT' \| 'NOT_COMPARABLE'`; `core/discovery/discoveryReplay.ts` → `replayDiscoveryCase()`, `replayDiscoveryCaseWithTolerance()`; `core/hazard/hazardReplay.ts` → `replayHazardRun()` |
| **Evidence** (completeness-gated pack) | EXISTS | `core/discovery/discoveryEvidence.ts` → `createDiscoveryEvidencePack()`, `collectMissing()`, `DISCOVERY_EVIDENCE_PACK_VERSION`, `serializeDiscoveryEvidencePack()` |
| **Evidence** (immutable provenance persistence) | OUT OF SCOPE to modify, REUSABLE as a pattern | `core/provenance/recordStore.ts` → `KeyedRecordStore`, `LocalRecordStore`, `DuplicateIdPolicy`. The POC must not alter it; it may instantiate its own collection against the same primitive. |
| **World-state fingerprint** (hash of full agent-level world) | **MISSING** | No `worldStateFingerprint` / `snapshotHash` / `stateHash` symbol exists. See §2.3. |
| **Event-trace fingerprint** (hash over the ordered event stream) | **MISSING** | `EventRegistry` has no digest method. `canonicalJson`/`fnv1a` (`core/events/hash.ts`) exist and would make this trivial, but nothing computes it today. |

---

## 2. Determinism — what is genuinely deterministic, and how it is measured

### 2.1 Genuinely deterministic

- **Epidemic core.** `EpidemicCitySimulation` derives its whole RNG stream from `makeRng(params.seed)`; `reset()`/structural param changes re-seed via the private `seed()` (`core/simulation/epidemicCity.ts:147–163, 310–312`). No `Math.random` appears anywhere in `core/simulation/`, `core/agents/`, `core/interactions/`, `core/epidemic/`.
- **Contact resolution keeps RNG-stream stability under feature flags.** `core/interactions/contacts.ts:94–99` draws `p.rng()` on *every* candidate pair regardless of cohort settings, and only the acceptance threshold varies — the source comment states the neutral profile is therefore bit-identical. This is unusually disciplined and is exactly the property a POC needs when adding optional agent traits.
- **Event identity.** `EventRegistry.makeId()` hashes canonical identity fields plus a monotonic `seq` — same inputs in same order ⇒ same IDs.
- **Rules.** `runRules()` iterates `rules` then `emit()` output in array order; no set/map iteration over unordered keys, no time source.
- **Scenario/Discovery/Hazard replay** all recompute and compare fingerprints rather than trusting a stored verdict.

### 2.2 Not deterministic (and correctly so — but must be fenced out of the POC)

- **`SimulationClock`** (`core/simulationClock/clock.ts`) converts real elapsed seconds into a variable number of fixed steps and clamps with `maxDaysPerFrame`. Identical user sessions produce different step counts. It is a presentation-layer driver, not a scientific one.
- **Injectable-RNG scientific modules default to `Math.random`**: `core/quantumState.ts:91,136`, `core/isingModel.ts:49,83`, `core/proteinFolding.ts:118`, `core/decisionMonteCarlo.ts:26,44,80`, `core/physics.ts:71,83`. These are deterministic *only* when the caller injects a seeded `rnd`. Classification: REUSABLE WITH ADAPTER — the adapter is "always pass a seeded RNG".
- **Visual-only modules** use raw `Math.random` by design: `core/three/starfield.ts`, `core/three/genesisPulseScene.ts`, `core/reality/transitVisual.ts`. OUT OF SCOPE — never let these feed a fingerprint.
- **ID minting from wall clock**: `core/customExperiment.ts:46` and `core/decisionExplorer.ts:152` use `Date.now()` + `Math.random()`. Any POC identifier must not follow this pattern.

### 2.3 How determinism is measured today — and the precise gap

Measured by **fingerprint equality plus real recomputation, with negative controls**:

- `src/__tests__/agents.test.ts:11–12` — "same seed → identical stream, different seed → different stream"; `:33–34` — two runs, same seed, identical final counts.
- `src/__tests__/scenarioEngine.test.ts:54–80` — identical fingerprints on repeat; `replayScenario()` returns `MATCH`; a **tampered** fingerprint returns `DRIFT`; a different seed yields different fingerprints.
- `src/__tests__/discoveryEngine.test.ts:73–110` — identical `caseId`/`inputFingerprint`/`runFingerprint`/`evidencePackId`; hypothesis-only edits change `caseId` but *not* `runFingerprint`.

**The gap:** what is fingerprinted is an **aggregate daily trajectory**, not the world. `runScenario()` builds `series` from per-day scalars only — `susceptible/exposed/infectious/recovered/deceased/isolated/hospitalized` plus `hospital` state (`core/simulation/scenarioEngine.ts:485–494`). Agent positions, destinations, dwell timers and per-agent state never enter `resultFingerprint`.

Consequence for a Matrix World POC: **two runs could agree on every existing fingerprint while differing in per-agent world state.** Today that is harmless (aggregates are the scientific claim). For an agent-level POC it is the single most important missing guarantee.

---

## 3. Do the existing boundaries hold for a POC without changing them now?

**Yes — all four boundaries are safe to build behind, unmodified.**

- **`WorldEngineContract`** — `projectWorldState()` is read-only, copies buffers (`.map(t => ({ ...t }))` at lines 297–298), exposes no mutator, and declares gaps explicitly via `WORLD_NOT_MODELED`. A POC consumes `WorldStateView` and cannot corrupt the model through it. Its own doc states the rule: "Renderer nigdy nie liczy tych wartości sam."
- **Scenario Engine** — `ScenarioRun` already persists everything replay needs, including the subtle `preInterventionParams`/`preInterventionHospital` (lines 293–299) precisely so a delayed intervention can be reproduced. `compareScenarios()` refuses incomparable pairs rather than returning a misleading delta. A POC can define new scenarios without touching the engine only if it does **not** need new epidemic parameters; otherwise it needs its own run type (see §4).
- **Event Engine** — `GenesisEvent.parameters` is generic (`P extends Record<string, unknown>`) and the core explicitly does not interpret it. A POC can emit `matrix.*` event types with its own payload and get IDs, ordering, causal chains and provenance **for free, with zero core change**. This is the strongest reuse point in the codebase.
- **Evidence/Replay** — `collectMissing()` blocks a pack whose replay is not `MATCH`/`WITHIN_TOLERANCE`, and the pack carries a hard-coded disclaimer that a conclusion "nie jest odkryciem ani twierdzeniem o świecie rzeczywistym". A POC inherits honest-failure semantics if it reuses this shape.
- **CityWorld** — `buildCity()` is a deterministic pure function of `(width, height)`. `REPLAY_REQUIREMENTS` (`core/world/worldEngineInterface.ts:332–339`) already states the needed invariants in prose, including "Trasa agenta jest funkcją mapy, celu i ziarna — bez ukrytego stanu i **bez zegara ściennego**" and "World Engine nie może mutować pozycji, celu ani stanu agenta". These read as if written for this POC; they are not yet mechanically enforced by a test.

---

## 4. Proposed minimal `MatrixWorldRun` contract — **proposal only, no code written**

Modelled on the two existing run records (`ScenarioRun`, `HazardRun`) so review effort transfers. Fields marked ⚠ have no existing producer.

| Field | Type (proposed) | Source today |
|---|---|---|
| `contractVersion` | `string` | pattern from `WORLD_ENGINE_CONTRACT_VERSION` |
| `matrixWorldRunId` | `string` | deterministic id, minted like `EventRegistry.makeId()` — **never** `Date.now()` |
| `input` | `{ worldSpec, agentSpec, ruleSetId, scenarioArm }` | `CityLayout` + `SpawnParams` exist; `ruleSetId` new |
| `seed` | `number` | `makeRng(seed)` — single stream, single seed |
| `timeStep` | `{ days: number; stepsPerDay: number }` | mirrors `ScenarioRun.days` / `stepsPerDay`; **headless only**, never `SimulationClock` |
| `ruleSetFingerprint` | `string` ⚠ | rules are code today; needs a declared, hashable rule-set id/version |
| `eventTrace` | `readonly GenesisEvent[]` | `EventRegistry.all()` — EXISTS |
| `eventTraceFingerprint` | `string` ⚠ | **MISSING** — computable via `canonicalJson` + `fnv1a` over the ordered trace |
| `worldStateFingerprint` | `string` ⚠ | **MISSING** — must hash agent-level state (id, position quantised, health, destination, dwell), not aggregates. Requires an explicit float-quantisation rule; the existing precedent to copy is the module-private `roundForCrossEngineDeterminism()` at `core/hazard/earthquake/earthquakeModel.ts:44` (not exported — the POC would need its own equivalent, not an import). |
| `inputFingerprint` | `string` | pattern exists (`ScenarioRun.inputFingerprint`) |
| `resultFingerprint` | `string` | pattern exists |
| `evidenceBundle` | `{ missingFields, disclaimer, … }` | shape from `createDiscoveryEvidencePack()` |
| `replayVerdict` | `'MATCH' \| 'DRIFT' \| 'BLOCKED' \| 'NOT_REPRODUCIBLE'` | vocabulary already used by `HazardReplayStatus` — reuse verbatim, do not invent a new one |
| `datasetStatus` | `'SCENARIO'` | mandatory honesty label, as in `HazardDatasetStatus` |
| `notModeled` | `readonly string[]` | pattern from `WORLD_NOT_MODELED` |

**Three genuinely new pieces of work: `worldStateFingerprint`, `eventTraceFingerprint`, `ruleSetFingerprint`.** Everything else is a rename of something already proven.

---

## 5. Risks, ranked by how likely they are to sink the POC

| # | Risk | Assessment | Evidence |
|---|---|---|---|
| 1 | **Semantics — what a result *means*** | **Highest.** An agent-level POC invites claims ("the agents decided…") that the existing evidence layer is built to refuse. The `datasetStatus: 'SCENARIO'` + `notModeled` + disclaimer discipline must be mandatory from commit one, not retrofitted. | `discoveryEvidence.ts` `DISCLAIMER`; `WORLD_NOT_MODELED` |
| 2 | **"Matrix World" is undefined** | **High.** If it means *scripted* agents, most of it exists. If it means *cognitive/LLM* agents, essentially none of it exists — no beliefs, memory, utility or planning anywhere in `core/`, and no LLM infrastructure in `core/`. These are two completely different projects. **This must be decided before any estimate is credible.** | `core/agents/cityAgent.ts` `CityAgent` field list |
| 3 | **Reproducibility at agent level** | **Medium-high**, but tractable. The seeded-RNG discipline is genuinely strong; what is missing is a fingerprint that would *notice* an agent-level divergence (§2.3). Without it a POC can claim MATCH while drifting. | `scenarioEngine.ts:485–494` |
| 4 | **Mixing with the epidemic core** | **Medium.** `WorldStateView` is epidemic-shaped (`epidemic`, `hospital`, `transmissionGraph` are non-optional). A generic Matrix world either fills them with meaningless values or needs its own projection. Do **not** widen `WorldStateView` to fit. | `worldEngineContract.ts` `WorldStateView` |
| 5 | **Event-trace scaling** | **Medium — concrete, already measurable.** `EventRegistry.all()` sorts with a comparator that calls `this.indexOf()` (an O(n) scan) per comparison → ~O(n² log n); `add()` does an O(n) `.some()` parent lookup; `get()`/`children()`/`byType()` are linear scans. Fine for hundreds of events, not for a long multi-agent trace. Fixable with a `Map` index and a stored insertion ordinal — no contract change. | `eventRegistry.ts:55, 72–79` |
| 6 | **Testability** | **Low risk.** The negative-control habit (tampered fingerprint ⇒ `DRIFT`) is already established and directly transferable. | `scenarioEngine.test.ts:74–78` |
| 7 | **Performance at 50–100 agents** | **Lowest risk — effectively already proven.** Default population is **260 agents** (`epidemicCity.ts:72`), i.e. 2.6–5× the POC target, and contact resolution is a spatial hash grid with a 3×3 neighbourhood scan (O(n), not O(n²)). 50–100 agents is not a performance question. | `epidemicCity.ts:72`; `interactions/contacts.ts:67–92` |
| 8 | **Privacy / data** | **Not a risk if scope holds.** Everything is synthetic and local; agent `age`/`role` are RNG-assigned (`cityAgent.ts:24–30`), never real persons. Becomes a real risk only if someone imports real data — which is out of scope. | `cityAgent.ts` `assignPerson()` |
| 9 | **UI / renderer** | **Deferred, not blocking.** The read-only boundary already prevents renderer feedback into the model. A POC should ship headless-first and render later. | `projectWorldState()` |

---

## 6. Proposed role split for a future POC (not executed here)

- **Manus** — owns the visible world: the single City3D renderer, coordinate mapping, overlay gating, and the `WorldStateView` → scene path. Should also own the decision in Risk #4: whether a Matrix world reuses `WorldStateView` or gets its own sibling projection. Renderer stays a pure consumer per `REPLAY_REQUIREMENTS`.
- **Claude** — owns the determinism spine: the three missing fingerprints (`worldStateFingerprint`, `eventTraceFingerprint`, `ruleSetFingerprint`) with an explicit float-quantisation rule, the `MatrixWorldRun` record and its replay verdict, the `EventRegistry` indexing fix (Risk #5), and the negative-control test suite (tampered agent state ⇒ `DRIFT`, not `MATCH`).
- **Kimi** — owns the rule-set and scenario content: authoring `GenesisRule` sets against the existing `trigger`/`when`/`emit` contract, defining the A/B arms, and the honesty review of result wording (Risk #1) — that no output implies agency, cognition or a real-world claim.

Sequencing: fingerprints (Claude) must land **before** any renderer work (Manus), or the POC cannot prove it reproduces what it shows.

---

## 7. Recommendation

# NEEDS_FOUNDATION

Not `PARK`: the foundation is unusually strong for this. Seeded determinism is real and tested with negative controls; a domain-neutral event + rules + causal-chain layer already exists and needs **zero** core change to carry `matrix.*` events; replay/evidence vocabulary and honest-failure semantics are established; and performance at 50–100 agents is already demonstrated at 260.

Not `READY_FOR_POC`: three specific, named artefacts do not exist — **`worldStateFingerprint`, `eventTraceFingerprint`, `ruleSetFingerprint`** — and without the first of these an agent-level POC can report `MATCH` while its world has diverged. That is precisely the class of dishonest-green result this codebase has consistently refused elsewhere.

Additionally, **Risk #2 is a scoping decision, not an engineering one, and it gates any estimate**: scripted agents are largely a matter of assembly from existing parts; cognitive/LLM agents are a new project with no existing foundation in `core/`.

Suggested gate before a POC is greenlit: land the three fingerprints plus their negative-control tests behind the existing boundaries, touching no renderer and no Scientific Core. That is a small, self-contained, independently reviewable piece of work — and it converts this verdict to `READY_FOR_POC`.

---

**NO MATRIX IMPLEMENTATION / NO AGENTS ADDED / NO CITY3D / NO EARTHQUAKE / NO EPIDEMIC CORE CHANGE / NO SCIENTIFIC CORE CHANGE / NO ROUTING / NO GIS / NO LIVE DATA / NO STORE CHANGE / NO DEPLOY.**
