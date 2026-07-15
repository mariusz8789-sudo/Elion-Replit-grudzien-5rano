/**
 * Genesis OS — backend: trwały magazyn danych (Milestone 1: Backend Persistence).
 *
 * Wybór technologii: `node:sqlite` (wbudowany w Node 22, zero zewnętrznych
 * zależności). To realna, transakcyjna baza SQL — nie atrapa. Schemat jest
 * przenośnym, standardowym SQL, więc migracja do PostgreSQL dla dużych
 * instytucji (uczelnie, projekty typu ESA/NASA) będzie zmianą sterownika, a
 * nie przepisaniem modelu danych. Cały dostęp do danych przechodzi przez ten
 * jeden moduł — server.mjs nigdy nie sięga do SQL bezpośrednio.
 *
 * Projekt pod skalę, ale implementujemy WYŁĄCZNIE zweryfikowaną funkcjonalność:
 *  - użytkownicy + sesje (uwierzytelnianie),
 *  - projekty + członkostwa z ROLAMI (RBAC: owner > admin > editor > viewer),
 *  - trwałe, REPRODUKOWALNE Serie Prób (zamrożone parametry, wyjścia, wersja
 *    modelu i autor — pełna prowieniencja każdej próby).
 *
 * `openDatabase(':memory:')` daje izolowaną bazę na test (node --test), bez
 * dotykania dysku. Wszystkie funkcje są synchroniczne (taki jest node:sqlite),
 * co upraszcza logikę API i testy.
 */

import { DatabaseSync } from 'node:sqlite';
import { newId } from './auth.mjs';

/* ---------------- Role i uprawnienia (RBAC) ---------------- */

/** Ranga roli — wyższa liczba obejmuje wszystkie uprawnienia niższych. */
export const ROLE_RANK = { viewer: 1, editor: 2, admin: 3, owner: 4 };
export const ROLES = Object.keys(ROLE_RANK);

/** Czy `role` ma co najmniej uprawnienia `min` (np. atLeast('admin','editor')===true). */
export function atLeast(role, min) {
  return (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[min] ?? Infinity);
}

/* ---------------- Schemat ---------------- */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visibility  TEXT NOT NULL DEFAULT 'private',
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS memberships (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, user_id)
);
CREATE TABLE IF NOT EXISTS trials (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  experiment_id TEXT NOT NULL,
  author_id     TEXT NOT NULL REFERENCES users(id),
  idx           INTEGER NOT NULL,
  label         TEXT NOT NULL,
  params_json   TEXT NOT NULL,
  outputs_json  TEXT NOT NULL,
  status        TEXT NOT NULL,
  note          TEXT NOT NULL DEFAULT '',
  parent_id     TEXT,
  model_version TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trials_project ON trials(project_id, experiment_id, idx);
`;

/**
 * Migracje schematu do wersji 2 (Milestone 2: Scientific Git). Realny mechanizm
 * migracji „w przód" oparty o PRAGMA user_version — potrzebny, gdy baza z
 * Milestone 1 (bez gałęzi) ma już dane instytucji. Dodaje:
 *  - branches: nazwane linie pracy w projekcie (git-style),
 *  - trials.branch_id: przynależność próby do gałęzi,
 *  - merge_requests: recenzja i scalanie gałęzi (RBAC),
 * a każdemu istniejącemu projektowi zakłada gałąź 'main' i przypisuje do niej
 * dotychczasowe próby (backfill), więc żadna próba nie zostaje osierocona.
 */
const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS branches (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  base_branch_id TEXT,
  created_by     TEXT NOT NULL REFERENCES users(id),
  created_at     INTEGER NOT NULL,
  UNIQUE (project_id, name)
);
CREATE TABLE IF NOT EXISTS merge_requests (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  target_branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'open',
  created_by       TEXT NOT NULL REFERENCES users(id),
  created_at       INTEGER NOT NULL,
  decided_by       TEXT,
  decided_at       INTEGER,
  review_note      TEXT NOT NULL DEFAULT '',
  merged_count     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_branches_project ON branches(project_id);
CREATE INDEX IF NOT EXISTS idx_mr_project ON merge_requests(project_id, status);
`;

/**
 * Migracja do wersji 3 (Backend Compute Engine): trwałe, audytowalne przebiegi
 * obliczeń naukowych (Scientific Runs). Każdy wiersz to jeden odtwarzalny run z
 * pełną prowieniencją. Opcjonalnie dowiązany do użytkownika i/lub projektu.
 */
const SCHEMA_V3 = `
CREATE TABLE IF NOT EXISTS runs (
  id             TEXT PRIMARY KEY,
  user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  project_id     TEXT REFERENCES projects(id) ON DELETE CASCADE,
  model_id       TEXT NOT NULL,
  model_version  TEXT NOT NULL,
  domain         TEXT NOT NULL,
  status         TEXT NOT NULL,
  inputs_json    TEXT NOT NULL,
  outputs_json   TEXT NOT NULL,
  units_json     TEXT NOT NULL DEFAULT '{}',
  warnings_json  TEXT NOT NULL DEFAULT '[]',
  provenance_json TEXT NOT NULL DEFAULT '{}',
  seed           INTEGER,
  deterministic  INTEGER NOT NULL DEFAULT 1,
  duration_ms    INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_model ON runs(model_id, created_at);
`;

/**
 * Migracja do wersji 4 (Drug Discovery, P6): cele biologiczne i kandydaci
 * molekularni. Reużywa projekty (kontener) i przebiegi obliczeń (paszporty).
 */
const SCHEMA_V4 = `
CREATE TABLE IF NOT EXISTS targets (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  target_type     TEXT NOT NULL DEFAULT '',
  gene_protein    TEXT NOT NULL DEFAULT '',
  organism        TEXT NOT NULL DEFAULT '',
  indication      TEXT NOT NULL DEFAULT '',
  mechanism       TEXT NOT NULL DEFAULT '',
  constraints     TEXT NOT NULL DEFAULT '',
  evidence_status TEXT NOT NULL DEFAULT 'unverified',
  provenance      TEXT NOT NULL DEFAULT '',
  created_by      TEXT REFERENCES users(id),
  created_at      INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS candidates (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_id         TEXT REFERENCES targets(id) ON DELETE SET NULL,
  label             TEXT NOT NULL,
  formula           TEXT NOT NULL DEFAULT '',
  smiles            TEXT NOT NULL DEFAULT '',
  composition_json  TEXT NOT NULL DEFAULT '{}',
  molecular_weight  REAL,
  charge            INTEGER NOT NULL DEFAULT 0,
  parent_id         TEXT,
  generation_method TEXT NOT NULL DEFAULT 'manual',
  provenance        TEXT NOT NULL DEFAULT '',
  created_by        TEXT REFERENCES users(id),
  created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_targets_project ON targets(project_id);
CREATE INDEX IF NOT EXISTS idx_candidates_project ON candidates(project_id, target_id);
`;

/**
 * Migracja do wersji 5 (P5: system zadań obliczeniowych). Lekka abstrakcja
 * zadań w procesie — bez Redis/Kubernetes. Rekord zadania jest gotowy pod
 * przyszłych workerów (kolejka = wiersze 'queued').
 */
const SCHEMA_V5 = `
CREATE TABLE IF NOT EXISTS jobs (
  id           TEXT PRIMARY KEY,
  project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued',
  progress     REAL NOT NULL DEFAULT 0,
  params_json  TEXT NOT NULL DEFAULT '{}',
  result_json  TEXT,
  run_ids_json TEXT NOT NULL DEFAULT '[]',
  error        TEXT,
  created_by   TEXT REFERENCES users(id),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
`;

/**
 * Migracja do wersji 6 (Scientific Acceleration Engine): trwałe kampanie
 * naukowe. Historia decyzji/zdarzeń jest APPEND-ONLY. Reużywa projekty i
 * Scientific Runs (prowieniencja).
 */
const SCHEMA_V6 = `
CREATE TABLE IF NOT EXISTS campaigns (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  objective         TEXT NOT NULL,
  domain            TEXT NOT NULL,
  objective_vector_json TEXT NOT NULL DEFAULT '[]',
  constraints_json  TEXT NOT NULL DEFAULT '[]',
  budget_json       TEXT NOT NULL DEFAULT '{}',
  stopping_json     TEXT NOT NULL DEFAULT '{}',
  strategy_json     TEXT NOT NULL DEFAULT '{}',
  seed              INTEGER,
  status            TEXT NOT NULL DEFAULT 'created',
  current_generation INTEGER NOT NULL DEFAULT 0,
  stop_reason       TEXT,
  final_json        TEXT,
  created_by        TEXT REFERENCES users(id),
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS campaign_candidates (
  id                 TEXT PRIMARY KEY,
  campaign_id        TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  generation         INTEGER NOT NULL,
  parent_id          TEXT,
  parent_smiles      TEXT,
  transformation     TEXT,
  canonical_smiles   TEXT NOT NULL,
  valid              INTEGER NOT NULL DEFAULT 1,
  descriptors_json   TEXT NOT NULL DEFAULT '{}',
  objective_vector_json TEXT NOT NULL DEFAULT '{}',
  constraint_violations_json TEXT NOT NULL DEFAULT '[]',
  pareto             INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'retained',
  rejected_reason    TEXT,
  run_ids_json       TEXT NOT NULL DEFAULT '[]',
  created_at         INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS campaign_decisions (
  id            TEXT PRIMARY KEY,
  campaign_id   TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  generation    INTEGER NOT NULL,
  state_hash    TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  metrics_json  TEXT NOT NULL DEFAULT '{}',
  algorithm     TEXT NOT NULL,
  decision      TEXT NOT NULL,
  params_json   TEXT NOT NULL DEFAULT '{}',
  purpose       TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS campaign_events (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  generation  INTEGER NOT NULL DEFAULT 0,
  type        TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_camp_project ON campaigns(project_id);
CREATE INDEX IF NOT EXISTS idx_cand_campaign ON campaign_candidates(campaign_id, generation);
CREATE INDEX IF NOT EXISTS idx_dec_campaign ON campaign_decisions(campaign_id, generation);
CREATE INDEX IF NOT EXISTS idx_evt_campaign ON campaign_events(campaign_id, created_at);
`;

// Heavy scientific engines (docking/MD/QM/...): persisted runtime env audits and
// external-engine scientific runs (raw artifacts, hashes, provenance).
const SCHEMA_V7 = `
CREATE TABLE IF NOT EXISTS env_audits (
  id           TEXT PRIMARY KEY,
  runtime_json TEXT NOT NULL DEFAULT '{}',
  engines_json TEXT NOT NULL DEFAULT '{}',
  created_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS science_runs (
  id             TEXT PRIMARY KEY,
  project_id     TEXT REFERENCES projects(id) ON DELETE CASCADE,
  campaign_id    TEXT,
  candidate_id   TEXT,
  engine         TEXT NOT NULL,
  engine_version TEXT,
  capability     TEXT NOT NULL,
  method         TEXT,
  status         TEXT NOT NULL,
  evidence_class TEXT NOT NULL DEFAULT 'MODEL_ESTIMATE',
  inputs_json    TEXT NOT NULL DEFAULT '{}',
  outputs_json   TEXT NOT NULL DEFAULT '{}',
  units_json     TEXT NOT NULL DEFAULT '{}',
  warnings_json  TEXT NOT NULL DEFAULT '[]',
  provenance_json TEXT NOT NULL DEFAULT '{}',
  input_hash     TEXT,
  output_hash    TEXT,
  artifacts_json TEXT NOT NULL DEFAULT '[]',
  duration_ms    INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_science_runs_campaign ON science_runs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_science_runs_candidate ON science_runs(candidate_id);
`;

// Scientific Reproducibility (Priority B): an environment fingerprint per run, plus an append-only
// audit trail of replay-verification attempts (a run may be re-verified after an engine upgrade —
// history is kept, never overwritten).
const SCHEMA_V8 = `
CREATE TABLE IF NOT EXISTS science_run_verifications (
  id                       TEXT PRIMARY KEY,
  science_run_id           TEXT NOT NULL REFERENCES science_runs(id) ON DELETE CASCADE,
  verdict                  TEXT NOT NULL,
  original_output_hash     TEXT,
  replay_output_hash       TEXT,
  original_engine_version  TEXT,
  replay_engine_version    TEXT,
  detail_json              TEXT NOT NULL DEFAULT '{}',
  created_at               INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_science_run_verifications_run ON science_run_verifications(science_run_id);
`;

// Cognitive ceiling (Priority 1): Evidence Store ontology + Scientific Task DAG
// with an explicit lifecycle. ADDITIVE — no existing table is touched. Designed
// for long-horizon continuation: mission/question/hypothesis/evidence/task/edge/
// transition/mutation/checkpoint state all persist, so a restart reconstructs the
// research frontier instead of resetting understanding. Reuses projects (FK) and
// the provenance hash primitives (content_hash columns hold canonicalHash values
// computed in the cognitive/* domain layer — store.mjs never fabricates a hash).
// Epistemic status and task/mission lifecycle vocabularies are validated in the
// domain layer (cognitive/evidenceStore.mjs, cognitive/taskGraph.mjs); columns are
// permissive TEXT for forward-compatibility. History tables (evidence,
// task_state_transitions, workflow_mutations, mission_checkpoints) are append-only.
const SCHEMA_V9 = `
CREATE TABLE IF NOT EXISTS research_missions (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT REFERENCES projects(id) ON DELETE CASCADE,
  goal                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active',
  domain              TEXT,
  spec_json           TEXT NOT NULL DEFAULT '{}',
  compute_budget_json TEXT NOT NULL DEFAULT '{}',
  model_budget_json   TEXT NOT NULL DEFAULT '{}',
  content_hash        TEXT,
  created_by          TEXT REFERENCES users(id),
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS research_questions (
  id           TEXT PRIMARY KEY,
  mission_id   TEXT NOT NULL REFERENCES research_missions(id) ON DELETE CASCADE,
  parent_id    TEXT,
  text         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open',
  answer_json  TEXT,
  content_hash TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS hypotheses (
  id                              TEXT PRIMARY KEY,
  mission_id                      TEXT NOT NULL REFERENCES research_missions(id) ON DELETE CASCADE,
  question_id                     TEXT,
  label                           TEXT,
  claim                           TEXT NOT NULL,
  assumptions_json                TEXT NOT NULL DEFAULT '[]',
  predicted_observations_json     TEXT NOT NULL DEFAULT '[]',
  disconfirming_observations_json TEXT NOT NULL DEFAULT '[]',
  required_evidence_json          TEXT NOT NULL DEFAULT '[]',
  epistemic_status                TEXT NOT NULL DEFAULT 'HYPOTHESIZED',
  confidence                      REAL,
  status                          TEXT NOT NULL DEFAULT 'open',
  superseded_by                   TEXT,
  content_hash                    TEXT,
  created_at                      INTEGER NOT NULL,
  updated_at                      INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence (
  id                  TEXT PRIMARY KEY,
  mission_id          TEXT NOT NULL REFERENCES research_missions(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL,
  epistemic_status    TEXT NOT NULL,
  content_json        TEXT NOT NULL DEFAULT '{}',
  content_hash        TEXT NOT NULL,
  source              TEXT,
  source_location     TEXT,
  origin              TEXT,
  science_run_id      TEXT,
  hypothesis_id       TEXT,
  question_id         TEXT,
  task_id             TEXT,
  parent_evidence_id  TEXT,
  confidence          REAL,
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  artifacts_json      TEXT NOT NULL DEFAULT '[]',
  created_at          INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS task_dag_nodes (
  id                    TEXT PRIMARY KEY,
  mission_id            TEXT NOT NULL REFERENCES research_missions(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  task_type             TEXT NOT NULL,
  spec_json             TEXT NOT NULL DEFAULT '{}',
  state                 TEXT NOT NULL DEFAULT 'BLOCKED',
  blocked_reason        TEXT,
  question_id           TEXT,
  hypothesis_id         TEXT,
  engine                TEXT,
  compute_estimate_json TEXT NOT NULL DEFAULT '{}',
  compute_actual_json   TEXT NOT NULL DEFAULT '{}',
  result_json           TEXT,
  result_evidence_id    TEXT,
  superseded_by         TEXT,
  content_hash          TEXT,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS task_dag_edges (
  id           TEXT PRIMARY KEY,
  mission_id   TEXT NOT NULL REFERENCES research_missions(id) ON DELETE CASCADE,
  from_task_id TEXT NOT NULL,
  to_task_id   TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'depends-on',
  created_at   INTEGER NOT NULL,
  UNIQUE(from_task_id, to_task_id, kind)
);
CREATE TABLE IF NOT EXISTS task_state_transitions (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  from_state TEXT,
  to_state   TEXT NOT NULL,
  reason     TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS workflow_mutations (
  id                       TEXT PRIMARY KEY,
  mission_id               TEXT NOT NULL REFERENCES research_missions(id) ON DELETE CASCADE,
  reason                   TEXT NOT NULL,
  triggering_evidence_json TEXT NOT NULL DEFAULT '[]',
  previous_workflow_hash   TEXT,
  proposed_json            TEXT NOT NULL DEFAULT '{}',
  expected_benefit_json    TEXT NOT NULL DEFAULT '{}',
  actual_result_json       TEXT,
  rollback_json            TEXT,
  verification_status      TEXT NOT NULL DEFAULT 'UNVERIFIED',
  content_hash             TEXT,
  created_at               INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mission_checkpoints (
  id            TEXT PRIMARY KEY,
  mission_id    TEXT NOT NULL REFERENCES research_missions(id) ON DELETE CASCADE,
  label         TEXT,
  frontier_json TEXT NOT NULL DEFAULT '[]',
  summary_json  TEXT NOT NULL DEFAULT '{}',
  state_hash    TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_missions_project ON research_missions(project_id);
CREATE INDEX IF NOT EXISTS idx_questions_mission ON research_questions(mission_id);
CREATE INDEX IF NOT EXISTS idx_hypotheses_mission ON hypotheses(mission_id);
CREATE INDEX IF NOT EXISTS idx_evidence_mission ON evidence(mission_id, created_at);
CREATE INDEX IF NOT EXISTS idx_evidence_hypothesis ON evidence(hypothesis_id);
CREATE INDEX IF NOT EXISTS idx_tasknodes_mission ON task_dag_nodes(mission_id, state);
CREATE INDEX IF NOT EXISTS idx_taskedges_mission ON task_dag_edges(mission_id);
CREATE INDEX IF NOT EXISTS idx_taskedges_to ON task_dag_edges(to_task_id);
CREATE INDEX IF NOT EXISTS idx_taskedges_from ON task_dag_edges(from_task_id);
CREATE INDEX IF NOT EXISTS idx_transitions_task ON task_state_transitions(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mutations_mission ON workflow_mutations(mission_id, created_at);
CREATE INDEX IF NOT EXISTS idx_checkpoints_mission ON mission_checkpoints(mission_id, created_at);
`;

// Model Abstraction & Routing (Priority 7): every model decision is traceable —
// which provider/model served which role for which task, and its measured cost/
// latency. Append-only. mission_id is a soft link (nullable, routing can be
// mission-agnostic). No provider is hard-coded here; this only records decisions.
const SCHEMA_V10 = `
CREATE TABLE IF NOT EXISTS model_decisions (
  id              TEXT PRIMARY KEY,
  mission_id      TEXT,
  role            TEXT NOT NULL,
  task_class      TEXT,
  provider_id     TEXT NOT NULL,
  model_id        TEXT,
  complexity      TEXT,
  risk            TEXT,
  selection_reason TEXT,
  status          TEXT NOT NULL DEFAULT 'selected',
  latency_ms      INTEGER,
  tokens_in       INTEGER,
  tokens_out      INTEGER,
  cost            REAL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_model_decisions_mission ON model_decisions(mission_id, created_at);
CREATE INDEX IF NOT EXISTS idx_model_decisions_role ON model_decisions(role, created_at);
`;

// Dynamic Agent Fabric (Priority 8): every agent invocation is traceable — role,
// model decision, mission, input artifact hashes, output artifact hash, status,
// failure reason. Append-only. Agents are role wrappers over real engines; this
// records who did what, never chain-of-thought.
const SCHEMA_V11 = `
CREATE TABLE IF NOT EXISTS agent_invocations (
  id                TEXT PRIMARY KEY,
  mission_id        TEXT,
  role              TEXT NOT NULL,
  model_role        TEXT,
  model_decision_id TEXT,
  model_status      TEXT,
  input_hashes_json TEXT NOT NULL DEFAULT '[]',
  output_hash       TEXT,
  output_json       TEXT,
  status            TEXT NOT NULL,
  failure_reason    TEXT,
  created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_invocations_mission ON agent_invocations(mission_id, created_at);
`;

// Meta-Orchestrator (Priority 10): append-only strategy outcome records enabling
// cross-run, operational strategy scoring (measured history, not neural retraining).
const SCHEMA_V12 = `
CREATE TABLE IF NOT EXISTS strategy_records (
  id            TEXT PRIMARY KEY,
  mission_id    TEXT,
  strategy_key  TEXT NOT NULL,
  domain        TEXT,
  outcome_class TEXT NOT NULL,
  score         REAL,
  metrics_json  TEXT NOT NULL DEFAULT '{}',
  reasons_json  TEXT NOT NULL DEFAULT '[]',
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_strategy_records_key ON strategy_records(strategy_key, created_at);
CREATE INDEX IF NOT EXISTS idx_strategy_records_domain ON strategy_records(domain, created_at);
`;

// Compute Orchestrator (Priority 11): traceable compute placement decisions +
// budget/actual accounting. Append-only. Backends declare availability honestly;
// unavailable hardware is never faked.
const SCHEMA_V13 = `
CREATE TABLE IF NOT EXISTS compute_placements (
  id               TEXT PRIMARY KEY,
  mission_id       TEXT,
  task_id          TEXT,
  backend_id       TEXT,
  requirements_json TEXT NOT NULL DEFAULT '{}',
  estimated_ms     INTEGER,
  actual_ms        INTEGER,
  status           TEXT NOT NULL,
  failure_class    TEXT,
  reason           TEXT,
  retry_of         TEXT,
  attempt          INTEGER NOT NULL DEFAULT 1,
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_compute_placements_mission ON compute_placements(mission_id, created_at);
CREATE INDEX IF NOT EXISTS idx_compute_placements_task ON compute_placements(task_id, created_at);
`;

// Sandbox Lab (Priority 12): append-only audit of sandbox→main promotions. A
// sandbox result is NOT verified evidence; promotion requires explicit verification
// status + provenance, recorded here.
const SCHEMA_V14 = `
CREATE TABLE IF NOT EXISTS sandbox_promotions (
  id                 TEXT PRIMARY KEY,
  sandbox_mission_id TEXT NOT NULL,
  source_evidence_id TEXT NOT NULL,
  target_mission_id  TEXT,
  target_evidence_id TEXT,
  decision           TEXT NOT NULL,
  reason             TEXT,
  created_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sandbox_promotions_sandbox ON sandbox_promotions(sandbox_mission_id, created_at);
`;

// ZEFIR Adversarial Molecular Funnel (Phase 3F/G/H/J): candidate survival stages
// with full per-stage provenance, negative-result (rejection-motif) memory, and
// Candidate Dossier V2. Append-only history. No fabricated science: statuses are
// explicit (EXECUTED/VERIFIED/REJECTED/SKIPPED_BY_POLICY/CAPABILITY_GAP/
// BLOCKED_BY_RUNTIME/BLOCKED_BY_RESOURCES/FAILED).
const SCHEMA_V15 = `
CREATE TABLE IF NOT EXISTS funnel_candidates (
  id                  TEXT PRIMARY KEY,
  mission_id          TEXT,
  canonical_smiles    TEXT NOT NULL,
  molecular_hash      TEXT NOT NULL,
  parent_id           TEXT,
  generation_strategy TEXT,
  program_modality    TEXT,
  status              TEXT NOT NULL DEFAULT 'surviving',
  survival_rank       INTEGER,
  created_at          INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS funnel_stages (
  id             TEXT PRIMARY KEY,
  candidate_id   TEXT NOT NULL,
  mission_id     TEXT,
  stage          TEXT NOT NULL,
  engine         TEXT,
  engine_version TEXT,
  params_json    TEXT NOT NULL DEFAULT '{}',
  input_hash     TEXT,
  output_json    TEXT NOT NULL DEFAULT '{}',
  output_hash    TEXT,
  duration_ms    INTEGER NOT NULL DEFAULT 0,
  epistemic_class TEXT,
  status         TEXT NOT NULL,
  failure_reason TEXT,
  created_at     INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rejection_motifs (
  id           TEXT PRIMARY KEY,
  mission_id   TEXT,
  motif_key    TEXT NOT NULL,
  motif_kind   TEXT NOT NULL,
  candidate_id TEXT,
  detail_json  TEXT NOT NULL DEFAULT '{}',
  created_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS candidate_dossiers (
  id           TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  mission_id   TEXT,
  dossier_json TEXT NOT NULL DEFAULT '{}',
  content_hash TEXT,
  cro_readiness TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_funnel_candidates_mission ON funnel_candidates(mission_id, created_at);
CREATE INDEX IF NOT EXISTS idx_funnel_stages_candidate ON funnel_stages(candidate_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rejection_motifs_key ON rejection_motifs(mission_id, motif_key);
CREATE INDEX IF NOT EXISTS idx_candidate_dossiers_candidate ON candidate_dossiers(candidate_id, created_at);
`;

// Scientific Resource Layer (3E) + Reality Bridge (3K). Resources record source
// identity/type/license/version/content-hash/parser/validation. Experimental results
// import structured measurements with artifacts (never a typed sentence). Prediction
// errors seed prediction-vs-reality performance. Append-only.
const SCHEMA_V16 = `
CREATE TABLE IF NOT EXISTS scientific_resources (
  id             TEXT PRIMARY KEY,
  resource_id    TEXT NOT NULL,
  source_identity TEXT,
  source_type    TEXT NOT NULL,
  license        TEXT,
  version        TEXT,
  content_hash   TEXT NOT NULL,
  parser_version TEXT,
  validation_status TEXT NOT NULL,
  meta_json      TEXT NOT NULL DEFAULT '{}',
  imported_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS experimental_results (
  id              TEXT PRIMARY KEY,
  external_id     TEXT NOT NULL,
  lab_identity    TEXT,
  protocol_ref    TEXT,
  candidate_id    TEXT,
  measurement_type TEXT NOT NULL,
  result_class    TEXT NOT NULL,
  units           TEXT,
  result_value    REAL,
  uncertainty     REAL,
  artifact_ref    TEXT,
  artifact_hash   TEXT,
  import_status   TEXT NOT NULL,
  reviewer_status TEXT NOT NULL DEFAULT 'PENDING',
  created_at      INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS prediction_errors (
  id             TEXT PRIMARY KEY,
  candidate_id   TEXT,
  measurement_type TEXT,
  predicted      REAL,
  measured       REAL,
  abs_error      REAL,
  strategy_key   TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resources_rid ON scientific_resources(resource_id, imported_at);
CREATE INDEX IF NOT EXISTS idx_experimental_candidate ON experimental_results(candidate_id, created_at);
CREATE INDEX IF NOT EXISTS idx_prediction_errors_strategy ON prediction_errors(strategy_key, created_at);
`;

// Bio Foundation (3D): machine-readable biological entities + typed relations, with
// an explicit biological evidence class. Chemistry alone does not explain disease.
const SCHEMA_V17 = `
CREATE TABLE IF NOT EXISTS bio_entities (
  id             TEXT PRIMARY KEY,
  mission_id     TEXT,
  entity_type    TEXT NOT NULL,
  name           TEXT NOT NULL,
  identifier     TEXT,
  evidence_class TEXT NOT NULL,
  source         TEXT,
  meta_json      TEXT NOT NULL DEFAULT '{}',
  created_at     INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bio_relations (
  id            TEXT PRIMARY KEY,
  mission_id    TEXT,
  from_entity   TEXT NOT NULL,
  to_entity     TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  evidence_class TEXT NOT NULL,
  detail_json   TEXT NOT NULL DEFAULT '{}',
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bio_entities_mission ON bio_entities(mission_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_bio_relations_mission ON bio_relations(mission_id);
`;

// Formal Reality Kernel (Phase 4 G/L): persisted formal relations with dimensions +
// derivation status, and formal failure regions (Necropolis 2). LLM-generated
// equations are UNVERIFIED_FORMALIZATION until symbolically/computationally checked.
const SCHEMA_V18 = `
CREATE TABLE IF NOT EXISTS formal_relations (
  id             TEXT PRIMARY KEY,
  mission_id     TEXT,
  kind           TEXT NOT NULL,
  expression     TEXT,
  symbols_json   TEXT NOT NULL DEFAULT '[]',
  dimension_json TEXT NOT NULL DEFAULT '{}',
  status         TEXT NOT NULL,
  source         TEXT,
  assumptions_json TEXT NOT NULL DEFAULT '[]',
  validity_domain_json TEXT NOT NULL DEFAULT '{}',
  evidence_refs_json TEXT NOT NULL DEFAULT '[]',
  content_hash   TEXT,
  created_at     INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS formal_failure_regions (
  id             TEXT PRIMARY KEY,
  mission_id     TEXT,
  failure_class  TEXT NOT NULL,
  context        TEXT,
  parameter_vector_json TEXT NOT NULL DEFAULT '{}',
  normalized_json TEXT NOT NULL DEFAULT '{}',
  assumptions_json TEXT NOT NULL DEFAULT '[]',
  failure_mode   TEXT,
  verification_state TEXT,
  content_hash   TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_formal_relations_mission ON formal_relations(mission_id, created_at);
CREATE INDEX IF NOT EXISTS idx_formal_failures_mission ON formal_failure_regions(mission_id, failure_class);
`;

// ZEFIR Truth Engine / R&D Kill-Switch (Phase 4 product): persisted pre-flight
// analyses with a reproducible decision hash (timestamp excluded from the hash).
const SCHEMA_V19 = `
CREATE TABLE IF NOT EXISTS truth_analyses (
  id              TEXT PRIMARY KEY,
  proposal_hash   TEXT NOT NULL,
  decision        TEXT NOT NULL,
  decision_hash   TEXT NOT NULL,
  certificate_json TEXT NOT NULL DEFAULT '{}',
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_truth_analyses_proposal ON truth_analyses(proposal_hash, created_at);
`;

// v20 — Necropolis product hardening + tenant isolation. Failure regions gain
// EXPLICIT tenant ownership (project_id), domain + provenance metadata, and a
// version. Truth analyses gain project_id so history is tenant-scoped. Columns
// are added defensively (only if absent) so the migration is idempotent-safe.
const SCHEMA_V20_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_formal_failures_project ON formal_failure_regions(project_id, context);
CREATE INDEX IF NOT EXISTS idx_truth_analyses_project ON truth_analyses(project_id, created_at);
`;

// v21 — Autonomous Discovery Forge. A discovery campaign (tenant-owned) plus an
// APPEND-ONLY event log giving full provenance + replay of every generation,
// cohort, engine run, criticism, failure-memory event, and plan mutation.
const SCHEMA_V21 = `
CREATE TABLE IF NOT EXISTS discovery_campaigns (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL,
  challenge_json TEXT NOT NULL DEFAULT '{}',
  status         TEXT NOT NULL,
  plan_hash      TEXT,
  state_json     TEXT NOT NULL DEFAULT '{}',
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS discovery_events (
  id           TEXT PRIMARY KEY,
  campaign_id  TEXT NOT NULL,
  generation   INTEGER NOT NULL DEFAULT 0,
  type         TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  content_hash TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_discovery_campaigns_project ON discovery_campaigns(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_discovery_events_campaign ON discovery_events(campaign_id, generation, created_at);
`;
function addColumnIfMissing(db, table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function migrate(db) {
  const { user_version: version } = db.prepare('PRAGMA user_version').get();
  if (version < 19) db.exec(SCHEMA_V19);
  if (version < 18) db.exec(SCHEMA_V18);
  if (version < 17) db.exec(SCHEMA_V17);
  if (version < 16) db.exec(SCHEMA_V16);
  if (version < 15) db.exec(SCHEMA_V15);
  if (version < 14) db.exec(SCHEMA_V14);
  if (version < 13) db.exec(SCHEMA_V13);
  if (version < 12) db.exec(SCHEMA_V12);
  if (version < 11) db.exec(SCHEMA_V11);
  if (version < 10) db.exec(SCHEMA_V10);
  if (version < 9) db.exec(SCHEMA_V9);
  if (version < 7) db.exec(SCHEMA_V7);
  if (version < 8) {
    db.exec(SCHEMA_V8);
    const cols = db.prepare('PRAGMA table_info(science_runs)').all();
    if (!cols.some((c) => c.name === 'environment_hash')) {
      db.exec('ALTER TABLE science_runs ADD COLUMN environment_hash TEXT');
    }
  }
  if (version < 6) db.exec(SCHEMA_V6);
  if (version < 5) db.exec(SCHEMA_V5);
  if (version < 4) db.exec(SCHEMA_V4);
  if (version < 3) db.exec(SCHEMA_V3);
  if (version < 2) {
    db.exec(SCHEMA_V2);
    // Dodaj kolumnę branch_id do trials, jeśli jej nie ma (baza z M1).
    const cols = db.prepare('PRAGMA table_info(trials)').all();
    if (!cols.some((c) => c.name === 'branch_id')) {
      db.exec('ALTER TABLE trials ADD COLUMN branch_id TEXT');
    }
    // Backfill: każdemu projektowi gałąź 'main' + przypisz istniejące próby.
    const projects = db.prepare('SELECT id, owner_id FROM projects').all();
    for (const p of projects) {
      let main = db.prepare('SELECT id FROM branches WHERE project_id = ? AND name = ?').get(p.id, 'main');
      if (!main) {
        const id = newId();
        db.prepare('INSERT INTO branches (id, project_id, name, base_branch_id, created_by, created_at) VALUES (?, ?, ?, NULL, ?, ?)').run(
          id, p.id, 'main', p.owner_id, Date.now(),
        );
        main = { id };
      }
      db.prepare('UPDATE trials SET branch_id = ? WHERE project_id = ? AND branch_id IS NULL').run(main.id, p.id);
    }
  }
  // v20 runs AFTER the create-blocks above so the tables it ALTERs already exist
  // (a fresh DB applies every block in sequence; ALTER must follow the CREATE).
  if (version < 20) {
    addColumnIfMissing(db, 'formal_failure_regions', 'project_id', 'project_id TEXT');
    addColumnIfMissing(db, 'formal_failure_regions', 'domain', 'domain TEXT');
    addColumnIfMissing(db, 'formal_failure_regions', 'provenance_json', "provenance_json TEXT NOT NULL DEFAULT '{}'");
    addColumnIfMissing(db, 'formal_failure_regions', 'region_version', 'region_version INTEGER NOT NULL DEFAULT 1');
    addColumnIfMissing(db, 'truth_analyses', 'project_id', 'project_id TEXT');
    db.exec(SCHEMA_V20_INDEXES);
  }
  if (version < 21) db.exec(SCHEMA_V21);
  if (version < 21) db.exec('PRAGMA user_version = 21');
}

/** Otwiera (i migruje) bazę. `:memory:` dla testów, ścieżka pliku w produkcji. */
export function openDatabase(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON;');
  if (filename !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/* ---------------- Mapowanie wierszy → obiekty (camelCase, bez pól wrażliwych) ---------------- */

function toUser(row) {
  if (!row) return null;
  return { id: row.id, email: row.email, displayName: row.display_name, createdAt: row.created_at };
}
function toProject(row, role) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.owner_id,
    visibility: row.visibility,
    createdAt: row.created_at,
    ...(role ? { role } : {}),
  };
}
function toTrial(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    experimentId: row.experiment_id,
    authorId: row.author_id,
    index: row.idx,
    label: row.label,
    params: JSON.parse(row.params_json),
    outputs: JSON.parse(row.outputs_json),
    status: row.status,
    note: row.note,
    parentId: row.parent_id ?? null,
    modelVersion: row.model_version,
    branchId: row.branch_id ?? null,
    createdAt: row.created_at,
  };
}

function toBranch(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    baseBranchId: row.base_branch_id ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function toMergeRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    sourceBranchId: row.source_branch_id,
    targetBranchId: row.target_branch_id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    decidedBy: row.decided_by ?? null,
    decidedAt: row.decided_at ?? null,
    reviewNote: row.review_note,
    mergedCount: row.merged_count,
  };
}

/* ---------------- Użytkownicy ---------------- */

/** Tworzy użytkownika. Rzuca Error('email_taken') przy duplikacie adresu. */
export function createUser(db, { email, displayName, passwordHash }) {
  const id = newId();
  const now = Date.now();
  try {
    db.prepare(
      'INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, email, displayName, passwordHash, now);
  } catch (err) {
    if (String(err?.message ?? '').includes('UNIQUE')) throw new Error('email_taken', { cause: err });
    throw err;
  }
  return { id, email, displayName, createdAt: now };
}

export function getUserByEmail(db, email) {
  return toUser(db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase()));
}
export function getUserById(db, id) {
  return toUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}
/** Zwraca surowy hash hasła (tylko do weryfikacji logowania — nie wychodzi poza API). */
export function getPasswordHash(db, userId) {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
  return row?.password_hash ?? null;
}

/* ---------------- Sesje ---------------- */

export function createSession(db, { userId, token, ttlMs }) {
  const now = Date.now();
  const expiresAt = now + ttlMs;
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    now,
    expiresAt,
  );
  return { token, userId, createdAt: now, expiresAt };
}

/** Zwraca użytkownika powiązanego z ważnym tokenem (albo null). Wygasłą sesję kasuje. */
export function getUserByToken(db, token) {
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!s) return null;
  if (Date.now() > s.expires_at) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return getUserById(db, s.user_id);
}

export function deleteSession(db, token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/** Sprząta wygasłe sesje (wołane okresowo przez serwer). Zwraca liczbę usuniętych. */
export function purgeExpiredSessions(db, now = Date.now()) {
  return db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now).changes;
}

/* ---------------- Projekty i członkostwa (RBAC) ---------------- */

/** Tworzy projekt i nadaje twórcy rolę 'owner' (jedna transakcja). */
export function createProject(db, { name, description = '', ownerId, visibility = 'private' }) {
  const id = newId();
  const now = Date.now();
  const tx = db.prepare('BEGIN');
  tx.run();
  try {
    db.prepare(
      'INSERT INTO projects (id, name, description, owner_id, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, name, description, ownerId, visibility, now);
    db.prepare('INSERT INTO memberships (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)').run(
      id,
      ownerId,
      'owner',
      now,
    );
    // Każdy projekt startuje z gałęzią 'main' (Scientific Git).
    db.prepare('INSERT INTO branches (id, project_id, name, base_branch_id, created_by, created_at) VALUES (?, ?, ?, NULL, ?, ?)').run(
      newId(), id, 'main', ownerId, now,
    );
    db.prepare('COMMIT').run();
  } catch (err) {
    db.prepare('ROLLBACK').run();
    throw err;
  }
  return toProject({ id, name, description, owner_id: ownerId, visibility, created_at: now }, 'owner');
}

export function getProject(db, id) {
  return toProject(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
}

/** Projekty, których użytkownik jest członkiem — z jego rolą, najnowsze pierwsze. */
export function listProjectsForUser(db, userId) {
  const rows = db
    .prepare(
      `SELECT p.*, m.role AS role FROM projects p
       JOIN memberships m ON m.project_id = p.id
       WHERE m.user_id = ? ORDER BY p.created_at DESC`,
    )
    .all(userId);
  return rows.map((r) => toProject(r, r.role));
}

/** Rola użytkownika w projekcie (albo null, jeśli nie jest członkiem). */
export function getRole(db, projectId, userId) {
  const row = db.prepare('SELECT role FROM memberships WHERE project_id = ? AND user_id = ?').get(projectId, userId);
  return row?.role ?? null;
}

/** Dodaje/aktualizuje członka z rolą. Nie pozwala zdegradować jedynego właściciela. */
export function setMember(db, { projectId, userId, role }) {
  if (!ROLES.includes(role)) throw new Error('invalid_role');
  const now = Date.now();
  db.prepare(
    `INSERT INTO memberships (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role`,
  ).run(projectId, userId, role, now);
  return { projectId, userId, role, createdAt: now };
}

export function listMembers(db, projectId) {
  const rows = db
    .prepare(
      `SELECT m.user_id, m.role, m.created_at, u.email, u.display_name FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.project_id = ? ORDER BY m.created_at ASC`,
    )
    .all(projectId);
  return rows.map((r) => ({
    userId: r.user_id,
    role: r.role,
    email: r.email,
    displayName: r.display_name,
    createdAt: r.created_at,
  }));
}

/* ---------------- Serie Prób (trwałe, reprodukowalne) ---------------- */

/**
 * Zapisuje próbę z pełną prowieniencją. Numer kolejny (idx) liczony w ramach
 * (projekt, eksperyment), więc każdy eksperyment ma własną serię 001, 002…
 * Zamrażamy: parametry wejściowe, policzone wyjścia, wersję modelu i autora —
 * to czyni próbę REPRODUKOWALNĄ (można odtworzyć dokładnie ten sam przebieg).
 */
export function createTrial(db, { projectId, experimentId, authorId, label, params, outputs, status, note = '', parentId = null, modelVersion = '', branchId = null }) {
  const id = newId();
  const now = Date.now();
  // Domyślnie gałąź 'main' projektu; numeracja jest per (gałąź, eksperyment).
  const branch = branchId ?? getMainBranch(db, projectId)?.id ?? null;
  const row = db
    .prepare('SELECT MAX(idx) AS maxIdx FROM trials WHERE branch_id = ? AND experiment_id = ?')
    .get(branch, experimentId);
  const index = (row?.maxIdx ?? 0) + 1;
  db.prepare(
    `INSERT INTO trials (id, project_id, experiment_id, author_id, idx, label, params_json, outputs_json, status, note, parent_id, model_version, branch_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    projectId,
    experimentId,
    authorId,
    index,
    label || `Próba ${String(index).padStart(3, '0')}`,
    JSON.stringify(params ?? {}),
    JSON.stringify(outputs ?? {}),
    status,
    note,
    parentId,
    modelVersion,
    branch,
    now,
  );
  return getTrial(db, id);
}

export function getTrial(db, id) {
  return toTrial(db.prepare('SELECT * FROM trials WHERE id = ?').get(id));
}

/**
 * Próby projektu; opcjonalnie zawężone do eksperymentu i/lub gałęzi. Rosnąco po
 * numerze. Filtr gałęzi realizuje „historię wersji tej linii pracy" (Scientific Git).
 */
export function listTrials(db, projectId, experimentId = null, branchId = null) {
  const clauses = ['project_id = ?'];
  const args = [projectId];
  if (experimentId) { clauses.push('experiment_id = ?'); args.push(experimentId); }
  if (branchId) { clauses.push('branch_id = ?'); args.push(branchId); }
  const rows = db
    .prepare(`SELECT * FROM trials WHERE ${clauses.join(' AND ')} ORDER BY experiment_id ASC, idx ASC`)
    .all(...args);
  return rows.map(toTrial);
}

/** Aktualizuje wyłącznie pola opisowe (etykieta/status/notatka) — dane naukowe są niezmienne. */
export function updateTrial(db, id, patch = {}) {
  const cur = db.prepare('SELECT * FROM trials WHERE id = ?').get(id);
  if (!cur) return null;
  const label = patch.label !== undefined ? String(patch.label).slice(0, 200) : cur.label;
  const status = patch.status !== undefined ? String(patch.status).slice(0, 40) : cur.status;
  const note = patch.note !== undefined ? String(patch.note).slice(0, 2000) : cur.note;
  db.prepare('UPDATE trials SET label = ?, status = ?, note = ? WHERE id = ?').run(label, status, note, id);
  return getTrial(db, id);
}

export function deleteTrial(db, id) {
  return db.prepare('DELETE FROM trials WHERE id = ?').run(id).changes > 0;
}

/* ---------------- Scientific Git: gałęzie ---------------- */

export function getMainBranch(db, projectId) {
  return toBranch(db.prepare('SELECT * FROM branches WHERE project_id = ? AND name = ?').get(projectId, 'main'));
}

export function getBranch(db, id) {
  return toBranch(db.prepare('SELECT * FROM branches WHERE id = ?').get(id));
}

export function listBranches(db, projectId) {
  const rows = db.prepare('SELECT * FROM branches WHERE project_id = ? ORDER BY created_at ASC').all(projectId);
  return rows.map(toBranch);
}

/** Tworzy nazwaną gałąź. Rzuca Error('branch_exists') przy duplikacie nazwy w projekcie. */
export function createBranch(db, { projectId, name, baseBranchId = null, createdBy }) {
  const id = newId();
  const now = Date.now();
  try {
    db.prepare('INSERT INTO branches (id, project_id, name, base_branch_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id, projectId, name, baseBranchId, createdBy, now,
    );
  } catch (err) {
    if (String(err?.message ?? '').includes('UNIQUE')) throw new Error('branch_exists', { cause: err });
    throw err;
  }
  return toBranch({ id, project_id: projectId, name, base_branch_id: baseBranchId, created_by: createdBy, created_at: now });
}

/**
 * Odgałęzienie: tworzy nową gałąź i KOPIUJE do niej bieżące próby gałęzi bazowej,
 * zachowując prowieniencję (parametry, wyjścia, wersja modelu, autor) i wiążąc
 * każdą kopię z oryginałem przez parent_id. To realny „fork" linii pracy — nowe
 * próby są niezależne, ale ich rodowód pozostaje jawny.
 */
export function forkBranch(db, { projectId, name, baseBranchId, createdBy }) {
  const tx = db.prepare('BEGIN');
  tx.run();
  try {
    const branch = createBranch(db, { projectId, name, baseBranchId, createdBy });
    const source = db.prepare('SELECT * FROM trials WHERE branch_id = ? ORDER BY experiment_id ASC, idx ASC').all(baseBranchId);
    for (const t of source) {
      db.prepare(
        `INSERT INTO trials (id, project_id, experiment_id, author_id, idx, label, params_json, outputs_json, status, note, parent_id, model_version, branch_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        newId(), projectId, t.experiment_id, t.author_id, t.idx, t.label, t.params_json, t.outputs_json,
        t.status, t.note, t.id, t.model_version, branch.id, Date.now(),
      );
    }
    db.prepare('COMMIT').run();
    return branch;
  } catch (err) {
    db.prepare('ROLLBACK').run();
    throw err;
  }
}

/* ---------------- Scientific Git: recenzja i scalanie (merge requests) ---------------- */

export function createMergeRequest(db, { projectId, sourceBranchId, targetBranchId, title, description = '', createdBy }) {
  const id = newId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO merge_requests (id, project_id, source_branch_id, target_branch_id, title, description, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
  ).run(id, projectId, sourceBranchId, targetBranchId, title, description, createdBy, now);
  return getMergeRequest(db, id);
}

export function getMergeRequest(db, id) {
  return toMergeRequest(db.prepare('SELECT * FROM merge_requests WHERE id = ?').get(id));
}

export function listMergeRequests(db, projectId) {
  const rows = db.prepare('SELECT * FROM merge_requests WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
  return rows.map(toMergeRequest);
}

/**
 * Recenzja: odrzuca albo zatwierdza+scala. Scalanie KOPIUJE próby gałęzi
 * źródłowej do docelowej jako nowe próby (z parent_id → oryginał), zachowując
 * pełną prowieniencję. Nic nie jest nadpisywane — historia obu gałęzi zostaje.
 * Zwraca zaktualizowany merge request albo null, jeśli nie jest 'open'.
 */
export function decideMergeRequest(db, id, { approve, deciderId, reviewNote = '' }) {
  const mr = db.prepare('SELECT * FROM merge_requests WHERE id = ?').get(id);
  if (!mr || mr.status !== 'open') return null;
  const now = Date.now();
  if (!approve) {
    db.prepare('UPDATE merge_requests SET status = ?, decided_by = ?, decided_at = ?, review_note = ? WHERE id = ?').run(
      'rejected', deciderId, now, reviewNote, id,
    );
    return getMergeRequest(db, id);
  }
  const tx = db.prepare('BEGIN');
  tx.run();
  try {
    const source = db.prepare('SELECT * FROM trials WHERE branch_id = ? ORDER BY experiment_id ASC, idx ASC').all(mr.source_branch_id);
    let merged = 0;
    for (const t of source) {
      const maxRow = db.prepare('SELECT MAX(idx) AS m FROM trials WHERE branch_id = ? AND experiment_id = ?').get(mr.target_branch_id, t.experiment_id);
      const idx = (maxRow?.m ?? 0) + 1;
      db.prepare(
        `INSERT INTO trials (id, project_id, experiment_id, author_id, idx, label, params_json, outputs_json, status, note, parent_id, model_version, branch_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        newId(), mr.project_id, t.experiment_id, t.author_id, idx, t.label, t.params_json, t.outputs_json,
        t.status, t.note, t.id, t.model_version, mr.target_branch_id, now,
      );
      merged += 1;
    }
    db.prepare('UPDATE merge_requests SET status = ?, decided_by = ?, decided_at = ?, review_note = ?, merged_count = ? WHERE id = ?').run(
      'merged', deciderId, now, reviewNote, merged, id,
    );
    db.prepare('COMMIT').run();
  } catch (err) {
    db.prepare('ROLLBACK').run();
    throw err;
  }
  return getMergeRequest(db, id);
}

/* ---------------- Scientific Git: graf kontrybucji ---------------- */

/**
 * Graf kontrybucji: KTO i ILE prób wniósł oraz aktywność dzienna. Liczone z
 * realnych wierszy trials (author_id, created_at) — zero wymyślonych metryk.
 */
export function contributionGraph(db, projectId) {
  const perAuthor = db.prepare(
    `SELECT t.author_id AS userId, u.display_name AS displayName, u.email AS email,
            COUNT(*) AS trials, MIN(t.created_at) AS firstAt, MAX(t.created_at) AS lastAt
     FROM trials t JOIN users u ON u.id = t.author_id
     WHERE t.project_id = ? GROUP BY t.author_id ORDER BY trials DESC`,
  ).all(projectId);

  // Dzienne kubełki (UTC) — realna aktywność w czasie.
  const rows = db.prepare('SELECT created_at FROM trials WHERE project_id = ?').all(projectId);
  const perDay = {};
  for (const r of rows) {
    const day = new Date(r.created_at).toISOString().slice(0, 10);
    perDay[day] = (perDay[day] ?? 0) + 1;
  }
  return {
    contributors: perAuthor.map((r) => ({
      userId: r.userId, displayName: r.displayName, email: r.email,
      trials: r.trials, firstAt: r.firstAt, lastAt: r.lastAt,
    })),
    perDay,
    totalTrials: rows.length,
  };
}

/* ---------------- Przebiegi obliczeń (Scientific Runs, trwałe/audytowalne) ---------------- */

function toRun(row) {
  if (!row) return null;
  return {
    runId: row.id,
    userId: row.user_id ?? null,
    projectId: row.project_id ?? null,
    modelId: row.model_id,
    modelVersion: row.model_version,
    domain: row.domain,
    status: row.status,
    inputs: JSON.parse(row.inputs_json),
    outputs: JSON.parse(row.outputs_json),
    units: JSON.parse(row.units_json),
    warnings: JSON.parse(row.warnings_json),
    provenance: JSON.parse(row.provenance_json),
    seed: row.seed ?? null,
    deterministic: row.deterministic === 1,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}

/** Zapisuje przebieg obliczeń (wynik engine.runModel) z pełną prowieniencją. */
export function saveRun(db, run, { userId = null, projectId = null } = {}) {
  db.prepare(
    `INSERT INTO runs (id, user_id, project_id, model_id, model_version, domain, status, inputs_json, outputs_json, units_json, warnings_json, provenance_json, seed, deterministic, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    run.runId, userId, projectId, run.modelId, run.modelVersion ?? '', run.domain ?? '', run.status,
    JSON.stringify(run.inputs ?? {}), JSON.stringify(run.outputs ?? {}), JSON.stringify(run.units ?? {}),
    JSON.stringify(run.warnings ?? []), JSON.stringify(run.provenance ?? {}),
    run.seed ?? null, run.deterministic === false ? 0 : 1, run.durationMs ?? 0, run.startedAt ?? Date.now(),
  );
  return getRun(db, run.runId);
}

export function getRun(db, id) {
  return toRun(db.prepare('SELECT * FROM runs WHERE id = ?').get(id));
}

/** Przebiegi projektu (najnowsze pierwsze), do audytu i odtwarzalności. */
export function listRuns(db, projectId, limit = 100) {
  const rows = db.prepare('SELECT * FROM runs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?').all(projectId, limit);
  return rows.map(toRun);
}

/* ---------------- Drug Discovery: cele biologiczne i kandydaci ---------------- */

function toTarget(row) {
  if (!row) return null;
  return {
    id: row.id, projectId: row.project_id, name: row.name, targetType: row.target_type,
    geneProtein: row.gene_protein, organism: row.organism, indication: row.indication,
    mechanism: row.mechanism, constraints: row.constraints, evidenceStatus: row.evidence_status,
    provenance: row.provenance, createdBy: row.created_by ?? null, createdAt: row.created_at,
  };
}
function toCandidate(row) {
  if (!row) return null;
  return {
    id: row.id, projectId: row.project_id, targetId: row.target_id ?? null, label: row.label,
    formula: row.formula, smiles: row.smiles, composition: JSON.parse(row.composition_json),
    molecularWeight: row.molecular_weight ?? null, charge: row.charge, parentId: row.parent_id ?? null,
    generationMethod: row.generation_method, provenance: row.provenance,
    createdBy: row.created_by ?? null, createdAt: row.created_at,
  };
}

export function createTarget(db, t) {
  const id = newId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO targets (id, project_id, name, target_type, gene_protein, organism, indication, mechanism, constraints, evidence_status, provenance, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, t.projectId, t.name, t.targetType ?? '', t.geneProtein ?? '', t.organism ?? '', t.indication ?? '',
    t.mechanism ?? '', t.constraints ?? '', t.evidenceStatus ?? 'unverified', t.provenance ?? '', t.createdBy ?? null, now,
  );
  return getTarget(db, id);
}
export function getTarget(db, id) {
  return toTarget(db.prepare('SELECT * FROM targets WHERE id = ?').get(id));
}
export function listTargets(db, projectId) {
  return db.prepare('SELECT * FROM targets WHERE project_id = ? ORDER BY created_at DESC').all(projectId).map(toTarget);
}

export function createCandidate(db, c) {
  const id = newId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO candidates (id, project_id, target_id, label, formula, smiles, composition_json, molecular_weight, charge, parent_id, generation_method, provenance, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, c.projectId, c.targetId ?? null, c.label, c.formula ?? '', c.smiles ?? '',
    JSON.stringify(c.composition ?? {}), c.molecularWeight ?? null, c.charge ?? 0,
    c.parentId ?? null, c.generationMethod ?? 'manual', c.provenance ?? '', c.createdBy ?? null, now,
  );
  return getCandidate(db, id);
}
export function getCandidate(db, id) {
  return toCandidate(db.prepare('SELECT * FROM candidates WHERE id = ?').get(id));
}
export function listCandidates(db, projectId, targetId = null) {
  const rows = targetId
    ? db.prepare('SELECT * FROM candidates WHERE project_id = ? AND target_id = ? ORDER BY created_at ASC').all(projectId, targetId)
    : db.prepare('SELECT * FROM candidates WHERE project_id = ? ORDER BY created_at ASC').all(projectId);
  return rows.map(toCandidate);
}

/* ---------------- Zadania obliczeniowe (Compute Jobs, P5) ---------------- */

function toJob(row) {
  if (!row) return null;
  return {
    id: row.id, projectId: row.project_id ?? null, type: row.type, status: row.status,
    progress: row.progress, params: JSON.parse(row.params_json),
    result: row.result_json ? JSON.parse(row.result_json) : null,
    runIds: JSON.parse(row.run_ids_json), error: row.error ?? null,
    createdBy: row.created_by ?? null, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function createJob(db, { projectId = null, type, params = {}, createdBy = null }) {
  const id = newId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO jobs (id, project_id, type, status, progress, params_json, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 'queued', 0, ?, ?, ?, ?)`,
  ).run(id, projectId, type, JSON.stringify(params), createdBy, now, now);
  return getJob(db, id);
}
export function getJob(db, id) {
  return toJob(db.prepare('SELECT * FROM jobs WHERE id = ?').get(id));
}
export function listJobs(db, projectId, limit = 50) {
  return db.prepare('SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?').all(projectId, limit).map(toJob);
}
export function updateJob(db, id, patch = {}) {
  const cur = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  if (!cur) return null;
  const status = patch.status ?? cur.status;
  const progress = patch.progress ?? cur.progress;
  const result = patch.result !== undefined ? JSON.stringify(patch.result) : cur.result_json;
  const runIds = patch.runIds !== undefined ? JSON.stringify(patch.runIds) : cur.run_ids_json;
  const error = patch.error !== undefined ? patch.error : cur.error;
  db.prepare('UPDATE jobs SET status = ?, progress = ?, result_json = ?, run_ids_json = ?, error = ?, updated_at = ? WHERE id = ?')
    .run(status, progress, result, runIds, error, Date.now(), id);
  return getJob(db, id);
}

/* ---------------- Heavy scientific engines: env audits + external Scientific Runs ---------------- */

/** Persists a runtime scientific-environment audit (append-only). */
export function saveEnvAudit(db, { runtime, engines }) {
  const id = newId();
  db.prepare('INSERT INTO env_audits (id, runtime_json, engines_json, created_at) VALUES (?, ?, ?, ?)')
    .run(id, JSON.stringify(runtime ?? {}), JSON.stringify(engines ?? {}), Date.now());
  return getEnvAudit(db, id);
}

export function getEnvAudit(db, id) {
  const r = db.prepare('SELECT * FROM env_audits WHERE id = ?').get(id);
  return r ? { id: r.id, runtime: JSON.parse(r.runtime_json), engines: JSON.parse(r.engines_json), createdAt: r.created_at } : null;
}

/** Latest persisted environment audit (or null). */
export function latestEnvAudit(db) {
  const r = db.prepare('SELECT id FROM env_audits ORDER BY created_at DESC LIMIT 1').get();
  return r ? getEnvAudit(db, r.id) : null;
}

/**
 * Persists a heavy-engine Scientific Run (docking/MD/QM/...). Raw artifacts,
 * hashes and provenance are stored; results are MODEL_ESTIMATE unless stated.
 * `environmentHash` (Priority B, Scientific Reproducibility) is captured
 * automatically by the caller (see campaign/multiFidelity.mjs) via
 * provenance.mjs#snapshotEnvironment — a fingerprint of the exact engine
 * versions/runtime that produced this run, so a later replay can tell
 * whether the environment changed.
 */
export function saveScienceRun(db, run) {
  const id = run.id ?? newId();
  db.prepare(
    `INSERT INTO science_runs (id, project_id, campaign_id, candidate_id, engine, engine_version, capability, method, status, evidence_class, inputs_json, outputs_json, units_json, warnings_json, provenance_json, input_hash, output_hash, artifacts_json, duration_ms, created_at, environment_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, run.projectId ?? null, run.campaignId ?? null, run.candidateId ?? null,
    run.engine, run.engineVersion ?? null, run.capability, run.method ?? null,
    run.status, run.evidenceClass ?? 'MODEL_ESTIMATE',
    JSON.stringify(run.inputs ?? {}), JSON.stringify(run.outputs ?? {}), JSON.stringify(run.units ?? {}),
    JSON.stringify(run.warnings ?? []), JSON.stringify(run.provenance ?? {}),
    run.inputHash ?? null, run.outputHash ?? null, JSON.stringify(run.artifacts ?? []),
    run.durationMs ?? 0, Date.now(), run.environmentHash ?? null,
  );
  return getScienceRun(db, id);
}

function toScienceRun(r) {
  if (!r) return null;
  return {
    id: r.id, projectId: r.project_id ?? null, campaignId: r.campaign_id ?? null, candidateId: r.candidate_id ?? null,
    engine: r.engine, engineVersion: r.engine_version ?? null, capability: r.capability, method: r.method ?? null,
    status: r.status, evidenceClass: r.evidence_class, inputs: JSON.parse(r.inputs_json), outputs: JSON.parse(r.outputs_json),
    units: JSON.parse(r.units_json), warnings: JSON.parse(r.warnings_json), provenance: JSON.parse(r.provenance_json),
    inputHash: r.input_hash ?? null, outputHash: r.output_hash ?? null, artifacts: JSON.parse(r.artifacts_json),
    durationMs: r.duration_ms, createdAt: r.created_at, environmentHash: r.environment_hash ?? null,
  };
}

export function getScienceRun(db, id) {
  return toScienceRun(db.prepare('SELECT * FROM science_runs WHERE id = ?').get(id));
}

export function listScienceRuns(db, campaignId) {
  return db.prepare('SELECT * FROM science_runs WHERE campaign_id = ? ORDER BY created_at ASC').all(campaignId).map(toScienceRun);
}

/**
 * Append-only audit trail of replay-verification attempts (Priority B). A
 * Scientific Run may be re-verified more than once (e.g. after an engine
 * upgrade) — history is preserved, never overwritten, so credibility claims
 * can point at a full record rather than a single mutable status flag.
 */
export function saveScienceRunVerification(db, v) {
  const id = v.id ?? newId();
  db.prepare(
    `INSERT INTO science_run_verifications (id, science_run_id, verdict, original_output_hash, replay_output_hash, original_engine_version, replay_engine_version, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, v.scienceRunId, v.verdict,
    v.originalOutputHash ?? null, v.replayOutputHash ?? null,
    v.originalEngineVersion ?? null, v.replayEngineVersion ?? null,
    JSON.stringify(v.detail ?? {}), Date.now(),
  );
  return getScienceRunVerification(db, id);
}

function toScienceRunVerification(r) {
  if (!r) return null;
  return {
    id: r.id, scienceRunId: r.science_run_id, verdict: r.verdict,
    originalOutputHash: r.original_output_hash ?? null, replayOutputHash: r.replay_output_hash ?? null,
    originalEngineVersion: r.original_engine_version ?? null, replayEngineVersion: r.replay_engine_version ?? null,
    detail: JSON.parse(r.detail_json), createdAt: r.created_at,
  };
}

export function getScienceRunVerification(db, id) {
  return toScienceRunVerification(db.prepare('SELECT * FROM science_run_verifications WHERE id = ?').get(id));
}

export function listScienceRunVerifications(db, scienceRunId) {
  return db.prepare('SELECT * FROM science_run_verifications WHERE science_run_id = ? ORDER BY created_at ASC').all(scienceRunId).map(toScienceRunVerification);
}

export function listScienceRunsForCandidate(db, candidateId) {
  return db.prepare('SELECT * FROM science_runs WHERE candidate_id = ? ORDER BY created_at ASC').all(candidateId).map(toScienceRun);
}

/* ================================================================
 * Cognitive ceiling (Priority 1): Evidence Store + Scientific Task DAG.
 * Low-level, side-effect-free row helpers. All hashing/validation lives in the
 * cognitive/* domain layer; this layer only persists and reads back. History
 * tables (evidence, task_state_transitions, workflow_mutations,
 * mission_checkpoints) are written append-only by the domain layer.
 * ================================================================ */

const j = (v, d = {}) => (v === undefined || v === null ? d : JSON.parse(v));

/* ---- research_missions ---- */
function toMission(r) {
  if (!r) return null;
  return {
    id: r.id, projectId: r.project_id, goal: r.goal, status: r.status, domain: r.domain,
    spec: j(r.spec_json), computeBudget: j(r.compute_budget_json), modelBudget: j(r.model_budget_json),
    contentHash: r.content_hash, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
export function saveMission(db, m) {
  const id = m.id ?? newId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO research_missions (id, project_id, goal, status, domain, spec_json, compute_budget_json, model_budget_json, content_hash, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, m.projectId ?? null, m.goal, m.status ?? 'active', m.domain ?? null,
    JSON.stringify(m.spec ?? {}), JSON.stringify(m.computeBudget ?? {}), JSON.stringify(m.modelBudget ?? {}),
    m.contentHash ?? null, m.createdBy ?? null, now, now,
  );
  return getMission(db, id);
}
export function getMission(db, id) {
  return toMission(db.prepare('SELECT * FROM research_missions WHERE id = ?').get(id));
}
export function listMissions(db, projectId) {
  const rows = projectId
    ? db.prepare('SELECT * FROM research_missions WHERE project_id = ? ORDER BY created_at DESC').all(projectId)
    : db.prepare('SELECT * FROM research_missions ORDER BY created_at DESC').all();
  return rows.map(toMission);
}
export function updateMission(db, id, patch) {
  const cur = getMission(db, id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  db.prepare(
    `UPDATE research_missions SET status = ?, domain = ?, spec_json = ?, compute_budget_json = ?, model_budget_json = ?, content_hash = ?, updated_at = ? WHERE id = ?`,
  ).run(
    next.status, next.domain ?? null, JSON.stringify(next.spec ?? {}),
    JSON.stringify(next.computeBudget ?? {}), JSON.stringify(next.modelBudget ?? {}),
    next.contentHash ?? null, Date.now(), id,
  );
  return getMission(db, id);
}

/* ---- research_questions ---- */
function toQuestion(r) {
  if (!r) return null;
  return {
    id: r.id, missionId: r.mission_id, parentId: r.parent_id, text: r.text, status: r.status,
    answer: r.answer_json ? JSON.parse(r.answer_json) : null, contentHash: r.content_hash,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
export function saveQuestion(db, q) {
  const id = q.id ?? newId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO research_questions (id, mission_id, parent_id, text, status, answer_json, content_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, q.missionId, q.parentId ?? null, q.text, q.status ?? 'open',
    q.answer != null ? JSON.stringify(q.answer) : null, q.contentHash ?? null, now, now,
  );
  return getQuestion(db, id);
}
export function getQuestion(db, id) {
  return toQuestion(db.prepare('SELECT * FROM research_questions WHERE id = ?').get(id));
}
export function listQuestions(db, missionId) {
  return db.prepare('SELECT * FROM research_questions WHERE mission_id = ? ORDER BY created_at ASC').all(missionId).map(toQuestion);
}
export function updateQuestion(db, id, patch) {
  const cur = getQuestion(db, id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  db.prepare('UPDATE research_questions SET status = ?, answer_json = ?, content_hash = ?, updated_at = ? WHERE id = ?').run(
    next.status, next.answer != null ? JSON.stringify(next.answer) : null, next.contentHash ?? null, Date.now(), id,
  );
  return getQuestion(db, id);
}

/* ---- hypotheses ---- */
function toHypothesis(r) {
  if (!r) return null;
  return {
    id: r.id, missionId: r.mission_id, questionId: r.question_id, label: r.label, claim: r.claim,
    assumptions: j(r.assumptions_json, []), predictedObservations: j(r.predicted_observations_json, []),
    disconfirmingObservations: j(r.disconfirming_observations_json, []), requiredEvidence: j(r.required_evidence_json, []),
    epistemicStatus: r.epistemic_status, confidence: r.confidence, status: r.status, supersededBy: r.superseded_by,
    contentHash: r.content_hash, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
export function saveHypothesis(db, h) {
  const id = h.id ?? newId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO hypotheses (id, mission_id, question_id, label, claim, assumptions_json, predicted_observations_json, disconfirming_observations_json, required_evidence_json, epistemic_status, confidence, status, superseded_by, content_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, h.missionId, h.questionId ?? null, h.label ?? null, h.claim,
    JSON.stringify(h.assumptions ?? []), JSON.stringify(h.predictedObservations ?? []),
    JSON.stringify(h.disconfirmingObservations ?? []), JSON.stringify(h.requiredEvidence ?? []),
    h.epistemicStatus ?? 'HYPOTHESIZED', h.confidence ?? null, h.status ?? 'open', h.supersededBy ?? null,
    h.contentHash ?? null, now, now,
  );
  return getHypothesis(db, id);
}
export function getHypothesis(db, id) {
  return toHypothesis(db.prepare('SELECT * FROM hypotheses WHERE id = ?').get(id));
}
export function listHypotheses(db, missionId) {
  return db.prepare('SELECT * FROM hypotheses WHERE mission_id = ? ORDER BY created_at ASC').all(missionId).map(toHypothesis);
}
export function updateHypothesis(db, id, patch) {
  const cur = getHypothesis(db, id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  db.prepare('UPDATE hypotheses SET epistemic_status = ?, confidence = ?, status = ?, superseded_by = ?, content_hash = ?, updated_at = ? WHERE id = ?').run(
    next.epistemicStatus, next.confidence ?? null, next.status, next.supersededBy ?? null, next.contentHash ?? null, Date.now(), id,
  );
  return getHypothesis(db, id);
}

/* ---- evidence (append-only) ---- */
function toEvidence(r) {
  if (!r) return null;
  return {
    id: r.id, missionId: r.mission_id, kind: r.kind, epistemicStatus: r.epistemic_status,
    content: j(r.content_json), contentHash: r.content_hash, source: r.source, sourceLocation: r.source_location,
    origin: r.origin, scienceRunId: r.science_run_id, hypothesisId: r.hypothesis_id, questionId: r.question_id,
    taskId: r.task_id, parentEvidenceId: r.parent_evidence_id, confidence: r.confidence,
    verificationStatus: r.verification_status, artifacts: j(r.artifacts_json, []), createdAt: r.created_at,
  };
}
export function saveEvidence(db, e) {
  const id = e.id ?? newId();
  db.prepare(
    `INSERT INTO evidence (id, mission_id, kind, epistemic_status, content_json, content_hash, source, source_location, origin, science_run_id, hypothesis_id, question_id, task_id, parent_evidence_id, confidence, verification_status, artifacts_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, e.missionId, e.kind, e.epistemicStatus, JSON.stringify(e.content ?? {}), e.contentHash,
    e.source ?? null, e.sourceLocation ?? null, e.origin ?? null, e.scienceRunId ?? null,
    e.hypothesisId ?? null, e.questionId ?? null, e.taskId ?? null, e.parentEvidenceId ?? null,
    e.confidence ?? null, e.verificationStatus ?? 'UNVERIFIED', JSON.stringify(e.artifacts ?? []), Date.now(),
  );
  return getEvidence(db, id);
}
export function getEvidence(db, id) {
  return toEvidence(db.prepare('SELECT * FROM evidence WHERE id = ?').get(id));
}
export function listEvidence(db, missionId, { hypothesisId = null } = {}) {
  const rows = hypothesisId
    ? db.prepare('SELECT * FROM evidence WHERE mission_id = ? AND hypothesis_id = ? ORDER BY created_at ASC').all(missionId, hypothesisId)
    : db.prepare('SELECT * FROM evidence WHERE mission_id = ? ORDER BY created_at ASC').all(missionId);
  return rows.map(toEvidence);
}
export function updateEvidenceVerification(db, id, verificationStatus) {
  db.prepare('UPDATE evidence SET verification_status = ? WHERE id = ?').run(verificationStatus, id);
  return getEvidence(db, id);
}

/* ---- task_dag_nodes + task_dag_edges ---- */
function toTaskNode(r) {
  if (!r) return null;
  return {
    id: r.id, missionId: r.mission_id, title: r.title, taskType: r.task_type, spec: j(r.spec_json),
    state: r.state, blockedReason: r.blocked_reason, questionId: r.question_id, hypothesisId: r.hypothesis_id,
    engine: r.engine, computeEstimate: j(r.compute_estimate_json), computeActual: j(r.compute_actual_json),
    result: r.result_json ? JSON.parse(r.result_json) : null, resultEvidenceId: r.result_evidence_id,
    supersededBy: r.superseded_by, contentHash: r.content_hash, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
export function saveTaskNode(db, t) {
  const id = t.id ?? newId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO task_dag_nodes (id, mission_id, title, task_type, spec_json, state, blocked_reason, question_id, hypothesis_id, engine, compute_estimate_json, compute_actual_json, result_json, result_evidence_id, superseded_by, content_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, t.missionId, t.title, t.taskType, JSON.stringify(t.spec ?? {}), t.state ?? 'BLOCKED',
    t.blockedReason ?? null, t.questionId ?? null, t.hypothesisId ?? null, t.engine ?? null,
    JSON.stringify(t.computeEstimate ?? {}), JSON.stringify(t.computeActual ?? {}),
    t.result != null ? JSON.stringify(t.result) : null, t.resultEvidenceId ?? null,
    t.supersededBy ?? null, t.contentHash ?? null, now, now,
  );
  return getTaskNode(db, id);
}
export function getTaskNode(db, id) {
  return toTaskNode(db.prepare('SELECT * FROM task_dag_nodes WHERE id = ?').get(id));
}
export function listTaskNodes(db, missionId, { state = null } = {}) {
  const rows = state
    ? db.prepare('SELECT * FROM task_dag_nodes WHERE mission_id = ? AND state = ? ORDER BY created_at ASC').all(missionId, state)
    : db.prepare('SELECT * FROM task_dag_nodes WHERE mission_id = ? ORDER BY created_at ASC').all(missionId);
  return rows.map(toTaskNode);
}
export function updateTaskNode(db, id, patch) {
  const cur = getTaskNode(db, id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  db.prepare(
    `UPDATE task_dag_nodes SET state = ?, blocked_reason = ?, engine = ?, compute_estimate_json = ?, compute_actual_json = ?, result_json = ?, result_evidence_id = ?, superseded_by = ?, content_hash = ?, updated_at = ? WHERE id = ?`,
  ).run(
    next.state, next.blockedReason ?? null, next.engine ?? null,
    JSON.stringify(next.computeEstimate ?? {}), JSON.stringify(next.computeActual ?? {}),
    next.result != null ? JSON.stringify(next.result) : null, next.resultEvidenceId ?? null,
    next.supersededBy ?? null, next.contentHash ?? null, Date.now(), id,
  );
  return getTaskNode(db, id);
}
function toEdge(r) {
  if (!r) return null;
  return { id: r.id, missionId: r.mission_id, fromTaskId: r.from_task_id, toTaskId: r.to_task_id, kind: r.kind, createdAt: r.created_at };
}
export function saveTaskEdge(db, e) {
  const id = e.id ?? newId();
  db.prepare(
    `INSERT INTO task_dag_edges (id, mission_id, from_task_id, to_task_id, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, e.missionId, e.fromTaskId, e.toTaskId, e.kind ?? 'depends-on', Date.now());
  return toEdge(db.prepare('SELECT * FROM task_dag_edges WHERE id = ?').get(id));
}
export function listTaskEdges(db, missionId) {
  return db.prepare('SELECT * FROM task_dag_edges WHERE mission_id = ? ORDER BY created_at ASC').all(missionId).map(toEdge);
}
/** Dependencies of a task = tasks that must complete before it (incoming edges). */
export function listDependencies(db, taskId) {
  return db.prepare('SELECT * FROM task_dag_edges WHERE to_task_id = ?').all(taskId).map(toEdge);
}
/** Dependents of a task = tasks waiting on it (outgoing edges). */
export function listDependents(db, taskId) {
  return db.prepare('SELECT * FROM task_dag_edges WHERE from_task_id = ?').all(taskId).map(toEdge);
}

/* ---- task_state_transitions (append-only) ---- */
export function saveTaskTransition(db, t) {
  const id = t.id ?? newId();
  db.prepare(
    `INSERT INTO task_state_transitions (id, task_id, mission_id, from_state, to_state, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, t.taskId, t.missionId, t.fromState ?? null, t.toState, t.reason ?? null, Date.now());
  return id;
}
export function listTaskTransitions(db, taskId) {
  return db.prepare('SELECT * FROM task_state_transitions WHERE task_id = ? ORDER BY created_at ASC').all(taskId)
    .map((r) => ({ id: r.id, taskId: r.task_id, missionId: r.mission_id, fromState: r.from_state, toState: r.to_state, reason: r.reason, createdAt: r.created_at }));
}

/* ---- workflow_mutations (append-only) ---- */
function toMutation(r) {
  if (!r) return null;
  return {
    id: r.id, missionId: r.mission_id, reason: r.reason, triggeringEvidence: j(r.triggering_evidence_json, []),
    previousWorkflowHash: r.previous_workflow_hash, proposed: j(r.proposed_json), expectedBenefit: j(r.expected_benefit_json),
    actualResult: r.actual_result_json ? JSON.parse(r.actual_result_json) : null, rollback: j(r.rollback_json),
    verificationStatus: r.verification_status, contentHash: r.content_hash, createdAt: r.created_at,
  };
}
export function saveWorkflowMutation(db, m) {
  const id = m.id ?? newId();
  db.prepare(
    `INSERT INTO workflow_mutations (id, mission_id, reason, triggering_evidence_json, previous_workflow_hash, proposed_json, expected_benefit_json, actual_result_json, rollback_json, verification_status, content_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, m.missionId, m.reason, JSON.stringify(m.triggeringEvidence ?? []), m.previousWorkflowHash ?? null,
    JSON.stringify(m.proposed ?? {}), JSON.stringify(m.expectedBenefit ?? {}),
    m.actualResult != null ? JSON.stringify(m.actualResult) : null, JSON.stringify(m.rollback ?? {}),
    m.verificationStatus ?? 'UNVERIFIED', m.contentHash ?? null, Date.now(),
  );
  return getWorkflowMutation(db, id);
}
export function getWorkflowMutation(db, id) {
  return toMutation(db.prepare('SELECT * FROM workflow_mutations WHERE id = ?').get(id));
}
export function listWorkflowMutations(db, missionId) {
  return db.prepare('SELECT * FROM workflow_mutations WHERE mission_id = ? ORDER BY created_at ASC').all(missionId).map(toMutation);
}
export function updateWorkflowMutationResult(db, id, { actualResult, verificationStatus }) {
  const cur = getWorkflowMutation(db, id);
  if (!cur) return null;
  db.prepare('UPDATE workflow_mutations SET actual_result_json = ?, verification_status = ? WHERE id = ?').run(
    actualResult != null ? JSON.stringify(actualResult) : (cur.actualResult != null ? JSON.stringify(cur.actualResult) : null),
    verificationStatus ?? cur.verificationStatus, id,
  );
  return getWorkflowMutation(db, id);
}

/* ---- mission_checkpoints (append-only) ---- */
export function saveMissionCheckpoint(db, c) {
  const id = c.id ?? newId();
  db.prepare(
    `INSERT INTO mission_checkpoints (id, mission_id, label, frontier_json, summary_json, state_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, c.missionId, c.label ?? null, JSON.stringify(c.frontier ?? []), JSON.stringify(c.summary ?? {}), c.stateHash ?? null, Date.now());
  return db.prepare('SELECT * FROM mission_checkpoints WHERE id = ?').get(id);
}
export function listMissionCheckpoints(db, missionId) {
  return db.prepare('SELECT * FROM mission_checkpoints WHERE mission_id = ? ORDER BY created_at ASC').all(missionId)
    .map((r) => ({ id: r.id, missionId: r.mission_id, label: r.label, frontier: j(r.frontier_json, []), summary: j(r.summary_json), stateHash: r.state_hash, createdAt: r.created_at }));
}
export function latestMissionCheckpoint(db, missionId) {
  const r = db.prepare('SELECT * FROM mission_checkpoints WHERE mission_id = ? ORDER BY created_at DESC LIMIT 1').get(missionId);
  return r ? { id: r.id, missionId: r.mission_id, label: r.label, frontier: j(r.frontier_json, []), summary: j(r.summary_json), stateHash: r.state_hash, createdAt: r.created_at } : null;
}

/* ---- task_dag_edges mutation (reversible structural edits for the Workflow Engine) ---- */
export function deleteTaskEdge(db, id) {
  db.prepare('DELETE FROM task_dag_edges WHERE id = ?').run(id);
}
export function findTaskEdge(db, missionId, fromTaskId, toTaskId, kind = 'depends-on') {
  const r = db.prepare('SELECT * FROM task_dag_edges WHERE mission_id = ? AND from_task_id = ? AND to_task_id = ? AND kind = ?').get(missionId, fromTaskId, toTaskId, kind);
  return r ? { id: r.id, missionId: r.mission_id, fromTaskId: r.from_task_id, toTaskId: r.to_task_id, kind: r.kind, createdAt: r.created_at } : null;
}

/* ---- model_decisions (Priority 7 — traceable routing, append-only) ---- */
function toModelDecision(r) {
  if (!r) return null;
  return {
    id: r.id, missionId: r.mission_id, role: r.role, taskClass: r.task_class,
    providerId: r.provider_id, modelId: r.model_id, complexity: r.complexity, risk: r.risk,
    selectionReason: r.selection_reason, status: r.status, latencyMs: r.latency_ms,
    tokensIn: r.tokens_in, tokensOut: r.tokens_out, cost: r.cost, createdAt: r.created_at,
  };
}
export function saveModelDecision(db, d) {
  const id = d.id ?? newId();
  db.prepare(
    `INSERT INTO model_decisions (id, mission_id, role, task_class, provider_id, model_id, complexity, risk, selection_reason, status, latency_ms, tokens_in, tokens_out, cost, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, d.missionId ?? null, d.role, d.taskClass ?? null, d.providerId, d.modelId ?? null,
    d.complexity ?? null, d.risk ?? null, d.selectionReason ?? null, d.status ?? 'selected',
    d.latencyMs ?? null, d.tokensIn ?? null, d.tokensOut ?? null, d.cost ?? null, Date.now(),
  );
  return getModelDecision(db, id);
}
export function getModelDecision(db, id) {
  return toModelDecision(db.prepare('SELECT * FROM model_decisions WHERE id = ?').get(id));
}
export function updateModelDecision(db, id, patch) {
  const cur = getModelDecision(db, id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  db.prepare('UPDATE model_decisions SET status = ?, latency_ms = ?, tokens_in = ?, tokens_out = ?, cost = ? WHERE id = ?').run(
    next.status, next.latencyMs ?? null, next.tokensIn ?? null, next.tokensOut ?? null, next.cost ?? null, id,
  );
  return getModelDecision(db, id);
}
export function listModelDecisions(db, { missionId = null, role = null } = {}) {
  let rows;
  if (missionId) rows = db.prepare('SELECT * FROM model_decisions WHERE mission_id = ? ORDER BY created_at ASC').all(missionId);
  else if (role) rows = db.prepare('SELECT * FROM model_decisions WHERE role = ? ORDER BY created_at ASC').all(role);
  else rows = db.prepare('SELECT * FROM model_decisions ORDER BY created_at ASC').all();
  return rows.map(toModelDecision);
}

/* ---- agent_invocations (Priority 8 — traceable agent fabric, append-only) ---- */
function toAgentInvocation(r) {
  if (!r) return null;
  return {
    id: r.id, missionId: r.mission_id, role: r.role, modelRole: r.model_role,
    modelDecisionId: r.model_decision_id, modelStatus: r.model_status,
    inputHashes: JSON.parse(r.input_hashes_json), outputHash: r.output_hash,
    output: r.output_json ? JSON.parse(r.output_json) : null, status: r.status,
    failureReason: r.failure_reason, createdAt: r.created_at,
  };
}
export function saveAgentInvocation(db, a) {
  const id = a.id ?? newId();
  db.prepare(
    `INSERT INTO agent_invocations (id, mission_id, role, model_role, model_decision_id, model_status, input_hashes_json, output_hash, output_json, status, failure_reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, a.missionId ?? null, a.role, a.modelRole ?? null, a.modelDecisionId ?? null, a.modelStatus ?? null,
    JSON.stringify(a.inputHashes ?? []), a.outputHash ?? null,
    a.output != null ? JSON.stringify(a.output) : null, a.status, a.failureReason ?? null, Date.now(),
  );
  return getAgentInvocation(db, id);
}
export function getAgentInvocation(db, id) {
  return toAgentInvocation(db.prepare('SELECT * FROM agent_invocations WHERE id = ?').get(id));
}
export function listAgentInvocations(db, missionId) {
  return db.prepare('SELECT * FROM agent_invocations WHERE mission_id = ? ORDER BY created_at ASC').all(missionId).map(toAgentInvocation);
}

/* ---- strategy_records (Priority 10 — cross-run strategy scoring, append-only) ---- */
function toStrategyRecord(r) {
  if (!r) return null;
  return {
    id: r.id, missionId: r.mission_id, strategyKey: r.strategy_key, domain: r.domain,
    outcomeClass: r.outcome_class, score: r.score, metrics: JSON.parse(r.metrics_json),
    reasons: JSON.parse(r.reasons_json), createdAt: r.created_at,
  };
}
export function saveStrategyRecord(db, s) {
  const id = s.id ?? newId();
  db.prepare(
    `INSERT INTO strategy_records (id, mission_id, strategy_key, domain, outcome_class, score, metrics_json, reasons_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, s.missionId ?? null, s.strategyKey, s.domain ?? null, s.outcomeClass, s.score ?? null,
    JSON.stringify(s.metrics ?? {}), JSON.stringify(s.reasons ?? []), Date.now(),
  );
  return toStrategyRecord(db.prepare('SELECT * FROM strategy_records WHERE id = ?').get(id));
}
export function listStrategyRecords(db, { strategyKey = null, domain = null } = {}) {
  let rows;
  if (strategyKey) rows = db.prepare('SELECT * FROM strategy_records WHERE strategy_key = ? ORDER BY created_at ASC').all(strategyKey);
  else if (domain) rows = db.prepare('SELECT * FROM strategy_records WHERE domain = ? ORDER BY created_at ASC').all(domain);
  else rows = db.prepare('SELECT * FROM strategy_records ORDER BY created_at ASC').all();
  return rows.map(toStrategyRecord);
}

/* ---- compute_placements (Priority 11 — traceable placement + accounting, append-only) ---- */
function toComputePlacement(r) {
  if (!r) return null;
  return {
    id: r.id, missionId: r.mission_id, taskId: r.task_id, backendId: r.backend_id,
    requirements: JSON.parse(r.requirements_json), estimatedMs: r.estimated_ms, actualMs: r.actual_ms,
    status: r.status, failureClass: r.failure_class, reason: r.reason, retryOf: r.retry_of,
    attempt: r.attempt, createdAt: r.created_at,
  };
}
export function saveComputePlacement(db, p) {
  const id = p.id ?? newId();
  db.prepare(
    `INSERT INTO compute_placements (id, mission_id, task_id, backend_id, requirements_json, estimated_ms, actual_ms, status, failure_class, reason, retry_of, attempt, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, p.missionId ?? null, p.taskId ?? null, p.backendId ?? null, JSON.stringify(p.requirements ?? {}),
    p.estimatedMs ?? null, p.actualMs ?? null, p.status, p.failureClass ?? null, p.reason ?? null,
    p.retryOf ?? null, p.attempt ?? 1, Date.now(),
  );
  return getComputePlacement(db, id);
}
export function getComputePlacement(db, id) {
  return toComputePlacement(db.prepare('SELECT * FROM compute_placements WHERE id = ?').get(id));
}
export function updateComputePlacement(db, id, patch) {
  const cur = getComputePlacement(db, id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  db.prepare('UPDATE compute_placements SET actual_ms = ?, status = ?, failure_class = ?, reason = ? WHERE id = ?').run(
    next.actualMs ?? null, next.status, next.failureClass ?? null, next.reason ?? null, id,
  );
  return getComputePlacement(db, id);
}
export function listComputePlacements(db, { missionId = null, taskId = null } = {}) {
  let rows;
  if (taskId) rows = db.prepare('SELECT * FROM compute_placements WHERE task_id = ? ORDER BY created_at ASC').all(taskId);
  else if (missionId) rows = db.prepare('SELECT * FROM compute_placements WHERE mission_id = ? ORDER BY created_at ASC').all(missionId);
  else rows = db.prepare('SELECT * FROM compute_placements ORDER BY created_at ASC').all();
  return rows.map(toComputePlacement);
}

/* ---- sandbox_promotions (Priority 12 — sandbox→main audit, append-only) ---- */
function toSandboxPromotion(r) {
  if (!r) return null;
  return {
    id: r.id, sandboxMissionId: r.sandbox_mission_id, sourceEvidenceId: r.source_evidence_id,
    targetMissionId: r.target_mission_id, targetEvidenceId: r.target_evidence_id,
    decision: r.decision, reason: r.reason, createdAt: r.created_at,
  };
}
export function saveSandboxPromotion(db, p) {
  const id = p.id ?? newId();
  db.prepare(
    `INSERT INTO sandbox_promotions (id, sandbox_mission_id, source_evidence_id, target_mission_id, target_evidence_id, decision, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, p.sandboxMissionId, p.sourceEvidenceId, p.targetMissionId ?? null, p.targetEvidenceId ?? null, p.decision, p.reason ?? null, Date.now());
  return toSandboxPromotion(db.prepare('SELECT * FROM sandbox_promotions WHERE id = ?').get(id));
}
export function listSandboxPromotions(db, sandboxMissionId) {
  return db.prepare('SELECT * FROM sandbox_promotions WHERE sandbox_mission_id = ? ORDER BY created_at ASC').all(sandboxMissionId).map(toSandboxPromotion);
}

/* ---- ZEFIR funnel (Phase 3F/G/H/J): candidates, stages, rejection memory, dossiers ---- */
function toFunnelCandidate(r) {
  if (!r) return null;
  return { id: r.id, missionId: r.mission_id, canonicalSmiles: r.canonical_smiles, molecularHash: r.molecular_hash, parentId: r.parent_id, generationStrategy: r.generation_strategy, programModality: r.program_modality, status: r.status, survivalRank: r.survival_rank, createdAt: r.created_at };
}
export function saveFunnelCandidate(db, c) {
  const id = c.id ?? newId();
  db.prepare(`INSERT INTO funnel_candidates (id, mission_id, canonical_smiles, molecular_hash, parent_id, generation_strategy, program_modality, status, survival_rank, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, c.missionId ?? null, c.canonicalSmiles, c.molecularHash, c.parentId ?? null, c.generationStrategy ?? null, c.programModality ?? null, c.status ?? 'surviving', c.survivalRank ?? null, Date.now());
  return getFunnelCandidate(db, id);
}
export function getFunnelCandidate(db, id) { return toFunnelCandidate(db.prepare('SELECT * FROM funnel_candidates WHERE id = ?').get(id)); }
export function updateFunnelCandidate(db, id, patch) {
  const cur = getFunnelCandidate(db, id); if (!cur) return null; const n = { ...cur, ...patch };
  db.prepare('UPDATE funnel_candidates SET status = ?, survival_rank = ? WHERE id = ?').run(n.status, n.survivalRank ?? null, id);
  return getFunnelCandidate(db, id);
}
export function listFunnelCandidates(db, missionId) { return db.prepare('SELECT * FROM funnel_candidates WHERE mission_id = ? ORDER BY created_at ASC').all(missionId).map(toFunnelCandidate); }

function toFunnelStage(r) {
  if (!r) return null;
  return { id: r.id, candidateId: r.candidate_id, missionId: r.mission_id, stage: r.stage, engine: r.engine, engineVersion: r.engine_version, params: JSON.parse(r.params_json), inputHash: r.input_hash, output: JSON.parse(r.output_json), outputHash: r.output_hash, durationMs: r.duration_ms, epistemicClass: r.epistemic_class, status: r.status, failureReason: r.failure_reason, createdAt: r.created_at };
}
export function saveFunnelStage(db, s) {
  const id = s.id ?? newId();
  db.prepare(`INSERT INTO funnel_stages (id, candidate_id, mission_id, stage, engine, engine_version, params_json, input_hash, output_json, output_hash, duration_ms, epistemic_class, status, failure_reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, s.candidateId, s.missionId ?? null, s.stage, s.engine ?? null, s.engineVersion ?? null, JSON.stringify(s.params ?? {}), s.inputHash ?? null, JSON.stringify(s.output ?? {}), s.outputHash ?? null, s.durationMs ?? 0, s.epistemicClass ?? null, s.status, s.failureReason ?? null, Date.now());
  return toFunnelStage(db.prepare('SELECT * FROM funnel_stages WHERE id = ?').get(id));
}
export function listFunnelStages(db, candidateId) { return db.prepare('SELECT * FROM funnel_stages WHERE candidate_id = ? ORDER BY created_at ASC').all(candidateId).map(toFunnelStage); }

export function saveRejectionMotif(db, r) {
  const id = r.id ?? newId();
  db.prepare(`INSERT INTO rejection_motifs (id, mission_id, motif_key, motif_kind, candidate_id, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, r.missionId ?? null, r.motifKey, r.motifKind, r.candidateId ?? null, JSON.stringify(r.detail ?? {}), Date.now());
  return id;
}
export function listRejectionMotifs(db, missionId) {
  return db.prepare('SELECT * FROM rejection_motifs WHERE mission_id = ? ORDER BY created_at ASC').all(missionId)
    .map((r) => ({ id: r.id, missionId: r.mission_id, motifKey: r.motif_key, motifKind: r.motif_kind, candidateId: r.candidate_id, detail: JSON.parse(r.detail_json), createdAt: r.created_at }));
}
export function countRejectionMotif(db, missionId, motifKey) {
  return db.prepare('SELECT COUNT(*) AS n FROM rejection_motifs WHERE mission_id = ? AND motif_key = ?').get(missionId, motifKey).n;
}

export function saveCandidateDossier(db, d) {
  const id = d.id ?? newId();
  db.prepare(`INSERT INTO candidate_dossiers (id, candidate_id, mission_id, dossier_json, content_hash, cro_readiness, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, d.candidateId, d.missionId ?? null, JSON.stringify(d.dossier ?? {}), d.contentHash ?? null, d.croReadiness ?? null, Date.now());
  return db.prepare('SELECT * FROM candidate_dossiers WHERE id = ?').get(id);
}
export function getCandidateDossier(db, candidateId) {
  const r = db.prepare('SELECT * FROM candidate_dossiers WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 1').get(candidateId);
  return r ? { id: r.id, candidateId: r.candidate_id, missionId: r.mission_id, dossier: JSON.parse(r.dossier_json), contentHash: r.content_hash, croReadiness: r.cro_readiness, createdAt: r.created_at } : null;
}

/* ---- Scientific Resource Layer (3E) + Reality Bridge (3K) ---- */
function toResource(r) {
  if (!r) return null;
  return { id: r.id, resourceId: r.resource_id, sourceIdentity: r.source_identity, sourceType: r.source_type, license: r.license, version: r.version, contentHash: r.content_hash, parserVersion: r.parser_version, validationStatus: r.validation_status, meta: JSON.parse(r.meta_json), importedAt: r.imported_at };
}
export function saveResource(db, r) {
  const id = r.id ?? newId();
  db.prepare(`INSERT INTO scientific_resources (id, resource_id, source_identity, source_type, license, version, content_hash, parser_version, validation_status, meta_json, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, r.resourceId, r.sourceIdentity ?? null, r.sourceType, r.license ?? null, r.version ?? null, r.contentHash, r.parserVersion ?? null, r.validationStatus, JSON.stringify(r.meta ?? {}), Date.now());
  return toResource(db.prepare('SELECT * FROM scientific_resources WHERE id = ?').get(id));
}
export function getResource(db, resourceId) {
  return toResource(db.prepare('SELECT * FROM scientific_resources WHERE resource_id = ? ORDER BY imported_at DESC LIMIT 1').get(resourceId));
}
export function listResources(db) { return db.prepare('SELECT * FROM scientific_resources ORDER BY imported_at ASC').all().map(toResource); }

function toExperimentalResult(r) {
  if (!r) return null;
  return { id: r.id, externalId: r.external_id, labIdentity: r.lab_identity, protocolRef: r.protocol_ref, candidateId: r.candidate_id, measurementType: r.measurement_type, resultClass: r.result_class, units: r.units, resultValue: r.result_value, uncertainty: r.uncertainty, artifactRef: r.artifact_ref, artifactHash: r.artifact_hash, importStatus: r.import_status, reviewerStatus: r.reviewer_status, createdAt: r.created_at };
}
export function saveExperimentalResult(db, e) {
  const id = e.id ?? newId();
  db.prepare(`INSERT INTO experimental_results (id, external_id, lab_identity, protocol_ref, candidate_id, measurement_type, result_class, units, result_value, uncertainty, artifact_ref, artifact_hash, import_status, reviewer_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, e.externalId, e.labIdentity ?? null, e.protocolRef ?? null, e.candidateId ?? null, e.measurementType, e.resultClass, e.units ?? null, e.resultValue ?? null, e.uncertainty ?? null, e.artifactRef ?? null, e.artifactHash ?? null, e.importStatus, e.reviewerStatus ?? 'PENDING', Date.now());
  return toExperimentalResult(db.prepare('SELECT * FROM experimental_results WHERE id = ?').get(id));
}
export function listExperimentalResults(db, candidateId) {
  return db.prepare('SELECT * FROM experimental_results WHERE candidate_id = ? ORDER BY created_at ASC').all(candidateId).map(toExperimentalResult);
}
export function savePredictionError(db, p) {
  const id = p.id ?? newId();
  db.prepare(`INSERT INTO prediction_errors (id, candidate_id, measurement_type, predicted, measured, abs_error, strategy_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, p.candidateId ?? null, p.measurementType ?? null, p.predicted ?? null, p.measured ?? null, p.absError ?? null, p.strategyKey ?? null, Date.now());
  return db.prepare('SELECT * FROM prediction_errors WHERE id = ?').get(id);
}
export function listPredictionErrors(db, strategyKey) {
  const rows = strategyKey ? db.prepare('SELECT * FROM prediction_errors WHERE strategy_key = ? ORDER BY created_at ASC').all(strategyKey) : db.prepare('SELECT * FROM prediction_errors ORDER BY created_at ASC').all();
  return rows.map((r) => ({ id: r.id, candidateId: r.candidate_id, measurementType: r.measurement_type, predicted: r.predicted, measured: r.measured, absError: r.abs_error, strategyKey: r.strategy_key, createdAt: r.created_at }));
}

/* ---- Bio Foundation (3D) ---- */
function toBioEntity(r) {
  if (!r) return null;
  return { id: r.id, missionId: r.mission_id, entityType: r.entity_type, name: r.name, identifier: r.identifier, evidenceClass: r.evidence_class, source: r.source, meta: JSON.parse(r.meta_json), createdAt: r.created_at };
}
export function saveBioEntity(db, e) {
  const id = e.id ?? newId();
  db.prepare(`INSERT INTO bio_entities (id, mission_id, entity_type, name, identifier, evidence_class, source, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, e.missionId ?? null, e.entityType, e.name, e.identifier ?? null, e.evidenceClass, e.source ?? null, JSON.stringify(e.meta ?? {}), Date.now());
  return toBioEntity(db.prepare('SELECT * FROM bio_entities WHERE id = ?').get(id));
}
export function getBioEntity(db, id) { return toBioEntity(db.prepare('SELECT * FROM bio_entities WHERE id = ?').get(id)); }
export function listBioEntities(db, missionId, { entityType = null } = {}) {
  const rows = entityType ? db.prepare('SELECT * FROM bio_entities WHERE mission_id = ? AND entity_type = ? ORDER BY created_at ASC').all(missionId, entityType) : db.prepare('SELECT * FROM bio_entities WHERE mission_id = ? ORDER BY created_at ASC').all(missionId);
  return rows.map(toBioEntity);
}
export function saveBioRelation(db, r) {
  const id = r.id ?? newId();
  db.prepare(`INSERT INTO bio_relations (id, mission_id, from_entity, to_entity, relation_type, evidence_class, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, r.missionId ?? null, r.fromEntity, r.toEntity, r.relationType, r.evidenceClass, JSON.stringify(r.detail ?? {}), Date.now());
  return db.prepare('SELECT * FROM bio_relations WHERE id = ?').get(id);
}
export function listBioRelations(db, missionId) {
  return db.prepare('SELECT * FROM bio_relations WHERE mission_id = ? ORDER BY created_at ASC').all(missionId)
    .map((r) => ({ id: r.id, missionId: r.mission_id, fromEntity: r.from_entity, toEntity: r.to_entity, relationType: r.relation_type, evidenceClass: r.evidence_class, detail: JSON.parse(r.detail_json), createdAt: r.created_at }));
}

/* ---- Formal Reality Kernel (Phase 4 G/L) ---- */
function toFormalRelation(r) {
  if (!r) return null;
  return { id: r.id, missionId: r.mission_id, kind: r.kind, expression: r.expression, symbols: JSON.parse(r.symbols_json), dimension: JSON.parse(r.dimension_json), status: r.status, source: r.source, assumptions: JSON.parse(r.assumptions_json), validityDomain: JSON.parse(r.validity_domain_json), evidenceRefs: JSON.parse(r.evidence_refs_json), contentHash: r.content_hash, createdAt: r.created_at };
}
export function saveFormalRelation(db, f) {
  const id = f.id ?? newId();
  db.prepare(`INSERT INTO formal_relations (id, mission_id, kind, expression, symbols_json, dimension_json, status, source, assumptions_json, validity_domain_json, evidence_refs_json, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, f.missionId ?? null, f.kind, f.expression ?? null, JSON.stringify(f.symbols ?? []), JSON.stringify(f.dimension ?? {}), f.status, f.source ?? null, JSON.stringify(f.assumptions ?? []), JSON.stringify(f.validityDomain ?? {}), JSON.stringify(f.evidenceRefs ?? []), f.contentHash ?? null, Date.now());
  return toFormalRelation(db.prepare('SELECT * FROM formal_relations WHERE id = ?').get(id));
}
export function listFormalRelations(db, missionId) { return db.prepare('SELECT * FROM formal_relations WHERE mission_id = ? ORDER BY created_at ASC').all(missionId).map(toFormalRelation); }

function toFailureRegion(r) {
  if (!r) return null;
  return { id: r.id, missionId: r.mission_id, projectId: r.project_id ?? null, domain: r.domain ?? null, failureClass: r.failure_class, context: r.context, parameterVector: JSON.parse(r.parameter_vector_json), normalized: JSON.parse(r.normalized_json), assumptions: JSON.parse(r.assumptions_json), failureMode: r.failure_mode, verificationState: r.verification_state, provenance: JSON.parse(r.provenance_json ?? '{}'), version: r.region_version ?? 1, contentHash: r.content_hash, createdAt: r.created_at };
}
export function saveFailureRegion(db, f) {
  const id = f.id ?? newId();
  db.prepare(`INSERT INTO formal_failure_regions (id, mission_id, project_id, domain, failure_class, context, parameter_vector_json, normalized_json, assumptions_json, failure_mode, verification_state, provenance_json, region_version, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, f.missionId ?? null, f.projectId ?? null, f.domain ?? null, f.failureClass, f.context ?? null, JSON.stringify(f.parameterVector ?? {}), JSON.stringify(f.normalized ?? {}), JSON.stringify(f.assumptions ?? []), f.failureMode ?? null, f.verificationState ?? null, JSON.stringify(f.provenance ?? {}), Number.isFinite(f.version) ? f.version : 1, f.contentHash ?? null, f.createdAt ?? Date.now());
  return toFailureRegion(db.prepare('SELECT * FROM formal_failure_regions WHERE id = ?').get(id));
}
export function listFailureRegions(db, missionId, { context = null } = {}) {
  const rows = context ? db.prepare('SELECT * FROM formal_failure_regions WHERE mission_id = ? AND context = ? ORDER BY created_at ASC').all(missionId, context) : db.prepare('SELECT * FROM formal_failure_regions WHERE mission_id = ? ORDER BY created_at ASC').all(missionId);
  return rows.map(toFailureRegion);
}
/** STRICT tenant-scoped failure-region query — tenant A's rows are never visible to tenant B. */
export function listFailureRegionsByProject(db, projectId, { context = null, domain = null } = {}) {
  let sql = 'SELECT * FROM formal_failure_regions WHERE project_id = ?';
  const args = [projectId];
  if (context) { sql += ' AND context = ?'; args.push(context); }
  if (domain) { sql += ' AND domain = ?'; args.push(domain); }
  sql += ' ORDER BY created_at ASC';
  return db.prepare(sql).all(...args).map(toFailureRegion);
}

/* ---- ZEFIR Truth Engine / R&D Kill-Switch (Phase 4 product) ---- */
export function saveTruthAnalysis(db, a) {
  const id = a.id ?? newId();
  db.prepare(`INSERT INTO truth_analyses (id, proposal_hash, project_id, decision, decision_hash, certificate_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, a.proposalHash, a.projectId ?? null, a.decision, a.decisionHash, JSON.stringify(a.certificate ?? {}), a.createdAt ?? Date.now());
  return getTruthAnalysis(db, id);
}
export function getTruthAnalysis(db, id) {
  const r = db.prepare('SELECT * FROM truth_analyses WHERE id = ?').get(id);
  return r ? { id: r.id, proposalHash: r.proposal_hash, projectId: r.project_id ?? null, decision: r.decision, decisionHash: r.decision_hash, certificate: JSON.parse(r.certificate_json), createdAt: r.created_at } : null;
}
/* ---- Autonomous Discovery Forge (v21) ---- */
function toCampaign(r) {
  if (!r) return null;
  return { id: r.id, projectId: r.project_id, challenge: JSON.parse(r.challenge_json), status: r.status, planHash: r.plan_hash ?? null, state: JSON.parse(r.state_json), createdAt: r.created_at, updatedAt: r.updated_at };
}
export function createDiscoveryCampaign(db, { projectId, challenge = {}, status = 'CREATED', planHash = null, state = {} }) {
  const id = newId(); const now = Date.now();
  db.prepare(`INSERT INTO discovery_campaigns (id, project_id, challenge_json, status, plan_hash, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, projectId, JSON.stringify(challenge), status, planHash, JSON.stringify(state), now, now);
  return toCampaign(db.prepare('SELECT * FROM discovery_campaigns WHERE id = ?').get(id));
}
export function getDiscoveryCampaign(db, id) { return toCampaign(db.prepare('SELECT * FROM discovery_campaigns WHERE id = ?').get(id)); }
export function listDiscoveryCampaigns(db, projectId) { return db.prepare('SELECT * FROM discovery_campaigns WHERE project_id = ? ORDER BY created_at DESC').all(projectId).map(toCampaign); }
export function updateDiscoveryCampaign(db, id, { status, planHash, state }) {
  const cur = db.prepare('SELECT * FROM discovery_campaigns WHERE id = ?').get(id);
  if (!cur) return null;
  db.prepare('UPDATE discovery_campaigns SET status = ?, plan_hash = ?, state_json = ?, updated_at = ? WHERE id = ?')
    .run(status ?? cur.status, planHash !== undefined ? planHash : cur.plan_hash, state !== undefined ? JSON.stringify(state) : cur.state_json, Date.now(), id);
  return getDiscoveryCampaign(db, id);
}
export function appendDiscoveryEvent(db, { campaignId, generation = 0, type, payload = {}, contentHash = null }) {
  const id = newId();
  db.prepare(`INSERT INTO discovery_events (id, campaign_id, generation, type, payload_json, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, campaignId, generation, type, JSON.stringify(payload), contentHash, Date.now());
  return { id, campaignId, generation, type, payload, contentHash };
}
export function listDiscoveryEvents(db, campaignId, { type = null } = {}) {
  const rows = type
    ? db.prepare('SELECT * FROM discovery_events WHERE campaign_id = ? AND type = ? ORDER BY created_at ASC').all(campaignId, type)
    : db.prepare('SELECT * FROM discovery_events WHERE campaign_id = ? ORDER BY created_at ASC').all(campaignId);
  return rows.map((r) => ({ id: r.id, campaignId: r.campaign_id, generation: r.generation, type: r.type, payload: JSON.parse(r.payload_json), contentHash: r.content_hash, createdAt: r.created_at }));
}

export function listTruthAnalyses(db, { limit = 50, projectId = undefined } = {}) {
  const rows = projectId !== undefined
    ? db.prepare('SELECT id, proposal_hash, project_id, decision, decision_hash, created_at FROM truth_analyses WHERE project_id IS ? ORDER BY created_at DESC LIMIT ?').all(projectId, limit)
    : db.prepare('SELECT id, proposal_hash, project_id, decision, decision_hash, created_at FROM truth_analyses ORDER BY created_at DESC LIMIT ?').all(limit);
  return rows.map((r) => ({ id: r.id, proposalHash: r.proposal_hash, projectId: r.project_id ?? null, decision: r.decision, decisionHash: r.decision_hash, createdAt: r.created_at }));
}
