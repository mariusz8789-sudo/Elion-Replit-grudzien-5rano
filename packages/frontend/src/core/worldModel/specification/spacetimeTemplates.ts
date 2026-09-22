import { addTunnelJunction } from '../domains/quantumTunneling';
import type { EntityId } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';
import type { WorldBlueprintNode } from '../generation/worldBlueprint';
import type { TemplateResult, WorldTemplate } from './templates';

const EMPTY: Pick<TemplateResult, 'relationships' | 'postGenerate'> = { relationships: [], postGenerate: [] };

function node(
  kind: string,
  id: string,
  label: string,
  position: { x: number; y: number; z: number },
  domainState: Record<string, number>,
  statusLabel: string,
  scaleLevel: WorldBlueprintNode['scaleLevel'] = 'REGION',
): WorldBlueprintNode {
  return {
    ref: { kind, id },
    label,
    scaleLevel,
    spatial: { position },
    domainState,
    statusLabel,
    grounding: 'UNGROUNDED_APPROXIMATION',
  };
}

export const QUANTUM_TEMPLATE: WorldTemplate = () => {
  const chamberId: EntityId = 'building:quantum-observation-chamber';
  const junctionId: EntityId = 'tunnel-junction:world-director-stm';
  const chamber = node(
    'building',
    'quantum-observation-chamber',
    'Quantum Tunnelling Observation Chamber',
    { x: 0, y: 0, z: 0 },
    { barrierHeight: 1, wavePacketEnergy: 0.55, superpositionBranches: 2 },
    'MODEL · 1D SPLIT-STEP FOURIER',
    'BUILDING',
  );
  const postGenerate = (graph: WorldGraph): void => {
    addTunnelJunction(graph, {
      junctionId: 'world-director-stm',
      label: 'Canonical Quantum Tunnelling Junction',
      parentEntityId: chamberId,
      params: { energy: 0.55, barrier: 1, width: 3, frames: 1200 },
    });
  };
  return { children: [chamber], relationships: [], postGenerate: [postGenerate], ids: { chamberId, junctionId } };
};

export const TIME_DILATION_LAB_TEMPLATE: WorldTemplate = () => {
  const referenceClockId: EntityId = 'instrument:reference-clock';
  const movingClockId: EntityId = 'instrument:moving-clock';
  const velocityFractionC = 0.8;
  const lorentzGamma = 1 / Math.sqrt(1 - velocityFractionC ** 2);
  return {
    children: [
      node('instrument', 'reference-clock', 'Reference Atomic Clock', { x: -8, y: 2, z: 0 }, { velocityFractionC: 0, lorentzGamma: 1 }, 'MODEL · REFERENCE CLOCK', 'ROOM'),
      node('instrument', 'moving-clock', 'Relativistic Comparison Clock', { x: 8, y: 2, z: 0 }, { velocityFractionC, lorentzGamma }, 'MODEL · SPECIAL RELATIVITY', 'ROOM'),
    ],
    ...EMPTY,
    ids: { referenceClockId, movingClockId },
  };
};

export const COSMOLOGY_SPACETIME_TEMPLATE: WorldTemplate = (spec) => {
  const gravityWellId: EntityId = 'spacetime-field:gravity-well';
  const darkMatterHaloId: EntityId = 'spacetime-field:dark-matter-halo';
  const primaryMassScale = spec.spacetime?.primaryMassScale ?? 8;
  return {
    children: [
      node('spacetime-field', 'gravity-well', 'Gravity-Well Curvature Model', { x: 0, y: 0, z: 0 }, { primaryMassScale, influenceRadius: 42, potentialDepth: 18 }, 'MODEL · CURVATURE PRESENTATION', 'PLANET'),
      node('spacetime-field', 'dark-matter-halo', 'Dark-Matter Halo Model', { x: 0, y: 0, z: 0 }, { relativeDensity: 0.26, haloRadius: 72 }, 'MODEL · INFERRED MASS DISTRIBUTION', 'PLANET'),
    ],
    ...EMPTY,
    ids: { gravityWellId, darkMatterHaloId },
  };
};

export const EINSTEIN_ROSEN_BRIDGE_TEMPLATE: WorldTemplate = (spec) => {
  const bridgeId: EntityId = 'spacetime-bridge:einstein-rosen';
  const throatRadius = spec.spacetime?.throatRadius ?? 12;
  return {
    children: [node(
      'spacetime-bridge',
      'einstein-rosen',
      'Einstein–Rosen Bridge Hypothesis',
      { x: 0, y: 10, z: 0 },
      { throatRadius, embeddingDepth: throatRadius * 1.8, geometryPointCount: 96 },
      'HYPOTHESIS · NON-TRAVERSABLE MODEL',
      'PLANET',
    )],
    ...EMPTY,
    ids: { bridgeId },
  };
};

export const MULTIVERSE_BRANCH_TEMPLATE: WorldTemplate = (spec) => {
  const branchCount = spec.spacetime?.branchCount ?? 5;
  const hubId: EntityId = 'timeline:branch-hub';
  const branches = Array.from({ length: branchCount }, (_, index) => node(
    'timeline-branch',
    `counterfactual-${index + 1}`,
    `Counterfactual Timeline ${index + 1}`,
    { x: (index - (branchCount - 1) / 2) * 18, y: 0, z: 18 },
    { branchIndex: index + 1, divergenceTick: 0 },
    'SIMULATION · STRUCTURAL BRANCH',
  ));
  return {
    children: [
      { ...node('timeline', 'branch-hub', 'Canonical Timeline Branch Hub', { x: 0, y: 0, z: 0 }, { branchCount }, 'SIMULATION · COUNTERFACTUAL'), children: branches },
    ],
    ...EMPTY,
    ids: { hubId, branchIds: branches.map((branch) => `${branch.ref.kind}:${branch.ref.id}`) },
  };
};

export const HISTORICAL_RECONSTRUCTION_TEMPLATE: WorldTemplate = (spec) => {
  const reconstructionId: EntityId = 'reconstruction:historical-context';
  const sourceNoteRecorded = Boolean(spec.provenanceNote && !/prompt-derived/i.test(spec.provenanceNote));
  return {
    children: [node(
      'reconstruction',
      'historical-context',
      'Historical Reconstruction Context',
      { x: 0, y: 0, z: 0 },
      { year: spec.spacetime?.historicalYear ?? 1775, sourceNoteRecorded: sourceNoteRecorded ? 1 : 0 },
      sourceNoteRecorded ? 'RECONSTRUCTION · SOURCE NOTE RECORDED' : 'RECONSTRUCTION · SOURCE REQUIRED',
      'REGION',
    )],
    ...EMPTY,
    ids: { reconstructionId },
  };
};

export const DESERT_ALIEN_TEMPLATE: WorldTemplate = () => {
  const ruinsId: EntityId = 'ruins:alien-desert-complex';
  const sunAId: EntityId = 'star:desert-sun-a';
  const sunBId: EntityId = 'star:desert-sun-b';
  return {
    children: [
      node('ruins', 'alien-desert-complex', 'Speculative Desert Ruins', { x: 0, y: 0, z: 0 }, { structureCount: 7, sandCoverage: 0.62 }, 'FICTION_INSPIRED · NOT OBSERVED', 'REGION'),
      node('star', 'desert-sun-a', 'Primary Sun (fictional)', { x: -50, y: 70, z: -80 }, { relativeLuminosity: 1 }, 'FICTION_INSPIRED', 'PLANET'),
      node('star', 'desert-sun-b', 'Secondary Sun (fictional)', { x: 55, y: 55, z: -70 }, { relativeLuminosity: 0.55 }, 'FICTION_INSPIRED', 'PLANET'),
    ],
    ...EMPTY,
    ids: { ruinsId, sunAId, sunBId },
  };
};

export const MARS_RESEARCH_TEMPLATE: WorldTemplate = () => {
  const stationId: EntityId = 'building:mars-research-station';
  const terrainId: EntityId = 'terrain:mars-regolith';
  return {
    children: [
      node('terrain', 'mars-regolith', 'Mars Regolith Context', { x: 0, y: 0, z: 0 }, { gravityMS2: 3.721, pressurePa: 610 }, 'MODEL · PLANETARY PARAMETERS', 'PLANET'),
      node('building', 'mars-research-station', 'Mars Research Station', { x: 0, y: 0, z: 0 }, { habitatModules: 4, crewCapacity: 12 }, 'SIMULATION · RESEARCH HABITAT', 'BUILDING'),
    ],
    ...EMPTY,
    ids: { stationId, terrainId },
  };
};
