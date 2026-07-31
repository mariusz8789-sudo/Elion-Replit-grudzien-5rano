# Cognitive Ceiling — Milestone 1: Evidence Store + Scientific Task DAG

**Priority 1** of the Genesis Cognitive Architecture v3 program. Additive
`v8 → v9` persistence migration establishing the foundational data layer every
later cognitive module (Mission Planner, Workflow Engine, Hypothesis Engine,
Critic Swarm, Meta-Orchestrator) reads and writes through.

**Preserved, not rewritten:** no Phase-1 code and no validated scientific engine
was touched. `provenance.mjs` hash semantics (`canonicalHash`) are reused exactly
as the forensic audit fixed them — content identity for every new entity is a
`canonicalHash`, never a fabricated value.

## What was built (real, tested)

### Schema v9 (additive migration, `store.mjs`)
New tables, all long-horizon-continuation-ready, history tables append-only:

| Table | Purpose |
|---|---|
| `research_missions` | Top-level mission: goal, domain, spec, compute/model budgets, status, content hash |
| `research_questions` | Decomposition tree (parent_id), lifecycle status |
| `hypotheses` | Competing hypotheses: claim, assumptions, predicted + **disconfirming** observations, required evidence, epistemic status, optional confidence, supersession |
| `evidence` | Generic append-only evidence object (see ontology below) |
| `task_dag_nodes` | Scientific Task DAG nodes with the 7-state lifecycle |
| `task_dag_edges` | `depends-on` dependencies (unique), acyclic by construction |
| `task_state_transitions` | Append-only lifecycle audit |
| `workflow_mutations` | Append-only, evidence-backed workflow-change records |
| `mission_checkpoints` | Restart/recovery snapshots (frontier + summary + state hash) |

Migration is idempotent and forward-only via `PRAGMA user_version`; a pre-existing
v8 database upgrades in place with every prior table untouched (tested).

### Domain layer (`cognitive/`)
- **`evidenceStore.mjs`** — validated CRUD for missions/questions/hypotheses/
  evidence; canonical epistemic-status vocabulary; content hashing; evidence
  integrity (tamper) check; `reconstructMissionState` for long-horizon restart.
- **`taskGraph.mjs`** — the Scientific Task DAG: `addTask`, `addDependency`
  (cycle-rejecting), dependency-driven readiness, validated lifecycle
  transitions with auto-unblocking of dependents on completion,
  `executionFrontier`, `workflowHash`, `checkpoint`.
- **`workflowMutation.mjs`** — append-only, evidence-backed WorkflowMutation
  records with previous-workflow hash, expected benefit, actual result, rollback.

### Canonical vocabularies (unifying the previously fragmented enums)

**Epistemic status** (how something is known — never collapsed to one score):
`OBSERVED · COMPUTED · INFERRED · HYPOTHESIZED · PUBLISHER_REPORTED · SUPPORTED ·
PROVISIONAL · UNVERIFIED · VERIFIED · CONTRADICTED · REJECTED · SUPERSEDED ·
BLOCKED_BY_RESOURCES · CAPABILITY_GAP`.

**Task lifecycle** (exactly the 7 mandated states):
`READY · RUNNING · BLOCKED · COMPLETED · FAILED · REJECTED · SUPERSEDED`, with a
validated transition table (terminal states may only be superseded; `FAILED →
READY` allows retry).

### Evidence object fields
stable id · mission id · kind · epistemic status · content + `content_hash`
(canonical) · source · source location · origin · science-run link · related
hypothesis/question/task · parent evidence (lineage) · optional confidence ·
verification status · artifact refs · timestamp. Append-only; supersession is a
relation, never a deletion or overwrite.

## Verification

- New suite `cognitive.test.mjs` — **8/8**: migration + additivity; content
  hashing + tamper detection; strict epistemic/kind validation; DAG readiness,
  blocking, auto-unblock; cycle rejection; illegal-transition rejection;
  append-only transition audit; WorkflowMutation record + completion; and a
  **real file-DB restart** proving the execution frontier reconstructs after a
  close/reopen (understanding is not reset).
- Full gate: backend **253/253** (0 skipped), frontend **601/601**, production
  build green, `eslint .` clean.

## Honest capability gaps (CAPABILITY_GAP — built next, not faked now)

This milestone is the **data + lifecycle substrate only**. The following are
intentionally *not* implemented yet and are declared gaps, not stubs pretending
to work:

- **Mission Planner (Priority 2)** — nothing yet decomposes a goal into
  questions/hypotheses/tasks; entities are created via API by callers/tests.
- **Dynamic Workflow Engine (Priority 3)** — `workflow_mutations` records exist,
  but no engine yet *decides* a strategy is failing and emits one; there is no
  automatic structural mutation.
- **Hypothesis Engine / Critic Swarm (Priority 4)** — hypotheses can be stored
  with disconfirming predictions, but nothing yet *generates competing* ones or
  *adversarially attacks* them.
- **Verification wiring** — the existing replay-verification engine
  (`campaign/verify.mjs`) is not yet connected to `evidence.verification_status`.
- **HTTP API surface** — these entities are not yet exposed via `/api`; they will
  be when the Mission Planner produces missions (Priority 2), to avoid endpoints
  with no producer.
- **Compute/model budget accounting** — budget columns exist and persist, but no
  estimator populates or enforces them yet (Priority 6/11 interfaces).

Every gap above is tracked by the approved dependency order in
`GENESIS_COGNITIVE_GAP_ANALYSIS.md`.
