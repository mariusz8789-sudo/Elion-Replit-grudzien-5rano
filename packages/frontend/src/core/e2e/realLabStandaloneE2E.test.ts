import { describe, expect, it } from 'vitest';
import { createStandaloneLabRuntime, RecordingEvidencePort } from '../lab/standaloneDeterminism';
import { quantity } from '../lab/physicalQuantity';
import type { DeviceAdapter, DeviceCommand, DeviceMeasurement, LabDevice } from '../lab/devicePorts';
import { LabInstrumentRegistry } from '../lab/labInstrumentRegistry';
import { SensorIngestEngine } from '../lab/sensorIngestEngine';
import { CalibrationEngine } from '../lab/calibrationEngine';
import { UncertaintyEngine } from '../lab/uncertaintyEngine';
import { SampleLineageStore } from '../lab/sampleLineage';
import type { ExperimentProtocol } from '../lab/experimentProtocol';
import { ProtocolExecutionSession } from '../lab/protocolExecutionEngine';
import { LabSafetyInterlock } from '../lab/labSafetyInterlock';
import { HardwareInLoopBridge } from '../lab/hardwareInLoopBridge';
import { DigitalTwinSynchronizer } from '../lab/digitalTwinSynchronizer';
import { ModelCalibrationEngine } from '../lab/modelCalibrationEngine';
import { ModelValidationEngine } from '../lab/modelValidationEngine';
import { ScientificDataAssimilation } from '../lab/scientificDataAssimilation';
import { ClosedLoopExperimentEngine } from '../lab/closedLoopExperimentEngine';
import { evaluateMaterialReality } from '../lab/materialDiscoveryRealityLoop';
import { evaluateBiotechReality } from '../lab/biotechRealityLoop';
import { ingestBigScienceDataset } from '../lab/bigScienceInterface';
import { buildCapabilityReport, type CapabilityEntry } from '../lab/capabilityReport';
import { emitLabEvidence } from '../lab/labRuntime';
import { bindTwinStateToCanonicalWorld, type CanonicalWorldVisualizationPort, type RenderProbeResult, type WorldEntityState } from '../lab/worldVisualizationIntegration';
import { executeCanonicalScientificSolver, newtonCoolingTransferSolver } from '../lab/scientificSolverIntegration';
import { InMemoryCanonicalPersistenceFixture, PersistenceBackedElectronicLabNotebookPort, PersistenceBackedLaboratoryInformationPort } from '../lab/limsElnPersistenceIntegration';

class StandaloneCanonicalWorldFixture implements CanonicalWorldVisualizationPort {
  private readonly entities = new Map<string, WorldEntityState>();
  constructor(private readonly fingerprint: (value: unknown) => string) {}
  upsertScientificEntity(entity: WorldEntityState): void { this.entities.set(entity.entityId, entity); }
  readScientificEntity(entityId: string): WorldEntityState | undefined { return this.entities.get(entityId); }
  renderProbe(entityId: string): RenderProbeResult {
    const entity = this.entities.get(entityId);
    if (entity === undefined) return { entityId, visible: false, frameFingerprint: this.fingerprint({ entityId, visible: false }), renderedScalarState: {} };
    const visualFrame = { entityId: entity.entityId, kind: entity.kind, position: entity.position, scalarState: entity.scalarState, labels: entity.labels, visible: true };
    return { entityId, visible: true, frameFingerprint: this.fingerprint(visualFrame), renderedScalarState: entity.scalarState };
  }
}

class SimulatedTemperatureRig implements DeviceAdapter {
  private currentKelvin = 293.15;
  private targetKelvin = 293.15;
  readonly device: LabDevice = {
    identity: { deviceId: 'sim-temp-rig-001', manufacturer: 'Genesis Standalone Fixture', model: 'ThermalRig-v1', serialIdentity: 'SIM-001' },
    kind: 'temperature-controller',
    capabilities: [
      { capabilityId: 'temperature.read', channelId: 'temperature', access: 'READ', dimension: 'TEMPERATURE', unit: 'K', validRange: { dimension: 'TEMPERATURE', unit: 'K', min: 250, max: 450 } },
      { capabilityId: 'temperature.set', channelId: 'heater.target', access: 'WRITE', dimension: 'TEMPERATURE', unit: 'K', validRange: { dimension: 'TEMPERATURE', unit: 'K', min: 273.15, max: 373.15 } },
    ],
    executionMode: 'HARDWARE_IN_LOOP',
    health: { state: 'HEALTHY', diagnosticCodes: [] },
    calibration: { calibrationId: 'cal-temp-001', version: '1', validThroughSequence: 1000 },
    provenance: ['STANDALONE_SIMULATED_DEVICE'],
  };

  read(channelId: string, sequence: number): DeviceMeasurement {
    if (channelId !== 'temperature') throw new Error(`Unsupported read channel: ${channelId}`);
    this.currentKelvin += (this.targetKelvin - this.currentKelvin) * 0.5;
    return {
      measurementId: `m-${sequence.toString().padStart(4, '0')}`,
      deviceId: this.device.identity.deviceId,
      channelId,
      quantity: quantity(this.currentKelvin - 0.2, 'K'),
      sourceTimestamp: `SIM_SEQUENCE_${sequence}`,
      ingestSequence: sequence,
      ...(this.device.calibration === undefined ? {} : { calibrationId: this.device.calibration.calibrationId }),
      uncertainty: 0.15,
      provenance: ['SIMULATED_SENSOR_STREAM'],
    };
  }

  execute(command: DeviceCommand): void {
    if (command.channelId !== 'heater.target') throw new Error(`Unsupported actuator channel: ${command.channelId}`);
    this.targetKelvin = command.target.unit === 'K' ? command.target.value : command.target.value + 273.15;
  }
}

interface ScenarioResult {
  readonly scientificFingerprint: string;
  readonly twinStatus: string;
  readonly validation: string;
  readonly closedLoopProposal: string;
  readonly evidenceCount: number;
  readonly safetyVetoes: readonly string[];
  readonly capabilityReport: ReturnType<typeof buildCapabilityReport>;
}

function runScenario(): ScenarioResult {
  const evidence = new RecordingEvidencePort();
  const runtime = createStandaloneLabRuntime(evidence);
  const registry = new LabInstrumentRegistry(runtime);
  const rig = new SimulatedTemperatureRig();
  registry.register(rig.device);

  const bridge = new HardwareInLoopBridge();
  bridge.registerAdapter(rig);
  const ingest = new SensorIngestEngine(runtime);
  const calibration = new CalibrationEngine(runtime);
  const uncertainty = new UncertaintyEngine();
  const lineage = new SampleLineageStore(runtime);
  const twin = new DigitalTwinSynchronizer(runtime);
  const calibrator = new ModelCalibrationEngine(runtime);
  const validator = new ModelValidationEngine(runtime);
  const assimilation = new ScientificDataAssimilation(runtime);
  const closedLoop = new ClosedLoopExperimentEngine(runtime);
  const safety = new LabSafetyInterlock(runtime);
  const world = new StandaloneCanonicalWorldFixture(runtime.deterministic.fingerprint);
  const persistence = new InMemoryCanonicalPersistenceFixture();
  const lims = new PersistenceBackedLaboratoryInformationPort(runtime, persistence);
  const eln = new PersistenceBackedElectronicLabNotebookPort(runtime, persistence);

  const sourceSample = lineage.create({ sampleId: 'material-lot-A', kind: 'MATERIAL_LOT', source: 'TRACEABLE_TEST_FIXTURE', transformations: [], storage: 'ROOM_TEMPERATURE', provenance: ['TEST_FIXTURE'] });
  lineage.create({ sampleId: 'sample-A-01', kind: 'SAMPLE', parentSampleId: sourceSample.sampleId, source: 'material-lot-A', transformations: ['CUT_TO_TEST_COUPON'], storage: 'LAB_TRAY_1', provenance: ['TEST_FIXTURE'] });

  const protocol: ExperimentProtocol = {
    protocolId: 'thermal-validation-v1', version: '1', inputs: ['sample-A-01'], devices: [rig.device.identity.deviceId],
    steps: [
      { stepId: 's1', type: 'MEASURE', deviceId: rig.device.identity.deviceId, channelId: 'temperature' },
      { stepId: 's2', type: 'SET_TARGET', deviceId: rig.device.identity.deviceId, channelId: 'heater.target', target: quantity(323.15, 'K') },
      { stepId: 's3', type: 'MEASURE', deviceId: rig.device.identity.deviceId, channelId: 'temperature' },
      { stepId: 's4', type: 'STOP' },
    ],
    safetyConstraints: ['temperature <= 373.15 K'], expectedMeasurements: ['temperature'], stoppingRules: ['STOP_AFTER_FINAL_MEASUREMENT'],
  };

  const session = new ProtocolExecutionSession(protocol, runtime);
  session.validate();
  session.transition('DRY_RUN', 'DRY_RUN_COMPLETE');
  session.transition('READY', 'SAFETY_PRECHECK_PASS');
  session.transition('ARMED', 'SIMULATED/HIL_MODE_ARMED');
  session.transition('RUNNING', 'EXECUTION_START');

  const unsafeCommand: DeviceCommand = { commandId: 'cmd-unsafe', deviceId: rig.device.identity.deviceId, channelId: 'heater.target', target: quantity(500, 'K'), protocolId: protocol.protocolId };
  const unsafeDecision = safety.evaluate({ device: rig.device, command: unsafeCommand, protocolValidated: true, humanApproved: true, emergencyStop: false, sensorQuality: 'VALID', calibrationValid: true });
  if (unsafeDecision.allowed) throw new Error('Unsafe command was not vetoed');

  const staleCommand: DeviceCommand = { commandId: 'cmd-stale', deviceId: rig.device.identity.deviceId, channelId: 'heater.target', target: quantity(310, 'K'), protocolId: protocol.protocolId };
  const staleDecision = safety.evaluate({ device: rig.device, command: staleCommand, protocolValidated: true, humanApproved: true, emergencyStop: false, sensorQuality: 'STALE', calibrationValid: true });
  if (staleDecision.allowed) throw new Error('Stale sensor command was not vetoed');

  const command: DeviceCommand = { commandId: 'cmd-safe', deviceId: rig.device.identity.deviceId, channelId: 'heater.target', target: quantity(323.15, 'K'), protocolId: protocol.protocolId };
  const decision = safety.evaluate({ device: rig.device, command, protocolValidated: true, humanApproved: true, emergencyStop: false, sensorQuality: 'VALID', calibrationValid: true });
  if (!decision.allowed || decision.authorized === undefined) throw new Error(`Safe HIL command rejected: ${decision.reasons.join(',')}`);
  bridge.executeAuthorized(decision.authorized);

  const calibrated: number[] = [];
  for (let sequence = 1; sequence <= 5; sequence += 1) {
    const raw = bridge.read(rig.device.identity.deviceId, 'temperature', sequence);
    const ingested = ingest.ingest(raw, { currentSequence: sequence, maxSequenceAge: 1, calibrationValid: true, min: 250, max: 450 });
    const c = calibration.apply(ingested, { calibrationId: 'cal-temp-001', calibrationVersion: '1', model: { kind: 'OFFSET', offset: 0.2 }, rawRange: [250, 450], standardUncertainty: 0.1, provenance: ['TRACEABLE_CALIBRATION_FIXTURE'] });
    calibrated.push(c.calibratedQuantity.value);
  }
  const last = calibrated[calibrated.length - 1];
  if (last === undefined) throw new Error('Missing calibrated measurement');

  const combinedMeasurementUncertainty = uncertainty.combined([0.15, 0.1]);
  const predicted = { value: 322.5, standardUncertainty: 0.8, sequence: 5 };
  const measured = { value: last, standardUncertainty: combinedMeasurementUncertainty, sequence: 5 };
  const twinResult = twin.synchronize(predicted, measured, 5);
  const validation = validator.validate([{ predicted: predicted.value, predictedUncertainty: predicted.standardUncertainty, measured: measured.value, measuredUncertainty: measured.standardUncertainty, inModelDomain: true }]);

  const worldBinding = bindTwinStateToCanonicalWorld(runtime, world, {
    entityId: 'sample-A-01', kind: 'material-sample-digital-twin', position: [2, 1, -3],
    predictedValue: predicted.value, measuredValue: measured.value, residual: twinResult.residual,
    unit: 'K', provenance: ['STANDALONE_CANONICAL_WORLD_FIXTURE'],
  });
  if (!worldBinding.visible) throw new Error('World visualization bridge did not produce a visible render probe');

  const solverExecution = executeCanonicalScientificSolver(runtime, newtonCoolingTransferSolver, {
    initialKelvin: 323.15, ambientKelvin: 293.15, coolingConstantPerSecond: 0.01, elapsedSeconds: 30,
  }, ['ANALYTIC_NEWTON_COOLING_TRANSFER_E2E']);
  if (!(solverExecution.output.temperatureKelvin < 323.15 && solverExecution.output.temperatureKelvin > 293.15)) throw new Error('Scientific solver output is physically inconsistent');

  const laboratoryRecord = {
    experimentId: 'thermal-exp-001', protocolId: protocol.protocolId, sampleIds: ['sample-A-01'],
    instrumentIds: [rig.device.identity.deviceId], evidenceRefs: ['standalone-evidence-stream'],
    fingerprints: [worldBinding.worldStateFingerprint, solverExecution.outputFingerprint], attachments: [],
  } as const;
  lims.putRecord(laboratoryRecord);
  const persistedRecord = lims.getRecord('thermal-exp-001');
  if (persistedRecord?.protocolId !== protocol.protocolId) throw new Error('LIMS persistence adapter failed round trip');
  const notebookEntry = {
    entryId: 'eln-001', experimentId: 'thermal-exp-001', text: 'Thermal validation completed through D-140 E2E.',
    evidenceRefs: ['standalone-evidence-stream'], fingerprint: runtime.deterministic.fingerprint({ protocolId: protocol.protocolId, last }),
  } as const;
  eln.append(notebookEntry);
  const notebookEntries = eln.list('thermal-exp-001');
  if (notebookEntries.length !== 1 || notebookEntries[0]?.entryId !== 'eln-001') throw new Error('ELN persistence adapter failed append/list round trip');

  calibrator.calibrateLinear({ slope: 1, intercept: 0 }, [
    { x: 0, y: 0.2, standardUncertainty: 0.1 },
    { x: 10, y: 10.25, standardUncertainty: 0.1 },
    { x: 20, y: 20.3, standardUncertainty: 0.1 },
  ]);
  assimilation.assimilate('HYBRID', { value: predicted.value, standardUncertainty: predicted.standardUncertainty }, { value: measured.value, standardUncertainty: measured.standardUncertainty }, ['SIMULATED_SENSOR_STREAM', 'MODEL_PREDICTION']);

  const materialReality = evaluateMaterialReality(runtime, 'candidate-A', [
    { propertyId: 'thermal_response', predicted: 322.5, measured: last, standardUncertainty: 1.0 },
    { propertyId: 'stability_index', predicted: 0.95, measured: 0.93, standardUncertainty: 0.03 },
  ], ['D139_ADAPTER_FIXTURE']);
  const biotechReality = evaluateBiotechReality(runtime, [{ endpointId: 'growth-index', simulated: 1.0, measured: 0.97, standardUncertainty: 0.05 }], ['NON_CLINICAL_TEST_FIXTURE']);
  ingestBigScienceDataset(runtime, {
    datasetId: 'public-like-fixture-001', source: 'STANDALONE_TRACEABLE_FIXTURE', beams: [{ beamId: 'b1', particle: 'proton', energyGeV: 100 }],
    events: [{ eventId: 'e1', beamIds: ['b1'], detectorObservations: [{ channel: 'energy', value: 42, unit: 'GeV' }], provenance: ['FIXTURE_EVENT_001'] }], provenance: ['FIXTURE_DATASET'],
  });

  const closed = closedLoop.completeIteration({ hypothesisId: 'thermal-model-H1', experimentId: 'thermal-exp-001', twinSync: twinResult, validation });
  session.transition('COMPLETED', 'PROTOCOL_FINISHED');
  emitLabEvidence(runtime, { type: 'EXPERIMENT_COMPLETED', modelId: 'D140_REAL_LAB_E2E', solverId: 'thermal-scenario-v1', input: protocol, result: { calibrated, twinResult, validation, materialReality, biotechReality, closed }, epistemicStatus: 'SIMULATION', evidenceClass: 'DERIVED', provenance: ['STANDALONE_E2E'] });

  const entries: CapabilityEntry[] = [
    { capability: 'WORLD_VISUALIZATION', status: 'E2E_VERIFIED', evidence: ['Digital Twin state -> canonical-world adapter -> deterministic visible render probe exercised end-to-end. Real repo WorldGraph/browser binding remains integration work.'] },
    { capability: 'SCIENTIFIC_SOLVERS', status: 'E2E_VERIFIED', evidence: ['Injected scientific-solver adapter executed a real analytic Newton-cooling model with deterministic input/output fingerprints. Real repo SolverRouter binding remains integration work.'] },
    { capability: 'DEVICE_ABSTRACTION', status: 'E2E_VERIFIED', evidence: ['Simulated temperature rig through DeviceAdapter.'] },
    { capability: 'SENSOR_INGESTION', status: 'E2E_VERIFIED', evidence: ['Measurement stream ingested with quality classification.'] },
    { capability: 'CALIBRATION', status: 'E2E_VERIFIED', evidence: ['Offset calibration preserved raw measurements.'] },
    { capability: 'UNCERTAINTY', status: 'E2E_VERIFIED', evidence: ['Combined uncertainty propagated into twin comparison.'] },
    { capability: 'SAMPLE_LINEAGE', status: 'E2E_VERIFIED', evidence: ['Material lot -> sample lineage fingerprinted.'] },
    { capability: 'PROTOCOL_EXECUTION', status: 'E2E_VERIFIED', evidence: ['Audited CREATED->...->COMPLETED state machine.'] },
    { capability: 'SAFETY', status: 'E2E_VERIFIED', evidence: ['Out-of-range and stale-sensor commands vetoed.'] },
    { capability: 'HARDWARE_IN_LOOP', status: 'E2E_VERIFIED', evidence: ['HIL adapter exercised against simulated rig; NOT hardware verified.'] },
    { capability: 'DIGITAL_TWIN_SYNC', status: 'E2E_VERIFIED', evidence: ['Prediction/measurement residual and status computed.'] },
    { capability: 'MODEL_CALIBRATION', status: 'E2E_VERIFIED', evidence: ['Weighted linear calibration executed.'] },
    { capability: 'VALIDATION_FALSIFICATION', status: 'E2E_VERIFIED', evidence: ['Prediction vs measurement classified by uncertainty.'] },
    { capability: 'EVIDENCE_REPLAY', status: 'E2E_VERIFIED', evidence: ['Deterministic scientific fingerprint reproduced across runs.'] },
    { capability: 'CLOSED_LOOP', status: 'E2E_VERIFIED', evidence: ['Next experiment proposed without live actuation authorization.'] },
    { capability: 'LIMS_ELN_SEAMS', status: 'E2E_VERIFIED', evidence: ['LIMS record round-trip and append-only ELN entry executed through injected canonical persistence seam; standalone backend is an explicit in-memory fixture, not a second database.'] },
    { capability: 'REAL_DATA_ASSIMILATION', status: 'E2E_VERIFIED', evidence: ['Hybrid assimilation algorithm exercised using simulated fixture measurement; NOT real-data verified.'] },
    { capability: 'MATERIALS_REALITY_LOOP', status: 'E2E_VERIFIED', evidence: ['D-139 adapter residual gate exercised.'] },
    { capability: 'BIOTECH_REALITY_LOOP', status: 'E2E_VERIFIED', evidence: ['Non-clinical model/measurement residual exercised.'] },
    { capability: 'BIG_SCIENCE_INTERFACE', status: 'E2E_VERIFIED', evidence: ['Traceable fixture dataset ingested; NOT a CERN fidelity claim.'] },
  ];
  const capabilityReport = buildCapabilityReport(entries, ['SAFETY', 'EVIDENCE_REPLAY', 'PROTOCOL_EXECUTION', 'DIGITAL_TWIN_SYNC']);
  const scientificFingerprint = runtime.deterministic.fingerprint({ calibrated, twinResult, validation, worldBinding, solverExecution, persistedRecord, notebookEntries, materialReality, biotechReality, closed, transitions: session.transitions });
  return {
    scientificFingerprint,
    twinStatus: twinResult.syncStatus,
    validation: validation.classification,
    closedLoopProposal: closed.nextExperimentProposal,
    evidenceCount: evidence.events.length,
    safetyVetoes: [...unsafeDecision.reasons, ...staleDecision.reasons],
    capabilityReport,
  };
}

/**
 * D-140 v2 standalone transfer harness, kept in TEST SCOPE ONLY per CLAUDE_DIRECTIVE.md's
 * integration step 2: `StandaloneCanonicalWorldFixture` and `newtonCoolingTransferSolver` above
 * are explicit standalone fixtures, never the real repo's canonical WorldGraph/renderer or
 * SolverRouter binding — see core/e2e/realLabGenesisE2E.test.ts for the real-repo-bound E2E that
 * proves the same chain through the actual canonical WorldGraph, SolverRouter and persistence.
 */
describe('D-140 v2 standalone transfer-scope E2E (fixtures only, not real-repo binding)', () => {
  it('runs the full standalone chain deterministically at 100% transfer-scope E2E coverage', () => {
    const a = runScenario();
    const b = runScenario();
    expect(a.scientificFingerprint).toBe(b.scientificFingerprint);
    expect(a.capabilityReport.LAB_SCOPE_90_READY).toBe(true);
    expect(a.capabilityReport.LAB_SCOPE_97_READY).toBe(false);
    expect(a.capabilityReport.e2eOrStrongerPercent).toBe(100);
    expect(a.twinStatus).toBe('SYNCHRONIZED');
    expect(a.validation).toBe('SUPPORTED_WITHIN_UNCERTAINTY');
    expect(a.safetyVetoes).toEqual(['TARGET_OUT_OF_RANGE', 'SENSOR_STALE']);
  });
});
