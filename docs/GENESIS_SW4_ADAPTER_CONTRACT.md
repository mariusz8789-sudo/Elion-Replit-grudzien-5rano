# Genesis SW-4 — Generated-City Epidemic Scenario: Renderer Adapter Contract

**Module:** `packages/frontend/src/core/worldModel/scenarios/sw4EpidemiologyCity.ts`
**Agent tool:** `packages/frontend/src/core/agent/genesisAgentTools.ts` — `world.sw4.epidemiologyCity.run`
**Tests:** `packages/frontend/src/__tests__/worldModelSw4EpidemiologyCity.test.ts` (23 tests)

## What this is

SW-4 is an **integration layer**, not a new engine. It assembles the EXISTING
canonical World Model pipeline — `WorldSpecification` → `compileSpecification`
→ `WorldBlueprint` → `generateWorld` → `WorldGraph` (all via
`orchestration/createScientificWorld.ts`) → the real, registered RK4 SEIR
solver (`domains/epidemicSEIR.ts`) on a real `SolverRouter` → a real
`TemporalEngine` ticked forward — into one deterministic, city-scale epidemic
scenario. It introduces no second `WorldGraph`, `WorldGenerator`,
`TemporalEngine`, population system, SEIR solver, solver registry,
`EvidenceLedger`, or replay mechanism.

This document is the **read-only contract** a renderer (owned by Codex) needs
to display this scenario. It does not itself describe or require any
rendering, Three.js, or UI code — none is added by this branch.

## Entry points

```ts
import {
  runSw4EpidemiologyCityScenario,
  replaySw4EpidemiologyCityScenario,
  getSw4RenderState,
  buildSw4EvidenceBundle,
  type Sw4EpidemiologyCityOptions,
  type Sw4EpidemiologyCityRun,
  type Sw4RenderState,
} from '.../core/worldModel/scenarios/sw4EpidemiologyCity';
```

### Running the scenario

```ts
const options: Sw4EpidemiologyCityOptions = {
  seed: 424242,               // required — same seed => same generated city and same trajectory
  populationCount: 50_000,    // optional — defaults to DEFAULT_EPIDEMIC.population (100,000)
  epidemicParams: { r0: 2.5, infectiousDays: 7, incubationDays: 3, initialInfected: 25 }, // optional
  ticks: 30,                  // required — number of real solver ticks to advance
  dtDays: 1,                  // optional — tick length in days, defaults to 1
};

const run = runSw4EpidemiologyCityScenario(options);
```

`run.engine` is a live `TemporalEngine` — a renderer/host that wants to keep
advancing the SAME simulation (rather than a one-shot snapshot) can call
`run.engine.advance(dtDays, (g, dt, tick) => router.routeTick(g, dt, tick))`
itself, but this requires re-registering the same `SolverRouter` — most
callers should instead just call `runSw4EpidemiologyCityScenario` again with a
larger `ticks` value, since the whole pipeline is deterministic and cheap.

### The renderer-facing read-only state (Task 4's deliverable)

```ts
const state: Sw4RenderState = getSw4RenderState(run);
```

```ts
interface Sw4RenderState {
  readonly scenarioId: string;             // 'sw4-epidemiology-city'
  readonly contractVersion: string;        // '1.0.0'
  readonly worldId: string;
  readonly populationId: string;           // EntityId of the population entity
  readonly tick: number;
  readonly simulatedTimeDays: number;
  readonly totalPopulation: number;        // S+E+I+R+D
  readonly susceptible: number;
  readonly exposed: number;
  readonly infected: number;
  readonly recovered: number;
  readonly dead: number;
  readonly solverId: string;               // 'epidemic-seir-rk4'
  readonly domainId: string;               // 'epidemiology'
  readonly grounding: GroundingLevel;      // 'MODEL_ESTIMATE' for this scenario
  readonly classification: ElementClassification; // 'REAL' (a real solver advanced this)
  readonly statusLabel: string | null;     // e.g. "I=1234 R=210 D=0 (day 30.0)"
  readonly worldStateFingerprint: string;  // for replay/consistency checks — see below
  readonly disclosure: string;             // SW4_EPIDEMIC_DISCLOSURE, verbatim — see "Scientific honesty" below
}
```

**Contract guarantees:**

- `getSw4RenderState` performs **no mutation** of `run.engine` — calling it
  any number of times, in any order, with other calls in between, returns a
  consistent read of the engine's CURRENT head. It never stores state of its
  own between calls.
- It never constructs a renderer, a render loop, or any Three.js object.
- It never writes presentation state back into the simulation — the flow is
  strictly `simulation state -> render state`, never the reverse.
- Every numeric field comes directly from the real solver's own `domainState`
  (`S`/`E`/`I`/`R`/`D` — see `domains/epidemicSEIR.ts::makeEpidemicSEIRSolver`)
  — nothing here recomputes or approximates the epidemic curve.

A renderer wanting to show the scenario progressing over time should call
`runSw4EpidemiologyCityScenario` with increasing `ticks` (or advance
`run.engine` itself as above) and re-derive `Sw4RenderState` via
`getSw4RenderState` after each step it wants to display — the SAME pattern
`bridge/worldFrameState.ts::getFrameState` already establishes for every other
World Model scenario in this codebase.

### As an agent tool (chat/agent integration, already wired)

```ts
import { GENESIS_AGENT_TOOLS, GENESIS_TOOLS, WORLD_SW4_EPIDEMIOLOGY_CITY_TOOL } from '.../core/agent/genesisAgentTools';

const state = GENESIS_TOOLS.sw4EpidemiologyCityTool.invoke(options); // returns Sw4RenderState directly — never the live engine
```

This is registered on the SAME `AgentToolRegistry` every other Genesis world
tool uses (`world.counterfactual.assess`, `world.decision.evaluate`, etc.) —
`GENESIS_AGENT_TOOLS.get('world.sw4.epidemiologyCity.run')`. This is also how
this module is reachable from `main.tsx` today (via
`core/agent/genesisAgentTools.ts` → `core/agent/discoveryLoop.ts` → the
existing chat/discovery screens), with **zero `ALLOWED_ORPHANS` entries
added** — confirmed by a clean `moduleReachability.test.ts` run.

## Deterministic replay

```ts
const result = replaySw4EpidemiologyCityScenario(options);
// result.replay.verdict === 'MATCH'
// result.replay.recordedFingerprint === result.replay.recomputedFingerprint
// result.optionsFingerprintMatch === true
```

Runs the scenario **twice**, independently, from the same `options` (not a
clone — a full from-scratch compile/generate/register/advance each time), and
compares them via the EXISTING `evidence/worldEvidenceBundle.ts::buildBundleReplay`
mechanism — the same one every other WorldGraph scenario in this codebase uses
for its own replay proof. `ReplayVerdict` is `MATCH | DRIFT | BLOCKED |
NOT_REPRODUCIBLE` (`core/matrixFoundation/replayVerdict.ts`), never a fourth,
scenario-specific vocabulary.

`Sw4EpidemiologyCityRun.optionsFingerprint` (`fnv1a(canonicalJson(options))`,
the same hashing utility `worldStateFingerprint` itself is built on) is the
replay INPUT identity; `Sw4EpidemiologyCityRun.finalWorldStateFingerprint`
(`worldStateFingerprint(engine)`) is the replay OUTPUT identity. Two runs with
the same `optionsFingerprint` are guaranteed, by this scenario's own
determinism, to also produce the same `finalWorldStateFingerprint`.

## Invariants checked on every run

`Sw4EpidemiologyCityRun.invariants` — an array of `{ name, ok, detail }`,
always present, never silently dropped on failure:

| name | what it proves |
|---|---|
| `population-conservation` | S+E+I+R+D at the final tick equals the initial N0 within a 1e-6 relative tolerance — the real RK4 integration conserves population. |
| `compartments-non-negative` | No compartment went negative at the final tick. |
| `real-solver-executed` | The population entity's `grounding` is `MODEL_ESTIMATE` and its bound `solverId` is exactly `epidemic-seir-rk4` — never a procedural or ungrounded fallback silently substituting. |
| `state-actually-advanced` | The tick count and compartment values genuinely changed across the run — never a frozen no-op. |

## Scientific honesty

Every `Sw4RenderState.disclosure` and every `buildSw4EvidenceBundle(...).limitations`
entry carries `SW4_EPIDEMIC_DISCLOSURE` verbatim:

> SIMULATED / MODEL — not a direct observation. A real RK4 integration of a
> deliberately simplified SEIR compartmental model over an abstract "Pathogen
> X" (core/epidemic/sir.ts), applied to a procedurally generated city
> population. It is not measured surveillance data, not a prediction about
> any real pathogen, and not a clinical or public-health recommendation.

This is not a new epistemic-status enum: `grounding: 'MODEL_ESTIMATE'`
(`GroundingLevel`, `ecs/types.ts`) and `classification: 'REAL'`
(`ElementClassification`, `evidence/worldEvidenceBundle.ts`) are the SAME
vocabulary every other Genesis scenario already uses — `disclosure` is the
scenario-specific PROSE statement of what that vocabulary means here, not a
fourth parallel classification system.

## Evidence

```ts
const bundle = buildSw4EvidenceBundle({
  bundleId: 'my-run-id',
  question: 'What does a real R0=2.5 SEIR outbreak look like over a generated city of 50,000?',
  run,
  verifyRun, // optional — an independent second run, for a real (not vacuous) replay verdict inside the bundle
});
```

Produces a real `WorldEvidenceBundle` — the SAME format every other World
Model scenario in this codebase exports (`evidence/worldEvidenceBundle.ts`),
including its `exportWorldEvidenceBundleRoCrate`/`serializeWorldEvidenceBundleRoCrate`
projections. **No bridge into `packages/core/src/knowledge/EvidenceLedger.ts`
is added by this branch** — that ledger has no extension point today for a
`WorldGraph`/`TemporalEngine` run (confirmed by inspection: nothing under
`core/worldModel/` imports it). `EvidenceLedger`'s `ClaimType` already
declares `'model'` as the intended extension point for exactly this kind of
run; wiring `WorldEvidenceBundle` → `EvidenceLedger` record is the one
documented, narrow missing hook this module leaves for a future change,
rather than this branch inventing a second ledger to fill the gap itself.

## What this module deliberately does not do

- It does not create, own, or manage any Three.js scene, camera, material,
  or render loop.
- It does not touch `packages/frontend/src/core/three/**`,
  `core/temporalCinematic/**`, `core/scientificWorlds/humanLab/**`,
  `components/**`, `screens/**`, or `styles/**`.
- It does not decide WHICH screen/route/chat surface invokes it — that
  product decision belongs to whoever owns the renderer (Codex), consistent
  with this branch's ownership split.
- It does not persist anything to disk or to a database — `run.engine` lives
  only in memory for as long as its caller holds a reference to it.
