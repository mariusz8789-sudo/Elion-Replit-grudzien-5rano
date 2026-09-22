/* Proprietary / All Rights Reserved - Genesis OS */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { SystemResourceBridge, osSampler, type ResourceSampler } from './SystemResourceBridge.js';
import { GenesisNativeOrchestrator, type LedgerSink, type TaskOutcome } from './GenesisNativeOrchestrator.js';
import { NATIVE_KERNELS, isKnownKind, lookupKernel } from './nativeKernels.js';
import { attachWorkerProtocol, type ProtocolPort, type WorkerResult } from './workerProtocol.js';

const clock = { t: 1000, now() { return this.t; } };
const sampler = (free: number, total: number, load0: number, cpus: number): ResourceSampler => ({ sample: () => ({ totalMemBytes: total, freeMemBytes: free, loadAvg: [load0, load0, load0], cpuCount: cpus }) });
const HERE = fileURLToPath(new URL('.', import.meta.url));

describe('SystemResourceBridge (deterministic with injected sampler)', () => {
  it('pressure & concurrency derived from injected sample', () => {
    const b = new SystemResourceBridge(clock, sampler(2e9, 8e9, 4, 8));
    const p = b.pressure();
    expect(p).toBeGreaterThan(0); expect(p).toBeLessThanOrEqual(1);
    const c = b.recommendedConcurrency();
    expect(c).toBeGreaterThanOrEqual(1); expect(c).toBeLessThanOrEqual(8);
  });
  it('history capped & timestamps from Clock only', () => {
    const b = new SystemResourceBridge(clock, sampler(1, 4, 1, 4), 3);
    for (let i = 0; i < 5; i++) { clock.t += 10; b.sample(); }
    expect(b.getHistory().length).toBe(3);
    expect(b.getHistory()[2].at).toBe(clock.t);
  });
  it('osSampler returns sane real values', () => {
    const s = osSampler.sample();
    expect(s.cpuCount).toBeGreaterThanOrEqual(1);
    expect(s.totalMemBytes).toBeGreaterThan(0);
    expect(s.freeMemBytes).toBeGreaterThanOrEqual(0); expect(s.freeMemBytes).toBeLessThanOrEqual(s.totalMemBytes);
    expect(s.loadAvg).toHaveLength(3);
    for (const l of s.loadAvg) { expect(Number.isFinite(l)).toBe(true); expect(l).toBeGreaterThanOrEqual(0); }
    const b = new SystemResourceBridge(clock);
    expect(b.recommendedConcurrency()).toBeGreaterThanOrEqual(1);
  });
});

describe('nativeKernels', () => {
  it('lookupKernel ignores inherited members', () => {
    for (const k of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf']) expect(lookupKernel(NATIVE_KERNELS, k)).toBeUndefined();
    expect(isKnownKind('vectorSum')).toBe(true); expect(isKnownKind('constructor')).toBe(false);
  });
  it('matrixMul validates shape instead of producing NaN', () => {
    expect(NATIVE_KERNELS.matrixMul({ a: [1, 2, 3, 4], b: [1, 0, 0, 1], n: 2 })).toEqual([1, 2, 3, 4]);
    expect(() => NATIVE_KERNELS.matrixMul({ a: [1, 2, 3], b: [1, 0, 0, 1], n: 2 })).toThrow('PAYLOAD_NOT_MATMUL');
    expect(() => NATIVE_KERNELS.matrixMul({ a: [1, 2, 3, 'x'], b: [1, 0, 0, 1], n: 2 })).toThrow('PAYLOAD_NOT_MATMUL');
    expect(() => NATIVE_KERNELS.matrixMul({ a: [], b: [], n: 1.5 })).toThrow('PAYLOAD_NOT_MATMUL');
  });
});

describe('workerProtocol.attachWorkerProtocol (in-process fake port)', () => {
  const fakePort = () => {
    const em = new EventEmitter();
    const sent: WorkerResult[] = [];
    const port = { on: (ev: string, fn: (m: unknown) => void) => { em.on(ev, fn); return port; }, postMessage: (m: unknown) => { sent.push(m as WorkerResult); } } as unknown as ProtocolPort;
    return { port, sent, send: (m: unknown) => em.emit('message', m), tick: () => new Promise<void>(r => setImmediate(r)) };
  };
  it('exactly one reply per request: ok / thrown / unknown / bad request / async kernel', async () => {
    const { port, sent, send, tick } = fakePort();
    attachWorkerProtocol(port, { ...NATIVE_KERNELS, later: (p: unknown) => Promise.resolve(p), laterFail: () => Promise.reject(new Error('LATER_FAIL')) });
    send({ type: 'run', taskId: 'A', kind: 'vectorSum', payload: [1, 2] });
    send({ type: 'run', taskId: 'B', kind: 'failingTask', payload: null });
    send({ type: 'run', taskId: 'C', kind: 'nope', payload: null });
    send({ type: 'run', taskId: 'D', kind: 'constructor', payload: null });
    send({ hello: 'world', taskId: 'E' });
    send(null);
    send({ type: 'run', taskId: 'F', kind: 'later', payload: 42 });
    send({ type: 'run', taskId: 'G', kind: 'laterFail', payload: 42 });
    await tick();
    const byId = Object.fromEntries(sent.map(r => [r.taskId, r]));
    expect(sent.length).toBe(8);
    expect(byId.A).toEqual({ type: 'result', taskId: 'A', ok: true, value: 3 });
    expect(byId.B).toEqual({ type: 'result', taskId: 'B', ok: false, error: 'KERNEL_FAULT' });
    expect(byId.C.error).toBe('UNKNOWN_KIND'); expect(byId.D.error).toBe('UNKNOWN_KIND');
    expect(byId.E.error).toBe('BAD_REQUEST'); expect(byId.UNKNOWN.error).toBe('BAD_REQUEST');
    expect(byId.F).toEqual({ type: 'result', taskId: 'F', ok: true, value: 42 });
    expect(byId.G.error).toBe('LATER_FAIL');
  });
});

describe('GenesisNativeOrchestrator (inline mode)', () => {
  const build = (maxQueue = 64, kernels?: Record<string, (p: unknown) => unknown>) => {
    const ledger: { kind: string; taskId: string; ok: boolean; at: number }[] = [];
    const sink: LedgerSink = { append: e => ledger.push(e) };
    const reasoning: TaskOutcome[] = [];
    const o = new GenesisNativeOrchestrator(clock, new SystemResourceBridge(clock, sampler(4e9, 8e9, 2, 4)), { mode: 'inline', maxQueue, kernels }, { push: r => reasoning.push(r) }, sink);
    return { o, ledger, reasoning };
  };
  it('parallel tasks complete with correct values', async () => {
    const { o, ledger, reasoning } = build();
    const rs = await Promise.all([o.submit('vectorSum', [1, 2, 3]), o.submit('vectorSum', [4, 5]), o.submit('hashBatch', ['a'])]);
    expect(rs[0].ok).toBe(true); expect(rs[0].value).toBe(6);
    expect(rs[1].value).toBe(9);
    expect(rs[2].ok).toBe(true);
    await o.drain();
    expect(o.queueLength).toBe(0); expect(o.activeCount).toBe(0);
    expect(ledger.length).toBe(3); expect(reasoning.length).toBe(3);
    expect(ledger.every(e => e.at === clock.t)).toBe(true);
    await o.shutdown();
  });
  it('fault isolation: failing kernel does not affect siblings', async () => {
    const { o } = build();
    const [bad, good] = await Promise.all([o.submit('failingTask', null), o.submit('vectorSum', [7])]);
    expect(bad.ok).toBe(false); expect(bad.error).toBe('KERNEL_FAULT');
    expect(good.ok).toBe(true); expect(good.value).toBe(7);
    await o.shutdown();
  });
  it('unknown kind rejected deterministically (resolver registered before scheduling)', async () => {
    const { o, ledger } = build();
    const r = await o.submit('nope', 1);
    expect(r.ok).toBe(false); expect(r.error).toBe('UNKNOWN_KIND'); expect(r.kind).toBe('nope');
    const proto = await o.submit('constructor', 1);
    expect(proto.error).toBe('UNKNOWN_KIND');
    expect(ledger.length).toBe(2);
    await o.shutdown();
  });
  it('custom kernels via options extend NATIVE_KERNELS without editing them', async () => {
    const { o } = build(64, { qubitProbe: (p: unknown) => ({ echoed: p, n: 2 }), vectorSum: () => 'overridden' });
    const r = await o.submit('qubitProbe', { theta: 0.5 });
    expect(r.ok).toBe(true); expect(r.value).toEqual({ echoed: { theta: 0.5 }, n: 2 });
    expect((await o.submit('vectorSum', [1])).value).toBe('overridden');
    expect(lookupKernel(NATIVE_KERNELS, 'qubitProbe')).toBeUndefined();
    await o.shutdown();
  });
  it('backpressure: QUEUE_FULL beyond maxQueue, always as a Promise', async () => {
    const { o, ledger } = build(2);
    const a = o.submit('vectorSum', [1]);
    const b = o.submit('vectorSum', [2]);
    const c = o.submit('vectorSum', [3]);
    expect(c).toBeInstanceOf(Promise);
    const cr = await c;
    expect(cr.ok).toBe(false); expect(cr.error).toBe('QUEUE_FULL');
    const [ar, br] = await Promise.all([a, b]);
    expect(ar.value).toBe(1); expect(br.value).toBe(2);
    expect(ledger.length).toBe(2); // rejected submission never became a task
    await o.shutdown();
  });
  it('shutdown: pending tasks resolve SHUTDOWN, later submits rejected, drain() released', async () => {
    const { o, ledger } = build(64, { slow: () => new Promise(() => undefined) });
    const p = o.submit('slow', null);
    const d = o.drain();
    await o.shutdown();
    const r = await p;
    expect(r.ok).toBe(false); expect(r.error).toBe('SHUTDOWN'); expect(r.kind).toBe('slow');
    await d;
    expect(o.isClosed).toBe(true);
    const after = await o.submit('vectorSum', [1]);
    expect(after.error).toBe('SHUTDOWN');
    expect(ledger.length).toBe(1);
    await o.shutdown(); // idempotent
  });
  it('taskIdFor deterministic for same kind+payload+seq', () => {
    expect(GenesisNativeOrchestrator.taskIdFor('vectorSum', [1, 2], 5)).toBe(GenesisNativeOrchestrator.taskIdFor('vectorSum', [1, 2], 5));
    expect(GenesisNativeOrchestrator.taskIdFor('vectorSum', [1, 2], 5)).not.toBe(GenesisNativeOrchestrator.taskIdFor('vectorSum', [1, 2], 6));
  });
});

describe('child_process allow-list & stdio streaming', () => {
  const make = (allowed?: readonly string[]) => new GenesisNativeOrchestrator(clock, new SystemResourceBridge(clock, sampler(4e9, 8e9, 1, 4)), { mode: 'inline', allowedExecutables: allowed });
  it('rejects non-allow-listed executable without spawning', async () => {
    const o = make();
    const r = await o.streamSubprocess(['/bin/echo', 'hi']);
    expect(r.exitCode).toBeNull();
    expect(r.lines[0]).toContain('REJECTED_EXECUTABLE_NOT_ALLOWLISTED');
    expect(r.error).toBe('REJECTED_EXECUTABLE_NOT_ALLOWLISTED');
    expect((await o.streamSubprocess([])).error).toBe('REJECTED_EXECUTABLE_NOT_ALLOWLISTED');
    await o.shutdown();
  });
  it('streams stdout and stderr separately from allow-listed node subprocess (shell:false)', async () => {
    const o = make([process.execPath]);
    const r = await o.streamSubprocess([process.execPath, '-e', 'console.log("genesis-line"); console.error("genesis-err"); process.stdout.write("no-newline-tail")']);
    expect(r.exitCode).toBe(0); expect(r.signal).toBeNull();
    expect(r.lines).toEqual(['genesis-line', 'no-newline-tail']);
    expect(r.stderrLines).toEqual(['genesis-err']);
    expect(r.truncated).toBe(false); expect(r.timedOut).toBe(false);
    await o.shutdown();
  });
  it('timeout kills a hanging child', async () => {
    const o = make();
    const r = await o.streamSubprocess([process.execPath, '-e', 'setInterval(()=>{},1000)'], { timeoutMs: 300 });
    expect(r.timedOut).toBe(true);
    expect(r.exitCode).toBeNull(); expect(r.signal).toBe('SIGKILL');
    await o.shutdown();
  });
  it('output cap truncates and stops a runaway child; a blocked-stderr child does not deadlock', async () => {
    const o = make();
    const r = await o.streamSubprocess([process.execPath, '-e', 'for(;;)console.log("x".repeat(100))'], { maxLines: 50, timeoutMs: 10_000 });
    expect(r.truncated).toBe(true); expect(r.timedOut).toBe(false);
    expect(r.lines.length).toBe(50);
    const e = await o.streamSubprocess([process.execPath, '-e', 'process.stderr.write("e".repeat(200000)); console.log("done")'], { timeoutMs: 10_000 });
    expect(e.timedOut).toBe(false); expect(e.exitCode).toBe(0); expect(e.lines).toEqual(['done']);
    expect(e.stderrLines[0]?.length).toBe(200000);
    await o.shutdown();
  });
  it('spawn failure of an allow-listed but missing executable resolves with error', async () => {
    const missing = join(os.tmpdir(), 'genesis-definitely-missing-executable');
    const o = make([missing]);
    const r = await o.streamSubprocess([missing]);
    expect(r.exitCode).not.toBe(0); expect(r.error).toContain('ENOENT');
    await o.shutdown();
  });
});

describe('thread mode (real worker_threads; entry bundled with esbuild at test time)', () => {
  let dir = '';
  let workerScript = '';
  let faultyWorkerScript = '';
  const bridge = () => new SystemResourceBridge(clock, sampler(4e9, 8e9, 1, 4)); // -> concurrency 3
  beforeAll(async () => {
    dir = mkdtempSync(join(os.tmpdir(), 'genesis-native-'));
    // Second worker entry built on attachWorkerProtocol with kernels that kill or corrupt the worker (test-only).
    writeFileSync(join(dir, 'faultyWorkerEntry.ts'), [
      "import { parentPort } from 'node:worker_threads';",
      `import { NATIVE_KERNELS } from ${JSON.stringify(join(HERE, 'nativeKernels.ts'))};`,
      `import { attachWorkerProtocol } from ${JSON.stringify(join(HERE, 'workerProtocol.ts'))};`,
      "if (!parentPort) throw new Error('WORKER_NO_PARENT_PORT');",
      'attachWorkerProtocol(parentPort, { ...NATIVE_KERNELS,',
      '  exitWorker: (p: unknown) => { process.exit(typeof p === "number" ? p : 3); },',
      '  throwAsyncNoReply: () => { setTimeout(() => { throw new Error("ASYNC_BOOM"); }, 5); return new Promise(() => undefined); },',
      '  returnsFunction: () => () => 1,',
      '  slow: (p: unknown) => new Promise(r => setTimeout(() => r(p), 50)),',
      '});',
    ].join('\n'));
    await build({
      entryPoints: [
        { in: join(HERE, 'nativeWorkerEntry.ts'), out: 'nativeWorkerEntry' },
        { in: join(dir, 'faultyWorkerEntry.ts'), out: 'faultyWorkerEntry' },
        { in: join(HERE, 'index.ts'), out: 'native' },
      ],
      bundle: true, format: 'esm', platform: 'node', target: 'node22', outdir: dir, outExtension: { '.js': '.mjs' }, logLevel: 'silent', write: true,
    });
    workerScript = join(dir, 'nativeWorkerEntry.mjs');
    faultyWorkerScript = join(dir, 'faultyWorkerEntry.mjs');
  }, 30_000);
  afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

  it('two real workers: fault isolation, correct values, shutdown terminates all, submit after shutdown rejected', async () => {
    const o = new GenesisNativeOrchestrator(clock, bridge(), { mode: 'threads', workerScript });
    const [bad, good, mm] = await Promise.all([o.submit('failingTask', null), o.submit('vectorSum', [3, 4]), o.submit('matrixMul', { a: [1, 2, 3, 4], b: [5, 6, 7, 8], n: 2 })]);
    expect(bad.ok).toBe(false); expect(bad.error).toBe('KERNEL_FAULT'); expect(bad.kind).toBe('failingTask');
    expect(good.ok).toBe(true); expect(good.value).toBe(7); expect(good.kind).toBe('vectorSum');
    expect(mm.value).toEqual([19, 22, 43, 50]);
    expect(o.workerCount).toBe(3);
    expect((await o.submit('nope', 1)).error).toBe('UNKNOWN_KIND');
    expect((await o.submit('constructor', 1)).error).toBe('UNKNOWN_KIND');
    expect(o.workerCount).toBe(3); // idle workers are reused, not respawned
    await o.shutdown();
    expect(o.workerCount).toBe(0);
    const after = await o.submit('vectorSum', [1]);
    expect(after.ok).toBe(false); expect(after.error).toBe('SHUTDOWN');
  });
  it('worker exiting mid-task -> WORKER_ERROR, sibling unaffected, dead worker removed, next task gets a fresh worker', async () => {
    const ledger: { ok: boolean; kind: string }[] = [];
    const o = new GenesisNativeOrchestrator(clock, bridge(), { mode: 'threads', workerScript: faultyWorkerScript }, undefined, { append: e => ledger.push({ ok: e.ok, kind: e.kind }) });
    const [dead, alive] = await Promise.all([o.submit('exitWorker', 7), o.submit('slow', 'sibling')]);
    expect(dead.ok).toBe(false); expect(dead.error).toBe('WORKER_ERROR'); expect(dead.detail).toBe('exit code 7'); expect(dead.kind).toBe('exitWorker');
    expect(alive.ok).toBe(true); expect(alive.value).toBe('sibling');
    expect(o.workerCount).toBe(1);
    const next = await o.submit('vectorSum', [2, 2]);
    expect(next.ok).toBe(true); expect(next.value).toBe(4);
    expect(o.workerCount).toBe(1);
    expect(ledger).toEqual([{ ok: false, kind: 'exitWorker' }, { ok: true, kind: 'slow' }, { ok: true, kind: 'vectorSum' }]);
    await o.shutdown();
    expect(o.workerCount).toBe(0);
  });
  it('uncaught exception inside worker (error + exit events) -> exactly one WORKER_ERROR outcome', async () => {
    const o = new GenesisNativeOrchestrator(clock, bridge(), { mode: 'threads', workerScript: faultyWorkerScript });
    const r = await o.submit('throwAsyncNoReply', null);
    expect(r.ok).toBe(false); expect(r.error).toBe('WORKER_ERROR'); expect(r.detail).toBe('ASYNC_BOOM');
    await new Promise(res => setTimeout(res, 50)); // let the trailing 'exit' event fire
    expect(o.getOutcomes().length).toBe(1);
    expect(o.workerCount).toBe(0);
    expect((await o.submit('vectorSum', [1])).value).toBe(1);
    await o.shutdown();
  });
  it('non-cloneable kernel result -> RESULT_NOT_CLONEABLE, worker survives', async () => {
    const o = new GenesisNativeOrchestrator(clock, bridge(), { mode: 'threads', workerScript: faultyWorkerScript });
    const r = await o.submit('returnsFunction', null);
    expect(r.ok).toBe(false); expect(r.error).toBe('RESULT_NOT_CLONEABLE');
    expect(o.workerCount).toBe(1);
    expect((await o.submit('vectorSum', [5])).value).toBe(5);
    await o.shutdown();
  });
  it('queued tasks beyond concurrency are processed by the same pool', async () => {
    const o = new GenesisNativeOrchestrator(clock, bridge(), { mode: 'threads', workerScript });
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => o.submit('vectorSum', [i, 1])));
    expect(rs.map(r => r.value)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    expect(o.workerCount).toBeLessThanOrEqual(3);
    await o.shutdown();
  });
  it('missing worker script fails deterministically', async () => {
    const o = new GenesisNativeOrchestrator(clock, bridge(), { mode: 'threads', workerScript: join(dir, 'does-not-exist.mjs') });
    const r = await o.submit('vectorSum', [1]);
    expect(r.ok).toBe(false); expect(r.error).toBe('WORKER_SCRIPT_MISSING');
    expect(o.workerCount).toBe(0);
    await o.shutdown();
  });
  it('no dangling handles: a child process using the bundle exits on its own after shutdown (and even without it)', async () => {
    const harness = (withShutdown: boolean) => [
      `import { GenesisNativeOrchestrator, SystemResourceBridge } from ${JSON.stringify(pathToFileURL(join(dir, 'native.mjs')).href)};`,
      'const clock = { now: () => 0 };',
      'const sampler = { sample: () => ({ totalMemBytes: 8e9, freeMemBytes: 4e9, loadAvg: [1, 1, 1], cpuCount: 4 }) };',
      `const o = new GenesisNativeOrchestrator(clock, new SystemResourceBridge(clock, sampler), { mode: 'threads', workerScript: ${JSON.stringify(workerScript)} });`,
      "const rs = await Promise.all([o.submit('vectorSum', [1, 2]), o.submit('hashBatch', ['x'])]);",
      withShutdown ? 'await o.shutdown();' : '',
      'console.log(JSON.stringify({ values: rs.map(r => r.value), workers: o.workerCount }));',
      '// no process.exit(): the process must drain by itself; a live handle would hang it until the timeout kills it',
    ].join('\n');
    const o = new GenesisNativeOrchestrator(clock, bridge(), { mode: 'inline' });
    for (const withShutdown of [true, false]) {
      const file = join(dir, withShutdown ? 'harness-shutdown.mjs' : 'harness-noshutdown.mjs');
      writeFileSync(file, harness(withShutdown));
      const r = await o.streamSubprocess([process.execPath, file], { timeoutMs: 15_000 });
      expect(r.stderrLines).toEqual([]);
      expect(r.timedOut).toBe(false); expect(r.exitCode).toBe(0);
      const parsed = JSON.parse(r.lines[0] ?? '{}') as { values: unknown[]; workers: number };
      expect(parsed.values[0]).toBe(3);
      expect(parsed.values[1]).toEqual([NATIVE_KERNELS.hashBatch(['x'])].flat());
      expect(parsed.workers).toBe(withShutdown ? 0 : 2);
    }
    await o.shutdown();
  }, 40_000);
});

describe('iron rules', () => {
  for (const f of ['GenesisNativeOrchestrator.ts', 'SystemResourceBridge.ts', 'nativeKernels.ts', 'nativeWorkerEntry.ts', 'workerProtocol.ts', 'index.ts']) {
    it(f + ' bez Math.random/Date.now', () => {
      const s = readFileSync(join(HERE, f), 'utf8');
      expect(s).not.toContain('Math.random(');
      expect(s).not.toContain('Date.now(');
    });
  }
});
