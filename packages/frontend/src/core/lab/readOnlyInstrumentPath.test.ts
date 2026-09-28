import { describe, expect, it } from 'vitest';
import type { LabDevice, DeviceMeasurement } from './devicePorts';
import { createStandaloneLabRuntime, RecordingEvidencePort } from './standaloneDeterminism';
import { quantity } from './physicalQuantity';
import { ReadOnlyInstrumentAdapter, validateReadOnlyInstrument, type InstrumentFrame } from './readOnlyInstrumentAdapter';
import { HardwareInLoopBridge } from './hardwareInLoopBridge';
import { SensorIngestEngine } from './sensorIngestEngine';
import { LabSafetyInterlock } from './labSafetyInterlock';
import { DigitalTwinSynchronizer } from './digitalTwinSynchronizer';
import { ModelValidationEngine } from './modelValidationEngine';
import { ClosedLoopExperimentEngine } from './closedLoopExperimentEngine';
import { createRealExperimentRunFromLab } from './labExperimentFabricBridge';
import type { RealExperimentRequest } from '../experimentFabric/realExperiment';
import { verifyPredictionAgainstRealExperiment } from '../agent/predictionVerification';

/**
 * Read-only instrument path: transport frame -> ReadOnlyInstrumentAdapter -> HardwareInLoopBridge ->
 * SensorIngestEngine -> DigitalTwinSynchronizer -> ModelValidationEngine -> ClosedLoopExperimentEngine
 * -> Experiment Fabric REAL_EXPERIMENTAL run -> prediction verification.
 *
 * The frames below are a TEST FIXTURE, labelled as such in their provenance. They exercise the
 * contract; they are not a physical measurement and nothing here is HARDWARE_VERIFIED.
 */
const FIXTURE = 'TEST_FIXTURE_NOT_A_PHYSICAL_MEASUREMENT';

function thermometer(mode: LabDevice['executionMode']): LabDevice {
  return {
    identity: { deviceId: 'thermo-01', manufacturer: 'fixture', model: 'fixture-probe', serialIdentity: 'FIXTURE-SN-01' },
    kind: 'thermometer',
    capabilities: [{ capabilityId: 'temperature.read', channelId: 'temperature', access: 'READ', dimension: 'TEMPERATURE', unit: 'K' }],
    executionMode: mode,
    health: { state: 'HEALTHY', diagnosticCodes: [] },
    calibration: { calibrationId: 'cal-thermo-01', version: '1' },
    provenance: [FIXTURE],
  };
}

function frame(value: number, i: number, overrides: Partial<InstrumentFrame> = {}): InstrumentFrame {
  return {
    channelId: 'temperature', value, unit: 'K', sourceTimestamp: `2026-09-28T04:00:0${i}.000Z`,
    rawPayload: `T=${value.toFixed(2)}K`, configurationFingerprint: 'cfg-fixture-01', calibrationId: 'cal-thermo-01',
    provenance: [FIXTURE], uncertainty: 0.1, ...overrides,
  };
}

const request: RealExperimentRequest = {
  structuredRequest: { contractVersion: '1.0.0', sourceText: 'measure bath temperature', domainId: 'thermal', operation: 'compute', modelId: 'bath-equilibrium', parameters: { setpointK: 310 } },
  physicalProtocolRef: 'protocol:bath-equilibrium-fixture-v1',
};

describe('ReadOnlyInstrumentAdapter contract', () => {
  it('refuses devices that are not structurally read-only instruments', () => {
    expect(validateReadOnlyInstrument(thermometer('LIVE_READ_ONLY'), 'REAL_INSTRUMENT')).toEqual([]);
    expect(validateReadOnlyInstrument(thermometer('SIMULATED'), 'REAL_INSTRUMENT')).toContain('EXECUTION_MODE_MUST_BE_LIVE_READ_ONLY');
    expect(validateReadOnlyInstrument(thermometer('LIVE_READ_ONLY'), 'RECORDED_MEASUREMENT')).toContain('EXECUTION_MODE_MUST_BE_REPLAY');
    const writable: LabDevice = { ...thermometer('LIVE_READ_ONLY'), capabilities: [{ capabilityId: 'heater.set', channelId: 'heater', access: 'WRITE', dimension: 'TEMPERATURE', unit: 'K' }] };
    expect(validateReadOnlyInstrument(writable, 'REAL_INSTRUMENT')).toContain('WRITE_CAPABILITY_NOT_ALLOWED');
    const anonymous: LabDevice = { ...thermometer('LIVE_READ_ONLY'), identity: { deviceId: 'x' } };
    expect(validateReadOnlyInstrument(anonymous, 'REAL_INSTRUMENT')).toContain('SERIAL_IDENTITY_REQUIRED');
    const { calibration: _omit, ...uncalibrated } = thermometer('LIVE_READ_ONLY');
    void _omit;
    expect(validateReadOnlyInstrument(uncalibrated, 'REAL_INSTRUMENT')).toContain('CALIBRATION_REFERENCE_REQUIRED');
    expect(() => new ReadOnlyInstrumentAdapter(thermometer('SIMULATED'), 'REAL_INSTRUMENT')).toThrow(/cannot be a read-only instrument/);
  });

  it('refuses incomplete frames instead of repairing them, and never fabricates a reading', () => {
    const adapter = new ReadOnlyInstrumentAdapter(thermometer('LIVE_READ_ONLY'), 'REAL_INSTRUMENT');
    const cases: [unknown, string][] = [
      [null, 'FRAME_NOT_AN_OBJECT'],
      [frame(300, 1, { channelId: 'pressure' }), 'UNKNOWN_CHANNEL'],
      [frame(Number.NaN, 1), 'NON_FINITE_VALUE'],
      [frame(300, 1, { unit: 'Pa' }), 'UNIT_DIMENSION_MISMATCH'],
      [frame(300, 1, { sourceTimestamp: 'SIM_SEQUENCE_1' }), 'SOURCE_TIMESTAMP_REQUIRED'],
      [frame(300, 1, { rawPayload: '' }), 'RAW_PAYLOAD_REQUIRED'],
      [frame(300, 1, { configurationFingerprint: '' }), 'CONFIGURATION_FINGERPRINT_REQUIRED'],
      [frame(300, 1, { calibrationId: 'cal-other' }), 'CALIBRATION_REFERENCE_MISMATCH'],
      [frame(300, 1, { provenance: [] }), 'SOURCE_PROVENANCE_REQUIRED'],
    ];
    for (const [payload, reason] of cases) expect(adapter.acceptFrame(payload)).toEqual({ accepted: false, reason });
    expect(adapter.rejected()).toBe(cases.length);
    expect(adapter.pending('temperature')).toBe(0);
    expect(() => adapter.read('temperature', 1)).toThrow(/NO_FRAME_AVAILABLE/);
  });

  it('never actuates, and the canonical interlock refuses any command against it', () => {
    const runtime = createStandaloneLabRuntime();
    const device = thermometer('LIVE_READ_ONLY');
    const adapter = new ReadOnlyInstrumentAdapter(device, 'REAL_INSTRUMENT');
    const command = { commandId: 'c1', deviceId: 'thermo-01', channelId: 'temperature', target: quantity(310, 'K'), protocolId: 'p1' };
    expect(() => adapter.execute(command)).toThrow(/READ_ONLY_INSTRUMENT/);
    const decision = new LabSafetyInterlock(runtime).evaluate({ device, command, protocolValidated: true, humanApproved: true, emergencyStop: false, sensorQuality: 'VALID', calibrationValid: true });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toEqual(expect.arrayContaining(['WRITE_CAPABILITY_MISSING', 'READ_ONLY_DEVICE']));
  });

  it('attaches to an injected transport (MQTT/webhook style) and drops malformed payloads', () => {
    const adapter = new ReadOnlyInstrumentAdapter(thermometer('LIVE_READ_ONLY'), 'REAL_INSTRUMENT');
    let handler: ((p: unknown) => void) | null = null;
    const unsubscribe = adapter.connect((h) => { handler = h; return () => { handler = null; }; });
    handler!(JSON.stringify(frame(305, 1)));
    handler!('{not json');
    handler!(frame(306, 2));
    unsubscribe();
    expect(handler).toBeNull();
    expect(adapter.pending('temperature')).toBe(2);
    expect(adapter.rejected()).toBe(1);
    const m = adapter.read('temperature', 7);
    expect(m.sourceKind).toBe('REAL_INSTRUMENT');
    expect(m.sourceMode).toBe('LIVE_READ_ONLY');
    expect(m.rawPayload).toBe('T=305.00K');
    expect(m.ingestSequence).toBe(7);
  });
});

function runPath(runId: string) {
  const evidence = new RecordingEvidencePort();
  const runtime = createStandaloneLabRuntime(evidence);
  const adapter = new ReadOnlyInstrumentAdapter(thermometer('REPLAY'), 'RECORDED_MEASUREMENT');
  const bridge = new HardwareInLoopBridge();
  bridge.registerAdapter(adapter);
  [309.8, 310.1, 310.0].forEach((v, i) => expect(adapter.acceptFrame(frame(v, i + 1)).accepted).toBe(true));
  const ingest = new SensorIngestEngine(runtime);
  const ingested = [1, 2, 3].map((seq) => ingest.ingest(bridge.read('thermo-01', 'temperature', seq), { currentSequence: 3, maxSequenceAge: 5, calibrationValid: true, min: 250, max: 450 }));
  const last = ingested[ingested.length - 1]!;
  const twin = new DigitalTwinSynchronizer(runtime).synchronize({ value: 310, standardUncertainty: 0.2, sequence: 3 }, { value: last.quantity.value, standardUncertainty: last.uncertainty ?? 0, sequence: last.ingestSequence }, 3);
  const validation = new ModelValidationEngine(runtime).validate(ingested.map((m) => ({ predicted: 310, predictedUncertainty: 0.2, measured: m.quantity.value, measuredUncertainty: m.uncertainty ?? 0, inModelDomain: true })));
  const loop = new ClosedLoopExperimentEngine(runtime).completeIteration({ hypothesisId: `h-${runId}`, experimentId: 'bath-01', twinSync: twin, validation });
  const run = createRealExperimentRunFromLab({ request, measurements: ingested, outputs: [{ outputKey: 'bathTemperatureK', deviceId: 'thermo-01', channelId: 'temperature', reducer: 'mean' }], summary: 'Bath equilibrium, fixture replay.' });
  return { evidence, ingested, twin, validation, loop, run };
}

describe('Read-only instrument -> canonical lab -> Experiment Fabric', () => {
  it('admits a complete recorded measurement through the one canonical path', () => {
    const { evidence, ingested, twin, validation, loop, run } = runPath('a');
    expect(ingested.every((m) => m.quality === 'VALID')).toBe(true);
    const ingestEvents = evidence.events.filter((e) => e.type === 'MEASUREMENT_INGESTED');
    expect(ingestEvents.map((e) => e.epistemicStatus)).toEqual(['REPLAY', 'REPLAY', 'REPLAY']);
    expect(ingestEvents.every((e) => e.epistemicStatus !== 'MEASURED')).toBe(true);
    expect(twin.syncStatus).toBe('SYNCHRONIZED');
    expect(validation.classification).toBe('SUPPORTED_WITHIN_UNCERTAINTY');
    expect(loop.requiresHumanApprovalForLiveActuation).toBe(true);

    expect(run.provenance.dataProvenance).toBe('REAL_EXPERIMENTAL');
    expect(run.provenance.deterministic).toBe(false);
    expect(run.result.outputs.bathTemperatureK).toBeCloseTo(309.9667, 3);
    expect(run.result.warnings.join(' ')).toMatch(/RECORDED_MEASUREMENT/);
    const verdict = verifyPredictionAgainstRealExperiment({ predictedValue: 310, criterion: { metric: 'bathTemperatureK', relation: 'equal-within-tolerance', expectedValue: 310, tolerance: 0.5, rationale: 'fixture' }, realRun: run });
    expect(verdict.observedValue).toBeCloseTo(309.9667, 3);
    expect(verdict.assessment).not.toBe('INCONCLUSIVE');
  });

  it('replays to the same fingerprints', () => {
    const a = runPath('same');
    const b = runPath('same');
    expect(a.run.runId).toBe(b.run.runId);
    expect(a.ingested.map((m) => m.ingestFingerprint)).toEqual(b.ingested.map((m) => m.ingestFingerprint));
    expect(a.loop.deterministicFingerprint).toBe(b.loop.deterministicFingerprint);
  });

  it('never turns simulated or rejected readings into a real experiment', () => {
    const runtime = createStandaloneLabRuntime();
    const ingest = new SensorIngestEngine(runtime);
    const simulated: DeviceMeasurement = { measurementId: 's1', deviceId: 'thermo-01', channelId: 'temperature', quantity: quantity(310, 'K'), sourceTimestamp: 'SIM_SEQUENCE_1', ingestSequence: 1, sourceKind: 'SIMULATED_DEVICE', sourceMode: 'SIMULATED', calibrationId: 'cal-thermo-01', provenance: ['SIM'] };
    const simIngested = ingest.ingest(simulated, { currentSequence: 1, maxSequenceAge: 5, calibrationValid: true });
    expect(simIngested.quality).toBe('VALID');
    const outputs = [{ outputKey: 'bathTemperatureK', deviceId: 'thermo-01', channelId: 'temperature', reducer: 'mean' as const }];
    expect(() => createRealExperimentRunFromLab({ request, measurements: [simIngested], outputs, summary: 's' })).toThrow(/SIMULATED_DEVICE/);

    const liveNoRaw: DeviceMeasurement = { ...simulated, measurementId: 'r1', sourceKind: 'REAL_INSTRUMENT', sourceMode: 'LIVE_READ_ONLY', sourceTimestamp: '2026-09-28T04:00:00.000Z' };
    const rejected = ingest.ingest(liveNoRaw, { currentSequence: 1, maxSequenceAge: 5, calibrationValid: true });
    expect(rejected.quality).toBe('REJECTED');
    expect(() => createRealExperimentRunFromLab({ request, measurements: [rejected], outputs, summary: 's' })).toThrow(/only VALID readings/);
    expect(() => createRealExperimentRunFromLab({ request, measurements: [], outputs, summary: 's' })).toThrow(/No measurements/);
  });
});
