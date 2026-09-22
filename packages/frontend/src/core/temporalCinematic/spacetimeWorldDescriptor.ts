import type { EpistemicLabel } from '../scientificWorlds/humanLab/epistemic';
import type { WorldModelEntity } from '../worldModel/ecs/types';
import type { WorldGraph } from '../worldModel/ecs/worldGraph';
import type { WorldTemplateId } from '../worldModel/specification/worldSpecification';
import type { CameraPath } from './cameraPath';

export type SpacetimeRenderKind =
  | 'WORMHOLE_RINGS'
  | 'GRAVITY_WELL_GRID'
  | 'QUANTUM_BARRIER'
  | 'RELATIVISTIC_CLOCKS'
  | 'TIMELINE_BRANCHES'
  | 'HISTORICAL_CITY'
  | 'ALIEN_DESERT'
  | 'MARS_STATION';

export interface SpacetimeRenderPrimitive {
  readonly id: string;
  readonly shape: 'RING' | 'GRID_POINT' | 'BARRIER' | 'CLOCK' | 'BRANCH' | 'LANDMARK' | 'SUN';
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly intensity: number;
}

export interface SpacetimeWorldDescriptor {
  readonly kind: SpacetimeRenderKind;
  readonly title: string;
  readonly epistemic: EpistemicLabel;
  readonly palette: readonly [string, string, string];
  readonly primitives: readonly SpacetimeRenderPrimitive[];
  readonly sourceEntityIds: readonly string[];
  readonly limitations: readonly string[];
}

const positionOf = (entity: WorldModelEntity): readonly [number, number, number] => {
  const p = entity.spatial?.position ?? { x: 0, y: 0, z: 0 };
  return [p.x, p.y, p.z];
};

function wormholeDescriptor(entity: WorldModelEntity): SpacetimeWorldDescriptor {
  const throat = entity.domainState?.throatRadius ?? 12;
  const ringCount = Math.max(12, Math.min(96, Math.round(entity.domainState?.geometryPointCount ?? 48)));
  const primitives = Array.from({ length: ringCount }, (_, index): SpacetimeRenderPrimitive => {
    const t = ringCount === 1 ? 0 : index / (ringCount - 1);
    const z = (t - 0.5) * throat * 4;
    const radius = throat * Math.sqrt(1 + (z / Math.max(throat, 0.001)) ** 2);
    return { id: `wormhole-ring-${index}`, shape: 'RING', position: [0, 10, z], scale: [radius, radius, 0.12], intensity: 1 - Math.abs(t - 0.5) * 0.55 };
  });
  return {
    kind: 'WORMHOLE_RINGS',
    title: entity.label,
    epistemic: 'HYPOTHESIS',
    palette: ['#061421', '#37d9ff', '#d98cff'],
    primitives,
    sourceEntityIds: [entity.id],
    limitations: ['Embedding geometry is a scientific visualization, not evidence of a traversable wormhole.', 'No backward-time-travel claim.'],
  };
}

function gravityDescriptor(entities: readonly WorldModelEntity[]): SpacetimeWorldDescriptor {
  const gravity = entities.find((entity) => entity.ref.kind === 'spacetime-field' && entity.ref.id === 'gravity-well');
  if (!gravity) throw new Error('SPACETIME_DESCRIPTOR_MISSING_GRAVITY_WELL');
  const radius = gravity.domainState?.influenceRadius ?? 42;
  const depth = gravity.domainState?.potentialDepth ?? 18;
  const grid = 9;
  const primitives: SpacetimeRenderPrimitive[] = [];
  for (let x = 0; x < grid; x++) {
    for (let z = 0; z < grid; z++) {
      const nx = (x / (grid - 1) - 0.5) * 2;
      const nz = (z / (grid - 1) - 0.5) * 2;
      const d2 = nx * nx + nz * nz;
      primitives.push({
        id: `curvature-${x}-${z}`,
        shape: 'GRID_POINT',
        position: [nx * radius, -depth * Math.exp(-3.2 * d2), nz * radius],
        scale: [0.55, 0.55, 0.55],
        intensity: Math.exp(-2.2 * d2),
      });
    }
  }
  return {
    kind: 'GRAVITY_WELL_GRID',
    title: 'Spacetime Curvature & Dark-Matter Model',
    epistemic: 'MODEL',
    palette: ['#020611', '#2ba7ff', '#8f56ff'],
    primitives,
    sourceEntityIds: entities.filter((entity) => entity.ref.kind === 'spacetime-field').map((entity) => entity.id),
    limitations: ['Curvature is visually amplified.', 'Dark matter is an inferred mass-distribution model, not directly imaged matter.'],
  };
}

function genericDescriptor(template: WorldTemplateId, entities: readonly WorldModelEntity[]): SpacetimeWorldDescriptor {
  const configs: Record<string, Pick<SpacetimeWorldDescriptor, 'kind' | 'title' | 'epistemic' | 'palette' | 'limitations'>> = {
    QUANTUM: { kind: 'QUANTUM_BARRIER', title: 'Quantum Superposition & Tunnelling', epistemic: 'MODEL', palette: ['#020817', '#00d9ff', '#ff4dd8'], limitations: ['One-dimensional finite-time split-step Fourier model.'] },
    TIME_DILATION_LAB: { kind: 'RELATIVISTIC_CLOCKS', title: 'Time-Dilation Laboratory', epistemic: 'MODEL', palette: ['#07111d', '#61dafb', '#ffc857'], limitations: ['Special-relativity comparison; no backward-time-travel claim.'] },
    MULTIVERSE_BRANCH: { kind: 'TIMELINE_BRANCHES', title: 'Counterfactual Timeline Branches', epistemic: 'SIMULATION', palette: ['#050818', '#3ad6ff', '#c46aff'], limitations: ['Branches are simulation alternatives, not observed universes.'] },
    HISTORICAL_RECONSTRUCTION: { kind: 'HISTORICAL_CITY', title: 'Historical Reconstruction', epistemic: 'RECONSTRUCTION', palette: ['#120d09', '#d8a96d', '#566777'], limitations: ['Unsourced details remain inferred reconstruction.'] },
    DESERT_ALIEN: { kind: 'ALIEN_DESERT', title: 'Fiction-Inspired Desert World', epistemic: 'FICTION_INSPIRED', palette: ['#150a07', '#e08a43', '#83d9ff'], limitations: ['No claim that this planet or its ruins exist.'] },
    MARS_RESEARCH: { kind: 'MARS_STATION', title: 'Mars Research World', epistemic: 'SIMULATION', palette: ['#100908', '#ce5f3d', '#7fcfff'], limitations: ['Station layout is simulated; planetary parameters are model inputs.'] },
  };
  const config = configs[template];
  if (!config) throw new Error(`SPACETIME_DESCRIPTOR_UNSUPPORTED:${template}`);
  const primitives = entities
    .filter((entity) => entity.ref.kind !== 'world' && entity.ref.kind !== 'city')
    .map((entity, index): SpacetimeRenderPrimitive => ({
      id: entity.id,
      shape: entity.ref.kind === 'star' ? 'SUN' : template === 'MULTIVERSE_BRANCH' ? 'BRANCH' : template === 'QUANTUM' ? 'BARRIER' : template === 'TIME_DILATION_LAB' ? 'CLOCK' : 'LANDMARK',
      position: positionOf(entity),
      scale: [1 + (index % 3) * 0.2, 1, 1 + (index % 2) * 0.25],
      intensity: 1,
    }));
  return { ...config, primitives, sourceEntityIds: entities.map((entity) => entity.id) };
}

/** Presentation data derived from canonical WorldGraph entities; it never creates or mutates a world. */
export function describeSpacetimeWorld(graph: WorldGraph, primaryTemplate: WorldTemplateId): SpacetimeWorldDescriptor {
  const entities = graph.listEntities();
  if (primaryTemplate === 'EINSTEIN_ROSEN_BRIDGE') {
    const bridge = entities.find((entity) => entity.ref.kind === 'spacetime-bridge');
    if (!bridge) throw new Error('SPACETIME_DESCRIPTOR_MISSING_BRIDGE');
    return wormholeDescriptor(bridge);
  }
  if (primaryTemplate === 'COSMOLOGY_SPACETIME') return gravityDescriptor(entities);
  return genericDescriptor(primaryTemplate, entities);
}

/** Deterministic orbit path authored from the descriptor's visual bounds. */
export function buildSpacetimeCameraPath(descriptor: SpacetimeWorldDescriptor, durationSeconds = 18): CameraPath {
  const radius = descriptor.kind === 'WORMHOLE_RINGS' ? 54 : descriptor.kind === 'GRAVITY_WELL_GRID' ? 76 : 58;
  const frameCount = 72;
  const keyframes = Array.from({ length: frameCount }, (_, index) => {
    const u = index / (frameCount - 1);
    const angle = -Math.PI * 0.35 + u * Math.PI * 0.7;
    return {
      t: u * durationSeconds,
      position: { x: Math.cos(angle) * radius, y: descriptor.kind === 'WORMHOLE_RINGS' ? 22 : 26, z: Math.sin(angle) * radius },
      lookAt: { x: 0, y: descriptor.kind === 'WORMHOLE_RINGS' ? 9 : 0, z: 0 },
    };
  });
  const first = keyframes[0]!;
  const last = keyframes[keyframes.length - 1]!;
  return {
    roadEntityId: descriptor.sourceEntityIds[0] ?? 'spacetime-descriptor',
    startPoint: { x: first.position.x, z: first.position.z },
    endPoint: { x: last.position.x, z: last.position.z },
    totalDistanceM: radius * Math.PI * 0.7,
    durationSeconds,
    keyframes,
  };
}
