/**
 * INDEPENDENT EVIDENCE AGGREGATION.
 *
 * "Nie pozwalaj, aby jeden model/źródło decydowało o kandydacie... Każdy
 * candidate otrzymuje: EVIDENCE_COUNT, EVIDENCE_QUALITY, EVIDENCE_INDEPENDENCE,
 * CONTRADICTIONS, MISSING_EVIDENCE."
 *
 * An "axis" here is a kind of evidence that can fail independently of the
 * others: a database record says nothing about literature, literature says
 * nothing about a structural computation, and so on. Quality is a function of
 * how many DISTINCT axes are present, never of how many items pile up on one
 * axis — ten citations of the same claim are still one axis.
 */
export const INDEPENDENT_EVIDENCE_VERSION = '1.0.0';

export type EvidenceAxis = 'NATURAL_OCCURRENCE_LITERATURE' | 'MECHANISM_LITERATURE' | 'DATABASE_RECORD' | 'STRUCTURAL_COMPUTATION' | 'ADMET_PREDICTION' | 'TARGET_DOCKING';

export interface EvidenceAxisEntry {
  axis: EvidenceAxis;
  present: boolean;
  /** What this axis found, or why it is absent. Never blank. */
  detail: string;
}

export type EvidenceQuality = 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
export type EvidenceIndependence = 'INDEPENDENT_MULTI_AXIS' | 'SINGLE_AXIS' | 'NONE';

export interface IndependentEvidenceAssessment {
  candidateKey: string;
  axes: readonly EvidenceAxisEntry[];
  evidenceCount: number;
  independentAxisCount: number;
  evidenceQuality: EvidenceQuality;
  evidenceIndependence: EvidenceIndependence;
  contradictions: readonly string[];
  missingEvidence: readonly string[];
}

/**
 * Aggregates evidence axes for one candidate into the report the mission
 * asks for. A contradiction downgrades quality regardless of axis count: a
 * candidate with five axes of evidence and one that directly conflicts is
 * NOT stronger than one with three axes and no conflict — an unresolved
 * contradiction is itself evidence of a problem.
 */
export function assessIndependentEvidence(
  candidateKey: string,
  axes: readonly EvidenceAxisEntry[],
  contradictions: readonly string[],
): IndependentEvidenceAssessment {
  const presentAxes = axes.filter((a) => a.present);
  const distinctAxes = new Set(presentAxes.map((a) => a.axis));
  const missingEvidence = axes.filter((a) => !a.present).map((a) => `${a.axis}: ${a.detail}`);

  let evidenceQuality: EvidenceQuality;
  if (contradictions.length > 0) {
    evidenceQuality = 'WEAK';
  } else if (distinctAxes.size >= 3) {
    evidenceQuality = 'STRONG';
  } else if (distinctAxes.size === 2) {
    evidenceQuality = 'MODERATE';
  } else if (distinctAxes.size === 1) {
    evidenceQuality = 'WEAK';
  } else {
    evidenceQuality = 'NONE';
  }

  const evidenceIndependence: EvidenceIndependence =
    distinctAxes.size >= 2 ? 'INDEPENDENT_MULTI_AXIS' : distinctAxes.size === 1 ? 'SINGLE_AXIS' : 'NONE';

  return {
    candidateKey,
    axes,
    evidenceCount: presentAxes.length,
    independentAxisCount: distinctAxes.size,
    evidenceQuality,
    evidenceIndependence,
    contradictions,
    missingEvidence,
  };
}
