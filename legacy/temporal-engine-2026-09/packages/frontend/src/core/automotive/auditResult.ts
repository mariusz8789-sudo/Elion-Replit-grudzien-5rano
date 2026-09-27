import { computeEstimateTotals, computeLineItemTotal } from './costCalculator';
import { analyzeGaps } from './gapAnalysis';
import { notAvailable } from './types';
import type {
  AutomotiveAssessment,
  AutomotiveAuditResult,
  EstimateLineItem,
  EvidenceStatus,
  GapFinding,
  OverallAuditStatus,
  SourceStatus,
  SourcedValue,
  VehicleIdentity,
} from './types';

export const AUDIT_RESULT_VERSION = '1.0.0';

function sourceToEvidence(status: SourceStatus): EvidenceStatus {
  if (status === 'NOT_AVAILABLE') return 'NOT_AVAILABLE';
  if (status === 'ACTUAL_SOURCE') return 'CONFIRMED';
  return 'POSSIBLE'; // USER_SUPPLIED and TEST_FIXTURE are both "not independently verified"
}

function withComputedTotal(item: EstimateLineItem): EstimateLineItem {
  return { ...item, total: computeLineItemTotal(item) };
}

function vehicleEvidenceStatus(vehicle: VehicleIdentity): EvidenceStatus {
  const statuses = [vehicle.make.status, vehicle.model.status, vehicle.modelYear.status].filter((s) => s !== 'NOT_AVAILABLE');
  if (statuses.length === 0) return 'NOT_AVAILABLE';
  // Weakest known status: any USER_SUPPLIED/TEST_FIXTURE component keeps the whole identity at POSSIBLE.
  return statuses.some((s) => s !== 'ACTUAL_SOURCE') ? 'POSSIBLE' : 'CONFIRMED';
}

function laborEvidenceStatus(assessment: AutomotiveAssessment): EvidenceStatus {
  if (assessment.labor.length === 0) return 'NOT_AVAILABLE';
  const statuses = assessment.labor.map((entry) => entry.rateSource);
  if (statuses.every((s) => s === 'NOT_AVAILABLE')) return 'NOT_AVAILABLE';
  return statuses.some((s) => s !== 'ACTUAL_SOURCE') ? 'POSSIBLE' : 'CONFIRMED';
}

function decideOverall(gaps: readonly GapFinding[], referenceStatus: SourceStatus, insurerPresent: boolean): OverallAuditStatus {
  if (!insurerPresent) return referenceStatus === 'NOT_AVAILABLE' ? 'NOT_ENOUGH_EVIDENCE_TO_DETERMINE' : 'NOT_COMPARABLE';
  if (gaps.some((g) => g.label === 'POTENTIAL_UNDERESTIMATION' || g.label === 'POTENTIAL_OMISSION')) return 'POTENTIAL_UNDERESTIMATION';
  if (gaps.some((g) => g.label === 'CONFIGURATION_MISMATCH')) return 'REQUIRES_INSPECTION';
  if (gaps.some((g) => g.label === 'REQUIRES_INSPECTION')) return 'REQUIRES_INSPECTION';
  if (gaps.some((g) => g.label === 'NOT_COMPARABLE')) return 'NOT_COMPARABLE';
  return 'NO_MEASURED_GAP';
}

function difference(reference: SourcedValue<number>, insurer: SourcedValue<number>): SourcedValue<number> {
  if (reference.value === null || insurer.value === null) return notAvailable();
  const weakest = reference.status === 'NOT_AVAILABLE' || insurer.status === 'NOT_AVAILABLE' ? 'NOT_AVAILABLE'
    : reference.status === 'TEST_FIXTURE' || insurer.status === 'TEST_FIXTURE' ? 'TEST_FIXTURE'
      : reference.status === 'USER_SUPPLIED' || insurer.status === 'USER_SUPPLIED' ? 'USER_SUPPLIED' : 'ACTUAL_SOURCE';
  return { status: weakest, value: Math.round((reference.value - insurer.value) * 100) / 100 };
}

/**
 * ORCHESTRATOR: turns raw assessment inputs into the one structure a report
 * or UI ever renders. Every computed value flows through
 * `costCalculator.ts`/`gapAnalysis.ts` — this function adds no arithmetic of
 * its own beyond status roll-ups and the final `overall` decision.
 *
 * "NOT ENOUGH EVIDENCE TO DETERMINE" is a valid, complete result — it is
 * returned rather than a forced guess whenever there is no reference total
 * AND no insurer estimate to compare against.
 */
export function buildAutomotiveAuditResult(assessment: AutomotiveAssessment): AutomotiveAuditResult {
  const referenceLineItems = assessment.referenceLineItems.map(withComputedTotal);
  const referenceTotals = computeEstimateTotals(referenceLineItems, assessment.taxRate);
  const referenceStatus: SourceStatus = referenceTotals.total.status;

  const insurerEstimate = assessment.insurerEstimate === null ? null : {
    ...assessment.insurerEstimate,
    lineItems: assessment.insurerEstimate.lineItems.map(withComputedTotal),
  };

  const gaps = insurerEstimate === null ? [] : analyzeGaps(referenceLineItems, insurerEstimate, assessment.configuration, assessment.findings);
  const insurerTotal = insurerEstimate === null ? notAvailable<number>() : insurerEstimate.total;

  return {
    contractVersion: AUDIT_RESULT_VERSION,
    assessmentId: assessment.assessmentId,
    vehicle: assessment.vehicle,
    vehicleStatus: vehicleEvidenceStatus(assessment.vehicle),
    findings: assessment.findings,
    parts: assessment.parts,
    referenceLineItems,
    referenceSubtotal: referenceTotals.subtotal,
    referenceTotal: referenceTotals.total,
    costStatus: referenceTotals.uncostedLineItemIds.length > 0 ? 'REQUIRES_INSPECTION' : sourceToEvidence(referenceStatus),
    laborStatus: laborEvidenceStatus(assessment),
    insurerEstimateStatus: insurerEstimate === null ? 'NOT_AVAILABLE' : sourceToEvidence(insurerEstimate.source),
    insurerTotal,
    difference: difference(referenceTotals.total, insurerTotal),
    gaps,
    overall: decideOverall(gaps, referenceStatus, insurerEstimate !== null),
  };
}
