import { buildExperimentGraph, type ExperimentGraph } from '../experimentFabric/experimentGraph';
import { buildAutomotiveEvidenceChain, buildAutomotiveExperimentRun } from './evidence';
import type { AutomotiveAuditResult } from './types';

/**
 * NEXT-EXPERIMENT REUSE, WHERE IT GENUINELY FITS (§15).
 *
 * `buildExperimentGraph()` (`experimentGraph.ts`) is reused UNCHANGED for the
 * QUESTION → HYPOTHESIS → EXPERIMENT → RESULT → EVIDENCE portion — feeding it
 * the real automotive `ExperimentRun` and `ScientificEvidenceChain` produces
 * a genuine graph, not a re-implementation.
 *
 * Its OWN `nextExperiment` proposal mechanism (`proposeNext`) is NOT reused
 * for "what data do we still need": its `UncertaintyKind` vocabulary
 * (`SINGLE_SEED`, `SINGLE_PARAMETER_POINT`, `NO_INDEPENDENT_OBSERVATION`,
 * …) describes gaps in a MODEL's own execution coverage (untried seeds,
 * unswept parameters) — it has no concept of "connect an external VIN/
 * vision/pricing provider", and inventing one would mean adding a new
 * `UncertaintyKind` to that generic, shared engine, which this spike is
 * instructed not to modify. So `proposeNextAutomotiveDataRequests` below is
 * a small, separate, deterministic scan — explicitly NOT part of
 * `proposeNext()` — that turns this result's own `NOT_AVAILABLE` fields into
 * concrete `NEXT_DATA_REQUEST` entries.
 */
export const AUTOMOTIVE_NEXT_STEP_VERSION = '1.0.0';

export function buildAutomotiveExperimentGraph(result: AutomotiveAuditResult): ExperimentGraph {
  const run = buildAutomotiveExperimentRun(result);
  const chain = buildAutomotiveEvidenceChain(result);
  return buildExperimentGraph({
    question: `Does the insurer estimate for assessment ${result.assessmentId} appear potentially incomplete?`,
    runs: [run],
    evidenceChains: [chain],
  });
}

export type NextAutomotiveDataTarget =
  | 'VIN_PROVIDER' | 'VISION_PROVIDER' | 'OEM_CATALOG' | 'AFTERMARKET_CATALOG'
  | 'PRICING_PROVIDER' | 'LABOR_RATE_PROVIDER' | 'ADDITIONAL_PHOTO' | 'INSURER_ESTIMATE';

export interface NextAutomotiveDataRequest {
  kind: 'NEXT_DATA_REQUEST';
  target: NextAutomotiveDataTarget;
  reason: string;
}

/**
 * Deterministic scan of one result's own `NOT_AVAILABLE`/`REQUIRES_INSPECTION`
 * fields into concrete next-data requests. Never invents an external result
 * — every entry names a MISSING capability, not a guessed value.
 */
export function proposeNextAutomotiveDataRequests(result: AutomotiveAuditResult): readonly NextAutomotiveDataRequest[] {
  const requests: NextAutomotiveDataRequest[] = [];

  if (result.vehicleStatus === 'NOT_AVAILABLE') {
    requests.push({ kind: 'NEXT_DATA_REQUEST', target: 'VIN_PROVIDER', reason: 'Vehicle identity is NOT_AVAILABLE — a VIN lookup would resolve make/model/year from source.' });
  }
  for (const part of result.parts) {
    if (part.oemNumber.status === 'NOT_AVAILABLE') {
      requests.push({ kind: 'NEXT_DATA_REQUEST', target: 'OEM_CATALOG', reason: `OEM part number for "${part.label}" is NOT_AVAILABLE.` });
    }
    if (part.aftermarketNumber.status === 'NOT_AVAILABLE') {
      requests.push({ kind: 'NEXT_DATA_REQUEST', target: 'AFTERMARKET_CATALOG', reason: `Aftermarket part number for "${part.label}" is NOT_AVAILABLE.` });
    }
    if (part.fitmentStatus === 'REQUIRES_INSPECTION' || part.fitmentStatus === 'NOT_AVAILABLE') {
      requests.push({ kind: 'NEXT_DATA_REQUEST', target: 'ADDITIONAL_PHOTO', reason: `Fitment for "${part.label}" needs a clearer photo to confirm.` });
    }
  }
  for (const finding of result.findings) {
    if (finding.status === 'POSSIBLE' || finding.status === 'REQUIRES_INSPECTION') {
      requests.push({ kind: 'NEXT_DATA_REQUEST', target: 'VISION_PROVIDER', reason: `Finding "${finding.findingId}" (${finding.status}) needs a real vision/inspection pass to confirm.` });
    }
  }
  if (result.costStatus === 'NOT_AVAILABLE' || result.costStatus === 'REQUIRES_INSPECTION') {
    requests.push({ kind: 'NEXT_DATA_REQUEST', target: 'PRICING_PROVIDER', reason: 'Reference cost is not fully priced — one or more parts have no available price source.' });
  }
  if (result.laborStatus === 'NOT_AVAILABLE') {
    requests.push({ kind: 'NEXT_DATA_REQUEST', target: 'LABOR_RATE_PROVIDER', reason: 'No labor rate source is available for this assessment.' });
  }
  if (result.insurerEstimateStatus === 'NOT_AVAILABLE') {
    requests.push({ kind: 'NEXT_DATA_REQUEST', target: 'INSURER_ESTIMATE', reason: 'No insurer estimate was supplied — gap analysis could not run.' });
  }

  return requests;
}
