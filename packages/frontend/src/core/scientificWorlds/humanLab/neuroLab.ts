import type { NeuroLabState, NeuroRegion, NeuronSignal } from './types';
import { seededRandom, stableHash } from './hash';

export const NEURO_REGIONS: readonly NeuroRegion[] = [
  { id: 'cortex.frontal', label: 'Frontal Lobe', parentId: null, positionMeters: { x: 0.02, y: 0.02, z: 0.045 }, volumeMl: 115, assetSlot: 'brain.region.frontal.glb' },
  { id: 'cortex.parietal', label: 'Parietal Lobe', parentId: null, positionMeters: { x: 0.00, y: 0.02, z: -0.015 }, volumeMl: 110, assetSlot: 'brain.region.parietal.glb' },
  { id: 'cortex.temporal', label: 'Temporal Lobe', parentId: null, positionMeters: { x: 0.00, y: -0.05, z: 0.015 }, volumeMl: 105, assetSlot: 'brain.region.temporal.glb' },
  { id: 'cortex.occipital', label: 'Occipital Lobe', parentId: null, positionMeters: { x: 0.00, y: 0.01, z: -0.065 }, volumeMl: 80, assetSlot: 'brain.region.occipital.glb' },
  { id: 'hippocampus.left', label: 'Left Hippocampus', parentId: 'cortex.temporal', positionMeters: { x: -0.035, y: -0.04, z: 0.005 }, volumeMl: 4.0, assetSlot: 'brain.structure.hippocampus.left.glb' },
  { id: 'hippocampus.right', label: 'Right Hippocampus', parentId: 'cortex.temporal', positionMeters: { x: 0.035, y: -0.04, z: 0.005 }, volumeMl: 4.0, assetSlot: 'brain.structure.hippocampus.right.glb' },
  { id: 'amygdala.left', label: 'Left Amygdala', parentId: 'cortex.temporal', positionMeters: { x: -0.03, y: -0.045, z: 0.018 }, volumeMl: 1.6, assetSlot: 'brain.structure.amygdala.left.glb' },
  { id: 'amygdala.right', label: 'Right Amygdala', parentId: 'cortex.temporal', positionMeters: { x: 0.03, y: -0.045, z: 0.018 }, volumeMl: 1.6, assetSlot: 'brain.structure.amygdala.right.glb' },
  { id: 'thalamus', label: 'Thalamus', parentId: null, positionMeters: { x: 0, y: -0.005, z: 0 }, volumeMl: 8.0, assetSlot: 'brain.structure.thalamus.glb' },
  { id: 'cerebellum', label: 'Cerebellum', parentId: null, positionMeters: { x: 0, y: -0.035, z: -0.07 }, volumeMl: 150, assetSlot: 'brain.region.cerebellum.glb' },
  { id: 'brainstem', label: 'Brainstem', parentId: null, positionMeters: { x: 0, y: -0.06, z: -0.02 }, volumeMl: 30, assetSlot: 'brain.region.brainstem.glb' },
];

export function createDefaultNeuroState(): NeuroLabState {
  return { selectedRegionId: 'cortex.frontal', visibleRegions: NEURO_REGIONS.map((r) => r.id), activeSignals: [], modelTimeMs: 0, label: 'MODEL' };
}

export function simulateNeuralSignals(seed: number, timeMs: number, sourceRegionId = 'cortex.frontal'): readonly NeuronSignal[] {
  const rnd = seededRandom(seed + Math.floor(timeMs));
  const targets = NEURO_REGIONS.filter((r) => r.id !== sourceRegionId).slice(0, 5);
  return targets.map((target, index) => ({
    id: `SIG-${stableHash({ seed, timeMs, sourceRegionId, target: target.id, index })}`,
    fromRegionId: sourceRegionId,
    toRegionId: target.id,
    amplitude: 0.2 + rnd() * 0.8,
    latencyMs: 8 + rnd() * 42,
    epistemic: 'SIMULATION',
  }));
}

export function stepNeuroLab(state: NeuroLabState, dtMs: number, seed: number): NeuroLabState {
  const modelTimeMs = state.modelTimeMs + Math.max(0, dtMs);
  return { ...state, modelTimeMs, activeSignals: simulateNeuralSignals(seed, modelTimeMs, state.selectedRegionId) };
}
