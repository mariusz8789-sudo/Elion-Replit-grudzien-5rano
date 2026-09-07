import { describe, expect, it } from 'vitest';
import {
  assessDamage,
  assessStructuralDamage,
  DAMAGE_STATE,
  damageStateLabel,
  DAMAGE_STATE_LABELS,
  exceedanceProbability,
  FRAGILITY_MODELS,
  FRAGILITY_REQUIRED_DATA,
  FragilityRegistry,
  INTENSITY_MEASURE,
  standardNormalCdf,
  type FragilityModel,
} from '../core/worldModel/domains/seismicFragility';
import {
  buildSeismicShakingWorld,
  makeSeismicSourceSolver,
  makeStructuralSiteSolver,
  SEISMIC_SOURCE_SOLVER_ID,
  STRUCTURAL_DAMAGE_STATE_CODE,
  STRUCTURAL_SITE_SOLVER_ID,
  structuralDamageAssessment,
  applySeismicRupture,
} from '../core/worldModel/domains/seismicShaking';
import { withCrossDomainCouplings } from '../core/worldModel/crossDomain/crossDomainCoupling';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * PHASE 8.3 — SEISMIC FRAGILITY.
 *
 * Three attempts to obtain real published fragility curves failed (FEMA blocked
 * by egress, GEM non-commercial, third-party reproductions partial and
 * unlicensed) and surfaced a deeper blocker: Hazus building fragility is indexed
 * on spectral displacement, and this world model produces a synthetic PGA.
 *
 * So what is tested here is the machinery and the refusals — and, above all,
 * that no numbers were invented to fill the gap.
 */

/** A model with deliberately made-up numbers, used ONLY to exercise the machinery. It is never registered as real. */
const SYNTHETIC_TEST_MODEL: FragilityModel = {
  id: 'test-only-not-real',
  buildingClass: 'TESTCLASS',
  intensityMeasure: INTENSITY_MEASURE.PGA_G,
  citation: 'TEST FIXTURE — invented numbers, not a published fragility set',
  license: 'n/a (test fixture)',
  functions: [
    { damageState: DAMAGE_STATE.SLIGHT, medianIM: 0.1, betaLn: 0.6 },
    { damageState: DAMAGE_STATE.MODERATE, medianIM: 0.2, betaLn: 0.6 },
    { damageState: DAMAGE_STATE.EXTENSIVE, medianIM: 0.4, betaLn: 0.6 },
    { damageState: DAMAGE_STATE.COMPLETE, medianIM: 0.8, betaLn: 0.6 },
  ],
};

describe('No curves were invented', () => {
  it('the shipped catalogue is empty, and stays empty until a real cited set is added', () => {
    expect(FRAGILITY_MODELS).toHaveLength(0);
    expect(new FragilityRegistry().size).toBe(0);
  });

  it('the named gaps say WHY, specifically enough to act on', () => {
    const text = FRAGILITY_REQUIRED_DATA.map((r) => `${r.requirement} ${r.rationale}`).join(' ');
    expect(text).toMatch(/egress proxy/);        // FEMA unreachable here
    expect(text).toMatch(/CC BY-NC-SA/);         // GEM licence blocks vendoring
    expect(text).toMatch(/SPECTRAL DISPLACEMENT/); // the real blocker
    expect(text).toMatch(/capacity curve/);
  });
});

describe('The mathematics is real, because it is mathematics', () => {
  it('the normal CDF matches known values', () => {
    expect(standardNormalCdf(0)).toBeCloseTo(0.5, 7);
    expect(standardNormalCdf(1)).toBeCloseTo(0.8413447, 6);
    expect(standardNormalCdf(-1)).toBeCloseTo(0.1586553, 6);
    expect(standardNormalCdf(1.96)).toBeCloseTo(0.9750021, 6);
    expect(standardNormalCdf(-3)).toBeCloseTo(0.0013499, 6);
    expect(standardNormalCdf(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('at the median intensity the exceedance probability is exactly one half', () => {
    const fn = { damageState: DAMAGE_STATE.MODERATE, medianIM: 0.25, betaLn: 0.7 } as const;
    expect(exceedanceProbability(fn, 0.25)).toBeCloseTo(0.5, 7);
    expect(exceedanceProbability(fn, 0.5)).toBeGreaterThan(0.5);
    expect(exceedanceProbability(fn, 0.1)).toBeLessThan(0.5);
  });

  it('no shaking means no damage, and never a logarithm of zero', () => {
    const fn = { damageState: DAMAGE_STATE.SLIGHT, medianIM: 0.1, betaLn: 0.6 } as const;
    for (const bad of [0, -1, Number.NaN]) expect(exceedanceProbability(fn, bad)).toBe(0);
  });

  it('discrete damage-state probabilities are the differences, and they sum to the slight exceedance', () => {
    const result = assessDamage({ model: SYNTHETIC_TEST_MODEL, hazardIntensityMeasure: INTENSITY_MEASURE.PGA_G, hazardIntensity: 0.3, hazardCalibrated: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Exceedance is non-increasing with damage state: reaching COMPLETE is never likelier than SLIGHT.
    for (let i = 1; i < result.exceedance.length; i++) {
      expect(result.exceedance[i].probability).toBeLessThanOrEqual(result.exceedance[i - 1].probability);
    }
    const summed = result.discrete.reduce((total, entry) => total + entry.probability, 0);
    expect(summed).toBeCloseTo(result.exceedance[0].probability, 10);
  });
});

describe('The refusals are the useful part today', () => {
  it('a PGA cannot be fed to spectral-displacement curves — refused, not unit-matched', () => {
    const sdModel: FragilityModel = { ...SYNTHETIC_TEST_MODEL, id: 'sd-model', intensityMeasure: INTENSITY_MEASURE.SD_IN };
    const result = assessDamage({ model: sdModel, hazardIntensityMeasure: INTENSITY_MEASURE.PGA_G, hazardIntensity: 0.3, hazardCalibrated: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/intensity_measure_mismatch/);
    expect(result.reason).toMatch(/capacity curve/);
  });

  it('an empty catalogue refuses by naming what is missing', () => {
    const result = assessStructuralDamage(new FragilityRegistry(), 'MEDIUM', INTENSITY_MEASURE.PGA_G, 0.4, false);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/no_fragility_model_available/);
    expect(result.reason).toMatch(/licence-compatible published fragility set/);
  });

  it('a published curve does not launder an uncalibrated input — grounding is the weakest link', () => {
    const calibrated = assessDamage({ model: SYNTHETIC_TEST_MODEL, hazardIntensityMeasure: INTENSITY_MEASURE.PGA_G, hazardIntensity: 0.3, hazardCalibrated: true });
    const synthetic = assessDamage({ model: SYNTHETIC_TEST_MODEL, hazardIntensityMeasure: INTENSITY_MEASURE.PGA_G, hazardIntensity: 0.3, hazardCalibrated: false });
    expect(calibrated.ok && calibrated.grounding).toBe('MODEL_ESTIMATE');
    expect(synthetic.ok && synthetic.grounding).toBe('UNGROUNDED_APPROXIMATION');
  });
});

describe('Registration is validated, not trusted', () => {
  it('an uncited or unlicensed set is rejected — once in the code it would be indistinguishable from an invented one', () => {
    const registry = new FragilityRegistry();
    expect(() => registry.register({ ...SYNTHETIC_TEST_MODEL, citation: '  ' })).toThrow(/no citation/);
    expect(() => registry.register({ ...SYNTHETIC_TEST_MODEL, license: '' })).toThrow(/no license/);
  });

  it('a nonsensical curve is rejected rather than silently producing a probability', () => {
    const registry = new FragilityRegistry();
    expect(() => registry.register({ ...SYNTHETIC_TEST_MODEL, functions: [{ damageState: DAMAGE_STATE.SLIGHT, medianIM: 0, betaLn: 0.6 }] })).toThrow(/non-positive median/);
    expect(() => registry.register({ ...SYNTHETIC_TEST_MODEL, functions: [{ damageState: DAMAGE_STATE.SLIGHT, medianIM: 0.1, betaLn: 0 }] })).toThrow(/non-positive beta/);
    expect(() => registry.register({ ...SYNTHETIC_TEST_MODEL, functions: [] })).toThrow(/no damage-state curves/);
  });

  it('damage-state labels are total', () => {
    expect(damageStateLabel(DAMAGE_STATE.COMPLETE)).toBe('DAMAGE_COMPLETE');
    for (const nonsense of [-1, 99, Number.NaN]) expect(DAMAGE_STATE_LABELS).toContain(damageStateLabel(nonsense));
  });
});

describe('The seismic domain now ASKS instead of assuming', () => {
  function shakenWorld() {
    const world = buildSeismicShakingWorld({ magnitude: 6.5, depthKm: 10 });
    const router = new SolverRouter();
    router.register(SEISMIC_SOURCE_SOLVER_ID, makeSeismicSourceSolver());
    router.register(STRUCTURAL_SITE_SOLVER_ID, makeStructuralSiteSolver());
    const engine = new TemporalEngine(world.graph);
    const updater = withCrossDomainCouplings((g, dt, tick) => router.routeTick(g, dt, tick), [world.coupling]);
    engine.advance(1, updater);
    applySeismicRupture(engine, world.sourceId);
    engine.advance(1, updater);
    return { world, engine };
  }

  it('a really-shaken site still reports damage NOT_MODELLED — now as a checked refusal', () => {
    const { world, engine } = shakenWorld();
    for (const siteId of world.siteIds) {
      const site = engine.graph.getEntity(siteId);
      expect(site.domainState!.peakGroundAccelerationG).toBeGreaterThan(0); // it really was shaken
      expect(site.domainState!.structuralDamageStateCode).toBe(STRUCTURAL_DAMAGE_STATE_CODE.NOT_MODELLED);
      // Rule 3: "asked and refused" is itself a number, distinguishable from "never asked".
      expect(site.domainState!.damageAssessedCode).toBe(0);

      const assessment = structuralDamageAssessment(site);
      expect(assessment.ok).toBe(false);
      if (!assessment.ok) expect(assessment.reason).toMatch(/no_fragility_model_available/);
    }
  });
});
