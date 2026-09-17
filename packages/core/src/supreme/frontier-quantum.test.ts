import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GenesisQuantumComputeEngine, GenesisQuantumFrontierEngine, FRONTIER_KNOWLEDGE } from './GenesisQuantumFrontierEngine.js';
const src = readFileSync(fileURLToPath(new URL('./GenesisQuantumFrontierEngine.ts', import.meta.url)), 'utf8');
const clock = { t: 1000, now() { return this.t; } };
describe('quantum compute engine', () => {
  it('H gives 50/50', () => { const q = new GenesisQuantumComputeEngine(1); q.apply({ type: 'H', q: 0 }); const p = q.measureProbs(0); expect(p.p0).toBeCloseTo(0.5, 6); expect(p.p1).toBeCloseTo(0.5, 6); });
  it('Bell state correlates 00/11', () => { const q = new GenesisQuantumComputeEngine(2); q.apply({ type: 'H', q: 0 }); q.apply({ type: 'CNOT', q: 0, q2: 1 }); const r = q.result(); expect(r.probs[0]).toBeCloseTo(0.5, 6); expect(r.probs[3]).toBeCloseTo(0.5, 6); expect(r.probs[1]).toBeCloseTo(0, 6); });
  it('deterministic stateFingerprint', () => { const mk = () => { const q = new GenesisQuantumComputeEngine(2); q.apply({ type: 'H', q: 0 }); q.apply({ type: 'CNOT', q: 0, q2: 1 }); return q.result().stateFingerprint; }; expect(mk()).toBe(mk()); });
});
describe('frontier knowledge labeling', () => {
  it('CTC theoretical; time-traveler unsubstantiated; GERDA verified; Gargantua sci-comm; tesseract fiction', () => {
    const get = (id: string) => FRONTIER_KNOWLEDGE.find(e => e.id === id)!.claimStatus;
    expect(get('CLOSED_TIMELIKE_CURVES')).toBe('THEORETICAL_PHYSICS');
    expect(get('TIME_TRAVELER_CLAIMS')).toBe('UNSUBSTANTIATED_CLAIM');
    expect(get('GERDA_EXPERIMENT')).toBe('VERIFIED_EXPERIMENT');
    expect(get('INTERSTELLAR_GARGANTUA')).toBe('VERIFIED_SCIENCE_COMMUNICATION');
    expect(get('TESSERACT_BULK')).toBe('SPECULATIVE_FICTION');
  });
  it('visualization params deterministic & hashed', () => { const e = new GenesisQuantumFrontierEngine(clock, 7); const a = e.visualizationParams('INTERSTELLAR_GARGANTUA'); const b = e.visualizationParams('INTERSTELLAR_GARGANTUA'); expect(a?.fingerprint).toBe(b?.fingerprint); expect(a?.fingerprint).toMatch(/^[0-9a-f]{64}$/); });
});
describe('iron rules', () => { it('no Math.random/Date.now', () => { expect(src).not.toContain('Math.random('); expect(src).not.toContain('Date.now('); }); });
