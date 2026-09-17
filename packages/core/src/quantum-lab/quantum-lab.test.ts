import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { solveTrajectory, generatePortalGeometry, kerrOuterHorizon, warpFactor, schwarzschildM } from './GenesisSpacetimePortalEngine.js';
import { buildMolecule, stepQuantum, totalEnergy, quantumFingerprint, computeForceMatrix } from './GenesisQuantumSandbox.js';
const src = (f: string) => readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8');
const P = { massKg: 1.989e30, spin: 0.4, energyJ: 1, throatRadiusM: 1, seed: 7 };
describe('spacetime portal engine', () => {
  it('same seed/params -> identical trajectory & fingerprint', () => { expect(solveTrajectory(P, 60, 0.05).fingerprint).toBe(solveTrajectory(P, 60, 0.05).fingerprint); });
  it('different seed -> different fingerprint', () => { expect(solveTrajectory(P, 60, 0.05).fingerprint).not.toBe(solveTrajectory({ ...P, seed: 8 }, 60, 0.05).fingerprint); });
  it('trajectory finite', () => { expect(solveTrajectory(P, 60, 0.05).points.every(p => Number.isFinite(p.x) && Number.isFinite(p.w))).toBe(true); });
  it('kerr horizon <= 2M and >= M', () => { const m = schwarzschildM(P.massKg); const h = kerrOuterHorizon(P.massKg, P.spin); expect(h).toBeLessThanOrEqual(2 * m + 1e-9); expect(h).toBeGreaterThanOrEqual(m - 1e-9); });
  it('warp factor >= 1 outside horizon', () => { expect(warpFactor(P.massKg, 1e7)).toBeGreaterThanOrEqual(1); });
  it('portal geometry deterministic & indexed', () => { const a = generatePortalGeometry(P, 8, 16); const b = generatePortalGeometry(P, 8, 16); expect(Array.from(a.positions)).toEqual(Array.from(b.positions)); expect(a.indices.length).toBeGreaterThan(0); });
});
describe('quantum sandbox', () => {
  it('same seed -> identical fingerprint', () => { expect(quantumFingerprint(buildMolecule(7))).toBe(quantumFingerprint(buildMolecule(7))); });
  it('force matrix symmetric', () => { expect(computeForceMatrix(buildMolecule(7)).symmetric).toBe(true); });
  it('verlet deterministic', () => { const run = () => { let s = buildMolecule(7); for (let i = 0; i < 20; i++) s = stepQuantum(s, 0.01); return quantumFingerprint(s); }; expect(run()).toBe(run()); });
  it('energy bounded (no explosion) with small dt', () => { let s = buildMolecule(7); const e0 = totalEnergy(s); for (let i = 0; i < 50; i++) s = stepQuantum(s, 0.005); expect(totalEnergy(s)).toBeLessThan(e0 + 50); });
});
describe('iron rules', () => {
  for (const f of ['GenesisSpacetimePortalEngine.ts', 'GenesisQuantumSandbox.ts']) it(f + ' no Math.random/Date.now', () => { const s = src(f); expect(s).not.toContain('Math.random('); expect(s).not.toContain('Date.now('); });
});
