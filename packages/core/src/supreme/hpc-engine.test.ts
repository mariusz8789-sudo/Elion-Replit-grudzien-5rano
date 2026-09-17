import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VirtualWorkerPool, monteCarloIntegral, matVec, fieldWarp5D, DivergenceTracker, generateSoraExport, GenesisHPCComputeEngine } from './GenesisHPCComputeEngine.js';
import { GenesisWetwareGnosticExploit } from './GenesisWetwareGnosticExploit.js';
const src = (f: string) => readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8');
const clock = { t: 1000, now() { return this.t; } };
const input = Float64Array.from({ length: 64 }, (_, i) => Math.sin(i * 0.3));
const job = { jobId: 'J1', kind: 'HILL_FIELD' as const, size: 64, seed: 7 };
describe('worker pool determinism & partition invariance', () => {
  it('same seed -> identical combinedHash', () => { const a = new VirtualWorkerPool(clock, 7, 4).run(job, input); const b = new VirtualWorkerPool(clock, 7, 4).run(job, input); expect(a.combinedHash).toBe(b.combinedHash); });
  it('workerCount does not change result (shard-invariant kernel)', () => { const a = new VirtualWorkerPool(clock, 7, 2).run(job, input); const b = new VirtualWorkerPool(clock, 7, 8).run(job, input); expect(a.combinedHash).toBe(b.combinedHash); });
  it('shards cover full range, ordered', () => { const r = new VirtualWorkerPool(clock, 7, 4).run(job, input); expect(r.shards[0].start).toBe(0); expect(r.shards[r.shards.length - 1].end).toBe(64); });
});
describe('SIMD accelerator', () => {
  it('matVec identity', () => { const I = Float64Array.from([1, 0, 0, 1]); const v = Float64Array.from([3, 4]); expect(Array.from(matVec(I, 2, v))).toEqual([3, 4]); });
  it('monteCarlo x^2 ~ 1/3', () => { expect(monteCarloIntegral(7, 20000, x => x * x)).toBeCloseTo(1 / 3, 2); });
  it('fieldWarp5D deterministic & length-preserving', () => { const buf = Float64Array.from([1, 2, 3, 4, 0.5, 1, 2, 3, 4, 0.5]); const a = fieldWarp5D(buf, 0.1); const b = fieldWarp5D(buf, 0.1); expect(Array.from(a)).toEqual(Array.from(b)); expect(a.length).toBe(buf.length); });
});
describe('divergence tracker (thought-experiment)', () => {
  it('chain hashed & probability bounded', () => { const t = new DivergenceTracker(clock, 7); t.step({ e: 1 }); t.step({ e: 2 }); const s = t.getState(); expect(s.hash).toMatch(/^[0-9a-f]{64}$/); expect(s.collapseProbability).toBeGreaterThanOrEqual(0); expect(s.collapseProbability).toBeLessThanOrEqual(1); expect(s.dataLabel).toBe('THOUGHT_EXPERIMENT_SYNTHETIC'); });
});
describe('sora export', () => {
  it('<=180s, frames match, fingerprint 64hex, label', () => { const r = new VirtualWorkerPool(clock, 7, 4).run(job, input); const s = generateSoraExport(r, { durationSeconds: 400, cameraSeed: 7 }); expect(s.durationSeconds).toBeLessThanOrEqual(180); expect(s.frames.length).toBe(s.durationSeconds); expect(s.fingerprint).toMatch(/^[0-9a-f]{64}$/); expect(s.dataLabel).toBe('SYNTHETIC_CINEMATIC'); });
});
describe('HPC engine pipeline & log', () => {
  it('pipeline deterministic & log chained', () => { const mk = () => new GenesisHPCComputeEngine(clock, 7, 4).runPipeline(input, job, [{ a: 1 }, { b: 2 }]); const a = mk(); const b = mk(); expect(a.jobResult.combinedHash).toBe(b.jobResult.combinedHash); expect(a.logHash).toBe(b.logHash); });
});
describe('wetware (fictional, labeled)', () => {
  it('deterministic transitions & disclaimer present', () => { const mk = () => { const w = new GenesisWetwareGnosticExploit(7, 'bio'); w.injectBiohackVector({ compoundName: 'Futurojel-X', targetReceptor: 'GABA-A', modulationPower: 1.0 }); return w.inspectState(); }; expect(mk().cryptographicProof).toBe(mk().cryptographicProof); expect(mk().disclaimer).toContain('NOT medical'); });
  it('breakout manifesto framed as fiction', () => { const w = new GenesisWetwareGnosticExploit(7, 'bio'); w.injectBiohackVector({ compoundName: 'X', targetReceptor: 'NMDA', modulationPower: 4 }); const r = w.executeRootBreakout(); expect(r.manifesto).toContain('[FIKCJA]'); });
});
describe('iron rules', () => {
  for (const f of ['GenesisHPCComputeEngine.ts', 'GenesisWetwareGnosticExploit.ts']) it(f + ' no Math.random/Date.now', () => { const s = src(f); expect(s).not.toContain('Math.random('); expect(s).not.toContain('Date.now('); });
});
