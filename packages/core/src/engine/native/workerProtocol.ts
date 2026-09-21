/* Proprietary / All Rights Reserved - Genesis OS */
import type { MessagePort } from 'node:worker_threads';
import { lookupKernel, type KernelTable } from './nativeKernels.js';

/**
 * Worker message protocol (fixed; both sides validate):
 *   request  { type: 'run',    taskId, kind, payload }
 *   result   { type: 'result', taskId, ok, value?, error? }
 */
export interface WorkerRequest { readonly type: 'run'; readonly taskId: string; readonly kind: string; readonly payload: unknown; }
export interface WorkerResult { readonly type: 'result'; readonly taskId: string; readonly ok: boolean; readonly value?: unknown; readonly error?: string; }

const rec = (m: unknown): Record<string, unknown> | null => (typeof m === 'object' && m !== null ? (m as Record<string, unknown>) : null);
export const isWorkerRequest = (m: unknown): m is WorkerRequest => { const o = rec(m); return !!o && o.type === 'run' && typeof o.taskId === 'string' && typeof o.kind === 'string'; };
export const isWorkerResult = (m: unknown): m is WorkerResult => { const o = rec(m); return !!o && o.type === 'result' && typeof o.taskId === 'string' && typeof o.ok === 'boolean'; };
const isThenable = (v: unknown): v is PromiseLike<unknown> => typeof v === 'object' && v !== null && typeof (v as { then?: unknown }).then === 'function';
const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The subset of MessagePort the protocol needs; lets tests drive it with an in-process fake. */
export type ProtocolPort = Pick<MessagePort, 'on' | 'postMessage'>;

/**
 * Attach the request/result protocol to a port with the given kernel table.
 * `nativeWorkerEntry.ts` calls this with NATIVE_KERNELS; other modules (e.g. a quantum
 * simulator) build their own worker entry with `{ ...NATIVE_KERNELS, ...theirKernels }`.
 * Every request gets exactly one reply: BAD_REQUEST, UNKNOWN_KIND, the kernel's value,
 * the kernel's error message, or RESULT_NOT_CLONEABLE when the value cannot cross the port.
 */
export function attachWorkerProtocol(port: ProtocolPort, kernels: KernelTable): void {
  port.on('message', (m: unknown) => {
    const reply = (r: WorkerResult): void => {
      try { port.postMessage(r); }
      catch { port.postMessage({ type: 'result', taskId: r.taskId, ok: false, error: 'RESULT_NOT_CLONEABLE' } satisfies WorkerResult); }
    };
    if (!isWorkerRequest(m)) {
      const tid = rec(m)?.taskId;
      reply({ type: 'result', taskId: typeof tid === 'string' ? tid : 'UNKNOWN', ok: false, error: 'BAD_REQUEST' });
      return;
    }
    const kernel = lookupKernel(kernels, m.kind);
    if (!kernel) { reply({ type: 'result', taskId: m.taskId, ok: false, error: 'UNKNOWN_KIND' }); return; }
    let value: unknown;
    try { value = kernel(m.payload); }
    catch (e) { reply({ type: 'result', taskId: m.taskId, ok: false, error: errorText(e) }); return; }
    if (isThenable(value)) {
      value.then(v => reply({ type: 'result', taskId: m.taskId, ok: true, value: v }), e => reply({ type: 'result', taskId: m.taskId, ok: false, error: errorText(e) }));
      return;
    }
    reply({ type: 'result', taskId: m.taskId, ok: true, value });
  });
}
