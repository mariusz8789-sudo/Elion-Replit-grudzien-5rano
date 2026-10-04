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
import { ensureAccessSchema } from './access.mjs';
import { ensureSourceRecordSchema } from './sourceRecordStore.mjs';
import { hashSecret, looksHashed } from './secrets.mjs';
import { ACCOUNT_PROFILES, DEFAULT_ACCOUNT_PROFILE, normalizeAccountProfile } from './accountProfiles.mjs';
import { canonicalJson, sha256Hex } from './determinism.mjs';
import { snapshotDatabase } from './dbDurability.mjs';
import path from 'node:path';

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
  co_parent_smiles   TEXT,
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

// Knowledge Ingestion: material is a project-scoped identity, while every uploaded
// original is immutable in a numbered version row. This reuses the central store;
// no second Knowledge Registry or implicit solver configuration is introduced.
const SCHEMA_V9 = `
CREATE TABLE IF NOT EXISTS knowledge_materials (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  material_key    TEXT NOT NULL,
  title           TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 0,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  UNIQUE (project_id, material_key)
);
CREATE TABLE IF NOT EXISTS knowledge_material_versions (
  id                TEXT PRIMARY KEY,
  material_id       TEXT NOT NULL REFERENCES knowledge_materials(id) ON DELETE CASCADE,
  version           INTEGER NOT NULL,
  file_name         TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  original_blob     BLOB NOT NULL,
  byte_size         INTEGER NOT NULL,
  content_sha256    TEXT NOT NULL,
  topics_json       TEXT NOT NULL DEFAULT '[]',
  source_url        TEXT,
  extracted_text    TEXT NOT NULL DEFAULT '',
  extraction_status TEXT NOT NULL,
  epistemic_status  TEXT NOT NULL,
  provenance_json   TEXT NOT NULL DEFAULT '{}',
  uploaded_by       TEXT NOT NULL REFERENCES users(id),
  created_at        INTEGER NOT NULL,
  UNIQUE (material_id, version)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_materials_project ON knowledge_materials(project_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_versions_material ON knowledge_material_versions(material_id, version);
`;

// GIS artifacts are immutable project-scoped source data. They never store agents,
// a simulation clock or a parallel World State; normalized JSON is preserved solely
// for provenance-carrying, read-only renderer overlays.
const SCHEMA_V10 = `
CREATE TABLE IF NOT EXISTS project_spatial_datasets (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dataset_id          TEXT NOT NULL,
  label               TEXT NOT NULL,
  normalized_json     TEXT NOT NULL,
  original_blob       BLOB NOT NULL,
  original_sha256     TEXT NOT NULL,
  created_by          TEXT NOT NULL REFERENCES users(id),
  created_at          INTEGER NOT NULL,
  UNIQUE (project_id, dataset_id)
);
CREATE INDEX IF NOT EXISTS idx_project_spatial_datasets_project ON project_spatial_datasets(project_id, created_at DESC);
`;

// Genesis C3 World Model persistence (Scientific World Model 4.0, Priority 1.1):
// a saved world/branch snapshot from `worldSnapshot.ts` (frontend) — worldId is
// the whole world's identity across its branch tree, branch_id/parent_world_id
// distinguish forks. Deliberately NOT project/user-scoped (WorldRegistry has no
// such concept today): a standalone table, same as `runs` already allows a NULL
// project_id.
const SCHEMA_V11 = `
CREATE TABLE IF NOT EXISTS worlds (
  world_id            TEXT PRIMARY KEY,
  parent_world_id     TEXT,
  seed                INTEGER NOT NULL,
  branch_id           TEXT NOT NULL,
  parent_branch_id    TEXT,
  forked_at_tick      INTEGER,
  specification_json  TEXT NOT NULL,
  provenance_json     TEXT,
  keyframe_tick       INTEGER NOT NULL,
  keyframe_simulated_time REAL NOT NULL,
  keyframe_entities_json TEXT NOT NULL,
  keyframe_relationships_json TEXT NOT NULL,
  events_json         TEXT NOT NULL,
  observations_json   TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_worlds_parent ON worlds(parent_world_id);
`;

// Autonomous Core (Genesis Master Audit, NEXT 2): a real, resumable multi-step agent
// investigation. `agent_runs` is the run header (goal, domain, status, budget);
// `agent_run_steps` is APPEND-ONLY, one row per real step (hypothesis tested, tool
// invoked, observation, falsification verdict, next action) — never rewritten, same
// discipline as campaign_decisions/campaign_events. A run's steps are its own
// GENESIS AGENT TRACE; this table carries no reasoning of its own, only the record
// of reasoning that happened elsewhere (the tool/selector that actually ran).
const SCHEMA_V12 = `
CREATE TABLE IF NOT EXISTS agent_runs (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  goal          TEXT NOT NULL,
  domain        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'RUNNING',
  budget_json   TEXT NOT NULL DEFAULT '{}',
  final_json    TEXT,
  created_by    TEXT REFERENCES users(id),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_run_steps (
  id                          TEXT PRIMARY KEY,
  agent_run_id                TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_index                  INTEGER NOT NULL,
  hypothesis_json             TEXT NOT NULL DEFAULT '{}',
  tool_invoked                TEXT NOT NULL,
  capability                  TEXT NOT NULL,
  branch_id                   TEXT,
  observation_json            TEXT,
  falsification_verdict_json  TEXT,
  error                       TEXT,
  retry_count                 INTEGER NOT NULL DEFAULT 0,
  next_action_json            TEXT NOT NULL DEFAULT '{}',
  provenance_event_ids_json   TEXT NOT NULL DEFAULT '[]',
  created_at                  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_project ON agent_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_run_steps_run ON agent_run_steps(agent_run_id, step_index);
`;

// Scientific Memory on the server (constitution §7): a campaign's PREREGISTRATION and the SEALED
// SESSIONS judged against it. Append-only by construction — two triggers refuse UPDATE and DELETE,
// so a stored criterion cannot be edited after a result is known, and past evidence cannot be
// removed. Each row carries the content hash of its canonical body and a chain hash over the
// campaign's previous row, so a missing or altered row in the middle is detectable, not silent.
//
// `project_id` is deliberately NOT a foreign key: evidence outlives the project row that produced
// it, and a cascade delete would silently destroy the record this table exists to keep.
const SCHEMA_V14 = `
CREATE TABLE IF NOT EXISTS experiment_records (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL,
  campaign_id        TEXT NOT NULL,
  kind               TEXT NOT NULL,
  seq                INTEGER NOT NULL,
  fingerprint        TEXT NOT NULL,
  content_hash       TEXT NOT NULL,
  prev_chain_hash    TEXT,
  chain_hash         TEXT NOT NULL,
  preregistration_id TEXT,
  prereg_check       TEXT,
  body_json          TEXT NOT NULL,
  created_by         TEXT,
  created_at         INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_experiment_records_seq ON experiment_records(campaign_id, seq);
CREATE INDEX IF NOT EXISTS idx_experiment_records_campaign ON experiment_records(campaign_id, kind);
CREATE TRIGGER IF NOT EXISTS experiment_records_append_only_update BEFORE UPDATE ON experiment_records
BEGIN SELECT RAISE(ABORT, 'experiment_records is append-only: a sealed experiment record cannot be updated'); END;
CREATE TRIGGER IF NOT EXISTS experiment_records_append_only_delete BEFORE DELETE ON experiment_records
BEGIN SELECT RAISE(ABORT, 'experiment_records is append-only: a sealed experiment record cannot be deleted'); END;
`;

// V16: the knowledge channel's evidence ledger (src/knowledgeApi.mjs) moves from a per-process JSON snapshot into
// this database, so several backend processes on one data directory append to ONE chain. Entries are append-only
// (triggers), contiguous (idx = row count) and chained (prev_hash = hash of idx - 1), enforced here, not only in JS.
// `effect_json` carries what the entry did (the proposed record, the approver), so the ledger state is a replay of
// the rows. Entries imported from a legacy JSON snapshot have effect_json NULL; their state is the one
// `evidence_ledger_base` row written in the same transaction.
const SCHEMA_V16 = `
CREATE TABLE IF NOT EXISTS evidence_ledger_entries (
  idx          INTEGER PRIMARY KEY CHECK (idx >= 0),
  kind         TEXT NOT NULL CHECK (kind IN ('ADD','PROPOSE','PUBLISH','REJECT')),
  record_id    TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  prev_hash    TEXT NOT NULL UNIQUE,
  hash         TEXT NOT NULL UNIQUE,
  entry_json   TEXT NOT NULL,
  effect_json  TEXT,
  writer       TEXT,
  created_at   INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS evidence_ledger_entries_contiguous BEFORE INSERT ON evidence_ledger_entries
WHEN NEW.idx <> (SELECT COUNT(*) FROM evidence_ledger_entries)
  OR (NEW.idx = 0 AND NEW.prev_hash <> 'GENESIS')
  OR (NEW.idx > 0 AND NEW.prev_hash IS NOT (SELECT hash FROM evidence_ledger_entries WHERE idx = NEW.idx - 1))
BEGIN SELECT RAISE(ABORT, 'evidence_ledger_entries: an entry must extend the current head of the chain'); END;
CREATE TRIGGER IF NOT EXISTS evidence_ledger_entries_append_only_update BEFORE UPDATE ON evidence_ledger_entries
BEGIN SELECT RAISE(ABORT, 'evidence_ledger_entries is append-only: an entry cannot be updated'); END;
CREATE TRIGGER IF NOT EXISTS evidence_ledger_entries_append_only_delete BEFORE DELETE ON evidence_ledger_entries
BEGIN SELECT RAISE(ABORT, 'evidence_ledger_entries is append-only: an entry cannot be deleted'); END;
CREATE TABLE IF NOT EXISTS evidence_ledger_base (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  head_count    INTEGER NOT NULL,
  state_json    TEXT NOT NULL,
  source_path   TEXT,
  source_sha256 TEXT,
  imported_at   INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS evidence_ledger_base_append_only_update BEFORE UPDATE ON evidence_ledger_base
BEGIN SELECT RAISE(ABORT, 'evidence_ledger_base is append-only'); END;
CREATE TRIGGER IF NOT EXISTS evidence_ledger_base_append_only_delete BEFORE DELETE ON evidence_ledger_base
BEGIN SELECT RAISE(ABORT, 'evidence_ledger_base is append-only'); END;
`;

// V15 extends the existing `jobs` table for lease-based scientific workers. Legacy in-process jobs
// keep all new columns NULL and retain their old lifecycle; only rows carrying idempotency_key are
// claimed by the scientific queue backend.
const JOB_LEASE_COLUMNS_V15 = Object.freeze([
  ['idempotency_key', 'TEXT'], ['research_run_id', 'TEXT'], ['experiment_id', 'TEXT'], ['capability_id', 'TEXT'],
  ['priority', 'INTEGER NOT NULL DEFAULT 0'], ['max_attempts', 'INTEGER NOT NULL DEFAULT 1'],
  ['attempts', 'INTEGER NOT NULL DEFAULT 0'], ['timeout_ms', 'INTEGER'], ['worker_id', 'TEXT'],
  ['lease_id', 'TEXT'], ['lease_expires_at', 'INTEGER'], ['failure_json', 'TEXT'], ['cancel_reason', 'TEXT'],
]);

// V17: TIME-TO-DISCOVERY instrumentation (src/discoveryTiming.mjs). Four append-only tables, no second
// state system: the timings are written from inside the canonical ResearchRun loop's own write
// transactions, so a rolled-back step leaves no timing behind either.
//
//  - `discovery_stage_marks` holds ONLY stage boundaries. The unique index makes "each boundary is
//    recorded once" a database guarantee, not a convention: a second OPEN or a second CLOSE for the
//    same (scope, stage) is refused by SQLite, so a re-entered loop step cannot inflate or reset a
//    measured stage.
//  - `discovery_stage_facts` holds everything that ACCUMULATES inside a stage: time spans
//    (COMPUTE / QUEUE / HUMAN_WAIT), counters (experiments, rejected candidates, retries),
//    distinct members (agents, workers) and Evidence/Replay statuses.
//    QUEUE and HUMAN_WAIT are deliberately different kinds: QUEUE is time a unit of work waited for
//    a MACHINE (a free worker, a lease, a scheduler), HUMAN_WAIT is time blocked on a PERSON (a
//    review, a decision, a laboratory). Collapsing them would let a slow human look like a slow
//    computer, which is exactly the number the 2x claim must not blur.
//  - `discovery_competitor_baselines` holds EXTERNALLY measured baselines. Every provenance column is
//    NOT NULL and CHECKed non-empty, so a baseline without a traceable measurer, method and source
//    cannot be inserted at all; the speedup indicator reads nothing else.
//  - `discovery_timing_campaign_links` attaches a run (or any scope) to a campaign, so a campaign's
//    full cycle is retrievable even when its runs were created before the link existed.
const SCHEMA_V17 = `
CREATE TABLE IF NOT EXISTS discovery_stage_marks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_kind  TEXT NOT NULL CHECK (scope_kind IN ('RESEARCH_RUN','EXPERIMENT','CAMPAIGN')),
  scope_id    TEXT NOT NULL,
  stage       TEXT NOT NULL,
  mark        TEXT NOT NULL CHECK (mark IN ('OPEN','CLOSE')),
  at_ms       INTEGER NOT NULL CHECK (at_ms >= 0),
  campaign_id TEXT,
  detail_json TEXT,
  created_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_stage_marks_once
  ON discovery_stage_marks(scope_kind, scope_id, stage, mark);
CREATE INDEX IF NOT EXISTS idx_discovery_stage_marks_campaign
  ON discovery_stage_marks(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE TRIGGER IF NOT EXISTS discovery_stage_marks_append_only_update BEFORE UPDATE ON discovery_stage_marks
BEGIN SELECT RAISE(ABORT, 'discovery_stage_marks is append-only: a measured stage boundary cannot be moved'); END;
CREATE TRIGGER IF NOT EXISTS discovery_stage_marks_append_only_delete BEFORE DELETE ON discovery_stage_marks
BEGIN SELECT RAISE(ABORT, 'discovery_stage_marks is append-only: a measured stage boundary cannot be deleted'); END;

CREATE TABLE IF NOT EXISTS discovery_stage_facts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_kind  TEXT NOT NULL CHECK (scope_kind IN ('RESEARCH_RUN','EXPERIMENT','CAMPAIGN')),
  scope_id    TEXT NOT NULL,
  stage       TEXT NOT NULL,
  fact        TEXT NOT NULL CHECK (fact IN ('SPAN','COUNT','MEMBER','STATUS')),
  kind        TEXT NOT NULL,
  value_ms    INTEGER CHECK (value_ms IS NULL OR value_ms >= 0),
  delta       INTEGER,
  member      TEXT,
  status      TEXT,
  ref         TEXT,
  campaign_id TEXT,
  detail_json TEXT,
  at_ms       INTEGER NOT NULL CHECK (at_ms >= 0),
  created_at  INTEGER NOT NULL,
  CHECK (fact <> 'SPAN'   OR value_ms IS NOT NULL),
  CHECK (fact <> 'COUNT'  OR delta    IS NOT NULL),
  CHECK (fact <> 'MEMBER' OR (member IS NOT NULL AND member <> '')),
  CHECK (fact <> 'STATUS' OR (status IS NOT NULL AND status <> ''))
);
CREATE INDEX IF NOT EXISTS idx_discovery_stage_facts_scope
  ON discovery_stage_facts(scope_kind, scope_id, stage);
CREATE INDEX IF NOT EXISTS idx_discovery_stage_facts_campaign
  ON discovery_stage_facts(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE TRIGGER IF NOT EXISTS discovery_stage_facts_append_only_update BEFORE UPDATE ON discovery_stage_facts
BEGIN SELECT RAISE(ABORT, 'discovery_stage_facts is append-only'); END;
CREATE TRIGGER IF NOT EXISTS discovery_stage_facts_append_only_delete BEFORE DELETE ON discovery_stage_facts
BEGIN SELECT RAISE(ABORT, 'discovery_stage_facts is append-only'); END;

CREATE TABLE IF NOT EXISTS discovery_competitor_baselines (
  id                   TEXT PRIMARY KEY,
  task_scope_id        TEXT NOT NULL CHECK (task_scope_id <> ''),
  task_scope_hash      TEXT NOT NULL CHECK (task_scope_hash <> ''),
  stage                TEXT NOT NULL,
  evidence_standard    TEXT NOT NULL CHECK (evidence_standard <> ''),
  wall_clock_ms        INTEGER NOT NULL CHECK (wall_clock_ms > 0),
  active_human_ms      INTEGER NOT NULL CHECK (active_human_ms >= 0),
  compute_ms           INTEGER NOT NULL CHECK (compute_ms >= 0),
  measured_by          TEXT NOT NULL CHECK (measured_by <> ''),
  measured_at          TEXT NOT NULL CHECK (measured_at <> ''),
  measurement_method   TEXT NOT NULL CHECK (measurement_method <> ''),
  source_uri           TEXT NOT NULL CHECK (source_uri <> ''),
  source_sha256        TEXT NOT NULL CHECK (length(source_sha256) = 64),
  provenance_json      TEXT NOT NULL CHECK (provenance_json <> ''),
  provenance_hash      TEXT NOT NULL CHECK (length(provenance_hash) = 64),
  created_at           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_discovery_competitor_baselines_scope
  ON discovery_competitor_baselines(task_scope_id, stage);
CREATE TRIGGER IF NOT EXISTS discovery_competitor_baselines_append_only_update BEFORE UPDATE ON discovery_competitor_baselines
BEGIN SELECT RAISE(ABORT, 'discovery_competitor_baselines is append-only: a recorded baseline cannot be edited'); END;
CREATE TRIGGER IF NOT EXISTS discovery_competitor_baselines_append_only_delete BEFORE DELETE ON discovery_competitor_baselines
BEGIN SELECT RAISE(ABORT, 'discovery_competitor_baselines is append-only: a recorded baseline cannot be deleted'); END;

CREATE TABLE IF NOT EXISTS discovery_timing_campaign_links (
  scope_kind  TEXT NOT NULL CHECK (scope_kind IN ('RESEARCH_RUN','EXPERIMENT','CAMPAIGN')),
  scope_id    TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (scope_kind, scope_id, campaign_id)
);
`;

/**
 * Najwyższa wersja schematu, jaką TEN kod zna i umie migrować do niej.
 * `PRAGMA user_version` jest już metadaną wersji schematu wbudowaną w plik
 * bazy (przenosi się przez `VACUUM INTO`/backup, patrz P0.2) — P1.3 dodaje
 * do niej jedynie GUARD w drugą stronę: dziś `migrate()` umiał tylko iść w
 * przód (`if (version < N)`), więc baza NOWSZA niż ten kod przechodziłaby
 * przez każdy warunek jako fałszywy i trafiała w ręce starszego kodu bez
 * ostrzeżenia — realne ryzyko cichego uszkodzenia danych przez downgrade
 * (uruchomienie starszego release'u na już-podniesionej bazie produkcyjnej).
 */
export const CURRENT_SCHEMA_VERSION = 17;

function migrate(db) {
  const { user_version: version } = db.prepare('PRAGMA user_version').get();
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `GENESIS DB SCHEMA TOO NEW: ta baza ma schema_version=${version}, ale ten kod zna schemat tylko do wersji ${CURRENT_SCHEMA_VERSION}. ` +
      'Uruchomienie starszego backendu na nowszej bazie mogłoby po cichu uszkodzić lub błędnie zinterpretować dane -- odmawiam otwarcia zamiast zgadywać. ' +
      'Podnieś backend do wersji, która zna schema_version >= ' + version + ', zanim otworzysz tę bazę.',
    );
  }
  if (version < 9) db.exec(SCHEMA_V9);
  if (version < 10) db.exec(SCHEMA_V10);
  if (version < 11) db.exec(SCHEMA_V11);
  if (version < 12) db.exec(SCHEMA_V12);
  if (version < 14) db.exec(SCHEMA_V14);
  // Rekombinacja BRICS ma DWOJE rodziców, więc rodowód potrzebuje drugiej kolumny.
  // Dodatkowo, nie destrukcyjnie: bazy sprzed tej zmiany dostają kolumnę pustą,
  // a kandydaci jednorodzicielscy mają w niej NULL na zawsze — to poprawny stan,
  // nie brak danych.
  {
    const cols = db.prepare('PRAGMA table_info(campaign_candidates)').all();
    if (cols.length > 0 && !cols.some((c) => c.name === 'co_parent_smiles')) {
      db.exec('ALTER TABLE campaign_candidates ADD COLUMN co_parent_smiles TEXT');
    }
  }
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
  if (version < 15) {
    // SCHEMA_V5 is idempotent and guarantees the table exists for a fresh or very old database.
    db.exec(SCHEMA_V5);
    const columns = db.prepare('PRAGMA table_info(jobs)').all();
    const names = new Set(columns.map((column) => column.name));
    for (const [name, declaration] of JOB_LEASE_COLUMNS_V15) {
      if (!names.has(name)) db.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${declaration}`);
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idempotency ON jobs(idempotency_key) WHERE idempotency_key IS NOT NULL');
    db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_scientific_claim ON jobs(status, priority DESC, created_at ASC) WHERE idempotency_key IS NOT NULL');
  }
  // R-001 (docs/RISKS.md): hash any PLAINTEXT session token left over from before
  // this migration existed. `looksHashed` makes this idempotent by construction,
  // not just by the `version < 13` gate: a token that is already a 64-hex-char
  // SHA-256 is left untouched, so re-running this block twice on the same row
  // (e.g. two `openDatabase()` calls before user_version could even be bumped)
  // never double-hashes a value that was already hashed.
  if (version < 13) {
    const rows = db.prepare('SELECT token FROM sessions').all();
    for (const row of rows) {
      if (looksHashed(row.token)) continue;
      const hashed = hashSecret(row.token);
      if (hashed === null) continue;
      db.prepare('UPDATE sessions SET token = ? WHERE token = ?').run(hashed, row.token);
    }
  }
  if (version < 8) db.exec('PRAGMA user_version = 8');
  if (version < 9) db.exec('PRAGMA user_version = 9');
  if (version < 10) db.exec('PRAGMA user_version = 10');
  if (version < 11) db.exec('PRAGMA user_version = 11');
  if (version < 12) db.exec('PRAGMA user_version = 12');
  if (version < 13) db.exec('PRAGMA user_version = 13');
  if (version < 14) db.exec('PRAGMA user_version = 14');
  // v15: profil konta (accountProfiles.mjs). Kolumna dodawana nie-destrukcyjnie i
  // tylko gdy jej brak (idempotentne także poza bramką wersji); istniejące konta
  // dostają DEFAULT_ACCOUNT_PROFILE (BADACZ), więc nikt nie traci dotychczasowego dostępu.
  ensureAccountProfileColumn(db);
  if (version < 15) db.exec('PRAGMA user_version = 15');
  if (version < 16) {
    db.exec(SCHEMA_V16);
    db.exec('PRAGMA user_version = 16');
  }
  // v17: TIME-TO-DISCOVERY tables. Purely additive (`CREATE TABLE IF NOT EXISTS` + indexes), so a
  // database from any earlier version keeps every row it had and simply gains four empty tables; a
  // run that happened before this migration has no stage timings, which is the correct state
  // (nothing was measured then), never a gap to be backfilled with guesses.
  if (version < 17) {
    db.exec(SCHEMA_V17);
    db.exec('PRAGMA user_version = 17');
  }
}

function ensureAccountProfileColumn(db) {
  const cols = db.prepare('PRAGMA table_info(users)').all();
  if (cols.some((c) => c.name === 'account_profile')) return;
  const allowed = ACCOUNT_PROFILES.map((p) => `'${p}'`).join(',');
  db.exec(`ALTER TABLE users ADD COLUMN account_profile TEXT NOT NULL DEFAULT '${DEFAULT_ACCOUNT_PROFILE}' CHECK (account_profile IN (${allowed}))`);
}

/** Otwiera (i migruje) bazę. `:memory:` dla testów, ścieżka pliku w produkcji. */
export function openDatabase(filename = ':memory:', { backupDir = null } = {}) {
  const db = new DatabaseSync(filename);
  try {
    db.exec('PRAGMA foreign_keys = ON;');
    if (filename !== ':memory:') {
      // A heavy job writes from a worker thread on its own connection, and several processes may open the same file
      // at once: wait for the lock instead of failing. Set before WAL, which itself needs the lock.
      db.exec('PRAGMA busy_timeout = 5000;');
      db.exec('PRAGMA journal_mode = WAL;');
    }
    const { user_version: before } = db.prepare('PRAGMA user_version').get();
    // An older release refuses a database whose schema is newer than it knows, so a code-only rollback cannot
    // reopen a migrated database. The pre-migration snapshot is what a rollback restores.
    const preMigrationSnapshot = filename !== ':memory:' && before > 0 && before < CURRENT_SCHEMA_VERSION
      ? snapshotDatabase({ dbPath: filename, dir: backupDir ?? process.env.GENESIS_BACKUP_DIR ?? path.join(path.dirname(filename), 'backups'), keep: Number.MAX_SAFE_INTEGER })
      : null;
    if (preMigrationSnapshot) {
      console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info', msg: 'db_pre_migration_snapshot', fromSchema: before, toSchema: CURRENT_SCHEMA_VERSION, file: preMigrationSnapshot.file, bytes: preMigrationSnapshot.bytes }));
    }
    // Schema creation and migration run under one write lock, so a second process opening the same file at the
    // same time waits and then sees the finished schema instead of migrating it a second time.
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(SCHEMA);
      migrate(db);
      ensureAccessSchema(db);
      ensureSourceRecordSchema(db);
      db.exec('COMMIT');
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw error;
    }
    return db;
  } catch (error) {
    // A rejected migration must not leak the handle (or lock its files on Windows).
    db.close();
    throw error;
  }
}

/* ---------------- Mapowanie wierszy → obiekty (camelCase, bez pól wrażliwych) ---------------- */

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    accountProfile: normalizeAccountProfile(row.account_profile) ?? DEFAULT_ACCOUNT_PROFILE,
    createdAt: row.created_at,
  };
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
export function createUser(db, { email, displayName, passwordHash, accountProfile = DEFAULT_ACCOUNT_PROFILE }) {
  const id = newId();
  const now = Date.now();
  const profile = normalizeAccountProfile(accountProfile);
  if (!profile) throw new Error('invalid_account_profile');
  try {
    db.prepare(
      'INSERT INTO users (id, email, display_name, password_hash, account_profile, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, email, displayName, passwordHash, profile, now);
  } catch (err) {
    if (String(err?.message ?? '').includes('UNIQUE')) throw new Error('email_taken', { cause: err });
    throw err;
  }
  return { id, email, displayName, accountProfile: profile, createdAt: now };
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

/**
 * R-001 (docs/RISKS.md): `sessions.token` stores ONLY `hashSecret(token)`, never
 * the raw value — a database backup (P0.2's `db-backup.mjs`) must not carry a
 * live, directly usable credential. The raw token is still returned here and by
 * `issueSession` (api.mjs), because that is the one moment the client is handed
 * it; every later lookup re-hashes the presented token and compares hashes.
 */
export function createSession(db, { userId, token, ttlMs }) {
  const now = Date.now();
  const expiresAt = now + ttlMs;
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    hashSecret(token),
    userId,
    now,
    expiresAt,
  );
  return { token, userId, createdAt: now, expiresAt };
}

/** Zwraca użytkownika powiązanego z ważnym tokenem (albo null). Wygasłą sesję kasuje. */
export function getUserByToken(db, token) {
  if (!token) return null;
  const hashed = hashSecret(token);
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(hashed);
  if (!s) return null;
  if (Date.now() > s.expires_at) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(hashed);
    return null;
  }
  return getUserById(db, s.user_id);
}

export function deleteSession(db, token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(hashSecret(token));
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

/* ---------------- Knowledge Ingestion (materiały projektu) ---------------- */

function toKnowledgeMaterial(row, { includeText = false, includeOriginal = false } = {}) {
  if (!row) return null;
  return {
    id: row.material_id ?? row.id,
    projectId: row.project_id,
    title: row.title,
    materialKey: row.material_key,
    currentVersion: row.current_version,
    createdBy: row.created_by,
    createdAt: row.material_created_at ?? row.created_at,
    updatedAt: row.updated_at,
    versionId: row.version_id ?? null,
    version: row.version ?? null,
    fileName: row.file_name ?? null,
    mimeType: row.mime_type ?? null,
    byteSize: row.byte_size ?? null,
    contentSha256: row.content_sha256 ?? null,
    topics: row.topics_json ? JSON.parse(row.topics_json) : [],
    sourceUrl: row.source_url ?? null,
    extractionStatus: row.extraction_status ?? null,
    epistemicStatus: row.epistemic_status ?? null,
    provenance: row.provenance_json ? JSON.parse(row.provenance_json) : {},
    ...(includeText ? { extractedText: row.extracted_text ?? '' } : {}),
    ...(includeOriginal ? { originalBase64: Buffer.from(row.original_blob ?? []).toString('base64') } : {}),
  };
}

const KNOWLEDGE_LATEST_SELECT = `
  SELECT km.id AS material_id, km.project_id, km.material_key, km.title, km.current_version,
         km.created_by, km.created_at AS material_created_at, km.updated_at,
         kmv.id AS version_id, kmv.version, kmv.file_name, kmv.mime_type, kmv.original_blob,
         kmv.byte_size, kmv.content_sha256, kmv.topics_json, kmv.source_url, kmv.extracted_text,
         kmv.extraction_status, kmv.epistemic_status, kmv.provenance_json
  FROM knowledge_materials km
  JOIN knowledge_material_versions kmv ON kmv.material_id = km.id AND kmv.version = km.current_version`;

/** Zapisuje oryginalny artefakt jako nową, niezmienną wersję tego samego materiału. */
export function ingestKnowledgeMaterial(db, { projectId, uploadedBy, material }) {
  const now = Date.now();
  const existing = db.prepare('SELECT * FROM knowledge_materials WHERE project_id = ? AND material_key = ?').get(projectId, material.stableKey);
  const materialId = existing?.id ?? newId();
  const nextVersion = (existing?.current_version ?? 0) + 1;
  const versionId = newId();
  db.exec('BEGIN');
  try {
    if (!existing) {
      db.prepare(`INSERT INTO knowledge_materials (id, project_id, material_key, title, current_version, created_by, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(materialId, projectId, material.stableKey, material.title, nextVersion, uploadedBy, now, now);
    } else {
      db.prepare('UPDATE knowledge_materials SET title = ?, current_version = ?, updated_at = ? WHERE id = ?')
        .run(material.title, nextVersion, now, materialId);
    }
    db.prepare(`INSERT INTO knowledge_material_versions
      (id, material_id, version, file_name, mime_type, original_blob, byte_size, content_sha256, topics_json, source_url, extracted_text, extraction_status, epistemic_status, provenance_json, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(versionId, materialId, nextVersion, material.fileName, material.mimeType, material.bytes, material.byteSize,
        material.contentSha256, JSON.stringify(material.topics), material.sourceUrl, material.extractedText,
        material.extractionStatus, material.epistemicStatus, JSON.stringify(material.provenance), uploadedBy, now);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getKnowledgeMaterial(db, projectId, materialId, { includeText: true });
}

export function listKnowledgeMaterials(db, projectId) {
  return db.prepare(`${KNOWLEDGE_LATEST_SELECT} WHERE km.project_id = ? ORDER BY km.updated_at DESC`).all(projectId)
    .map((row) => toKnowledgeMaterial(row));
}

export function getKnowledgeMaterial(db, projectId, materialId, options = {}) {
  const row = db.prepare(`${KNOWLEDGE_LATEST_SELECT} WHERE km.project_id = ? AND km.id = ?`).get(projectId, materialId);
  return toKnowledgeMaterial(row, options);
}

/** Wyszukiwanie leksykalne w aktualnej wersji każdego materiału — bez wektorowej atrapy. */
export function searchKnowledgeMaterials(db, projectId, tokens) {
  const clean = Array.isArray(tokens) ? tokens.filter((token) => typeof token === 'string' && token.length >= 2).slice(0, 12) : [];
  if (clean.length === 0) return [];
  const clauses = clean.map(() => '(lower(km.title) LIKE ? OR lower(kmv.topics_json) LIKE ? OR lower(kmv.extracted_text) LIKE ?)');
  const values = [projectId];
  for (const token of clean) {
    const needle = `%${token.toLocaleLowerCase('pl-PL')}%`;
    values.push(needle, needle, needle);
  }
  // Pytania w Science Chat zawierają także słowa funkcyjne i czasowniki. Wystarczy
  // deterministyczne trafienie co najmniej jednego terminu w tytule, tematach lub
  // wyekstrahowanej treści; nie udajemy dopasowania semantycznego ani nie
  // przekazujemy materiału jako instrukcji dla solvera.
  const rows = db.prepare(`${KNOWLEDGE_LATEST_SELECT} WHERE km.project_id = ? AND (${clauses.join(' OR ')}) ORDER BY km.updated_at DESC LIMIT 12`).all(...values);
  return rows.map((row) => toKnowledgeMaterial(row, { includeText: true }));
}

/* ---------------- Project-scoped GIS artifacts ---------------- */

function toProjectSpatialDataset(row, { includeOriginal = false } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    datasetId: row.dataset_id,
    label: row.label,
    dataset: JSON.parse(row.normalized_json),
    originalSha256: row.original_sha256,
    createdBy: row.created_by,
    createdAt: row.created_at,
    ...(includeOriginal ? { originalBase64: Buffer.from(row.original_blob).toString('base64') } : {}),
  };
}

/** Persists an immutable source artifact; duplicate dataset fingerprints are reused per project. */
export function saveProjectSpatialDataset(db, { projectId, createdBy, spatial }) {
  const existing = db.prepare('SELECT * FROM project_spatial_datasets WHERE project_id = ? AND dataset_id = ?').get(projectId, spatial.dataset.datasetId);
  if (existing) return toProjectSpatialDataset(existing);
  const id = newId();
  const now = Date.now();
  db.prepare(`INSERT INTO project_spatial_datasets
    (id, project_id, dataset_id, label, normalized_json, original_blob, original_sha256, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, projectId, spatial.dataset.datasetId, spatial.label, JSON.stringify(spatial.dataset), spatial.original,
      spatial.originalSha256, createdBy, now);
  return getProjectSpatialDataset(db, projectId, id);
}

export function listProjectSpatialDatasets(db, projectId) {
  return db.prepare('SELECT * FROM project_spatial_datasets WHERE project_id = ? ORDER BY created_at DESC').all(projectId)
    .map((row) => toProjectSpatialDataset(row));
}

export function getProjectSpatialDataset(db, projectId, id, options = {}) {
  return toProjectSpatialDataset(db.prepare('SELECT * FROM project_spatial_datasets WHERE project_id = ? AND id = ?').get(projectId, id), options);
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

/* ---------------- Scientific Memory: preregistrations and sealed sessions ---------------- */

function toExperimentRecord(r) {
  if (!r) return null;
  return {
    id: r.id, projectId: r.project_id, campaignId: r.campaign_id, kind: r.kind, seq: r.seq,
    fingerprint: r.fingerprint, contentHash: r.content_hash,
    prevChainHash: r.prev_chain_hash ?? null, chainHash: r.chain_hash,
    preregistrationId: r.preregistration_id ?? null, preregCheck: r.prereg_check ?? null,
    body: JSON.parse(r.body_json), createdBy: r.created_by ?? null, createdAt: r.created_at,
  };
}

/** The chain hash of a row: sha256 over the previous row's chain hash and this row's content hash. */
export function experimentChainHash(prevChainHash, contentHash) {
  return sha256Hex(`${prevChainHash ?? ''}|${contentHash}`);
}

/**
 * Appends ONE immutable record to a campaign's scientific memory. The caller supplies the canonical
 * body and its content hash; this function only assigns the position in the chain and links it to the
 * previous row. There is no update path — the table's triggers refuse one.
 */
export function appendExperimentRecord(db, rec) {
  const last = db.prepare('SELECT chain_hash, seq FROM experiment_records WHERE campaign_id = ? ORDER BY seq DESC LIMIT 1').get(rec.campaignId);
  const seq = (last?.seq ?? 0) + 1;
  const prevChainHash = last?.chain_hash ?? null;
  const chainHash = experimentChainHash(prevChainHash, rec.contentHash);
  const id = rec.id ?? newId();
  db.prepare(
    `INSERT INTO experiment_records (id, project_id, campaign_id, kind, seq, fingerprint, content_hash, prev_chain_hash, chain_hash, preregistration_id, prereg_check, body_json, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, rec.projectId, rec.campaignId, rec.kind, seq, rec.fingerprint, rec.contentHash,
    prevChainHash, chainHash, rec.preregistrationId ?? null, rec.preregCheck ?? null,
    JSON.stringify(rec.body), rec.createdBy ?? null, Date.now(),
  );
  return getExperimentRecord(db, id);
}

export function getExperimentRecord(db, id) {
  return toExperimentRecord(db.prepare('SELECT * FROM experiment_records WHERE id = ?').get(id));
}

export function listExperimentRecords(db, campaignId, kind = null) {
  const rows = kind
    ? db.prepare('SELECT * FROM experiment_records WHERE campaign_id = ? AND kind = ? ORDER BY seq ASC').all(campaignId, kind)
    : db.prepare('SELECT * FROM experiment_records WHERE campaign_id = ? ORDER BY seq ASC').all(campaignId);
  return rows.map(toExperimentRecord);
}

/** The FIRST preregistration of a campaign — the one every later session is judged against. */
export function getExperimentPreregistration(db, campaignId) {
  return toExperimentRecord(db.prepare("SELECT * FROM experiment_records WHERE campaign_id = ? AND kind = 'PREREGISTRATION' ORDER BY seq ASC LIMIT 1").get(campaignId));
}

/**
 * Recomputes the campaign's hash chain from the stored bodies. `ok: false` names the first row that
 * does not verify — either its body no longer hashes to its content hash, or the chain link is broken
 * (a row was removed or inserted out of order by something that bypassed this module).
 */
export function verifyExperimentRecordChain(db, campaignId) {
  const rows = listExperimentRecords(db, campaignId);
  let prev = null;
  for (const row of rows) {
    if (sha256Hex(canonicalJson(row.body)) !== row.contentHash) return { ok: false, length: rows.length, brokenAt: row.seq, reason: 'CONTENT_HASH_MISMATCH' };
    if ((row.prevChainHash ?? null) !== prev) return { ok: false, length: rows.length, brokenAt: row.seq, reason: 'CHAIN_LINK_MISMATCH' };
    if (experimentChainHash(prev, row.contentHash) !== row.chainHash) return { ok: false, length: rows.length, brokenAt: row.seq, reason: 'CHAIN_HASH_MISMATCH' };
    prev = row.chainHash;
  }
  return { ok: true, length: rows.length, brokenAt: null, reason: null, headChainHash: prev };
}

/* ---------------- Genesis C3 World Model: saved world snapshots ---------------- */

function toWorldSnapshotRow(row) {
  if (!row) return null;
  return {
    worldId: row.world_id,
    parentWorldId: row.parent_world_id ?? undefined,
    seed: row.seed,
    branchId: row.branch_id,
    parentBranchId: row.parent_branch_id ?? null,
    forkedAtTick: row.forked_at_tick ?? null,
    specification: JSON.parse(row.specification_json),
    provenance: row.provenance_json ? JSON.parse(row.provenance_json) : undefined,
    keyframeTick: row.keyframe_tick,
    keyframeSimulatedTime: row.keyframe_simulated_time,
    keyframeEntities: JSON.parse(row.keyframe_entities_json),
    keyframeRelationships: JSON.parse(row.keyframe_relationships_json),
    events: JSON.parse(row.events_json),
    observations: JSON.parse(row.observations_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Inserts a NEW world snapshot. Throws (SQLite UNIQUE constraint) if `worldId` already exists — a caller updating an already-saved world uses `updateWorldSnapshot` instead, same "never silently overwrite" discipline as `WorldGraph.addEntity`/`WorldRegistry.save`. */
export function saveWorldSnapshot(db, s) {
  db.prepare(
    `INSERT INTO worlds (world_id, parent_world_id, seed, branch_id, parent_branch_id, forked_at_tick, specification_json, provenance_json, keyframe_tick, keyframe_simulated_time, keyframe_entities_json, keyframe_relationships_json, events_json, observations_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    s.worldId, s.parentWorldId ?? null, s.seed, s.branchId, s.parentBranchId ?? null, s.forkedAtTick ?? null,
    JSON.stringify(s.specification), s.provenance ? JSON.stringify(s.provenance) : null,
    s.keyframeTick, s.keyframeSimulatedTime, JSON.stringify(s.keyframeEntities), JSON.stringify(s.keyframeRelationships),
    JSON.stringify(s.events ?? []), JSON.stringify(s.observations ?? []),
    s.createdAt, Date.now(),
  );
  return getWorldSnapshot(db, s.worldId);
}

/** Replaces an already-saved world's snapshot in place (e.g. re-saving after further ticks/interventions) — same worldId, fresh state. */
export function updateWorldSnapshot(db, s) {
  const existing = getWorldSnapshot(db, s.worldId);
  if (!existing) return null;
  db.prepare(
    `UPDATE worlds SET branch_id = ?, parent_branch_id = ?, forked_at_tick = ?, keyframe_tick = ?, keyframe_simulated_time = ?, keyframe_entities_json = ?, keyframe_relationships_json = ?, events_json = ?, observations_json = ?, updated_at = ?
     WHERE world_id = ?`,
  ).run(
    s.branchId, s.parentBranchId ?? null, s.forkedAtTick ?? null, s.keyframeTick, s.keyframeSimulatedTime,
    JSON.stringify(s.keyframeEntities), JSON.stringify(s.keyframeRelationships),
    JSON.stringify(s.events ?? []), JSON.stringify(s.observations ?? []), Date.now(), s.worldId,
  );
  return getWorldSnapshot(db, s.worldId);
}

export function getWorldSnapshot(db, worldId) {
  return toWorldSnapshotRow(db.prepare('SELECT * FROM worlds WHERE world_id = ?').get(worldId));
}

/** Every saved world, newest first — metadata only (no keyframe/journal payload) for a cheap listing; fetch a full snapshot via `getWorldSnapshot`. */
export function listWorldSnapshots(db, limit = 100) {
  const rows = db.prepare('SELECT world_id, parent_world_id, seed, branch_id, parent_branch_id, forked_at_tick, specification_json, provenance_json, created_at, updated_at FROM worlds ORDER BY updated_at DESC LIMIT ?').all(limit);
  return rows.map((row) => ({
    worldId: row.world_id,
    parentWorldId: row.parent_world_id ?? undefined,
    seed: row.seed,
    branchId: row.branch_id,
    parentBranchId: row.parent_branch_id ?? null,
    forkedAtTick: row.forked_at_tick ?? null,
    specification: JSON.parse(row.specification_json),
    provenance: row.provenance_json ? JSON.parse(row.provenance_json) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
