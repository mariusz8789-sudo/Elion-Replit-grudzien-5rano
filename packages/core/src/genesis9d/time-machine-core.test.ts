import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lorentzDilation, teslaResonanceHz, diracStep, spinorNorm, kretschmann, teslaWaveStep, GenesisMathematicalTimeMachineCore, C, EFE_EQ, LORENTZ_EQ, TESLA_EQ, DIRAC_EQ } from './GenesisMathematicalTimeMachineCore.js';
const src = readFileSync(fileURLToPath(new URL('./GenesisMathematicalTimeMachineCore.ts', import.meta.url)), 'utf8');
const clock = { t: 1000, now() { return this.t; } };
describe('mathematical time-machine core', () => {
  it('Lorentz dilation at 0.6c = 1.25x', () => { expect(lorentzDilation(1, 0.6 * C)).toBeCloseTo(1.25, 6); });
  it('Lorentz at v=0 = identity', () => { expect(lorentzDilation(5, 0)).toBe(5); });
  it('Tesla resonance f=1/(2pi sqrt(LC))', () => { expect(teslaResonanceHz(1e-3, 1e-6)).toBeCloseTo(1 / (2 * Math.PI * Math.sqrt(1e-9)), 0); });
  it('Dirac step preserves norm', () => { const psi = diracStep([1, 0, 0, 0], 0.7, 0.5, 2.0); expect(spinorNorm(psi)).toBeCloseTo(1, 6); });
  it('Kretschmann decreases with r', () => { expect(kretschmann(1.989e30, 1e6)).toBeGreaterThan(kretschmann(1.989e30, 1e7)); });
  it('wave step stable & finite', () => { const E = new Float64Array(64); E[32] = 1; const out = teslaWaveStep(E, 1, 1 / (2 * C), 10); expect(Array.from(out).every(Number.isFinite)).toBe(true); });
  it('package exposes all four equations + disclaimer', () => { const k = new GenesisMathematicalTimeMachineCore(clock);
    const pkg = k.compute({ massKg: 1.989e30, rM: 1e7, vMps: 0.5 * C, tSeconds: 1, inductanceH: 1e-3, capacitanceF: 1e-6, momentumP: 0.7, restMassM: 0.5, tNatural: 1.5, psi0: [1, 0, 0, 0] });
    expect(pkg.equations).toEqual([EFE_EQ, LORENTZ_EQ, TESLA_EQ, DIRAC_EQ]); expect(pkg.disclaimer).toContain('no actual time travel'); expect(pkg.manifestHash).toMatch(/^[0-9a-f]{64}$/); expect(k.getExecutionLog().length).toBe(1); });
});
describe('iron rules', () => { it('no Math.random/Date.now', () => { expect(src).not.toContain('Math.random('); expect(src).not.toContain('Date.now('); }); });
