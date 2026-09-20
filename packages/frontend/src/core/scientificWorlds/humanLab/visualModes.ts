import type { AnatomyNetworkKind } from './anatomyNetworks';
import type { AnatomyDisplayMode, HumanDigitalTwinManifest } from './types';

export interface VisualLayerInstruction {
  readonly mode: AnatomyDisplayMode;
  readonly visibleAssetSlots: readonly string[];
  readonly translucent: boolean;
  readonly tint: string;
  readonly clippingPlane: boolean;
  /** D-135: which real vascular/neural/lymphatic network graph (see `anatomyNetworks.ts`) the renderer
   * must show for this mode, if any — `null` for every mode that has no network layer. The organ-tint
   * `visibleAssetSlots` fallback below is presentation for the whole system's organs; the network itself
   * is a real graph of vessels/nerve trunks/lymphatic trunks, drawn separately (see `biologyLabKit.ts`). */
  readonly network: AnatomyNetworkKind | null;
}

const MODE_NETWORK: Readonly<Partial<Record<AnatomyDisplayMode, AnatomyNetworkKind>>> = { VASCULAR: 'VASCULAR', NERVOUS: 'NEURAL', LYMPHATIC: 'LYMPHATIC' };

export function buildVisualLayerInstruction(manifest: HumanDigitalTwinManifest, mode: AnatomyDisplayMode): VisualLayerInstruction {
  const organSlots = manifest.nodes.filter((n) => n.kind === 'ORGAN').map((n) => n.assetSlot);
  const network = MODE_NETWORK[mode] ?? null;
  switch (mode) {
    case 'XRAY':
      return { mode, visibleAssetSlots: [manifest.nodes.find((n) => n.id === 'body')!.assetSlot, ...organSlots], translucent: true, tint: '#B9D6FF', clippingPlane: false, network };
    case 'VASCULAR':
      // The real vessel graph carries the vascular layer now (see `network` above); the organs it
      // passes through stay faintly visible for anatomical context, not as the vascular content itself.
      return { mode, visibleAssetSlots: organSlots.filter((slot) => /heart|kidney|liver|lung/.test(slot)), translucent: true, tint: '#D24A4A', clippingPlane: false, network };
    case 'NERVOUS':
      return { mode, visibleAssetSlots: manifest.nodes.filter((n) => n.system === 'NERVOUS').map((n) => n.assetSlot), translucent: true, tint: '#EAB96B', clippingPlane: false, network };
    case 'LYMPHATIC':
      // No organ carries the lymphatic system as its own mesh in this atlas; the real trunk/node graph
      // is the entire visual content of this mode, over a faint reference body.
      return { mode, visibleAssetSlots: [], translucent: true, tint: '#6BD9C4', clippingPlane: false, network };
    case 'ORGANS':
      return { mode, visibleAssetSlots: organSlots, translucent: true, tint: '#E7A099', clippingPlane: false, network: null };
    case 'BRAIN':
      return { mode, visibleAssetSlots: ['human.organ.brain.high_fidelity.glb'], translucent: false, tint: '#E0A0A3', clippingPlane: false, network: null };
    case 'TISSUE':
      return { mode, visibleAssetSlots: ['tissue.generic.high_fidelity.glb'], translucent: false, tint: '#D38B7C', clippingPlane: false, network: null };
    case 'CELLULAR':
      return { mode, visibleAssetSlots: ['cell.generic.model'], translucent: false, tint: '#A7C6A7', clippingPlane: false, network: null };
    default:
      return { mode, visibleAssetSlots: [manifest.nodes.find((n) => n.id === 'body')!.assetSlot], translucent: false, tint: '#FFFFFF', clippingPlane: false, network: null };
  }
}
