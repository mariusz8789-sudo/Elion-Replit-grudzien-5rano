import { describe, expect, it } from 'vitest';
import {
  WORLD_ENGINE_ASSET_MANIFEST,
  approvedWorldAssetCount,
  getWorldAssetRecord,
  isWorldAssetApproved,
  isWorldAssetPathApproved,
  unverifiedWorldAssetCount,
} from '../core/three/assetGovernance';

describe('World Engine asset governance', () => {
  it('approves only assets with source and license provenance', () => {
    const facade = '/assets/genesis-hf-v2/models/modular_urban_apartments_facade/modular_urban_apartments_facade.gltf';
    const record = getWorldAssetRecord(facade);
    expect(record?.status).toBe('APPROVED');
    expect(record?.sourceUrl).toBe('https://polyhaven.com/a/modular_urban_apartments_facade');
    expect(record?.license).toBe('CC0-1.0');
    expect(isWorldAssetApproved(facade)).toBe(true);
  });

  it('rejects unknown and unverified runtime paths by default', () => {
    expect(isWorldAssetApproved('/assets/genesis-hf-v2/models/covered_car/covered_car.gltf')).toBe(false);
    expect(isWorldAssetApproved('/assets/not-in-manifest.gltf')).toBe(false);
    expect(isWorldAssetPathApproved('/assets/genesis-hf/pbr/asphalt/diffuse.jpg')).toBe(false);
  });

  it('keeps verification accounting explicit', () => {
    expect(approvedWorldAssetCount()).toBeGreaterThanOrEqual(3);
    expect(unverifiedWorldAssetCount()).toBeGreaterThanOrEqual(5);
    expect(WORLD_ENGINE_ASSET_MANIFEST.every((asset) => asset.status === 'APPROVED' || asset.rationale.length > 0)).toBe(true);
  });
});
