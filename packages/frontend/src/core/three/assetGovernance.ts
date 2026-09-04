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
    id: 'unverified-lod0-human',
    runtimePath: '/assets/genesis-hf/characters/mpfb-lod0.glb',
    format: 'GLB',
    status: 'UNVERIFIED',
    sourceName: 'Unknown',
    sourceUrl: null,
    license: null,
    licenseUrl: null,
    author: null,
    polygonCount: null,
    textureResolution: null,
    rationale: 'Brak lokalnego rekordu źródła i licencji dla hero GLB; asset nie może być domyślnie ładowany produkcyjnie.',
    sha256: {},
  },
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
