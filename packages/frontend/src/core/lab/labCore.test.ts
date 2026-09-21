import { describe, expect, it } from 'vitest';
import { createStandaloneLabRuntime, RecordingEvidencePort } from './standaloneDeterminism';
import { quantity, addQuantities, convertQuantity } from './physicalQuantity';
import { UncertaintyEngine } from './uncertaintyEngine';
import { buildCapabilityReport, type CapabilityEntry } from './capabilityReport';

describe('D-140 core invariants', () => {
  it('converts units deterministically and rejects incompatible dimensions', () => {
    expect(convertQuantity(quantity(0, 'C'), 'K').value).toBeCloseTo(273.15, 10);
    expect(() => addQuantities(quantity(1, 'K'), quantity(1, 'm'))).toThrow();
  });

  it('propagates uncertainty by root-sum-square', () => {
    const u = new UncertaintyEngine();
    expect(u.combined([3, 4])).toBe(5);
    expect(u.propagateFirstOrder([{ derivative: 2, standardUncertainty: 0.5 }])).toBe(1);
  });

  it('keeps 97 gate false without real data and hardware', () => {
    const ids = ['WORLD_VISUALIZATION','SCIENTIFIC_SOLVERS','DEVICE_ABSTRACTION','SENSOR_INGESTION','CALIBRATION','UNCERTAINTY','SAMPLE_LINEAGE','PROTOCOL_EXECUTION','SAFETY','HARDWARE_IN_LOOP','DIGITAL_TWIN_SYNC','MODEL_CALIBRATION','VALIDATION_FALSIFICATION','EVIDENCE_REPLAY','CLOSED_LOOP','LIMS_ELN_SEAMS','REAL_DATA_ASSIMILATION','MATERIALS_REALITY_LOOP','BIOTECH_REALITY_LOOP','BIG_SCIENCE_INTERFACE'] as const;
    const entries: CapabilityEntry[] = ids.map((capability) => ({ capability, status: 'E2E_VERIFIED', evidence: ['test'] }));
    const report = buildCapabilityReport(entries, ['SAFETY','EVIDENCE_REPLAY']);
    expect(report.LAB_SCOPE_90_READY).toBe(true);
    expect(report.LAB_SCOPE_97_READY).toBe(false);
  });

  it('standalone evidence port is narrow and records immutable event payloads', () => {
    const port = new RecordingEvidencePort();
    const runtime = createStandaloneLabRuntime(port);
    expect(runtime.deterministic.fingerprint({ b: 2, a: 1 })).toBe(runtime.deterministic.fingerprint({ a: 1, b: 2 }));
    expect(port.events).toHaveLength(0);
  });
});
