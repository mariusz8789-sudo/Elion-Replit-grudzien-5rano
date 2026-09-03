import { describe, expect, it } from 'vitest';
import {
  circularOrbitSpeed,
  gravitationalFractionalExcess,
  lorentzFactor,
  PHYSICAL_CONSTANTS,
  replayRelativisticTimeDilationCase,
  runRelativisticTimeDilationCase,
  savePhysicsCaseToMemory,
  specialRelativisticFractionalDeficit,
  SPEED_OF_LIGHT_M_PER_S,
  toStandardScientificResult,
} from '../core/discovery/physics/relativisticTimeDilation';
import { toNextScientificAction } from '../core/discovery/physics/physicsCaseContract';

describe('relativistic time dilation — pure formulas', () => {
  it('circularOrbitSpeed refuses a non-positive radius', () => {
    expect(() => circularOrbitSpeed(1, 0)).toThrow(/positive/);
    expect(() => circularOrbitSpeed(1, -1)).toThrow(/positive/);
  });

  it('circularOrbitSpeed matches GM/r^2 = v^2/r for a real Earth-orbit case', () => {
    const gm = PHYSICAL_CONSTANTS.earthGravitationalParameter!.value;
    const r = PHYSICAL_CONSTANTS.gpsOrbitalRadius!.value;
    const v = circularOrbitSpeed(gm, r);
    expect(v).toBeCloseTo(Math.sqrt(gm / r), 6);
    expect(v).toBeGreaterThan(3000);
    expect(v).toBeLessThan(4000);
  });

  it('lorentzFactor throws once speed reaches or exceeds c', () => {
    expect(() => lorentzFactor(SPEED_OF_LIGHT_M_PER_S, SPEED_OF_LIGHT_M_PER_S)).toThrow(/less than the speed of light/);
    expect(() => lorentzFactor(SPEED_OF_LIGHT_M_PER_S * 1.1, SPEED_OF_LIGHT_M_PER_S)).toThrow(/less than the speed of light/);
  });

  it('lorentzFactor is 1 at rest and grows with speed', () => {
    expect(lorentzFactor(0, SPEED_OF_LIGHT_M_PER_S)).toBeCloseTo(1, 12);
    const slow = lorentzFactor(1000, SPEED_OF_LIGHT_M_PER_S);
    const fast = lorentzFactor(1e7, SPEED_OF_LIGHT_M_PER_S);
    expect(fast).toBeGreaterThan(slow);
    expect(slow).toBeGreaterThan(1);
  });

  it('specialRelativisticFractionalDeficit is the low-speed limit of (gamma - 1)/gamma', () => {
    const v = 3874; // ~GPS orbital speed
    const deficit = specialRelativisticFractionalDeficit(v, SPEED_OF_LIGHT_M_PER_S);
    const gamma = lorentzFactor(v, SPEED_OF_LIGHT_M_PER_S);
    const exact = 1 - 1 / gamma;
    expect(deficit).toBeCloseTo(exact, 9);
  });

  it('gravitationalFractionalExcess requires rHigh strictly above rLow', () => {
    expect(() => gravitationalFractionalExcess(1, 100, 100, SPEED_OF_LIGHT_M_PER_S)).toThrow(/rHigh must exceed rLow/);
    expect(() => gravitationalFractionalExcess(1, 100, 50, SPEED_OF_LIGHT_M_PER_S)).toThrow(/rHigh must exceed rLow/);
  });

  it('gravitationalFractionalExcess is positive whenever rHigh > rLow', () => {
    const excess = gravitationalFractionalExcess(
      PHYSICAL_CONSTANTS.earthGravitationalParameter!.value,
      PHYSICAL_CONSTANTS.earthEquatorialRadius!.value,
      PHYSICAL_CONSTANTS.gpsOrbitalRadius!.value,
      SPEED_OF_LIGHT_M_PER_S,
    );
    expect(excess).toBeGreaterThan(0);
  });
});

describe('relativistic time dilation — the GPS case, derived not fabricated', () => {
  it('produces a self-consistent result: exactly one hypothesis SUPPORTED, matching the sign of the net rate', () => {
    const result = runRelativisticTimeDilationCase();
    const supported = result.hypotheses.filter((h) => h.verdict === 'SUPPORTED');
    const falsified = result.hypotheses.filter((h) => h.verdict === 'FALSIFIED');
    expect(supported).toHaveLength(1);
    expect(falsified).toHaveLength(1);

    if (result.netDirection === 'SATELLITE_CLOCK_NET_FASTER') {
      expect(supported[0]!.hypothesisId).toBe('H_GR_DOMINATES');
      expect(result.netFractionalRate).toBeGreaterThan(0);
    } else {
      expect(supported[0]!.hypothesisId).toBe('H_SR_DOMINATES');
      expect(result.netFractionalRate).toBeLessThan(0);
    }
  });

  it('for the real GPS orbit, GR dominates and the satellite clock runs net faster, on the order of tens of microseconds/day', () => {
    const result = runRelativisticTimeDilationCase();
    expect(result.netDirection).toBe('SATELLITE_CLOCK_NET_FASTER');
    expect(result.netMicrosecondsPerDay).toBeGreaterThan(10);
    expect(result.netMicrosecondsPerDay).toBeLessThan(100);
  });

  it('never asserts EMPIRICAL_FIT — every hypothesis is decided by derivation from established physics', () => {
    const result = runRelativisticTimeDilationCase();
    for (const h of result.hypotheses) {
      expect(h.basis).toBe('DERIVATION_FROM_ESTABLISHED_PHYSICS');
    }
  });

  it('separates FACT, THEORY and ASSUMPTIONS as distinct, non-empty arrays', () => {
    const result = runRelativisticTimeDilationCase();
    expect(result.fact.length).toBeGreaterThan(0);
    expect(result.theory.length).toBeGreaterThan(0);
    expect(result.assumptions.length).toBeGreaterThan(0);
  });

  it('is deterministic: two independent runs produce the identical fingerprint', () => {
    const a = runRelativisticTimeDilationCase();
    const b = runRelativisticTimeDilationCase();
    expect(a.resultFingerprint).toBe(b.resultFingerprint);
  });
});

describe('relativistic time dilation — replay', () => {
  it('replays MATCH against its own freshly recomputed result', () => {
    const saved = runRelativisticTimeDilationCase();
    const replay = replayRelativisticTimeDilationCase(saved);
    expect(replay.status).toBe('MATCH');
  });

  it('replays DRIFT when the saved fingerprint has been tampered with', () => {
    const saved = runRelativisticTimeDilationCase();
    const tampered = { ...saved, resultFingerprint: `${saved.resultFingerprint}0` };
    const replay = replayRelativisticTimeDilationCase(tampered);
    expect(replay.status).toBe('DRIFT');
  });
});

describe('relativistic time dilation — Scientific Memory', () => {
  it('saves to memory with an experimentId keyed on the result fingerprint, never a timestamp', () => {
    const result = runRelativisticTimeDilationCase();
    const saved = savePhysicsCaseToMemory(result);
    expect(saved.experimentId).toContain(result.resultFingerprint);
    expect(saved.epistemicStatus).toContain('BASIS=DERIVATION_FROM_ESTABLISHED_PHYSICS');
    expect(saved.honestyNote).toMatch(/never an empirical fit/);
  });

  it('re-running the identical derivation saves to the SAME experiment identity', () => {
    const a = savePhysicsCaseToMemory(runRelativisticTimeDilationCase());
    const b = savePhysicsCaseToMemory(runRelativisticTimeDilationCase());
    expect(a.experimentId).toBe(b.experimentId);
  });
});

describe('relativistic time dilation — StandardScientificResult projection', () => {
  it('projects into the generic contract with a matching fingerprint and non-empty derivation trail', () => {
    const result = runRelativisticTimeDilationCase();
    const standard = toStandardScientificResult(result);
    expect(standard.domainId).toBe('PHYSICS');
    expect(standard.caseId).toBe('GPS_TIME_DILATION');
    expect(standard.resultFingerprint).toBe(result.resultFingerprint);
    expect(standard.equations.length).toBeGreaterThan(0);
    expect(standard.calculation.length).toBeGreaterThan(0);
    expect(standard.falsificationCriteria).toHaveLength(2);
    expect(standard.epistemicTag).toBe('DERIVED');
  });

  it('projects into a NextScientificAction that fails closed (requires external data, missing input declared)', () => {
    const standard = toStandardScientificResult(runRelativisticTimeDilationCase());
    const action = toNextScientificAction(standard);
    expect(action.availability).toBe('REQUIRES_EXTERNAL_DATA');
    expect(action.missingInputs).toContain('independently-measured-comparison-value');
    expect(action.targetHypothesisIds).toContain('GPS_TIME_DILATION');
  });
});
