import { describe, expect, it } from 'vitest';
import { runExperiment, runExperimentSafe, replay } from '../core/physicsWorld/experiment';
import { FailClosedError, type ExperimentDefinition, type ParamSpec } from '../core/physicsWorld/contracts';
import { MODEL_REGISTRY, CARD_HE, CARD_ATOM } from '../core/physicsWorld/models';
import { demo5GenesisLoop } from '../core/physicsWorld/genesisAdapter';
import { detectBackends } from '../core/physicsWorld/backends';

/**
 * PHYSICS WORLD — vitest port of the source bundle's `physicsTests()`
 * (docs/DECISIONS.md D-052, mandate item 3: "Vitest + brakujące testy
 * R4-R15"). Test names below cross-reference the bundle's own rule numbers
 * (R6-R15) where they map directly.
 *
 * R9 IS DELIBERATELY DIFFERENT FROM THE SOURCE BUNDLE: the bundle's own
 * R9 test asserted a SHA-256 hex fingerprint (64 chars). This integration
 * reuses the EXISTING Genesis hash provider (`core/events/hash.ts`, FNV-1a,
 * 8 hex chars) instead of adding a second, SHA-256-based crypto system —
 * see `core/physicsWorld/core.ts`'s module header for the full reasoning.
 * The assertion below checks the REAL provider's real output format.
 */

const transportParams = (): readonly ParamSpec[] => [
  { name: 'z', value: 2, unit: 'e', min: 1, max: 10, required: true },
  { name: 'E0_MeV', value: 200, unit: 'MeV', min: 10, max: 500, required: true },
  { name: 'mat_Z', value: 13, unit: '-', min: 1, max: 92, required: true },
  { name: 'mat_A', value: 27, unit: '-', min: 1, max: 250, required: true },
  { name: 'rho_g_cm3', value: 2.7, unit: 'g/cm3', min: 0.1, max: 25, required: true },
  { name: 'thickness_cm', value: 0.5, unit: 'cm', min: 0.01, max: 10, required: true },
];

const def = (over: Partial<ExperimentDefinition> = {}): ExperimentDefinition => ({
  experimentId: 'T1',
  problemId: 'P',
  hypothesisId: 'H',
  modelId: 'M-TRANSPORT-001',
  seed: 7,
  observable: 'deposited',
  toyAccepted: true,
  provenance: [{ source: 'test', retrievedAt: '1970-01-01T00:00:00Z' }],
  parameters: transportParams(),
  ...over,
});

const heParams = (): readonly ParamSpec[] => [
  { name: 'resonanceMass', value: 91.19, unit: 'GeV', min: 1, max: 1000, required: true },
  { name: 'width', value: 2.5, unit: 'GeV', min: 0.1, max: 50, required: true },
  { name: 'nEvents', value: 100, unit: '-', min: 100, max: 1000000, required: true },
  { name: 'sigmaDetector', value: 1.5, unit: 'GeV', min: 0.01, max: 10, required: true },
];

describe('runExperiment — determinism, reproducibility, fail-closed (R9-R13)', () => {
  it('same seed ⇒ same fingerprint (determinism)', () => {
    const a = runExperiment(def());
    const b = runExperiment(def());
    expect(a.reproducibilityFingerprint).toBe(b.reproducibilityFingerprint);
  });

  it('R9 (adapted): fingerprint is the real Genesis hash provider output — fnv1a, 8 lowercase hex chars, not a fabricated SHA-256 length', () => {
    const a = runExperiment(def());
    expect(a.reproducibilityFingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it('R11: replay() genuinely re-runs the experiment and the two fingerprints match — never a stubbed true', () => {
    const a = runExperiment(def());
    expect(replay(def(), a)).toBe(true);
  });

  it('different seed ⇒ different fingerprint (the seed is part of the fingerprinted input)', () => {
    const a = runExperiment(def());
    const b = runExperiment(def({ seed: 8 }));
    expect(a.reproducibilityFingerprint).not.toBe(b.reproducibilityFingerprint);
  });

  it('fail-closed on a missing required parameter', () => {
    expect(() => runExperiment(def({ parameters: transportParams().filter((p) => p.name !== 'z') }))).toThrowError(FailClosedError);
    try {
      runExperiment(def({ parameters: transportParams().filter((p) => p.name !== 'z') }));
    } catch (e) {
      expect(e).toBeInstanceOf(FailClosedError);
      expect((e as FailClosedError).code).toBe('PARAMS');
    }
  });

  it('fail-closed on an out-of-range parameter', () => {
    const bad = transportParams().map((p) => (p.name === 'z' ? { ...p, value: 99 } : p));
    expect(() => runExperiment(def({ parameters: bad }))).toThrowError(FailClosedError);
  });

  it('R6/R13: a toy model without explicit toyAccepted=true fails closed with TOY_NOT_ACCEPTED', () => {
    try {
      runExperiment(def({ toyAccepted: undefined }));
      expect.unreachable('expected FailClosedError');
    } catch (e) {
      expect(e).toBeInstanceOf(FailClosedError);
      expect((e as FailClosedError).code).toBe('TOY_NOT_ACCEPTED');
    }
  });

  it('R14: a requested backend that is unavailable fails closed with ADAPTER_UNAVAILABLE — NEVER falls back to the toy model', () => {
    expect(detectBackends().PYTHIA_ADAPTER.available).toBe(false);
    try {
      runExperiment(def({ modelId: 'M-HE-001', observable: 'invariant mass', parameters: heParams(), backendRequest: 'PYTHIA_ADAPTER' }));
      expect.unreachable('expected FailClosedError');
    } catch (e) {
      expect(e).toBeInstanceOf(FailClosedError);
      expect((e as FailClosedError).code).toBe('ADAPTER_UNAVAILABLE');
      expect(String((e as FailClosedError).message)).toMatch(/NO fallback to toy/);
    }
  });

  it('R15: runExperimentSafe with an unavailable requested backend returns an explicit, empty, ADAPTER_UNAVAILABLE record — never a faked result', () => {
    expect(detectBackends().GEANT4_ADAPTER.available).toBe(false);
    const safe = runExperimentSafe(def({ modelId: 'M-HE-001', observable: 'x', parameters: heParams(), backendRequest: 'GEANT4_ADAPTER' }));
    expect(safe.status).toBe('ADAPTER_UNAVAILABLE');
    expect(safe.result.values.length).toBe(0);
    expect(safe.failReason).toBeDefined();
  });

  it('R12: every completed record carries disclosure, toy flag, assumptions, provenance, uncertainty, and modelVersion', () => {
    const a = runExperiment(def());
    expect(a.disclosure.length).toBeGreaterThan(10);
    expect(a.toy).toBe(true);
    expect(a.assumptions.length).toBeGreaterThan(0);
    expect(a.provenance.length).toBeGreaterThan(0);
    expect(Object.keys(a.uncertainty).length).toBeGreaterThan(0);
    expect(a.modelVersion).toBeTruthy();
  });

  it('immutable experiment record: frozen, and a mutation attempt throws under strict mode', () => {
    const a = runExperiment(def());
    expect(Object.isFrozen(a)).toBe(true);
    expect(() => {
      (a as unknown as { status: string }).status = 'COMPLETED';
    }).toThrow();
  });
});

describe('R7/R8 — model card disclosures name what each toy is NOT', () => {
  it('M-HE-001 disclosure names PYTHIA/Geant4/collider and never claims "live"', () => {
    expect(CARD_HE.disclosure).toMatch(/NOT PYTHIA/);
    expect(CARD_HE.disclosure).toMatch(/NOT Geant4/);
    expect(CARD_HE.disclosure).toMatch(/NOT a collider/);
    expect(CARD_HE.disclosure).not.toMatch(/live/i);
  });

  it('M-ATOM-001 disclosure names that it is not a quantum chemistry engine', () => {
    expect(CARD_ATOM.disclosure).toMatch(/NOT a quantum chemistry engine/);
  });

  it('R6: every registered model is labelled toy and carries the TOY/TEST MODEL marker', () => {
    for (const entry of Object.values(MODEL_REGISTRY)) {
      expect(entry.card.toy).toBe(true);
      expect(entry.card.disclosure).toContain('TOY/TEST MODEL');
    }
  });
});

describe('M-COUL-001 v0.2.1 — Rutherford scattering cross-check (repaired, docs/DECISIONS.md D-053)', () => {
  /**
   * FIXED DEFECT (D-052 found it, D-053 repairs it, patch applied exactly
   * as specified). Convention: `r` = vector from the origin to the
   * projectile, `F = (k / r^2) * r_hat`, `k = q1q2` (k > 0 repulsive, k < 0
   * attractive), `theta = atan2(vy_final, vx_final)`, entering along +x
   * from `x0 = -200`, impact parameter `b > 0`, exiting at `EXIT_R = 600`.
   *
   * The prior version applied the acceleration toward the origin for
   * k > 0 (attractive) while comparing against `thetaAnalytic`, the
   * REPULSIVE-scattering Rutherford formula, over a much shorter flight
   * path (`x0 = -50`, exit at `r = 200`) — both the wrong sign and a flight
   * path too short to reach the asymptotic angle this toy model reports.
   * `thetaAnalytic` was NOT touched and is never used to produce
   * `thetaNumeric` — this describe block proves the independently
   * integrated numeric trajectory now agrees with that unchanged formula.
   */
  const repulsiveParams = () => [
    { name: 'q1q2', value: 1, unit: 'arb', min: -10, max: 10, required: true },
    { name: 'E', value: 1, unit: 'arb', min: 0.01, max: 100, required: true },
    { name: 'b', value: 1, unit: 'arb', min: 0.1, max: 50, required: true },
    { name: 'm', value: 1, unit: 'arb', min: 0.1, max: 100, required: true },
  ];

  // 1. Repulsive benchmark: k=+1, b=1, E=1, m=1.
  it('1. repulsive benchmark (k=+1,b=1,E=1,m=1): thetaNumeric > 0 and agrees with thetaAnalytic = 2*atan(k/(2*b*E))', () => {
    const rec = runExperiment(def({ experimentId: 'T3-repulsive', modelId: 'M-COUL-001', observable: 'angle', parameters: repulsiveParams() }));
    const { thetaNumeric, thetaAnalytic, validationDelta } = rec.result.summary;
    expect(thetaAnalytic).toBeCloseTo(2 * Math.atan(1 / (2 * 1 * 1)), 12);
    expect(thetaNumeric).toBeGreaterThan(0);
    expect(thetaNumeric).toBeCloseTo(0.9253354611848966, 8);
    expect(validationDelta).toBeLessThan(0.05);
  });

  // 2. Attractive benchmark: k=-1, b=1, E=1, m=1.
  it('2. attractive benchmark (k=-1,b=1,E=1,m=1): thetaAnalytic < 0, thetaNumeric < 0, numeric/analytic agree', () => {
    const rec = runExperiment(def({ experimentId: 'T3-attractive', modelId: 'M-COUL-001', observable: 'angle', parameters: repulsiveParams().map((p) => (p.name === 'q1q2' ? { ...p, value: -1 } : p)) }));
    const { thetaNumeric, thetaAnalytic, validationDelta } = rec.result.summary;
    expect(thetaAnalytic).toBeLessThan(0);
    expect(thetaAnalytic).toBeCloseTo(2 * Math.atan(-1 / (2 * 1 * 1)), 12);
    expect(thetaNumeric).toBeLessThan(0);
    expect(thetaNumeric).toBeCloseTo(-0.9282327879032978, 8);
    expect(validationDelta).toBeLessThan(0.05);
  });

  // 3. Regression: the old defect (~1.86 rad delta) no longer occurs.
  it('3. regression: the old ~1.86 rad defect is gone — validationDelta is two orders of magnitude smaller', () => {
    const rec = runExperiment(def({ experimentId: 'T3-regression', modelId: 'M-COUL-001', observable: 'angle', parameters: repulsiveParams() }));
    expect(rec.result.summary.validationDelta).toBeLessThan(0.01);
    expect(rec.result.summary.validationDelta).not.toBeCloseTo(1.8615312059978102, 1);
  });

  // 4. Convergence: dt=0.05 vs dt=0.025 (maxSteps scaled to cover the same physical flight path) — delta stabilizes, does not diverge.
  it('4. convergence: halving dt stabilizes validationDelta rather than diverging', () => {
    const at = (dt: number, maxSteps: number) =>
      runExperiment(
        def({
          experimentId: `T3-conv-${dt}`,
          modelId: 'M-COUL-001',
          observable: 'angle',
          parameters: [...repulsiveParams(), { name: 'dt', value: dt, unit: 'arb', min: 0.0001, max: 0.5, required: false }, { name: 'maxSteps', value: maxSteps, unit: '-', min: 100, max: 400000, required: false }],
        }),
      ).result.summary.validationDelta;

    const d1 = at(0.05, 20000);
    const d2 = at(0.025, 40000);
    const d3 = at(0.0125, 80000);
    expect(Math.abs(d2 - d1)).toBeLessThan(5e-5);
    expect(Math.abs(d3 - d2)).toBeLessThanOrEqual(Math.abs(d2 - d1) + 1e-6);
    expect(d1).toBeLessThan(0.05);
    expect(d2).toBeLessThan(0.05);
    expect(d3).toBeLessThan(0.05);
  });

  // 5. Replay/determinism: the same definition produces an identical fingerprint and result.
  it('5. replay/determinism: the same ExperimentDefinition twice yields an identical fingerprint and result', () => {
    const rec = runExperiment(def({ experimentId: 'T3-replay', modelId: 'M-COUL-001', observable: 'angle', parameters: repulsiveParams() }));
    const again = runExperiment(def({ experimentId: 'T3-replay', modelId: 'M-COUL-001', observable: 'angle', parameters: repulsiveParams() }));
    expect(again.reproducibilityFingerprint).toBe(rec.reproducibilityFingerprint);
    expect(replay(def({ experimentId: 'T3-replay', modelId: 'M-COUL-001', observable: 'angle', parameters: repulsiveParams() }), rec)).toBe(true);
  });

  // 6. Provenance: modelVersion 0.2.1 and the new card are recorded.
  it('6. provenance: the record carries modelVersion 0.2.1 (the repaired card)', () => {
    const rec = runExperiment(def({ experimentId: 'T3-provenance', modelId: 'M-COUL-001', observable: 'angle', parameters: repulsiveParams() }));
    expect(rec.modelVersion).toBe('0.2.1');
    expect(rec.toy).toBe(true);
    expect(rec.disclosure.length).toBeGreaterThan(0);
  });

  it('an ExperimentDefinition without dt/maxSteps (every pre-existing caller) is unaffected by their presence in the contract', () => {
    const rec = runExperiment(def({ experimentId: 'T3-compat', modelId: 'M-COUL-001', observable: 'angle', parameters: repulsiveParams() }));
    expect(rec.parameters.some((p) => p.name === 'dt' || p.name === 'maxSteps')).toBe(false);
  });
});

describe('demo5GenesisLoop — decided via D-047 (Genesis Adjudication Protocol), not a bespoke verdict function', () => {
  it('H1 (z^2 scaling) holds, H2 (z linear) does not, and the funnel returns a non-forced WINNER for H1', () => {
    const loop = demo5GenesisLoop();
    const h1 = loop.hypotheses.find((h) => h.hypothesisId === 'H1');
    const h2 = loop.hypotheses.find((h) => h.hypothesisId === 'H2');
    expect(h1?.held).toBe(true);
    expect(h2?.held).toBe(false);
    expect(loop.verdict).toBe('WINNER');
    expect(loop.winner).toBe('H1');
  });

  it('each hypothesis carries a real, non-empty ruleFingerprint and inputFingerprint from the D-047 protocol', () => {
    const loop = demo5GenesisLoop();
    for (const h of loop.hypotheses) {
      expect(h.ruleFingerprint).toMatch(/^[0-9a-f]{8}$/);
      expect(h.inputFingerprint).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it('running the loop twice produces the identical verdict and identical fingerprints (reproducibility, no hidden state)', () => {
    const a = demo5GenesisLoop();
    const b = demo5GenesisLoop();
    expect(a.verdict).toBe(b.verdict);
    expect(a.winner).toBe(b.winner);
    expect(a.hypotheses.map((h) => h.ruleFingerprint)).toEqual(b.hypotheses.map((h) => h.ruleFingerprint));
  });
});
