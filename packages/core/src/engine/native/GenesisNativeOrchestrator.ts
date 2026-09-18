/* Proprietary / All Rights Reserved - Genesis OS */
import { Worker } from 'node:worker_threads';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';
import type { Clock } from '../../knowledge/evidenceTypes.js';
import { stableStringify, sha256hex } from '../../knowledge/EvidenceLedger.js';
import { SystemResourceBridge } from './SystemResourceBridge.js';
import { NATIVE_KERNELS, lookupKernel, type KernelTable } from './nativeKernels.js';
import { isWorkerResult, type WorkerRequest } from './workerProtocol.js';

export interface OrchestratorOptions {
  /** 'inline' (default) runs kernels on the caller's event loop; 'threads' runs them in a worker_threads pool. */
  readonly mode?: 'threads' | 'inline';
  /** Backpressure bound on queued + active tasks (default 1024). */
  readonly maxQueue?: number;
  /** Absolute path of the worker script (threads mode). Defaults to ./nativeWorkerEntry.js beside this module. */
  readonly workerScript?: string;
  /** Exact-match allow-list for `streamSubprocess` argv[0]; defaults to [process.execPath]. */
  readonly allowedExecutables?: readonly string[];
  /** Extra kernels merged over NATIVE_KERNELS for inline mode (in threads mode the worker script owns its table). */
  readonly kernels?: KernelTable;
}
export interface TaskOutcome {
  readonly taskId: string; readonly kind: string; readonly ok: boolean; readonly value?: unknown;
  /** Stable machine-readable code or the kernel's error message. */
  readonly error?: string;
  /** Free-text diagnostics (e.g. the worker's uncaught exception message); never used for control flow. */
  readonly detail?: string;
}
export interface ReasoningSink { push(outcome: TaskOutcome): void; }
export interface LedgerSink { append(entry: { readonly kind: string; readonly taskId: string; readonly ok: boolean; readonly at: number }): void; }
export interface SubprocessOptions {
  /** Kill the child (SIGKILL) after this many milliseconds; result.timedOut becomes true. */
  readonly timeoutMs?: number;
  /** Per-stream line cap (default 10 000). Exceeding it kills the child and sets result.truncated. */
  readonly maxLines?: number;
  /** Per-stream byte cap (default 1 MiB). Exceeding it kills the child and sets result.truncated. */
  readonly maxBytes?: number;
}
export interface SubprocessResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  /** Non-blank stdout lines. */
  readonly lines: readonly string[];
  /** Non-blank stderr lines, captured separately. */
  readonly stderrLines: readonly string[];
  readonly truncated: boolean;
  readonly timedOut: boolean;
  /** Set when the child could not be spawned or the executable was rejected. */
  readonly error?: string;
}
interface Receipt { readonly taskId: string; readonly kind: string; readonly payload: unknown; }
interface PendingTask { readonly receipt: Receipt; readonly resolve: (o: TaskOutcome) => void; }
interface WorkerSlot { readonly worker: Worker; busy: string | null; busyKind: string | null; }

const DEFAULT_MAX_QUEUE = 1024;
const DEFAULT_MAX_LINES = 10_000;
const DEFAULT_MAX_BYTES = 1024 * 1024;
const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Bounded, chunk-boundary-safe line collector for one stdio stream. */
class LineCollector {
  readonly lines: string[] = [];
  truncated = false;
  private carry = '';
  private bytes = 0;
  private readonly decoder = new StringDecoder('utf8');
  constructor(private readonly maxLines: number, private readonly maxBytes: number) {}
  /** Returns true once a cap is exceeded (further input is discarded). */
  push(chunk: Buffer): boolean {
    if (this.truncated) return true;
    this.bytes += chunk.length;
    const parts = (this.carry + this.decoder.write(chunk)).split('\n');
    this.carry = parts.pop() ?? '';
    for (const l of parts) if (l.trim() && this.lines.length < this.maxLines) this.lines.push(l);
    if (this.bytes > this.maxBytes || this.lines.length >= this.maxLines) { this.truncated = true; this.carry = ''; }
    return this.truncated;
  }
  flush(): void {
    const tail = this.carry + this.decoder.end();
    this.carry = '';
    if (!this.truncated && tail.trim() && this.lines.length < this.maxLines) this.lines.push(tail);
  }
}

/**
 * Native orchestrator: worker-thread pool + inline fallback + allow-listed subprocess stdio streaming.
 * Concurrency is hardware-derived via SystemResourceBridge (dynamic, not artificial). Queue bounded for backpressure.
 * Invariant: every accepted task yields exactly one TaskOutcome (kernel result, UNKNOWN_KIND, WORKER_ERROR, SHUTDOWN...),
 * delivered to the submit() promise, `getOutcomes()` and both sinks.
 */
export class GenesisNativeOrchestrator {
  private queue: Receipt[] = [];
  private readonly active = new Map<string, Receipt>();
  private readonly pending = new Map<string, PendingTask>();
  private readonly outcomes: TaskOutcome[] = [];
  private workers: WorkerSlot[] = [];
  private seq = 0;
  private drainResolvers: (() => void)[] = [];
  private closed = false;
  private readonly kernels: KernelTable;
  constructor(private clock: Clock, private bridge: SystemResourceBridge, private opts: OrchestratorOptions = {}, private reasoningSink?: ReasoningSink, private ledgerSink?: LedgerSink) {
    this.kernels = Object.freeze({ ...NATIVE_KERNELS, ...(opts.kernels ?? {}) });
  }
  static taskIdFor(kind: string, payload: unknown, seq: number): string { return 'NT-' + seq.toString(36).toUpperCase() + '-' + sha256hex(stableStringify({ kind, payload })).slice(0, 10); }
  get queueLength(): number { return this.queue.length; }
  get activeCount(): number { return this.active.size; }
  get workerCount(): number { return this.workers.length; }
  get isClosed(): boolean { return this.closed; }
  getOutcomes(): readonly TaskOutcome[] { return this.outcomes; }

  /**
   * Submit a task. Always returns a Promise (design choice: the delivered version returned a bare
   * TaskOutcome for QUEUE_FULL and a Promise otherwise, forcing every caller to branch on `'then' in r`;
   * an already-resolved promise keeps one call shape and lets rejections flow through the same
   * `ok:false` path as UNKNOWN_KIND / KERNEL_FAULT / SHUTDOWN). QUEUE_FULL and SHUTDOWN pre-rejections
   * are not accepted tasks: no taskId sequence number is consumed and nothing reaches the sinks.
   */
  submit(kind: string, payload: unknown): Promise<TaskOutcome> {
    if (this.closed) return Promise.resolve({ taskId: GenesisNativeOrchestrator.taskIdFor(kind, payload, this.seq), kind, ok: false, error: 'SHUTDOWN' });
    const maxQueue = this.opts.maxQueue ?? DEFAULT_MAX_QUEUE;
    if (this.queue.length + this.active.size >= maxQueue) return Promise.resolve({ taskId: GenesisNativeOrchestrator.taskIdFor(kind, payload, this.seq), kind, ok: false, error: 'QUEUE_FULL' });
    const taskId = GenesisNativeOrchestrator.taskIdFor(kind, payload, this.seq++);
    const receipt: Receipt = { taskId, kind, payload };
    // The resolver must exist before schedule(): inline UNKNOWN_KIND finishes synchronously and would otherwise
    // find no resolver, leaving the promise pending forever (the delivered bug).
    const promise = new Promise<TaskOutcome>(resolve => { this.pending.set(taskId, { receipt, resolve }); });
    this.queue.push(receipt);
    this.schedule();
    return promise;
  }
  private schedule(): void {
    if (this.closed) return;
    if (this.queue.length > 0) {
      const limit = this.bridge.recommendedConcurrency(); // one hardware sample per scheduling pass
      while (this.queue.length > 0 && this.active.size < limit) {
        const receipt = this.queue.shift();
        if (!receipt) break;
        this.runOne(receipt);
      }
    }
    this.settleDrain();
  }
  private settleDrain(): void {
    if (this.queue.length === 0 && this.active.size === 0 && this.drainResolvers.length) { const rs = this.drainResolvers; this.drainResolvers = []; rs.forEach(r => r()); }
  }
  /** Single delivery point: outcomes list, sinks, submit() promise. */
  private settle(receipt: Receipt, outcome: TaskOutcome): void {
    this.outcomes.push(outcome);
    this.reasoningSink?.push(outcome);
    this.ledgerSink?.append({ kind: receipt.kind, taskId: receipt.taskId, ok: outcome.ok, at: this.clock.now() });
    const p = this.pending.get(receipt.taskId);
    if (p) { this.pending.delete(receipt.taskId); p.resolve(outcome); }
  }
  private finish(receipt: Receipt, outcome: TaskOutcome): void {
    if (!this.active.delete(receipt.taskId)) return; // already settled (e.g. worker 'error' followed by 'exit', or shutdown)
    this.settle(receipt, outcome);
    this.schedule();
  }
  private runOne(receipt: Receipt): void {
    this.active.set(receipt.taskId, receipt);
    const ok = (value: unknown): TaskOutcome => ({ taskId: receipt.taskId, kind: receipt.kind, ok: true, value });
    const fail = (error: string, detail?: string): TaskOutcome => (detail === undefined ? { taskId: receipt.taskId, kind: receipt.kind, ok: false, error } : { taskId: receipt.taskId, kind: receipt.kind, ok: false, error, detail });
    if ((this.opts.mode ?? 'inline') === 'inline') {
      const kernel = lookupKernel(this.kernels, receipt.kind);
      if (!kernel) { this.finish(receipt, fail('UNKNOWN_KIND')); return; }
      Promise.resolve()
        .then(() => kernel(receipt.payload))
        .then(value => this.finish(receipt, ok(value)), e => this.finish(receipt, fail(errorText(e))));
      return;
    }
    const slot = this.workers.find(w => w.busy === null) ?? this.spawnWorker();
    if (!slot) { this.finish(receipt, fail('WORKER_SCRIPT_MISSING', this.workerScriptPath())); return; }
    slot.busy = receipt.taskId;
    slot.busyKind = receipt.kind;
    slot.worker.ref(); // a busy worker keeps the process alive; an idle one must not
    const req: WorkerRequest = { type: 'run', taskId: receipt.taskId, kind: receipt.kind, payload: receipt.payload };
    slot.worker.postMessage(req);
  }
  private workerScriptPath(): string { return this.opts.workerScript ?? fileURLToPath(new URL('./nativeWorkerEntry.js', import.meta.url)); }
  private spawnWorker(): WorkerSlot | null {
    const script = this.workerScriptPath();
    if (!existsSync(script)) return null; // deterministic failure instead of an async 'error' event per task
    const worker = new Worker(script);
    worker.unref();
    const slot: WorkerSlot = { worker, busy: null, busyKind: null };
    this.workers.push(slot);
    worker.on('message', (m: unknown) => {
      if (!isWorkerResult(m) || slot.busy !== m.taskId) return; // stale or foreign result
      const receipt = this.active.get(m.taskId) ?? { taskId: m.taskId, kind: slot.busyKind ?? '', payload: null };
      slot.busy = null; slot.busyKind = null; worker.unref();
      const outcome: TaskOutcome = m.ok
        ? { taskId: receipt.taskId, kind: receipt.kind, ok: true, value: m.value }
        : { taskId: receipt.taskId, kind: receipt.kind, ok: false, error: m.error ?? 'WORKER_RESULT_WITHOUT_ERROR' };
      this.finish(receipt, outcome);
    });
    // Uncaught exception inside the worker: Node emits 'error' and then 'exit'. Either one retires the slot once.
    worker.on('error', (e: Error) => this.retireWorker(slot, errorText(e)));
    worker.on('exit', code => this.retireWorker(slot, 'exit code ' + String(code)));
    worker.on('messageerror', (e: Error) => {
      // The worker is alive but its reply could not be deserialized: fail the task, keep the worker.
      const tid = slot.busy; slot.busy = null; slot.busyKind = null; worker.unref();
      const receipt = tid ? this.active.get(tid) : undefined;
      if (receipt) this.finish(receipt, { taskId: receipt.taskId, kind: receipt.kind, ok: false, error: 'WORKER_MESSAGE_ERROR', detail: errorText(e) });
    });
    return slot;
  }
  /** Remove a dead worker from the pool and fail whatever it was running; the next task spawns a fresh worker. Idempotent. */
  private retireWorker(slot: WorkerSlot, detail: string): void {
    const idx = this.workers.indexOf(slot);
    if (idx < 0) return; // already retired (or terminated by shutdown)
    this.workers.splice(idx, 1);
    const tid = slot.busy;
    slot.busy = null; slot.busyKind = null;
    void slot.worker.terminate().catch(() => undefined); // best effort; no-op once exited
    const receipt = tid ? this.active.get(tid) : undefined;
    if (receipt) this.finish(receipt, { taskId: receipt.taskId, kind: receipt.kind, ok: false, error: 'WORKER_ERROR', detail });
    else this.schedule();
  }
  /** Resolves when nothing is queued or active (immediately after shutdown). */
  drain(): Promise<void> {
    if (this.queue.length === 0 && this.active.size === 0) return Promise.resolve();
    return new Promise<void>(resolve => { this.drainResolvers.push(resolve); });
  }
  /** Rejects the queue and in-flight tasks with SHUTDOWN, terminates every worker, releases drain() waiters. Idempotent. */
  async shutdown(): Promise<void> {
    this.closed = true;
    const workers = this.workers;
    this.workers = [];
    this.queue = [];
    this.active.clear();
    for (const p of [...this.pending.values()]) this.settle(p.receipt, { taskId: p.receipt.taskId, kind: p.receipt.kind, ok: false, error: 'SHUTDOWN' }); // settle() removes the entry
    await Promise.all(workers.map(w => w.worker.terminate().catch(() => undefined)));
    this.settleDrain();
  }
  /**
   * child_process stdio streaming with a strict exact-match executable allow-list and shell:false (no injection
   * surface). Output is bounded (maxLines / maxBytes per stream; the child is killed on overflow), stderr is captured
   * separately and drained (an unread stderr pipe would block the child at 64 KiB), and an optional timeout kills the child.
   *
   * SECURITY: internal primitive only. NEVER expose this method (or its argv) to an HTTP endpoint, RPC or any
   * user-controlled input: the default allow-list is `process.execPath`, and `node -e <code>` is arbitrary code
   * execution, so allow-listing the executable does not make the arguments safe.
   */
  streamSubprocess(argv: readonly string[], options: SubprocessOptions = {}): Promise<SubprocessResult> {
    const allow = this.opts.allowedExecutables ?? [process.execPath];
    const executable = argv[0];
    if (executable === undefined || !allow.includes(executable)) {
      return Promise.resolve({ exitCode: null, signal: null, lines: ['REJECTED_EXECUTABLE_NOT_ALLOWLISTED'], stderrLines: [], truncated: false, timedOut: false, error: 'REJECTED_EXECUTABLE_NOT_ALLOWLISTED' });
    }
    const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const out = new LineCollector(maxLines, maxBytes);
    const err = new LineCollector(maxLines, maxBytes);
    return new Promise<SubprocessResult>(resolve => {
      let settled = false;
      let timedOut = false;
      let spawnError: string | undefined;
      let timer: NodeJS.Timeout | undefined;
      const child = spawn(executable, argv.slice(1), { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      const kill = (): void => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); };
      const done = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        out.flush(); err.flush();
        const base = { exitCode, signal, lines: out.lines, stderrLines: err.lines, truncated: out.truncated || err.truncated, timedOut };
        resolve(spawnError === undefined ? base : { ...base, error: spawnError });
      };
      child.stdout?.on('data', (d: Buffer) => { if (out.push(d)) kill(); });
      child.stderr?.on('data', (d: Buffer) => { if (err.push(d)) kill(); });
      if (options.timeoutMs !== undefined && options.timeoutMs > 0) timer = setTimeout(() => { timedOut = true; kill(); }, options.timeoutMs);
      child.on('close', (code, signal) => done(code, signal));
      child.on('error', e => { spawnError = errorText(e); kill(); done(child.exitCode, child.signalCode); });
    });
  }
}
