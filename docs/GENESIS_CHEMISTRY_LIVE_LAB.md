# Genesis Chemistry Live Lab

Branch: `claude/genesis-chemistry-live-lab`. It is based on
`codex/genesis-final-integration` at `fd4c3e15`.

Route: `#/chemistry-live-lab`. In the menu, open Biblioteka, then
"Nauka i eksploracja", then Chemistry Live Lab.

Chemistry Live Lab is an education layer inside the existing product. It
adds a governed catalog, a reaction-model boundary, safety classification, a
live stage timeline and three presentation depths. It adds no chemistry of
its own:
- Every number comes from an existing, tested model or dataset.
- Every scene is an existing Chemistry Lab scene.
- Every seal and replay goes through the canonical `ExperimentSession`.
- Computational progress is made only of real backend execution events.

## 1. Package audit (`Genesis_Chemistry_Live_Lab_Pack.zip`)

- ZIP SHA-256: `8cd87976b4725ec9b6b994c0d4bdf13e71e80abb08c6226a90a0ce763ab5847a`
- `SHA256SUMS.json`: 8 of 8 files match.

| Package file | Decision | Reason |
| --- | --- | --- |
| `README_PL.md` | ADAPT_TO_CURRENT_ARCHITECTURE | Its intent was absorbed into this document. |
| `docs/ARCHITECTURE.md` | ADAPT_TO_CURRENT_ARCHITECTURE | The flow is kept. It did not know about the canonical `REACTIONS`/`SPECIES` in `@genesis/core` ThermodynamicLabEngine, the fabric compute route, or `ExperimentSession` replay. |
| `core/chemistryEducation/contracts.ts` | ADAPT_TO_CURRENT_ARCHITECTURE | Extended with: model binding, parameters, quiz, observation origin, evidence eligibility, and statuses REQUIRES_TEACHER_REVIEW, UNKNOWN_EXPERIMENT, BLOCKED_MISSING_DATA and BLOCKED_PHYSICAL_ACTUATION. Presentation levels now reuse `ExperimentPresentationLevel`. |
| `core/chemistryEducation/catalog.ts` | ADAPT_TO_CURRENT_ARCHITECTURE | Steps were fixed timer text with no model calls. Each entry now binds a real runner and a real scene. Kinetics was labelled COMPUTATIONAL_LIVE while using timer durations, so it now runs on the backend model. |
| `core/chemistryEducation/periodicTable.ts` | ADAPT_TO_CURRENT_ARCHITECTURE | The package set `group = col` and `period = row`. Both are wrong for the f-block rows 8 and 9 of the display grid. Electronegativity and trends were added only where a dataset exists (null otherwise). |
| `core/chemistryEducation/liveTimeline.ts` | ADAPT_TO_CURRENT_ARCHITECTURE | The deterministic timeline is kept for EDUCATIONAL_PROCEDURE_MODEL only. Computational runs never use it. |
| `core/chemistryEducation/planner.ts` | ADAPT_TO_CURRENT_ARCHITECTURE | The package mapped an unknown *experiment id* to UNSUPPORTED_REACTION_MODEL. It also had no parameter validation, no teacher review and no actuation guard. |
| `__tests__/chemistryEducationLiveLab.test.ts` | ADAPT_TO_CURRENT_ARCHITECTURE | Superseded by `__tests__/chemistryLiveLab.test.ts`, which has 24 tests. |

No file was used as-is. Nothing in the package overwrote a newer canonical
implementation.

## 2. Canonical systems reused

| Need | Canonical implementation |
| --- | --- |
| 118 elements | `data/elements.ts` `ELEMENTS` |
| Pauling electronegativity | `data/electronegativity.ts` |
| Atomic radius and ionisation energy (Z ≤ 36) | `data/periodicTrends.ts` |
| Titration | `labs/experiments/chemistry-titration.ts` `runTitrationScenario` → `core/physics.ts` `titrationPH`. The backend model `chemistry-titration` runs the same shared runner. |
| VSEPR | `labs/experiments/chemistry-vsepr.ts` `runVseprScenario` (backend `chem-vsepr`) |
| Bond polarity | `core/physics.ts` `bondPolarity` |
| Thermochemistry | `@genesis/core/lab/ThermodynamicLabEngine` `thermo`, `REACTIONS`, `SPECIES` |
| Arrhenius | backend `chemistry-arrhenius` via `POST /api/compute/fabric/run` (`runFabricCompute`) → `core/modelGraph/chemistryKineticsGraph.ts` |
| Protocol | `core/lab/experimentProtocol.ts` `ExperimentProtocol` + `validateProtocol` |
| Seal and replay | `core/scientificWorlds/experimentSession.ts` `createExperimentSession` / `replayExperimentSession` |
| Execution events | `ScientificExecutionEvent` (`core/backend/client.ts`) |
| Presentation depth | `ExperimentPresentationLevel` (`ComputationalExperimentPlayback`) |
| Chat routing | `core/experimentFabric/parser.ts` `parseScienceChatMessage` |
| Scenes | Chemistry Lab `chemistryTitration.createSim`, `chemistryVsepr.createSim3D`, and `bond-polarity-2d` via `useSimLoop` / `useThreeLoop` |

## 3. Live execution

- **EDUCATIONAL_PROCEDURE_MODEL**
  - Used for titration, VSEPR, bond polarity, element structure and thermochemistry.
  - The canonical runner runs once and `createExperimentSession` seals the result.
  - The stage list is a deterministic playback with fixed per-stage dwell times: QUESTION → EXPERIMENT_SELECTED → PLAN → SAFETY_CHECK → PREPARATION → STEP… → OBSERVATION → ANALYSIS → RESULT → EXPLANATION → LEARNING_CHECK.
  - The label "EDUCATIONAL PROCEDURE MODEL — NOT PHYSICAL LAB TELEMETRY" is always shown.
  - Every observation carries `origin` MODEL_COMPUTED or CANONICAL_DATASET.
- **COMPUTATIONAL_LIVE**
  - Used for Arrhenius.
  - Three real backend runs: 298.15 K, T, and T + 10 K.
  - Events are emitted only when a request is dispatched or a response arrives: EXPERIMENT_PLANNED → ENGINE_SELECTED → INPUT_VALIDATED → ENGINE_OUTPUT_AVAILABLE (per `runId`) → RESULT_CREATED → EXECUTION_COMPLETED.
  - If the backend fails, the run is FAILED or BLOCKED. There is no local fallback and no timer.

## 4. Governed boundaries

- **Reaction Knowledge Layer** (`reactionKnowledge.ts`)
  - A reaction exists only if a model computes it:
    - 6 thermochemistry records from `REACTIONS`
    - 4 weak-acid titration records from the titration runner
  - Every record must balance element by element.
  - `R-ZN-CUSO4` fails the check because the engine omits the Cu(s) product. It is excluded automatically (`EXCLUDED_REACTIONS`). **Its engine data should be fixed in `@genesis/core`: add `Cu_s` and replace the `NaCl_s: 0` placeholder.**
  - Lookup matches the reactant set exactly. Anything else returns `UNSUPPORTED_REACTION_MODEL`.
  - No LLM is involved, and nothing is ever invented.
- **Safety**
  - CLASSROOM_SAFE_MODEL runs directly.
  - TEACHER_REVIEW requires teacher confirmation. It applies to formic and benzoic acid, and to combustion and decomposition.
  - BLOCKED_HAZARDOUS never shows procedure stages; it can show only a concept-level equation. It applies to HCN, H₂ + O₂ and Na + Cl₂.
  - Unknown reactions are fail-closed: they default to BLOCKED_HAZARDOUS.
  - Protocols contain only ANALYZE and STOP steps with no devices. A physical step type or any device yields BLOCKED_PHYSICAL_ACTUATION, so a lesson can never reach `LabSafetyInterlock`.
- **Missing data blocks**
  - Examples: no Pauling χ for noble gases; trends only for Z ≤ 36.
- **Evidence**
  - Educational runs are never Evidence.
  - Ephemeral public fabric runs are not persisted, so they are not eligible.
  - Only runs persisted in a project are eligible.
  - The layer never proposes Evidence itself.

## 5. Remaining work (not done here)

1. Fix `R-ZN-CUSO4` in `packages/core/src/lab/ThermodynamicLabEngine.ts`, then re-run `lab.test.ts`.
2. Heavier engines are not bound yet: RDKit descriptors, PySCF QM and the other Virtual Lab capabilities. They need a project and campaign context, which a public lesson does not have. The Evidence and replay ladder for them is the Virtual Lab in `#/campaign`.
3. Periodic trends beyond Z = 36 and more reaction records are still missing. Add them only with sourced data.
4. The `genesisHoloBackdrop` test was already failing on the base branch: it expects the menu label "Wszystkie moduły", which is now "Biblioteka". This branch does not change it.
