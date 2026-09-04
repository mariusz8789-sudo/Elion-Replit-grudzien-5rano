/**
 * READ-ONLY SCENARIO OVERLAY GATE.
 *
 * This module deliberately knows no hazard solver, City3D renderer, Three.js,
 * WorldStateView or epidemic simulation. It decides only whether a future
 * renderer MAY receive a separately projected scenario overlay. The default
 * policy is disabled, so adding a projection type cannot accidentally create
 * a visual layer or a second world state.
 */

export type ScenarioOverlayGateReason =
  | 'INTEGRATION_DISABLED'
  | 'UNSUPPORTED_SCHEMA'
  | 'NON_SCENARIO_DATA'
  | 'EVIDENCE_INCOMPLETE'
  | 'REPLAY_NOT_MATCH'
  | 'MAPPING_UNAVAILABLE'
  | 'MAPPING_INVALID';

export interface ScenarioOverlayEvidenceView {
  readonly replayStatus: string;
  readonly missingFields: readonly string[];
}

/** A versioned mapping is required; local fixture coordinates are never guessed into CityWorld space. */
export interface ScenarioOverlayCoordinateMapping {
  readonly mappingId: string;
  readonly mappingVersion: string;
  readonly mappingFingerprint: string;
}

/** Structural input only: domain-specific source types remain outside this shared gate. */
export interface ScenarioOverlayCandidate {
  readonly overlayKind: string;
  readonly schemaVersion: string;
  readonly datasetStatuses: readonly string[];
  readonly evidence: ScenarioOverlayEvidenceView;
  readonly coordinateMapping: ScenarioOverlayCoordinateMapping | null;
}

export interface ScenarioOverlayPolicy {
  readonly enabled: boolean;
  readonly supportedSchemas: readonly string[];
}

export interface ScenarioOverlayGateResult {
  readonly enabled: boolean;
  readonly reasons: readonly ScenarioOverlayGateReason[];
}

/** No scenario overlay can render unless an owning integration explicitly opts in after independent audit. */
export const DEFAULT_SCENARIO_OVERLAY_POLICY: Readonly<ScenarioOverlayPolicy> = Object.freeze({
  enabled: false,
  supportedSchemas: Object.freeze([]),
});

function hasMapping(mapping: ScenarioOverlayCoordinateMapping | null): boolean {
  return Boolean(mapping && mapping.mappingId && mapping.mappingVersion && mapping.mappingFingerprint);
}

/**
 * Pure, non-mutating guard for a future scenario overlay adapter. A positive
 * result authorizes only a separate read-only renderer input; it never
 * authorizes edits to WorldStateView, agents, contacts, routing or outcomes.
 */
export function evaluateScenarioOverlayEligibility(
  candidate: ScenarioOverlayCandidate,
  policy: ScenarioOverlayPolicy = DEFAULT_SCENARIO_OVERLAY_POLICY,
): ScenarioOverlayGateResult {
  const reasons: ScenarioOverlayGateReason[] = [];
  if (!policy.enabled) reasons.push('INTEGRATION_DISABLED');
  if (!candidate.overlayKind || !candidate.schemaVersion || !policy.supportedSchemas.includes(candidate.schemaVersion)) {
    reasons.push('UNSUPPORTED_SCHEMA');
  }
  if (candidate.datasetStatuses.length === 0 || candidate.datasetStatuses.some((status) => status !== 'SCENARIO')) {
    reasons.push('NON_SCENARIO_DATA');
  }
  if (candidate.evidence.missingFields.length > 0) reasons.push('EVIDENCE_INCOMPLETE');
  if (candidate.evidence.replayStatus !== 'MATCH') reasons.push('REPLAY_NOT_MATCH');
  if (!candidate.coordinateMapping) reasons.push('MAPPING_UNAVAILABLE');
  else if (!hasMapping(candidate.coordinateMapping)) reasons.push('MAPPING_INVALID');
  return { enabled: reasons.length === 0, reasons };
}
