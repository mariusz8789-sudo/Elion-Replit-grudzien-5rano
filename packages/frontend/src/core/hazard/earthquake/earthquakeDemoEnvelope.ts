/**
 * EARTHQUAKE MODULE — demo execution envelope.
 *
 * A single, clean, domain-only function chaining exactly what already
 * exists: registered module descriptor → validated scenario spec →
 * `runEarthquakeScenario` → capability fence → evidence completeness →
 * replay MATCH proof → `projectEarthquakeWorldState`. Nothing here is a new
 * solver, a new hash, or a new store — every step delegates to Phase 0 or
 * earlier earthquake-module code; this file only sequences them and decides
 * whether the result is fit to hand to a (future, separately built) demo
 * consumer.
 *
 * This is NOT a UI, NOT City3D, and NOT a coordinate-mapping layer. It
 * imports nothing from a renderer, React, Three.js, CityWorld, routing, or
 * epidemic code — see the isolation test in
 * earthquakeVerticalSlice.test.ts / earthquakeDemoEnvelope.test.ts. A future
 * read-only City3D overlay (Manus's own, separately built and versioned
 * coordinate mapping) is expected to call `buildEarthquakeDemoEnvelope()`
 * and read its `projection`/`replay`/`provenance` fields — never to
 * reimplement any step this envelope already performs.
 */
import { getHazardModule, assertHazardRunCompatibleWithModule, HazardModuleCompatibilityError, UnknownHazardModuleError, type HazardModuleDescriptor } from '../hazardModuleRegistry';
import { replayHazardRun, type HazardReplayReport } from '../hazardReplay';
import { ImmutableConflictError, InMemoryHazardProvenanceStore, type HazardProvenanceStore } from '../hazardProvenanceStore';
import type { HazardRun } from '../contracts';
import { earthquakeEvaluator } from './earthquakeEvaluator';
import { buildHazardEvidencePack } from './earthquakeEvidence';
import { runEarthquakeScenario, type EarthquakeScenarioSpec } from './earthquakeScenario';
import { validateEarthquakeScenarioSpec } from './earthquakeScenarioValidation';
import { projectEarthquakeWorldState, type EarthquakeWorldStateView } from './earthquakeWorldProjection';

export type EarthquakeDemoEnvelopeBlockCode =
  | 'INVALID_SCENARIO_SPEC'
  | 'REGISTRY_INCOMPATIBLE'
  | 'EVIDENCE_INCOMPLETE'
  | 'REPLAY_NOT_MATCH';

export interface EarthquakeDemoProvenance {
  readonly artifactId: string;
  readonly hazardInputId: string;
  readonly hazardRunId: string;
  readonly inputFingerprint: string;
  readonly resultFingerprint: string;
}

/**
 * READY means every gate this envelope checks passed for THIS run, on THIS
 * synthetic fixture — never a claim of scientific validity. BLOCKED always
 * carries a named `blockCode` and a human-readable `blockReason`; a
 * consumer must never treat a BLOCKED envelope's null fields as usable data.
 */
export interface EarthquakeDemoEnvelope {
  readonly status: 'READY' | 'BLOCKED';
  readonly blockCode: EarthquakeDemoEnvelopeBlockCode | null;
  readonly blockReason: string | null;
  readonly hazardType: 'earthquake';
  readonly datasetStatus: 'SCENARIO';
  readonly moduleDescriptor: HazardModuleDescriptor | null;
  readonly run: HazardRun | null;
  readonly projection: EarthquakeWorldStateView | null;
  readonly replay: HazardReplayReport | null;
  readonly provenance: EarthquakeDemoProvenance | null;
  readonly notModeled: readonly string[];
}

function blocked(code: EarthquakeDemoEnvelopeBlockCode, reason: string, partial: Partial<EarthquakeDemoEnvelope> = {}): EarthquakeDemoEnvelope {
  const descriptor = partial.moduleDescriptor ?? null;
  return {
    status: 'BLOCKED',
    blockCode: code,
    blockReason: reason,
    hazardType: 'earthquake',
    datasetStatus: 'SCENARIO',
    moduleDescriptor: descriptor,
    run: partial.run ?? null,
    projection: null,
    replay: partial.replay ?? null,
    provenance: partial.provenance ?? null,
    notModeled: descriptor?.notModeled ?? [],
  };
}

/**
 * Runs the full chain for one synthetic earthquake scenario and returns
 * either a READY envelope (every gate passed) or a BLOCKED one with a named
 * reason. Never throws for an ordinary invalid-input or gate-failure case —
 * a consumer should not need a try/catch to use this function's result.
 */
export async function buildEarthquakeDemoEnvelope(
  spec: EarthquakeScenarioSpec,
  codeCommitHash: string,
  store: HazardProvenanceStore = new InMemoryHazardProvenanceStore(),
): Promise<EarthquakeDemoEnvelope> {
  let descriptor: HazardModuleDescriptor;
  try {
    descriptor = getHazardModule('earthquake');
  } catch (err) {
    // Only reachable if a future change de-registers earthquake — the fixed hazardType below means this cannot happen from caller input.
    return blocked('REGISTRY_INCOMPATIBLE', err instanceof UnknownHazardModuleError ? err.message : String(err));
  }

  const validation = validateEarthquakeScenarioSpec(spec);
  if (!validation.valid) {
    return blocked('INVALID_SCENARIO_SPEC', validation.errors.join('; '), { moduleDescriptor: descriptor });
  }

  const result = await runEarthquakeScenario(spec, codeCommitHash);
  try {
    await store.putArtifact(result.artifact);
    await store.putInput(result.input);
    await store.putRun(result.run);
  } catch (err) {
    if (err instanceof ImmutableConflictError) {
      // The store already holds a DIFFERENT record under this scenario's deterministic id — e.g.
      // the same scenarioLabel re-run with different parameters, or after the module version
      // changed. This is a real, named provenance/versioning conflict, not a crash.
      return blocked('REGISTRY_INCOMPATIBLE', `scenario id conflict: ${err.message}`, { moduleDescriptor: descriptor, run: result.run });
    }
    throw err;
  }

  try {
    assertHazardRunCompatibleWithModule({
      hazardType: 'earthquake',
      run: result.run,
      input: result.input,
      projectionSchemaVersion: descriptor.projectionSchemaVersion,
    });
  } catch (err) {
    const message = err instanceof HazardModuleCompatibilityError || err instanceof UnknownHazardModuleError ? err.message : String(err);
    return blocked('REGISTRY_INCOMPATIBLE', message, { moduleDescriptor: descriptor, run: result.run });
  }

  const evidencePack = await buildHazardEvidencePack(result);
  if (evidencePack.missingFields.length > 0) {
    return blocked('EVIDENCE_INCOMPLETE', `evidence pack missing: ${evidencePack.missingFields.join(', ')}`, {
      moduleDescriptor: descriptor, run: result.run,
    });
  }

  const replay = await replayHazardRun({
    store, hazardRunId: result.run.hazardRunId, evaluator: earthquakeEvaluator,
    hazardType: 'earthquake', projectionSchemaVersion: descriptor.projectionSchemaVersion,
  });
  if (replay.status !== 'MATCH') {
    return blocked('REPLAY_NOT_MATCH', `replay returned ${replay.status}, not MATCH: ${replay.differences.join('; ')}`, {
      moduleDescriptor: descriptor, run: result.run, replay,
    });
  }

  const projection = projectEarthquakeWorldState(result);

  return {
    status: 'READY',
    blockCode: null,
    blockReason: null,
    hazardType: 'earthquake',
    datasetStatus: 'SCENARIO',
    moduleDescriptor: descriptor,
    run: result.run,
    projection,
    replay,
    provenance: {
      artifactId: result.artifact.artifactId,
      hazardInputId: result.input.hazardInputId,
      hazardRunId: result.run.hazardRunId,
      inputFingerprint: result.input.inputFingerprint,
      resultFingerprint: result.run.resultFingerprint,
    },
    notModeled: descriptor.notModeled,
  };
}
