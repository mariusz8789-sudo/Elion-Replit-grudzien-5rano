import type * as THREE_NS from 'three';
import type { SpacetimeWorldDescriptor } from '../temporalCinematic/spacetimeWorldDescriptor';
import type { WorldGraph } from '../worldModel/ecs/worldGraph';
import type { RenderTier } from './quality';
import { markPremiumPresentation, premiumVisualBudget, seededUnit, visualSeed } from './graphics/premiumVisualPolicy';

export interface PremiumSpacetimeDetailHandle {
  readonly root: THREE_NS.Group;
  readonly summary: {
    readonly kind: SpacetimeWorldDescriptor['kind'];
    readonly detailObjectCount: number;
    readonly tier: RenderTier;
  };
  update(elapsedSeconds: number): void;
}

type AnimatedAccent = {
  readonly object: THREE_NS.Object3D;
  readonly mode: 'ROTATE_Y' | 'FLOAT' | 'PULSE_OPACITY';
  readonly speed: number;
  readonly phase: number;
  readonly baseY: number;
  readonly material?: THREE_NS.Material & { opacity?: number };
};

function setInstances(
  THREE: typeof THREE_NS,
  mesh: THREE_NS.InstancedMesh,
  entries: readonly { position: THREE_NS.Vector3Tuple; rotation?: THREE_NS.Vector3Tuple; scale?: THREE_NS.Vector3Tuple | number }[],
): void {
  const dummy = new THREE.Object3D();
  entries.forEach((entry, index) => {
    dummy.position.set(...entry.position);
    dummy.rotation.set(...(entry.rotation ?? [0, 0, 0]));
    if (typeof entry.scale === 'number') dummy.scale.setScalar(entry.scale);
    else dummy.scale.set(...(entry.scale ?? [1, 1, 1]));
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

function addPointCloud(
  THREE: typeof THREE_NS,
  root: THREE_NS.Group,
  name: string,
  count: number,
  seed: number,
  bounds: THREE_NS.Vector3Tuple,
  center: THREE_NS.Vector3Tuple,
  color: THREE_NS.ColorRepresentation,
  size: number,
  opacity: number,
): THREE_NS.Points {
  const rand = seededUnit(seed);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = center[0] + (rand() * 2 - 1) * bounds[0];
    positions[i * 3 + 1] = center[1] + (rand() * 2 - 1) * bounds[1];
    positions[i * 3 + 2] = center[2] + (rand() * 2 - 1) * bounds[2];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false, sizeAttenuation: true });
  const points = new THREE.Points(geometry, material);
  points.name = name;
  points.frustumCulled = false;
  root.add(points);
  return points;
}

function addHistoricalDetail(
  THREE: typeof THREE_NS,
  root: THREE_NS.Group,
  budget: ReturnType<typeof premiumVisualBudget>,
  animated: AnimatedAccent[],
): void {
  const postCount = Math.max(8, Math.round(budget.detailInstances * 0.18));
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x302a25, metalness: 0.22, roughness: 0.72 });
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.07, 2.5, 8), postMaterial, postCount);
  posts.name = 'premium-historical-instanced-street-posts';
  const entries = Array.from({ length: postCount }, (_, index) => ({
    position: [(index % 2 ? 1 : -1) * (5.8 + (index % 3) * 0.9), 1.25, -26 + index * (52 / Math.max(1, postCount - 1))] as THREE_NS.Vector3Tuple,
    scale: [1, 0.82 + (index % 4) * 0.05, 1] as THREE_NS.Vector3Tuple,
  }));
  setInstances(THREE, posts, entries); root.add(posts);

  const lanternMaterial = new THREE.MeshStandardMaterial({ color: 0xffcb86, emissive: 0xff9b42, emissiveIntensity: 0.58, roughness: 0.38 });
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 10, 8), lanternMaterial, postCount);
  lamps.name = 'premium-historical-instanced-lanterns';
  setInstances(THREE, lamps, entries.map((entry) => ({ position: [entry.position[0], 2.42, entry.position[2]] as THREE_NS.Vector3Tuple })));
  root.add(lamps);
  animated.push({ object: lamps, mode: 'PULSE_OPACITY', speed: 1.6, phase: 0, baseY: 0, material: lanternMaterial });

  const crateCount = Math.max(12, Math.round(budget.detailInstances * 0.35));
  const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.52, 0.38, 0.42), new THREE.MeshStandardMaterial({ color: 0x6d4b33, roughness: 0.9 }), crateCount);
  crates.name = 'premium-historical-instanced-street-props';
  setInstances(THREE, crates, Array.from({ length: crateCount }, (_, index) => ({
    position: [((index * 17) % 19) - 9, 0.19, ((index * 29) % 53) - 26] as THREE_NS.Vector3Tuple,
    rotation: [0, (index * 0.71) % Math.PI, 0] as THREE_NS.Vector3Tuple,
    scale: 0.7 + (index % 4) * 0.12,
  })));
  root.add(crates);
}

function addAlienDetail(
  THREE: typeof THREE_NS,
  root: THREE_NS.Group,
  budget: ReturnType<typeof premiumVisualBudget>,
  seed: number,
  animated: AnimatedAccent[],
): void {
  const crystalCount = Math.max(20, Math.round(budget.detailInstances * 0.58));
  const rand = seededUnit(seed ^ 0x7a11e9);
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0x6d415b, emissive: 0x29152b, emissiveIntensity: 0.16, metalness: 0.28, roughness: 0.48 });
  const crystals = new THREE.InstancedMesh(new THREE.ConeGeometry(0.23, 1.6, 5), crystalMat, crystalCount);
  crystals.name = 'premium-alien-instanced-mineral-spires';
  setInstances(THREE, crystals, Array.from({ length: crystalCount }, (_, index) => {
    const angle = index * 2.399963;
    const radius = 16 + rand() * 56;
    const heightScale = 0.42 + rand() * 1.5;
    return {
      position: [Math.cos(angle) * radius, 0.8 * heightScale, Math.sin(angle) * radius] as THREE_NS.Vector3Tuple,
      rotation: [0, rand() * Math.PI, (rand() - 0.5) * 0.2] as THREE_NS.Vector3Tuple,
      scale: [0.6 + rand() * 0.8, heightScale, 0.6 + rand() * 0.8] as THREE_NS.Vector3Tuple,
    };
  }));
  root.add(crystals);
  const dust = addPointCloud(THREE, root, 'premium-alien-fine-atmospheric-dust', Math.min(900, budget.atmospherePoints), seed ^ 0x3301, [78, 14, 62], [0, 8, 0], 0xe3a06d, 0.12, 0.13);
  animated.push({ object: dust, mode: 'ROTATE_Y', speed: 0.008, phase: 0, baseY: 0 });
}

function addMarsDetail(
  THREE: typeof THREE_NS,
  root: THREE_NS.Group,
  budget: ReturnType<typeof premiumVisualBudget>,
  seed: number,
  animated: AnimatedAccent[],
): void {
  const rand = seededUnit(seed ^ 0x4d415253);
  const rockCount = Math.max(28, budget.detailInstances);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.34, 0), new THREE.MeshStandardMaterial({ color: 0x6b3326, roughness: 0.98 }), rockCount);
  rocks.name = 'premium-mars-instanced-regolith-microdetail';
  setInstances(THREE, rocks, Array.from({ length: rockCount }, (_, index) => {
    const angle = index * 2.399963;
    const radius = 12 + rand() * 62;
    const s = 0.35 + rand() * 1.25;
    return {
      position: [Math.cos(angle) * radius, 0.12 * s, Math.sin(angle) * radius] as THREE_NS.Vector3Tuple,
      rotation: [rand() * Math.PI, rand() * Math.PI, rand() * Math.PI] as THREE_NS.Vector3Tuple,
      scale: [s, s * (0.48 + rand() * 0.42), s] as THREE_NS.Vector3Tuple,
    };
  }));
  root.add(rocks);

  const caseCount = Math.max(6, Math.round(budget.detailInstances * 0.12));
  const cases = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.38, 0.55), new THREE.MeshStandardMaterial({ color: 0x9a8c77, metalness: 0.32, roughness: 0.56 }), caseCount);
  cases.name = 'premium-mars-instanced-field-cases';
  setInstances(THREE, cases, Array.from({ length: caseCount }, (_, index) => ({
    position: [-8 + index * 1.9, 0.22, 10 + Math.sin(index * 1.4) * 2.3] as THREE_NS.Vector3Tuple,
    rotation: [0, index * 0.41, 0] as THREE_NS.Vector3Tuple,
    scale: 0.72 + (index % 3) * 0.12,
  })));
  root.add(cases);

  const streakPairs = Math.max(32, Math.round(budget.atmospherePoints * 0.22));
  const positions = new Float32Array(streakPairs * 6);
  for (let i = 0; i < streakPairs; i += 1) {
    const x = (rand() * 2 - 1) * 70; const y = 0.18 + rand() * 8; const z = (rand() * 2 - 1) * 62;
    const len = 0.15 + rand() * 0.75;
    positions[i * 6] = x; positions[i * 6 + 1] = y; positions[i * 6 + 2] = z;
    positions[i * 6 + 3] = x + len; positions[i * 6 + 4] = y + len * 0.04; positions[i * 6 + 5] = z + len * 0.18;
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const streaks = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xc47a5e, transparent: true, opacity: 0.11, depthWrite: false }));
  streaks.name = 'premium-mars-windborne-dust-streaks';
  streaks.userData.visualAnalogy = 'ATMOSPHERIC_PRESENTATION_NOT_CFD_OUTPUT';
  root.add(streaks);
  animated.push({ object: streaks, mode: 'ROTATE_Y', speed: 0.003, phase: 0, baseY: 0 });
}

function addUnderwaterDetail(
  THREE: typeof THREE_NS,
  root: THREE_NS.Group,
  budget: ReturnType<typeof premiumVisualBudget>,
  seed: number,
  animated: AnimatedAccent[],
): void {
  const rand = seededUnit(seed ^ 0x0cea71);
  const floraCount = Math.max(24, Math.round(budget.detailInstances * 0.65));
  const floraMat = new THREE.MeshStandardMaterial({ color: 0x315f58, emissive: 0x082d2a, emissiveIntensity: 0.08, roughness: 0.82 });
  const flora = new THREE.InstancedMesh(new THREE.ConeGeometry(0.18, 1.6, 6, 2), floraMat, floraCount);
  flora.name = 'premium-underwater-instanced-seabed-flora';
  setInstances(THREE, flora, Array.from({ length: floraCount }, (_, index) => {
    const angle = index * 2.399963;
    const radius = 12 + rand() * 66;
    const h = 0.45 + rand() * 1.25;
    return {
      position: [Math.cos(angle) * radius, -30.1 + h * 0.7, Math.sin(angle) * radius] as THREE_NS.Vector3Tuple,
      rotation: [(rand() - 0.5) * 0.2, rand() * Math.PI, (rand() - 0.5) * 0.2] as THREE_NS.Vector3Tuple,
      scale: [0.55 + rand() * 0.55, h, 0.55 + rand() * 0.55] as THREE_NS.Vector3Tuple,
    };
  }));
  root.add(flora);

  const plankton = addPointCloud(THREE, root, 'premium-underwater-bioluminescent-plankton', Math.min(1100, budget.atmospherePoints), seed ^ 0x51a, [76, 26, 65], [0, -8, 0], 0x7ef7e9, 0.055, 0.14);
  plankton.userData.visualAnalogy = 'BIOLOGICAL_AMBIENCE_NOT_SPECIES_DENSITY_MEASUREMENT';
  animated.push({ object: plankton, mode: 'ROTATE_Y', speed: 0.004, phase: 0, baseY: 0 });

  const causticLines: number[] = [];
  const lineCount = Math.max(18, Math.round(budget.detailInstances * 0.35));
  for (let i = 0; i < lineCount; i += 1) {
    const z = -42 + (i / Math.max(1, lineCount - 1)) * 84;
    for (let segment = 0; segment < 12; segment += 1) {
      const x0 = -56 + segment * 9.5;
      const x1 = x0 + 7.4;
      causticLines.push(x0, -29.82, z + Math.sin(i * 0.8 + segment) * 0.8, x1, -29.82, z + Math.sin(i * 0.8 + segment + 0.7) * 0.8);
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(causticLines, 3));
  const material = new THREE.LineBasicMaterial({ color: 0x68e5ef, transparent: true, opacity: 0.065, depthWrite: false });
  const caustics = new THREE.LineSegments(geometry, material);
  caustics.name = 'premium-underwater-caustic-light-guides';
  caustics.userData.visualAnalogy = 'CAUSTIC_PRESENTATION_NOT_OPTICAL_FLUID_SIMULATION';
  root.add(caustics);
  animated.push({ object: caustics, mode: 'PULSE_OPACITY', speed: 0.55, phase: 1.2, baseY: 0, material });
}

function addDeepSpaceDetail(
  THREE: typeof THREE_NS,
  root: THREE_NS.Group,
  descriptor: SpacetimeWorldDescriptor,
  budget: ReturnType<typeof premiumVisualBudget>,
  seed: number,
  animated: AnimatedAccent[],
): void {
  const points = addPointCloud(THREE, root, 'premium-space-parallax-star-shell', Math.min(1200, budget.atmospherePoints), seed ^ 0x5a7a, [92, 64, 130], [0, 8, 0], descriptor.palette[2], 0.1, 0.42);
  points.userData.visualAnalogy = 'PARALLAX_STAR_PRESENTATION_NOT_ASTRONOMICAL_CATALOG';
  animated.push({ object: points, mode: 'ROTATE_Y', speed: 0.0018, phase: 0, baseY: 0 });

  if (descriptor.kind === 'WORMHOLE_RINGS') {
    const halos = new THREE.Group(); halos.name = 'premium-wormhole-lensing-halo-guides';
    const mat = new THREE.MeshBasicMaterial({ color: descriptor.palette[1], transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i += 1) {
      const haloMaterial = i === 0 ? mat : mat.clone();
      const halo = new THREE.Mesh(new THREE.TorusGeometry(5.2 + i * 1.05, 0.025 + i * 0.006, 6, budget.heroSegments * 2), haloMaterial);
      halo.rotation.x = Math.PI / 2 + i * 0.08; halo.position.y = 10; halos.add(halo);
    }
    halos.userData.visualAnalogy = 'ARTISTIC_LENSING_GUIDE_NOT_GENERAL_RELATIVITY_OUTPUT';
    root.add(halos);
    animated.push({ object: halos, mode: 'ROTATE_Y', speed: 0.035, phase: 0, baseY: 10 });
  } else if (descriptor.kind === 'GRAVITY_WELL_GRID') {
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(13, budget.heroSegments, Math.max(16, Math.round(budget.heroSegments / 2))),
      new THREE.MeshBasicMaterial({
        color: descriptor.palette[1],
        transparent: true,
        opacity: 0.035,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.name = 'premium-cosmology-field-context-shell';
    halo.userData.visualAnalogy = 'FIELD_CONTEXT_GUIDE_NOT_SOLVER_OUTPUT';
    root.add(halo);
    animated.push({ object: halo, mode: 'ROTATE_Y', speed: 0.012, phase: 0, baseY: 0 });
  }
}

function addQuantumDetail(
  THREE: typeof THREE_NS,
  root: THREE_NS.Group,
  descriptor: SpacetimeWorldDescriptor,
  budget: ReturnType<typeof premiumVisualBudget>,
  seed: number,
  animated: AnimatedAccent[],
): void {
  const count = Math.min(720, budget.atmospherePoints);
  const incoming = addPointCloud(THREE, root, 'premium-quantum-incoming-probability-context', Math.round(count * 0.62), seed ^ 0x91a7, [20, 4.5, 4], [-13, 7, 0], descriptor.palette[1], 0.075, 0.2);
  const transmitted = addPointCloud(THREE, root, 'premium-quantum-transmitted-probability-context', Math.round(count * 0.38), seed ^ 0xa113, [16, 3.5, 3.5], [13, 7, 0], descriptor.palette[2], 0.065, 0.14);
  incoming.userData.visualAnalogy = 'WAVEFUNCTION_CONTEXT_NOT_NUMERICAL_SOLVER_SAMPLES';
  transmitted.userData.visualAnalogy = 'TUNNELLING_CONTEXT_NOT_PARTICLE_TRAJECTORIES';
  animated.push({ object: incoming, mode: 'FLOAT', speed: 0.32, phase: 0, baseY: 0 });
  animated.push({ object: transmitted, mode: 'FLOAT', speed: 0.24, phase: Math.PI, baseY: 0 });
}

function addRelativisticClockDetail(
  THREE: typeof THREE_NS,
  root: THREE_NS.Group,
  descriptor: SpacetimeWorldDescriptor,
  budget: ReturnType<typeof premiumVisualBudget>,
): void {
  const clocks = descriptor.primitives.filter((primitive) => primitive.shape === 'CLOCK');
  const count = Math.max(1, clocks.length);
  const rings = new THREE.InstancedMesh(
    new THREE.TorusGeometry(5.1, 0.035, 6, budget.heroSegments * 2),
    new THREE.MeshBasicMaterial({ color: descriptor.palette[1], transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }),
    count,
  );
  rings.name = 'premium-relativistic-reference-frame-rings';
  setInstances(THREE, rings, (clocks.length > 0 ? clocks : [{ position: [0, 0, 0] as const }]).map((primitive, index) => ({
    position: [primitive.position[0], 0.12, primitive.position[2]] as THREE_NS.Vector3Tuple,
    rotation: [Math.PI / 2, 0, 0] as THREE_NS.Vector3Tuple,
    scale: 0.84 + index * 0.08,
  })));
  rings.userData.visualAnalogy = 'REFERENCE_FRAME_GUIDE_NOT_MEASURED_CLOCK_DATA';
  root.add(rings);
}

function addTimelineDetail(
  THREE: typeof THREE_NS,
  root: THREE_NS.Group,
  descriptor: SpacetimeWorldDescriptor,
  budget: ReturnType<typeof premiumVisualBudget>,
  seed: number,
  animated: AnimatedAccent[],
): void {
  const stars = addPointCloud(THREE, root, 'premium-timeline-counterfactual-depth-field', Math.min(900, budget.atmospherePoints), seed ^ 0x71e1, [62, 32, 84], [0, 8, 8], descriptor.palette[1], 0.07, 0.22);
  stars.userData.visualAnalogy = 'COUNTERFACTUAL_DEPTH_PRESENTATION_NOT_OBSERVED_UNIVERSES';
  const branches = descriptor.primitives.filter((primitive) => primitive.shape === 'BRANCH');
  if (branches.length > 0) {
    const beacons = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.42, 0),
      new THREE.MeshStandardMaterial({ color: descriptor.palette[2], emissive: descriptor.palette[2], emissiveIntensity: 0.48, roughness: 0.28 }),
      branches.length,
    );
    beacons.name = 'premium-timeline-branch-endpoint-beacons';
    setInstances(THREE, beacons, branches.map((primitive) => ({
      position: [primitive.position[0], primitive.position[1] + 5, primitive.position[2] + 12] as THREE_NS.Vector3Tuple,
      rotation: [0, primitive.position[0] * 0.03, 0] as THREE_NS.Vector3Tuple,
    })));
    beacons.userData.visualAnalogy = 'SIMULATION_BRANCH_MARKERS_NOT_OBSERVED_UNIVERSES';
    root.add(beacons);
    animated.push({ object: beacons, mode: 'ROTATE_Y', speed: 0.08, phase: 0, baseY: 0 });
  }
  animated.push({ object: stars, mode: 'ROTATE_Y', speed: 0.0016, phase: 0, baseY: 0 });
}

function addGenericModelDetail(
  THREE: typeof THREE_NS,
  root: THREE_NS.Group,
  descriptor: SpacetimeWorldDescriptor,
  budget: ReturnType<typeof premiumVisualBudget>,
  seed: number,
  animated: AnimatedAccent[],
): void {
  const points = addPointCloud(THREE, root, 'premium-model-context-particles', Math.min(420, Math.round(budget.atmospherePoints * 0.55)), seed ^ 0x9912, [18, 12, 18], [0, 4, 0], descriptor.palette[1], 0.055, 0.16);
  points.userData.visualAnalogy = 'PRESENTATION_PARTICLES_NOT_SOLVER_SAMPLES';
  animated.push({ object: points, mode: 'ROTATE_Y', speed: 0.006, phase: 0, baseY: 0 });
}

/**
 * Adds one removable child group to the canonical SpacetimeWorldVisualLayer. No WorldGraph mutation,
 * no solver step and no duplicate world/renderer are introduced.
 */
export function createPremiumSpacetimeDetail(
  THREE: typeof THREE_NS,
  descriptor: SpacetimeWorldDescriptor,
  graph: WorldGraph,
  tier: RenderTier,
): PremiumSpacetimeDetailHandle {
  const root = new THREE.Group();
  root.name = `premium-spacetime-detail:${descriptor.kind.toLowerCase()}`;
  markPremiumPresentation(root, {
    domain: `SPACETIME_${descriptor.kind}`,
    epistemic: descriptor.epistemic,
    sourceEntityIds: descriptor.sourceEntityIds,
    visualAnalogy: 'PREMIUM_PRESENTATION_LAYER_DERIVED_FROM_CANONICAL_WORLDGRAPH',
    fictionInspired: descriptor.kind === 'ALIEN_DESERT',
  });
  root.userData.graphEntityCountAtBuild = graph.listEntities().length;

  const budget = premiumVisualBudget(tier);
  const seed = visualSeed(`${descriptor.kind}:${descriptor.sourceEntityIds.join('|')}:${graph.listEntities().length}`);
  const animated: AnimatedAccent[] = [];

  switch (descriptor.kind) {
    case 'HISTORICAL_CITY': addHistoricalDetail(THREE, root, budget, animated); break;
    case 'ALIEN_DESERT': addAlienDetail(THREE, root, budget, seed, animated); break;
    case 'MARS_STATION': addMarsDetail(THREE, root, budget, seed, animated); break;
    case 'UNDERWATER_CITY': addUnderwaterDetail(THREE, root, budget, seed, animated); break;
    case 'WORMHOLE_RINGS':
    case 'GRAVITY_WELL_GRID': addDeepSpaceDetail(THREE, root, descriptor, budget, seed, animated); break;
    case 'QUANTUM_BARRIER': addQuantumDetail(THREE, root, descriptor, budget, seed, animated); break;
    case 'RELATIVISTIC_CLOCKS': addRelativisticClockDetail(THREE, root, descriptor, budget); break;
    case 'TIMELINE_BRANCHES': addTimelineDetail(THREE, root, descriptor, budget, seed, animated); break;
    default: addGenericModelDetail(THREE, root, descriptor, budget, seed, animated); break;
  }

  root.traverse((object) => {
    object.userData.premiumVisualPass ??= root.userData.premiumVisualPass;
    object.userData.presentationOnly ??= true;
    object.userData.visualOnlyContext ??= true;
    object.userData.directObservation ??= false;
    object.userData.scientificStateMutation ??= false;
    object.userData.epistemic ??= descriptor.epistemic;
    object.userData.sourceEntityIds ??= [...descriptor.sourceEntityIds];
  });

  return {
    root,
    summary: { kind: descriptor.kind, detailObjectCount: root.children.length, tier },
    update(elapsedSeconds: number) {
      for (const entry of animated) {
        const phase = entry.phase + elapsedSeconds * entry.speed;
        if (entry.mode === 'ROTATE_Y') entry.object.rotation.y = phase;
        else if (entry.mode === 'FLOAT') entry.object.position.y = entry.baseY + Math.sin(phase) * 0.18;
        else if (entry.material && 'opacity' in entry.material) entry.material.opacity = 0.055 + 0.04 * (0.5 + 0.5 * Math.sin(phase));
      }
    },
  };
}
