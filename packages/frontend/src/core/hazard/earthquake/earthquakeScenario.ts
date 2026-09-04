/**
 * EARTHQUAKE MODULE — end-to-end orchestration.
 *
 * `runEarthquakeScenario` builds the complete chain for one synthetic
 * earthquake scenario: SourceArtifact → HazardInput → HazardRun → Exposure →
 * Impact. It calls nothing but Phase 0 primitives (fingerprint.ts,
 * hazardEvidenceGate.ts, hazardProvenanceStore.ts) plus this module's own
 * earthquake-specific pieces — it is not a second orchestration system, it
 * is what Phase 0's contracts were built to be filled in with.
 */
import { computeDerivedLayerFingerprint, computeHazardInputFingerprint, computeHazardRunResultFingerprint, computeSourceArtifactContentHash } from '../fingerprint';
import { computeDamageAssessments } from './earthquakeDamageAssessment';
import { earthquakeEvaluator } from './earthquakeEvaluator';
import { buildSyntheticExposureSnapshot } from './earthquakeExposure';
import { computeImpactResults } from './earthquakeImpact';
import { EARTHQUAKE_MODEL_VERSION, type EarthquakePoint } from './earthquakeModel';
import { assertValidEarthquakeScenarioSpec } from './earthquakeScenarioValidation';
import type { DamageAssessment, ExposureSnapshot, HazardInput, HazardRun, ImpactResult, SourceArtifact } from '../contracts';

export interface EarthquakeScenarioSpec {
  readonly scenarioLabel: string;
  readonly magnitude: number;
  readonly depthKm: number;
  readonly epicenter: EarthquakePoint;
  readonly seed: number;
}

export interface EarthquakeScenarioResult {
  readonly artifact: SourceArtifact;
  readonly input: HazardInput;
  readonly run: HazardRun;
  readonly exposure: ExposureSnapshot;
  readonly impacts: readonly ImpactResult[];
  readonly damageAssessments: readonly DamageAssessment[];
  /** SHA-256 over `impacts`, recomputed and re-checked by the demo envelope's replay step. */
  readonly impactSetFingerprint: string;
  /** SHA-256 over `damageAssessments`, recomputed and re-checked by the demo envelope's replay step. */
  readonly damageAssessmentSetFingerprint: string;
}

/**
 * The "frozen data" this scenario pins is the scenario spec itself, encoded
 * as the artifact's raw content — there is no live network fetch to freeze
 * a copy of; this is the honest synthetic equivalent (a scenario author
 * commits to fixed values instead of an external provider publishing them).
 */
function syntheticRawContent(spec: EarthquakeScenarioSpec): string {
  return JSON.stringify({
    kind: 'SYNTHETIC_EARTHQUAKE_SCENARIO',
    scenarioLabel: spec.scenarioLabel,
    magnitude: spec.magnitude,
    depthKm: spec.depthKm,
    epicenter: spec.epicenter,
  });
}

export async function buildEarthquakeSourceArtifact(spec: EarthquakeScenarioSpec, codeCommitHash: string): Promise<SourceArtifact> {
  assertValidEarthquakeScenarioSpec(spec);
  const rawContent = syntheticRawContent(spec);
  const contentHash = await computeSourceArtifactContentHash(rawContent);
  return {
    artifactId: `artifact_eq_${spec.scenarioLabel}`,
    contentHash,
    crs: null,
    extent: null,
    rawContentRef: `synthetic-scenario://${spec.scenarioLabel}`,
    provenance: {
      provider: 'genesis-synthetic-scenario-author',
      sourceUrl: null,
      sourceTime: null,
      retrievedAt: Date.now(),
      license: 'internal-synthetic-fixture',
      adapterVersion: codeCommitHash,
    },
  };
}

export async function buildEarthquakeHazardInput(spec: EarthquakeScenarioSpec, artifact: SourceArtifact): Promise<HazardInput> {
  const scientificFields = { magnitude: spec.magnitude, depthKm: spec.depthKm, epicenter: spec.epicenter };
  const inputFingerprint = await computeHazardInputFingerprint({
    hazardType: 'earthquake',
    sourceArtifactContentHash: artifact.contentHash,
    scientificFields,
    seed: spec.seed,
  });
  return {
    hazardInputId: `input_eq_${spec.scenarioLabel}`,
    hazardType: 'earthquake',
    sourceArtifactId: artifact.artifactId,
    scientificFields,
    seed: spec.seed,
    displayName: spec.scenarioLabel,
    inputFingerprint,
  };
}

export async function runEarthquakeHazardRun(input: HazardInput, artifact: SourceArtifact, codeCommitHash: string): Promise<HazardRun> {
  const outputFields = await earthquakeEvaluator.evaluate(input, artifact);
  const resultFingerprint = await computeHazardRunResultFingerprint({
    hazardInputId: input.hazardInputId,
    hazardModuleVersion: EARTHQUAKE_MODEL_VERSION,
    codeCommitHash,
    outputFields,
  });
  return {
    hazardRunId: `run_${input.hazardInputId}`,
    hazardInputId: input.hazardInputId,
    hazardModuleVersion: EARTHQUAKE_MODEL_VERSION,
    codeCommitHash,
    outputFields,
    resultFingerprint,
    status: 'COMPLETED',
    createdAt: Date.now(),
  };
}

/** The full pipeline for one synthetic earthquake scenario, ready to be persisted and later replayed. */
export async function runEarthquakeScenario(spec: EarthquakeScenarioSpec, codeCommitHash: string): Promise<EarthquakeScenarioResult> {
  const artifact = await buildEarthquakeSourceArtifact(spec, codeCommitHash);
  const input = await buildEarthquakeHazardInput(spec, artifact);
  const run = await runEarthquakeHazardRun(input, artifact, codeCommitHash);
  const exposure = buildSyntheticExposureSnapshot(`exposure_${spec.scenarioLabel}`);
  const impacts = computeImpactResults(run, exposure);
  const damageAssessments = computeDamageAssessments(run, impacts);
  const impactSetFingerprint = await computeDerivedLayerFingerprint(impacts);
  const damageAssessmentSetFingerprint = await computeDerivedLayerFingerprint(damageAssessments);
  return { artifact, input, run, exposure, impacts, damageAssessments, impactSetFingerprint, damageAssessmentSetFingerprint };
}

/**
 * Recomputes `impacts`/`damageAssessments` from `run.outputFields` and
 * `exposure` again — a FRESH call, not a reuse of the already-computed
 * arrays — and compares the resulting fingerprints against the ones recorded
 * at construction time. `HazardRun.resultFingerprint` matching on replay only
 * proves the run's own output is reproducible; it says nothing about whether
 * the pure downstream Impact/DamageAssessment projection is *itself*
 * deterministic. This is what lets the demo envelope's replay step catch a
 * regression in that projection layer (e.g. an accidental dependency on
 * `Date.now()` or object iteration order) that a HazardRun-only MATCH would
 * miss entirely.
 */
export async function verifyDerivedLayerDeterminism(result: EarthquakeScenarioResult): Promise<{ readonly matches: boolean; readonly differences: readonly string[] }> {
  const recomputedImpacts = computeImpactResults(result.run, result.exposure);
  const recomputedDamageAssessments = computeDamageAssessments(result.run, recomputedImpacts);
  const recomputedImpactSetFingerprint = await computeDerivedLayerFingerprint(recomputedImpacts);
  const recomputedDamageAssessmentSetFingerprint = await computeDerivedLayerFingerprint(recomputedDamageAssessments);

  const differences: string[] = [];
  if (recomputedImpactSetFingerprint !== result.impactSetFingerprint) {
    differences.push('impact set fingerprint differs on re-projection of the same frozen run and exposure');
  }
  if (recomputedDamageAssessmentSetFingerprint !== result.damageAssessmentSetFingerprint) {
    differences.push('damage assessment set fingerprint differs on re-projection of the same frozen run and impacts');
  }
  return { matches: differences.length === 0, differences };
}
