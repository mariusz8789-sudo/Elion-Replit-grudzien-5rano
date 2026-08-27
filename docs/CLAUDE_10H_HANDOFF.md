# Claude 10h Execution — Handoff

Base commit: `2feb0ef128f117cd16d0fca450d1f5307ffbb965`. Branch: `claude/genesis-10h-execution`.
Final commit: see `git log -1` on this branch after push (single commit, described below).
Baseline detail: `docs/CLAUDE_10H_BASELINE.md`.

## Files changed and why

| File | Reason |
| --- | --- |
| `core/experimentFabric/types.ts` | Added `ExperimentRoute` member `{ kind: 'hazard-scenario'; hazardType: 'earthquake'; hash: '#/city3d' }` — a scenario-spec handoff distinct from `live-world` (no running simulation instance to transfer). |
| `core/experimentFabric/hazardScenarioHandoff.ts` (new) | Ephemeral pointer handoff for one confirmed Earthquake scenario spec, mirroring `worldHandoff.ts`'s existing pattern. Not an Evidence/Replay/Provenance registry — no HazardRun, fingerprint, or store logic here. |
| `core/experimentFabric/router.ts` | Registered `earthquake-scenario` in `ROUTER_MODELS` (magnitude/depthKm/epicenterX/epicenterY parameter schema, route to `hazard-scenario`/`#/city3d`), reusing the real `EARTHQUAKE_MODEL_VERSION` constant. Corrected the stale `hazard-cascade` rationale string to state Earthquake is now available while flood/fire/blackout/cascade remain not modeled. |
| `core/experimentFabric/parser.ts` | Added a specific "trzęsienie ziemi"/"earthquake"/"sejsmiczny" branch (before the generic hazard-cascade catch-all) plus magnitude/depthKm/epicenterX/epicenterY extraction regexes. |
| `core/experimentFabric/executor.ts` | Added `case 'earthquake-scenario'` to `executeRealModel` — validates and forwards parameters only; never imports or calls `core/hazard/*`. Threaded a new `onHazardScenario` callback through `runExperiment`, registering the handoff exactly like the existing `onLiveWorld`/epidemic pattern. |
| `components/ScienceChat.tsx` | Added the `route.kind === 'hazard-scenario'` branch to the existing post-confirm routing switch: marks the run pending and navigates to `#/city3d`. |
| `components/visual-simulation/EarthquakeScenarioPanel.tsx` | Refactored `runScenario` to accept an optional parameter override (avoids a stale-closure race); added a mount effect that consumes a pending handoff and auto-runs it through the *same* handler the manual button uses — no second execution path, no change to the immutable-store scenario-label uniqueness policy. |
| `__tests__/hazardScenarioHandoff.test.ts` (new) | 7 tests: register/set/consume round-trip, unregistered id, empty consume, one-shot consumption, replacement semantics, retention cap, clear. |
| `__tests__/earthquakeScienceChatRouting.test.ts` (new) | 12 tests: parser recognition, router registration/route shape, plan readiness, full confirm → completed run → handoff registration (asserting outputs contain only validated parameters, never a fabricated ImpactResult/DamageAssessment field), determinism, and negative paths — NaN, Infinity, out-of-range magnitude, unknown modelId, flood/fire/blackout/cascade/evacuation still routing to `ENGINE_NOT_AVAILABLE`, missing parameters falling back to documented defaults. |

No file under `core/hazard/**` was modified. No City3D renderer/world file besides the Earthquake Command Center panel itself was touched. No Epidemic Core, routing, Matrix World, Collider, or cascade file was touched. `claude/extreme-event-engine-foundation` was not merged, imported, or referenced in any shipped code — only its written report was reviewed as prior art, per the explicit PARK instruction.

## Quality gate results

| Gate | Result |
| --- | --- |
| Frontend tests (`npm run test --workspace=packages/frontend -- --maxWorkers=1`) | **1385 passed**, 0 failed (136 files) |
| Backend tests (`npm run test --workspace=packages/backend`) | **269 passed**, 0 failed, 40 skipped |
| TypeScript (`tsc --noEmit`) | clean |
| Lint (`npm run lint`, root eslint) | clean |
| Production build (`npm run build`) | succeeded, `packages/frontend/dist` produced |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| `git diff --check` | clean |
| `scripts/smoke-e2e.mjs` | **not run** — not part of CI, requires a manually-started backend on port 8092 this session did not stand up; not extended to cover Science Chat/City3D (out of the bounded scope: it exercises unrelated lab routes only, and its hardcoded Chromium path is a separate, undemonstrated risk left as backlog per the baseline doc) |
| Repository-native Chromium proof | **Run manually against a `vite preview` production build** (see below) — this is the real, load-bearing proof for this session's change, since `smoke-e2e.mjs` doesn't cover this flow |
| GitHub Actions for this branch/commit | Triggered on push; result recorded in the follow-up message once confirmed (poll in progress at hand-off time) |

## Chromium route and observed behavior

Production build served via `vite preview` on `127.0.0.1:5000`, driven headless via CDP (`/opt/pw-browsers/chromium`). Steps and observations:

1. Navigate to `/`, dismiss the first-run onboarding overlay.
2. Open Science Chat (`.science-chat-fab`), type "Symuluj trzęsienie ziemi o magnitude 6.3, głębokość 18 km", submit.
3. **Plan shown before execution** (required by DoD): model `earthquake-scenario`, capability `REAL_ENGINE`, parameters `magnitude=6.3, depthKm=18`, explicit limitations, "oczekuje na potwierdzenie; nic nie zostało jeszcze uruchomione."
4. Click "Uruchom potwierdzony plan". Chat turn confirms parameters were validated and forwarded, explicitly states this step does **not** compute ImpactResult/DamageAssessment itself, and that `structuralDamage/casualties` stay `NOT_MODELED` regardless of parameters.
5. `window.location.hash` becomes `#/city3d` automatically.
6. The Earthquake Command Center panel (already mounted in City3D) auto-runs with the confirmed parameters: **`OVERLAY ACTIVE`**, **`replay: MATCH`**, **`evidence: COMPLETE`**, **`5 sites mapped`**, **`Damage assessment (5)`** with all 5 rows reading **`NOT_MODELED`**.
7. No console errors or exceptions observed.

This is `FULLY_CONNECTED` for the one path this session's scope covers (Earthquake). It is not a claim about any other domain.

## Limitations / left `NOT_MODELED` / `PARK`

- All non-Earthquake hazard words (flood, fire, blackout, cascade, evacuation) still resolve to the pre-existing `hazard-cascade` / `ENGINE_NOT_AVAILABLE` bucket — untouched, correctly honest, no new solver added for any of them (explicitly forbidden this session).
- `claude/extreme-event-engine-foundation` remains **PARK** — not merged, not integrated, not cited as live code anywhere in this change.
- `scripts/smoke-e2e.mjs` was not extended to cover Science Chat or City3D, and its hardcoded Playwright/Chromium paths were left as-is (backlog, not blocking this session's DoD).
- The Earthquake vertical slice's own scientific content, Evidence Pack, and Replay logic are completely unchanged — this session only added a routing/handoff layer in front of it.
- `EvidenceGuidedOutcomeHandoff` (`PROTOCOL_REQUIRED`/`VARIANT_REQUIRED`) is unchanged: a single confirmed Earthquake run still correctly declines to fabricate a Discovery-grade Evidence Pack or an A/B counterfactual.

## Rollback plan

Single commit on `claude/genesis-10h-execution`, cleanly layered on live `2feb0ef`. `git revert <commit>` removes the entire change set (9 files + 2 new test files + 2 docs) with no partial-state risk, since no shared file outside `experimentFabric`/`ScienceChat.tsx`/`EarthquakeScenarioPanel.tsx` was touched and no persisted data format changed.

## Three next steps (no new hazard domain)

1. Wire the same `ROUTER_MODELS`/parser/handoff pattern's *shape* (not its Earthquake-specific content) to a `capability_seam`-labelled entry the moment a second hazard (e.g. Flood) gets a real `core/hazard` module — today there is nothing to route to, so nothing should be added yet.
2. Extend `scripts/smoke-e2e.mjs` (or a sibling script) to cover the Science Chat → `#/city3d` handoff automatically, once a decision is made about running it in CI with a real backend on a fixed port.
3. Consider whether `EvidenceGuidedOutcomeHandoff`'s `PROTOCOL_REQUIRED`/`VARIANT_REQUIRED` messaging should surface inside the Earthquake Command Center panel itself (it currently only appears in the Science Chat transcript), so a user who navigates straight to `#/city3d` without using Chat sees the same honesty disclosure.

## Report table

| Obszar | Status | Dowód |
| --- | --- | --- |
| Science Chat request validation | EXISTS, verified sufficient (no new validator/library added) | `router.ts:437-467`; negative tests in `earthquakeScienceChatRouting.test.ts` (NaN, Infinity, out-of-range, unknown model) |
| Earthquake routing | IMPLEMENTED | `router.ts` `earthquake-scenario` entry; `parser.ts` earthquake branch; 12 tests in `earthquakeScienceChatRouting.test.ts` |
| Earthquake envelope | UNCHANGED, reused as-is | `earthquakeCommandCenter.ts`/`buildEarthquakeDemoEnvelope` — zero diff this session |
| City3D handoff | IMPLEMENTED | `hazardScenarioHandoff.ts` (7 tests) + `ScienceChat.tsx` route branch + `EarthquakeScenarioPanel.tsx` mount-effect auto-run; Chromium proof above |
| Evidence | UNCHANGED, correctly still gated | `EvidenceGuidedOutcomeHandoff` PROTOCOL_REQUIRED path unchanged; Chromium proof shows `evidence: COMPLETE` for the HazardRun's own Evidence Pack |
| Replay | UNCHANGED, correctly still gated | Chromium proof shows `replay: MATCH` from the existing, untouched `replayHazardRun` |
| NOT_MODELED fencing | VERIFIED intact | Chromium proof: 5/5 DamageAssessment rows `NOT_MODELED`; chat turn explicitly states `structuralDamage/casualties` stay `NOT_MODELED` regardless of parameters |
| Tests / TypeScript / lint / build | GREEN | 1385 frontend + 269 backend tests, `tsc --noEmit`, `eslint .`, production build — all clean |
| Chromium | GREEN (manual proof, not CI-native) | Screenshot + DOM assertions captured this session (see message with the delivered screenshot) |
| CI | Triggered; result to follow once confirmed |  |
