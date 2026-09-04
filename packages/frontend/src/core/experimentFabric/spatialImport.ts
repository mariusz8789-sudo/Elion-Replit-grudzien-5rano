import { canonicalJson, fnv1a } from '../events/hash';

export const GENESIS_SPATIAL_DATASET_VERSION = '1.0.0';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
export const OSM_LICENSE = 'ODbL-1.0';

export type SpatialLayer = 'buildings' | 'roads' | 'rail' | 'water' | 'boundaries';
export type LonLat = readonly [number, number];

export interface GenesisSpatialFeature {
  sourceId: string;
  layer: SpatialLayer;
  geometry: { kind: 'line' | 'polygon'; coordinates: readonly LonLat[] };
  tags: Readonly<Record<string, string>>;
}

/** One imported spatial dataset; it is source data, not a parallel simulation world. */
export interface GenesisSpatialDataset {
  contractVersion: string;
  datasetId: string;
  source: 'openstreetmap-api';
  bbox: readonly [number, number, number, number];
  crs: 'EPSG:4326';
  sourceUrl: string;
  sourceQuery: string;
  sourceTimestamp: string;
  license: typeof OSM_LICENSE;
  attribution: typeof OSM_ATTRIBUTION;
  provenance: {
    rawArtifactFingerprint: string;
    normalizationFingerprint: string;
    featureCount: number;
    sourceMetadata: Readonly<Record<string, string>>;
  };
  layers: Readonly<Record<SpatialLayer, readonly GenesisSpatialFeature[]>>;
  worldIntegration: 'NOT_WIRED';
  limitation: string;
}

export interface OsmMapImportRequest {
  bbox: readonly [number, number, number, number];
  /** Immutable acquisition time supplied with the source artifact; required for replayable provenance. */
  sourceTimestamp: string;
  /** API root can be supplied only for a documented compatible OSM endpoint. */
  apiRoot?: 'https://api.openstreetmap.org/api/0.6';
}

function attributes(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of raw.matchAll(/([A-Za-z_:][\w:.-]*)=(?:"([^"]*)"|'([^']*)')/g)) out[match[1]] = match[2] ?? match[3] ?? '';
  return out;
}

function tagsFromXml(body: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const match of body.matchAll(/<tag\s+([^>]*?)\/?\s*>/g)) {
    const a = attributes(match[1]);
    if (a.k && a.v !== undefined) tags[a.k] = a.v;
  }
  return tags;
}

function layerFor(tags: Readonly<Record<string, string>>): SpatialLayer | null {
  if (tags.building && tags.building !== 'no') return 'buildings';
  if (tags.highway) return 'roads';
  if (tags.railway) return 'rail';
  if (tags.waterway || tags.natural === 'water' || tags.water === 'lake') return 'water';
  if (tags.boundary) return 'boundaries';
  return null;
}

function validBbox(bbox: readonly [number, number, number, number]): boolean {
  const [west, south, east, north] = bbox;
  return [west, south, east, north].every(Number.isFinite) && west < east && south < north && west >= -180 && east <= 180 && south >= -90 && north <= 90 && (east - west) <= 0.01 && (north - south) <= 0.01;
}

function validSourceTimestamp(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

/**
 * Normalizes an already acquired official OSM API XML artifact. The parser is
 * deliberately narrow: it reads only nodes and ways necessary for base layers;
 * relations and unreferenced tags are retained as an explicit future seam.
 */
export function normalizeOsmMapXml(xml: string, request: OsmMapImportRequest): GenesisSpatialDataset {
  if (!validBbox(request.bbox)) throw new Error('OSM bbox must be valid and no larger than 0.01° × 0.01° for the public map API.');
  if (!validSourceTimestamp(request.sourceTimestamp)) throw new Error('OSM sourceTimestamp must be an explicit valid timestamp for replayable provenance.');
  if (!xml.includes('<osm')) throw new Error('Input is not an OSM XML document.');
  const root = attributes(xml.match(/<osm\s+([^>]+)>/)?.[1] ?? '');
  const nodes = new Map<string, LonLat>();
  for (const match of xml.matchAll(/<node\s+([^>]*?)(?:\/?\s*>|>[\s\S]*?<\/node>)/g)) {
    const a = attributes(match[1]);
    const lon = Number(a.lon);
    const lat = Number(a.lat);
    if (a.id && Number.isFinite(lon) && Number.isFinite(lat)) nodes.set(a.id, [lon, lat]);
  }
  const grouped: Record<SpatialLayer, GenesisSpatialFeature[]> = { buildings: [], roads: [], rail: [], water: [], boundaries: [] };
  for (const match of xml.matchAll(/<way\s+([^>]*?)>([\s\S]*?)<\/way>/g)) {
    const header = attributes(match[1]);
    if (!header.id) continue;
    const body = match[2];
    const tags = tagsFromXml(body);
    const layer = layerFor(tags);
    if (!layer) continue;
    const coordinates: LonLat[] = [];
    for (const nd of body.matchAll(/<nd\s+([^>]*?)\/?\s*>/g)) {
      const ref = attributes(nd[1]).ref;
      const point = ref ? nodes.get(ref) : undefined;
      if (point) coordinates.push(point);
    }
    if (coordinates.length < 2) continue;
    const closed = coordinates.length > 3 && coordinates[0][0] === coordinates[coordinates.length - 1][0] && coordinates[0][1] === coordinates[coordinates.length - 1][1];
    grouped[layer].push({ sourceId: `way/${header.id}`, layer, geometry: { kind: closed ? 'polygon' : 'line', coordinates }, tags });
  }
  const sourceQuery = `bbox=${request.bbox.join(',')}`;
  const sourceUrl = `${request.apiRoot ?? 'https://api.openstreetmap.org/api/0.6'}/map?${sourceQuery}`;
  const sourceTimestamp = request.sourceTimestamp;
  const rawArtifactFingerprint = `osm_raw_${fnv1a(xml)}`;
  const normalizationFingerprint = `osm_normalized_${fnv1a(canonicalJson({ bbox: request.bbox, sourceUrl, sourceTimestamp, layers: Object.fromEntries(Object.entries(grouped).map(([layer, features]) => [layer, features.map((feature) => feature.sourceId)])) }))}`;
  const featureCount = Object.values(grouped).reduce((sum, entries) => sum + entries.length, 0);
  return {
    contractVersion: GENESIS_SPATIAL_DATASET_VERSION,
    datasetId: normalizationFingerprint,
    source: 'openstreetmap-api', bbox: request.bbox, crs: 'EPSG:4326', sourceUrl, sourceQuery, sourceTimestamp,
    license: OSM_LICENSE, attribution: OSM_ATTRIBUTION,
    provenance: { rawArtifactFingerprint, normalizationFingerprint, featureCount, sourceMetadata: root },
    layers: grouped,
    worldIntegration: 'NOT_WIRED',
    limitation: 'Dataset zawiera realną, znormalizowaną geometrię bazową OSM. Nie tworzy własnego świata i nie jest jeszcze podłączony do WorldAdapter/renderera; relacje OSM wymagają osobnego, audytowanego adaptera.',
  };
}

/** Fetches one constrained public OSM API map artifact and immediately records its provenance. */
export async function importOsmMap(request: OsmMapImportRequest, fetcher: typeof fetch = fetch): Promise<GenesisSpatialDataset> {
  if (!validBbox(request.bbox)) throw new Error('OSM bbox must be valid and no larger than 0.01° × 0.01° for the public map API.');
  if (!validSourceTimestamp(request.sourceTimestamp)) throw new Error('OSM sourceTimestamp must be an explicit valid timestamp for replayable provenance.');
  const sourceQuery = `bbox=${request.bbox.join(',')}`;
  const sourceUrl = `${request.apiRoot ?? 'https://api.openstreetmap.org/api/0.6'}/map?${sourceQuery}`;
  const response = await fetcher(sourceUrl, { headers: { Accept: 'application/xml' } });
  if (!response.ok) throw new Error(`OSM map API failed with HTTP ${response.status}.`);
  return normalizeOsmMapXml(await response.text(), request);
}
