/**
 * DATASET GOVERNANCE REGISTRY — metadata only.
 *
 * This module deliberately contains no fetch, adapter, GIS, cache, hazard-run
 * or renderer behavior. It is a reviewed catalogue of prerequisites for a
 * future source adapter, not evidence that Genesis has acquired any dataset.
 */

export type DatasetRegistryStatus = 'DRY_METADATA_ONLY';
export type DatasetLicenseStatus = 'REVIEW_REQUIRED';
export type DatasetIngestionStatus = 'NOT_IMPLEMENTED';
export type DatasetAdapterBlockCode =
  | 'METADATA_ONLY'
  | 'LICENSE_REVIEW_REQUIRED'
  | 'NO_ADAPTER_IMPLEMENTED'
  | 'SPATIAL_POLICY_REVIEW_REQUIRED';

export interface DatasetSpatialPolicy {
  readonly horizontalReference: string;
  readonly verticalReference: string;
  readonly cityWorldAssociation: 'PROHIBITED_UNTIL_EXPLICIT_MAPPING';
}

export interface DatasetMetadata {
  readonly datasetId: string;
  readonly provider: string;
  readonly title: string;
  readonly documentationUrl: string;
  readonly documentedEndpoint: string | null;
  readonly documentedFormats: readonly string[];
  readonly registryStatus: DatasetRegistryStatus;
  readonly licenseStatus: DatasetLicenseStatus;
  readonly ingestionStatus: DatasetIngestionStatus;
  readonly spatialPolicy: DatasetSpatialPolicy;
  readonly requiredArtifactProvenance: readonly string[];
  readonly limitations: readonly string[];
}

export interface DatasetAdapterEligibility {
  readonly eligible: false;
  readonly blockCodes: readonly DatasetAdapterBlockCode[];
}

const USGS_COMCAT: DatasetMetadata = Object.freeze({
  datasetId: 'usgs-comcat-earthquake-catalog',
  provider: 'U.S. Geological Survey',
  title: 'ANSS Comprehensive Earthquake Catalog (ComCat)',
  documentationUrl: 'https://earthquake.usgs.gov/data/comcat/',
  documentedEndpoint: 'https://earthquake.usgs.gov/fdsnws/event/1/',
  documentedFormats: Object.freeze(['GeoJSON', 'CSV', 'QuakeML', 'KML', 'text']),
  registryStatus: 'DRY_METADATA_ONLY',
  licenseStatus: 'REVIEW_REQUIRED',
  ingestionStatus: 'NOT_IMPLEMENTED',
  spatialPolicy: Object.freeze({
    horizontalReference: 'WGS84 documented by provider',
    verticalReference: 'Provider/network-specific; preserve source metadata and uncertainty',
    cityWorldAssociation: 'PROHIBITED_UNTIL_EXPLICIT_MAPPING',
  }),
  requiredArtifactProvenance: Object.freeze([
    'provider',
    'documentationUrl',
    'requestedEndpointAndParameters',
    'retrievedAt',
    'rawContentHash',
    'declaredLicenseOrTermsReview',
    'sourceCoordinateAndVerticalReference',
  ]),
  limitations: Object.freeze([
    'No data has been fetched or stored by Genesis.',
    'No real geography or CityWorld association is permitted.',
    'No adapter, solver input, overlay, impact claim or operational output exists.',
    'Provider terms and license suitability require a separate review before ingestion.',
  ]),
});

const DATASET_METADATA: readonly DatasetMetadata[] = Object.freeze([USGS_COMCAT]);

export function listDatasetMetadata(): readonly DatasetMetadata[] {
  return DATASET_METADATA;
}

export function getDatasetMetadata(datasetId: string): DatasetMetadata | null {
  return DATASET_METADATA.find((dataset) => dataset.datasetId === datasetId) ?? null;
}

/**
 * A deliberately non-bypassable answer for every current entry. Any future
 * adapter must receive a new reviewed status and separately satisfy existing
 * SourceArtifact, HazardInput, replay and spatial mapping policies.
 */
export function evaluateDatasetAdapterEligibility(dataset: DatasetMetadata): DatasetAdapterEligibility {
  const blockCodes: DatasetAdapterBlockCode[] = [];
  if (dataset.registryStatus === 'DRY_METADATA_ONLY') blockCodes.push('METADATA_ONLY');
  if (dataset.licenseStatus === 'REVIEW_REQUIRED') blockCodes.push('LICENSE_REVIEW_REQUIRED');
  if (dataset.ingestionStatus === 'NOT_IMPLEMENTED') blockCodes.push('NO_ADAPTER_IMPLEMENTED');
  if (dataset.spatialPolicy.cityWorldAssociation === 'PROHIBITED_UNTIL_EXPLICIT_MAPPING') {
    blockCodes.push('SPATIAL_POLICY_REVIEW_REQUIRED');
  }
  return Object.freeze({
    eligible: false,
    blockCodes: Object.freeze(blockCodes),
  });
}
