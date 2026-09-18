/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * QPU ORCHESTRATOR — the Fallback Gate between a real quantum processor and the local model.
 *
 * Every job goes through ONE bounded FIFO queue and executes strictly one at a time. For each job:
 *   1. no cloud provider configured            -> local simulator, fallbackReason NO_CLOUD_PROVIDER
 *   2. cloud provider throws NO_API_KEY         -> local simulator, fallbackReason NO_API_KEY
 *   3. cloud provider fails (NETWORK / PARSE)   -> local simulator, fallbackReason CLOUD_UNAVAILABLE
 *   4. cloud provider succeeds                  -> its HARDWARE_MEASUREMENT, no fallback
 * The label on the result always says which one happened; a fallback is never dressed up as a
 * measurement. Local simulation may be delegated to a `ComputeSink` (e.g. a worker-thread pool)
 * through the `quantumSimulate` kernel so the event loop is never blocked by a 16-qubit run.
 *
 * Deterministic: time comes from the injected Clock, job ids from a monotonic counter, retries wait
 * on the injected Sleeper. No Math.random, no Date.now.
 */
import type { Clock } from '../../knowledge/evidenceTypes.js';
import { sha256hex, stableStringify } from '../../knowledge/EvidenceLedger.js';
import { withRetry, type Sleeper, type RetryPolicy } from '../../knowledge/ingestion/netUtils.js';
import {
  DeterministicQuantumSimulator, QuantumError, circuitFromQasm, isQuantumError,
  type QasmCircuit, type QuantumProvider, type QuantumResult,
} from './QuantumProviderAdapter.js';

export type FallbackReason = 'NO_CLOUD_PROVIDER' | 'NO_API_KEY' | 'CLOUD_UNAVAILABLE';

export interface QuantumJobOutcome {
  readonly jobId: string;
  readonly result: QuantumResult;
  readonly fallbackReason?: FallbackReason;
  /** Provider invocations made for this job (cloud attempts at this level + the local run, if any). Transport-level retries inside the cloud adapter are not counted here. */
  readonly attempts: number;
  /** 0 = ran immediately; k = k jobs were ahead of it when it was submitted. */
  readonly queuePosition: number;
  readonly submittedAt: number;
  readonly finishedAt: number;
}

export interface ComputeSubmitResult { readonly ok: boolean; readonly value?: unknown; readonly error?: string; }
/** Anything that can run a named kernel with a JSON payload — the GenesisNativeOrchestrator's `submit` fits this shape. */
export interface ComputeSink { submit(kind: string, payload: unknown): Promise<ComputeSubmitResult> | ComputeSubmitResult; }
export interface QuantumLedgerSink {
  append(entry: { readonly kind: 'quantum-job'; readonly jobId: string; readonly ok: boolean; readonly executedOn?: string; readonly label?: string; readonly fallbackReason?: FallbackReason; readonly circuitFingerprint: string; readonly at: number }): void;
}
export interface QpuOrchestratorOptions { readonly retry?: RetryPolicy; readonly maxQueue?: number; }
export interface QpuOrchestratorSinks { readonly ledger?: QuantumLedgerSink; readonly compute?: ComputeSink; }

export const QUANTUM_SIMULATE_KIND = 'quantumSimulate';
/** One provider-level attempt by default: transport-level backoff already lives inside CloudQpuRestAdapter. */
const SINGLE_ATTEMPT: RetryPolicy = { attempts: 1, baseMs: 0, maxMs: 0 };
const DEFAULT_MAX_QUEUE = 32;

interface Job {
  readonly jobId: string; readonly circuit: QasmCircuit; readonly shots: number; readonly seed: number;
  readonly submittedAt: number; readonly queuePosition: number;
  readonly resolve: (o: QuantumJobOutcome) => void; readonly reject: (e: unknown) => void;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Payload validation + simulation, in one function that a kernel registry (worker thread) can register under `quantumSimulate`. */
export function quantumSimulateKernel(payload: unknown): QuantumResult {
  if (!isRecord(payload)) throw new QuantumError('BAD_PAYLOAD', 'expected { qasm, shots, seed }');
  const { qasm, shots, seed } = payload;
  if (typeof qasm !== 'string') throw new QuantumError('BAD_PAYLOAD', 'qasm must be a string');
  if (typeof shots !== 'number' || !Number.isInteger(shots)) throw new QuantumError('BAD_PAYLOAD', 'shots must be an integer');
  if (typeof seed !== 'number' || !Number.isSafeInteger(seed)) throw new QuantumError('BAD_PAYLOAD', 'seed must be an integer');
  const maxShots = typeof payload.maxShots === 'number' && Number.isInteger(payload.maxShots) ? payload.maxShots : undefined;
  return new DeterministicQuantumSimulator(maxShots !== undefined ? { maxShots } : {}).simulate(circuitFromQasm(qasm), shots, seed);
}

function asQuantumResult(v: unknown): QuantumResult {
  if (!isRecord(v) || !isRecord(v.counts) || typeof v.shots !== 'number' || typeof v.fingerprint !== 'string' || v.executedOn !== 'LOCAL_SIMULATOR' || v.label !== 'MODEL_ESTIMATE' || typeof v.providerId !== 'string') {
    throw new QuantumError('BAD_PAYLOAD', 'compute sink returned something that is not a local QuantumResult');
  }
  return v as unknown as QuantumResult;
}

export class QpuOrchestrator {
  private readonly queue: Job[] = [];
  private running = false;
  private seq = 0;
  private readonly retry: RetryPolicy;
  private readonly maxQueue: number;
  constructor(
    private readonly clock: Clock,
    private readonly simulator: DeterministicQuantumSimulator,
    private readonly cloud: QuantumProvider | null,
    private readonly sleeper: Sleeper,
    opts: QpuOrchestratorOptions = {},
    private readonly sinks: QpuOrchestratorSinks = {},
  ) {
    this.retry = opts.retry ?? SINGLE_ATTEMPT;
    this.maxQueue = Math.max(1, Math.floor(opts.maxQueue ?? DEFAULT_MAX_QUEUE));
  }

  /** Jobs waiting or running right now. */
  get pending(): number { return this.queue.length + (this.running ? 1 : 0); }
  get hasCloudProvider(): boolean { return this.cloud !== null; }

  submit(circuit: QasmCircuit, shots: number, seed: number): Promise<QuantumJobOutcome> {
    if (this.pending >= this.maxQueue) return Promise.reject(new QuantumError('QUEUE_FULL', `${this.pending} job(s) pending, max ${this.maxQueue}`));
    const submittedAt = this.clock.now();
    const jobId = 'QJ-' + sha256hex(stableStringify({ circuit: circuit.fingerprint, shots, seed, seq: this.seq++ })).slice(0, 16);
    return new Promise<QuantumJobOutcome>((resolve, reject) => {
      this.queue.push({ jobId, circuit, shots, seed, submittedAt, queuePosition: this.pending, resolve, reject });
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const job = this.queue.shift();
        if (!job) break;
        try { job.resolve(await this.execute(job)); } catch (e) { job.reject(e); }
      }
    } finally { this.running = false; }
  }

  private async execute(job: Job): Promise<QuantumJobOutcome> {
    let attempts = 0;
    let fallbackReason: FallbackReason | undefined;
    let result: QuantumResult | null = null;
    if (this.cloud === null) fallbackReason = 'NO_CLOUD_PROVIDER';
    else {
      const cloud = this.cloud;
      try {
        result = await withRetry(() => { attempts++; return cloud.run(job.circuit, job.shots, job.seed); }, this.retry, this.sleeper, (e) => isQuantumError(e, 'NETWORK'));
      } catch (e) {
        if (isQuantumError(e, 'NO_API_KEY')) fallbackReason = 'NO_API_KEY';
        else if (isQuantumError(e, 'NETWORK') || isQuantumError(e, 'PARSE')) fallbackReason = 'CLOUD_UNAVAILABLE';
        else { this.ledger(job, false); throw e; } // a circuit/shots error is the caller's problem, not a reason to fall back
      }
    }
    if (result === null) {
      attempts++;
      try { result = await this.runLocal(job); } catch (e) { this.ledger(job, false); throw e; }
    }
    this.ledger(job, true, result, fallbackReason);
    return Object.freeze({
      jobId: job.jobId, result, ...(fallbackReason ? { fallbackReason } : {}), attempts,
      queuePosition: job.queuePosition, submittedAt: job.submittedAt, finishedAt: this.clock.now(),
    });
  }

  private async runLocal(job: Job): Promise<QuantumResult> {
    const compute = this.sinks.compute;
    if (!compute) return this.simulator.run(job.circuit, job.shots, job.seed);
    const r = await compute.submit(QUANTUM_SIMULATE_KIND, { qasm: job.circuit.qasm, shots: job.shots, seed: job.seed, maxShots: this.simulator.maxShots });
    if (!r.ok) throw new QuantumError('BAD_PAYLOAD', r.error ?? 'compute sink failed');
    return asQuantumResult(r.value);
  }

  private ledger(job: Job, ok: boolean, result?: QuantumResult, fallbackReason?: FallbackReason): void {
    this.sinks.ledger?.append({
      kind: 'quantum-job', jobId: job.jobId, ok, ...(result ? { executedOn: result.executedOn, label: result.label } : {}),
      ...(fallbackReason ? { fallbackReason } : {}), circuitFingerprint: job.circuit.fingerprint, at: this.clock.now(),
    });
  }
}
