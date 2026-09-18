/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError, type HttpTransport, type HttpRequestOptions, type HttpResponse, type Sleeper } from '../../knowledge/ingestion/netUtils.js';
import {
  Qasm3Generator, parseQasm3, bellState, ghz, superposition, circuitFromQasm, DeterministicQuantumSimulator, CloudQpuRestAdapter,
  QuantumError, isQuantumError, MAX_QUBITS, evalAngle,
} from './QuantumProviderAdapter.js';
import { QpuOrchestrator, quantumSimulateKernel, QUANTUM_SIMULATE_KIND, type ComputeSink } from './QpuOrchestrator.js';
import { handleQuantumWorkerMessage } from './quantumWorkerEntry.js';

const clock = { t: 1000, now() { return this.t; } };
const makeSleeper = (): { delays: number[]; sleeper: Sleeper } => { const delays: number[] = []; return { delays, sleeper: { sleep: async (ms: number) => { delays.push(ms); } } }; };
const noSleep: Sleeper = { sleep: async () => {} };
const sim = new DeterministicQuantumSimulator();
const sum = (o: Record<string, number>): number => Object.values(o).reduce((a, b) => a + b, 0);
const codeOf = (fn: () => unknown): string => { try { fn(); } catch (e) { return isQuantumError(e) ? e.code : 'NOT_QUANTUM_ERROR'; } return 'NO_THROW'; };

class RecordingTransport implements HttpTransport {
  readonly calls: { url: string; opts?: HttpRequestOptions }[] = [];
  constructor(private readonly respond: (n: number) => HttpResponse) {}
  async fetch(url: string, opts?: HttpRequestOptions): Promise<HttpResponse> {
    this.calls.push({ url, opts });
    return this.respond(this.calls.length);
  }
}
const ok = (body: unknown): HttpResponse => ({ status: 200, headers: {}, body: JSON.stringify(body) });
const keyOf = (k: string | null) => ({ getKey: () => k });

describe('Qasm3Generator', () => {
  it('emits the exact OpenQASM 3.0 text for a Bell state', () => {
    expect(bellState().qasm).toBe('OPENQASM 3.0;\ninclude "stdgates.inc";\nqubit[2] q;\nbit[2] c;\nh q[0];\ncx q[0], q[1];\nc = measure q;\n');
    expect(bellState().qubits).toBe(2);
    expect(bellState().fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(bellState().fingerprint).toBe(bellState().fingerprint);
  });
  it('round-trips every supported gate through the parser (generate -> parse -> same gate list)', () => {
    const g = new Qasm3Generator(3).h(0).x(1).y(2).z(0).s(1).t(2).rx(0.5, 0).ry(-1.25, 1).rz(3.75, 2).cx(0, 1).cz(1, 2).swap(0, 2).barrier().measureAll();
    const parsed = parseQasm3(g.toQasm3());
    expect(parsed.qubits).toBe(3);
    expect(parsed.clbits).toBe(3);
    expect(parsed.gates).toEqual(g.gateList());
  });
  it('rejects bad qubit indices and too many qubits at build time', () => {
    expect(codeOf(() => new Qasm3Generator(2).h(2))).toBe('QUBIT_OUT_OF_RANGE');
    expect(codeOf(() => new Qasm3Generator(2).cx(1, 1))).toBe('QASM_SYNTAX');
    expect(codeOf(() => new Qasm3Generator(MAX_QUBITS + 1))).toBe('TOO_MANY_QUBITS');
  });
});

describe('parseQasm3', () => {
  it('accepts comments, OpenQASM 2 aliases, both measure forms and pi expressions', () => {
    const text = `// header comment
OPENQASM 2.0; /* block
comment */ include "qelib1.inc";
qreg q[2];
creg c[2];
h q[0];
rz(pi/2) q[1];
rx(-3*pi/4) q[0];
measure q[0] -> c[0];
c[1] = measure q[1];`;
    const p = parseQasm3(text);
    expect(p.qubits).toBe(2);
    expect(p.gates.map((g) => g.name)).toEqual(['h', 'rz', 'rx', 'measure', 'measure']);
    expect(p.gates[1].params[0]).toBeCloseTo(Math.PI / 2, 12);
    expect(p.gates[2].params[0]).toBeCloseTo((-3 * Math.PI) / 4, 12);
    expect(p.gates[3]).toEqual({ name: 'measure', qubits: [0], params: [], clbits: [0] });
    expect(evalAngle('2*pi', 1)).toBeCloseTo(2 * Math.PI, 12);
  });
  it('throws typed errors with line numbers', () => {
    const err = (text: string): QuantumError => { try { parseQasm3(text); } catch (e) { if (isQuantumError(e)) return e; } throw new Error('expected QuantumError'); };
    expect(err('OPENQASM 3.0;\nqubit[2] q;\nfoo q[0];')).toMatchObject({ code: 'UNSUPPORTED_GATE', line: 3 });
    expect(err('OPENQASM 3.0;\nqubit[2] q;\nbit[2] c;\nh q[5];')).toMatchObject({ code: 'QUBIT_OUT_OF_RANGE', line: 4 });
    expect(err('qubit[17] q;')).toMatchObject({ code: 'TOO_MANY_QUBITS', line: 1 });
    expect(err('OPENQASM 3.0;\nqubit[2] q;\nh q[0]')).toMatchObject({ code: 'QASM_SYNTAX', line: 3 });
    expect(err('OPENQASM 3.0;\nqubit[2] q;\ncx q[0];')).toMatchObject({ code: 'QASM_SYNTAX', line: 3 });
    expect(err('OPENQASM 3.0;\nqubit[2] q;\nreset q[0];')).toMatchObject({ code: 'UNSUPPORTED_GATE', line: 3 });
    expect(err('h q[0];')).toMatchObject({ code: 'QASM_SYNTAX' });
    expect(codeOf(() => circuitFromQasm('nonsense'))).toBe('QASM_SYNTAX');
  });
});

describe('DeterministicQuantumSimulator', () => {
  it('Bell state: only 00 and 11, each between 40% and 60% of 2048 shots; exact probabilities 0.5/0.5', async () => {
    const r = await sim.run(bellState(), 2048, 42);
    expect(Object.keys(r.counts).sort()).toEqual(['00', '11']);
    expect(sum(r.counts)).toBe(2048);
    expect(r.counts['00']).toBeGreaterThanOrEqual(0.4 * 2048);
    expect(r.counts['00']).toBeLessThanOrEqual(0.6 * 2048);
    expect(r.counts['11']).toBeGreaterThanOrEqual(0.4 * 2048);
    expect(r.counts['11']).toBeLessThanOrEqual(0.6 * 2048);
    expect(r.probabilities?.['00']).toBeCloseTo(0.5, 12);
    expect(r.probabilities?.['11']).toBeCloseTo(0.5, 12);
    expect(Object.keys(r.probabilities ?? {}).sort()).toEqual(['00', '11']);
    expect(r.label).toBe('MODEL_ESTIMATE');
    expect(r.executedOn).toBe('LOCAL_SIMULATOR');
    expect(r.shots).toBe(2048);
    expect(r.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
  it('GHZ(3) yields only 000 and 111', async () => {
    const r = await sim.run(ghz(3), 1000, 1);
    expect(Object.keys(r.counts).sort()).toEqual(['000', '111']);
    expect(r.probabilities?.['000']).toBeCloseTo(0.5, 12);
  });
  it('X on |0> gives 1 with certainty; H twice gives 0 with certainty', async () => {
    const x = await sim.run(new Qasm3Generator(1).x(0).measureAll().build(), 500, 3);
    expect(x.counts).toEqual({ '1': 500 });
    expect(x.probabilities).toEqual({ '1': 1 });
    const hh = await sim.run(new Qasm3Generator(1).h(0).h(0).measureAll().build(), 500, 3);
    expect(hh.counts).toEqual({ '0': 500 });
  });
  it('superposition(2) covers all four outcomes at 25% each; rotation gates match analytic values', async () => {
    const r = await sim.run(superposition(2), 4000, 9);
    expect(Object.keys(r.probabilities ?? {}).sort()).toEqual(['00', '01', '10', '11']);
    for (const p of Object.values(r.probabilities ?? {})) expect(p).toBeCloseTo(0.25, 12);
    // ry(theta)|0> = cos(theta/2)|0> + sin(theta/2)|1>  => P(1) = sin^2(theta/2)
    const theta = 1.1;
    const ry = await sim.run(new Qasm3Generator(1).ry(theta, 0).measureAll().build(), 10, 1);
    expect(ry.probabilities?.['1']).toBeCloseTo(Math.sin(theta / 2) ** 2, 12);
    // rz only changes phase: |0> stays |0>
    const rz = await sim.run(new Qasm3Generator(1).rz(2.2, 0).measureAll().build(), 10, 1);
    expect(rz.probabilities).toEqual({ '0': 1 });
    // swap moves the excitation: x q0; swap q0,q1 -> q1 is 1 => bitstring '10' (q0 rightmost)
    const sw = await sim.run(new Qasm3Generator(2).x(0).swap(0, 1).measureAll().build(), 10, 1);
    expect(sw.probabilities).toEqual({ '10': 1 });
    // cz on |11> only flips phase
    const cz = await sim.run(new Qasm3Generator(2).x(0).x(1).cz(0, 1).measureAll().build(), 10, 1);
    expect(cz.probabilities).toEqual({ '11': 1 });
    // partial measurement into a smaller register
    const part = sim.probabilities(circuitFromQasm('OPENQASM 3.0;\nqubit[2] q;\nbit[1] c;\nx q[1];\nc[0] = measure q[1];\n'));
    expect([...part.entries()]).toEqual([['1', 1]]);
  });
  it('is deterministic: same seed => identical counts; different seed => different counts', async () => {
    const a = await sim.run(bellState(), 2048, 7);
    const b = await sim.run(bellState(), 2048, 7);
    const c = await sim.run(bellState(), 2048, 8);
    expect(a.counts).toEqual(b.counts);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.counts).not.toEqual(c.counts);
  });
  it('rejects 17 qubits with TOO_MANY_QUBITS and bad shots with INVALID_SHOTS', async () => {
    expect(codeOf(() => circuitFromQasm('OPENQASM 3.0;\nqubit[17] q;\nh q[0];\n'))).toBe('TOO_MANY_QUBITS');
    await expect(new DeterministicQuantumSimulator({ maxQubits: 2 }).run(ghz(3), 10, 1)).rejects.toMatchObject({ code: 'TOO_MANY_QUBITS' });
    await expect(sim.run(bellState(), 0, 1)).rejects.toMatchObject({ code: 'INVALID_SHOTS' });
    await expect(sim.run(bellState(), 8193, 1)).rejects.toMatchObject({ code: 'INVALID_SHOTS' });
    await expect(sim.run(bellState(), 10, 1.5)).rejects.toMatchObject({ code: 'INVALID_SEED' });
  });
  it('runs the maximum 16 qubits exactly (GHZ-16: two outcomes)', async () => {
    const r = await sim.run(ghz(16), 64, 2);
    expect(Object.keys(r.probabilities ?? {}).sort()).toEqual(['0'.repeat(16), '1'.repeat(16)]);
    expect(sum(r.counts)).toBe(64);
  });
  it('kernel + worker handler produce the same result as the simulator', async () => {
    const direct = await sim.run(bellState(), 256, 5);
    const viaKernel = quantumSimulateKernel({ qasm: bellState().qasm, shots: 256, seed: 5 });
    expect(viaKernel.counts).toEqual(direct.counts);
    expect(viaKernel.fingerprint).toBe(direct.fingerprint);
    const msg = handleQuantumWorkerMessage({ type: 'run', taskId: 't1', kind: QUANTUM_SIMULATE_KIND, payload: { qasm: bellState().qasm, shots: 256, seed: 5 } });
    expect(msg).toMatchObject({ type: 'result', taskId: 't1', ok: true });
    expect((msg.value as { counts: Record<string, number> }).counts).toEqual(direct.counts);
    expect(handleQuantumWorkerMessage({ type: 'run', taskId: 't2', kind: 'nope', payload: {} })).toMatchObject({ ok: false, error: 'UNKNOWN_KIND' });
    expect(handleQuantumWorkerMessage({ type: 'run', taskId: 't3', kind: QUANTUM_SIMULATE_KIND, payload: { qasm: 'bad', shots: 1, seed: 1 } })).toMatchObject({ ok: false, error: expect.stringContaining('QASM_SYNTAX') });
    expect(codeOf(() => quantumSimulateKernel({ qasm: 1 }))).toBe('BAD_PAYLOAD');
  });
});

describe('QpuOrchestrator fallback gate', () => {
  it('no cloud provider -> LOCAL_SIMULATOR with NO_CLOUD_PROVIDER, ledger records it', async () => {
    const entries: unknown[] = [];
    const orch = new QpuOrchestrator(clock, sim, null, noSleep, {}, { ledger: { append: (e) => entries.push(e) } });
    const o = await orch.submit(bellState(), 128, 1);
    expect(o.fallbackReason).toBe('NO_CLOUD_PROVIDER');
    expect(o.result.executedOn).toBe('LOCAL_SIMULATOR');
    expect(o.result.label).toBe('MODEL_ESTIMATE');
    expect(o.attempts).toBe(1);
    expect(o.queuePosition).toBe(0);
    expect(o.jobId).toMatch(/^QJ-[0-9a-f]{16}$/);
    expect(entries).toEqual([expect.objectContaining({ kind: 'quantum-job', ok: true, executedOn: 'LOCAL_SIMULATOR', fallbackReason: 'NO_CLOUD_PROVIDER', at: clock.t })]);
  });
  it('cloud without a key -> NO_API_KEY fallback and NO request is sent', async () => {
    const transport = new RecordingTransport(() => ok({ counts: { '00': 1 } }));
    const cloud = new CloudQpuRestAdapter(transport, keyOf(null), noSleep, 'https://qpu.example/run');
    const o = await new QpuOrchestrator(clock, sim, cloud, noSleep).submit(bellState(), 64, 1);
    expect(o.fallbackReason).toBe('NO_API_KEY');
    expect(o.result.executedOn).toBe('LOCAL_SIMULATOR');
    expect(transport.calls.length).toBe(0);
    expect(o.attempts).toBe(2);
  });
  it('cloud 503 x N -> transport retries with injected backoff, then CLOUD_UNAVAILABLE fallback', async () => {
    const { delays, sleeper } = makeSleeper();
    const transport = new RecordingTransport(() => { throw new HttpError(503); });
    const cloud = new CloudQpuRestAdapter(transport, keyOf('secret-key'), sleeper, 'https://qpu.example/run', 'cloud-qpu', { attempts: 3, baseMs: 100, maxMs: 1000 });
    const o = await new QpuOrchestrator(clock, sim, cloud, sleeper).submit(bellState(), 64, 1);
    expect(transport.calls.length).toBe(3);
    expect(delays).toEqual([100, 200]);
    expect(o.fallbackReason).toBe('CLOUD_UNAVAILABLE');
    expect(o.result.executedOn).toBe('LOCAL_SIMULATOR');
    expect(o.result.label).toBe('MODEL_ESTIMATE');
    expect(Object.keys(o.result.counts).sort()).toEqual(['00', '11']);
  });
  it('cloud success parses counts (both shapes), labels HARDWARE_MEASUREMENT and sends the bearer key as a POST body', async () => {
    const transport = new RecordingTransport((n) => (n === 1 ? ok({ counts: { '11': 40, '00': 60 } }) : ok({ results: { counts: { '01': 3 } } })));
    const cloud = new CloudQpuRestAdapter(transport, keyOf('secret-key'), noSleep, 'https://qpu.example/run', 'vendor-x');
    const orch = new QpuOrchestrator(clock, sim, cloud, noSleep);
    const o = await orch.submit(bellState(), 100, 1);
    expect(o.fallbackReason).toBeUndefined();
    expect(o.result).toMatchObject({ executedOn: 'CLOUD_QPU', label: 'HARDWARE_MEASUREMENT', providerId: 'vendor-x', counts: { '00': 60, '11': 40 }, shots: 100 });
    expect(o.result.probabilities).toBeUndefined();
    const call = transport.calls[0];
    expect(call.url).toBe('https://qpu.example/run');
    expect(call.opts?.method).toBe('POST');
    expect(call.opts?.headers?.authorization).toBe('Bearer secret-key');
    expect(JSON.parse(call.opts?.body ?? '{}')).toEqual({ qasm: bellState().qasm, shots: 100, seed: 1 });
    const o2 = await orch.submit(bellState(), 3, 1);
    expect(o2.result.counts).toEqual({ '01': 3 });
  });
  it('cloud garbage body -> PARSE -> CLOUD_UNAVAILABLE fallback; the key never leaks into errors', async () => {
    const transport = new RecordingTransport(() => ({ status: 200, headers: {}, body: 'not json' }));
    const cloud = new CloudQpuRestAdapter(transport, keyOf('secret-key'), noSleep, 'https://qpu.example/run');
    await expect(cloud.run(bellState(), 10, 1)).rejects.toSatisfy((e: unknown) => isQuantumError(e, 'PARSE') && !String((e as Error).message).includes('secret-key'));
    const o = await new QpuOrchestrator(clock, sim, cloud, noSleep).submit(bellState(), 10, 1);
    expect(o.fallbackReason).toBe('CLOUD_UNAVAILABLE');
  });
  it('bounded FIFO queue: sequential execution, queue positions, QUEUE_FULL rejection', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((res) => { release = res; });
    const order: string[] = [];
    const slowCloud = { id: 'slow', run: async () => { order.push('cloud-start'); await gate; order.push('cloud-end'); return { counts: { '00': 1 }, shots: 1, executedOn: 'CLOUD_QPU' as const, providerId: 'slow', label: 'HARDWARE_MEASUREMENT' as const, fingerprint: 'f' }; } };
    const orch = new QpuOrchestrator(clock, sim, slowCloud, noSleep, { maxQueue: 2 });
    const p1 = orch.submit(bellState(), 1, 1);
    const p2 = orch.submit(bellState(), 1, 2);
    await expect(orch.submit(bellState(), 1, 3)).rejects.toMatchObject({ code: 'QUEUE_FULL' });
    expect(orch.pending).toBe(2);
    release();
    const [o1, o2] = await Promise.all([p1, p2]);
    expect(o1.queuePosition).toBe(0);
    expect(o2.queuePosition).toBe(1);
    expect(order).toEqual(['cloud-start', 'cloud-end', 'cloud-start', 'cloud-end']);
    expect(orch.pending).toBe(0);
    await expect(orch.submit(bellState(), 1, 4)).resolves.toBeTruthy();
  });
  it('uses the ComputeSink for local simulation when provided (and validates what comes back)', async () => {
    const submitted: { kind: string; payload: unknown }[] = [];
    const sink: ComputeSink = { submit: (kind, payload) => { submitted.push({ kind, payload }); return { ok: true, value: quantumSimulateKernel(payload) }; } };
    const o = await new QpuOrchestrator(clock, sim, null, noSleep, {}, { compute: sink }).submit(bellState(), 64, 11);
    expect(submitted).toEqual([{ kind: 'quantumSimulate', payload: { qasm: bellState().qasm, shots: 64, seed: 11, maxShots: 8192 } }]);
    expect(o.result.counts).toEqual((await sim.run(bellState(), 64, 11)).counts);
    const bad: ComputeSink = { submit: async () => ({ ok: false, error: 'WORKER_TIMEOUT' }) };
    await expect(new QpuOrchestrator(clock, sim, null, noSleep, {}, { compute: bad }).submit(bellState(), 1, 1)).rejects.toMatchObject({ code: 'BAD_PAYLOAD', message: expect.stringContaining('WORKER_TIMEOUT') });
    const forged: ComputeSink = { submit: async () => ({ ok: true, value: { counts: { '00': 1 }, shots: 1, executedOn: 'CLOUD_QPU', label: 'HARDWARE_MEASUREMENT', providerId: 'x', fingerprint: 'f' } }) };
    await expect(new QpuOrchestrator(clock, sim, null, noSleep, {}, { compute: forged }).submit(bellState(), 1, 1)).rejects.toMatchObject({ code: 'BAD_PAYLOAD' });
  });
  it('a circuit error is NOT a fallback reason: it is thrown to the caller', async () => {
    await expect(new QpuOrchestrator(clock, sim, null, noSleep).submit(bellState(), 99999, 1)).rejects.toMatchObject({ code: 'INVALID_SHOTS' });
  });
});

describe('iron rules', () => {
  it('no Math.random and no Date.now in any non-test source of this directory', () => {
    const dir = fileURLToPath(new URL('.', import.meta.url));
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toContain('Math.random(');
      expect(src, f).not.toContain('Date.now(');
    }
  });
});
