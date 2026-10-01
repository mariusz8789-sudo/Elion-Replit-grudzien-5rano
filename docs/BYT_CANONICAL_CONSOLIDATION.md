# BYT — canonical consolidation over Genesis

**Status:** architecture decision and implementation audit  
**Product meaning:** a persistent, self-modeling scientific entity; never a consciousness claim  
**Rule:** BYT owns no second memory, ResearchRun, Evidence ledger, Replay, world, hypothesis lifecycle, or toolchain.

## Product definition

BYT is the scientific self-model and control loop of Genesis:

```text
Human Mission
    ↓
BYT / Self Model
    ↓
Science Chat / Mission Control
    ↓
Hypotheses
    ↓
canonical ResearchRun + preregistration
    ↓
Experiment Fabric / real engine adapters / Scientific Worlds
    ↓
canonical Evidence + Provenance → Replay → Scientific Memory
    ↓
derived BYT state update
```

The state update is a **materialized projection of verified canonical records**. It is not a writable truth store. Model-generated text remains `PROPOSED` or `NOT_EVIDENCE`; only existing evidence and execution paths may change scientific status.

## What already exists

| BYT responsibility | Existing canonical component | Current proof | Status |
|---|---|---|---|
| Stable identity and current capability awareness | `packages/backend/src/genesisIdentity.mjs`, `genesisSelfModel.mjs` | `/api/genesis/self`; engine availability requires a reference case or persisted real remote run | HAS |
| Durable current research state | `packages/backend/src/agentRun.mjs`, `researchRun.mjs` | append-only hash chain in `agent_run_steps`; restart and integrity tests | HAS |
| Project-level cognitive projection | `packages/backend/src/cognitiveState.mjs` | rebuilt from runs, campaigns, jobs, experiment records, knowledge registry and Self Model | HAS |
| Eight epistemic labels | `packages/frontend/src/core/metaCognition/metaCognitionRuntime.ts` | `KNOWN`, `SUPPORTED`, `INFERRED`, `SIMULATED`, `ASSUMED`, `UNKNOWN`, `CONTRADICTED`, `UNVERIFIED` | HAS, frontend projection |
| Unknowns and contradictions across restarts | `packages/backend/src/knowledgeRegistry.mjs` | append-only, hash-chained gap and contradiction events | HAS |
| Prediction freezing before execution | `researchRunExecution.mjs`, `experimentMemory.mjs` | `PREDICTIONS_FROZEN` precedes engine execution and sealed verdict | HAS |
| General prospective prediction guard | `packages/frontend/src/core/agent/predictionRegistry.ts` | immutable registration and frozen-before-observed check | HAS, not yet the backend-wide history |
| Self-falsification | `researchRunExecution.mjs`; Experiment Fabric scientific integration | server-derived protocol verdict; no model-authored verdict | HAS |
| Falsified-model memory | `packages/frontend/src/core/agent/falsifiedModelRegistry.ts` | append-only integrity-checked registry with explicit override based on new evidence | HAS, device-local/domain-limited |
| Curiosity loop | `packages/frontend/src/core/scientificWorlds/curiosityCycle.ts` | gap → hypotheses → discriminating experiment → observation → memory record | HAS, Scientific Worlds scope |
| Structured decision explanation | `packages/frontend/src/core/metaCognition/decisionTrace.ts` | fingerprinted evidence refs, alternatives and reason codes; no hidden reasoning | HAS |
| Scientific Memory connection | `scienceMemoryPort.ts`, canonical experiment and run records | only typed replayable artefacts are accepted | PARTIAL across product surfaces |

This means BYT must be **consolidated**, not invented again.

## Canonical BYT projection

The first production BYT view should be computed on read from these sources:

1. `genesisIdentity` and `genesisSelfModel` — who Genesis is and what it can execute now.
2. verified `ResearchRun` event chains — missions, hypotheses, frozen predictions, executions, falsification, evidence proposals, Replay and next experiments.
3. `knowledgeRegistry` — explicit unknowns and unresolved contradictions.
4. canonical experiment records and `science_runs` — preregistration, real outputs, environment, hashes and replay results.
5. Scientific Memory references — prior typed artefacts, never copied scientific truth.

The projection may expose:

- `currentMissions`
- `knowledgeState`
- `predictionHistory`
- `calibrationSummary`
- `necropolis`
- `surprises`
- `proposedNextExperiments`
- `blockedCapabilities`
- `decisionTraces`
- `integrity`

Every item must carry canonical references and its epistemic classification. If a source chain fails verification, the corresponding value is `UNKNOWN` with `STATE_INTEGRITY_FAILURE`; it is never silently omitted or reconstructed.

## Prediction Ledger

Do not create a second ledger table. The canonical Prediction Ledger is a projection joining, by `researchRunId` and `experimentId`:

```text
PREDICTIONS_FROZEN
→ EXPERIMENT_HANDOFF
→ SELF_FALSIFICATION
→ EVIDENCE_UPDATE
→ Replay verification
```

The existing records already preserve prediction and preregistration fingerprints, engine identity, environment, input/output hashes, observed criteria and server-derived verdict. The view should add only derived evaluation fields.

Current ResearchRun predictions are threshold statements (`observable`, `operator`, `value`), so Genesis can honestly report protocol success/failure and numeric threshold distance. It **cannot yet claim probability calibration** or an `X ± Y` calibration history for all experiments. That requires a canonical uncertainty/interval field and a frozen confidence value before observation. Until then:

- protocol hit rate may be reported;
- unresolved criteria must stay unresolved;
- probabilistic calibration status is `NOT_AVAILABLE`;
- a threshold distance must not be described as prediction error uncertainty.

## Necropolis

Necropolis is also a projection, not a new truth store.

A ResearchRun item enters it only when the verified event chain contains a server-derived `FALSIFIED_WITHIN_PROTOCOL` verdict. The entry references the frozen prediction, preregistration, sealed session, output hash and Evidence proposal. Its scope must remain explicit: falsified under this protocol, engine, input and criteria; not universally false.

The existing frontend falsified-model registry already implements the correct reopening principle: original records are immutable, while an override is appended and requires new evidence. The backend-wide BYT version must reuse that principle through canonical events. Until a canonical backend reopen event exists, BYT may show prior falsifications but must mark reopening as `REQUIRES_HUMAN_APPROVAL`.

## Surprise and curiosity

Surprise is not merely a failed criterion. A production `SURPRISE_DETECTED` item needs a declared expectation, observation, uncertainty/tolerance and a reproducible divergence rule. Experiment Fabric already computes prediction-error and surprise metrics, while Scientific Worlds already runs a bounded curiosity cycle. The missing work is to bind those results to the same backend ResearchRun and canonical evidence references.

Genesis must never create an anomaly because a model wrote “this is surprising”. The system derives it from frozen expectations and observations, then proposes a lower-level scientific goal:

```text
observation → anomaly → competing hypotheses → discriminating experiment
```

## Controlled goals

The permitted hierarchy is:

```text
Human Mission → Scientific Goal → Hypothesis → Experiment → Action
```

BYT may propose or select lower-level steps within the approved mission and capability/budget gates. It may not replace the human mission. Every transition must answer `WHY DID YOU DO THIS?` with a structured `DecisionTrace`: evidence refs, alternatives, selected capability, classifications, blocker or next experiment. This is an audit record, not private chain-of-thought.

## Epistemic truth model

The eight D-141 labels remain the single vocabulary:

- `KNOWN` — verified observation in canonical Evidence.
- `SUPPORTED` — verified evidence supports the claim within its stated scope.
- `INFERRED` — derived candidate conclusion, not direct observation.
- `SIMULATED` — output of a simulation or model.
- `ASSUMED` — explicit hypothesis or premise.
- `UNKNOWN` — evidence is absent, inaccessible or integrity cannot be established.
- `CONTRADICTED` — active canonical evidence conflicts.
- `UNVERIFIED` — present but not yet validated or rejected by the required gate.

Classification is derived from canonical records. BYT does not promote its own statement to `KNOWN`.

## Gaps that remain

| Gap | Honest status | Minimal closure |
|---|---|---|
| One backend BYT read model | MISSING | extend the existing Cognitive State projection; no table |
| Cross-run Prediction Ledger view | PARTIAL | join existing verified ResearchRun events and Replay records |
| Probabilistic/interval calibration over time | MISSING | freeze uncertainty/confidence before observation, then score by declared protocol |
| Backend-wide Necropolis | PARTIAL | project verified falsifications; add canonical append-only reopen decision only when needed |
| Curiosity bound to backend ResearchRun | PARTIAL | adapter from current curiosity proposal into the existing ResearchRun API |
| Surprise persisted with evidence references | PARTIAL | reuse Experiment Fabric metric and append a typed ResearchRun/Scientific Memory artefact |
| Mission hierarchy and approval boundary | PARTIAL | formalize parent mission and approved scope on canonical ResearchRun |
| Long-term identity across tenants/devices | PARTIAL | server-side project records exist; device-local registries must not be treated as global |
| Product UI and voice narrative | MISSING | render the backend projection in Mission Control after contracts are stable |

## Implementation order

1. **Read model first:** add a tested BYT projection to the existing Cognitive State endpoint. It owns no persistence.
2. **Prediction history and Necropolis:** derive them from verified ResearchRun chains; report integrity failures and protocol scope.
3. **Calibration contract:** extend frozen predictions only after defining numeric interval/confidence semantics and scoring rules.
4. **Curiosity adapter:** create a ResearchRun proposal from current anomaly/gap outputs, subject to human mission and admission gates.
5. **DecisionTrace binding:** attach structured decision references to next-experiment selection.
6. **Mission Control UI:** show what Genesis knows, does not know, falsified, is running and proposes next.
7. **Long-horizon validation:** restart/recovery, multi-run history, reopening a falsified hypothesis with new evidence and calibration drift tests.

## Definition of Done for the first BYT demonstrator

One user question produces a canonical ResearchRun. Before execution, the prediction is frozen. A real engine runs. Genesis compares observation with the prediction, derives a scoped verdict, creates Evidence and Replay references, updates the BYT projection and proposes the next experiment. After a process restart, the same project shows:

- the original mission and active goal;
- what is known, assumed, unknown and contradicted;
- the immutable prediction and observed outcome;
- whether confidence was justified, or `NOT_AVAILABLE` where it was not measurable;
- falsified hypotheses in Necropolis with exact reasons and evidence references;
- the selected next experiment and its structured `WHY` trace;
- all integrity and runtime blockers.

The demonstrator fails closed. A missing runtime, evidence reference, licence, Replay capability or verified chain produces `BLOCKED`, `UNKNOWN` or `UNVERIFIED`, never a plausible substitute.

## Product sentence

**Give Genesis a problem with reality.**

Genesis observes, proposes, preregisters, predicts, executes, tries to falsify itself, remembers both success and failure, and returns with evidence. BYT is the continuity of that process; Reality Compiler is its execution body.
