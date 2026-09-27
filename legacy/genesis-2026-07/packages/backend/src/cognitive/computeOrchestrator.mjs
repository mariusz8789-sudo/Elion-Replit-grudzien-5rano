/**
 * Compute Orchestrator (Priority 11 — cognitive ceiling).
 *
 * Provider-neutral compute placement. Local execution first. Backends declare their
 * kind, capabilities, and availability HONESTLY — unavailable hardware (GPU/HPC/
 * quantum in this environment) is never faked; a task that requires it is
 * BLOCKED_BY_RESOURCES. LOCAL_CPU capabilities come from the REAL Genesis toolchain
 * (rdkit/pyscf/openmm/vina/biopython/admet), so placement reflects what can actually
 * run. Every placement is a traceable decision with budget estimate, actual
 * accounting, timeout/retry policy, failure classification, and replay reference.
 */
import * as store from '../store.mjs';

export const COMPUTE_BACKEND = Object.freeze({
  LOCAL_CPU: 'LOCAL_CPU', LOCAL_GPU: 'LOCAL_GPU', REMOTE_GPU: 'REMOTE_GPU', HPC: 'HPC', QUANTUM_BACKEND: 'QUANTUM_BACKEND',
});
export const FAILURE_CLASS = Object.freeze({
  SUCCESS: 'SUCCESS', TIMEOUT: 'TIMEOUT', ENGINE_ERROR: 'ENGINE_ERROR', OOM: 'OOM',
  BLOCKED_BY_RESOURCES: 'BLOCKED_BY_RESOURCES', CAPABILITY_GAP: 'CAPABILITY_GAP',
});
export const PLACEMENT_STATUS = Object.freeze({ PLACED: 'placed', BLOCKED: 'blocked', COMPLETED: 'completed', FAILED: 'failed' });

const registry = new Map();
export function resetBackends() { registry.clear(); }
export function registerBackend(b) {
  if (!b?.id) throw new Error('backend.id required');
  registry.set(b.id, b);
  return b.id;
}
export function listBackends() {
  return [...registry.values()].map((b) => ({ id: b.id, kind: b.kind, available: safe(b), capabilities: b.capabilities ?? [] }));
}
function safe(b) { try { return Boolean(b.available()); } catch { return false; } }

/**
 * Register default backends. LOCAL_CPU is available and its engine capabilities are
 * resolved from the real toolchain via `resolveCapability` (injectable). GPU/HPC/
 * quantum backends are declared but honestly unavailable in this environment.
 */
export function registerDefaultBackends({ resolveCapability = () => false, cpuAvailable = true } = {}) {
  const engineCaps = ['molecular-descriptors', 'admet-estimation', 'toxicity-risk-estimation', 'molecular-docking', 'quantum-chemistry', 'molecular-dynamics']
    .filter((c) => { try { return Boolean(resolveCapability(c)); } catch { return false; } });
  registerBackend({ id: COMPUTE_BACKEND.LOCAL_CPU, kind: 'cpu', capabilities: ['cpu', ...engineCaps], available: () => cpuAvailable });
  registerBackend({ id: COMPUTE_BACKEND.LOCAL_GPU, kind: 'gpu', capabilities: ['gpu'], available: () => false }); // no CUDA device in this env
  registerBackend({ id: COMPUTE_BACKEND.REMOTE_GPU, kind: 'gpu', capabilities: ['gpu'], available: () => false });
  registerBackend({ id: COMPUTE_BACKEND.HPC, kind: 'hpc', capabilities: ['cpu', 'gpu', 'mpi'], available: () => false });
  registerBackend({ id: COMPUTE_BACKEND.QUANTUM_BACKEND, kind: 'quantum', capabilities: ['qpu'], available: () => false });
}

/** Deterministic budget estimate from requirements. */
export function estimateBudget(requirements = {}) {
  const base = Number(requirements.estimatedMs) || 1000;
  return { estimatedMs: base, memoryMb: Number(requirements.memoryMb) || 512 };
}

/**
 * Place a task on a backend. requirements: { needs: ['cpu'|'gpu'|'qpu'...], engine?,
 * estimatedMs?, memoryMb? }. Returns a persisted, traceable placement. If no
 * available backend satisfies needs → BLOCKED_BY_RESOURCES; if an available backend
 * exists but lacks the required engine capability → CAPABILITY_GAP. Never fakes.
 */
export function placeTask(db, { missionId = null, taskId = null, requirements = {}, retryOf = null, attempt = 1 }) {
  const needs = requirements.needs ?? ['cpu'];
  const budget = estimateBudget(requirements);
  const backends = [...registry.values()];
  const availableForNeeds = backends.filter((b) => safe(b) && needs.every((n) => (b.capabilities ?? []).includes(n)));
  if (availableForNeeds.length === 0) {
    const declaredButUnavailable = backends.some((b) => needs.every((n) => (b.capabilities ?? []).includes(n)));
    const failureClass = declaredButUnavailable ? FAILURE_CLASS.BLOCKED_BY_RESOURCES : FAILURE_CLASS.CAPABILITY_GAP;
    const reason = declaredButUnavailable
      ? `no AVAILABLE backend satisfies needs [${needs.join(',')}] (hardware present in model but unavailable here)`
      : `no backend declares needs [${needs.join(',')}]`;
    return store.saveComputePlacement(db, { missionId, taskId, backendId: null, requirements, estimatedMs: budget.estimatedMs, status: PLACEMENT_STATUS.BLOCKED, failureClass, reason, retryOf, attempt });
  }
  // Prefer LOCAL first (lowest cost), then declaration order.
  availableForNeeds.sort((a, b) => rank(a.id) - rank(b.id));
  const chosen = availableForNeeds[0];
  // If a specific engine is required, the chosen backend must actually have it.
  if (requirements.engine && !(chosen.capabilities ?? []).includes(requirements.engine)) {
    return store.saveComputePlacement(db, { missionId, taskId, backendId: chosen.id, requirements, estimatedMs: budget.estimatedMs, status: PLACEMENT_STATUS.BLOCKED, failureClass: FAILURE_CLASS.CAPABILITY_GAP, reason: `backend ${chosen.id} lacks engine capability ${requirements.engine}`, retryOf, attempt });
  }
  return store.saveComputePlacement(db, { missionId, taskId, backendId: chosen.id, requirements, estimatedMs: budget.estimatedMs, status: PLACEMENT_STATUS.PLACED, reason: `placed on ${chosen.id} (needs ${needs.join(',')})`, retryOf, attempt });
}
function rank(id) { return id === COMPUTE_BACKEND.LOCAL_CPU ? 0 : id === COMPUTE_BACKEND.LOCAL_GPU ? 1 : 2; }

/** Record actual compute usage + a failure classification for a placement. */
export function accountActual(db, placementId, { actualMs, failureClass = FAILURE_CLASS.SUCCESS, reason = null }) {
  const status = failureClass === FAILURE_CLASS.SUCCESS ? PLACEMENT_STATUS.COMPLETED : PLACEMENT_STATUS.FAILED;
  return store.updateComputePlacement(db, placementId, { actualMs, status, failureClass, reason });
}

/** Deterministic retry policy from a failure class. TIMEOUT/OOM are retryable
 * (bounded); ENGINE_ERROR / BLOCKED_BY_RESOURCES / CAPABILITY_GAP are not. */
export function retryPolicy(placement, { maxAttempts = 3 } = {}) {
  const fc = placement.failureClass;
  const retryable = fc === FAILURE_CLASS.TIMEOUT || fc === FAILURE_CLASS.OOM;
  if (!retryable) return { retry: false, reason: `${fc} is not retryable` };
  if ((placement.attempt ?? 1) >= maxAttempts) return { retry: false, reason: `max attempts (${maxAttempts}) reached` };
  const nextBudget = (placement.estimatedMs ?? 1000) * 2; // back off with a larger budget
  return { retry: true, reason: `retry after ${fc} with larger budget`, nextAttempt: (placement.attempt ?? 1) + 1, nextBudgetMs: nextBudget };
}
