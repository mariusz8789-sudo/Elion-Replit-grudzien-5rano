# Claude 10h Execution — Baseline & Risk Map

Base commit: `2feb0ef128f117cd16d0fca450d1f5307ffbb965` (`manus/high-fidelity-epidemic-digital-twin`).
Branch: `claude/genesis-10h-execution`. Working tree clean at start (`git status --short` empty).
`git log -5`: `2feb0ef docs: close validated Genesis roadmap gates`, `30c70dd fix(city3d): keep agent focus outside building volumes`, `52848bf merge: finalize Earthquake damage MVP`, `9ad99d3 test(e2e): track earthquake projection schema`, `8c4a6a0 feat(ui): disclose earthquake damage assessment status`.

Confirmed reviewed: this brief itself, and the `GENESIS EXTREME-EVENT IMPACT ENGINE` report from `claude/extreme-event-engine-foundation` @ `28ed69d` (that branch stays PARK — nothing from it is reused here; `de7b1b9`/`52848bf` on live already independently carry the same Earthquake Damage Assessment content this session delivered in an earlier turn).

## EXISTS / PARTIAL / MISSING / NOT_MODELED

| Area | Status | Evidence |
| --- | --- | --- |
| `StructuredExperimentRequest` contract | EXISTS | `core/experimentFabric/types.ts:14-26` |
| Runtime validation at the parser/LLM boundary | EXISTS, already thorough | `validateStructuredExperimentRequest`, `router.ts:437-467` — rejects missing `contractVersion`/`sourceText`/`domainId`, non-finite numbers (NaN/Infinity), non-primitive values, negative/non-integer `seed`, unregistered `modelId`, and out-of-schema or out-of-range parameters per model. No `evidenceTracking` field exists in this codebase's contract (a report artifact, not a real field) — nothing to gate on. |
| Deterministic parser (no LLM) | EXISTS | `parser.ts` — pure regex over Polish/English text, zero network calls, works fully offline |
| Capability registry | EXISTS (`ROUTER_MODELS`, `router.ts:43-430+`) | ~50 entries mapping model id → domain/params/route/capability. No second registry needed. |
| Earthquake capability routing | **MISSING at baseline** → now IMPLEMENTED this session | "trzęsienie ziemi" fell into a generic `hazard-cascade` bucket alongside flood/fire/blackout, with no `modelId` and `ENGINE_NOT_AVAILABLE`, despite a complete working Earthquake vertical slice existing in `core/hazard/` |
| Earthquake execution | EXISTS, but on a completely separate path | `core/simulationRenderer/earthquakeCommandCenter.ts` (`executeEarthquakeCommandCenterScenario`) called only from `EarthquakeScenarioPanel.tsx`, mounted inside `City3DWebGLScreen.tsx`. `experimentFabric/executor.ts` never called it. |
| Science Chat plan → confirm flow | EXISTS | `evidenceGuidedChat.ts` (`planEvidenceGuidedExperiment`/`confirmEvidenceGuidedExperiment`) wraps `router`/`executor` with an immutable-plan-replay check (`canonicalJson(canonicalPlan) !== canonicalJson(reviewedPlan)` throws) before ever calling `runExperiment`. |
| Science Chat → City3D handoff | **MISSING at baseline** → now IMPLEMENTED this session | `ExperimentRoute` had no member for handing off to the Earthquake Command Center; `worldHandoff.ts` was hardcoded to `modelId: 'epidemic-city'` only |
| `scripts/smoke-e2e.mjs` | EXISTS, not run in CI, not extended this session | Hardcodes Playwright's own global install path and one pinned Chromium revision path (not `PLAYWRIGHT_BROWSERS_PATH`); needs a manually-started backend on port 8092; exercises 13 routes + all labs, but neither `#/city3d` nor Science Chat. `.github/workflows/ci.yml` never invokes it — confirmed by direct read, no `smoke`/`e2e`/`playwright` string anywhere in that file. |
| Earthquake vertical slice (contracts/evidence/replay) | EXISTS, untouched this session | `core/hazard/**` — no file under this directory was modified in this session |

## Top 3 real gaps blocking the demo (selected priority)

1. **Earthquake had zero capability-routing metadata** in the parser/router, so Science Chat could never reach it — the single highest-value, safest gap (pure additive metadata, no solver change).
2. **No handoff mechanism existed for a scenario *spec*** (as opposed to a live simulation instance) — `ExperimentRoute`/`worldHandoff.ts` only supported the epidemic case.
3. **The stale `hazard-cascade` rationale string actively misinformed the user** ("repozytorium nie zawiera modelu... trzęsienia" was never literally said, but the bucket gave no indication Earthquake existed at all) — a truthfulness gap, not just a routing gap.

`scripts/smoke-e2e.mjs`'s hardcoded Chromium path was flagged as a portability risk but was NOT touched: it happens to resolve correctly in this sandbox and CI never invokes it, so "fixing" it carried change risk with no available proof of benefit under the 10h scope's own instruction to fix only demonstrated blockers.
