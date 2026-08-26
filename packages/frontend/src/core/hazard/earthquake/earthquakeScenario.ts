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
import { computeHazardInputFingerprint, computeHazardRunResultFingerprint, computeSourceArtifactContentHash } from '../fingerprint';
import { earthquakeEvaluator } from './earthquakeEvaluator';
import { buildSyntheticExposureSnapshot } from './earthquakeExposure';
import { computeImpactResults } from './earthquakeImpact';
import { EARTHQUAKE_MODEL_VERSION, type EarthquakePoint } from './earthquakeModel';
import { assertValidEarthquakeScenarioSpec } from './earthquakeScenarioValidation';
import type { ExposureSnapshot, HazardInput, HazardRun, ImpactResult, SourceArtifact } from '../contracts';

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
  return { artifact, input, run, exposure, impacts };
}
