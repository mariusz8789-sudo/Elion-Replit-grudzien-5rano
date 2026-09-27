# ZEFIR Phase 3D (Bio Foundation) + 3B (Reasoning Contracts)

Additive schema `v16 → v17`. No Phase-1 code/engine/provenance touched.

## Bio Foundation (`cognitive/bioFoundation.mjs`, schema v17)
Machine-readable biological layer (chemistry alone does not explain disease).
- Entities: DISEASE / PHENOTYPE / CELL_TYPE / BIOLOGICAL_PROCESS / PATHWAY / GENE /
  PROTEIN / TARGET / OBSERVATION / CONTRADICTION / UNKNOWN — each with an explicit
  biological evidence class (KNOWN_FROM_SOURCE / OBSERVED_DATA / COMPUTED_RESULT /
  MODEL_ESTIMATE / SUPPORTED_HYPOTHESIS / WEAK_HYPOTHESIS / CONFLICTING_EVIDENCE /
  UNKNOWN). `KNOWN_FROM_SOURCE` requires a source (no unsourced "facts").
- Typed relations between entities.
- **Next-best-experiment** primitive: selects the available experiment expected to
  best DISCRIMINATE between competing hypotheses (explicit balance/information-gain
  proxy, documented as a proxy — not true information theory). No available
  experiment → `BLOCKED_BY_RESOURCES`. Real biological facts require real sources;
  synthetic fixtures are test-only and labelled `SYNTHETIC_TEST_FIXTURE`.

## Reasoning Contracts (`cognitive/reasoningContracts.mjs`, uses P7 router)
Seven named roles routed through the P7 Model Router (not bypassed):
SCIENTIFIC_GOAL_DECOMPOSER, BIOLOGICAL_HYPOTHESIS_PROPOSER, CHEMICAL_STRATEGY_PROPOSER,
ADVERSARIAL_SCIENTIFIC_CRITIC, EVIDENCE_SYNTHESIS_AGENT, EXPERIMENT_SELECTION_AGENT,
TRANSLATIONAL_GAP_REVIEWER.
- No provider credential → **CAPABILITY_GAP**, no fabricated output (fully tested so
  the system is immediately executable when a provider is registered).
- Every model output is tagged **MODEL_GENERATED_HYPOTHESIS / _PROPOSAL** — never
  evidence, never verified, proposer never its own judge; persisted with role, router
  decision, provider, model, input/output hashes, evidence refs, status — no chain-of-thought.

## Verification
- `cognitiveBioReasoning.test.mjs` — **6/6**. Part of the full gate below.
