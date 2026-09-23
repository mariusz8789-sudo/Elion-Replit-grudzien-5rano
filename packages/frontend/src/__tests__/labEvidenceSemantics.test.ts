import { describe, expect, it } from 'vitest';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { createGenesisLabEvidencePort } from '../core/lab/genesisEvidencePort';
import { SensorIngestEngine } from '../core/lab/sensorIngestEngine';
import { quantity } from '../core/lab/physicalQuantity';

const event = (overrides: Partial<Parameters<ReturnType<typeof createGenesisLabEvidencePort>['emit']>[0]> = {}) => ({
  type: 'MEASUREMENT_INGESTED' as const,
  modelId: 'sensor-ingest',
  solverId: 'ingest-v1',
  inputFingerprint: 'input',
  resultFingerprint: 'result',
  epistemicStatus: 'MEASURED' as const,
  evidenceClass: 'MEASUREMENT' as const,
  limitations: [] as readonly string[],
  assumptions: [] as readonly string[],
  provenance: ['device:fixture'] as readonly string[],
  ...overrides,
});

describe('laboratory evidence semantics', () => {
  it('preserves a measured sensor event as an observation in the canonical ledger', () => {
    const ledger = new EvidenceLedger({ now: () => 1 });
    createGenesisLabEvidencePort(ledger, 'lab-test').emit(event());
    expect(ledger.getActive()).toHaveLength(1);
    expect(ledger.getActive()[0]?.claimType).toBe('observation');
    expect(ledger.verifyLedger()).toEqual({ ok: true, errors: [] });
  });

  it('keeps simulated and derived laboratory output classified as a model', () => {
    const ledger = new EvidenceLedger({ now: () => 1 });
    createGenesisLabEvidencePort(ledger, 'lab-test').emit(event({
      type: 'MODEL_VALIDATED', epistemicStatus: 'SIMULATION', evidenceClass: 'MODEL',
    }));
    expect(ledger.getActive()[0]?.claimType).toBe('model');
  });

  it('classifies simulated sensor output as model data and rejects ungrounded live claims', () => {
    const ledger = new EvidenceLedger({ now: () => 1 });
    const runtime = {
      deterministic: { canonicalize: JSON.stringify, fingerprint: (value: unknown) => JSON.stringify(value) },
      evidence: createGenesisLabEvidencePort(ledger, 'lab-test'),
    };
    const ingest = new SensorIngestEngine(runtime);
    const common = { measurementId: 'm-1', deviceId: 'd-1', channelId: 'temperature', quantity: quantity(293.15, 'K'), sourceTimestamp: 'sequence:1', ingestSequence: 1, provenance: ['fixture'] } as const;
    const simulated = ingest.ingest({ ...common, sourceKind: 'SIMULATED_DEVICE', sourceMode: 'SIMULATED' }, { currentSequence: 1, maxSequenceAge: 1, calibrationValid: true });
    expect(simulated.quality).toBe('VALID');
    expect(ledger.getActive()[0]?.claimType).toBe('model');
    const fakeLive = ingest.ingest({ ...common, measurementId: 'm-2', sourceKind: 'REAL_INSTRUMENT', sourceMode: 'LIVE_READ_ONLY' }, { currentSequence: 1, maxSequenceAge: 1, calibrationValid: true });
    expect(fakeLive).toMatchObject({ quality: 'REJECTED', qualityReasons: ['RAW_PAYLOAD_REQUIRED'] });
    expect(ledger.getActive()[1]?.claimType).toBe('model');
  });

  it('admits a real-instrument payload as observation only with timestamp, raw bytes, configuration, calibration and provenance', () => {
    const ledger = new EvidenceLedger({ now: () => 1 });
    const runtime = {
      deterministic: { canonicalize: JSON.stringify, fingerprint: (value: unknown) => JSON.stringify(value) },
      evidence: createGenesisLabEvidencePort(ledger, 'lab-test'),
    };
    const ingest = new SensorIngestEngine(runtime);
    const live = ingest.ingest({
      measurementId: 'live-1', deviceId: 'instrument-1', channelId: 'temperature', quantity: quantity(293.15, 'K'),
      sourceTimestamp: '2026-09-23T00:00:00.000Z', ingestSequence: 1, sourceKind: 'REAL_INSTRUMENT', sourceMode: 'LIVE_READ_ONLY',
      calibrationId: 'calibration-1', provenance: ['raw:sha256:abc'], rawPayload: 'instrument-bytes', configurationFingerprint: 'config:sha256:def',
    }, { currentSequence: 1, maxSequenceAge: 1, calibrationValid: true });
    expect(live.quality).toBe('VALID');
    expect(ledger.getActive()[0]?.claimType).toBe('observation');
  });
});
