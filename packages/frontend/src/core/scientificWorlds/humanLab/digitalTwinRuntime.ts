import { stableHash } from './hash';
import { simulatePhysiology } from './physiology';
import type { HumanDigitalTwinManifest, PhysiologicalState } from './types';
import type { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { clinicalEfficacyClass } from './scientificClaimContract';

export { admitHumanTwinObservation, type HumanTwinObservation, type HumanTwinObservationInput } from './humanTwinObservation';

export type TwinDatumOrigin =
  | 'GENERIC_REFERENCE_MODEL'
  | 'SIMPLIFIED_MODEL'
  | 'EXTERNAL_OBSERVATION'
  | 'INFERRED_PARAMETER'
  | 'UNKNOWN';

export interface TwinDatum<T> {
  readonly value: T;
  readonly unit: string;
  readonly origin: TwinDatumOrigin;
  readonly source: string;
  readonly timestampLogicalSeconds: number;
  readonly modelVersion: string | null;
  readonly uncertainty: Readonly<{ kind: 'NOT_QUANTIFIED'; reason: string } | { kind: 'INTERVAL'; low: number; high: number }>;
  readonly directObservation: boolean;
  readonly simulated: boolean;
  readonly inferred: boolean;
  readonly provenanceRef: string;
}

export interface HumanTwinStateSnapshot {
  readonly twinId: string;
  readonly anatomyVersion: string;
  readonly logicalTimeSeconds: number;
  readonly physiology: Readonly<{
    heartRateBpm: TwinDatum<number>;
    respiratoryRatePerMin: TwinDatum<number>;
    oxygenSaturationPercent: TwinDatum<number>;
    systolicMmHg: TwinDatum<number>;
    diastolicMmHg: TwinDatum<number>;
    bodyTemperatureC: TwinDatum<number>;
    cerebralPerfusionIndex: TwinDatum<number>;
  }>;
  readonly modelCoverage: readonly HumanTwinSubsystemCoverage[];
  readonly clinicalUse: 'NOT_A_MEDICAL_DEVICE';
  readonly stateFingerprint: string;
}

export type HumanTwinModelStatus = 'REAL_MODEL' | 'SIMPLIFIED_MODEL' | 'ILLUSTRATIVE_ONLY' | 'NOT_MODELED';

const MODEL_ID = 'genesis-human-physiology-educational';
const MODEL_VERSION = '1.0';

export interface HumanTwinSubsystemCoverage {
  readonly subsystem: 'ANATOMY' | 'CARDIOVASCULAR' | 'RESPIRATORY' | 'NERVOUS' | 'THERMOREGULATION' | 'ENDOCRINE' | 'METABOLISM' | 'DIGESTIVE' | 'RENAL' | 'IMMUNE';
  readonly status: HumanTwinModelStatus;
  readonly modelId: string | null;
  readonly limitation: string;
}

export const HUMAN_TWIN_MODEL_COVERAGE: readonly HumanTwinSubsystemCoverage[] = Object.freeze([
  { subsystem: 'ANATOMY', status: 'ILLUSTRATIVE_ONLY', modelId: null, limitation: 'Generic procedural reference anatomy; not measured or patient-specific.' },
  { subsystem: 'CARDIOVASCULAR', status: 'SIMPLIFIED_MODEL', modelId: MODEL_ID, limitation: 'Heart rate and blood pressure only; no haemodynamic circulation solver.' },
  { subsystem: 'RESPIRATORY', status: 'SIMPLIFIED_MODEL', modelId: MODEL_ID, limitation: 'Respiratory rate and oxygen saturation only; no gas-exchange solver.' },
  { subsystem: 'NERVOUS', status: 'SIMPLIFIED_MODEL', modelId: MODEL_ID, limitation: 'Cerebral perfusion index only; no validated neural physiology.' },
  { subsystem: 'THERMOREGULATION', status: 'SIMPLIFIED_MODEL', modelId: MODEL_ID, limitation: 'Bounded circadian temperature term only.' },
  { subsystem: 'ENDOCRINE', status: 'NOT_MODELED', modelId: null, limitation: 'No admitted hormonal dynamics solver.' },
  { subsystem: 'METABOLISM', status: 'NOT_MODELED', modelId: null, limitation: 'No admitted metabolic-network solver.' },
  { subsystem: 'DIGESTIVE', status: 'NOT_MODELED', modelId: null, limitation: 'Anatomy is present; functional dynamics are not modelled.' },
  { subsystem: 'RENAL', status: 'NOT_MODELED', modelId: null, limitation: 'Anatomy is present; renal dynamics are not modelled.' },
  { subsystem: 'IMMUNE', status: 'NOT_MODELED', modelId: null, limitation: 'No admitted immune-response solver.' },
]);

export type HumanTwinInterventionKind =
  | 'ACTIVITY_CHANGE'
  | 'COMPOUND_EXPOSURE'
  | 'ENVIRONMENTAL_CONDITION'
  | 'PHYSIOLOGICAL_PERTURBATION'
  | 'TREATMENT_HYPOTHESIS';

export interface HumanTwinIntervention {
  readonly executionId: string;
  readonly twinId: string;
  readonly kind: HumanTwinInterventionKind;
  readonly durationSeconds: number;
  readonly parameters: Readonly<Record<string, number | string | boolean>>;
  readonly source: string;
  readonly requestedAtLogicalSeconds: number;
}

export interface HumanTwinInterventionResult {
  readonly executionId: string;
  readonly status: 'EXECUTED_SIMPLIFIED_MODEL' | 'BLOCKED_NOT_MODELED' | 'REJECTED';
  readonly modelId: string | null;
  readonly modelVersion: string | null;
  readonly inputState: HumanTwinStateSnapshot;
  readonly outputState: HumanTwinStateSnapshot | null;
  readonly parameters: HumanTwinIntervention['parameters'];
  readonly provenance: Readonly<{ source: string; modelSource: string | null }>;
  readonly limitations: readonly string[];
  readonly replayIdentity: string;
}

function datum(value: number, unit: string, time: number, provenanceRef: string): TwinDatum<number> {
  return {
    value,
    unit,
    origin: 'SIMPLIFIED_MODEL',
    source: 'humanLab/physiology.ts::simulatePhysiology',
    timestampLogicalSeconds: time,
    modelVersion: MODEL_VERSION,
    uncertainty: { kind: 'NOT_QUANTIFIED', reason: 'The educational physiology model has no validated uncertainty calibration.' },
    directObservation: false,
    simulated: true,
    inferred: false,
    provenanceRef,
  };
}

function snapshotFromPhysiology(manifest: HumanDigitalTwinManifest, state: PhysiologicalState, time: number, provenanceRef: string): HumanTwinStateSnapshot {
  const unsigned = {
    twinId: manifest.twinId,
    anatomyVersion: manifest.anatomyVersion,
    logicalTimeSeconds: time,
    physiology: {
      heartRateBpm: datum(state.heartRateBpm, 'bpm', time, provenanceRef),
      respiratoryRatePerMin: datum(state.respiratoryRatePerMin, '1/min', time, provenanceRef),
      oxygenSaturationPercent: datum(state.oxygenSaturationPercent, '%', time, provenanceRef),
      systolicMmHg: datum(state.bloodPressureMmHg.systolic, 'mmHg', time, provenanceRef),
      diastolicMmHg: datum(state.bloodPressureMmHg.diastolic, 'mmHg', time, provenanceRef),
      bodyTemperatureC: datum(state.bodyTemperatureC, 'degC', time, provenanceRef),
      cerebralPerfusionIndex: datum(state.cerebralPerfusionIndex, '1', time, provenanceRef),
    },
    modelCoverage: HUMAN_TWIN_MODEL_COVERAGE,
    clinicalUse: 'NOT_A_MEDICAL_DEVICE' as const,
  };
  return { ...unsigned, stateFingerprint: stableHash(unsigned) };
}

export function createHumanTwinState(manifest: HumanDigitalTwinManifest, options: { readonly seed: number; readonly logicalTimeSeconds?: number; readonly activity?: number }): HumanTwinStateSnapshot {
  const time = options.logicalTimeSeconds ?? 0;
  const provenanceRef = `human-state:${stableHash({ twinId: manifest.twinId, seed: options.seed, time, activity: options.activity ?? 0.2 })}`;
  return snapshotFromPhysiology(manifest, simulatePhysiology({ seed: options.seed, timeSeconds: time, activity: options.activity ?? 0.2 }), time, provenanceRef);
}

export function executeHumanTwinIntervention(manifest: HumanDigitalTwinManifest, input: HumanTwinStateSnapshot, intervention: HumanTwinIntervention): HumanTwinInterventionResult {
  const base = { executionId: intervention.executionId, inputState: input, parameters: intervention.parameters };
  if (input.twinId !== manifest.twinId || intervention.twinId !== manifest.twinId || intervention.durationSeconds <= 0) {
    return { ...base, status: 'REJECTED', modelId: null, modelVersion: null, outputState: null, provenance: { source: intervention.source, modelSource: null }, limitations: ['Twin identity mismatch or non-positive duration.'], replayIdentity: stableHash({ intervention, input: input.stateFingerprint, status: 'REJECTED' }) };
  }
  if (intervention.kind !== 'ACTIVITY_CHANGE') {
    return { ...base, status: 'BLOCKED_NOT_MODELED', modelId: null, modelVersion: null, outputState: null, provenance: { source: intervention.source, modelSource: null }, limitations: [`${intervention.kind} has no admitted physiological solver. No response was invented.`], replayIdentity: stableHash({ intervention, input: input.stateFingerprint, status: 'BLOCKED_NOT_MODELED' }) };
  }
  const activity = intervention.parameters.activity;
  if (typeof activity !== 'number' || !Number.isFinite(activity) || activity < 0 || activity > 1) {
    return { ...base, status: 'REJECTED', modelId: MODEL_ID, modelVersion: MODEL_VERSION, outputState: null, provenance: { source: intervention.source, modelSource: 'humanLab/physiology.ts' }, limitations: ['activity must be a finite number in [0,1].'], replayIdentity: stableHash({ intervention, input: input.stateFingerprint, status: 'REJECTED' }) };
  }
  const nextTime = input.logicalTimeSeconds + intervention.durationSeconds;
  const seed = Number.parseInt(stableHash({ executionId: intervention.executionId, twinId: manifest.twinId }), 16) >>> 0;
  const provenanceRef = `human-intervention:${stableHash({ intervention, input: input.stateFingerprint, model: MODEL_VERSION })}`;
  const outputState = snapshotFromPhysiology(manifest, simulatePhysiology({ seed, timeSeconds: nextTime, activity }), nextTime, provenanceRef);
  const limitations = [
    'Educational deterministic physiology only; not clinically validated and not patient-specific.',
    'The output is a SIMPLIFIED_MODEL, not an observation or treatment prediction.',
  ];
  return { ...base, status: 'EXECUTED_SIMPLIFIED_MODEL', modelId: MODEL_ID, modelVersion: MODEL_VERSION, outputState, provenance: { source: intervention.source, modelSource: 'humanLab/physiology.ts::simulatePhysiology' }, limitations, replayIdentity: stableHash({ intervention, input: input.stateFingerprint, output: outputState.stateFingerprint, model: MODEL_VERSION }) };
}

export function replayHumanTwinIntervention(manifest: HumanDigitalTwinManifest, prior: HumanTwinInterventionResult, intervention: HumanTwinIntervention): Readonly<{ verdict: 'MATCH' | 'DRIFT' | 'BLOCKED'; replay: HumanTwinInterventionResult }> {
  const replay = executeHumanTwinIntervention(manifest, prior.inputState, intervention);
  if (prior.status === 'BLOCKED_NOT_MODELED') return { verdict: replay.status === prior.status && replay.replayIdentity === prior.replayIdentity ? 'MATCH' : 'DRIFT', replay };
  if (!prior.outputState || !replay.outputState) return { verdict: 'BLOCKED', replay };
  return { verdict: replay.replayIdentity === prior.replayIdentity && replay.outputState.stateFingerprint === prior.outputState.stateFingerprint ? 'MATCH' : 'DRIFT', replay };
}

/** Commits the deterministic model execution to the canonical ledger as model evidence, never as an observation. */
export function commitHumanTwinInterventionEvidence(ledger: EvidenceLedger, result: HumanTwinInterventionResult): Readonly<{ evidenceRecordId: string; evidenceContentHash: string; deduped: boolean }> {
  const clinicalEfficacy = clinicalEfficacyClass(['SIMULATION']);
  const claim = JSON.stringify({
    executionId: result.executionId,
    status: result.status,
    modelId: result.modelId,
    modelVersion: result.modelVersion,
    inputStateFingerprint: result.inputState.stateFingerprint,
    outputStateFingerprint: result.outputState?.stateFingerprint ?? null,
    parameters: result.parameters,
    replayIdentity: result.replayIdentity,
    limitations: result.limitations,
    clinicalEfficacy,
  });
  const added = ledger.addRecord({
    sourceUrl: `genesis://human-twin/intervention/${encodeURIComponent(result.executionId)}`,
    sourceTimestamp: null,
    claim,
    claimType: 'model',
    confidence: result.status === 'EXECUTED_SIMPLIFIED_MODEL' ? 0.5 : 0,
    provenance: {
      sourceKind: 'dataset',
      retrievedBy: 'humanLab/digitalTwinRuntime.ts',
      independentSourceIds: [result.replayIdentity],
    },
  });
  return Object.freeze({ evidenceRecordId: added.record.id, evidenceContentHash: added.record.contentHash, deduped: added.deduped });
}
