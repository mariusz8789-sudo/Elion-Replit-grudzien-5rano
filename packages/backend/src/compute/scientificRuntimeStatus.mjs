/** Effective scientific runtime status for the main service.
 *
 * Local tool detection alone cannot describe the production topology: heavy
 * engines intentionally live in private workers. A worker is AVAILABLE here
 * only when (1) its current /health advertises the capability and configured
 * auth, and (2) the canonical persistent DB contains a successful REMOTE_EXECUTION
 * ScienceRun for that capability. Service liveness or an import test alone is
 * therefore never promoted to AVAILABLE.
 */
import { getCapabilityContract, listRemoteCapabilities, WORKER_CONTRACT_VERSION } from './scientificCapabilityContract.mjs';
import { resolveWorkerConfig } from './remoteScientificWorkerClient.mjs';

function latestRemoteProofs(db) {
  if (!db) return new Map();
  const rows = db.prepare("SELECT capability, engine, engine_version, provenance_json, created_at FROM science_runs WHERE status = 'ok' ORDER BY created_at DESC").all();
  const proofs = new Map();
  for (const row of rows) {
    if (proofs.has(row.capability)) continue;
    let provenance;
    try { provenance = JSON.parse(row.provenance_json ?? '{}'); } catch { continue; }
    if (provenance?.execution?.mode !== 'REMOTE_EXECUTION') continue;
    proofs.set(row.capability, {
      scienceRunCreatedAt: row.created_at,
      engine: row.engine,
      engineVersion: row.engine_version ?? null,
      workerGroup: provenance.execution.workerGroup ?? null,
      outputFingerprint: provenance.execution.outputFingerprint ?? null,
    });
  }
  return proofs;
}

async function readWorkerHealth(group, entry, fetchImpl, timeoutMs) {
  if (!entry?.requested || !entry.url) return { online: false, error: entry?.error ?? 'WORKER_URL_MISSING', capabilities: [] };
  const controller = new globalThis.AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${entry.url}/health`, { signal: controller.signal, redirect: 'error' });
    if (!response.ok) return { online: false, error: `HTTP_${response.status}`, capabilities: [] };
    const body = await response.json();
    const valid = body?.ok === true && body.workerGroup === group && body.contractVersion === WORKER_CONTRACT_VERSION
      && body.executionAuth === 'configured' && Array.isArray(body.executableCapabilities);
    return valid
      ? { online: true, error: null, capabilities: body.executableCapabilities }
      : { online: false, error: 'INVALID_WORKER_HEALTH', capabilities: [] };
  } catch (error) {
    return { online: false, error: error?.name === 'AbortError' ? 'WORKER_TIMEOUT' : 'WORKER_UNREACHABLE', capabilities: [] };
  } finally {
    clearTimeout(timer);
  }
}

export async function buildScientificRuntimeStatus(db, { env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 2500 } = {}) {
  const config = resolveWorkerConfig(env);
  const proofs = latestRemoteProofs(db);
  const groups = {};
  await Promise.all(Object.entries(config.groups).map(async ([group, entry]) => {
    groups[group] = await readWorkerHealth(group, entry, fetchImpl, timeoutMs);
  }));
  const engines = listRemoteCapabilities().map((capabilityId) => {
    const contract = getCapabilityContract(capabilityId);
    const worker = groups[contract.workerGroup] ?? { online: false, error: 'WORKER_GROUP_UNKNOWN', capabilities: [] };
    const proof = proofs.get(capabilityId) ?? null;
    let status = 'BLOCKED_BY_RUNTIME';
    let reason = worker.error;
    if (worker.online && !worker.capabilities.includes(capabilityId)) reason = 'CAPABILITY_NOT_ADVERTISED';
    else if (worker.online && !proof) { status = 'PENDING_REAL_EXECUTION'; reason = 'NO_CANONICAL_REMOTE_SCIENCE_RUN'; }
    else if (worker.online && proof && proof.workerGroup === contract.workerGroup) { status = 'AVAILABLE'; reason = null; }
    return {
      id: contract.toolId,
      capabilityId,
      workerGroup: contract.workerGroup,
      status,
      reason,
      version: proof?.engineVersion ?? null,
      lastRealExecutionAt: proof?.scienceRunCreatedAt ?? null,
    };
  });
  return { engines, groups: Object.fromEntries(Object.entries(groups).map(([group, value]) => [group, { online: value.online, error: value.error }])) };
}
