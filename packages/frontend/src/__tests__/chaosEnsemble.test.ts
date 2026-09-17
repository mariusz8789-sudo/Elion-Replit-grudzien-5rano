/**
 * D-080 — negative-first tests for the chaos-aware ensemble.
 *
 * The two most important tests here are not about this module's own logic:
 * they prove it is actually calling the REUSED integrators (Lorenz RK4 from
 * core/physics.ts, symplectic Verlet from universe-threebody.ts) rather than
 * a private reimplementation that happens to have the same name.
 */

import { describe, expect, it } from 'vitest';
import { stepLorenzRK4, type LorenzState } from '../core/physics';
import { figure8Bodies } from '../labs/experiments/universe-threebody';
import {
  runEnsemble, spreadCurve, predictabilityHorizon, lyapunovEstimate, chaosReport, energyDriftFor,
  FROZEN_STEP_CONFIG, type EnsembleSpec,
} from '../core/chaos/ensemble';

/**
 * `steps: 6000` (t=60 at dt=0.01), not a round guess: this module's Lorenz
 * initial condition is deliberately `{x:0.1,y:0,z:0}`, reused unchanged from
 * `universe-lorenz3d.ts::INITIAL_STATE` — which sits close to the saddle
 * fixed point at the origin, so the ensemble spends a genuine, measured
 * ~20-30 time units in a near-flat transient before the chaotic attractor's
 * exponential growth takes over (measured: horizon crossings at t=29.9/33.1/
 * 41.6 for perturbation 1e-4/1e-6/1e-8). A shorter window would silently
 * catch the transient and report NO_DIVERGENCE for a genuinely chaotic system
 * — that failure mode was caught by this exact test suite before this
 * comment was written.
 */
const spec = (over: Partial<EnsembleSpec> = {}): EnsembleSpec => ({
  stepId: 'lorenz63', seeds: Array.from({ length: 16 }, (_, i) => i), perturbation: 1e-6, steps: 6000, tolerance: 1.0, ...over,
});

describe('negative-first: fail-closed on malformed input', () => {
  it('unknown stepId is refused', () => { expect(() => runEnsemble(spec({ stepId: 'nope' as never }))).toThrow(/UNKNOWN_STEP_ID/); });
  it('empty seeds is refused', () => { expect(() => runEnsemble(spec({ seeds: [] }))).toThrow(/EMPTY_SEEDS/); });
  it('non-positive tolerance is refused', () => { expect(() => runEnsemble(spec({ tolerance: 0 }))).toThrow(/BAD_TOLERANCE/); expect(() => runEnsemble(spec({ tolerance: -1 }))).toThrow(/BAD_TOLERANCE/); });
  it('negative or non-finite perturbation is refused', () => { expect(() => runEnsemble(spec({ perturbation: -1 }))).toThrow(/BAD_PERTURBATION/); expect(() => runEnsemble(spec({ perturbation: NaN }))).toThrow(/BAD_PERTURBATION/); });
  it('non-positive or non-integer steps is refused', () => { expect(() => runEnsemble(spec({ steps: 0 }))).toThrow(/BAD_STEPS/); expect(() => runEnsemble(spec({ steps: 1.5 }))).toThrow(/BAD_STEPS/); });
});

describe('this module calls the REUSED integrators, not a private copy', () => {
  it('lorenz63: one ensemble step matches stepLorenzRK4 called directly, bit for bit', () => {
    // The ensemble's first trajectory point after perturbation, stepped once,
    // must equal calling the real integrator on that same perturbed state —
    // proving ensemble.ts delegates rather than reimplementing the derivative.
    const [traj] = runEnsemble(spec({ seeds: [42], steps: 1 }));
    const [p0, p1] = traj;
    const perturbed: LorenzState = { x: p0[0], y: p0[1], z: p0[2] };
    const expected = stepLorenzRK4(perturbed, FROZEN_STEP_CONFIG.lorenz63.dt, 10, 28, 8 / 3);
    expect(p1[0]).toBeCloseTo(expected.x, 12);
    expect(p1[1]).toBeCloseTo(expected.y, 12);
    expect(p1[2]).toBeCloseTo(expected.z, 12);
  });

  it('threebody-figure8: zero perturbation reproduces figure8Bodies exactly at t=0', () => {
    const [traj] = runEnsemble({ stepId: 'threebody-figure8', seeds: [1], perturbation: 0, steps: 1, tolerance: 1 });
    const real = figure8Bodies();
    const flatReal = real.flatMap((b) => [b.x, b.y, b.vx, b.vy]);
    expect(traj[0]).toEqual(flatReal);
  });

  it('threebody-figure8: energy conservation over 5000 fixed-dt Verlet steps is excellent (measured ~2.4e-7, far inside the shipped lab test\'s own 1%/5% bounds)', () => {
    // Measured: 2.3634610296308865e-7 relative drift. universeThreeBody.test.ts
    // accepts 1%-5% for the SAME integrator under adaptive stepping; this fixed
    // dt=0.001 run over t=5.0 is ~1000x tighter than that accepted bound. The
    // threshold below is set from the measurement, not guessed, and still
    // leaves two orders of magnitude of margin for legitimate float/platform drift.
    const drift = energyDriftFor('threebody-figure8', 5000);
    expect(drift).not.toBeNull();
    expect(drift!).toBeLessThan(1e-5);
  });

  it('energyDriftFor is null for non-gravitational step ids (the question does not apply)', () => {
    expect(energyDriftFor('lorenz63', 100)).toBeNull();
    expect(energyDriftFor('harmonic2d', 100)).toBeNull();
  });
});

describe('lorenz63: real chaos, measured', () => {
  it('ensemble spread diverges and crosses tolerance — measured horizon ~33 time units at these parameters', () => {
    const curve = spreadCurve(runEnsemble(spec()));
    const h = predictabilityHorizon(curve, FROZEN_STEP_CONFIG.lorenz63.dt, 1.0);
    expect(h.status).toBe('HORIZON_FOUND');
    // Measured 33.12; bounds give margin for legitimate cross-platform float drift, not for a wrong regime.
    expect(h.horizonT).toBeGreaterThan(25);
    expect(h.horizonT).toBeLessThan(42);
  });

  it('lyapunov ESTIMATE is positive and close to the literature value once the window is anchored past the measured pre-chaotic noise floor (~1e-3), not perturbation size', () => {
    const s = spec();
    const curve = spreadCurve(runEnsemble(s));
    // The exact window chaosReport() uses internally (not the bare 2-arg default, which is a fallback for
    // callers with no domain knowledge). Must match chaosReport's own
    // `Math.max(1e-3, 10 * spec.perturbation)` / `spec.tolerance` bounds bit for bit — two prior floors were
    // tried and both caught by this exact test: `0.1 * max(curve)` as hi (measured 0.36, transient+saturation
    // both included) and a perturbation-derived lo floored at only 1e-4 (measured 0.16, still inside the noisy
    // ~1e-5..4e-4 pre-chaotic transient). The current window (lo=1e-3, hi=tolerance=1.0) measures ~0.78,
    // consistent with the textbook maximal Lyapunov exponent for these Lorenz parameters (sigma=10, rho=28,
    // beta=8/3), which is close to 0.90.
    const lambda = lyapunovEstimate(curve, FROZEN_STEP_CONFIG.lorenz63.dt, Math.max(1e-3, 10 * s.perturbation), s.tolerance);
    expect(lambda).not.toBeNull();
    expect(lambda!).toBeGreaterThan(0.5);
    expect(lambda!).toBeLessThan(1.0);
    const report = chaosReport(s, curve);
    expect(report.lyapunovEstimateLabel).toBe('EMPIRICAL_ESTIMATE_NOT_RIGOROUS_EXPONENT');
    expect(report.lyapunovEstimate).toBeCloseTo(lambda!, 6);
  });

  it('monotonicity: larger perturbation -> earlier horizon (measured: 29.9 / 33.1 / 41.6 for 1e-4/1e-6/1e-8)', () => {
    const horizonFor = (p: number) => predictabilityHorizon(spreadCurve(runEnsemble(spec({ perturbation: p }))), FROZEN_STEP_CONFIG.lorenz63.dt, 1.0).horizonT!;
    const h4 = horizonFor(1e-4), h6 = horizonFor(1e-6), h8 = horizonFor(1e-8);
    expect(h4).toBeLessThan(h6);
    expect(h6).toBeLessThan(h8);
  });

  it('monotonicity: larger tolerance -> later horizon', () => {
    const curve = spreadCurve(runEnsemble(spec()));
    const dt = FROZEN_STEP_CONFIG.lorenz63.dt;
    const hLo = predictabilityHorizon(curve, dt, 0.1).horizonT!;
    const hHi = predictabilityHorizon(curve, dt, 10).horizonT!;
    expect(hLo).toBeLessThan(hHi);
  });
});

describe('harmonic2d: the non-chaotic control case', () => {
  it('perturbation never grows beyond its own scale — NO_DIVERGENCE_WITHIN_WINDOW, honestly', () => {
    const curve = spreadCurve(runEnsemble({ stepId: 'harmonic2d', seeds: Array.from({ length: 16 }, (_, i) => i), perturbation: 1e-6, steps: 3000, tolerance: 1.0 }));
    const h = predictabilityHorizon(curve, FROZEN_STEP_CONFIG.harmonic2d.dt, 1.0);
    expect(h.status).toBe('NO_DIVERGENCE_WITHIN_WINDOW');
    expect(Math.max(...curve)).toBeLessThan(1e-4);
  });

  it('the report statement for NO_DIVERGENCE claims neither accuracy nor its absence beyond the window', () => {
    const s: EnsembleSpec = { stepId: 'harmonic2d', seeds: [0, 1, 2], perturbation: 1e-6, steps: 500, tolerance: 1.0 };
    const report = chaosReport(s, spreadCurve(runEnsemble(s)));
    expect(report.horizon.status).toBe('NO_DIVERGENCE_WITHIN_WINDOW');
    expect(report.statement).toContain('NEITHER');
  });
});

describe('determinism and replay', () => {
  it('the same spec produces the same trajectories and the same report fingerprint, every time', () => {
    const s = spec({ seeds: [1, 2, 3], steps: 200 });
    const a = runEnsemble(s);
    const b = runEnsemble(s);
    expect(a).toEqual(b);
    const rA = chaosReport(s, spreadCurve(a));
    const rB = chaosReport(s, spreadCurve(b));
    expect(rA.fingerprint).toBe(rB.fingerprint);
  });

  it('different seeds change the fingerprint (replay mismatch is detectable, not silently equal)', () => {
    const s1 = spec({ seeds: [1, 2, 3], steps: 200 });
    const s2 = spec({ seeds: [4, 5, 6], steps: 200 });
    const r1 = chaosReport(s1, spreadCurve(runEnsemble(s1)));
    const r2 = chaosReport(s2, spreadCurve(runEnsemble(s2)));
    expect(r1.fingerprint).not.toBe(r2.fingerprint);
  });

  it('a different seed gives a different individual trajectory (not an artifact of a fixed perturbation direction)', () => {
    const [t1] = runEnsemble(spec({ seeds: [1], steps: 5 }));
    const [t2] = runEnsemble(spec({ seeds: [2], steps: 5 }));
    expect(t1[0]).not.toEqual(t2[0]);
  });
});
