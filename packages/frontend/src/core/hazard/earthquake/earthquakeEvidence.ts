/**
 * EARTHQUAKE MODULE — Evidence Pack.
 *
 * Reuses Genesis's existing Evidence/Replay infrastructure rather than
 * building a third one: `sha256Hex`/`canonicalJson` are the same primitives
 * `core/discovery/evidenceCrypto.ts` and `core/hazard/fingerprint.ts` already
 * use, and the completeness gating below calls Phase 0's own
 * `checkSourceArtifactAdmission`/`checkHazardInputAdmission`/`checkHazardRunAdmission`
 * (core/hazard/hazardEvidenceGate.ts) instead of re-deriving field
 * requirements. This module adds only the two checks Phase 0 didn't need
 * yet: exposure and impact completeness.
 */
import { canonicalJson } from '../../events/hash';
import { sha256Hex } from '../../discovery/evidenceCrypto';
import { checkHazardInputAdmission, checkHazardRunAdmission, checkSourceArtifactAdmission } from '../hazardEvidenceGate';
import type { EarthquakeScenarioResult } from './earthquakeScenario';
import type { DamageAssessment, ExposureSnapshot, ImpactResult } from '../contracts';

export interface HazardEvidencePack {
  readonly hazardRunId: string;
  readonly hazardType: string;
  readonly result: EarthquakeScenarioResult;
  readonly missingFields: readonly string[];
  readonly sha256: string;
  readonly generatedAt: number;
}

function checkExposureAdmission(exposure: ExposureSnapshot): readonly string[] {
  const missing: string[] = [];
  if (!exposure.exposureSnapshotId) missing.push('exposure.exposureSnapshotId');
  if (!exposure.mappingMethod) missing.push('exposure.mappingMethod');
  if (!exposure.sites || exposure.sites.length === 0) missing.push('exposure.sites');
  if (!exposure.datasetStatus) missing.push('exposure.datasetStatus');
  return missing;
}

function checkImpactsAdmission(impacts: readonly ImpactResult[]): readonly string[] {
  const missing: string[] = [];
  if (!impacts || impacts.length === 0) {
    missing.push('impacts');
    return missing;
  }
  impacts.forEach((impact, i) => {
    if (!impact.resultType) missing.push(`impacts[${i}].resultType`);
    if (!impact.severity) missing.push(`impacts[${i}].severity`);
    if (!impact.datasetStatus) missing.push(`impacts[${i}].datasetStatus`);
    if (!Number.isFinite(impact.uncertainty?.low) || !Number.isFinite(impact.uncertainty?.high)) {
      missing.push(`impacts[${i}].uncertainty`);
    }
  });
  return missing;
}

/**
 * A `DamageAssessment` that omits `notModeledReason` or `requiredData` would
 * let a downstream consumer treat absence of damage data as "not applicable"
 * rather than "explicitly not modeled" — exactly the silent gap this gate
 * exists to close, mirroring `checkImpactsAdmission` above.
 */
function checkDamageAssessmentsAdmission(damageAssessments: readonly DamageAssessment[]): readonly string[] {
  const missing: string[] = [];
  if (!damageAssessments || damageAssessments.length === 0) {
    missing.push('damageAssessments');
    return missing;
  }
  damageAssessments.forEach((assessment, i) => {
    if (assessment.status !== 'NOT_MODELED') missing.push(`damageAssessments[${i}].status`);
    if (!assessment.notModeledReason) missing.push(`damageAssessments[${i}].notModeledReason`);
    if (!assessment.requiredData || assessment.requiredData.length === 0) missing.push(`damageAssessments[${i}].requiredData`);
    if (!assessment.datasetStatus) missing.push(`damageAssessments[${i}].datasetStatus`);
  });
  return missing;
}

export async function buildHazardEvidencePack(result: EarthquakeScenarioResult): Promise<HazardEvidencePack> {
  const missingFields = [
    ...checkSourceArtifactAdmission(result.artifact).missingFields.map((f) => `artifact.${f}`),
    ...checkHazardInputAdmission(result.input).missingFields.map((f) => `input.${f}`),
    ...checkHazardRunAdmission(result.run).missingFields.map((f) => `run.${f}`),
    ...checkExposureAdmission(result.exposure),
    ...checkImpactsAdmission(result.impacts),
    ...checkDamageAssessmentsAdmission(result.damageAssessments),
  ];

  // generatedAt is metadata about WHEN the pack was built, not part of what it
  // attests to — it must stay outside the hash, exactly like StoredEvidence's
  // savedAt sits outside computeEvidencePackSha256's input. Hashing it would
  // make two packs built from the IDENTICAL result at two different moments
  // report different digests, which defeats using the digest as tamper
  // evidence for the content (confirmed via scripts/earthquake-e2e.mjs,
  // which builds a pack in both Node and Chromium and diffs the digest).
  const generatedAt = Date.now();
  const sha256 = await sha256Hex(canonicalJson({ result, missingFields }));

  return {
    hazardRunId: result.run.hazardRunId,
    hazardType: result.input.hazardType,
    result,
    missingFields,
    sha256,
    generatedAt,
  };
}
