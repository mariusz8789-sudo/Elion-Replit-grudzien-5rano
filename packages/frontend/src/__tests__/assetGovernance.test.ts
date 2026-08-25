import { describe, expect, it } from 'vitest';
import {
  WORLD_ENGINE_ASSET_MANIFEST,
  approvedWorldAssetCount,
  getWorldAssetRecord,
  isWorldAssetApproved,
  isWorldAssetPathApproved,
  unverifiedWorldAssetCount,
  approvedAssetsMissingProvenance,
  assetFileChecksum,
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
    expect(isWorldAssetPathApproved('/assets/genesis-governed-pbr/asphalt-track/diffuse.jpg')).toBe(true);
    expect(isWorldAssetPathApproved('/assets/genesis-governed-pbr/concrete-floor-01/normal.jpg')).toBe(true);
    expect(isWorldAssetPathApproved('/assets/genesis-governed-pbr/brick-wall-10/arm.jpg')).toBe(true);
  });

  it('keeps verification accounting explicit', () => {
    expect(approvedWorldAssetCount()).toBeGreaterThanOrEqual(6);
    expect(unverifiedWorldAssetCount()).toBeGreaterThanOrEqual(5);
    expect(WORLD_ENGINE_ASSET_MANIFEST.every((asset) => asset.status === 'APPROVED' || asset.rationale.length > 0)).toBe(true);
  });
});

describe('World Engine asset governance — provenance completeness', () => {
  it('every APPROVED asset carries source, license AND computed checksums', () => {
    expect(approvedAssetsMissingProvenance()).toEqual([]);
    for (const asset of WORLD_ENGINE_ASSET_MANIFEST) {
      if (asset.status !== 'APPROVED') continue;
      expect(asset.sourceUrl).toBeTruthy();
      expect(asset.license).toBeTruthy();
      expect(Object.keys(asset.sha256).length).toBeGreaterThan(0);
      // Skróty muszą być realnymi SHA-256, nie zaślepkami.
      for (const digest of Object.values(asset.sha256)) expect(digest).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('exposes the checksum of a specific file inside an approved texture set', () => {
    expect(assetFileChecksum('/assets/genesis-governed-pbr/asphalt-track/diffuse.jpg', 'diffuse.jpg'))
      .toMatch(/^[0-9a-f]{64}$/);
    expect(assetFileChecksum('/assets/genesis-hf/pbr/asphalt/diffuse.jpg', 'diffuse.jpg')).toBeNull();
  });

  it('the undocumented LOD0 human stays blocked on every path that loads it', () => {
    // Dwa różne miejsca w rendererze ładują ten sam plik; obydwa pytają bramkę.
    expect(isWorldAssetApproved('/assets/genesis-hf/characters/mpfb-lod0.glb')).toBe(false);
    expect(getWorldAssetRecord('/assets/genesis-hf/characters/mpfb-lod0.glb')?.status).toBe('UNVERIFIED');
  });
});
