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

  it('the LOD0 human is approved ONLY with complete, verified provenance (D-131)', () => {
    // Do D-130 ten asset był UNVERIFIED z uzasadnieniem „brak lokalnego rekordu źródła i licencji".
    // Rekord jednak istniał — w ASSETS.md obok pliku. D-131 zweryfikowało obie rzeczy (sumy SHA-256 policzone
    // z plików w repo + cytat licencji CC0 z README źródła) i dopiero wtedy promowało wpis.
    const record = getWorldAssetRecord('/assets/genesis-hf/characters/mpfb-lod0.glb');
    expect(record?.status).toBe('APPROVED');
    expect(isWorldAssetApproved('/assets/genesis-hf/characters/mpfb-lod0.glb')).toBe(true);
    // Bramka jest tyle warta, ile kompletność rekordu: bez licencji, źródła i sumy nie wolno go dopuścić.
    expect(record?.license).toBe('CC0-1.0');
    expect(record?.sourceUrl).toMatch(/^https:\/\//);
    expect(record?.author).toBeTruthy();
    expect(record?.sha256['mpfb-lod0.glb']).toBe('ec47cffd0a56d201869afb9c10ea957e237c55d4e12c197fc9d9c30d5772a8d2');
    expect(approvedAssetsMissingProvenance()).toEqual([]);
    // Licencja dotyczy GRAFIKI. Rekord nie może sugerować, że to medyczny model anatomiczny.
    expect(record?.rationale).toMatch(/[Nn]ie zawiera anatomii medycznej/);
  });

  it('an asset with no recorded source or licence is still blocked', () => {
    expect(isWorldAssetApproved('/assets/genesis-hf/pbr/asphalt/diffuse.jpg')).toBe(false);
    expect(getWorldAssetRecord('/assets/genesis-hf/pbr/')?.status).toBe('UNVERIFIED');
    expect(isWorldAssetApproved('/assets/nieistniejacy/asset.glb')).toBe(false);
  });
});
