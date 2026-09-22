import type * as THREE_NS from 'three';
import {
  CANONICAL_ANATOMY_LAYER_SHELL,
  type CanonicalAnatomyLayerDefinition,
  type CanonicalAnatomyLayerId,
} from '../scientificWorlds/humanLab/anatomyAtlas';
import type { HumanDigitalTwinManifest, MagnificationLevel } from '../scientificWorlds/humanLab/types';
import { getWorldAssetRecord } from './assetGovernance';

/** Presentation contract only. The existing Human Twin remains the sole renderer/owner. */
export type AnatomyLayerLod = 'FULL' | 'MEDIUM' | 'LOW';
export type AnatomySectionAxis = 'AXIAL' | 'CORONAL' | 'SAGITTAL';

export interface AnatomyLayerShellView {
  readonly visibleLayerIds?: readonly CanonicalAnatomyLayerId[];
  readonly hiddenLayerIds?: readonly CanonicalAnatomyLayerId[];
  readonly isolatedLayerId?: CanonicalAnatomyLayerId | null;
  readonly selectedLayerId?: CanonicalAnatomyLayerId | null;
  readonly lod?: AnatomyLayerLod;
  readonly crossSection?: Readonly<{ enabled: boolean; axis: AnatomySectionAxis; positionNormalized: number }>;
  readonly hyperscopeMagnification?: MagnificationLevel | null;
}

export interface AnatomyLayerPresentation {
  readonly id: CanonicalAnatomyLayerId;
  readonly nodeId: CanonicalAnatomyLayerId;
  readonly pickId: `anatomy:${CanonicalAnatomyLayerId}`;
  readonly label: string;
  readonly assetSlot: string;
  readonly visible: boolean;
  readonly selected: boolean;
  readonly isolated: boolean;
  readonly pickable: boolean;
  readonly opacity: number;
  readonly lod: AnatomyLayerLod;
  readonly crossSection: Readonly<{ enabled: boolean; axis: AnatomySectionAxis; positionNormalized: number }>;
  readonly hyperscope: Readonly<{
    compatible: boolean;
    requestedMagnification: MagnificationLevel | null;
    target: CanonicalAnatomyLayerDefinition['hyperscopeTarget'];
    resultClass: 'NOT_REQUESTED' | 'DIGITAL_MODEL_ZOOM' | 'CELL_MODEL' | 'SUBCELLULAR_MODEL' | 'NOT_SUPPORTED';
  }>;
  readonly provenance: Readonly<{
    source: string;
    description: string;
    epistemic: 'MODEL';
    directObservation: false;
    assetGovernance: CanonicalAnatomyLayerDefinition['assetGovernance'];
  }>;
}

export interface AnatomyAssetGateResult {
  readonly mayLoadVisualAsset: boolean;
  readonly status: 'APPROVED_VISUAL_ASSET' | 'BLOCKED_UNVERIFIED_OR_UNKNOWN';
  readonly assetId: string | null;
  readonly license: string | null;
  /** A visual asset approval never establishes scientific/anatomical validity. */
  readonly anatomicalValidity: 'NOT_ESTABLISHED';
}

const DEFAULT_SECTION = Object.freeze({ enabled: false, axis: 'SAGITTAL' as const, positionNormalized: 0.5 });

function lodSlot(layer: CanonicalAnatomyLayerDefinition, lod: AnatomyLayerLod): string {
  return lod === 'FULL' ? layer.lodAssetSlots.full : lod === 'MEDIUM' ? layer.lodAssetSlots.medium : layer.lodAssetSlots.low;
}

function hyperscopeResult(layer: CanonicalAnatomyLayerDefinition, magnification: MagnificationLevel | null): AnatomyLayerPresentation['hyperscope'] {
  if (magnification === null) return { compatible: layer.hyperscopeTarget !== 'NONE', requestedMagnification: null, target: layer.hyperscopeTarget, resultClass: 'NOT_REQUESTED' };
  if (layer.hyperscopeTarget === 'NONE') return { compatible: false, requestedMagnification: magnification, target: layer.hyperscopeTarget, resultClass: 'NOT_SUPPORTED' };
  if (magnification >= 500) return { compatible: true, requestedMagnification: magnification, target: layer.hyperscopeTarget, resultClass: 'SUBCELLULAR_MODEL' };
  if (magnification >= 100) return { compatible: true, requestedMagnification: magnification, target: layer.hyperscopeTarget, resultClass: 'CELL_MODEL' };
  return { compatible: true, requestedMagnification: magnification, target: layer.hyperscopeTarget, resultClass: 'DIGITAL_MODEL_ZOOM' };
}

/**
 * Resolves visibility, isolation, picking, section and microscope metadata
 * against the one canonical anatomy manifest. It creates no meshes or second
 * body; renderers consume this contract and keep their existing ownership.
 */
export function resolveAnatomyLayerShell(
  manifest: HumanDigitalTwinManifest,
  view: AnatomyLayerShellView = {},
): readonly AnatomyLayerPresentation[] {
  const byId = new Map(manifest.nodes.map((node) => [node.id, node]));
  const explicitVisible = view.visibleLayerIds ? new Set(view.visibleLayerIds) : null;
  const hidden = new Set(view.hiddenLayerIds ?? []);
  const isolated = view.isolatedLayerId ?? null;
  const selected = view.selectedLayerId ?? null;
  const lod = view.lod ?? 'LOW';
  const section = view.crossSection
    ? { ...view.crossSection, positionNormalized: Math.max(0, Math.min(1, view.crossSection.positionNormalized)) }
    : DEFAULT_SECTION;
  const magnification = view.hyperscopeMagnification ?? null;

  return CANONICAL_ANATOMY_LAYER_SHELL.map((layer) => {
    const node = byId.get(layer.id);
    if (!node) throw new Error(`ANATOMY_LAYER_NODE_MISSING:${layer.id}`);
    const baseVisible = explicitVisible ? explicitVisible.has(layer.id) : layer.visibleByDefault;
    const visible = !hidden.has(layer.id) && (isolated ? layer.id === isolated : baseVisible);
    return {
      id: layer.id,
      nodeId: layer.id,
      pickId: `anatomy:${layer.id}`,
      label: layer.label,
      assetSlot: lodSlot(layer, lod),
      visible,
      selected: selected === layer.id,
      isolated: isolated === layer.id,
      pickable: layer.pickable && visible,
      opacity: isolated && layer.id !== isolated ? 0.06 : selected === layer.id ? 1 : visible ? 0.82 : 0,
      lod,
      crossSection: layer.crossSectionCompatible ? section : DEFAULT_SECTION,
      hyperscope: hyperscopeResult(layer, magnification),
      provenance: {
        source: node.representation.provenance.source,
        description: node.representation.provenance.description,
        epistemic: 'MODEL',
        directObservation: false,
        assetGovernance: layer.assetGovernance,
      },
    } satisfies AnatomyLayerPresentation;
  });
}

/** A fail-closed adapter to the existing assetGovernance registry. */
export function evaluateAnatomyVisualAsset(runtimePath: string): AnatomyAssetGateResult {
  const record = getWorldAssetRecord(runtimePath);
  const approved = record?.status === 'APPROVED';
  return {
    mayLoadVisualAsset: approved,
    status: approved ? 'APPROVED_VISUAL_ASSET' : 'BLOCKED_UNVERIFIED_OR_UNKNOWN',
    assetId: record?.id ?? null,
    license: record?.license ?? null,
    anatomicalValidity: 'NOT_ESTABLISHED',
  };
}

/** Adds reviewable metadata to an existing owned render root; does not own or render it. */
export function attachAnatomyLayerShellMetadata(
  root: THREE_NS.Object3D,
  layers: readonly AnatomyLayerPresentation[],
): void {
  root.userData.canonicalAnatomyLayerShell = layers.map((layer) => ({
    id: layer.id,
    nodeId: layer.nodeId,
    pickId: layer.pickId,
    visible: layer.visible,
    selected: layer.selected,
    isolated: layer.isolated,
    pickable: layer.pickable,
    assetSlot: layer.assetSlot,
    lod: layer.lod,
    crossSection: layer.crossSection,
    hyperscope: layer.hyperscope,
    provenance: layer.provenance,
  }));
}
