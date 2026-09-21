export type LabEpistemicStatus = 'SIMULATION' | 'MEASURED' | 'HYBRID_DERIVED' | 'REPLAY';
export type LabEvidenceClass = 'MODEL' | 'MEASUREMENT' | 'DERIVED';

export type LabEvidenceEventType =
  | 'DEVICE_REGISTERED'
  | 'MEASUREMENT_INGESTED'
  | 'CALIBRATION_APPLIED'
  | 'PROTOCOL_VALIDATED'
  | 'PROTOCOL_EXECUTED'
  | 'SAFETY_INTERLOCK_TRIGGERED'
  | 'DIGITAL_TWIN_SYNCHRONIZED'
  | 'MODEL_CALIBRATED'
  | 'MODEL_VALIDATED'
  | 'EXPERIMENT_COMPLETED'
  | 'CLOSED_LOOP_ITERATION_COMPLETED'
  | 'SAMPLE_LINEAGE_UPDATED'
  | 'DATA_ASSIMILATED'
  | 'MATERIAL_REALITY_LOOP_COMPLETED'
  | 'BIOTECH_REALITY_LOOP_COMPLETED'
  | 'BIG_SCIENCE_DATASET_INGESTED'
  | 'WORLD_TWIN_VISUALIZED'
  | 'SCIENTIFIC_SOLVER_EXECUTED'
  | 'LIMS_RECORD_PERSISTED'
  | 'ELN_ENTRY_APPENDED';

export interface LabEvidenceEvent {
  readonly type: LabEvidenceEventType;
  readonly modelId: string;
  readonly solverId: string;
  readonly inputFingerprint: string;
  readonly resultFingerprint: string;
  readonly epistemicStatus: LabEpistemicStatus;
  readonly evidenceClass: LabEvidenceClass;
  readonly limitations: readonly string[];
  readonly assumptions: readonly string[];
  readonly provenance: readonly string[];
}

/** Narrow seam only. Replace with Genesis canonical EvidencePort during integration. */
export interface LabEvidencePort {
  emit(event: LabEvidenceEvent): void;
}

export interface DeterministicLabRuntime {
  canonicalize(value: unknown): string;
  fingerprint(value: unknown): string;
}

export interface LabRuntime {
  readonly deterministic: DeterministicLabRuntime;
  readonly evidence?: LabEvidencePort;
}

export interface EvidenceInput {
  readonly type: LabEvidenceEventType;
  readonly modelId: string;
  readonly solverId: string;
  readonly input: unknown;
  readonly result: unknown;
  readonly epistemicStatus: LabEpistemicStatus;
  readonly evidenceClass: LabEvidenceClass;
  readonly limitations?: readonly string[];
  readonly assumptions?: readonly string[];
  readonly provenance?: readonly string[];
}

export function emitLabEvidence(runtime: LabRuntime, event: EvidenceInput): string {
  const resultFingerprint = runtime.deterministic.fingerprint(event.result);
  runtime.evidence?.emit({
    type: event.type,
    modelId: event.modelId,
    solverId: event.solverId,
    inputFingerprint: runtime.deterministic.fingerprint(event.input),
    resultFingerprint,
    epistemicStatus: event.epistemicStatus,
    evidenceClass: event.evidenceClass,
    limitations: event.limitations ?? [],
    assumptions: event.assumptions ?? [],
    provenance: event.provenance ?? [],
  });
  return resultFingerprint;
}
