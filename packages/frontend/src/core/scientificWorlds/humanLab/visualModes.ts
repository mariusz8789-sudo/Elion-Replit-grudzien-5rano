import type { AnatomyDisplayMode, HumanDigitalTwinManifest } from './types';

export interface VisualLayerInstruction {
  readonly mode: AnatomyDisplayMode;
  readonly visibleAssetSlots: readonly string[];
  readonly translucent: boolean;
  readonly tint: string;
  readonly clippingPlane: boolean;
}

export function buildVisualLayerInstruction(manifest: HumanDigitalTwinManifest, mode: AnatomyDisplayMode): VisualLayerInstruction {
  const organSlots = manifest.nodes.filter((n) => n.kind === 'ORGAN').map((n) => n.assetSlot);
  switch (mode) {
    case 'XRAY':
      return { mode, visibleAssetSlots: [manifest.nodes.find((n) => n.id === 'body')!.assetSlot, ...organSlots], translucent: true, tint: '#B9D6FF', clippingPlane: false };
    case 'VASCULAR':
      return { mode, visibleAssetSlots: organSlots.filter((slot) => /heart|kidney|liver/.test(slot)), translucent: true, tint: '#D24A4A', clippingPlane: false };
    case 'NERVOUS':
      return { mode, visibleAssetSlots: manifest.nodes.filter((n) => n.system === 'NERVOUS').map((n) => n.assetSlot), translucent: true, tint: '#EAB96B', clippingPlane: false };
    case 'ORGANS':
      return { mode, visibleAssetSlots: organSlots, translucent: true, tint: '#E7A099', clippingPlane: false };
    case 'BRAIN':
      return { mode, visibleAssetSlots: ['human.organ.brain.high_fidelity.glb'], translucent: false, tint: '#E0A0A3', clippingPlane: false };
    case 'TISSUE':
      return { mode, visibleAssetSlots: ['tissue.generic.high_fidelity.glb'], translucent: false, tint: '#D38B7C', clippingPlane: false };
    case 'CELLULAR':
      return { mode, visibleAssetSlots: ['cell.generic.model'], translucent: false, tint: '#A7C6A7', clippingPlane: false };
    default:
      return { mode, visibleAssetSlots: [manifest.nodes.find((n) => n.id === 'body')!.assetSlot], translucent: false, tint: '#FFFFFF', clippingPlane: false };
  }
}
