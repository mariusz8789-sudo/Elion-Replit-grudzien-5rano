import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCommand } from '../core/scienceChat/resolveCommand';
import { histogramFromResponse, runQuantumAction, formatQuantumTurnText, type QuantumAction, type QuantumRunResponse } from '../core/scienceChat/quantumTurn';
import { QuantumHistogram } from '../components/QuantumHistogram';

const SRC = dirname(dirname(fileURLToPath(import.meta.url)));
const quantumOf = (msg: string): QuantumAction => {
  const r = resolveCommand(msg, null);
  if (r.action?.type !== 'quantum') throw new Error(`expected quantum action for "${msg}", got ${JSON.stringify(r)}`);
  return r.action;
};

describe('Science Chat `/quantum` → quantum bridge action', () => {
  it('/quantum bell-state → Bell preset, defaults shots=1024 seed=1, intent CREATE_TASK', () => {
    const r = resolveCommand('/quantum bell-state', null);
    expect(r.intent).toBe('CREATE_TASK');
    expect(r.action).toEqual({ type: 'quantum', preset: 'bell-state', shots: 1024, seed: 1 });
    expect(r.text).toMatch(/MODEL_ESTIMATE/);
    expect(r.text).toMatch(/nie pomiar/);
  });
  it('/quantum ghz 3 and /quantum superposition 4 carry the qubit count', () => {
    expect(quantumOf('/quantum ghz 3')).toEqual({ type: 'quantum', preset: 'ghz', qubits: 3, shots: 1024, seed: 1 });
    expect(quantumOf('/quantum superposition 4')).toEqual({ type: 'quantum', preset: 'superposition', qubits: 4, shots: 1024, seed: 1 });
    expect(quantumOf('/quantum ghz').qubits).toBe(3);
  });
  it('/quantum run keeps the multi-line QASM text verbatim (fences stripped) and strips shots/seed tokens', () => {
    const qasm = 'OPENQASM 3.0;\ninclude "stdgates.inc";\nqubit[2] q;\nbit[2] c;\nh q[0];\ncx q[0], q[1];\nc = measure q;';
    const a = quantumOf(`/quantum run shots=2048 seed=5\n\`\`\`qasm\n${qasm}\n\`\`\``);
    expect(a.qasm).toBe(qasm);
    expect(a.preset).toBeUndefined();
    expect(a.shots).toBe(2048);
    expect(a.seed).toBe(5);
  });
  it('shots= and seed= tokens are parsed and validated', () => {
    expect(quantumOf('/quantum bell-state shots=2048 seed=5')).toMatchObject({ shots: 2048, seed: 5 });
    const tooMany = resolveCommand('/quantum bell-state shots=9000', null);
    expect(tooMany.action).toBeUndefined();
    expect(tooMany.text).toMatch(/1–8192/);
    expect(resolveCommand('/quantum ghz 17', null).action).toBeUndefined();
  });
  it('Polish aliases route to the Bell preset', () => {
    expect(quantumOf('pokaż stan Bella').preset).toBe('bell-state');
    expect(quantumOf('uruchom obwód kwantowy').preset).toBe('bell-state');
    expect(quantumOf('symulacja kwantowa seed=3').seed).toBe(3);
  });
  it('unknown subcommand and bare /quantum answer with the list of forms, no action', () => {
    for (const msg of ['/quantum', '/quantum teleport', '/quantum run']) {
      const r = resolveCommand(msg, null);
      expect(r.action, msg).toBeUndefined();
      expect(r.intent, msg).toBe('HELP');
      expect(r.text, msg).toMatch(/\/quantum bell-state/);
      expect(r.text, msg).toMatch(/\/quantum run/);
    }
    expect(resolveCommand('pokaż czarną dziurę', null).action?.type).not.toBe('quantum');
    expect(resolveCommand('pomoc', null).text).toMatch(/\/quantum bell-state/);
  });
});

const bellResponse: QuantumRunResponse = {
  ok: true, executedOn: 'LOCAL_SIMULATOR', label: 'MODEL_ESTIMATE', providerId: 'local-statevector',
  counts: { '11': 502, '00': 522 }, probabilities: { '11': 0.5, '00': 0.5 }, shots: 1024, seed: 7,
  qasm: 'OPENQASM 3.0;\ninclude "stdgates.inc";\nqubit[2] q;\nbit[2] c;\nh q[0];\ncx q[0], q[1];\nc = measure q;\n',
  fingerprint: 'abcdef0123456789', fallbackReason: 'NO_CLOUD_PROVIDER',
};
const mockFetch = (status: number, body: unknown): typeof fetch => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('quantum chat turn — rendered histogram with fetch mocked', () => {
  it('POSTs /api/quantum/run and yields a HIPOTEZA turn with the label, QASM code block and histogram data', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl: typeof fetch = async (url, init) => { calls.push({ url: String(url), init }); return mockFetch(200, bellResponse)(url, init); };
    const turn = await runQuantumAction({ type: 'quantum', preset: 'bell-state', shots: 1024, seed: 7 }, fetchImpl);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/quantum/run');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ preset: 'bell-state', shots: 1024, seed: 7 });
    expect(turn.tag).toBe('HIPOTEZA');
    expect(turn.text).toContain('LOCAL_SIMULATOR');
    expect(turn.text).toContain('MODEL_ESTIMATE');
    expect(turn.text).toContain('NIE pomiar');
    expect(turn.text).toContain('```qasm\nOPENQASM 3.0;');
    expect(turn.text).toContain('Strzały: 1024 · ziarno: 7');
    expect(turn.quantum?.bars.map((b) => b.bitstring)).toEqual(['00', '11']);
    expect(turn.quantum?.bars[0]).toEqual({ bitstring: '00', count: 522, sampledPct: 51, modelPct: 50, widthPct: 100 });
    expect(turn.quantum?.bars[1].widthPct).toBeCloseTo(96.2, 1);
  });
  it('renders one .quantum-bar per outcome (sorted), width proportional to count, sampled % vs model %, and the MODEL_ESTIMATE label', () => {
    const hist = histogramFromResponse(bellResponse);
    const html = renderToStaticMarkup(createElement(QuantumHistogram, { data: hist }));
    expect(html).toMatch(/<div class="quantum-hist" role="img" aria-label="[^"]*model \(symulator\)[^"]*"/);
    expect(html.match(/class="quantum-bar"/g)).toHaveLength(2);
    expect(html.indexOf('data-bitstring="00"')).toBeLessThan(html.indexOf('data-bitstring="11"'));
    expect(html).toMatch(/class="quantum-bar" style="width:100%" data-bitstring="00" data-count="522"/);
    expect(html).toMatch(/class="quantum-bar" style="width:96\.2%" data-bitstring="11" data-count="502"/);
    expect(html).toContain('522 · 51.0%');
    expect(html).toContain('(model 50.0%)');
    expect(html).toContain('>MODEL_ESTIMATE<');
    expect(html).toContain('LOCAL_SIMULATOR · 1024 shots · seed 7');
    expect(html).not.toContain('HARDWARE_MEASUREMENT');
  });
  it('a hardware result is tagged WYNIK and has no model column; a backend error is shown verbatim', async () => {
    const hw = await runQuantumAction({ type: 'quantum', preset: 'bell-state', shots: 10, seed: 1 }, mockFetch(200, { ...bellResponse, executedOn: 'CLOUD_QPU', label: 'HARDWARE_MEASUREMENT', providerId: 'vendor', probabilities: null, fallbackReason: null, counts: { '00': 5, '11': 5 }, shots: 10 }));
    expect(hw.tag).toBe('WYNIK');
    expect(hw.quantum?.bars.every((b) => b.modelPct === null)).toBe(true);
    expect(formatQuantumTurnText(hw.quantum!)).toContain('HARDWARE_MEASUREMENT');
    const bad = await runQuantumAction({ type: 'quantum', qasm: 'foo', shots: 10, seed: 1 }, mockFetch(400, { error: 'invalid_qasm', message: 'UNSUPPORTED_GATE@line 1: gate "foo"' }));
    expect(bad.tag).toBe('SYSTEM');
    expect(bad.quantum).toBeUndefined();
    expect(bad.text).toContain('invalid_qasm');
    expect(bad.text).toContain('UNSUPPORTED_GATE@line 1');
    const down = await runQuantumAction({ type: 'quantum', preset: 'ghz', qubits: 3, shots: 10, seed: 1 }, async () => { throw new Error('Failed to fetch'); });
    expect(down.text).toContain('Failed to fetch');
  });
  it('ScienceChat.tsx wires the action for its own purpose (source-text assertion; vitest here has no DOM)', () => {
    const chat = readFileSync(join(SRC, 'components', 'ScienceChat.tsx'), 'utf8');
    expect(chat).toMatch(/a\?\.type === 'quantum'/);
    expect(chat).toMatch(/runQuantumAction\(a\)/);
    expect(chat).toMatch(/<QuantumHistogram data=\{t\.quantum\} \/>/);
    const css = readFileSync(join(SRC, 'styles.css'), 'utf8');
    expect(css).toMatch(/\.quantum-hist \{/);
    expect(css).toMatch(/\.quantum-bar \{/);
  });
});
