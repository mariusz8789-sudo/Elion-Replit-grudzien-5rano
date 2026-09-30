/**
 * ENTITY-1 — SELF MODEL. One function that tells Genesis what it is and what it can do RIGHT NOW.
 *
 * It owns no data. Every field is read from the canonical source at call time:
 *
 *   identity            → genesisIdentity.mjs (the four fields nothing else can derive)
 *   engines             → campaign/toolchain.mjs (local reference case) merged with
 *                         compute/scientificRuntimeStatus.mjs (worker health + a persisted real run)
 *   missingCapabilities → compute/capabilities.mjs (capabilities with no adapter at all)
 *   knownModels         → the frozen validation gates + whether a reasoning model is configured
 *   failedGates         → sealed model evaluations in campaign/*.sealed.json + gate tamper watchdog
 *   dataAccessBlockers  → scientificIngestion.mjs (what the network actually answered since start)
 *   awaitingMeasurements→ campaign_events (lab requests that have no observation yet)
 *
 * The one rule this module exists for: CAPABILITY EXISTS and RUNTIME AVAILABLE NOW are two different
 * answers. An engine with an adapter whose runtime is down is "I have the OpenMM adapter, but its
 * runtime is unavailable now", never "I have no OpenMM" and never "OpenMM works". An engine is
 * available now only on evidence: its own reference case passed here, or a worker that is online
 * now has a persisted real run of it. Anything else is BLOCKED, with the reason it is blocked.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENESIS_IDENTITY, IDENTITY_REFERENCES } from './genesisIdentity.mjs';
import { listToolchain, TOOL_STATUS } from './campaign/toolchain.mjs';
import { listCapabilities, CAPABILITY_STATUS } from './compute/capabilities.mjs';
import { ingestionStatus } from './scientificIngestion.mjs';
import { watchGates } from './security/scientificIntegrity.mjs';
import { GLP1R_GATE_PATH } from './campaign/glp1rQsar.mjs';
import { GIPR_GATE_PATH } from './campaign/giprQsar.mjs';
import { LAB_EVENT } from './campaign/labClosedLoop.mjs';

export const SELF_MODEL_SCHEMA_VERSION = 1;

const CAMPAIGN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'campaign');
const NO_ADAPTER = new Set([
  CAPABILITY_STATUS.NOT_IMPLEMENTED,
  CAPABILITY_STATUS.EXTERNAL_ENGINE_REQUIRED,
  CAPABILITY_STATUS.MODEL_NOT_VALID_FOR_DOMAIN,
]);

/**
 * One engine as Genesis sees itself. `local` is a toolchain entry, `remote` a runtime-status entry;
 * either may be missing. Pure, so the two-axis rule can be tested on every combination.
 */
export function engineSelfView(local, remote) {
  const toolId = local?.toolId ?? remote?.id;
  const name = local?.engineName ?? toolId;
  const localAvailable = local?.status === TOOL_STATUS.AVAILABLE;
  const remoteAvailable = remote?.status === 'AVAILABLE';
  const runtimeAvailableNow = localAvailable || remoteAvailable;
  let blockedBy = null;
  if (!runtimeAvailableNow) {
    if (local?.status === TOOL_STATUS.VALIDATION_FAILED) blockedBy = 'REFERENCE_CASE_FAILED';
    else if (remote?.status === 'PENDING_REAL_EXECUTION') blockedBy = 'NO_REAL_REMOTE_RUN_YET';
    else blockedBy = local?.status ?? remote?.status ?? 'UNKNOWN';
  }
  const reason = runtimeAvailableNow ? null : (local?.reason ?? remote?.reason ?? null);
  return {
    toolId,
    engineName: name,
    capabilityId: local?.capabilityId ?? remote?.capabilityId ?? null,
    capabilityExists: true,
    runtimeAvailableNow,
    status: runtimeAvailableNow ? 'AVAILABLE' : 'BLOCKED',
    blockedBy,
    reason,
    proof: localAvailable
      ? { kind: 'LOCAL_REFERENCE_CASE', caseIds: local.provenance?.validationCaseIds ?? [], version: local.version ?? null }
      : remoteAvailable
        ? { kind: 'REMOTE_REAL_EXECUTION', workerGroup: remote.workerGroup ?? null, lastRealExecutionAt: remote.lastRealExecutionAt ?? null, version: remote.version ?? null }
        : null,
    localStatus: local?.status ?? null,
    remoteStatus: remote?.status ?? null,
    statement: runtimeAvailableNow
      ? `${name}: runtime działa teraz (${localAvailable ? 'przypadek referencyjny przeszedł tutaj' : 'worker online i zapisany realny przebieg'}).`
      : blockedBy === 'REFERENCE_CASE_FAILED'
        ? `Mam adapter ${name}, ale jego przypadek referencyjny nie przeszedł, więc teraz go nie używam.`
        : `Mam adapter ${name}, ale obecnie runtime jest niedostępny (${blockedBy}).`,
  };
}

function engines(toolchain, runtime) {
  const remoteById = new Map((runtime?.engines ?? []).map((engine) => [engine.id, engine]));
  const views = toolchain.map((tool) => engineSelfView(tool, remoteById.get(tool.toolId)));
  const known = new Set(toolchain.map((tool) => tool.toolId));
  for (const remote of runtime?.engines ?? []) if (!known.has(remote.id)) views.push(engineSelfView(null, remote));
  return views;
}

/** Sealed model evaluations whose arm did not meet its frozen gate. Read from the files, never restated. */
export function readSealedGateFailures(dir = CAMPAIGN_DIR) {
  const failures = [];
  let files;
  try { files = readdirSync(dir).filter((f) => f.endsWith('.sealed.json')).sort(); } catch { return failures; }
  for (const file of files) {
    let sealed;
    try { sealed = JSON.parse(readFileSync(path.join(dir, file), 'utf8')); } catch { continue; }
    if (!sealed?.arms || typeof sealed.arms !== 'object') continue;
    for (const [arm, result] of Object.entries(sealed.arms)) {
      if (result?.gateMet !== false) continue;
      failures.push({
        source: `campaign/${file}`,
        evaluationId: sealed.id ?? null,
        arm,
        gateRuleFingerprint: sealed.gate?.ruleFingerprint ?? null,
        reasons: Array.isArray(result.reasons) ? result.reasons : [],
        computedAt: sealed.computedAt ?? null,
      });
    }
  }
  return failures;
}

function frozenGates(paths) {
  return Object.entries(paths).map(([target, gatePath]) => {
    try {
      const gate = JSON.parse(readFileSync(gatePath, 'utf8'));
      return { target, ruleId: gate.ruleId ?? null, ruleFingerprint: gate.ruleFingerprint ?? null, frozenFor: gate.frozenFor ?? null };
    } catch {
      return { target, ruleId: null, ruleFingerprint: null, frozenFor: null };
    }
  });
}

/** Lab requests that are ready for an external lab and have no ingested observation yet (counts only). */
export function countAwaitingMeasurements(db) {
  if (!db) return { known: false, candidates: 0, campaigns: 0 };
  const rows = db.prepare('SELECT campaign_id, type, payload_json FROM campaign_events WHERE type IN (?, ?)')
    .all(LAB_EVENT.VALIDATION_REQUESTED, LAB_EVENT.OBSERVATION_INGESTED);
  const requested = new Set();
  const observed = new Set();
  for (const row of rows) {
    let payload;
    try { payload = JSON.parse(row.payload_json); } catch { continue; }
    const key = `${row.campaign_id}\u0000${payload?.candidateId}`;
    if (row.type === LAB_EVENT.OBSERVATION_INGESTED) observed.add(key);
    else if (payload?.status === 'READY_FOR_EXTERNAL_LAB_REVIEW') requested.add(key);
  }
  const waiting = [...requested].filter((key) => !observed.has(key));
  return { known: true, candidates: waiting.length, campaigns: new Set(waiting.map((key) => key.split('\u0000')[0])).size };
}

/**
 * Assembles the self model. Every source is injectable so tests can show the rule on real shapes;
 * the defaults are the canonical modules themselves, so production never reads a copy.
 */
export function buildSelfModel({
  db = null,
  environment = {},
  runtime = null,
  reasoningModel = { configured: false, model: null },
  toolchain = listToolchain(),
  capabilities = listCapabilities(),
  ingestion = ingestionStatus(),
  gatePaths = { GLP1R: GLP1R_GATE_PATH, GIPR: GIPR_GATE_PATH },
  sealedDir = CAMPAIGN_DIR,
  now = () => new Date(),
} = {}) {
  const engineViews = engines(toolchain, runtime);
  const tamper = watchGates(gatePaths);
  return {
    schemaVersion: SELF_MODEL_SCHEMA_VERSION,
    generatedAt: now().toISOString(),
    identity: GENESIS_IDENTITY,
    references: IDENTITY_REFERENCES,
    environment,
    engines: engineViews,
    availableEngines: engineViews.filter((e) => e.runtimeAvailableNow).map((e) => e.toolId),
    blockedEngines: engineViews.filter((e) => !e.runtimeAvailableNow).map((e) => ({ toolId: e.toolId, blockedBy: e.blockedBy })),
    knownModels: [
      {
        kind: 'REASONING_MODEL',
        status: reasoningModel.configured ? 'CONFIGURED' : 'BLOCKED_BY_PROVIDER_CONFIGURATION',
        providerId: reasoningModel.configured ? reasoningModel.providerId ?? null : null,
        model: reasoningModel.configured ? reasoningModel.model : null,
        note: 'Konfiguracja to nie dowód: odpowiedź modelu jest propozycją, nigdy wiedzą.',
      },
      ...frozenGates(gatePaths).map((gate) => ({ kind: 'PREDICTIVE_MODEL_GATE', ...gate })),
    ],
    failedGates: [
      ...tamper.map((event) => ({ source: 'security/scientificIntegrity.mjs', evaluationId: null, arm: null, gateRuleFingerprint: null, reasons: [`${event.code}: ${event.reason}`], computedAt: null, target: event.target })),
      ...readSealedGateFailures(sealedDir),
    ],
    missingCapabilities: capabilities
      .filter((c) => NO_ADAPTER.has(c.status))
      .map((c) => ({ id: c.id, label: c.label, status: c.status, requires: c.requires ?? null })),
    dataAccessBlockers: ingestion.sources.map((source) => ({
      source: source.source,
      status: source.lastResult ? source.lastResult.status : 'NOT_CHECKED_SINCE_START',
      pinnedFallbackIds: source.pinnedIds,
    })).filter((s) => s.status !== 'LIVE'),
    awaitingMeasurements: countAwaitingMeasurements(db),
  };
}
