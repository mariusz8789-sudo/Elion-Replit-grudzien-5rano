import { createHash } from 'node:crypto';

const MAX_ORIGINAL_BYTES = 7 * 1024 * 1024;
const MAX_FEATURES = 50_000;
const SPATIAL_CONTRACT_VERSION = '1.0.0';
const OSM_LICENSE = 'ODbL-1.0';
const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
const LAYERS = ['buildings', 'roads', 'rail', 'water', 'boundaries'];

function fail(error, message) {
  return { ok: false, error, message };
}

function isBbox(value) {
  return Array.isArray(value) && value.length === 4 && value.every(Number.isFinite)
    && value[0] < value[2] && value[1] < value[3]
    && value[0] >= -180 && value[2] <= 180 && value[1] >= -90 && value[3] <= 90
    && value[2] - value[0] <= 0.01 && value[3] - value[1] <= 0.01;
}

function validTimestamp(value) {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function validFeature(feature, expectedLayer) {
  if (!feature || typeof feature !== 'object' || feature.layer !== expectedLayer || typeof feature.sourceId !== 'string') return false;
  const geometry = feature.geometry;
  if (!geometry || !['line', 'polygon'].includes(geometry.kind) || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) return false;
  return geometry.coordinates.every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite));
}

/**
 * Validates a client-normalized OSM artifact for durable project storage. This
 * does not fetch, infer geometry or alter any simulation; it merely preserves
 * the original source and its explicit normalized representation.
 */
export function prepareProjectSpatialDataset(body) {
  const originalBase64 = typeof body?.originalBase64 === 'string' ? body.originalBase64 : '';
  if (!originalBase64) return fail('missing_original', 'Brak oryginalnego artefaktu OSM XML.');
  let original;
  try {
    original = Buffer.from(originalBase64, 'base64');
  } catch {
    return fail('invalid_base64', 'Artefakt OSM nie jest poprawnym base64.');
  }
  if (original.length === 0 || original.length > MAX_ORIGINAL_BYTES) return fail('invalid_size', `Artefakt OSM musi mieć od 1 do ${MAX_ORIGINAL_BYTES} bajtów.`);
  if (!original.toString('utf8').includes('<osm')) return fail('invalid_osm_xml', 'Oryginalny artefakt nie jest dokumentem OSM XML.');

  const dataset = body?.dataset;
  if (!dataset || typeof dataset !== 'object') return fail('invalid_dataset', 'Brak znormalizowanego datasetu GIS.');
  if (dataset.contractVersion !== SPATIAL_CONTRACT_VERSION || dataset.source !== 'openstreetmap-api' || dataset.crs !== 'EPSG:4326') {
    return fail('unsupported_dataset', 'Obsługiwany jest wyłącznie kontrakt Genesis Spatial Dataset OSM EPSG:4326.');
  }
  if (typeof dataset.datasetId !== 'string' || !/^osm_normalized_[0-9a-f]{8}$/i.test(dataset.datasetId)) return fail('invalid_dataset_id', 'Nieprawidłowy identyfikator znormalizowanego datasetu.');
  if (!isBbox(dataset.bbox) || !validTimestamp(dataset.sourceTimestamp)) return fail('invalid_provenance', 'Dataset GIS wymaga ograniczonego bboxu oraz jawnego czasu pozyskania.');
  if (dataset.license !== OSM_LICENSE || dataset.attribution !== OSM_ATTRIBUTION || typeof dataset.sourceUrl !== 'string' || typeof dataset.sourceQuery !== 'string') {
    return fail('invalid_attribution', 'Dataset GIS wymaga atrybucji i licencji OSM/ODbL.');
  }
  if (!dataset.provenance || typeof dataset.provenance.rawArtifactFingerprint !== 'string' || typeof dataset.provenance.normalizationFingerprint !== 'string') {
    return fail('invalid_provenance', 'Dataset GIS nie ma pełnej provenance normalizacji.');
  }
  if (!dataset.layers || typeof dataset.layers !== 'object') return fail('invalid_layers', 'Dataset GIS nie zawiera warstw geometrii.');
  let featureCount = 0;
  for (const layer of LAYERS) {
    const features = dataset.layers[layer];
    if (!Array.isArray(features) || !features.every((feature) => validFeature(feature, layer))) return fail('invalid_layers', `Warstwa GIS ${layer} jest nieprawidłowa.`);
    featureCount += features.length;
  }
  if (featureCount > MAX_FEATURES || dataset.provenance.featureCount !== featureCount) return fail('invalid_feature_count', 'Liczba obiektów GIS jest nieprawidłowa albo przekracza limit.');

  const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 160) : '';
  if (!label) return fail('missing_label', 'Artefakt GIS wymaga krótkiej nazwy.');
  return {
    ok: true,
    value: {
      label,
      dataset,
      original,
      originalSha256: createHash('sha256').update(original).digest('hex'),
    },
  };
}
