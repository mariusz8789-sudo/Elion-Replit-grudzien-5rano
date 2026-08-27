# CTO decision: Genesis continuation prompt

## Decision

**Approve the prompt as the master execution direction, with a small operational correction: do not treat every listed item as an active sprint.** The roadmap is valid; execution must remain sequential, with one bounded milestone, one Definition of Done, and one quality gate at a time.

## Corrections required against current LIVE

| Prompt statement | CTO correction |
|---|---|
| LIVE `3ded2f1` | The actual current LIVE HEAD is `4ea9ea2`, followed by the later roadmap/proof commits already present on the branch. Always resolve HEAD before work. |
| “First, finish Minkowski” | Minkowski integration and browser proof are already working. Remaining work is UX/evidence presentation only; do not rebuild its solver or router. |
| “Replay, if existing contracts support it” | Preserve the current contract honestly. Minkowski currently exposes provenance and explicit `PROTOCOL_REQUIRED` / `VARIANT_REQUIRED`; do not label it as a completed Evidence Pack or automatic A/B replay. |
| “Then Epidemic” | This is the next high-value integration candidate, but only after an inventory confirms which existing Epidemic execution state can safely be handed to Science Chat and the same City3D world. Do not change Epidemic Core merely to force symmetry. |
| “All existing laboratories” | Audit and classify them, but only integrate one additional lab per milestone. A large batch integration would recreate the original fragmentation problem in reverse. |
| “4D / time” | Keep as a later concept. Current Minkowski is 1+1D and current Spacetime Lab has bounded visual experiments; do not call it 4D/5D or add scrub/replay controls without a verified time-state contract. |
| “Discovery / drug discovery” | Preserve existing Campaign/Discovery workflows as a later Phase 4 candidate. Do not mix them into the next Epidemic or Spacetime milestone. |

## CTO priority order

1. Keep Earthquake as the reference vertical slice and regression gate.
2. Keep Minkowski as the first Phase 3 proof; add only bounded UX and honesty coverage.
3. Audit Epidemic Chat → existing simulation → WorldState → City3D before implementing anything.
4. Select one Epidemic integration seam only if it can reuse current WorldState, provenance, and renderer.
5. Defer Particle Lab expansion, wormholes, grandfather paradox, 3D+time, GIS, and new hazards until a single active milestone is green.

## Final operating rule

The prompt is accepted as the master roadmap. The execution command for every milestone is:

> FIND ONE REAL GAP → IMPLEMENT THE THINNEST COMPATIBLE CHANGE → TEST → CHROMIUM → BUILD → CI → COMMIT → UPDATE ROADMAP.

A feature is not considered connected merely because a button opens a lab. It is connected only when the request, model execution, result, visualization, provenance, and honest evidence/replay status are observable and tested. Unsupported capability remains `NOT_MODELED` or `UNSUPPORTED`.
