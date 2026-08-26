# Matrix Foundation Sprint

**Status:** Foundation-only. No Matrix World implementation, no agents, no new renderer, no City3D/Earthquake/Epidemic Core/Scientific Core/GIS/live-data/cascade change. Directly answers `docs/MATRIX_WORLD_POC_READINESS_AUDIT.md` (verdict: `NEEDS_FOUNDATION`) rather than re-auditing or waiting.

## What the audit named, and what landed for it

| Audit finding | Landed as |
|---|---|
| `worldStateFingerprint` — **MISSING**. Every existing result fingerprint (`ScenarioRun`, `DiscoveryCase`, `HazardRun`) covers only aggregate/output fields, never per-entity world state. | `core/matrixFoundation/worldStateFingerprint.ts` — `computeWorldStateFingerprint()`, built on the existing `canonicalJson` + `sha256Hex` pair (same as `core/hazard/fingerprint.ts`), with explicit coordinate quantization and id-sorted entities. |
| `eventTraceFingerprint` — **MISSING**. `EventRegistry` had no digest method for an ordered trace. | `core/events/eventTraceFingerprint.ts` — `computeEventTraceFingerprint()`, pure function of an already-computed `GenesisEvent[]`. |
| `ruleSetFingerprint` — **MISSING**. `GenesisRule` is plain code with no persistable identity. | `core/matrixFoundation/ruleSetFingerprint.ts` — `computeRuleSetFingerprint()` over a declared `RuleSetDescriptor` manifest. Does not touch `consequence.ts`. |
| Risk #5 — `EventRegistry.all()` sorted with an O(n) `indexOf()` inside the comparator; `add()` did an O(n) `.some()` parent scan. | `core/events/eventRegistry.ts` — Map-based id index (`eventsById`), also making `get()` O(1); insertion order captured once per `all()` call instead of rescanned per comparison. No public behavior change. |
| Recommendation section — replay needs a headless, non-wall-clock time driver; `SimulationClock` is explicitly unsuitable, and `runScenario()`'s fixed-step loop is inline and non-reusable. | `core/matrixFoundation/headlessStepper.ts` — `runHeadlessSteps()`. Does not touch `scenarioEngine.ts` or `SimulationClock`. |
| Recommendation section — a future domain needs a replay verdict without re-deriving `hazardReplay.ts`'s decision logic a third time. | `core/matrixFoundation/replayVerdict.ts` — `computeReplayVerdict()`, the shared decision shape only (never a false `MATCH`); does not touch or wrap `discoveryReplay.ts` or `hazardReplay.ts`. |

## What did **not** land, deliberately

- **Scenario branching** — the audit classified this **EXISTS** (`ScenarioEngine`'s `SCENARIOS`/`runScenario`/`compareScenarios` already give named, reproducible A/B). Building a second, domain-neutral scenario engine would have duplicated it; nothing was added.
- **Matrix World itself, agents, a new renderer** — out of scope by explicit instruction, not merely deferred.
- **Cognitive/LLM agent infrastructure** — the audit's Risk #2 (undefined scope: scripted vs. cognitive agents) is a product decision, not an engineering gap this sprint can close.

## Design discipline

Every new module is additive (a new file) or an internal-implementation-only change (`eventRegistry.ts`, same public API). Nothing existing was widened, wrapped, or re-exported to imply Matrix-specific meaning. Each new fingerprint function reuses the exact two hashing primitives (`canonicalJson`, `sha256Hex`) every other fingerprint in Genesis already uses — no third hashing scheme.

## Local validation

```bash
npm run lint
npm run test --workspace=packages/frontend -- --maxWorkers=1
npm run test --workspace=packages/backend
npm exec --workspace=packages/frontend -- tsc --noEmit
npm run build
git diff --check
```

Result: lint clean; **133 frontend test files / 1364 tests** (up from 131/1344 by exactly the 2 new files' 31 tests: 27 in `matrixFoundation.test.ts`, 4 in `eventRegistryScaling.test.ts`); **269 backend tests** unchanged (backend workspace untouched); `tsc --noEmit` clean; production build clean (same pre-existing Vite chunk-size advisory, not a failure); `git diff --check` clean.

**NO MATRIX WORLD IMPLEMENTATION / NO AGENTS / NO NEW RENDERER / NO CITY3D CHANGE / NO EARTHQUAKE CHANGE / NO EPIDEMIC CORE CHANGE / NO GIS / NO LIVE DATA / NO CASCADES.**
