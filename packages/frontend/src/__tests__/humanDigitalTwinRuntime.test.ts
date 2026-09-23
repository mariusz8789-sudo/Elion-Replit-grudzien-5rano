import { describe, expect, it } from 'vitest';
import { createHumanDigitalTwinManifest } from '../core/scientificWorlds/humanLab/anatomyAtlas';
import { commitHumanTwinInterventionEvidence, createHumanTwinState, executeHumanTwinIntervention, replayHumanTwinIntervention } from '../core/scientificWorlds/humanLab/digitalTwinRuntime';
import { assertScientificClaimTransition, clinicalEfficacyClass } from '../core/scientificWorlds/humanLab/scientificClaimContract';
import { admitHumanTwinObservation } from '../core/scientificWorlds/humanLab/humanTwinObservation';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';

describe('canonical Human Digital Twin temporal runtime', () => {
  const manifest = createHumanDigitalTwinManifest('HDT-TEST');

  it('creates deterministic, provenance-bearing simulated physiology without a patient claim', () => {
    const a = createHumanTwinState(manifest, { seed: 42, activity: 0.2 });
    const b = createHumanTwinState(manifest, { seed: 42, activity: 0.2 });
    expect(a).toEqual(b);
    expect(a.physiology.heartRateBpm.directObservation).toBe(false);
    expect(a.physiology.heartRateBpm.origin).toBe('SIMPLIFIED_MODEL');
    expect(a.modelCoverage.find((entry) => entry.subsystem === 'ENDOCRINE')).toMatchObject({ status: 'NOT_MODELED', modelId: null });
    expect(a.modelCoverage.find((entry) => entry.subsystem === 'ANATOMY')?.status).toBe('ILLUSTRATIVE_ONLY');
    expect(a.clinicalUse).toBe('NOT_A_MEDICAL_DEVICE');
  });

  it('executes only the existing bounded activity model and replays exactly', () => {
    const input = createHumanTwinState(manifest, { seed: 7 });
    const intervention = { executionId: 'activity-1', twinId: manifest.twinId, kind: 'ACTIVITY_CHANGE' as const, durationSeconds: 60, parameters: { activity: 0.8 }, source: 'unit-test', requestedAtLogicalSeconds: 0 };
    const run = executeHumanTwinIntervention(manifest, input, intervention);
    expect(run.status).toBe('EXECUTED_SIMPLIFIED_MODEL');
    expect(run.outputState?.logicalTimeSeconds).toBe(60);
    expect(run.outputState?.stateFingerprint).not.toBe(input.stateFingerprint);
    expect(replayHumanTwinIntervention(manifest, run, intervention).verdict).toBe('MATCH');
  });

  it('blocks compound/treatment responses when no admitted solver exists', () => {
    const input = createHumanTwinState(manifest, { seed: 7 });
    const run = executeHumanTwinIntervention(manifest, input, { executionId: 'compound-1', twinId: manifest.twinId, kind: 'COMPOUND_EXPOSURE', durationSeconds: 60, parameters: { compound: 'example' }, source: 'unit-test', requestedAtLogicalSeconds: 0 });
    expect(run.status).toBe('BLOCKED_NOT_MODELED');
    expect(run.outputState).toBeNull();
    expect(run.limitations[0]).toContain('No response was invented');
  });

  it('records a deterministic intervention only as canonical model evidence', () => {
    const ledger = new EvidenceLedger({ now: () => 1 });
    const input = createHumanTwinState(manifest, { seed: 17 });
    const intervention = { executionId: 'activity-evidence-1', twinId: manifest.twinId, kind: 'ACTIVITY_CHANGE' as const, durationSeconds: 30, parameters: { activity: 0.4 }, source: 'unit-test', requestedAtLogicalSeconds: 0 };
    const run = executeHumanTwinIntervention(manifest, input, intervention);
    const first = commitHumanTwinInterventionEvidence(ledger, run);
    const second = commitHumanTwinInterventionEvidence(ledger, replayHumanTwinIntervention(manifest, run, intervention).replay);
    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(ledger.getActive()).toHaveLength(1);
    expect(ledger.getActive()[0]?.claimType).toBe('model');
    expect(ledger.verifyLedger()).toEqual({ ok: true, errors: [] });
  });
});

describe('scientific claim firewall', () => {
  it.each([
    ['SIMULATION', 'LAB_RESULT'],
    ['IN_SILICO_SUPPORT', 'CLINICAL_OBSERVATION'],
    ['IN_SILICO_SUPPORT', 'IN_VITRO_OBSERVATION'],
    ['VISUALIZATION', 'CLINICAL_OBSERVATION'],
    ['RECONSTRUCTION', 'IN_VIVO_OBSERVATION'],
    ['ILLUSTRATIVE_ANATOMY', 'PATIENT_SPECIFIC_MODEL'],
    ['UNBOUND_INSTRUMENT', 'LIVE_INSTRUMENT_MEASUREMENT'],
  ] as const)('blocks %s -> %s', (from, to) => {
    expect(() => assertScientificClaimTransition({ from, to, evidenceRefs: ['e:1'], reason: 'attempt' })).toThrow(/FORBIDDEN/);
  });

  it('requires evidence for genuine observations and never derives clinical efficacy from compute', () => {
    expect(() => assertScientificClaimTransition({ from: 'UNKNOWN', to: 'CLINICAL_OBSERVATION', evidenceRefs: [], reason: 'ingest' })).toThrow(/EVIDENCE_REQUIRED/);
    expect(clinicalEfficacyClass(['SIMULATION', 'IN_SILICO_SUPPORT'])).toBe('IN_SILICO_SUPPORT');
    expect(clinicalEfficacyClass(['CLINICAL_OBSERVATION'])).toBe('CLINICAL_OBSERVATION');
  });

  it('requires two distinct references and a clinical observation before replication', () => {
    expect(() => assertScientificClaimTransition({ from: 'UNKNOWN', to: 'REPLICATED_CLINICAL_EVIDENCE', evidenceRefs: ['study:a', 'study:b'], reason: 'attempt' })).toThrow(/REPLICATION_SOURCE_INVALID/);
    expect(() => assertScientificClaimTransition({ from: 'CLINICAL_OBSERVATION', to: 'REPLICATED_CLINICAL_EVIDENCE', evidenceRefs: ['study:a', 'study:a'], reason: 'attempt' })).toThrow(/INDEPENDENT_REPLICATION_REQUIRED/);
    expect(() => assertScientificClaimTransition({ from: 'CLINICAL_OBSERVATION', to: 'REPLICATED_CLINICAL_EVIDENCE', evidenceRefs: ['study:a', 'study:b'], reason: 'independent replication' })).not.toThrow();
  });
});

describe('Human Digital Twin external observation binding', () => {
  it('binds a calibrated external reading to the twin and canonical ledger without mutating simulated state', () => {
    const ledger = new EvidenceLedger({ now: () => 1 });
    const manifest = createHumanDigitalTwinManifest('HDT-OBS');
    const before = createHumanTwinState(manifest, { seed: 9 });
    const admitted = admitHumanTwinObservation(ledger, manifest, {
      observationId: 'obs-heart-rate-1', twinId: manifest.twinId, anatomyNodeId: 'heart', metric: 'heart-rate', value: 72, unit: 'bpm',
      sourceTimestamp: '2026-09-23T00:00:00.000Z', sourceIdentity: 'adapter:test', deviceId: 'device-1', calibrationRef: 'cal-1', calibrationStatus: 'VALID',
      uncertainty: { kind: 'INTERVAL', low: 71, high: 73 }, provenanceRefs: ['raw-sha256:abc'],
    });
    expect(admitted.directObservation).toBe(true);
    expect(admitted.simulated).toBe(false);
    expect(ledger.getActive()[0]?.claimType).toBe('observation');
    expect(createHumanTwinState(manifest, { seed: 9 })).toEqual(before);
  });

  it('rejects an uncalibrated device reading', () => {
    const ledger = new EvidenceLedger({ now: () => 1 });
    const manifest = createHumanDigitalTwinManifest('HDT-OBS');
    expect(() => admitHumanTwinObservation(ledger, manifest, {
      observationId: 'obs-1', twinId: manifest.twinId, anatomyNodeId: null, metric: 'temperature', value: 37, unit: 'degC',
      sourceTimestamp: '2026-09-23T00:00:00.000Z', sourceIdentity: 'adapter:test', deviceId: 'device-1', calibrationRef: null, calibrationStatus: 'NOT_PROVIDED',
      uncertainty: { kind: 'NOT_QUANTIFIED', reason: 'unknown' }, provenanceRefs: ['raw-sha256:abc'],
    })).toThrow(/CALIBRATION_REQUIRED/);
  });
});
