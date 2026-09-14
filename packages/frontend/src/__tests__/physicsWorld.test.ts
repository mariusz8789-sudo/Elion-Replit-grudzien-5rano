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

describe('M-COUL-001 — Rutherford scattering cross-check', () => {
  /**
   * DEFECT (found while integrating, not introduced by this pass): the
   * source bundle's own `physicsTests()` asserted
   * `coul.result.summary.validationDelta < 0.05`. Running the model exactly
   * as ported (verified against the bundle's own RUN_COULOMB source
   * character-for-character) produces validationDelta ≈ 1.86 rad, not < 0.05.
   *
   * The acceleration in RUN_COULOMB (`ax: -a*x/r, ay: -a*y/r` with
   * `a = k/(m*r^2)`) points TOWARD the origin for a positive k (like
   * charges), i.e. an ATTRACTIVE force — but `thetaAnalytic` is the standard
   * Rutherford formula for REPULSIVE scattering. The numeric trajectory and
   * the analytic cross-check it is compared against assume opposite force
   * directions, so they disagree by design, not by a transcription error.
   *
   * Per the integration mandate ("Nie dodawaj nowych funkcji naukowych" —
   * do not add new scientific functions), this pass does NOT flip the sign
   * to "fix" the physics; that is a scientific change outside this pass's
   * scope and is flagged to the user instead. This test characterizes the
   * REAL, current behaviour (pinned exactly, matching this session's
   * established convention for a known, disclosed defect) rather than
   * asserting the bundle's own untested claim, which does not hold.
   */
  it('DEFECT: validationDelta is far larger than the bundle\'s own <0.05 claim — numeric (attractive) and analytic (repulsive) trajectories disagree in sign', () => {
    const rec = runExperiment(
      def({
        experimentId: 'T3',
        modelId: 'M-COUL-001',
        observable: 'angle',
        parameters: [
          { name: 'q1q2', value: 1, unit: 'arb', min: 0.01, max: 10, required: true },
          { name: 'E', value: 1, unit: 'arb', min: 0.01, max: 100, required: true },
          { name: 'b', value: 1, unit: 'arb', min: 0.1, max: 50, required: true },
          { name: 'm', value: 1, unit: 'arb', min: 0.1, max: 100, required: true },
        ],
      }),
    );
    expect(rec.result.summary.thetaNumeric).toBeCloseTo(-0.9342359879961979, 10);
    expect(rec.result.summary.thetaAnalytic).toBeCloseTo(0.9272952180016122, 10);
    expect(rec.result.summary.validationDelta).toBeCloseTo(1.8615312059978102, 10);
    expect(rec.result.summary.validationDelta).toBeGreaterThan(0.05);
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
