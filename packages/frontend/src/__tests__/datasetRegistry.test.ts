import { describe, expect, it } from 'vitest';
import {
  evaluateDatasetAdapterEligibility,
  getDatasetMetadata,
  listDatasetMetadata,
} from '../core/hazard/datasetRegistry';

describe('dry dataset governance registry', () => {
  it('lists only frozen metadata entries, never acquired data', () => {
    const entries = listDatasetMetadata();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      datasetId: 'usgs-comcat-earthquake-catalog',
      registryStatus: 'DRY_METADATA_ONLY',
      licenseStatus: 'REVIEW_REQUIRED',
      ingestionStatus: 'NOT_IMPLEMENTED',
      spatialPolicy: { cityWorldAssociation: 'PROHIBITED_UNTIL_EXPLICIT_MAPPING' },
    });
    expect(Object.isFrozen(entries)).toBe(true);
    expect(Object.isFrozen(entries[0])).toBe(true);
  });

  it('retrieves only known metadata by exact identifier', () => {
    expect(getDatasetMetadata('usgs-comcat-earthquake-catalog')?.provider).toBe('U.S. Geological Survey');
    expect(getDatasetMetadata('unknown-live-source')).toBeNull();
  });

  it('blocks every current metadata entry from adapter use', () => {
    const dataset = getDatasetMetadata('usgs-comcat-earthquake-catalog');
    if (!dataset) throw new Error('Expected registered dry metadata');
    expect(evaluateDatasetAdapterEligibility(dataset)).toEqual({
      eligible: false,
      blockCodes: [
        'METADATA_ONLY',
        'LICENSE_REVIEW_REQUIRED',
        'NO_ADAPTER_IMPLEMENTED',
        'SPATIAL_POLICY_REVIEW_REQUIRED',
      ],
    });
  });

  it('keeps source limitations and future artifact prerequisites explicit', () => {
    const dataset = getDatasetMetadata('usgs-comcat-earthquake-catalog');
    expect(dataset?.requiredArtifactProvenance).toContain('rawContentHash');
    expect(dataset?.limitations.join(' ')).toMatch(/No data has been fetched/);
    expect(dataset?.limitations.join(' ')).toMatch(/No real geography/);
  });
});
