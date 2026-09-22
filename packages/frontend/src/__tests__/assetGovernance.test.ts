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
  evaluatePremiumAssetAcceptance,
  type PremiumAssetCandidate,
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

describe('Premium asset acceptance gate', () => {
  const goodLicense = {
    name: 'CC0-1.0',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    requiresAttribution: false,
    permitsCommercialRedistribution: true as const,
    aiRestriction: 'NONE' as const,
  };
  const goodProvenance = {
    sourceName: 'Poly Haven — Reference Asset',
    sourceUrl: 'https://polyhaven.com/a/reference_asset',
    sha256: { 'reference_asset.glb': 'a'.repeat(64) },
    immutableSource: true,
  };
  const goodAnatomy = {
    separateMeshes: true,
    stableMeshIds: ['organ.heart', 'organ.liver'],
    supportsOrganPicking: true,
    supportsIsolation: true,
    supportsCrossSection: true,
  };
  const goodPerformance = {
    polygonCount: 200_000,
    maxPolygonBudget: 500_000,
    textureResolutionPx: 2048,
    maxTextureResolutionPx: 4096,
    hasLod: true,
    lodLevels: 3,
    ktx2Ready: true,
    meshoptReady: true,
    dracoReady: false,
    realTimeWebSuitable: true,
  };
  const goodScientificProvenance = {
    datasetOrReference: 'Visible Human Project (NLM)',
    reviewedBy: 'in-house anatomist review',
    citationUrl: 'https://www.nlm.nih.gov/research/visible/visible_human.html',
  };

  function environmentCandidate(overrides: Partial<PremiumAssetCandidate> = {}): PremiumAssetCandidate {
    return {
      id: 'candidate-env',
      assetClass: 'ENVIRONMENT_OR_PROP',
      license: goodLicense,
      provenance: goodProvenance,
      anatomy: goodAnatomy,
      performance: goodPerformance,
      scientificProvenance: goodScientificProvenance,
      ...overrides,
    };
  }

  function anatomicalCandidate(overrides: Partial<PremiumAssetCandidate> = {}): PremiumAssetCandidate {
    return { ...environmentCandidate(overrides), id: 'candidate-anatomy', assetClass: 'ANATOMICAL', ...overrides };
  }

  it('acceptable CC0 environment: APPROVED', () => {
    const result = evaluatePremiumAssetAcceptance(environmentCandidate());
    expect(result.decision).toBe('APPROVED');
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('a complete, unambiguous anatomical candidate is also APPROVED — the happy path is reachable, not just the fallbacks', () => {
    const result = evaluatePremiumAssetAcceptance(anatomicalCandidate());
    expect(result.decision).toBe('APPROVED');
  });

  it('attribution-required anatomy: LEGAL_REVIEW_REQUIRED', () => {
    const result = evaluatePremiumAssetAcceptance(
      anatomicalCandidate({ license: { ...goodLicense, name: 'CC-BY-4.0', requiresAttribution: true } }),
    );
    expect(result.decision).toBe('LEGAL_REVIEW_REQUIRED');
    expect(result.reasons.some((r) => r.toLowerCase().includes('attribution'))).toBe(true);
  });

  it('unclear "no AI" license: LEGAL_REVIEW_REQUIRED', () => {
    const result = evaluatePremiumAssetAcceptance(
      environmentCandidate({ license: { ...goodLicense, aiRestriction: 'UNKNOWN' } }),
    );
    expect(result.decision).toBe('LEGAL_REVIEW_REQUIRED');
    expect(result.reasons.some((r) => r.toLowerCase().includes('ai-related restriction'))).toBe(true);
  });

  it('inseparable anatomy: REJECTED', () => {
    const result = evaluatePremiumAssetAcceptance(
      anatomicalCandidate({ anatomy: { separateMeshes: false, stableMeshIds: [], supportsOrganPicking: false, supportsIsolation: false, supportsCrossSection: false } }),
    );
    expect(result.decision).toBe('REJECTED');
    expect(result.reasons.some((r) => r.includes('organ picking/isolation/cross-section'))).toBe(true);
  });

  it('excessive geometry/textures: OPTIMIZATION_REQUIRED', () => {
    const result = evaluatePremiumAssetAcceptance(
      environmentCandidate({ performance: { ...goodPerformance, polygonCount: 2_000_000, textureResolutionPx: 8192 } }),
    );
    expect(result.decision).toBe('OPTIMIZATION_REQUIRED');
    expect(result.reasons.some((r) => r.includes('Polygon count'))).toBe(true);
    expect(result.reasons.some((r) => r.includes('Texture resolution'))).toBe(true);
  });

  it('missing hashes: REJECTED', () => {
    const result = evaluatePremiumAssetAcceptance(
      environmentCandidate({ provenance: { ...goodProvenance, sha256: {} } }),
    );
    expect(result.decision).toBe('REJECTED');
    expect(result.reasons.some((r) => r.includes('No SHA-256'))).toBe(true);
  });

  it('redistribution restriction: REJECTED', () => {
    const result = evaluatePremiumAssetAcceptance(
      environmentCandidate({ license: { ...goodLicense, permitsCommercialRedistribution: false } }),
    );
    expect(result.decision).toBe('REJECTED');
    expect(result.reasons.some((r) => r.toLowerCase().includes('forbids commercial redistribution'))).toBe(true);
  });

  it('unclear redistribution permission (not explicitly denied): LEGAL_REVIEW_REQUIRED, not REJECTED', () => {
    const result = evaluatePremiumAssetAcceptance(
      environmentCandidate({ license: { ...goodLicense, permitsCommercialRedistribution: 'UNKNOWN' } }),
    );
    expect(result.decision).toBe('LEGAL_REVIEW_REQUIRED');
  });

  it('missing scientific provenance on an otherwise-complete anatomical candidate: SCIENTIFIC_PROVENANCE_REQUIRED', () => {
    const result = evaluatePremiumAssetAcceptance(
      anatomicalCandidate({ scientificProvenance: { datasetOrReference: null, reviewedBy: null, citationUrl: null } }),
    );
    expect(result.decision).toBe('SCIENTIFIC_PROVENANCE_REQUIRED');
  });

  it('scientific provenance is never required for a non-anatomical environment asset', () => {
    const result = evaluatePremiumAssetAcceptance(
      environmentCandidate({ scientificProvenance: { datasetOrReference: null, reviewedBy: null, citationUrl: null } }),
    );
    expect(result.decision).toBe('APPROVED');
  });

  it('a non-pinned (mutable) source is REJECTED even with real hashes', () => {
    const result = evaluatePremiumAssetAcceptance(
      environmentCandidate({ provenance: { ...goodProvenance, immutableSource: false } }),
    );
    expect(result.decision).toBe('REJECTED');
  });

  it('a fabricated (non-hex, wrong-length) checksum is REJECTED, not silently accepted', () => {
    const result = evaluatePremiumAssetAcceptance(
      environmentCandidate({ provenance: { ...goodProvenance, sha256: { 'asset.glb': 'not-a-real-checksum' } } }),
    );
    expect(result.decision).toBe('REJECTED');
  });

  it('unknown values never pass: an all-unknown candidate is never APPROVED', () => {
    const result = evaluatePremiumAssetAcceptance(
      anatomicalCandidate({
        license: { name: null, url: null, requiresAttribution: false, permitsCommercialRedistribution: 'UNKNOWN', aiRestriction: 'UNKNOWN' },
        provenance: { sourceName: null, sourceUrl: null, sha256: {}, immutableSource: false },
        performance: { polygonCount: null, maxPolygonBudget: 500_000, textureResolutionPx: null, maxTextureResolutionPx: 4096, hasLod: false, lodLevels: null, ktx2Ready: false, meshoptReady: false, dracoReady: false, realTimeWebSuitable: false },
        scientificProvenance: { datasetOrReference: null, reviewedBy: null, citationUrl: null },
      }),
    );
    expect(result.decision).not.toBe('APPROVED');
    expect(result.decision).toBe('REJECTED');
  });

  it('every decision carries at least one concrete, non-empty reason', () => {
    const decisions: PremiumAssetCandidate[] = [
      environmentCandidate(),
      environmentCandidate({ license: { ...goodLicense, aiRestriction: 'UNKNOWN' } }),
      environmentCandidate({ performance: { ...goodPerformance, hasLod: false, lodLevels: null } }),
      anatomicalCandidate({ scientificProvenance: { datasetOrReference: null, reviewedBy: null, citationUrl: null } }),
    ];
    for (const candidate of decisions) {
      const result = evaluatePremiumAssetAcceptance(candidate);
      expect(result.reasons.length).toBeGreaterThan(0);
      for (const reason of result.reasons) expect(reason.length).toBeGreaterThan(0);
    }
  });

  it('missing LOD/compression readiness alone triggers OPTIMIZATION_REQUIRED', () => {
    const result = evaluatePremiumAssetAcceptance(
      environmentCandidate({ performance: { ...goodPerformance, hasLod: false, lodLevels: null, ktx2Ready: false, meshoptReady: false, dracoReady: false } }),
    );
    expect(result.decision).toBe('OPTIMIZATION_REQUIRED');
  });

  it('does not read from or write to WORLD_ENGINE_ASSET_MANIFEST — a pre-purchase screen, not a second registry', () => {
    const before = WORLD_ENGINE_ASSET_MANIFEST.length;
    evaluatePremiumAssetAcceptance(environmentCandidate());
    evaluatePremiumAssetAcceptance(anatomicalCandidate());
    expect(WORLD_ENGINE_ASSET_MANIFEST.length).toBe(before);
  });
});
