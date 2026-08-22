import { canonicalJson, fnv1a } from '../events/hash';

/**
 * VIRTUAL CERN GEOMETRY MANIFEST
 *
 * This is a source registry, not a scene, CAD model, renderer, or World State.
 * Fidelity-first rule: a renderer may consume only assets with a verified file,
 * explicit licence, declared CRS and a geometry-appropriate fidelity status.
 * No current official asset satisfies all of those gates.
 */
export const VIRTUAL_CERN_GEOMETRY_MANIFEST_VERSION = '1.0.0';

export type VirtualCernAssetStatus =
  | 'TOPOLOGY_ONLY'
  | 'METRIC_ONLY'
  | 'POINT_ONLY'
  | 'REFERENCE_ONLY_PENDING_LICENSE'
  | 'SOURCE_KNOWN_ARTIFACT_UNAVAILABLE';

export type VirtualCernSpatialPrecision = 'NONE' | 'POINT_EPSG_4326' | 'NOT_GEOREFERENCED';

export interface VirtualCernSourceAsset {
  id: string;
  title: string;
  publisher: 'CERN' | 'ATLAS Experiment';
  sourceUrl: string;
  sourceStatus: VirtualCernAssetStatus;
  spatialPrecision: VirtualCernSpatialPrecision;
  /** Absent for sources which do not publish usable geometry. */
  coordinates?: readonly [longitude: number, latitude: number];
  /** Source fact allowed for provenance/explanation; never a renderer instruction. */
  verifiedFacts: readonly string[];
  rights: string;
  rendererEligibility: 'NOT_ELIGIBLE';
  limitation: string;
}

/**
 * All entries are citations or scalar/topological facts. `rendererEligibility`
 * deliberately remains `NOT_ELIGIBLE` until a hashed, licensed and
 * georeferenced geometry asset is admitted through an audited importer.
 */
export const VIRTUAL_CERN_SOURCE_ASSETS: readonly VirtualCernSourceAsset[] = [
  {
    id: 'cern-accelerator-chain-topology',
    title: 'CERN accelerator complex',
    publisher: 'CERN',
    sourceUrl: 'https://home.cern/science/accelerators/the-accelerator-complex/',
    sourceStatus: 'TOPOLOGY_ONLY',
    spatialPrecision: 'NONE',
    verifiedFacts: [
      'Proton chain: Linac4 → PSB → PS → SPS → LHC.',
      'The complex also serves non-LHC areas and experiments.',
      'This source does not publish a georeferenced or CAD geometry artifact.',
    ],
    rights: 'Public informational page; no 3D geometry asset acquired or licensed for rendering.',
    rendererEligibility: 'NOT_ELIGIBLE',
    limitation: 'Topological order is not coordinates, tunnel alignment, hall dimensions or a 1:1 spatial model.',
  },
  {
    id: 'cern-lhc-dimensional-metrics',
    title: 'The Large Hadron Collider',
    publisher: 'CERN',
    sourceUrl: 'https://home.cern/science/accelerators/large-hadron-collider/',
    sourceStatus: 'METRIC_ONLY',
    spatialPrecision: 'NONE',
    verifiedFacts: [
      'LHC circumference: 26 659 m.',
      'LHC tunnel depth: approximately 100 m.',
      'Four main collision locations correspond to ATLAS, CMS, ALICE and LHCb.',
    ],
    rights: 'Public informational page; metrics are citable facts, not an approved geometry asset.',
    rendererEligibility: 'NOT_ELIGIBLE',
    limitation: 'Scalar dimensions cannot establish a 1:1 ring path, detector-cavern placement, elevation profile or infrastructure layout.',
  },
  {
    id: 'cern-visitor-reception-coordinate',
    title: 'CERN visitor reception',
    publisher: 'CERN',
    sourceUrl: 'https://home.cern/directions/',
    sourceStatus: 'POINT_ONLY',
    spatialPrecision: 'POINT_EPSG_4326',
    coordinates: [6.055692, 46.233058],
    verifiedFacts: [
      'CERN visitor reception coordinate: longitude 6.055692, latitude 46.233058.',
      'CERN has main sites in France and Switzerland.',
    ],
    rights: 'Public directions page; point retained only as a cited reference coordinate.',
    rendererEligibility: 'NOT_ELIGIBLE',
    limitation: 'Reception coordinate is not a tunnel, accelerator, building footprint, site boundary or georeferenced complex model.',
  },
  {
    id: 'cern-accelerator-layout-2022',
    title: 'The CERN accelerator complex, layout in 2022',
    publisher: 'CERN',
    sourceUrl: 'https://cds.cern.ch/record/2800984',
    sourceStatus: 'REFERENCE_ONLY_PENDING_LICENSE',
    spatialPrecision: 'NOT_GEOREFERENCED',
    verifiedFacts: [
      'Official CERN outreach graphic identifies the accelerator complex layout in January 2022.',
      'The graphic is a useful source reference for accelerator topology verification.',
      'No original graphic file is acquired by this manifest.',
    ],
    rights: 'CERN Copyright; no open geometry or renderer licence established by this manifest.',
    rendererEligibility: 'NOT_ELIGIBLE',
    limitation: 'Outreach graphic is not CAD/BIM, lacks declared georeference/engineering precision, and must not be converted into a render asset without rights clearance.',
  },
  {
    id: 'cern-accelerator-layout-2026',
    title: 'The CERN accelerator complex layout in 2026',
    publisher: 'CERN',
    sourceUrl: 'https://cds.cern.ch/record/2953421',
    sourceStatus: 'SOURCE_KNOWN_ARTIFACT_UNAVAILABLE',
    spatialPrecision: 'NOT_GEOREFERENCED',
    verifiedFacts: [
      'Official CERN Document Server record exists for a 2026 accelerator complex layout.',
      'Automated access in this environment returned the publisher protection page instead of source metadata or a downloadable artifact.',
    ],
    rights: 'Unknown for integration; no file acquired and no usage right inferred.',
    rendererEligibility: 'NOT_ELIGIBLE',
    limitation: 'Known reference only. It is not a verified file, hash, licence grant or geometry input.',
  },
  {
    id: 'atlas-schematics-public-page',
    title: 'ATLAS Schematics',
    publisher: 'ATLAS Experiment',
    sourceUrl: 'https://atlas.cern/Resources/Schematics',
    sourceStatus: 'REFERENCE_ONLY_PENDING_LICENSE',
    spatialPrecision: 'NOT_GEOREFERENCED',
    verifiedFacts: [
      'ATLAS publishes detector schematics and links to official CERN records.',
      'The page states downloads are for personal and educational use.',
    ],
    rights: 'ATLAS Experiment © CERN; personal/educational download only per source page.',
    rendererEligibility: 'NOT_ELIGIBLE',
    limitation: 'No commercial or renderer asset use is admitted without a separate rights clearance and a geometry-specific source artifact.',
  },
] as const;

export interface VirtualCernGeometryManifest {
  contractVersion: string;
  manifestId: string;
  fidelityPolicy: 'OFFICIAL_SOURCE_FIRST_NO_SYNTHETIC_GEOMETRY';
  assets: readonly VirtualCernSourceAsset[];
  approvedGeometryAssetCount: number;
  rendererIntegration: 'BLOCKED_NO_APPROVED_GEOMETRY';
  limitation: string;
}

const manifestSeed = {
  contractVersion: VIRTUAL_CERN_GEOMETRY_MANIFEST_VERSION,
  fidelityPolicy: 'OFFICIAL_SOURCE_FIRST_NO_SYNTHETIC_GEOMETRY',
  assets: VIRTUAL_CERN_SOURCE_ASSETS,
};

export const VIRTUAL_CERN_GEOMETRY_MANIFEST: VirtualCernGeometryManifest = Object.freeze({
  contractVersion: VIRTUAL_CERN_GEOMETRY_MANIFEST_VERSION,
  manifestId: `virtual_cern_geometry_${fnv1a(canonicalJson(manifestSeed))}`,
  fidelityPolicy: 'OFFICIAL_SOURCE_FIRST_NO_SYNTHETIC_GEOMETRY',
  assets: VIRTUAL_CERN_SOURCE_ASSETS,
  approvedGeometryAssetCount: 0,
  rendererIntegration: 'BLOCKED_NO_APPROVED_GEOMETRY',
  limitation: 'No source currently combines a verified original geometry file, explicit renderer-compatible licence, declared CRS and adequate engineering fidelity. Genesis must not fabricate the missing geometry.',
});

export function canRenderVirtualCernOneToOne(
  manifest: VirtualCernGeometryManifest = VIRTUAL_CERN_GEOMETRY_MANIFEST,
): boolean {
  return manifest.approvedGeometryAssetCount > 0 && manifest.rendererIntegration !== 'BLOCKED_NO_APPROVED_GEOMETRY';
}
