/**
 * EARTHQUAKE COMMAND-CENTER EXECUTION.
 *
 * The audited domain-only envelope owns scenario validation, immutable
 * provenance persistence, evidence, registered replay admission and projection.
 * This renderer boundary owns only explicit fixture-to-CityWorld mapping and the
 * domain-neutral overlay gate. It never owns solver, CityWorld or epidemic state.
 */
import { codeCommitHash } from '../build/commitHash';
import { type HazardModuleDescriptor } from '../hazard/hazardModuleRegistry';
import { type HazardProvenanceStore, LocalHazardProvenanceStore } from '../hazard/hazardProvenanceStore';
import { type HazardReplayReport } from '../hazard/hazardReplay';
import {
  buildEarthquakeDemoEnvelope,
  type EarthquakeDemoEnvelope,
  type EarthquakeDemoEnvelopeBlockCode,
} from '../hazard/earthquake/earthquakeDemoEnvelope';
import { type HazardEvidencePack } from '../hazard/earthquake/earthquakeEvidence';
import { type EarthquakeWorldStateView } from '../hazard/earthquake/earthquakeWorldProjection';
import { type EarthquakeScenarioResult, type EarthquakeScenarioSpec } from '../hazard/earthquake/earthquakeScenario';
import {
  EARTHQUAKE_CITYWORLD_MAPPING,
  projectEarthquakeToCityOverlay,
  type EarthquakeCityOverlayProjection,
} from './earthquakeCoordinateMapping';
import { evaluateScenarioOverlayEligibility, type ScenarioOverlayGateResult, type ScenarioOverlayPolicy } from './scenarioOverlayGate';

export interface EarthquakeCommandCenterReadyExecution {
  readonly status: 'READY';
  readonly envelope: EarthquakeDemoEnvelope;
  readonly scenario: EarthquakeScenarioResult;
  readonly moduleDescriptor: HazardModuleDescriptor;
  readonly projection: EarthquakeWorldStateView;
  readonly evidence: HazardEvidencePack;
  readonly replay: HazardReplayReport;
  /** Explicit synthetic fixture mapping exists even when display policy withholds the overlay. */
  readonly mapping: EarthquakeCityOverlayProjection;
  readonly overlayGate: ScenarioOverlayGateResult;
  /** Null only when the renderer-specific mapping/evidence/replay/schema gate blocks display. */
  readonly overlay: EarthquakeCityOverlayProjection | null;
}

export interface EarthquakeCommandCenterBlockedExecution {
  readonly status: 'BLOCKED';
  readonly envelope: EarthquakeDemoEnvelope;
  readonly blockCode: EarthquakeDemoEnvelopeBlockCode;
  readonly blockReason: string;
  readonly moduleDescriptor: HazardModuleDescriptor | null;
  readonly overlay: null;
}

export type EarthquakeCommandCenterExecution =
  | EarthquakeCommandCenterReadyExecution
  | EarthquakeCommandCenterBlockedExecution;

/** Executes one synthetic Earthquake run, then maps only a READY envelope into a gated read-only overlay. */
export async function executeEarthquakeCommandCenterScenario(
  spec: EarthquakeScenarioSpec,
  options: { readonly store?: HazardProvenanceStore; readonly commitHash?: string; readonly overlayPolicy?: ScenarioOverlayPolicy } = {},
): Promise<EarthquakeCommandCenterExecution> {
  const envelope = await buildEarthquakeDemoEnvelope(
    spec,
    options.commitHash ?? codeCommitHash(),
    options.store ?? new LocalHazardProvenanceStore(),
  );

  if (
    envelope.status !== 'READY'
    || !envelope.scenario
    || !envelope.moduleDescriptor
    || !envelope.projection
    || !envelope.evidence
    || !envelope.replay
  ) {
    return Object.freeze({
      status: 'BLOCKED' as const,
      envelope,
      blockCode: envelope.blockCode ?? 'REGISTRY_INCOMPATIBLE',
      blockReason: envelope.blockReason ?? 'Earthquake execution envelope did not produce a display-safe result.',
      moduleDescriptor: envelope.moduleDescriptor,
      overlay: null,
    });
  }

  const mappedOverlay = await projectEarthquakeToCityOverlay(envelope.projection);
  const overlayGate = evaluateScenarioOverlayEligibility({
    overlayKind: 'earthquake-scenario',
    schemaVersion: envelope.projection.schemaVersion,
    datasetStatuses: mappedOverlay.sites.map((site) => site.datasetStatus),
    evidence: { replayStatus: envelope.replay.status, missingFields: envelope.evidence.missingFields },
    coordinateMapping: {
      mappingId: mappedOverlay.mappingId,
      mappingVersion: mappedOverlay.mappingSchemaVersion,
      mappingFingerprint: mappedOverlay.mappingFingerprint,
    },
  }, options.overlayPolicy ?? { enabled: true, supportedSchemas: [envelope.projection.schemaVersion] });

  return Object.freeze({
    status: 'READY' as const,
    envelope,
    scenario: envelope.scenario,
    moduleDescriptor: envelope.moduleDescriptor,
    projection: envelope.projection,
    evidence: envelope.evidence,
    replay: envelope.replay,
    mapping: mappedOverlay,
    overlayGate,
    overlay: overlayGate.enabled ? mappedOverlay : null,
  });
}

export { EARTHQUAKE_CITYWORLD_MAPPING };
