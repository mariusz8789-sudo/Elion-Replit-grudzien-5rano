import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generatePyramidLayout, shaftResonanceHz } from './GenesisPyramidInteriorEngine.js';
const src = readFileSync(fileURLToPath(new URL('./GenesisPyramidInteriorEngine.ts', import.meta.url)), 'utf8');
describe('pyramid interior engine', () => {
  it('deterministic structural fingerprint', () => { expect(generatePyramidLayout({ baseM: 230, heightM: 146, seed: 7 }).structuralFingerprint).toBe(generatePyramidLayout({ baseM: 230, heightM: 146, seed: 7 }).structuralFingerprint); });
  it('contains required chamber kinds & passages', () => { const l = generatePyramidLayout({ baseM: 230, heightM: 146, seed: 7 });
    const kinds = l.chambers.map(c => c.kind); expect(kinds).toContain('SUBTERRANEAN'); expect(kinds).toContain('KINGS'); expect(kinds).toContain('RESONANT_SHAFT'); expect(kinds).toContain('QUANTUM_FOCUS');
    expect(l.passages.some(p => p.kind === 'ASCENDING')).toBe(true); expect(l.passages.some(p => p.kind === 'DESCENDING')).toBe(true); });
  it('quarter-wave resonance f=c/4L', () => { expect(shaftResonanceHz(34.3)).toBeCloseTo(2.5, 2); });
  it('slopes finite', () => { const l = generatePyramidLayout({ baseM: 230, heightM: 146, seed: 7 }); expect(l.passages.every(p => Number.isFinite(p.slopeDeg))).toBe(true); });
});
describe('iron rules', () => { it('no Math.random/Date.now', () => { expect(src).not.toContain('Math.random('); expect(src).not.toContain('Date.now('); }); });
