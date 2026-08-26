/**
 * EARTHQUAKE → CITYWORLD SYNTHETIC COORDINATE MAPPING.
 *
 * This is a display-anchor artifact, not a GIS transform and not a statement
 * that fixture sites are real CityWorld facilities. It maps opaque synthetic
 * fixture IDs to pre-existing CityWorld anchors so one read-only overlay can
 * be demonstrated without creating a second city or changing the epidemic
 * simulation. Source fixture coordinates are never projected into CityWorld.
 */
import { canonicalJson } from '../events/hash';
import { sha256Hex } from '../discovery/evidenceCrypto';
import { buildCity, type CityLayout } from '../world/cityWorld';
import type { EarthquakeWorldProjectionSite, EarthquakeWorldStateView } from '../hazard/earthquake/earthquakeWorldProjection';

export const EARTHQUAKE_CITYWORLD_MAPPING_SCHEMA_VERSION = '1.0.0';
export const EARTHQUAKE_CITYWORLD_MAPPING_ID = 'earthquake-fixture-to-cityworld-overlay/v1';
export const EARTHQUAKE_FIXTURE_COORDINATE_SYSTEM = 'earthquake-synthetic-fixture-km/v1';
export const CITYWORLD_OVERLAY_COORDINATE_SYSTEM = 'cityworld-layout-900x620/v1';

export interface EarthquakeCoordinateMappingEntry {
  readonly sourceSiteId: string;
  readonly targetCityWorldLocationId: string;
}

export interface EarthquakeCoordinateMappingArtifact {
  readonly mappingId: string;
  readonly schemaVersion: string;
  readonly sourceCoordinateSystem: string;
  readonly targetCoordinateSystem: string;
  readonly datasetStatus: 'SCENARIO';
  readonly entries: readonly EarthquakeCoordinateMappingEntry[];
}

/**
 * Fixed deliberately synthetic display anchors. `site-alpha` does not become
 * a school or hospital: it only receives a marker position near an existing
 * CityWorld object. This mapping is part of the run provenance and is never
 * inferred by label, distance, external GIS or coordinate scale.
 */
export const EARTHQUAKE_CITYWORLD_MAPPING: Readonly<EarthquakeCoordinateMappingArtifact> = Object.freeze({
  mappingId: EARTHQUAKE_CITYWORLD_MAPPING_ID,
  schemaVersion: EARTHQUAKE_CITYWORLD_MAPPING_SCHEMA_VERSION,
  sourceCoordinateSystem: EARTHQUAKE_FIXTURE_COORDINATE_SYSTEM,
  targetCoordinateSystem: CITYWORLD_OVERLAY_COORDINATE_SYSTEM,
  datasetStatus: 'SCENARIO',
  entries: Object.freeze([
    Object.freeze({ sourceSiteId: 'site-alpha', targetCityWorldLocationId: 'location:school:1' }),
    Object.freeze({ sourceSiteId: 'site-bravo', targetCityWorldLocationId: 'location:shop:0' }),
    Object.freeze({ sourceSiteId: 'site-charlie', targetCityWorldLocationId: 'location:hospital:2' }),
    Object.freeze({ sourceSiteId: 'site-delta', targetCityWorldLocationId: 'location:park:4' }),
    Object.freeze({ sourceSiteId: 'site-echo', targetCityWorldLocationId: 'location:home:5' }),
  ]),
});

export interface EarthquakeCityOverlaySite {
  readonly overlayId: string;
  readonly sourceSiteId: string;
  readonly targetCityWorldLocationId: string;
  readonly cityX: number;
  readonly cityY: number;
  readonly severity: EarthquakeWorldProjectionSite['severity'];
  readonly severityValue: number;
  readonly uncertaintyLow: number;
  readonly uncertaintyHigh: number;
  readonly datasetStatus: 'SCENARIO';
}

export interface EarthquakeCityOverlayProjection {
  readonly mappingId: string;
  readonly mappingSchemaVersion: string;
  readonly mappingFingerprint: string;
  readonly sourceHazardRunId: string;
  readonly sourceProjectionSchemaVersion: string;
  readonly datasetStatus: 'SCENARIO';
  readonly sites: readonly EarthquakeCityOverlaySite[];
  readonly notModeled: readonly string[];
}

function mappingContent(artifact: EarthquakeCoordinateMappingArtifact): unknown {
  return {
    mappingId: artifact.mappingId,
    schemaVersion: artifact.schemaVersion,
    sourceCoordinateSystem: artifact.sourceCoordinateSystem,
    targetCoordinateSystem: artifact.targetCoordinateSystem,
    datasetStatus: artifact.datasetStatus,
    entries: artifact.entries,
  };
}

/** Reuses Genesis canonical JSON and SHA-256; no mapping-specific hashing exists. */
export async function fingerprintEarthquakeCoordinateMapping(artifact: EarthquakeCoordinateMappingArtifact = EARTHQUAKE_CITYWORLD_MAPPING): Promise<string> {
  return sha256Hex(canonicalJson(mappingContent(artifact)));
}

function assertMappingArtifact(artifact: EarthquakeCoordinateMappingArtifact): void {
  if (artifact.schemaVersion !== EARTHQUAKE_CITYWORLD_MAPPING_SCHEMA_VERSION) throw new Error(`Unsupported earthquake mapping schema: ${artifact.schemaVersion}`);
  if (artifact.datasetStatus !== 'SCENARIO') throw new Error('Earthquake overlay mapping must be SCENARIO-only.');
  if (!artifact.mappingId || !artifact.sourceCoordinateSystem || !artifact.targetCoordinateSystem) throw new Error('Earthquake mapping provenance is incomplete.');
}

/**
 * Converts an already computed Earthquake projection into visual anchor data.
 * It reads no simulation state and writes nothing to CityWorld/WorldState.
 */
export async function projectEarthquakeToCityOverlay(
  projection: EarthquakeWorldStateView,
  layout: CityLayout = buildCity(),
  artifact: EarthquakeCoordinateMappingArtifact = EARTHQUAKE_CITYWORLD_MAPPING,
): Promise<EarthquakeCityOverlayProjection> {
  assertMappingArtifact(artifact);
  const locations = new Map(layout.buildings.map((building) => [building.id, building] as const));
  const entries = new Map(artifact.entries.map((entry) => [entry.sourceSiteId, entry] as const));
  const seenTargets = new Set<string>();
  const sites = projection.sites.map((site) => {
    if (site.datasetStatus !== 'SCENARIO') throw new Error(`Earthquake site ${site.siteId} is not SCENARIO data.`);
    const entry = entries.get(site.siteId);
    if (!entry) throw new Error(`No explicit CityWorld mapping for Earthquake site ${site.siteId}.`);
    const anchor = locations.get(entry.targetCityWorldLocationId);
    if (!anchor) throw new Error(`Unknown CityWorld overlay anchor ${entry.targetCityWorldLocationId}.`);
    if (seenTargets.has(anchor.id)) throw new Error(`CityWorld overlay anchor ${anchor.id} is mapped more than once.`);
    seenTargets.add(anchor.id);
    return Object.freeze({
      overlayId: `earthquake-overlay:${projection.hazardRunId}:${site.siteId}`,
      sourceSiteId: site.siteId,
      targetCityWorldLocationId: anchor.id,
      cityX: anchor.cx,
      cityY: anchor.cy,
      severity: site.severity,
      severityValue: site.severityValue,
      uncertaintyLow: site.uncertaintyLow,
      uncertaintyHigh: site.uncertaintyHigh,
      datasetStatus: 'SCENARIO' as const,
    });
  });
  return Object.freeze({
    mappingId: artifact.mappingId,
    mappingSchemaVersion: artifact.schemaVersion,
    mappingFingerprint: await fingerprintEarthquakeCoordinateMapping(artifact),
    sourceHazardRunId: projection.hazardRunId,
    sourceProjectionSchemaVersion: projection.schemaVersion,
    datasetStatus: 'SCENARIO' as const,
    sites: Object.freeze(sites),
    notModeled: Object.freeze([...projection.notModeled, 'real-world geography', 'real facility association', 'CityWorld model coupling']),
  });
}
