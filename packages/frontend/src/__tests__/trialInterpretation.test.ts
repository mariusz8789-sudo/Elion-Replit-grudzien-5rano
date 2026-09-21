/**
 * D-108 — negative-first tests for trialInterpretation.ts.
 *
 * The load-bearing assertions are about what this module does NOT do: it
 * never returns a value that could be mistaken for a gate decision, and the
 * frozen numbers from D-106/107 (MAX_MAE 1.0, medianSd 1.0005) are pinned so
 * a future edit that silently drifts either constant breaks the suite.
 *
 * The first version of this test file asserted the wrong thing for a "clear
 * pass" scenario — it varied testMae while keeping gateMaxMae/noiseFloor
 * fixed and expected the RELATION to change, but relation-vs-gate is a
 * static property of the gate and the floor alone. That bug in the test
 * caught a real bug in the module (conflating "is the gate resolvable" with
 * "is this result distinguishable from noise"); both are fixed here.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyGateAgainstNoiseFloor,
  interpretTrialResult,
  DEFAULT_NOISE_FLOOR_TOLERANCE,
} from '../core/discovery/molecular/trialInterpretation';

describe('classifyGateAgainstNoiseFloor', () => {
  it('classifies the ACTUAL frozen GLP-1R gate as AT the measured CAMP noise floor', () => {
    // MAX_MAE 1.0 (glp1r-validation-gate.json, ruleFingerprint d2f77a7e6042f0fc)
    // medianSd 1.0005 (D-106/107, sealed glp1r-d105-noise-floor-verified.json)
    const r = classifyGateAgainstNoiseFloor(1.0, 1.0005);
    expect(r.relation).toBe('AT_NOISE_FLOOR');
    expect(r.deltaFromNoiseFloor).toBeCloseTo(-0.0005, 4);
    expect(r.caveat).toContain('about as precisely as two independent assays');
  });

  it('classifies a gate well below the noise floor as demanding more than the data can prove', () => {
    const r = classifyGateAgainstNoiseFloor(0.3, 1.0005);
    expect(r.relation).toBe('BELOW_NOISE_FLOOR');
    expect(r.caveat).toContain('can fail this gate even with no systematic error');
  });

  it('classifies a gate well above the noise floor as loose, for a different reason', () => {
    const r = classifyGateAgainstNoiseFloor(2.0, 1.0005);
    expect(r.relation).toBe('ABOVE_NOISE_FLOOR');
    expect(r.caveat).toContain('weaker claim');
  });

  it('respects the tolerance boundary using round numbers that do not accumulate float error', () => {
    const tol = DEFAULT_NOISE_FLOOR_TOLERANCE;
    expect(tol).toBe(0.05);
    const justInside = classifyGateAgainstNoiseFloor(1.04, 1.0); // delta 0.04 < 0.05
    const justOutside = classifyGateAgainstNoiseFloor(1.06, 1.0); // delta 0.06 > 0.05
    expect(justInside.relation).toBe('AT_NOISE_FLOOR');
    expect(justOutside.relation).toBe('ABOVE_NOISE_FLOOR');
  });

  it('never returns a passesGate field — it does not decide anything, and has no notion of a specific trial result', () => {
    const r = classifyGateAgainstNoiseFloor(1.0, 1.0005);
    expect((r as unknown as Record<string, unknown>).passesGate).toBeUndefined();
    expect((r as unknown as Record<string, unknown>).testMae).toBeUndefined();
  });
});

describe('interpretTrialResult', () => {
  it('flags requiresHumanNote when a result passes but its OWN error is not clearly below the noise floor', () => {
    // Barely under the frozen MAX_MAE, right at the floor — an ambiguous pass.
    const barelyPass = interpretTrialResult(0.98, 1.0, 1.0005);
    expect(barelyPass.passesGate).toBe(true);
    expect(barelyPass.resultRelation).toBe('AT_NOISE_FLOOR');
    expect(barelyPass.requiresHumanNote).toBe(true);
  });

  it('does NOT flag a pass whose testMae is clearly below the noise floor, even though the gate itself sits at the floor', () => {
    // The gate (MAX_MAE 1.0) is AT the floor (1.0005), but THIS result (0.1)
    // is far below it — genuinely more precise than two assays agree with
    // each other, and therefore informative regardless of the gate's own
    // position. This is exactly the distinction the module's first draft got
    // wrong by only ever checking the gate, never the actual result.
    const clearPass = interpretTrialResult(0.1, 1.0, 1.0005);
    expect(clearPass.passesGate).toBe(true);
    expect(clearPass.gateRelation).toBe('AT_NOISE_FLOOR');
    expect(clearPass.resultRelation).toBe('BELOW_NOISE_FLOOR');
    expect(clearPass.requiresHumanNote).toBe(false);
  });

  it('does not require a human note for a fail, even at the noise floor', () => {
    const atFloorFail = interpretTrialResult(1.2, 1.0, 1.0005);
    expect(atFloorFail.passesGate).toBe(false);
    expect(atFloorFail.requiresHumanNote).toBe(false);
  });

  it('flags a pass whose result sits ABOVE the noise floor too, not just AT it', () => {
    // Constructed against a looser gate so a result above the floor can still pass.
    const worseThanFloorButPasses = interpretTrialResult(1.3, 2.0, 1.0005);
    expect(worseThanFloorButPasses.passesGate).toBe(true);
    expect(worseThanFloorButPasses.resultRelation).toBe('ABOVE_NOISE_FLOOR');
    expect(worseThanFloorButPasses.requiresHumanNote).toBe(true);
  });

  it('passesGate is exactly testMae <= gateMaxMae — the frozen gate arithmetic, restated not altered', () => {
    expect(interpretTrialResult(1.0, 1.0, 1.0005).passesGate).toBe(true);
    expect(interpretTrialResult(1.0000001, 1.0, 1.0005).passesGate).toBe(false);
  });
});
