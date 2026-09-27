export type WorldAssetApprovalStatus = 'APPROVED' | 'UNVERIFIED' | 'REJECTED';

export interface WorldAssetRecord {
  /** Stabilny identyfikator provenance assetu, niezależny od jego położenia w scenie. */
  id: string;
  /** Publiczny path runtime’u używany przez loader World Engine. */
  runtimePath: string;
  /** Rodzaj artefaktu niebędącego danymi modelu naukowego. */
  format: 'glTF' | 'GLB' | 'HDR' | 'PBR_TEXTURE_SET';
  /** Czy asset przeszedł bramkę źródła i licencji. */
  status: WorldAssetApprovalStatus;
  sourceName: string;
  sourceUrl: string | null;
  license: string | null;
  licenseUrl: string | null;
  author: string | null;
  polygonCount: number | null;
  textureResolution: string | null;
  /** Powód statusu — wymagany zwłaszcza dla unverified/rejected. */
  rationale: string;
  /**
   * SHA-256 plików assetu, policzone z artefaktów faktycznie leżących w repo.
   * Dla zestawu tekstur to mapa nazwa_pliku → skrót; dla pojedynczego pliku
   * klucz odpowiada jego nazwie. Pusta mapa oznacza brak policzonych skrótów
   * i występuje wyłącznie przy assetach UNVERIFIED, których i tak nie ładujemy.
   */
  sha256: Readonly<Record<string, string>>;
}

/**
 * BodyParts3D 4.0 pilot (DBCLS, CC BY 4.0): five structures × two levels of detail, converted by
 * `scripts/convertBodyParts3dPilot.mjs` from the official part-of element sets. One record per runtime
 * file, like every other entry here. Attribution is required by the licence and is rendered by the
 * Human Explorer whenever any of these meshes is on screen. Generic anatomical reference geometry of
 * one atlas body — never patient-specific, never clinical or diagnostic.
 */
function bodyParts3dPilotRecord(genesisId: string, lod: 'desktop' | 'mobile', sha256: string, triangles: number): WorldAssetRecord {
  const fileName = `${genesisId}.${lod}.glb`;
  return {
    id: `bodyparts3d-4.0-pilot-${genesisId}-${lod}`,
    runtimePath: `/assets/bodyparts3d/pilot/${fileName}`,
    format: 'GLB',
    status: 'APPROVED',
    sourceName: 'BodyParts3D 4.0 — The Database Center for Life Science (DBCLS), official archive isa_BP3D_4.0_obj_99.zip (SHA-256 40665852…409E), part-of element set',
    sourceUrl: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip',
    license: 'CC-BY-4.0',
    licenseUrl: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html',
    author: 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International',
    polygonCount: triangles,
    textureResolution: null,
    rationale: `Oficjalne źródło DBCLS (archiwum zweryfikowane SHA-256), licencja CC BY 4.0 z wymaganą atrybucją wyświetlaną w Human Explorer. Konwersja deterministyczna (${lod === 'desktop' ? 'wszystkie trójkąty źródła' : 'uproszczenie meshoptimizer 0.18.1, błąd zapisany w provenance'}); mapowanie FMA→BP→FJ udowodnione na oficjalnych listach part-of. Ogólny model referencyjny anatomii jednego ciała atlasu — nie pacjent, nie użycie kliniczne; brak histologii i danych komórkowych.`,
    sha256: { [fileName]: sha256 },
  };
}

/**
 * Jedyny manifest asset provenance dla World Engine.
 *
 * Nie zawiera World State ani danych naukowych. Służy wyłącznie do dopuszczenia
 * lokalnego pliku renderera po potwierdzeniu jego źródła i licencji. Wszystko,
 * co nie ma wpisu APPROVED, jest przez loader traktowane jako niedopuszczone.
 */
export const WORLD_ENGINE_ASSET_MANIFEST: readonly WorldAssetRecord[] = Object.freeze<WorldAssetRecord[]>([
  {
    id: 'polyhaven-modular-urban-apartments-facade',
    runtimePath: '/assets/genesis-hf-v2/models/modular_urban_apartments_facade/modular_urban_apartments_facade.gltf',
    format: 'glTF',
    status: 'APPROVED',
    sourceName: 'Poly Haven — Modular Urban Apartments Facade',
    sourceUrl: 'https://polyhaven.com/a/modular_urban_apartments_facade',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    author: 'James Ray Cock',
    polygonCount: 118_000,
    textureResolution: '1K local derivative; source supports up to 8K',
    rationale: 'Nazwa lokalnego artefaktu, zawartość i oficjalny rekord Poly Haven zostały zweryfikowane.',
    sha256: { 'modular_urban_apartments_facade.gltf': '1a5a17dffd27fb9e1236dea7e51c4e0393a9d88ed0885a0621e67a37f80b27eb' },
  },
  {
    id: 'polyhaven-street-lamp-01',
    runtimePath: '/assets/genesis-hf-v2/models/street_lamp_01/street_lamp_01.gltf',
    format: 'glTF',
    status: 'APPROVED',
    sourceName: 'Poly Haven — Street Lamp 01',
    sourceUrl: 'https://polyhaven.com/a/street_lamp_01',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    author: null,
    polygonCount: null,
    textureResolution: '1K local derivative; source supports up to 8K',
    rationale: 'Nazwa lokalnego artefaktu odpowiada oficjalnemu rekordowi Poly Haven; licencja Poly Haven jest CC0.',
    sha256: { 'street_lamp_01.gltf': '5d0358ede168b5e04547780b99d8e6d651cbe644e468e67cb505019047cbd5c8' },
  },
  {
    id: 'polyhaven-braustuble-alley-hdri',
    runtimePath: '/assets/genesis-hf/hdr/braustuble_alley_1k.hdr',
    format: 'HDR',
    status: 'APPROVED',
    sourceName: 'Poly Haven — Braustuble Alley',
    sourceUrl: 'https://polyhaven.com/a/braustuble_alley',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    author: 'Elvis Posa',
    polygonCount: null,
    textureResolution: '1K local derivative; source supports up to 24K',
    rationale: 'Nazwa lokalnego HDRI odpowiada oficjalnemu rekordowi Poly Haven z licencją CC0.',
    sha256: { 'braustuble_alley_1k.hdr': 'af4ef72e21c37d81547faf5b938180926a055a230634fcf8a047ddeef3629d70' },
  },
  {
    id: 'polyhaven-asphalt-track-pbr',
    runtimePath: '/assets/genesis-governed-pbr/asphalt-track/',
    format: 'PBR_TEXTURE_SET',
    status: 'APPROVED',
    sourceName: 'Poly Haven — Asphalt Track',
    sourceUrl: 'https://polyhaven.com/a/asphalt_track',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    author: null,
    polygonCount: null,
    textureResolution: '1K local JPG derivative; source supports up to 8K',
    rationale: 'Zestaw diffuse, normal GL oraz ARM pobrany z oficjalnego źródła Poly Haven i przypisany do nawierzchni drogi.',
    sha256: {
      'diffuse.jpg': '05c4e79cd99160075969d37bfc6ef72be262153a410bb45510b2c23f7303894c',
      'normal.jpg': '18caf02427a7cd9cd577ceae5aa9daa7bb3ffba60598e2df8aaf75d1925a8a94',
      'arm.jpg': '1ad38c055c97547802912facec609ee6deda2dc9bc2f048f36ea484e5f5ccb6e',
    },
  },
  {
    id: 'polyhaven-concrete-floor-01-pbr',
    runtimePath: '/assets/genesis-governed-pbr/concrete-floor-01/',
    format: 'PBR_TEXTURE_SET',
    status: 'APPROVED',
    sourceName: 'Poly Haven — Concrete Floor 01',
    sourceUrl: 'https://polyhaven.com/a/concrete_floor_01',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    author: 'Rob Tuytel',
    polygonCount: null,
    textureResolution: '1K local JPG derivative; source supports up to 8K',
    rationale: 'Zestaw diffuse, normal GL oraz ARM pobrany z oficjalnego źródła Poly Haven i przypisany do chodnika/betonu.',
    sha256: {
      'diffuse.jpg': 'db7c800f1464359b5f359fc743e82ac51b34e014fdfd53844f4af34bb1949229',
      'normal.jpg': '28be1f6fa82eeab137c84954bf7ea0f5d8a4434352d01c29f15e20926eb7227e',
      'arm.jpg': '44e3a0d18db295998c8af56ecc80095821e719e134974609aa92e5436709dabd',
    },
  },
  {
    id: 'polyhaven-brick-wall-10-pbr',
    runtimePath: '/assets/genesis-governed-pbr/brick-wall-10/',
    format: 'PBR_TEXTURE_SET',
    status: 'APPROVED',
    sourceName: 'Poly Haven — Brick Wall 10',
    sourceUrl: 'https://polyhaven.com/a/brick_wall_10',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    author: 'Dimitrios Savva',
    polygonCount: null,
    textureResolution: '1K local JPG derivative; source supports up to 8K',
    rationale: 'Zestaw diffuse, normal GL oraz ARM pobrany z oficjalnego źródła Poly Haven i przypisany do muru/fasady.',
    sha256: {
      'diffuse.jpg': '6acfca2cecd9861f0531b7bc2179c8ca74c9f8535f53166de676af40f2e8f6df',
      'normal.jpg': '8aa54a734885d7e3a3630629580b63c76418af4af1474fec599f06aa5508d037',
      'arm.jpg': '5249c139d7c31cc0c8dcdf20ae049cd7590e44d95a0e49d38ea2ea2a8051900e',
    },
  },
  {
    id: 'genesis-procedural-ambulance',
    runtimePath: '/assets/genesis-procedural/ambulance/ambulance.glb',
    format: 'GLB',
    status: 'APPROVED',
    sourceName: 'Genesis Graphics Engine — procedurally generated in-repo',
    sourceUrl: 'packages/frontend/scripts/exportAmbulanceAsset.mjs',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    author: 'Genesis Graphics Engine (procedural export, no external source)',
    polygonCount: 9 * 12, // 9 simple box/cylinder meshes; see the exporter script's own geometry
    textureResolution: null, // flat MeshStandardMaterial colors only, no texture maps
    rationale: 'Original geometry authored in this repo (graphics/vehicleKit.ts\'s ambulance, reproduced by the exporter script), built and dedicated CC0 by the author — not a third-party asset, so the usual external-source review does not apply; provenance is the generating script itself, verifiable by re-running it and comparing the SHA-256 below.',
    sha256: { 'ambulance.glb': '2f3054bcf6fd9e1be91b9745327ccaf1dc862d2eb5ed9a30aa94709fa1f8eda5' },
  },
  {
    id: 'unverified-modular-fire-escape',
    runtimePath: '/assets/genesis-hf-v2/models/modular_fire_escape/modular_fire_escape.gltf',
    format: 'glTF',
    status: 'UNVERIFIED',
    sourceName: 'Unknown',
    sourceUrl: null,
    license: null,
    licenseUrl: null,
    author: null,
    polygonCount: null,
    textureResolution: '1K local files',
    rationale: 'Lokalny glTF zawiera wyłącznie metadane Blender generator; brak źródła, autora i licencji.',
    sha256: {},
  },
  {
    id: 'unverified-modular-street-seating',
    runtimePath: '/assets/genesis-hf-v2/models/modular_street_seating/modular_street_seating.gltf',
    format: 'glTF',
    status: 'UNVERIFIED',
    sourceName: 'Unknown',
    sourceUrl: null,
    license: null,
    licenseUrl: null,
    author: null,
    polygonCount: null,
    textureResolution: '1K local files',
    rationale: 'Lokalny glTF zawiera wyłącznie metadane Blender generator; brak źródła, autora i licencji.',
    sha256: {},
  },
  {
    id: 'unverified-covered-car',
    runtimePath: '/assets/genesis-hf-v2/models/covered_car/covered_car.gltf',
    format: 'glTF',
    status: 'UNVERIFIED',
    sourceName: 'Unknown',
    sourceUrl: null,
    license: null,
    licenseUrl: null,
    author: null,
    polygonCount: null,
    textureResolution: '1K local files',
    rationale: 'Lokalny glTF zawiera wyłącznie metadane Blender generator; brak źródła, autora i licencji.',
    sha256: {},
  },
  {
    id: 'unverified-fire-hydrant',
    runtimePath: '/assets/genesis-hf-v2/models/fire_hydrant/fire_hydrant.gltf',
    format: 'glTF',
    status: 'UNVERIFIED',
    sourceName: 'Unknown',
    sourceUrl: null,
    license: null,
    licenseUrl: null,
    author: null,
    polygonCount: null,
    textureResolution: '1K local files',
    rationale: 'Lokalny glTF zawiera wyłącznie metadane Blender generator; brak źródła, autora i licencji.',
    sha256: {},
  },
  {
    // D-131: promowany z UNVERIFIED po weryfikacji. Poprzedni rekord twierdził „brak lokalnego rekordu źródła
    // i licencji"; rekord jednak istniał — w `public/assets/genesis-hf/ASSETS.md` obok samego pliku. Weryfikacja
    // przeprowadzona 2026-09-19: (1) obie sumy SHA-256 policzone z plików w repo zgadzają się co do znaku z ASSETS.md;
    // (2) README źródła pobrane i zacytowane: „Example avatar »mpfb.glb« was created using Blender and MPFB Blender
    // extension. The avatar is licensed under CC0." MPFB opisany tam jako korzystający z ekosystemu MakeHuman (CC0/CC-BY).
    // To jest licencjonowany asset 3D — NIE jest to medyczny model anatomiczny i nie wolno go tak przedstawiać.
    id: 'cc0-mpfb-human-lod0',
    runtimePath: '/assets/genesis-hf/characters/mpfb-lod0.glb',
    format: 'GLB',
    status: 'APPROVED',
    sourceName: 'met4citizen/TalkingHead — avatars/mpfb.glb (wariant runtime LOD0)',
    sourceUrl: 'https://github.com/met4citizen/TalkingHead/blob/main/avatars/mpfb.glb',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/public-domain/cc0/',
    author: 'met4citizen (utworzony w Blender + MPFB, zasoby ekosystemu MakeHuman)',
    polygonCount: null,
    textureResolution: '1024 px WebP (lokalny wariant runtime: zmniejszenie tekstur, transkodowanie WebP, prune)',
    rationale: 'Źródło i licencja CC0 wg README źródła (cytat w komentarzu powyżej) — to DEKLARACJA autora upstream, zweryfikowana co do istnienia i treści, nie niezależny audyt prawny; obie sumy SHA-256 przeliczone lokalnie i zgodne z ASSETS.md (tożsamość pliku jest dowodem, licencja pozostaje oświadczeniem). Asset wyłącznie graficzny: zewnętrzna postać ludzka (skóra, ubranie, włosy, szkielet animacji, blendshapes twarzy). Nie zawiera anatomii medycznej.',
    sha256: {
      'mpfb-lod0.glb': 'ec47cffd0a56d201869afb9c10ea957e237c55d4e12c197fc9d9c30d5772a8d2',
      'mpfb.glb': '63c645a2a863b9972e9a9c2ed576a1de4c390b8475508e1473e69c87a3ee299c',
    },
  },
  bodyParts3dPilotRecord('heart', 'desktop', 'a0d821c969ce58344f0f04f7a6d6286f5662b06691296d520779d82bddfc46b1', 102802),
  bodyParts3dPilotRecord('heart', 'mobile', 'd4bf3a8b6e8b9e57fa3f619b44e6144dd7626c5435c570d3590f002588d38538', 25698),
  bodyParts3dPilotRecord('liver', 'desktop', '5b2952d97aca92997b2e873e7c402c9a02ddcb5624701652b5239d5dae40fe2c', 191622),
  bodyParts3dPilotRecord('liver', 'mobile', '8782d076896db4246db6fbafc097b2cfab6149d0657e26ef907bac9f700ee30b', 47900),
  bodyParts3dPilotRecord('left-lung', 'desktop', '4af4d8194d76755d28050d9464aeab10c5842007d5059283ea18521442a8433d', 41438),
  bodyParts3dPilotRecord('left-lung', 'mobile', '59db6d67adc302b63e44c6bf0d456d013f46ac4e7fcce9c6eecb19ee84068e18', 10358),
  bodyParts3dPilotRecord('right-lung', 'desktop', 'e22e566b9d5a522cadf532bca0ed471ab23b6d101deb840bbbcf712d4b544b54', 73312),
  bodyParts3dPilotRecord('right-lung', 'mobile', 'db50c12491624590cd9bfd01fedf045c9f8821f7ddbf64e7d168c73fb72b5003', 18328),
  bodyParts3dPilotRecord('aorta', 'desktop', 'c665a6af22f1026fd30f058b37fa458f14539dd670ac9ba76863544570a92acf', 10188),
  bodyParts3dPilotRecord('aorta', 'mobile', 'b0eb7a32090c409907d39ba9d83d87f46abd2959d217a3670d19d420457ba548', 2546),
  {
    id: 'unverified-pbr-textures',
    runtimePath: '/assets/genesis-hf/pbr/',
    format: 'PBR_TEXTURE_SET',
    status: 'UNVERIFIED',
    sourceName: 'Unknown',
    sourceUrl: null,
    license: null,
    licenseUrl: null,
    author: null,
    polygonCount: null,
    textureResolution: 'local JPG files',
    rationale: 'Brak lokalnego rekordu źródła i licencji dla PBR texture sets.',
    sha256: {},
  },
]);

const byRuntimePath = new Map(WORLD_ENGINE_ASSET_MANIFEST.map((asset) => [asset.runtimePath, asset] as const));

export function getWorldAssetRecord(runtimePath: string): WorldAssetRecord | null {
  return byRuntimePath.get(runtimePath) ?? null;
}

/** Nieznany path ma status niedopuszczony; loader nie zgaduje licencji. */
export function isWorldAssetApproved(runtimePath: string): boolean {
  return getWorldAssetRecord(runtimePath)?.status === 'APPROVED';
}

/** Umożliwia sprawdzenie katalogu texture set bez wpisu dla każdego pliku pochodnego. */
export function isWorldAssetPathApproved(runtimePath: string): boolean {
  const direct = getWorldAssetRecord(runtimePath);
  if (direct) return direct.status === 'APPROVED';
  const folder = WORLD_ENGINE_ASSET_MANIFEST.find((asset) => asset.format === 'PBR_TEXTURE_SET' && runtimePath.startsWith(asset.runtimePath));
  return folder?.status === 'APPROVED';
}

export function approvedWorldAssetCount(): number {
  return WORLD_ENGINE_ASSET_MANIFEST.filter((asset) => asset.status === 'APPROVED').length;
}

export function unverifiedWorldAssetCount(): number {
  return WORLD_ENGINE_ASSET_MANIFEST.filter((asset) => asset.status === 'UNVERIFIED').length;
}

/**
 * Każdy APPROVED musi nieść komplet prowenancji: źródło, licencję ORAZ policzone
 * skróty plików. Bez tego „APPROVED" byłoby deklaracją, a nie dowodem — a to
 * jest dokładnie ten rodzaj skrótu, którego w tym projekcie nie robimy.
 */
export function approvedAssetsMissingProvenance(): readonly WorldAssetRecord[] {
  return WORLD_ENGINE_ASSET_MANIFEST.filter(
    (asset) =>
      asset.status === 'APPROVED' &&
      (asset.sourceUrl === null || asset.license === null || Object.keys(asset.sha256).length === 0),
  );
}

/** Skrót konkretnego pliku assetu; null, gdy nie został policzony. */
export function assetFileChecksum(runtimePath: string, fileName: string): string | null {
  const folder = WORLD_ENGINE_ASSET_MANIFEST.find(
    (asset) => asset.runtimePath === runtimePath || runtimePath.startsWith(asset.runtimePath),
  );
  return folder?.sha256[fileName] ?? null;
}

/* ============================================================================
 * PREMIUM ASSET ACCEPTANCE GATE
 *
 * A second, fail-closed classification layer over the SAME provenance
 * vocabulary the manifest above already uses (source, license, sha256) — not
 * a second manifest or registry. It exists to pre-screen a CANDIDATE asset
 * (typically a paid/licensed anatomical or premium environment asset under
 * consideration, not yet purchased or added to WORLD_ENGINE_ASSET_MANIFEST)
 * before any purchase or integration decision is made. Nothing here writes
 * to, reads from, or duplicates WORLD_ENGINE_ASSET_MANIFEST; a candidate
 * that comes back APPROVED still has to be added to the manifest above
 * exactly like any other asset once actually acquired.
 *
 * Every unresolved (null/'UNKNOWN') input field is treated as a failure to
 * classify, never as an implicit pass — "unknown values must never pass" is
 * enforced structurally: only an EXPLICITLY good value at every checked
 * field can reach APPROVED.
 * ============================================================================
 */

export type PremiumAssetAcceptanceDecision =
  | 'APPROVED'
  | 'REJECTED'
  | 'LEGAL_REVIEW_REQUIRED'
  | 'OPTIMIZATION_REQUIRED'
  | 'SCIENTIFIC_PROVENANCE_REQUIRED';

/** Whether AI-related restrictions apply. 'UNKNOWN' means the license text does not say clearly either way — never treated as 'NONE'. */
export type PremiumAssetAiRestriction = 'NONE' | 'RESTRICTED' | 'UNKNOWN';

/** Tri-state commercial redistribution permission. 'UNKNOWN' is distinct from `false`: an explicit denial is a REJECTED-tier fact, an unclear one is a LEGAL_REVIEW_REQUIRED-tier fact. */
export type PremiumAssetRedistributionPermission = true | false | 'UNKNOWN';

export interface PremiumAssetLicenseInfo {
  readonly name: string | null;
  readonly url: string | null;
  readonly requiresAttribution: boolean;
  readonly permitsCommercialRedistribution: PremiumAssetRedistributionPermission;
  readonly aiRestriction: PremiumAssetAiRestriction;
}

export interface PremiumAssetProvenance {
  readonly sourceName: string | null;
  readonly sourceUrl: string | null;
  /** Per-file SHA-256, same shape as `WorldAssetRecord.sha256`. Must be non-empty, real 64-hex digests. */
  readonly sha256: Readonly<Record<string, string>>;
  /** Pinned/content-addressed/versioned source, never a mutable "latest" link that can change under us. */
  readonly immutableSource: boolean;
}

/** Anatomy-specific structural checks. Only evaluated when `assetClass === 'ANATOMICAL'`. */
export interface PremiumAssetAnatomy {
  readonly separateMeshes: boolean;
  /** Stable, non-empty per-organ mesh identifiers, required whenever `separateMeshes` is true — organ picking has nothing stable to target otherwise. */
  readonly stableMeshIds: readonly string[];
  readonly supportsOrganPicking: boolean;
  readonly supportsIsolation: boolean;
  readonly supportsCrossSection: boolean;
}

export interface PremiumAssetPerformanceBudget {
  readonly polygonCount: number | null;
  readonly maxPolygonBudget: number;
  readonly textureResolutionPx: number | null;
  readonly maxTextureResolutionPx: number;
  readonly hasLod: boolean;
  readonly lodLevels: number | null;
  readonly ktx2Ready: boolean;
  readonly meshoptReady: boolean;
  readonly dracoReady: boolean;
  /** A real-time WebGL/WebGPU delivery judgement, caller-declared (this gate never re-derives it from the numbers above — it only checks the numbers against budgets and takes this flag as a separate, explicit fact). */
  readonly realTimeWebSuitable: boolean;
}

/** Required only for `assetClass === 'ANATOMICAL'` — anatomical accuracy needs its own evidence trail, separate from ordinary source/license provenance. */
export interface PremiumAssetScientificProvenance {
  readonly datasetOrReference: string | null;
  readonly reviewedBy: string | null;
  readonly citationUrl: string | null;
}

export interface PremiumAssetCandidate {
  readonly id: string;
  readonly assetClass: 'ANATOMICAL' | 'ENVIRONMENT_OR_PROP';
  readonly license: PremiumAssetLicenseInfo;
  readonly provenance: PremiumAssetProvenance;
  readonly anatomy: PremiumAssetAnatomy;
  readonly performance: PremiumAssetPerformanceBudget;
  readonly scientificProvenance: PremiumAssetScientificProvenance;
}

export interface PremiumAssetAcceptanceResult {
  readonly candidateId: string;
  readonly decision: PremiumAssetAcceptanceDecision;
  /** Never empty — every decision, including APPROVED, carries at least one concrete reason. */
  readonly reasons: readonly string[];
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

function hasValidProvenance(p: PremiumAssetProvenance): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (p.sourceUrl === null || p.sourceUrl.trim() === '') reasons.push('No source URL recorded.');
  if (!p.immutableSource) reasons.push('Source is not pinned/content-addressed/versioned — a mutable link can change under us.');
  const digests = Object.values(p.sha256);
  if (digests.length === 0) reasons.push('No SHA-256 checksums recorded for any file.');
  else if (digests.some((d) => !SHA256_HEX.test(d))) reasons.push('One or more recorded checksums are not real 64-hex SHA-256 digests.');
  return { ok: reasons.length === 0, reasons };
}

function redistributionReasons(license: PremiumAssetLicenseInfo): string[] {
  return license.permitsCommercialRedistribution === false ? ['License explicitly forbids commercial redistribution.'] : [];
}

function aiRestrictionRejectedReasons(license: PremiumAssetLicenseInfo): string[] {
  return license.aiRestriction === 'RESTRICTED' ? ['License explicitly restricts AI-related use.'] : [];
}

function anatomyInseparableReasons(anatomy: PremiumAssetAnatomy): string[] {
  const reasons: string[] = [];
  if (!anatomy.separateMeshes) reasons.push('Anatomy is not modeled as separate meshes — organ picking/isolation/cross-section cannot target individual structures.');
  else if (anatomy.stableMeshIds.length === 0) reasons.push('Separate meshes are declared but carry no stable per-organ IDs.');
  if (!anatomy.supportsOrganPicking) reasons.push('Does not support organ picking.');
  if (!anatomy.supportsIsolation) reasons.push('Does not support organ isolation.');
  if (!anatomy.supportsCrossSection) reasons.push('Does not support cross-section.');
  return reasons;
}

function legalReviewReasons(license: PremiumAssetLicenseInfo): string[] {
  const reasons: string[] = [];
  if (license.name === null || license.name.trim() === '') reasons.push('No license name recorded.');
  if (license.url === null || license.url.trim() === '') reasons.push('No license URL recorded.');
  if (license.permitsCommercialRedistribution === 'UNKNOWN') reasons.push('Commercial redistribution permission is not clearly stated.');
  if (license.aiRestriction === 'UNKNOWN') reasons.push('AI-related restriction language is unclear.');
  if (license.requiresAttribution) reasons.push('License requires attribution — needs human confirmation the attribution flow is implemented before approval.');
  return reasons;
}

function optimizationReasons(perf: PremiumAssetPerformanceBudget): string[] {
  const reasons: string[] = [];
  if (perf.polygonCount === null) reasons.push('Polygon count not recorded.');
  else if (perf.polygonCount > perf.maxPolygonBudget) reasons.push(`Polygon count ${perf.polygonCount} exceeds budget ${perf.maxPolygonBudget}.`);
  if (perf.textureResolutionPx === null) reasons.push('Texture resolution not recorded.');
  else if (perf.textureResolutionPx > perf.maxTextureResolutionPx) reasons.push(`Texture resolution ${perf.textureResolutionPx}px exceeds budget ${perf.maxTextureResolutionPx}px.`);
  if (!perf.hasLod || perf.lodLevels === null || perf.lodLevels < 1) reasons.push('No usable LOD chain.');
  if (!perf.ktx2Ready) reasons.push('Not KTX2-ready.');
  if (!perf.meshoptReady && !perf.dracoReady) reasons.push('Neither Meshopt nor Draco compression is ready.');
  if (!perf.realTimeWebSuitable) reasons.push('Not declared real-time-web-suitable.');
  return reasons;
}

function scientificProvenanceReasons(sp: PremiumAssetScientificProvenance): string[] {
  const reasons: string[] = [];
  if (sp.datasetOrReference === null || sp.datasetOrReference.trim() === '') reasons.push('No anatomical dataset/reference recorded.');
  if (sp.citationUrl === null || sp.citationUrl.trim() === '') reasons.push('No citation URL recorded.');
  return reasons;
}

/**
 * Fail-closed premium asset acceptance gate. Priority order (most severe first):
 *   1. REJECTED — broken provenance, an EXPLICIT redistribution/AI denial, or (for anatomical
 *      candidates) structurally inseparable anatomy. These are known facts, not ambiguity — no
 *      amount of review or optimization fixes them; a different asset is needed.
 *   2. LEGAL_REVIEW_REQUIRED — an UNCLEAR/ambiguous legal fact (missing license name/url, unknown
 *      redistribution or AI-restriction status, or attribution required). A human must resolve
 *      the ambiguity; this is never auto-approved and never auto-rejected.
 *   3. OPTIMIZATION_REQUIRED — legally and structurally fine, but exceeds polygon/texture budgets,
 *      lacks LOD, or lacks KTX2/Meshopt/Draco readiness / real-time-web suitability.
 *   4. SCIENTIFIC_PROVENANCE_REQUIRED — anatomical candidates only: no recorded dataset/reference
 *      or citation backing the anatomical accuracy claim.
 *   5. APPROVED — only when every checked field is an explicit, unambiguous pass.
 * Never creates or touches WORLD_ENGINE_ASSET_MANIFEST — this is a pre-purchase/pre-integration
 * screen, not a second registry.
 */
export function evaluatePremiumAssetAcceptance(candidate: PremiumAssetCandidate): PremiumAssetAcceptanceResult {
  const isAnatomical = candidate.assetClass === 'ANATOMICAL';

  const provenance = hasValidProvenance(candidate.provenance);
  const rejectedReasons = [
    ...provenance.reasons,
    ...redistributionReasons(candidate.license),
    ...aiRestrictionRejectedReasons(candidate.license),
    ...(isAnatomical ? anatomyInseparableReasons(candidate.anatomy) : []),
  ];
  if (rejectedReasons.length > 0) {
    return { candidateId: candidate.id, decision: 'REJECTED', reasons: rejectedReasons };
  }

  const legalReasons = legalReviewReasons(candidate.license);
  if (legalReasons.length > 0) {
    return { candidateId: candidate.id, decision: 'LEGAL_REVIEW_REQUIRED', reasons: legalReasons };
  }

  const perfReasons = optimizationReasons(candidate.performance);
  if (perfReasons.length > 0) {
    return { candidateId: candidate.id, decision: 'OPTIMIZATION_REQUIRED', reasons: perfReasons };
  }

  if (isAnatomical) {
    const sciReasons = scientificProvenanceReasons(candidate.scientificProvenance);
    if (sciReasons.length > 0) {
      return { candidateId: candidate.id, decision: 'SCIENTIFIC_PROVENANCE_REQUIRED', reasons: sciReasons };
    }
  }

  return {
    candidateId: candidate.id,
    decision: 'APPROVED',
    reasons: ['Provenance, license, redistribution/AI terms, performance budget and (if anatomical) scientific provenance all pass explicitly.'],
  };
}
