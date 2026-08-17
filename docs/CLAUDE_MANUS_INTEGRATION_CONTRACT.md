# CLAUDE → MANUS Integration Contract — Genesis Event Layer

> Split of ownership. **Manus:** World + Visualization + UX (three.js, renderer,
> humanoids, city, cameras, HUD, event-feed UI). **Claude:** Event contract +
> provenance + semantics + tests. This document is the stable boundary Manus
> consumes. Contract version: **1.0.0** (`GENESIS_EVENT_CONTRACT_VERSION`).

Location: `packages/frontend/src/core/events/*` (import via `core/events`).
This layer is **read-only** for the renderer: it does not render, does not hold
World State, and does not change the scientific model.

## 1. Types Manus can consume

| Type | Purpose |
|---|---|
| `GenesisEvent<P>` | one neutral event (id, type, timestamp, location, source, affected, provenance, parentEventId) |
| `EntityRef` | `{ kind: string; id: string\|number }` — e.g. `{kind:'agent', id:42}` |
| `GenesisLocation` | `{ x, y, z? }` in world units (same coords the model/agents use) |
| `EventProvenance` | where the event came from (model / experiment / rule) |
| `EventRegistry` | ordered, deterministic buffer; read via `all()/byType()/children()/get()` |
| `TransmissionContext`, `TransmissionParams` | adapter I/O for `infection.transmission` |

Import example:
```ts
import { EventRegistry, ingestTransmissions, type GenesisEvent } from '../core/events';
```

## 2. Guaranteed fields (always present on a registered event)

- `contractVersion` — string, `"1.0.0"`.
- `id` — string, **deterministic & unique**, format `"<type>@<8hex>"`.
- `type` — dotted lowercase, e.g. `"infection.transmission"`.
- `timestamp` — finite number (simulation time; unit defined by the model, days for the city).
- `affectedEntities` — `EntityRef[]` (never null; may be empty for non-entity events).
- `parameters` — object (domain payload; core does not interpret it).
- `provenance.origin` — one of `model | experiment-action | consequence-rule` (**events without it are rejected** — no fake events).

## 3. Optional fields

`location`, `source`, `cause`, `severity` (0..1), `parentEventId`, `modelId`,
`experimentId`, and the rest of `provenance` (`modelId`, `experimentId`, `seed`,
`paramsHash`, `experimentContentHash`, `ruleId`, `notes`).

For `infection.transmission` specifically, `location`, `source`, and
`affectedEntities[0]` **are** populated (that is the on-scene trace Manus needs).

## 4. How to identify an event

`event.id` is stable and unique within a run. It is derived deterministically
from the event's identity fields + its registration sequence, so the **same
seed + same params + same order ⇒ the same ids** (proven by tests). Do not
parse the id; treat it as opaque. Use `type` for routing (marker style, colour).

## 5. How to trace the parent event

- `event.parentEventId` (`null` for a primary event).
- `registry.children(parentId)` returns direct children.
- Chains form `Event → (rule) → Secondary Event → …`. For `infection.transmission`
  straight from the model, `parentEventId` is `null`.

## 6. How to fetch provenance ("where did this event come from?")

`registry.provenanceOf(id)` → `EventProvenance | null`, or `event.provenance`.
Answers: `MODEL (modelId) → PARAMS (paramsHash) → EXPERIMENT
(experimentId / experimentContentHash) → EVENT`. `experimentContentHash` links to
a `scienceMemory.SavedExperiment` (existing store — not duplicated here).

## 7. How an event relates to an experiment

`event.experimentId` and `event.provenance.experimentContentHash` point at a
saved experiment; `event.modelId` names the producing model
(e.g. `"biology.city"`). `seed` + `paramsHash` make a run reproducible.

## 8. How the renderer reads the stream (recommended)

The integration point (owned jointly; Manus wires it into his loop) does, per tick:
```ts
// registry created once per run: new EventRegistry({ modelId, experimentId, seed })
ingestTransmissions(registry, sim.lastTransmissions(), {
  simTime, modelId: 'biology.city', experimentId, seed, params: sim.getParams(),
});
// then Manus renders markers/animations from registry.all() (or the returned events)
```
`ingestTransmissions` returns the freshly-added `GenesisEvent[]` for that tick, so
Manus can spawn transient visual markers without diffing the whole buffer.
**Claude does not implement markers, HUD, cameras, shaders, or the feed UI.**

## 9. Known model gap (reported, NOT patched by Claude)

`core/simulation/types.ts::TransmissionEvent` carries only `{from,to,x,y}` — **no
timestamp / modelId / experimentId**. The adapter injects those from
`TransmissionContext` supplied by the caller (who owns the sim clock). Day-level
time is available via `sim.stats().dzien`.

**Proposed migration (requires sign-off; NOT executed):**
- File: `core/simulation/types.ts` (a Manus/shared-owned contract).
- Change: add optional `t?: number` to `TransmissionEvent`, stamped by
  `EpidemicCitySimulation` when it emits the event.
- Why: exact sub-day event time without a caller-side clock.
- Impact on Manus: additive optional field; no renderer change required.
- Plan: adapter already prefers `ctx.simTime`; if `ev.t` exists it can use it —
  fully backward compatible. Until then, `ctx.simTime` is authoritative.

## 10. Consequence engine (foundation only)

`ConsequenceRule` + `applyConsequences(registry, event, rules)` provide
`Event → Rule → Secondary Event` causality with correct `parentEventId` and
`provenance.origin = 'consequence-rule'`. **No domains implemented** (no flood/
fire/earthquake/blackout/asteroid). Domain *computation* must delegate to the
existing `core/modelGraph` — this layer only chains events, it does not add a
second graph.

## 11. Stop condition reached

`EPIDEMIC MODEL → REAL TRANSMISSION → GenesisEvent → EventRegistry → Provenance → TEST`.
Nothing beyond this (Urban Cascade / flood / fire / asteroid / WebGPU) is started.

---

# Addendum (Etapy 1–10) — expanded read-only API

## 12. `EventStream` — the read-only interface Manus consumes

`new EventStream(registry)` exposes ONLY reads (no `add`). Recommended per-tick loop:
```ts
const stream = new EventStream(registry);
let cur = stream.cursor();
// each tick, after the model+adapter have appended events:
const { events, cursor } = stream.getEventsSince(cur); cur = cursor;
// render transient markers from `events`
```
Methods:
| Method | Returns |
|---|---|
| `cursor()` | current stream cursor (monotonic) |
| `getEventsSince(cursor)` | `{ events, cursor }` — only events added since `cursor` |
| `getEvent(id)` | one event or `undefined` |
| `getEventsByType(type)` | all events of a type |
| `getChildren(parentId)` | direct children (consequence chain) |
| `getProvenance(id)` | `EventProvenance \| null` |
| `getExperimentHistory(experimentId)` | all events of an experiment, time-ordered |
| `all()` / `count()` | full ordered snapshot / size |

`getEventsSince` is deterministic: same registration order ⇒ same batches.

## 13. Rules & secondary events (consequence chain)

`GenesisRule { id, description, trigger:{type}, when?(e,ctx), emit(e,ctx) }`.
`runRules(registry, event, rules)` / `runRulesOverRegistry(registry, rules)` register
secondary events with `parentEventId` set and `provenance.origin='consequence-rule'`
(`ruleId` recorded). Manus reads them like any other event; use `getChildren(id)` to
walk the chain. **Shipped domain rule:** `epidemic.transmission-causes-exposure`
(`infection.transmission` → `infection.exposure`, a faithful event-level restatement
of the model's own S→E — not new dynamics).

## 14. Event type registry (extensible, contracts-first)

`listEventTypes()` / `getEventType(type)` / `isKnownType(type)` describe every declared
type: `{ type, domain, description, requiredParams, implemented }`. Epidemic types are
`implemented:true`; Urban-Cascade (`power.failure`, `water.pumpfailure`,
`water.shortage`, `hospital.capacityreduction`, `emergency.response`) and future hazards
(`hazard.flood/fire/earthquake/asteroidimpact/solarstorm`, `grid.blackout`,
`population.evacuation`) are **declared but `implemented:false`** — the contract is ready,
the model is not. Manus can style/label unknown-but-declared types without code changes.

## 15. Replay & provenance chain

- `provenanceChain(registry, eventId)` → `[event, parent, …root]` for full traceability.
- `reconstructionKey(event)` → `{ modelId, experimentId, seed, paramsHash }` — everything
  needed to re-run a deterministic model and reproduce the same event ids.
- Reproducibility is proven by integration tests on the REAL `EpidemicCitySimulation`
  (same seed+params ⇒ identical transmission AND exposure event ids).

## 16. Boundary (unchanged)

Claude owns: event contract, registry/stream, rules, provenance, type registry, tests.
Manus owns: markers, animations, HUD, event-feed/timeline UI, cameras, shaders, heatmap
rendering, city, materials, CSS. No file overlap; the stream is the only coupling.
