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
import type { ExposureSnapshot, ImpactResult } from '../contracts';

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

export async function buildHazardEvidencePack(result: EarthquakeScenarioResult): Promise<HazardEvidencePack> {
  const missingFields = [
    ...checkSourceArtifactAdmission(result.artifact).missingFields.map((f) => `artifact.${f}`),
    ...checkHazardInputAdmission(result.input).missingFields.map((f) => `input.${f}`),
    ...checkHazardRunAdmission(result.run).missingFields.map((f) => `run.${f}`),
    ...checkExposureAdmission(result.exposure),
    ...checkImpactsAdmission(result.impacts),
  ];

  const generatedAt = Date.now();
  const sha256 = await sha256Hex(canonicalJson({ result, missingFields, generatedAt }));

  return {
    hazardRunId: result.run.hazardRunId,
    hazardType: result.input.hazardType,
    result,
    missingFields,
    sha256,
    generatedAt,
  };
}
