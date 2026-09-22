import type { AnatomyNode, HumanBodyParameters, HumanDigitalTwinManifest, OrganSystemId } from './types';
import { stableHash } from './hash';

const P = (x: number, y: number, z: number) => ({ x, y, z });
const D = (x: number, y: number, z: number) => ({ x, y, z });
export const ANATOMY_ATLAS_VERSION = 'GENESIS-ANATOMY-0.2' as const;

export type CanonicalAnatomyLayerId =
  | 'layer:skin' | 'layer:muscles' | 'layer:skeleton'
  | 'layer:vessels' | 'layer:nerves' | 'layer:organs';

export interface CanonicalAnatomyLayerDefinition {
  readonly id: CanonicalAnatomyLayerId;
  readonly label: string;
  readonly system?: OrganSystemId;
  readonly assetSlot: string;
  readonly visibleByDefault: boolean;
  readonly pickable: true;
  readonly isolatable: true;
  readonly crossSectionCompatible: true;
  readonly hyperscopeTarget: 'TISSUE' | 'CELL' | 'SUBCELLULAR' | 'NONE';
  readonly lodAssetSlots: Readonly<{ full: string; medium: string; low: string }>;
  /** External geometry stays blocked until the one asset-governance registry approves its runtime path. */
  readonly assetGovernance: 'REQUIRES_APPROVED_ASSET_OR_PROCEDURAL_FALLBACK';
}

/**
 * Stable semantic shell for future licensed anatomical meshes. These IDs are
 * canonical even while the renderer uses honest procedural fallbacks, so an
 * approved asset can replace geometry without changing picking/isolation IDs.
 */
export const CANONICAL_ANATOMY_LAYER_SHELL: readonly CanonicalAnatomyLayerDefinition[] = Object.freeze([
  { id: 'layer:skin', label: 'Skin', system: 'INTEGUMENTARY', assetSlot: 'human.layer.skin.high_fidelity.glb', visibleByDefault: true, pickable: true, isolatable: true, crossSectionCompatible: true, hyperscopeTarget: 'TISSUE', lodAssetSlots: { full: 'human.layer.skin.high_fidelity.glb', medium: 'human.layer.skin.medium.glb', low: 'human.layer.skin.proxy' }, assetGovernance: 'REQUIRES_APPROVED_ASSET_OR_PROCEDURAL_FALLBACK' },
  { id: 'layer:muscles', label: 'Muscles', system: 'MUSCULAR', assetSlot: 'human.layer.muscles.high_fidelity.glb', visibleByDefault: false, pickable: true, isolatable: true, crossSectionCompatible: true, hyperscopeTarget: 'TISSUE', lodAssetSlots: { full: 'human.layer.muscles.high_fidelity.glb', medium: 'human.layer.muscles.medium.glb', low: 'human.layer.muscles.proxy' }, assetGovernance: 'REQUIRES_APPROVED_ASSET_OR_PROCEDURAL_FALLBACK' },
  { id: 'layer:skeleton', label: 'Skeleton', system: 'SKELETAL', assetSlot: 'human.layer.skeleton.high_fidelity.glb', visibleByDefault: false, pickable: true, isolatable: true, crossSectionCompatible: true, hyperscopeTarget: 'TISSUE', lodAssetSlots: { full: 'human.layer.skeleton.high_fidelity.glb', medium: 'human.layer.skeleton.medium.glb', low: 'human.layer.skeleton.proxy' }, assetGovernance: 'REQUIRES_APPROVED_ASSET_OR_PROCEDURAL_FALLBACK' },
  { id: 'layer:vessels', label: 'Vessels', system: 'CARDIOVASCULAR', assetSlot: 'human.layer.vessels.high_fidelity.glb', visibleByDefault: false, pickable: true, isolatable: true, crossSectionCompatible: true, hyperscopeTarget: 'TISSUE', lodAssetSlots: { full: 'human.layer.vessels.high_fidelity.glb', medium: 'human.layer.vessels.medium.glb', low: 'human.layer.vessels.proxy' }, assetGovernance: 'REQUIRES_APPROVED_ASSET_OR_PROCEDURAL_FALLBACK' },
  { id: 'layer:nerves', label: 'Nerves', system: 'NERVOUS', assetSlot: 'human.layer.nerves.high_fidelity.glb', visibleByDefault: false, pickable: true, isolatable: true, crossSectionCompatible: true, hyperscopeTarget: 'SUBCELLULAR', lodAssetSlots: { full: 'human.layer.nerves.high_fidelity.glb', medium: 'human.layer.nerves.medium.glb', low: 'human.layer.nerves.proxy' }, assetGovernance: 'REQUIRES_APPROVED_ASSET_OR_PROCEDURAL_FALLBACK' },
  { id: 'layer:organs', label: 'Internal organs', assetSlot: 'human.layer.organs.high_fidelity.bundle', visibleByDefault: false, pickable: true, isolatable: true, crossSectionCompatible: true, hyperscopeTarget: 'CELL', lodAssetSlots: { full: 'human.layer.organs.high_fidelity.bundle', medium: 'human.layer.organs.medium.bundle', low: 'human.layer.organs.proxy' }, assetGovernance: 'REQUIRES_APPROVED_ASSET_OR_PROCEDURAL_FALLBACK' },
]);

const SYSTEMS: readonly { id: OrganSystemId; label: string }[] = [
  { id: 'INTEGUMENTARY', label: 'Integumentary System' },
  { id: 'SKELETAL', label: 'Skeletal System' },
  { id: 'MUSCULAR', label: 'Muscular System' },
  { id: 'NERVOUS', label: 'Nervous System' },
  { id: 'ENDOCRINE', label: 'Endocrine System' },
  { id: 'CARDIOVASCULAR', label: 'Cardiovascular System' },
  { id: 'LYMPHATIC', label: 'Lymphatic System' },
  { id: 'RESPIRATORY', label: 'Respiratory System' },
  { id: 'DIGESTIVE', label: 'Digestive System' },
  { id: 'URINARY', label: 'Urinary System' },
  { id: 'REPRODUCTIVE', label: 'Reproductive System' },
  { id: 'IMMUNE', label: 'Immune System' },
] as const;

function node(args: Omit<AnatomyNode, 'children' | 'representation'>): AnatomyNode {
  return { ...args, children: [], representation: {
    provenance: { source: ANATOMY_ATLAS_VERSION, description: 'Procedural canonical atlas in humanLab/anatomyAtlas.ts; illustrative dimensions, not a measured subject or imported scan.' },
    confidence: { status: 'UNKNOWN', reason: 'No calibrated confidence in this procedural representation has been supplied.' },
    resolution: { status: 'UNSPECIFIED', reason: 'No source acquisition resolution; geometry and display scale are not scientific resolution.' },
  } };
}

export function defaultHumanParameters(): HumanBodyParameters {
  return {
    heightMeters: 1.78,
    massKg: 72,
    shoulderWidthMeters: 0.46,
    eyeHeightMeters: 1.67,
    handSpanMeters: 0.19,
    footLengthMeters: 0.27,
  };
}

export function createHumanDigitalTwinManifest(twinId = `HDT-${stableHash(Date.now())}`, parameters = defaultHumanParameters()): HumanDigitalTwinManifest {
  const root: AnatomyNode = node({ id: 'body', parentId: null, kind: 'BODY', label: 'Human Digital Twin', scaleMeters: parameters.heightMeters, positionMeters: P(0, parameters.heightMeters / 2, 0), dimensionsMeters: D(0.46, parameters.heightMeters, 0.28), assetSlot: 'human.body.high_fidelity.glb', visibleByDefault: true, epistemic: 'MODEL' });
  const regions = [
    node({ id: 'head', parentId: 'body', kind: 'REGION', label: 'Head', system: 'NERVOUS', scaleMeters: 0.23, positionMeters: P(0, 1.65, 0), dimensionsMeters: D(0.20, 0.25, 0.22), assetSlot: 'human.region.head.glb', visibleByDefault: true, epistemic: 'MODEL' }),
    node({ id: 'thorax', parentId: 'body', kind: 'REGION', label: 'Thorax', scaleMeters: 0.35, positionMeters: P(0, 1.23, 0), dimensionsMeters: D(0.40, 0.50, 0.24), assetSlot: 'human.region.thorax.glb', visibleByDefault: true, epistemic: 'MODEL' }),
    node({ id: 'abdomen', parentId: 'body', kind: 'REGION', label: 'Abdomen', scaleMeters: 0.28, positionMeters: P(0, 0.88, 0), dimensionsMeters: D(0.33, 0.45, 0.22), assetSlot: 'human.region.abdomen.glb', visibleByDefault: true, epistemic: 'MODEL' }),
    node({ id: 'pelvis', parentId: 'body', kind: 'REGION', label: 'Pelvis', scaleMeters: 0.20, positionMeters: P(0, 0.57, 0), dimensionsMeters: D(0.30, 0.24, 0.20), assetSlot: 'human.region.pelvis.glb', visibleByDefault: true, epistemic: 'MODEL' }),
  ];
  const organs: AnatomyNode[] = [
    node({ id: 'brain', parentId: 'head', kind: 'ORGAN', label: 'Brain', latinLabel: 'Encephalon', system: 'NERVOUS', scaleMeters: 0.18, positionMeters: P(0, 1.69, 0), dimensionsMeters: D(0.14, 0.18, 0.17), assetSlot: 'human.organ.brain.high_fidelity.glb', visibleByDefault: false, epistemic: 'MODEL' }),
    node({ id: 'heart', parentId: 'thorax', kind: 'ORGAN', label: 'Heart', latinLabel: 'Cor', system: 'CARDIOVASCULAR', scaleMeters: 0.11, positionMeters: P(-0.055, 1.20, 0.015), dimensionsMeters: D(0.11, 0.13, 0.09), assetSlot: 'human.organ.heart.high_fidelity.glb', visibleByDefault: false, epistemic: 'MODEL' }),
    node({ id: 'left-lung', parentId: 'thorax', kind: 'ORGAN', label: 'Left Lung', system: 'RESPIRATORY', scaleMeters: 0.18, positionMeters: P(-0.10, 1.26, 0), dimensionsMeters: D(0.15, 0.34, 0.13), assetSlot: 'human.organ.lung.left.high_fidelity.glb', visibleByDefault: false, epistemic: 'MODEL' }),
    node({ id: 'right-lung', parentId: 'thorax', kind: 'ORGAN', label: 'Right Lung', system: 'RESPIRATORY', scaleMeters: 0.18, positionMeters: P(0.10, 1.26, 0), dimensionsMeters: D(0.15, 0.34, 0.13), assetSlot: 'human.organ.lung.right.high_fidelity.glb', visibleByDefault: false, epistemic: 'MODEL' }),
    node({ id: 'liver', parentId: 'abdomen', kind: 'ORGAN', label: 'Liver', latinLabel: 'Hepar', system: 'DIGESTIVE', scaleMeters: 0.25, positionMeters: P(0.055, 1.03, 0), dimensionsMeters: D(0.27, 0.18, 0.17), assetSlot: 'human.organ.liver.high_fidelity.glb', visibleByDefault: false, epistemic: 'MODEL' }),
    node({ id: 'stomach', parentId: 'abdomen', kind: 'ORGAN', label: 'Stomach', system: 'DIGESTIVE', scaleMeters: 0.16, positionMeters: P(-0.06, 0.92, -0.01), dimensionsMeters: D(0.16, 0.18, 0.13), assetSlot: 'human.organ.stomach.high_fidelity.glb', visibleByDefault: false, epistemic: 'MODEL' }),
    node({ id: 'left-kidney', parentId: 'abdomen', kind: 'ORGAN', label: 'Left Kidney', system: 'URINARY', scaleMeters: 0.12, positionMeters: P(-0.10, 0.93, 0.02), dimensionsMeters: D(0.07, 0.13, 0.05), assetSlot: 'human.organ.kidney.left.high_fidelity.glb', visibleByDefault: false, epistemic: 'MODEL' }),
    node({ id: 'right-kidney', parentId: 'abdomen', kind: 'ORGAN', label: 'Right Kidney', system: 'URINARY', scaleMeters: 0.12, positionMeters: P(0.10, 0.93, 0.02), dimensionsMeters: D(0.07, 0.13, 0.05), assetSlot: 'human.organ.kidney.right.high_fidelity.glb', visibleByDefault: false, epistemic: 'MODEL' }),
    node({ id: 'pancreas', parentId: 'abdomen', kind: 'ORGAN', label: 'Pancreas', system: 'DIGESTIVE', scaleMeters: 0.14, positionMeters: P(0, 0.89, -0.03), dimensionsMeters: D(0.16, 0.05, 0.05), assetSlot: 'human.organ.pancreas.high_fidelity.glb', visibleByDefault: false, epistemic: 'MODEL' }),
    node({ id: 'small-intestine', parentId: 'abdomen', kind: 'ORGAN', label: 'Small Intestine', system: 'DIGESTIVE', scaleMeters: 0.20, positionMeters: P(0, 0.79, 0), dimensionsMeters: D(0.25, 0.22, 0.16), assetSlot: 'human.organ.intestine.small.high_fidelity.glb', visibleByDefault: false, epistemic: 'MODEL' }),
  ];
  const systemNodes = SYSTEMS.map((s) => node({ id: `system:${s.id.toLowerCase()}`, parentId: 'body', kind: 'SYSTEM', label: s.label, system: s.id, scaleMeters: parameters.heightMeters, positionMeters: P(0, parameters.heightMeters / 2, 0), dimensionsMeters: D(0.50, parameters.heightMeters, 0.30), assetSlot: `human.system.${s.id.toLowerCase()}.bundle`, visibleByDefault: false, epistemic: 'MODEL' }));
  const layerNodes = CANONICAL_ANATOMY_LAYER_SHELL.map((layer) => node({
    id: layer.id,
    parentId: 'body',
    kind: 'STRUCTURE',
    label: layer.label,
    ...(layer.system ? { system: layer.system } : {}),
    scaleMeters: parameters.heightMeters,
    positionMeters: P(0, parameters.heightMeters / 2, 0),
    dimensionsMeters: D(parameters.shoulderWidthMeters, parameters.heightMeters, 0.30),
    assetSlot: layer.assetSlot,
    visibleByDefault: layer.visibleByDefault,
    epistemic: 'MODEL',
  }));
  const nodes = [root, ...regions, ...systemNodes, ...layerNodes, ...organs];
  const childMap = new Map<string, string[]>();
  for (const n of nodes) childMap.set(n.id, []);
  for (const n of nodes) if (n.parentId) childMap.get(n.parentId)?.push(n.id);
  const finalized = nodes.map((n) => ({ ...n, children: [...(childMap.get(n.id) ?? [])].sort() }));
  return {
    twinId,
    scale: 'REAL_WORLD_1_TO_1',
    parameters,
    rootNodeId: 'body',
    anatomyVersion: ANATOMY_ATLAS_VERSION,
    nodes: finalized,
    relationships: organs.filter((organ) => organ.system).map((organ) => ({
      kind: 'SYSTEM_HAS_ORGAN', fromNodeId: `system:${organ.system!.toLowerCase()}`, toNodeId: organ.id,
      provenance: { source: ANATOMY_ATLAS_VERSION, description: `Declared primary system membership of ${organ.id} in the canonical atlas; not a claim of exhaustive biological membership.` },
    })),
    supportedSystems: SYSTEMS.map((s) => s.id),
    clinicalUse: 'NOT_A_MEDICAL_DEVICE',
    notes: [
      '1:1 means world-scale and parameterized anatomy dimensions; it is not a medical replica of a specific person.',
      'High-fidelity production assets are referenced by assetSlot and must be supplied/validated separately.',
      'Layer IDs are stable integration targets; external layer meshes remain blocked until assetGovernance approves their provenance, license and runtime file.',
      'Anatomical geometry is MODEL unless linked to a validated external dataset.',
    ],
  };
}

export function organsInSystem(manifest: HumanDigitalTwinManifest, systemNodeId: string): readonly AnatomyNode[] {
  const ids = new Set(manifest.relationships.filter((edge) => edge.kind === 'SYSTEM_HAS_ORGAN' && edge.fromNodeId === systemNodeId).map((edge) => edge.toNodeId));
  return manifest.nodes.filter((entry) => entry.kind === 'ORGAN' && ids.has(entry.id));
}

export function systemsForOrgan(manifest: HumanDigitalTwinManifest, organId: string): readonly AnatomyNode[] {
  const ids = new Set(manifest.relationships.filter((edge) => edge.kind === 'SYSTEM_HAS_ORGAN' && edge.toNodeId === organId).map((edge) => edge.fromNodeId));
  return manifest.nodes.filter((entry) => entry.kind === 'SYSTEM' && ids.has(entry.id));
}

export function getAnatomyNode(manifest: HumanDigitalTwinManifest, nodeId: string): AnatomyNode {
  const node = manifest.nodes.find((entry) => entry.id === nodeId);
  if (!node) throw new Error(`ANATOMY_NODE_NOT_FOUND:${nodeId}`);
  return node;
}

export function descendants(manifest: HumanDigitalTwinManifest, nodeId: string): readonly AnatomyNode[] {
  const root = getAnatomyNode(manifest, nodeId);
  const byId = new Map(manifest.nodes.map((n) => [n.id, n]));
  const result: AnatomyNode[] = [];
  const stack = [...root.children].reverse();
  while (stack.length) {
    const id = stack.pop()!;
    const child = byId.get(id);
    if (!child) continue;
    result.push(child);
    for (const c of [...child.children].reverse()) stack.push(c);
  }
  return result;
}
