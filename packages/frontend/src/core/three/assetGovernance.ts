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
}

/**
 * Jedyny manifest asset provenance dla World Engine.
 *
 * Nie zawiera World State ani danych naukowych. Służy wyłącznie do dopuszczenia
 * lokalnego pliku renderera po potwierdzeniu jego źródła i licencji. Wszystko,
 * co nie ma wpisu APPROVED, jest przez loader traktowane jako niedopuszczone.
 */
export const WORLD_ENGINE_ASSET_MANIFEST: readonly WorldAssetRecord[] = Object.freeze([
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
