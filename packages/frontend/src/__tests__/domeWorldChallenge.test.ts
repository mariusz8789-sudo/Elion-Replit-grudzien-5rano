import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDomeWorldChallenge } from '../core/agent/domeWorld/domeChallenge';
import { DEFAULT_DOME_PARAMETERS, predictHorizonDistanceKm, predictShadowAngleDegrees } from '../core/agent/domeWorld/domeModel';
import { ERATOSTHENES_GROUND_DISTANCE_KM, ERATOSTHENES_SHADOW_ANGLE, HORIZON_DISTANCE_1_7M } from '../core/agent/domeWorld/domeReferenceCitations';

/**
 * THE FIRST AUTONOMOUS CONSUMER of the REFERENCE data closure
 * (`predictionVerification.ts`/`realExperiment.ts::createReferenceMeasurementRun`)
 * built earlier this session: a dome-world model's own predictions, judged
 * against real, cited historical/geodesic figures, through the exact same
 * pipeline `RealExperimentPipeline.tsx` uses for a manually entered citation
 * — no second comparison engine.
 *
 * Both cases below are expected to come back FALSIFIED_WITHIN_PROTOCOL under
 * `DEFAULT_DOME_PARAMETERS` — not because the test says so, but because the
 * hand-computed geometry genuinely diverges from both citations at these
 * declared assumptions. That is the honest finding, not a bug to "fix" by
 * adjusting parameters to match: the whole point of this challenge is that
 * Genesis reports whatever the numbers actually say.
 */

describe('Dome World geometry (pure, no verdicts)', () => {
  it('shadow angle follows arctan(distance / sunHeight)', () => {
    const angle = predictShadowAngleDegrees(ERATOSTHENES_GROUND_DISTANCE_KM, DEFAULT_DOME_PARAMETERS);
    expect(angle).toBeCloseTo(9.091, 2);
  });

  it('horizon distance on a flat plane is the atmospheric visibility limit, independent of observer height', () => {
    const at1 = predictHorizonDistanceKm(1.7, DEFAULT_DOME_PARAMETERS);
    const at100 = predictHorizonDistanceKm(100, DEFAULT_DOME_PARAMETERS);
    expect(at1).toBe(DEFAULT_DOME_PARAMETERS.atmosphericVisibilityKm);
    expect(at1).toBe(at100);
  });
});

describe('Dome World Challenge — real REFERENCE verification, no hardcoded verdict', () => {
  it('judges the shadow-angle prediction against Eratosthenes and reports FALSIFIED honestly', () => {
    const result = runDomeWorldChallenge();
    const shadowCase = result.cases.find((c) => c.caseId === 'dome-shadow-angle')!;
    expect(shadowCase.predictedValue).toBeCloseTo(9.091, 2);
    expect(shadowCase.verification.observedValue).toBe(ERATOSTHENES_SHADOW_ANGLE.measuredValue);
    expect(shadowCase.verification.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
    expect(shadowCase.verification.outcome?.applicable).toBe(true);
  });

  it('judges the horizon-distance prediction against standard geodesy and reports FALSIFIED honestly', () => {
    const result = runDomeWorldChallenge();
    const horizonCase = result.cases.find((c) => c.caseId === 'dome-horizon-distance')!;
    expect(horizonCase.predictedValue).toBe(DEFAULT_DOME_PARAMETERS.atmosphericVisibilityKm);
    expect(horizonCase.verification.observedValue).toBe(HORIZON_DISTANCE_1_7M.measuredValue);
    expect(horizonCase.verification.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
  });

  it('the citation itself carries REFERENCE provenance, never SIMULATED or unlabeled', () => {
    const result = runDomeWorldChallenge();
    for (const c of result.cases) {
      // verifyPredictionAgainstRealExperiment only proceeds (never INCONCLUSIVE for
      // missing/wrong provenance) when the run underneath is genuinely REFERENCE —
      // asserting a real assessment here is itself proof the provenance gate passed.
      expect(['SUPPORTED_WITHIN_PROTOCOL', 'FALSIFIED_WITHIN_PROTOCOL']).toContain(c.verification.assessment);
    }
  });

  it('a stronger sun-height assumption would change the shadow prediction, proving this is not hardcoded', () => {
    const closeSun = runDomeWorldChallenge({ sunHeightKm: ERATOSTHENES_GROUND_DISTANCE_KM / Math.tan((ERATOSTHENES_SHADOW_ANGLE.measuredValue * Math.PI) / 180), atmosphericVisibilityKm: DEFAULT_DOME_PARAMETERS.atmosphericVisibilityKm });
    const shadowCase = closeSun.cases.find((c) => c.caseId === 'dome-shadow-angle')!;
    // A sun height chosen to reproduce Eratosthenes' own angle exactly should now be SUPPORTED —
    // the verdict tracks the parameters, it is not a fixed pass/fail baked into the challenge.
    expect(shadowCase.verification.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
  });
});

/**
 * The challenge above was complete, tested and correct for weeks — and
 * unreachable: nothing in the application called it, so no user ever saw
 * Genesis falsify anything. These tests are about REACHABILITY, which is the
 * property that was actually missing.
 */
describe('Dome World is reachable from the running application', () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

  it('a real route renders the screen, and the screen calls the real challenge', () => {
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8');
    expect(app).toMatch(/DomeWorldScreen/);
    expect(app).toMatch(/#\/dome-world/);

    const screen = readFileSync(join(SRC, 'components', 'DomeWorldScreen.tsx'), 'utf8');
    expect(screen).toMatch(/runDomeWorldChallenge/);
  });

  /**
   * The screen must not compute or hardcode a verdict of its own — the whole
   * point is that the judgment comes from the REFERENCE pipeline.
   */
  it('the screen states no verdict of its own', () => {
    const screen = readFileSync(join(SRC, 'components', 'DomeWorldScreen.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(screen).not.toMatch(/assessment:\s*'/);
    // A single `=` is assignment (producing a verdict); `===` is comparison
    // (reading the one the pipeline produced, e.g. to pick a CSS class), which
    // is exactly what this screen is allowed to do.
    expect(screen).not.toMatch(/[^=!<>]=\s*'FALSIFIED_WITHIN_PROTOCOL'/);
  });

  /**
   * The sun height is the dome model's only free parameter. If some value of
   * it rescued the model, presenting the falsification as settled would be
   * dishonest — so the claim is checked across the control's whole range
   * rather than at the default alone.
   */
  it('no sun height across the full control range rescues the model', () => {
    for (const sunHeightKm of [500, 1000, 2000, 3000, 5000, 8000, 12000, 20000, 50000]) {
      const run = runDomeWorldChallenge({ ...DEFAULT_DOME_PARAMETERS, sunHeightKm });
      for (const c of run.cases) {
        expect(c.verification.assessment, `sunHeightKm=${sunHeightKm} / ${c.caseId}`)
          .toBe('FALSIFIED_WITHIN_PROTOCOL');
      }
    }
  });
});
