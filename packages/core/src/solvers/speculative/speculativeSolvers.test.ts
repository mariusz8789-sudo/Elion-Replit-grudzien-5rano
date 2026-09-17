/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { SpeculativeSolverRegistry } from './speculativeRegistry.js';
import { RetrocausalTreeSolver } from './retrocausalTreeSolver.js';
import { TorsionBoundarySolver } from './torsionBoundarySolver.js';
import { WarpMetricSolver } from './warpMetricSolver.js';
import type { SandboxContext, EcsWorld } from './speculativeTypes.js';
const clock = { t: 1000, now() { return this.t; } };
const ctxOn = (seed = 7): SandboxContext => ({ allowUnphysicalSandbox: true, dt: 0.1, seed, clock });
const ctxOff = (seed = 7): SandboxContext => ({ allowUnphysicalSandbox: false, dt: 0.1, seed, clock });
const miniEcs = (): EcsWorld & { count: number } => { let n = 0; const comps = new Map<string, unknown>(); return { count: 0, createEntity: () => ++n, setComponent: (e: number, name: string, d: unknown) => { comps.set(e + ':' + name, d); }, getComponent: <T>(e: number, name: string) => comps.get(e + ':' + name) as T | undefined }; };
describe('registry gating & tag integrity', () => {
  it('refuses execution when allowUnphysicalSandbox=false and writes no ledger', () => {
    const r = new SpeculativeSolverRegistry(); r.register(new WarpMetricSolver());
    const res = r.run('warp-metric', { R: 1, sigma: 2, vS: 0.5, pathLength: 10 }, ctxOff());
    expect(res.ok).toBe(false); expect(res.error).toBe('SANDBOX_DISABLED'); expect(r.getLedger().length).toBe(0);
  });
  it('rejects registering speculative plugin under VERIFIED_PHYSICS tag', () => {
    const r = new SpeculativeSolverRegistry();
    const fake = { id: 'fake', tag: 'VERIFIED_PHYSICS' as const, createInitialState: () => { throw new Error('x'); }, step: () => { throw new Error('x'); }, warnings: () => [], fingerprint: () => 'x' };
    expect(() => r.register(fake)).toThrow(/REJECTS_VERIFIED_TAG/);
  });
  it('unknown solver returns UNKNOWN_SOLVER', () => { const r = new SpeculativeSolverRegistry(); expect(r.run('nope', {}, ctxOn()).error).toBe('UNKNOWN_SOLVER'); });
});
describe('retrocausal tree solver', () => {
  const p = { depth: 3, branches: 4, temperature: 0.7, gamma: 0.9, maxIter: 50, tol: 1e-8, eta: 0.2 };
  it('deterministic fingerprint across instances', () => {
    const a = new SpeculativeSolverRegistry(); a.register(new RetrocausalTreeSolver());
    const b = new SpeculativeSolverRegistry(); b.register(new RetrocausalTreeSolver());
    expect(a.run('retrocausal-tree', p, ctxOn()).fingerprint).toBe(b.run('retrocausal-tree', p, ctxOn()).fingerprint);
  });
  it('flags RETROCAUSAL_FIXED_POINT; UNCONVERGED when cap hit', () => {
    const r = new SpeculativeSolverRegistry(); r.register(new RetrocausalTreeSolver());
    const conv = r.run('retrocausal-tree', p, ctxOn());
    expect(conv.warnings).toContain('RETROCAUSAL_FIXED_POINT');
    const un = r.run('retrocausal-tree', { ...p, maxIter: 1, tol: 1e-12 }, ctxOn());
    expect(un.warnings).toContain('UNCONVERGED_FIXED_POINT');
  });
});
describe('torsion boundary solver', () => {
  const p = { radii: [2, 4], pitch: [0.5, 1], reflectivity: [0.8, 0.6], gridSize: 16, D: 0.2, lambda: 0.05, alpha: 0.2, beta: 0.5, I0: 0.1, ell: 3 };
  it('fields finite, tau in (0,1], flag present, hash stable', () => {
    const r = new SpeculativeSolverRegistry(); r.register(new TorsionBoundarySolver());
    const res = r.run('torsion-boundary', p, ctxOn());
    const st = res.state as unknown as { I: Float64Array; tau: Float64Array };
    expect(Array.from(st.I).every(Number.isFinite)).toBe(true);
    expect(Array.from(st.tau).every(v => v > 0 && v <= 1)).toBe(true);
    expect(res.warnings).toContain('TORSION_BOUNDARY_SPECULATIVE');
    expect(res.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
describe('warp metric solver', () => {
  const p = { R: 1, sigma: 2, vS: 0.6, pathLength: 10 };
  it('always flags NEGATIVE_ENERGY_REQUIRED; properTime <= coordinateTime', () => {
    const r = new SpeculativeSolverRegistry(); r.register(new WarpMetricSolver());
    let res = r.run('warp-metric', p, ctxOn());
    expect(res.warnings).toContain('NEGATIVE_ENERGY_REQUIRED');
    const st = res.state as unknown as { properTime: number; coordinateTime: number };
    expect(st.properTime).toBeLessThanOrEqual(st.coordinateTime + 1e-12);
  });
  it('provenance ledger chains & verifies', () => {
    const r = new SpeculativeSolverRegistry(); r.register(new WarpMetricSolver()); r.register(new RetrocausalTreeSolver());
    r.run('warp-metric', p, ctxOn()); r.run('retrocausal-tree', { depth: 2, branches: 2, temperature: 1, gamma: 0.5, maxIter: 5, tol: 1e-6, eta: 0.1 }, ctxOn());
    expect(r.getLedger().length).toBe(2); expect(r.verifyLedger().ok).toBe(true);
  });
});
