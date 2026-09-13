import { describe, expect, it } from 'vitest';
import { checkExcludedBasisSmuggling, checkTemporalLineage, holdoutDiagnostic, HOLDOUT_SPLIT_METHOD } from '../core/agent/integrityGates';
import type { ModelPoint, ModelSpec } from '../core/agent/modelSpace';

/**
 * F2/F5 integrity gates — Government Research mode: every gate here reports a
 * flag with reason + provenance and NEVER removes or rejects the model it
 * concerns. These tests check the flags themselves (real reason strings, real
 * conditions), not any blocking behaviour, because there is none to test.
 */

describe('integrityGates — temporal lineage gate (F2/F5-1)', () => {
  const derived = { fingerprint: 'm1', derivedFrom: 'parent', derivationOperator: 'RESIDUAL_TREND', enteredAtRound: 3 };

  it('is silent for a model that was never derived (enumerated at round 0)', () => {
    expect(checkTemporalLineage({ fingerprint: 'm0', derivedFrom: null, derivationOperator: null, enteredAtRound: 0 }, 0, 1)).toBeNull();
  });

  it('is silent when the model genuinely entered strictly after the round its motivating observations were admitted', () => {
    expect(checkTemporalLineage(derived, 2, 3)).toBeNull();
  });

  it('flags a derived model missing its derivation operator — lineage cannot certify the ordering without it', () => {
    const flag = checkTemporalLineage({ ...derived, derivationOperator: null }, 2, 3);
    expect(flag).not.toBeNull();
    expect(flag!.gate).toBe('TEMPORAL_LINEAGE');
    expect(flag!.reason).toContain('derivation operator');
  });

  it('flags a model that did not actually enter after its motivating observation round', () => {
    const flag = checkTemporalLineage(derived, 3, 3);
    expect(flag).not.toBeNull();
    expect(flag!.gate).toBe('TEMPORAL_LINEAGE');
    expect(flag!.reason).toContain('createdAt(model) > observationAt(residual)');
  });
});

describe('integrityGates — excluded-basis smuggling gate (F2/F5-3)', () => {
  const specWithLog: ModelSpec = { id: 'x', terms: [{ basis: 'CONSTANT' }, { basis: 'LOG', variable: 'x' }], lineage: null };

  it('is silent when the campaign declared no exclusions', () => {
    expect(checkExcludedBasisSmuggling(specWithLog, undefined, 'f1', 2)).toBeNull();
  });

  it('is silent when the model uses no excluded basis', () => {
    expect(checkExcludedBasisSmuggling(specWithLog, ['POWER'], 'f1', 2)).toBeNull();
  });

  it('flags a model that reintroduces a basis the campaign explicitly excluded at round 0', () => {
    const flag = checkExcludedBasisSmuggling(specWithLog, ['LOG', 'RECIPROCAL'], 'f1', 4);
    expect(flag).not.toBeNull();
    expect(flag!.gate).toBe('EXCLUDED_BASIS_SMUGGLING');
    expect(flag!.round).toBe(4);
    expect(flag!.modelFingerprint).toBe('f1');
    expect(flag!.reason).toContain('LOG');
    expect(flag!.reason).not.toContain('RECIPROCAL'); // only the basis actually present is named
  });
});

describe('integrityGates — hold-out diagnostic (F2/F5-6, F2/F5-7)', () => {
  const linearSpec: ModelSpec = { id: 'lin', terms: [{ basis: 'LINEAR', variable: 'x' }], lineage: null };

  it('is null with fewer than two admitted points — nothing to hold out yet', () => {
    expect(holdoutDiagnostic(linearSpec, [])).toBeNull();
    expect(holdoutDiagnostic(linearSpec, [{ x: 1, y: 2, sigma: 1 }])).toBeNull();
  });

  it('fits on every admitted point EXCEPT the most recent one, and reports the real standardized residual there', () => {
    // y = 2x fits (1,2) and (2,4) exactly; the held-out (3, 6.5) is 0.5σ off that prediction.
    const admitted: ModelPoint[] = [{ x: 1, y: 2, sigma: 1 }, { x: 2, y: 4, sigma: 1 }, { x: 3, y: 6.5, sigma: 1 }];
    const diag = holdoutDiagnostic(linearSpec, admitted);
    expect(diag).not.toBeNull();
    expect(diag!.method).toBe(HOLDOUT_SPLIT_METHOD);
    expect(diag!.heldOutX).toBe(3);
    expect(diag!.standardizedResidual).not.toBeNull();
    expect(diag!.standardizedResidual!).toBeCloseTo(0.5, 6);
  });

  it('reports null (not a fabricated number) when the reduced fit itself cannot be computed', () => {
    // A single remaining point cannot determine a 2-coefficient model.
    const twoTermSpec: ModelSpec = { id: 'lin+c', terms: [{ basis: 'CONSTANT' }, { basis: 'LINEAR', variable: 'x' }], lineage: null };
    const admitted: ModelPoint[] = [{ x: 1, y: 2, sigma: 1 }, { x: 2, y: 4, sigma: 1 }];
    const diag = holdoutDiagnostic(twoTermSpec, admitted);
    expect(diag).not.toBeNull();
    expect(diag!.standardizedResidual).toBeNull();
  });

  it('the split method is a disclosed, fixed identifier — the honest provenance stand-in for a seed (F2/F5-7)', () => {
    expect(HOLDOUT_SPLIT_METHOD).toBe('LEAVE_LAST_ADMITTED_OUT_V1');
  });
});
