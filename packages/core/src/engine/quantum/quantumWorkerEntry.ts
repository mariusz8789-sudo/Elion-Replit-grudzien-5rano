/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * worker_threads entry for the quantum bridge, bundled by `npm run compute:bundle:quantum-worker`
 * into packages/backend/src/compute/quantum-worker.mjs. Speaks the same message contract as the
 * native worker (`{type:'run', taskId, kind, payload}` -> `{type:'result', taskId, ok, value?, error?}`)
 * but is deliberately self-contained: it registers exactly one kernel, `quantumSimulate`, and does
 * not import the native orchestrator module.
 */
import { parentPort } from 'node:worker_threads';
import { quantumSimulateKernel, QUANTUM_SIMULATE_KIND } from './QpuOrchestrator.js';

export interface QuantumWorkerRequest { readonly type: 'run'; readonly taskId: string; readonly kind: string; readonly payload: unknown; }
export interface QuantumWorkerResult { readonly type: 'result'; readonly taskId: string; readonly ok: boolean; readonly value?: unknown; readonly error?: string; }

const KERNELS: Readonly<Record<string, (payload: unknown) => unknown>> = Object.freeze({ [QUANTUM_SIMULATE_KIND]: quantumSimulateKernel });

/** Pure request handler (exported so it can be unit-tested without a real worker). */
export function handleQuantumWorkerMessage(m: unknown): QuantumWorkerResult {
  const msg = m as Partial<QuantumWorkerRequest> | null;
  if (!msg || msg.type !== 'run' || typeof msg.taskId !== 'string' || typeof msg.kind !== 'string') {
    return { type: 'result', taskId: typeof msg?.taskId === 'string' ? msg.taskId : 'UNKNOWN', ok: false, error: 'BAD_REQUEST' };
  }
  const kernel = KERNELS[msg.kind];
  if (!kernel) return { type: 'result', taskId: msg.taskId, ok: false, error: 'UNKNOWN_KIND' };
  try { return { type: 'result', taskId: msg.taskId, ok: true, value: kernel(msg.payload) }; }
  catch (e) { return { type: 'result', taskId: msg.taskId, ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

if (parentPort) {
  const port = parentPort;
  port.on('message', (m: unknown) => { port.postMessage(handleQuantumWorkerMessage(m)); });
}
