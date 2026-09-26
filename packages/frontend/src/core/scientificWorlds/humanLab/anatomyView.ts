import type { AnatomyDisplayMode, AnatomyViewState, HumanDigitalTwinManifest } from './types';
import { getAnatomyNode, organsInSystem } from './anatomyAtlas';

export function createDefaultAnatomyView(twinId: string): AnatomyViewState {
  return { twinId, selectedNodeId: 'body', displayMode: 'NORMAL', isolatedNodeIds: [], hiddenNodeIds: [], cutawayEnabled: false, explodedOffsetMeters: 0 };
}

export function setAnatomyMode(state: AnatomyViewState, displayMode: AnatomyDisplayMode): AnatomyViewState {
  return { ...state, displayMode };
}

export function selectAnatomyNode(state: AnatomyViewState, nodeId: string, manifest: HumanDigitalTwinManifest): AnatomyViewState {
  if (!manifest.nodes.some((n) => n.id === nodeId)) throw new Error(`ANATOMY_NODE_NOT_FOUND:${nodeId}`);
  return { ...state, selectedNodeId: nodeId };
}

export function isolateAnatomyNode(state: AnatomyViewState, nodeId: string, manifest: HumanDigitalTwinManifest): AnatomyViewState {
  const selected = getAnatomyNode(manifest, nodeId);
  const isolatedNodeIds = selected.kind === 'BODY' ? [] : selected.kind === 'SYSTEM' ? organsInSystem(manifest, nodeId).map((organ) => organ.id) : [nodeId];
  return { ...state, selectedNodeId: nodeId, isolatedNodeIds, hiddenNodeIds: [] };
}

export function setCutaway(state: AnatomyViewState, enabled: boolean): AnatomyViewState {
  return { ...state, cutawayEnabled: enabled };
}

export function setExplodedOffset(state: AnatomyViewState, meters: number): AnatomyViewState {
  return { ...state, explodedOffsetMeters: Math.max(0, Math.min(0.5, meters)) };
}
