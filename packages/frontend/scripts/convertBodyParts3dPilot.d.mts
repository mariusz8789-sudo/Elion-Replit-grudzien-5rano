/** Types for the Node-only BodyParts3D pilot converter (scripts/convertBodyParts3dPilot.mjs), used by its test. */
export const CONVERTER_VERSION: string;
export const PILOT_ZIP_SHA256: string;
export const OFFICIAL_ARCHIVE_SHA256: string;
export const MESHOPTIMIZER_VERSION: string;
export const LUNG_PAIR_TARGET_M: readonly [number, number, number];
export const MOBILE_LOD: Readonly<{ targetTriangleRatio: number; maxRelativeError: number }>;
export const PILOT_STRUCTURES: readonly { key: string; genesisId: string }[];

export interface OfficialMapping {
  key: string; genesisId: string; fmaId: string; representationId: string; name: string; elementFileIds: string[];
}
export function verifyOfficialMapping(manifest: unknown, partsListText: string, elementPartsText: string): OfficialMapping[];
export function parseBodyPartsObj(content: string, expectedFileId: string): {
  fileId: string; representationId: string | null; conceptId: string | null; positions: number[]; normals: number[]; faces: number[];
};
export function convertBodyParts3dPilot(
  zipBytes: Uint8Array,
  deps: {
    unzipSync: (data: Uint8Array) => Record<string, Uint8Array>;
    MeshoptSimplifier: unknown;
    meshoptVersion: string;
  },
): Promise<{ outputs: Record<string, Uint8Array>; provenance: Record<string, unknown>; mapping: OfficialMapping[]; zipSha: string }>;
