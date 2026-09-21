/* global AbortSignal */
/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * GENESIS HYBRID QUANTUM COMPUTING BRIDGE — the server side of the Science Chat command
 * `/quantum bell-state | ghz <n> | superposition <n> | run <qasm>`.
 *
 * Runs the QpuOrchestrator (packages/core/src/engine/quantum, bundled into compute/quantum-core.mjs)
 * with the Fallback Gate: a real cloud QPU is used ONLY when both `QPU_API_URL` and `QPU_API_KEY`
 * are set in the environment; otherwise (or when the cloud is unreachable) the exact local
 * statevector simulator answers, and the response says so (`executedOn`, `label`, `fallbackReason`).
 * A local result is a MODEL_ESTIMATE — what an ideal device would show — never a measurement.
 *
 * Local simulation runs in a worker thread (compute/quantum-worker.mjs) through a tiny ComputeSink:
 * one worker, reused, restarted after an exit or a timeout (20 s per job), so a 16-qubit run never
 * blocks the event loop. Secrets: the key is read through an env KeyProvider, never logged, never
 * echoed by `describeQuantum()`.
 */
import { fileURLToPath } from 'node:url';
import {
  DeterministicQuantumSimulator, CloudQpuRestAdapter, QpuOrchestrator, circuitFromQasm, presetCircuit, isPresetId, PRESET_IDS,
  isQuantumError, MAX_QUBITS, DEFAULT_MAX_SHOTS, envKeyProvider, realSleeper, HttpError,
  GenesisNativeOrchestrator, SystemResourceBridge,
} from './compute/quantum-core.mjs';

const WORKER_PATH = fileURLToPath(new URL('./compute/quantum-worker.mjs', import.meta.url));
const JOB_TIMEOUT_MS = 20_000;
const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_SHOTS = 1024;
const MAX_QUEUE = 16;
export const QPU_ENV = Object.freeze({ URL: 'QPU_API_URL', KEY: 'QPU_API_KEY' });
const DISCLAIMER = 'LOCAL_SIMULATOR results are MODEL_ESTIMATEs of an ideal, noiseless circuit (statevector + seeded sampling), not measurements of any physical device. Only executedOn=CLOUD_QPU with label=HARDWARE_MEASUREMENT comes from real hardware. Nothing here feeds the Winner Gate.';

/**
 * ComputeSink over the Native System Orchestrator (packages/core/src/engine/native) in `threads` mode:
 * `submit(kind, payload)` -> `{ ok, value?, error? }`. Local quantum simulations therefore run in the
 * orchestrator's worker-thread pool (concurrency derived from the machine's cores and load via
 * SystemResourceBridge, bounded queue, fault isolation, dead-worker recovery) and never block the
 * HTTP event loop. Each job additionally carries a hard timeout: on expiry the whole pool is torn
 * down and rebuilt on the next job, so a runaway circuit cannot pin a thread forever.
 */
export class WorkerComputeSink {
  constructor({ workerPath = WORKER_PATH, timeoutMs = JOB_TIMEOUT_MS, maxQueue = MAX_QUEUE } = {}) {
    this.workerPath = workerPath;
    this.timeoutMs = timeoutMs;
    this.maxQueue = maxQueue;
    this.orchestrator = null;
    this.restarts = 0;
  }
  /** The live orchestrator, or null when the pool is down (never started, timed out, or shut down). */
  get worker() { return this.orchestrator; }
  ensureOrchestrator() {
    if (this.orchestrator) return this.orchestrator;
    const clock = { now: () => Date.now() };
    this.orchestrator = new GenesisNativeOrchestrator(clock, new SystemResourceBridge(clock), { mode: 'threads', workerScript: this.workerPath, maxQueue: this.maxQueue });
    return this.orchestrator;
  }
  async submit(kind, payload) {
    const o = this.ensureOrchestrator();
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ ok: false, error: `WORKER_TIMEOUT after ${this.timeoutMs} ms` }), this.timeoutMs); });
    const outcome = await Promise.race([o.submit(kind, payload).then((r) => (r.ok ? { ok: true, value: r.value } : { ok: false, error: typeof r.error === 'string' ? r.error : 'WORKER_ERROR' })), timeout]);
    clearTimeout(timer);
    if (!outcome.ok && /^WORKER_TIMEOUT/.test(outcome.error) && this.orchestrator === o) {
      this.orchestrator = null; this.restarts++;
      void o.shutdown();
    }
    return outcome;
  }
  async shutdown() {
    const o = this.orchestrator;
    this.orchestrator = null;
    if (o) await o.shutdown();
  }
}

/** HttpTransport for the cloud adapter: POST with body, 429/5xx thrown as HttpError so withRetry backs off. */
class FetchTransport {
  constructor(fetchImpl) { this.fetchImpl = fetchImpl; }
  async fetch(url, opts) {
    const res = await this.fetchImpl(url, { method: opts?.method ?? 'GET', headers: opts?.headers ?? {}, ...(opts?.body !== undefined ? { body: opts.body } : {}), redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const body = await res.text();
    if (res.status === 429 || res.status >= 500) throw new HttpError(res.status);
    return { status: res.status, headers: {}, body: body.slice(0, 2_000_000) };
  }
}

const cloudUrlOf = (env) => {
  const raw = typeof env[QPU_ENV.URL] === 'string' ? env[QPU_ENV.URL].trim() : '';
  if (!raw) return null;
  try { const u = new URL(raw); return u.protocol === 'https:' || u.protocol === 'http:' ? raw : null; } catch { return null; }
};
export const isCloudConfigured = (env = process.env) => cloudUrlOf(env) !== null && envKeyProvider(env, QPU_ENV.KEY).getKey() !== null;

function buildOrchestrator(deps) {
  const env = deps.env ?? process.env;
  const clock = deps.clock ?? { now: () => Date.now() };
  const sleeper = deps.sleeper ?? realSleeper;
  const url = cloudUrlOf(env);
  const keys = envKeyProvider(env, QPU_ENV.KEY);
  const cloud = url && keys.getKey() ? new CloudQpuRestAdapter(deps.transport ?? new FetchTransport(deps.fetchImpl ?? globalThis.fetch), keys, sleeper, url, 'cloud-qpu') : null;
  const compute = deps.compute === null ? undefined : (deps.compute ?? defaultSink());
  return new QpuOrchestrator(clock, new DeterministicQuantumSimulator({ maxShots: DEFAULT_MAX_SHOTS }), cloud, sleeper, { maxQueue: MAX_QUEUE }, { ...(compute ? { compute } : {}), ...(deps.ledger ? { ledger: deps.ledger } : {}) });
}

/** One process-wide worker and one process-wide orchestrator (a single FIFO queue for the whole server). */
let sink = null;
let orchestrator = null;
const defaultSink = () => (sink ??= new WorkerComputeSink());
const orchestratorFor = (deps) => (Object.keys(deps).length === 0 ? (orchestrator ??= buildOrchestrator({})) : buildOrchestrator(deps));
/** Tests call this so `node --test` can exit promptly; the next request restarts the worker. */
export async function shutdownQuantumWorker() { const s = sink; sink = null; orchestrator = null; if (s) await s.shutdown(); }

const fail = (error, message, status = 400) => ({ ok: false, error, message, status });
const intIn = (v, min, max) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

export function buildCircuit(body) {
  if (typeof body.qasm === 'string') {
    try { return { circuit: circuitFromQasm(body.qasm), source: 'qasm' }; }
    catch (e) { return { error: fail('invalid_qasm', isQuantumError(e) ? e.message : 'unparseable circuit') }; }
  }
  if (body.qasm !== undefined) return { error: fail('invalid_qasm', 'qasm must be a string') };
  if (typeof body.preset !== 'string' || !isPresetId(body.preset)) return { error: fail('invalid_request', `preset must be one of ${PRESET_IDS.join(', ')} (or pass qasm)`) };
  if (body.qubits !== undefined && !intIn(body.qubits, 1, MAX_QUBITS)) return { error: fail('invalid_qubits', `qubits must be an integer between 1 and ${MAX_QUBITS}`) };
  try { return { circuit: presetCircuit(body.preset, body.qubits), source: 'preset:' + body.preset }; }
  catch (e) { return { error: fail('invalid_request', isQuantumError(e) ? e.message : 'cannot build preset') }; }
}

export async function runQuantum(body, deps = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('invalid_request', 'JSON object body expected');
  const shots = body.shots === undefined ? DEFAULT_SHOTS : body.shots;
  if (!intIn(shots, 1, DEFAULT_MAX_SHOTS)) return fail('invalid_shots', `shots must be an integer between 1 and ${DEFAULT_MAX_SHOTS}`);
  const seed = body.seed === undefined ? 1 : body.seed;
  if (typeof seed !== 'number' || !Number.isSafeInteger(seed)) return fail('invalid_seed', 'seed must be an integer');
  const built = buildCircuit(body);
  if (built.error) return built.error;
  const t0 = Date.now();
  let outcome;
  try { outcome = await orchestratorFor(deps).submit(built.circuit, shots, seed); }
  catch (e) {
    if (isQuantumError(e, 'QUEUE_FULL')) return fail('queue_full', e.message, 429);
    if (isQuantumError(e, 'BAD_PAYLOAD')) return fail('compute_unavailable', e.message, 503);
    return fail('invalid_request', isQuantumError(e) ? e.message : 'quantum job failed');
  }
  const r = outcome.result;
  return {
    ok: true,
    executedOn: r.executedOn,
    label: r.label,
    providerId: r.providerId,
    counts: r.counts,
    probabilities: r.probabilities ?? null,
    shots: r.shots,
    seed,
    qubits: built.circuit.qubits,
    qasm: built.circuit.qasm,
    circuitSource: built.source,
    fingerprint: r.fingerprint,
    circuitFingerprint: built.circuit.fingerprint,
    fallbackReason: outcome.fallbackReason ?? null,
    jobId: outcome.jobId,
    attempts: outcome.attempts,
    queuePosition: outcome.queuePosition,
    elapsedMs: Date.now() - t0,
    note: r.note ?? null,
    disclaimer: DISCLAIMER,
  };
}

export function describeQuantum(env = process.env) {
  return {
    ok: true,
    cloudConfigured: isCloudConfigured(env),
    maxQubits: MAX_QUBITS,
    maxShots: DEFAULT_MAX_SHOTS,
    defaultShots: DEFAULT_SHOTS,
    presets: [...PRESET_IDS],
    localExecution: 'worker-thread statevector simulator (MODEL_ESTIMATE)',
    disclaimer: DISCLAIMER,
  };
}
