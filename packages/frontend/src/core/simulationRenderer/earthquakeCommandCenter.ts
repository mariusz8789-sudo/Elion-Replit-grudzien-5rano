/**
 * EARTHQUAKE COMMAND-CENTER EXECUTION.
 *
 * This service composes existing audited contracts for one synthetic Earthquake
 * demonstration. It owns no solver, rendering, React state or epidemic state:
 * UI receives a read-only result and City3D receives only the already gated
 * overlay projection.
 */
import { codeCommitHash } from '../build/commitHash';
import {
  EARTHQUAKE_CITYWORLD_MAPPING,
  projectEarthquakeToCityOverlay,
  type EarthquakeCityOverlayProjection,
} from './earthquakeCoordinateMapping';
import { evaluateScenarioOverlayEligibility, type ScenarioOverlayGateResult, type ScenarioOverlayPolicy } from './scenarioOverlayGate';
import { LocalHazardProvenanceStore, type HazardProvenanceStore } from '../hazard/hazardProvenanceStore';
import { replayHazardRun, type HazardReplayReport } from '../hazard/hazardReplay';
import { getHazardModule, type HazardModuleDescriptor } from '../hazard/hazardModuleRegistry';
import { buildHazardEvidencePack, type HazardEvidencePack } from '../hazard/earthquake/earthquakeEvidence';
import { earthquakeEvaluator } from '../hazard/earthquake/earthquakeEvaluator';
import { projectEarthquakeWorldState, type EarthquakeWorldStateView } from '../hazard/earthquake/earthquakeWorldProjection';
import { runEarthquakeScenario, type EarthquakeScenarioResult, type EarthquakeScenarioSpec } from '../hazard/earthquake/earthquakeScenario';

export interface EarthquakeCommandCenterExecution {
  readonly scenario: EarthquakeScenarioResult;
  /** Immutable descriptor that admitted this run for the registered hazard module. */
  readonly moduleDescriptor: HazardModuleDescriptor;
  readonly projection: EarthquakeWorldStateView;
  readonly evidence: HazardEvidencePack;
  readonly replay: HazardReplayReport;
  readonly overlayGate: ScenarioOverlayGateResult;
  /** Null unless evidence/replay/schema/mapping gates all pass. */
  readonly overlay: EarthquakeCityOverlayProjection | null;
}

async function persistScenario(store: HazardProvenanceStore, result: EarthquakeScenarioResult): Promise<void> {
  await store.putArtifact(result.artifact);
  await store.putInput(result.input);
  await store.putRun(result.run);
}

/** Executes existing Earthquake science once, then produces proof-bearing read-only presentation data. */
export async function executeEarthquakeCommandCenterScenario(
  spec: EarthquakeScenarioSpec,
  options: { readonly store?: HazardProvenanceStore; readonly commitHash?: string; readonly overlayPolicy?: ScenarioOverlayPolicy } = {},
): Promise<EarthquakeCommandCenterExecution> {
  const store = options.store ?? new LocalHazardProvenanceStore();
  const moduleDescriptor = getHazardModule('earthquake');
  const scenario = await runEarthquakeScenario(spec, options.commitHash ?? codeCommitHash());
  await persistScenario(store, scenario);
  const evidence = await buildHazardEvidencePack(scenario);
  const replay = await replayHazardRun({
    store,
    hazardRunId: scenario.run.hazardRunId,
    evaluator: earthquakeEvaluator,
    // Registered admission happens before evaluator execution; mapping/UI never bypass this fence.
    hazardType: moduleDescriptor.hazardType,
    projectionSchemaVersion: moduleDescriptor.projectionSchemaVersion,
  });
  const projection = projectEarthquakeWorldState(scenario);
  const mappedOverlay = await projectEarthquakeToCityOverlay(projection);
  const overlayGate = evaluateScenarioOverlayEligibility({
    overlayKind: 'earthquake-scenario',
    schemaVersion: projection.schemaVersion,
    datasetStatuses: mappedOverlay.sites.map((site) => site.datasetStatus),
    evidence: { replayStatus: replay.status, missingFields: evidence.missingFields },
    coordinateMapping: {
      mappingId: mappedOverlay.mappingId,
      mappingVersion: mappedOverlay.mappingSchemaVersion,
      mappingFingerprint: mappedOverlay.mappingFingerprint,
    },
  }, options.overlayPolicy ?? { enabled: true, supportedSchemas: [projection.schemaVersion] });

  return Object.freeze({
    scenario,
    moduleDescriptor,
    projection,
    evidence,
    replay,
    overlayGate,
    overlay: overlayGate.enabled ? mappedOverlay : null,
  });
}

export { EARTHQUAKE_CITYWORLD_MAPPING };
