import { describe, expect, it } from 'vitest';
import {
  VIRTUAL_CERN_GEOMETRY_MANIFEST,
  VIRTUAL_CERN_SOURCE_ASSETS,
  canRenderVirtualCernOneToOne,
} from '../core/knowledge/virtualCernGeometryManifest';

describe('Virtual CERN Geometry Manifest', () => {
  it('keeps source references distinct from approved 1:1 geometry', () => {
    expect(VIRTUAL_CERN_GEOMETRY_MANIFEST.fidelityPolicy).toBe('OFFICIAL_SOURCE_FIRST_NO_SYNTHETIC_GEOMETRY');
    expect(VIRTUAL_CERN_GEOMETRY_MANIFEST.approvedGeometryAssetCount).toBe(0);
    expect(VIRTUAL_CERN_GEOMETRY_MANIFEST.rendererIntegration).toBe('BLOCKED_NO_APPROVED_GEOMETRY');
    expect(canRenderVirtualCernOneToOne()).toBe(false);
  });

  it('records only provenance-usable facts and rejects every reference as a renderer asset', () => {
    expect(VIRTUAL_CERN_SOURCE_ASSETS.length).toBeGreaterThanOrEqual(5);
    expect(VIRTUAL_CERN_SOURCE_ASSETS.every((asset) => asset.sourceUrl.startsWith('https://'))).toBe(true);
    expect(VIRTUAL_CERN_SOURCE_ASSETS.every((asset) => asset.rendererEligibility === 'NOT_ELIGIBLE')).toBe(true);
    expect(VIRTUAL_CERN_SOURCE_ASSETS.some((asset) => asset.sourceStatus === 'SOURCE_KNOWN_ARTIFACT_UNAVAILABLE')).toBe(true);
    expect(VIRTUAL_CERN_SOURCE_ASSETS.some((asset) => asset.spatialPrecision === 'POINT_EPSG_4326')).toBe(true);
  });

  it('does not misrepresent outreach layouts as georeferenced 1:1 geometry', () => {
    const layout2022 = VIRTUAL_CERN_SOURCE_ASSETS.find((asset) => asset.id === 'cern-accelerator-layout-2022');
    const layout2026 = VIRTUAL_CERN_SOURCE_ASSETS.find((asset) => asset.id === 'cern-accelerator-layout-2026');
    expect(layout2022?.spatialPrecision).toBe('NOT_GEOREFERENCED');
    expect(layout2022?.sourceStatus).toBe('REFERENCE_ONLY_PENDING_LICENSE');
    expect(layout2026?.sourceStatus).toBe('SOURCE_KNOWN_ARTIFACT_UNAVAILABLE');
  });
});
