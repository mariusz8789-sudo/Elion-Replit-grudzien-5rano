# Genesis Engine Suite E2E V1

A self-contained, strict-TypeScript reference implementation of the engine set requested for Genesis.

Included engines:
1. Genesis Cyber Scientist Engine
2. Candidate / Drug Discovery Engine
3. World Author / World Director Engine
4. Evidence + Replay Engine
5. Meta-Cognition Engine
6. Experiment Planner
7. Candidate Ranking / Falsification Engine
8. Autonomous Research Campaign Engine
9. ModelRouter
10. Digital Twin Orchestration
11. Specialist Solver Pack

Specialist solvers included:
- RK4 integrator
- SEIR epidemic solver
- logistic growth solver
- Newtonian kinematics
- 1D diffusion finite-difference solver
- exponential decay solver

## Meaning of "E2E"

This package is 100% end-to-end **as a standalone transfer/reference implementation**:
- strict TypeScript builds
- engines call each other through concrete interfaces
- evidence/replay is real and deterministic
- research campaign executes a full plan → solver → observation → evidence → hypothesis update loop
- world author/director executes a validated proposal through a canonical-world port
- Digital Twin performs simulation-only state transitions
- Drug Discovery runs identity → evidence/safety → CHEAP → DOCKING → QM → ADMET → final research state
- Cyber runs inventory → threat hypothesis → defensive analyzer → finding → patch proposal → approval → retest
- ModelRouter routes providers and cannot label raw model output as solver-verified without evidence refs

It is NOT proof of real Genesis repository integration, real RDKit/docking/PySCF/ADMET execution, real external security scanners, real API credentials, or physical hardware. Those bindings must be performed in the real repo.

## Core architectural rule

Use this as adapters/orchestration around canonical Genesis systems. Do not create duplicate WorldGraph, EvidenceLedger, TemporalEngine, Human Twin, command bus, or production solver registry.
