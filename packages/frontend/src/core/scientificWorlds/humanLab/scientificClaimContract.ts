/** Machine-enforced scientific claim boundary shared by Human Twin and external observations. */
export type ScientificClaimClass =
  | 'VISUALIZATION'
  | 'ILLUSTRATIVE_ANATOMY'
  | 'GENERIC_REFERENCE_MODEL'
  | 'SIMULATION'
  | 'IN_SILICO_SUPPORT'
  | 'RECONSTRUCTION'
  | 'EXTERNAL_OBSERVATION'
  | 'LAB_RESULT'
  | 'IN_VITRO_OBSERVATION'
  | 'IN_VIVO_OBSERVATION'
  | 'CLINICAL_OBSERVATION'
  | 'REPLICATED_CLINICAL_EVIDENCE'
  | 'PATIENT_SPECIFIC_MODEL'
  | 'UNBOUND_INSTRUMENT'
  | 'LIVE_INSTRUMENT_MEASUREMENT'
  | 'UNKNOWN';

export interface ScientificClaimTransition {
  readonly from: ScientificClaimClass;
  readonly to: ScientificClaimClass;
  readonly evidenceRefs: readonly string[];
  readonly reason: string;
}

const EVIDENCE_REQUIRED = new Set<ScientificClaimClass>([
  'EXTERNAL_OBSERVATION',
  'LAB_RESULT',
  'IN_VITRO_OBSERVATION',
  'IN_VIVO_OBSERVATION',
  'CLINICAL_OBSERVATION',
  'REPLICATED_CLINICAL_EVIDENCE',
  'PATIENT_SPECIFIC_MODEL',
  'LIVE_INSTRUMENT_MEASUREMENT',
]);

const PRESENTATION_OR_MODEL = new Set<ScientificClaimClass>([
  'VISUALIZATION',
  'ILLUSTRATIVE_ANATOMY',
  'GENERIC_REFERENCE_MODEL',
  'SIMULATION',
  'IN_SILICO_SUPPORT',
  'RECONSTRUCTION',
]);

const EMPIRICAL_OR_PHYSICAL = new Set<ScientificClaimClass>([
  'EXTERNAL_OBSERVATION',
  'LAB_RESULT',
  'IN_VITRO_OBSERVATION',
  'IN_VIVO_OBSERVATION',
  'CLINICAL_OBSERVATION',
  'REPLICATED_CLINICAL_EVIDENCE',
  'LIVE_INSTRUMENT_MEASUREMENT',
]);

export function assertScientificClaimTransition(transition: ScientificClaimTransition): void {
  if (!transition.reason.trim()) throw new Error('SCIENTIFIC_CLAIM_REASON_REQUIRED');
  if (
    (PRESENTATION_OR_MODEL.has(transition.from) && EMPIRICAL_OR_PHYSICAL.has(transition.to))
    || ((transition.from === 'ILLUSTRATIVE_ANATOMY' || transition.from === 'GENERIC_REFERENCE_MODEL') && transition.to === 'PATIENT_SPECIFIC_MODEL')
    || (transition.from === 'UNBOUND_INSTRUMENT' && transition.to === 'LIVE_INSTRUMENT_MEASUREMENT')
  ) {
    throw new Error(`SCIENTIFIC_CLAIM_PROMOTION_FORBIDDEN:${transition.from}->${transition.to}`);
  }
  if (EVIDENCE_REQUIRED.has(transition.to) && transition.evidenceRefs.length === 0) {
    throw new Error(`SCIENTIFIC_CLAIM_EVIDENCE_REQUIRED:${transition.to}`);
  }
  if (transition.to === 'REPLICATED_CLINICAL_EVIDENCE') {
    const independentRefs = new Set(transition.evidenceRefs.map((ref) => ref.trim()).filter(Boolean));
    if (transition.from !== 'CLINICAL_OBSERVATION' && transition.from !== 'REPLICATED_CLINICAL_EVIDENCE') {
      throw new Error(`SCIENTIFIC_CLAIM_REPLICATION_SOURCE_INVALID:${transition.from}`);
    }
    if (independentRefs.size < 2) throw new Error('SCIENTIFIC_CLAIM_INDEPENDENT_REPLICATION_REQUIRED');
  }
}

export function clinicalEfficacyClass(evidence: readonly ScientificClaimClass[]):
  | 'UNKNOWN'
  | 'COMPUTATIONAL_HYPOTHESIS'
  | 'IN_SILICO_SUPPORT'
  | 'IN_VITRO_OBSERVATION'
  | 'IN_VIVO_OBSERVATION'
  | 'CLINICAL_OBSERVATION'
  | 'REPLICATED_CLINICAL_EVIDENCE' {
  if (evidence.includes('REPLICATED_CLINICAL_EVIDENCE')) return 'REPLICATED_CLINICAL_EVIDENCE';
  if (evidence.includes('CLINICAL_OBSERVATION')) return 'CLINICAL_OBSERVATION';
  if (evidence.includes('IN_VIVO_OBSERVATION')) return 'IN_VIVO_OBSERVATION';
  if (evidence.includes('IN_VITRO_OBSERVATION')) return 'IN_VITRO_OBSERVATION';
  if (evidence.includes('IN_SILICO_SUPPORT')) return 'IN_SILICO_SUPPORT';
  if (evidence.includes('SIMULATION')) return 'COMPUTATIONAL_HYPOTHESIS';
  return 'UNKNOWN';
}
