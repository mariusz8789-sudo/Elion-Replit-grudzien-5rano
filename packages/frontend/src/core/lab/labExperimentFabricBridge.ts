import { createRealExperimentRun, type DerivedMeasurement, type RawMeasurement, type RealExperimentRequest, type RealExperimentRun } from '../experimentFabric/realExperiment';
import type { IngestedMeasurement } from './sensorIngestEngine';

/**
 * D-140 lab -> Experiment Fabric seam. Until now the lab layer (`SensorIngestEngine` etc.) and the
 * Fabric's real-experiment contract (`experimentFabric/realExperiment.ts`) were both on main but
 * never connected: an admitted instrument reading could not become the `ExperimentRun` that
 * Evidence Packs, Science Memory and `verifyPredictionAgainstRealExperiment` consume. This is only
 * the adapter between the two existing shapes; it adds no run type, ledger or storage.
 *
 * Epistemic rules:
 * - only readings `SensorIngestEngine` classified `VALID` are admitted;
 * - `SIMULATED_DEVICE` readings are refused outright: simulated output never becomes a
 *   `REAL_EXPERIMENTAL` run, whatever the transport;
 * - `RECORDED_MEASUREMENT` readings are admitted (they are replayed real measurements) and the run
 *   carries a warning saying so;
 * - each raw reading keeps its device, calibration, configuration and ingest fingerprints.
 */
export type LabOutputReducer = 'mean' | 'last';

export interface LabOutputSpec {
  readonly outputKey: string;
  readonly deviceId: string;
  readonly channelId: string;
  readonly reducer: LabOutputReducer;
}

function toRaw(m: IngestedMeasurement): RawMeasurement {
  if (m.sourceKind === 'SIMULATED_DEVICE') {
    throw new Error(`Measurement ${m.measurementId} is SIMULATED_DEVICE output; simulated data never becomes a REAL_EXPERIMENTAL run.`);
  }
  if (m.quality !== 'VALID') {
    throw new Error(`Measurement ${m.measurementId} was classified ${m.quality} (${m.qualityReasons.join(', ')}); only VALID readings can back a real experiment.`);
  }
  if (m.calibrationId === undefined || m.configurationFingerprint === undefined) {
    throw new Error(`Measurement ${m.measurementId} lacks calibration or configuration lineage.`);
  }
  return {
    channel: `${m.deviceId}/${m.channelId}`,
    value: m.quantity.value,
    unit: m.quantity.unit,
    capturedAt: m.sourceTimestamp,
    instrument: {
      sourceKind: m.sourceKind,
      deviceId: m.deviceId,
      measurementId: m.measurementId,
      calibrationId: m.calibrationId,
      configurationFingerprint: m.configurationFingerprint,
      ingestFingerprint: m.ingestFingerprint,
    },
  };
}

export function createRealExperimentRunFromLab(input: {
  request: RealExperimentRequest;
  measurements: readonly IngestedMeasurement[];
  outputs: readonly LabOutputSpec[];
  summary: string;
  assumptions?: readonly string[];
  warnings?: readonly string[];
}): RealExperimentRun {
  if (input.outputs.length === 0) throw new Error('At least one output must be derived from lab measurements.');
  const derived: DerivedMeasurement[] = input.outputs.map((spec) => {
    const readings = input.measurements
      .filter((m) => m.deviceId === spec.deviceId && m.channelId === spec.channelId)
      .sort((a, b) => a.ingestSequence - b.ingestSequence);
    if (readings.length === 0) throw new Error(`No measurements for ${spec.deviceId}/${spec.channelId} back output "${spec.outputKey}".`);
    const raws = readings.map(toRaw);
    const unit = raws[0]!.unit;
    if (raws.some((r) => r.unit !== unit)) throw new Error(`Output "${spec.outputKey}" mixes units; convert at the instrument, not here.`);
    const value = spec.reducer === 'last' ? raws[raws.length - 1]!.value : raws.reduce((s, r) => s + r.value, 0) / raws.length;
    return { outputKey: spec.outputKey, value, unit, derivedFrom: raws };
  });
  const kinds = new Set(derived.flatMap((d) => d.derivedFrom.map((r) => r.instrument?.sourceKind)));
  const warnings = [...(input.warnings ?? [])];
  if (kinds.has('RECORDED_MEASUREMENT')) warnings.push('Includes RECORDED_MEASUREMENT readings: replayed real measurements, not a live acquisition in this run.');
  return createRealExperimentRun({
    request: input.request,
    derived,
    summary: input.summary,
    assumptions: [...(input.assumptions ?? []), ...derived.map((d) => `${d.outputKey} = ${input.outputs.find((o) => o.outputKey === d.outputKey)!.reducer} of ${d.derivedFrom.length} ingested reading(s).`)],
    warnings,
  });
}
