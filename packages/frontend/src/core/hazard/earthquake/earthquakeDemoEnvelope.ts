/**
 * EARTHQUAKE MODULE — demo execution envelope.
 *
 * A single, clean, domain-only function chaining exactly what already
 * exists:
 *
 *   registered module descriptor (hazardModuleRegistry)
 *     -> validated scenario spec (earthquakeScenarioValidation)
 *     -> existing computation (runEarthquakeScenario / earthquakeEvaluator)
 *     -> immutable persistence (HazardProvenanceStore)
 *     -> capability fence, re-checked against what is actually PERSISTED
 *        (assertHazardRunCompatibleWithModule)
 *     -> evidence completeness (buildHazardEvidencePack)
 *     -> replay MATCH proof (replayHazardRun)
 *     -> existing read-only projection (projectEarthquakeWorldState)
 *
 * Nothing here is a new solver, a new hash, a new store, or a new replay —
 * every step delegates to Phase 0 or earlier earthquake-module code; this
 * file only sequences them and decides whether the result is fit to hand to
 * a (separately built) demo consumer. See docs/EARTHQUAKE_DEMO_ENVELOPE.md.
 *
 * This is NOT a UI, NOT City3D, and NOT a coordinate-mapping layer. It
 * imports nothing from a renderer, React, Three.js, CityWorld, routing, or
 * epidemic code — see the isolation tests in earthquakeVerticalSlice.test.ts
 * and earthquakeDemoEnvelope.test.ts. A future read-only City3D overlay
 * (Manus's own, separately built and versioned coordinate mapping) is
 * expected to call `buildEarthquakeDemoEnvelope()` and read its
 * `projection`/`replay`/`evidence`/`provenance` fields on a READY result —
 * never to reimplement any step this envelope already performs, and never
 * to render a BLOCKED result.
 *
 * STORE INJECTION POLICY: the default parameter
 * (`new InMemoryHazardProvenanceStore()`) exists purely as a domain/test
 * convenience — every call with no explicit `store` argument gets its own
 * fresh, empty, non-persistent store, so unrelated calls can never collide.
 * A real UI/Command Center consumer MUST inject its own
 * `LocalHazardProvenanceStore` (or another persistent `HazardProvenanceStore`
 * implementation) explicitly, so scenarios are actually saved across calls.
 * Either way, the store's own immutability guarantee is never bypassed here:
 * this function never overwrites a differently-keyed record, and a
 * same-id/different-content conflict is reported as `PROVENANCE_CONFLICT`,
 * not silently resolved.
 */
import { getHazardModule, assertHazardRunCompatibleWithModule, HazardModuleCompatibilityError, UnknownHazardModuleError, type HazardModuleDescriptor } from '../hazardModuleRegistry';
import { replayHazardRun, type HazardReplayReport } from '../hazardReplay';
import { ImmutableConflictError, InMemoryHazardProvenanceStore, type HazardProvenanceStore } from '../hazardProvenanceStore';
import type { HazardInput, HazardRun, SourceArtifact } from '../contracts';
import { earthquakeEvaluator } from './earthquakeEvaluator';
import { buildHazardEvidencePack, type HazardEvidencePack } from './earthquakeEvidence';
import { runEarthquakeScenario, type EarthquakeScenarioSpec } from './earthquakeScenario';
import { validateEarthquakeScenarioSpec } from './earthquakeScenarioValidation';
import { projectEarthquakeWorldState, type EarthquakeWorldStateView } from './earthquakeWorldProjection';

export type EarthquakeDemoEnvelopeBlockCode =
  | 'INVALID_SCENARIO_SPEC'
  | 'PROVENANCE_CONFLICT'
  | 'REGISTRY_INCOMPATIBLE'
  | 'EVIDENCE_INCOMPLETE'
  | 'REPLAY_NOT_MATCH';

export interface EarthquakeDemoScenario {
  readonly spec: EarthquakeScenarioSpec;
  readonly artifact: SourceArtifact;
  readonly input: HazardInput;
}

export interface EarthquakeDemoProvenance {
  readonly artifactId: string;
  readonly hazardInputId: string;
  readonly hazardRunId: string;
  readonly inputFingerprint: string;
  readonly resultFingerprint: string;
}

/**
 * READY means every gate this envelope checks passed for THIS run, on THIS
 * synthetic fixture — never a claim of scientific validity. `projection` is
 * non-null if and only if `status === 'READY'`; a consumer must never map
 * or render a BLOCKED envelope. BLOCKED always carries a stable `blockCode`
 * and a human-readable `blockReason` computed from a REAL failure (never a
 * hand-typed string standing in for one); `moduleDescriptor` is populated
 * whenever the registry lookup itself succeeded, and `scenario`/`run`/
 * `evidence`/`replay` are populated only as far as the pipeline actually
 * reached, purely as diagnostic breadcrumbs — `projection` and `provenance`
 * are always `null` on BLOCKED, since those are exactly the fields a
 * consumer would otherwise be tempted to render or cite as trustworthy.
 *
 * Every object this function returns (the envelope itself and each non-null
 * top-level field) is `Object.freeze`d, so a consumer cannot mutate what it
 * was handed and then mistake the mutated copy for what is actually
 * persisted in the store.
 */
export interface EarthquakeDemoEnvelope {
  readonly status: 'READY' | 'BLOCKED';
  readonly blockCode: EarthquakeDemoEnvelopeBlockCode | null;
  readonly blockReason: string | null;
  readonly hazardType: 'earthquake';
  readonly datasetStatus: 'SCENARIO';
  readonly moduleDescriptor: HazardModuleDescriptor | null;
  readonly scenario: EarthquakeDemoScenario | null;
  readonly run: HazardRun | null;
  readonly evidence: HazardEvidencePack | null;
  readonly replay: HazardReplayReport | null;
  readonly projection: EarthquakeWorldStateView | null;
  readonly provenance: EarthquakeDemoProvenance | null;
  readonly notModeled: readonly string[];
}

interface BlockedDiagnostics {
  readonly moduleDescriptor?: HazardModuleDescriptor;
  readonly scenario?: EarthquakeDemoScenario;
  readonly run?: HazardRun;
  readonly evidence?: HazardEvidencePack;
  readonly replay?: HazardReplayReport;
}

function blocked(code: EarthquakeDemoEnvelopeBlockCode, reason: string, diagnostics: BlockedDiagnostics = {}): EarthquakeDemoEnvelope {
  const descriptor = diagnostics.moduleDescriptor ?? null;
  return Object.freeze({
    status: 'BLOCKED',
    blockCode: code,
    blockReason: reason,
    hazardType: 'earthquake',
    datasetStatus: 'SCENARIO',
    moduleDescriptor: descriptor,
    scenario: diagnostics.scenario ?? null,
    run: diagnostics.run ?? null,
    evidence: diagnostics.evidence ?? null,
    replay: diagnostics.replay ?? null,
    projection: null,
    provenance: null,
    notModeled: descriptor?.notModeled ?? [],
  });
}

/**
 * Runs the full chain for one synthetic earthquake scenario and returns
 * either a READY envelope (every gate passed) or a BLOCKED one with a named
 * reason. Never throws for an ordinary invalid-input or gate-failure case —
 * a consumer should not need a try/catch to use this function's result.
 *
 * See the STORE INJECTION POLICY in this file's top comment for the
 * `store` parameter's default vs. production usage.
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
  Object.freeze(result.artifact);
  Object.freeze(result.input);
  Object.freeze(result.run);
  const scenario: EarthquakeDemoScenario = Object.freeze({ spec, artifact: result.artifact, input: result.input });

  try {
    await store.putArtifact(result.artifact);
    await store.putInput(result.input);
    await store.putRun(result.run);
  } catch (err) {
    if (err instanceof ImmutableConflictError) {
      // The store already holds a DIFFERENT record under this scenario's deterministic id —
      // e.g. the same scenarioLabel re-run with different parameters. A real, named
      // immutable-provenance conflict, distinct from a registry/module/schema mismatch.
      return blocked('PROVENANCE_CONFLICT', `immutable store conflict: ${err.message}`, { moduleDescriptor: descriptor, scenario, run: result.run });
    }
    throw err;
  }

  // Re-fetch from the store rather than trusting the in-memory `result` — this validates what
  // is actually PERSISTED (and would catch a non-conforming store backend that silently altered
  // hazardModuleVersion/hazardInputId on write), not merely what was freshly computed.
  const persistedRun = await store.getRun(result.run.hazardRunId);
  const persistedInput = persistedRun ? await store.getInput(persistedRun.hazardInputId) : null;
  if (!persistedRun || !persistedInput) {
    return blocked('REGISTRY_INCOMPATIBLE', 'persisted HazardRun/HazardInput could not be re-read from the store immediately after writing', {
      moduleDescriptor: descriptor, scenario, run: result.run,
    });
  }
  try {
    assertHazardRunCompatibleWithModule({
      hazardType: 'earthquake',
      run: persistedRun,
      input: persistedInput,
      projectionSchemaVersion: descriptor.projectionSchemaVersion,
    });
  } catch (err) {
    const message = err instanceof HazardModuleCompatibilityError || err instanceof UnknownHazardModuleError ? err.message : String(err);
    return blocked('REGISTRY_INCOMPATIBLE', message, { moduleDescriptor: descriptor, scenario, run: result.run });
  }

  const evidencePack = Object.freeze(await buildHazardEvidencePack(result));
  if (evidencePack.missingFields.length > 0) {
    return blocked('EVIDENCE_INCOMPLETE', `evidence pack missing: ${evidencePack.missingFields.join(', ')}`, {
      moduleDescriptor: descriptor, scenario, run: result.run, evidence: evidencePack,
    });
  }

  const replay = Object.freeze(await replayHazardRun({
    store, hazardRunId: result.run.hazardRunId, evaluator: earthquakeEvaluator,
    hazardType: 'earthquake', projectionSchemaVersion: descriptor.projectionSchemaVersion,
  }));
  if (replay.status !== 'MATCH') {
    return blocked('REPLAY_NOT_MATCH', `replay returned ${replay.status}, not MATCH: ${replay.differences.join('; ')}`, {
      moduleDescriptor: descriptor, scenario, run: result.run, evidence: evidencePack, replay,
    });
  }

  const projection = projectEarthquakeWorldState(result);

  return Object.freeze({
    status: 'READY',
    blockCode: null,
    blockReason: null,
    hazardType: 'earthquake',
    datasetStatus: 'SCENARIO',
    moduleDescriptor: descriptor,
    scenario,
    run: result.run,
    evidence: evidencePack,
    replay,
    projection: Object.freeze(projection),
    provenance: Object.freeze({
      artifactId: result.artifact.artifactId,
      hazardInputId: result.input.hazardInputId,
      hazardRunId: result.run.hazardRunId,
      inputFingerprint: result.input.inputFingerprint,
      resultFingerprint: result.run.resultFingerprint,
    }),
    notModeled: descriptor.notModeled,
  });
}
