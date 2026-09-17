import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GenesisMolecularSearchCore, buildGraph, genomeFingerprint } from './GenesisMolecularSearchCore.js';
import { assessCandidate, validateValence, molecularWeight, estimateLogP, lipinskiPass } from './GenesisPhysicoChemicalSandbox.js';
import type { MolecularGraph } from './GenesisPhysicoChemicalSandbox.js';
const src = (f: string) => readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8');
const clock = { t: 1000, now() { return this.t; } };
const PARAMS = { seed: 7, maxIterations: 60, populationSize: 16, targetMW: 300, targetLogP: 2.5, targetFitness: 0.9, plateauLimit: 10 };
describe('search core determinism', () => {
  it('same seed -> identical result fingerprint & best', () => { const a = new GenesisMolecularSearchCore(clock, PARAMS).run(); const b = new GenesisMolecularSearchCore(clock, PARAMS).run(); expect(a.resultFingerprint).toBe(b.resultFingerprint); expect(a.best?.fingerprint).toBe(b.best?.fingerprint); expect(a.history).toEqual(b.history); });
  it('different seed -> different evolutionary path', () => { const a = new GenesisMolecularSearchCore(clock, PARAMS).run(); const b = new GenesisMolecularSearchCore(clock, { ...PARAMS, seed: 8 }).run(); expect(a.history.map(h => h.bestFitness).join(',')).not.toBe(b.history.map(h => h.bestFitness).join(',')); });
  it('terminates within maxIterations and visits states', () => { const r = new GenesisMolecularSearchCore(clock, PARAMS).run(); expect(r.iterations).toBeLessThanOrEqual(PARAMS.maxIterations); expect(r.iterations).toBeGreaterThan(0); expect(r.visitedCount).toBeGreaterThan(0); });
  it('state ledger blocks re-testing duplicates (visited <= pop*iter)', () => { const r = new GenesisMolecularSearchCore(clock, PARAMS).run(); expect(r.visitedCount).toBeLessThanOrEqual(r.iterations * PARAMS.populationSize); });
  it('best labeled SYNTHETIC_CANDIDATE with 64-hex fingerprint', () => { const r = new GenesisMolecularSearchCore(clock, PARAMS).run(); expect(r.dataLabel).toBe('SYNTHETIC_CANDIDATE'); expect(r.best?.fingerprint).toMatch(/^[0-9a-f]{64}$/); });
});
describe('graph building', () => {
  it('genome fingerprint deterministic', () => expect(genomeFingerprint([1, 2, 3])).toBe(genomeFingerprint([1, 2, 3])));
  it('buildGraph respects valence (free never negative)', () => { const g = buildGraph([1, 2, 3, 5]); const used = new Array(g.atoms.length).fill(0); for (const [a, b, o] of g.bonds) { used[a] += o; used[b] += o; } expect(used.every((u: number) => u <= 4)).toBe(true); });
});
describe('physicochemical sandbox', () => {
  it('detects valence violation on over-bonded carbon', () => { const g: MolecularGraph = { atoms: ['C', 'H', 'H', 'H', 'H', 'H'], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1], [0, 5, 1]] }; expect(validateValence(g).ok).toBe(false); });
  it('accepts valid methane-like carbon', () => { const g: MolecularGraph = { atoms: ['C', 'H', 'H', 'H', 'H'], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]] }; expect(validateValence(g).ok).toBe(true); });
  it('molecular weight correct for single carbon', () => { const g: MolecularGraph = { atoms: ['C'], bonds: [] }; expect(molecularWeight(g)).toBeCloseTo(12.011, 2); });
  it('lipinski rejects huge molecule', () => { const big: MolecularGraph = { atoms: Array(80).fill('C'), bonds: [] }; expect(lipinskiPass({ mw: molecularWeight(big), logP: estimateLogP(big), hbd: 0, hba: 0, ringCount: 0 })).toBe(false); });
  it('assessment labels include VALENCE_VERIFIED when ok', () => { const g = buildGraph([1, 3, 2]); const a = assessCandidate(g, 7); if (a.valenceOk) expect(a.labels).toContain('VALENCE_VERIFIED'); expect(a.labels).toContain('MODEL_ESTIMATE'); });
});
describe('iron rules', () => {
  for (const f of ['GenesisMolecularSearchCore.ts', 'GenesisPhysicoChemicalSandbox.ts']) it(f + ' no Math.random/Date.now', () => { const s = src(f); expect(s).not.toContain('Math.random('); expect(s).not.toContain('Date.now('); });
});
