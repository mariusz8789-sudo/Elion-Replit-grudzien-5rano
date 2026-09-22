# Genesis post-freeze Claude audit — 2026-09-22

## Scope

This audit was performed after the green deploy-candidate commit
`bacc07d8ce1d443fee374a074c06d1c86937b858` had been created on
`codex/genesis-final-integration`. It reviews two later Claude commits without
cherry-picking either one:

- `2d521802fcae3abe6a84544a8705211397caa8a3` — 12 paths, Universe Engine reference integration.
- `19cab8034b710169ff79cf63246dca4f7e2548f0` — 3 paths, spacetime visualization reference integration.

The acceptance rule is production reachability through an existing canonical
runtime. Unit-tested reference code or a barrel export alone does not qualify.

## Decision by candidate

| Candidate | Decision | Evidence |
| --- | --- | --- |
| `metaCognition/epistemicStatus.ts` | REJECT | It redeclares exactly the eight states already owned and rendered by `metaCognitionRuntime.ts` and `MetaCognitionScreen.tsx`. Importing it would create two meta-epistemic taxonomies. |
| `specialistSolvers.ts` logistic solver | REJECT | Already rejected in the first Claude integration: canonical population/cell-cycle models exist and the adapter has no production domain binding. |
| `specialistSolvers.ts` 1D diffusion | REJECT | The numerical step is reasonable, but no real generated entity, WorldSpecification, domain or UI binds `field-diffusion`. Export plus unit tests would be a semantic orphan and a second registry surface. |
| `painDiscovery/painResearchUseCase.ts` | REJECT | The file explicitly admits there is no pain-specific `HypothesisProblem` or model. It can run an unrelated existing problem under a pain label, which is not a real pain capability. |
| MP4 encoder extension | REJECT | `canonicalVideoEncoder.node.ts` remains outside a production/capture call path in the current reachability manifest. The proposed runtime also lacks the required H.264 encoder/muxer and honestly returns `BLOCKED_BY_RUNTIME`; extending the orphan does not improve the deploy candidate. Existing Playwright recording produces real WEBM where used. |
| Cyber finding lifecycle helper | REJECT FOR THIS RELEASE | The pure transition validator is only consumed by its focused test in the Claude commit. Current production cyber flow already enforces scope, budgets, explicit human approval, patch application and real retest in `cyberReasoningKernel.ts`. Adding a parallel status field without a UI/API/memory consumer would duplicate state rather than strengthen the active flow. |
| Gravity-well/wormhole/causality/paradox helpers | REJECT | `19cab803` provides pure sampled geometry and labels but no canonical WorldGraph entity, THREE.js scene binding, route, interaction or Chromium capture. A barrel export would be an unreachable feature claim. |

## Files accepted

None. This is a deliberate selective-integration result, not an unreviewed loss
of code. Both commits remain available on their Claude branches as reference
material for future scoped work that supplies a real domain/runtime consumer.

## Architecture outcome

- No new WorldGraph, WorldGenerator, TemporalEngine, EvidenceLedger, solver
  registry, meta-memory, Human Digital Twin or renderer was introduced.
- No `ALLOWED_ORPHANS` entry was added.
- The canonical meta-cognition status remains `MetaEpistemicState` in
  `packages/frontend/src/core/metaCognition/metaCognitionRuntime.ts`.
- The canonical simulation solver path remains the existing `SolverRouter` and
  its already-bound domain solvers.
- Current cyber approval/retest behavior remains the production source of
  truth.

## Re-entry gates

These candidates may be reconsidered only with the following evidence:

1. diffusion: a declared real domain, generated entity binding, deterministic
   Evidence/replay and real UI/runtime consumer;
2. spacetime: a canonical WorldGraph/THREE.js binding and Chromium capture;
3. pain: a scientifically defined pain hypothesis/model with provenance and a
   fail-closed solver/tool boundary;
4. MP4: an actually available production encoder used by the canonical capture
   path;
5. cyber lifecycle: one persisted/UI-consumed status derived by the existing
   kernel, with no second lifecycle source.

## Verdict

`bacc07d8` remains the deploy candidate. Neither later Claude commit changes the
strict capability matrix or deploy verdict.

Focused post-audit verification: `moduleReachability.test.ts` **2/2 PASS**;
working-tree code diff remains empty; only this audit document and the local
`.codex-remote-attachments/` directory are outside `bacc07d8`.
