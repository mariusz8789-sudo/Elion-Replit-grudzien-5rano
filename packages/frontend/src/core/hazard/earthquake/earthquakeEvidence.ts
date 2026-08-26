/**
 * EARTHQUAKE MODULE — Evidence Pack.
 *
 * Reuses Genesis's existing Evidence/Replay infrastructure rather than
 * building a third one: `sha256Hex`/`canonicalJson` are the same primitives
 * `core/discovery/evidenceCrypto.ts` and `core/hazard/fingerprint.ts` already
 * use, and ALL completeness gating below — including exposure and impact —
 * calls Phase 0's own domain-neutral checks in `core/hazard/hazardEvidenceGate.ts`.
 * `ExposureSnapshot`/`ImpactResult` are domain-neutral contracts (see
 * contracts.ts), so their admission checks live there too, not duplicated
 * per hazard; this file only supplies the earthquake-specific "at least one
 * impact must exist" business rule and the `impacts[i].` prefixing.
 */
import { canonicalJson } from '../../events/hash';
import { sha256Hex } from '../../discovery/evidenceCrypto';
import {
  checkExposureSnapshotAdmission,
  checkHazardInputAdmission,
  checkHazardRunAdmission,
  checkImpactResultAdmission,
  checkSourceArtifactAdmission,
} from '../hazardEvidenceGate';
import type { EarthquakeScenarioResult } from './earthquakeScenario';
import type { ImpactResult } from '../contracts';

export interface HazardEvidencePack {
  readonly hazardRunId: string;
  readonly hazardType: string;
  readonly result: EarthquakeScenarioResult;
  readonly missingFields: readonly string[];
  readonly sha256: string;
  readonly generatedAt: number;
}

function checkImpactsAdmission(impacts: readonly ImpactResult[]): readonly string[] {
  if (!impacts || impacts.length === 0) return ['impacts'];
  return impacts.flatMap((impact, i) => checkImpactResultAdmission(impact).missingFields.map((f) => `impacts[${i}].${f}`));
}

export async function buildHazardEvidencePack(result: EarthquakeScenarioResult): Promise<HazardEvidencePack> {
  const missingFields = [
    ...checkSourceArtifactAdmission(result.artifact).missingFields.map((f) => `artifact.${f}`),
    ...checkHazardInputAdmission(result.input).missingFields.map((f) => `input.${f}`),
    ...checkHazardRunAdmission(result.run).missingFields.map((f) => `run.${f}`),
    ...checkExposureSnapshotAdmission(result.exposure).missingFields.map((f) => `exposure.${f}`),
    ...checkImpactsAdmission(result.impacts),
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
