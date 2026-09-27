GENESIS ENGINE SUITE — REAL REPO INTEGRATION

Integrate the attached engine suite into the current real Genesis repository.

IMPORTANT:
This is a transfer/reference suite. Reuse the strongest existing canonical implementation from the real repo when one exists. Do not copy weaker duplicates.

1. Evidence + Replay
- bind to canonical EvidenceLedger/kernelLedger
- bind hash to core/events/hash.ts or the current canonical equivalent
- preserve snapshot/restore/replay semantics

2. Meta-Cognition
- bind observations and contradictions to canonical EvidenceLedger
- no new persistent MetaMemory source of truth

3. ModelRouter
- create/reuse ONE canonical provider router
- OpenAI/Astra and Anthropic/Claude are providers
- raw LLM output remains REASONING_ONLY
- only real solver/tool evidence may upgrade to VERIFIED_BY_SOLVER

4. Experiment Planner + Autonomous Research Campaign
- bind to existing solver registries
- execute real solver paths, not mocks
- preserve QUESTION → HYPOTHESIS → EXPERIMENT → OBSERVATION → EVIDENCE → FALSIFICATION → NEXT EXPERIMENT

5. World Author / Director
- World Author is proposal generation only
- bind output to existing WorldSpecification → compiler → WorldBlueprint → WorldGenerator → WorldGraph
- no second world engine

6. Digital Twin
- bind to existing Human/Digital Twin state
- simulation-only reference interventions unless a separately validated device adapter exists

7. Drug Discovery
- reuse real RDKit/docking/QM/PySCF/ADMET adapters
- identity guard must execute
- unbound/unavailable engines must return BLOCKED
- conflict state remains explicit
- research priority is NOT clinical efficacy

8. Cyber Scientist
- defensive/authorized repository, sandbox, or CI scopes only
- bind real scanners where available
- human approval before patch application
- preserve patch budgets
- no silent production changes

9. Specialist solvers
- reuse existing canonical solvers when present
- only add missing solvers after duplicate audit
- add solver IDs and evidence instrumentation

10. Validation
Run:
- focused engine tests
- production reachability
- architecture duplicate audit
- tsc
- eslint
- frontend/core/backend tests
- production build
- browser E2E where UI exposed

NO COMMIT / PUSH / MERGE / DEPLOY until final report.
