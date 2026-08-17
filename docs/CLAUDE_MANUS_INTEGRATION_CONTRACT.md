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
