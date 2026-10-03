import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createAgreementRecord,
  createResourceProfile,
  createUncertaintyBreakdown,
  orderResourceProfiles,
  selfFalsificationChecks,
} from './compute/scientificDecisionContracts.mjs';

describe('resource-aware execution metadata', () => {
  it('keeps unknown runtime explicit and orders a declared prerequisite before expensive work', () => {
    const cheap = createResourceProfile({ capabilityId: 'rdkit-descriptors', availability: 'AVAILABLE', expectedRuntimeMs: 50, costClass: 'LOW', risk: 'LOW', dataAvailable: true, cheaperPrerequisiteCapabilityId: 'structure-validation' });
    const expensive = createResourceProfile({ capabilityId: 'openmm-simulation', availability: 'AVAILABLE', expectedRuntimeMs: null, costClass: 'HIGH', risk: 'MEDIUM', dataAvailable: true });
    assert.equal(cheap.ok, true);
    assert.equal(expensive.ok, true);
    assert.deepEqual(orderResourceProfiles([expensive.profile, cheap.profile]).map((x) => x.capabilityId), ['rdkit-descriptors', 'openmm-simulation']);
  });

  it('does not promote blocked work through ordering', () => {
    const blocked = createResourceProfile({ capabilityId: 'missing-engine', availability: 'BLOCKED_BY_RUNTIME', expectedRuntimeMs: 1, costClass: 'LOW', risk: 'LOW', dataAvailable: true });
    const available = createResourceProfile({ capabilityId: 'real-engine', availability: 'AVAILABLE', expectedRuntimeMs: 100, costClass: 'MEDIUM', risk: 'LOW', dataAvailable: true });
    assert.equal(orderResourceProfiles([blocked.profile, available.profile])[0].capabilityId, 'real-engine');
  });
});

describe('agreement and uncertainty contracts', () => {
  it('requires two distinct methods and an actual calibration sample', () => {
    assert.equal(createAgreementRecord({ methodA: 'vina', methodB: 'vina', protocolId: 'protocol-1', calibrationDataset: 'dataset-1', n: 20, measuredReliability: 0.8, agreement: 'AGREES', confidenceCategory: 'MEDIUM' }).ok, false);
    const result = createAgreementRecord({ methodA: 'vina', methodB: 'gnina-benchmark', protocolId: 'protocol-1', calibrationDataset: 'dataset-1', n: 20, measuredReliability: 0.8, agreement: 'AGREES', confidenceCategory: 'MEDIUM' });
    assert.equal(result.ok, true);
    assert.equal(result.record.measuredReliability, 0.8);
  });

  it('preserves eight uncertainty dimensions and never emits an aggregate score', () => {
    const known = { status: 'ESTIMATED', value: 0.2, unit: 'fraction', method: 'held-out calibration', evidenceRefs: ['run-1'] };
    const unknown = { status: 'UNKNOWN', value: null, limitation: 'not measured' };
    const result = createUncertaintyBreakdown({ data: known, model: known, measurement: unknown, engineDisagreement: unknown, extrapolation: known, missingEvidence: unknown, runtime: known, literatureCompleteness: unknown });
    assert.equal(result.ok, true);
    assert.equal(Object.keys(result.breakdown.dimensions).length, 8);
    assert.equal(result.breakdown.aggregate, null);
  });
});

describe('self-falsification support', () => {
  it('proposes bounded checks for the existing ResearchRun instead of executing a second loop', () => {
    const checks = selfFalsificationChecks({ parameterIds: ['seed'], alternativeEngineIds: ['method-b'], hasApplicabilityDomain: true, datasetIdentity: 'dataset-1', replaySupported: true, contradictorySourceIds: ['source-2'] });
    assert.deepEqual(checks.map((x) => x.kind), ['PARAMETER_SENSITIVITY', 'ALTERNATIVE_ENGINE_COMPARISON', 'OUT_OF_DOMAIN_CHECK', 'DATA_SHIFT_CHECK', 'CONTRADICTORY_SOURCE_REVIEW', 'REPLAY_DRIFT_CHECK']);
  });
});
