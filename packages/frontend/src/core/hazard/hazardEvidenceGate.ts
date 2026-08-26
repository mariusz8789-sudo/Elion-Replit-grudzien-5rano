/**
 * PHASE 0 — EVIDENCE COMPLETENESS GATE.
 *
 * Mirrors the Discovery Engine's own `missingFields` gating on
 * `DiscoveryEvidencePack` (core/discovery/discoveryEvidence.ts) rather than
 * inventing a new admission concept: a record missing a mandatory
 * provenance/version field is rejected before it ever reaches the
 * provenance store, so an incomplete record can never later masquerade as a
 * trustworthy MATCH.
 */
import type { HazardInput, HazardRun, SourceArtifact } from './contracts';

export interface AdmissionResult {
  readonly admitted: boolean;
  readonly missingFields: readonly string[];
}

function admission(missingFields: readonly string[]): AdmissionResult {
  return { admitted: missingFields.length === 0, missingFields };
}

export function checkSourceArtifactAdmission(artifact: SourceArtifact): AdmissionResult {
  const missing: string[] = [];
  if (!artifact.artifactId) missing.push('artifactId');
  if (!artifact.contentHash) missing.push('contentHash');
  if (!artifact.rawContentRef) missing.push('rawContentRef');
  if (!artifact.provenance) {
    missing.push('provenance');
  } else {
    if (!artifact.provenance.provider) missing.push('provenance.provider');
    if (!artifact.provenance.license) missing.push('provenance.license');
    if (!artifact.provenance.adapterVersion) missing.push('provenance.adapterVersion');
    if (typeof artifact.provenance.retrievedAt !== 'number' || !Number.isFinite(artifact.provenance.retrievedAt) || artifact.provenance.retrievedAt < 0) {
      missing.push('provenance.retrievedAt');
    }
  }
  return admission(missing);
}

export function checkHazardInputAdmission(input: HazardInput): AdmissionResult {
  const missing: string[] = [];
  if (!input.hazardInputId) missing.push('hazardInputId');
  if (!input.hazardType) missing.push('hazardType');
  if (!input.sourceArtifactId) missing.push('sourceArtifactId');
  if (!input.scientificFields || Object.keys(input.scientificFields).length === 0) missing.push('scientificFields');
  if (!input.inputFingerprint) missing.push('inputFingerprint');
  return admission(missing);
}

/**
 * Output-field policy is status-dependent by design, not an oversight: a
 * `COMPLETED` run that produced nothing is indistinguishable from one that
 * silently failed, so an empty `outputFields` is rejected for it. A `FAILED`
 * run legitimately has no output to report — an empty `outputFields` is
 * admitted for it — but everything else (fingerprint, module/commit
 * versioning, timing) remains mandatory regardless of status; a failure is
 * not an excuse to drop provenance.
 */
export function checkHazardRunAdmission(run: HazardRun): AdmissionResult {
  const missing: string[] = [];
  if (!run.hazardRunId) missing.push('hazardRunId');
  if (!run.hazardInputId) missing.push('hazardInputId');
  if (!run.hazardModuleVersion) missing.push('hazardModuleVersion');
  if (!run.codeCommitHash) missing.push('codeCommitHash');
  if (!run.resultFingerprint) missing.push('resultFingerprint');
  if (!run.status) missing.push('status');
  if (typeof run.createdAt !== 'number' || !Number.isFinite(run.createdAt) || run.createdAt < 0) {
    missing.push('createdAt');
  }
  if (!run.outputFields) {
    missing.push('outputFields');
  } else if (run.status === 'COMPLETED' && Object.keys(run.outputFields).length === 0) {
    missing.push('outputFields');
  }
  return admission(missing);
}
