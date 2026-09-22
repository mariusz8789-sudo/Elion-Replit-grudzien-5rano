import type * as THREE_NS from 'three';
import type { SpacetimeRenderPrimitive, SpacetimeWorldDescriptor } from '../temporalCinematic/spacetimeWorldDescriptor';
import type { WorldGraph } from '../worldModel/ecs/worldGraph';
import { disposeSceneResources } from './graphics/lifecycle';

export interface SpacetimeWorldVisualSummary {
  readonly kind: SpacetimeWorldDescriptor['kind'];
  readonly epistemic: SpacetimeWorldDescriptor['epistemic'];
  readonly sourceEntityIds: readonly string[];
  readonly objectCount: number;
  readonly limitations: readonly string[];
}

export interface SpacetimeWorldVisualHandle {
  readonly root: THREE_NS.Group;
  readonly summary: SpacetimeWorldVisualSummary;
  update(elapsedSeconds: number): void;
  dispose(): void;
}

interface AnimatedObject {
  readonly object: THREE_NS.Object3D;
  readonly phase: number;
  readonly speed: number;
  readonly baseY: number;
  readonly mode: 'ROTATE_Y' | 'ROTATE_Z' | 'PULSE' | 'FLOAT';
}

function material(
  THREE: typeof THREE_NS,
  color: string,
  options: { emissive?: string; opacity?: number; metalness?: number; roughness?: number } = {},
): THREE_NS.MeshStandardMaterial {
  const opacity = options.opacity ?? 1;
  return new THREE.MeshStandardMaterial({
    color,
    emissive: options.emissive ?? '#000000',
    emissiveIntensity: options.emissive ? 1.15 : 0,
    metalness: options.metalness ?? 0.18,
    roughness: options.roughness ?? 0.48,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 0.8,
    side: THREE.DoubleSide,
  });
}

function lineMaterial(THREE: typeof THREE_NS, color: string, opacity = 1): THREE_NS.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 0.8 });
}

function markScientificDisclosure(root: THREE_NS.Group, descriptor: SpacetimeWorldDescriptor): void {
  root.name = `genesis-spacetime-${descriptor.kind.toLowerCase()}`;
  root.userData.spacetimeVisual = true;
  root.userData.illustrativeVisualization = true;
  root.userData.epistemic = descriptor.epistemic;
  root.userData.sourceEntityIds = [...descriptor.sourceEntityIds];
  root.userData.limitations = [...descriptor.limitations];
}

function pointOf(THREE: typeof THREE_NS, primitive: SpacetimeRenderPrimitive): THREE_NS.Vector3 {
  return new THREE.Vector3(...primitive.position);
}

function createWormhole(
  THREE: typeof THREE_NS,
  root: THREE_NS.Group,
  descriptor: SpacetimeWorldDescriptor,
  animated: AnimatedObject[],
): void {
  const cyan = material(THREE, descriptor.palette[1], { emissive: descriptor.palette[1], opacity: 0.54, metalness: 0.72, roughness: 0.16 });
  const violet = material(THREE, descriptor.palette[2], { emissive: descriptor.palette[2], opacity: 0.38, metalness: 0.54, roughness: 0.2 });
  descriptor.primitives.forEach((primitive, index) => {
    const radius = Math.max(0.4, primitive.scale[0]);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, Math.max(0.025, radius * 0.012), 6, 48), index % 2 ? violet : cyan);
    ring.position.copy(pointOf(THREE, primitive));
    ring.scale.setScalar(0.62 + primitive.intensity * 0.38);
    ring.userData.sourcePrimitiveId = primitive.id;
    root.add(ring);
    animated.push({ object: ring, phase: index * 0.21, speed: index % 2 ? -0.08 : 0.1, baseY: ring.position.y, mode: 'ROTATE_Z' });
  });

  const throatRadius = Math.max(3, descriptor.primitives[Math.floor(descriptor.primitives.length / 2)]?.scale[0] ?? 8);
  const throat = new THREE.Mesh(
    new THREE.CylinderGeometry(throatRadius * 0.48, throatRadius * 0.48, throatRadius * 3.6, 48, 1, true),
    material(THREE, '#071224', { emissive: descriptor.palette[1], opacity: 0.18, metalness: 0.3, roughness: 0.08 }),
  );
  throat.position.y = 10;
  throat.rotation.x = Math.PI / 2;
  root.add(throat);
  animated.push({ object: throat, phase: 0, speed: 0.05, baseY: throat.position.y, mode: 'ROTATE_Y' });

  const stars = new Float32Array(360 * 3);
  for (let index = 0; index < 360; index += 1) {
    const angle = index * 2.399963;
    const radius = throatRadius * (1.25 + ((index * 37) % 100) / 32);
    stars[index * 3] = Math.cos(angle) * radius;
    stars[index * 3 + 1] = 10 + Math.sin(angle * 1.7) * radius * 0.55;
    stars[index * 3 + 2] = (((index * 53) % 200) / 100 - 1) * throatRadius * 4;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(stars, 3));
  const starField = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: descriptor.palette[1], size: 0.12, transparent: true, opacity: 0.7, depthWrite: false }));
  root.add(starField);
  animated.push({ object: starField, phase: 0, speed: 0.025, baseY: 0, mode: 'ROTATE_Z' });
}

function createGravityWell(
  THREE: typeof THREE_NS,
  root: THREE_NS.Group,
  descriptor: SpacetimeWorldDescriptor,
  animated: AnimatedObject[],
): void {
  const size = Math.round(Math.sqrt(descriptor.primitives.length));
  const points = descriptor.primitives.map((primitive) => pointOf(THREE, primitive));
  const gridMaterial = lineMaterial(THREE, descriptor.palette[1], 0.68);
  for (let row = 0; row < size; row += 1) {
    const horizontal = points.slice(row * size, row * size + size);
    if (horizontal.length > 1) root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(horizontal), gridMaterial));
  }
  for (let column = 0; column < size; column += 1) {
    const vertical: THREE_NS.Vector3[] = [];
    for (let row = 0; row < size; row += 1) {
      const point = points[row * size + column];
      if (point) vertical.push(point);
    }
    if (vertical.length > 1) root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertical), gridMaterial));
  }

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(4.2, 48, 32),
    material(THREE, '#010207', { emissive: descriptor.palette[2], metalness: 0.86, roughness: 0.08 }),
  );
  core.position.y = -17;
  root.add(core);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(9.5, 0.35, 12, 96),
    material(THREE, descriptor.palette[2], { emissive: descriptor.palette[2], opacity: 0.58, roughness: 0.14 }),
  );
  halo.position.y = -12;
  halo.rotation.x = Math.PI / 2.5;
  root.add(halo);
  animated.push({ object: halo, phase: 0, speed: 0.16, baseY: halo.position.y, mode: 'ROTATE_Z' });

  const haloPoints = new Float32Array(600 * 3);
  for (let index = 0; index < 600; index += 1) {
    const angle = index * 2.399963;
    const radial = 13 + ((index * 43) % 100) * 0.22;
    haloPoints[index * 3] = Math.cos(angle) * radial;
    haloPoints[index * 3 + 1] = -6 + ((((index * 29) % 100) / 100) - 0.5) * 18;
    haloPoints[index * 3 + 2] = Math.sin(angle) * radial;
  }
  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute('position', new THREE.BufferAttribute(haloPoints, 3));
  const inferredHalo = new THREE.Points(pointGeometry, new THREE.PointsMaterial({ color: descriptor.palette[2], size: 0.18, transparent: true, opacity: 0.34, depthWrite: false }));
  inferredHalo.userData.epistemic = 'MODEL_INFERRED_DISTRIBUTION';
  root.add(inferredHalo);
  animated.push({ object: inferredHalo, phase: 0, speed: 0.018, baseY: 0, mode: 'ROTATE_Y' });
}

function createQuantum(
  THREE: typeof THREE_NS,
  root: THREE_NS.Group,
  descriptor: SpacetimeWorldDescriptor,
  animated: AnimatedObject[],
): void {
  const barrier = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 14, 12),
    material(THREE, descriptor.palette[2], { emissive: descriptor.palette[2], opacity: 0.22, metalness: 0.12, roughness: 0.18 }),
  );
  barrier.position.y = 7;
  barrier.userData.quantumBarrier = true;
  root.add(barrier);

  const waveMaterial = lineMaterial(THREE, descriptor.palette[1], 0.95);
  for (let branch = 0; branch < 2; branch += 1) {
    const points = Array.from({ length: 160 }, (_, index) => {
      const x = -34 + index * (68 / 159);
      const envelope = Math.exp(-((x + 13) ** 2) / 180) + Math.exp(-((x - 12) ** 2) / 260) * 0.58;
      const y = 7 + (branch ? -1 : 1) * envelope * Math.sin(x * 0.72) * 4.5;
      return new THREE.Vector3(x, y, branch ? 2.2 : -2.2);
    });
    const wave = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), waveMaterial);
    wave.userData.epistemic = 'MODEL_WAVEFUNCTION_PRESENTATION';
    root.add(wave);
    animated.push({ object: wave, phase: branch * Math.PI, speed: branch ? -0.55 : 0.55, baseY: wave.position.y, mode: 'FLOAT' });
  }

  const packet = new THREE.Mesh(new THREE.SphereGeometry(1.35, 24, 16), material(THREE, descriptor.palette[1], { emissive: descriptor.palette[1], opacity: 0.68 }));
  packet.position.set(-15, 7, 0);
  root.add(packet);
  animated.push({ object: packet, phase: 0, speed: 0.8, baseY: packet.position.y, mode: 'PULSE' });
}

function createClocks(
  THREE: typeof THREE_NS,
  root: THREE_NS.Group,
  descriptor: SpacetimeWorldDescriptor,
  animated: AnimatedObject[],
): void {
  descriptor.primitives.forEach((primitive, index) => {
    const clock = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.28, 12, 64), material(THREE, index ? descriptor.palette[2] : descriptor.palette[1], { emissive: index ? descriptor.palette[2] : descriptor.palette[1], metalness: 0.68, roughness: 0.18 }));
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.1, 0.16), material(THREE, '#f4fbff', { emissive: '#d5f7ff' }));
    hand.position.y = 1.4;
    clock.add(rim, hand);
    clock.position.copy(pointOf(THREE, primitive));
    clock.position.y = Math.max(6, clock.position.y + 5);
    clock.userData.sourcePrimitiveId = primitive.id;
    root.add(clock);
    animated.push({ object: hand, phase: index * 0.6, speed: index ? -0.9 : -1.5, baseY: hand.position.y, mode: 'ROTATE_Z' });
  });
}

function createTimelines(
  THREE: typeof THREE_NS,
  root: THREE_NS.Group,
  descriptor: SpacetimeWorldDescriptor,
  animated: AnimatedObject[],
): void {
  const branches = descriptor.primitives.filter((primitive) => primitive.shape === 'BRANCH');
  const origin = new THREE.Vector3(0, 4, -20);
  branches.forEach((primitive, index) => {
    const destination = pointOf(THREE, primitive).add(new THREE.Vector3(0, 5, 12));
    const curve = new THREE.CatmullRomCurve3([
      origin,
      new THREE.Vector3((destination.x - origin.x) * 0.2, 5 + index * 0.35, -8),
      new THREE.Vector3(destination.x * 0.6, 7 + (index % 2) * 4, 5),
      destination,
    ]);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 42, 0.18, 8, false),
      material(THREE, index % 2 ? descriptor.palette[2] : descriptor.palette[1], { emissive: index % 2 ? descriptor.palette[2] : descriptor.palette[1], opacity: 0.76, roughness: 0.2 }),
    );
    tube.userData.sourcePrimitiveId = primitive.id;
    root.add(tube);
    const node = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 14), material(THREE, descriptor.palette[2], { emissive: descriptor.palette[2], opacity: 0.82 }));
    node.position.copy(destination);
    root.add(node);
    animated.push({ object: node, phase: index * 0.65, speed: 0.72, baseY: node.position.y, mode: 'PULSE' });
  });
}

function createHistoricalCity(THREE: typeof THREE_NS, root: THREE_NS.Group, descriptor: SpacetimeWorldDescriptor, graph: WorldGraph): void {
  // CITY geometry is already rendered by the canonical WorldFrame path. This layer adds only an
  // archival/reconstruction treatment around the semantic marker instead of inventing buildings.
  const marker = descriptor.primitives.find((primitive) => primitive.id.includes('reconstruction'));
  const center = marker ? pointOf(THREE, marker) : new THREE.Vector3();
  const boundary = new THREE.Mesh(
    new THREE.TorusGeometry(18, 0.1, 8, 72),
    material(THREE, descriptor.palette[1], { emissive: '#6f4d2b', opacity: 0.36, roughness: 0.72 }),
  );
  boundary.position.copy(center).add(new THREE.Vector3(0, 0.18, 0));
  boundary.rotation.x = Math.PI / 2;
  boundary.userData.reconstructionBoundary = true;
  root.add(boundary);

  const archivalPoints = new Float32Array(90 * 3);
  for (let index = 0; index < 90; index += 1) {
    const angle = index * 2.399963;
    const radius = 4 + ((index * 31) % 100) * 0.18;
    archivalPoints[index * 3] = center.x + Math.cos(angle) * radius;
    archivalPoints[index * 3 + 1] = 0.3 + ((index * 17) % 10) * 0.12;
    archivalPoints[index * 3 + 2] = center.z + Math.sin(angle) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(archivalPoints, 3));
  const archivalHaze = new THREE.Points(geometry, new THREE.PointsMaterial({ color: descriptor.palette[1], size: 0.24, transparent: true, opacity: 0.16, depthWrite: false }));
  archivalHaze.userData.reconstructionAtmosphere = true;
  root.add(archivalHaze);

  // Deterministic visual reconstruction context derived from canonical ROAD geometry. These
  // meshes are deliberately NOT graph entities and carry no claim that a particular building,
  // person or smoke source occupied this exact location.
  const timber = material(THREE, '#503424', { roughness: 0.86 });
  const plaster = material(THREE, '#9b7d58', { roughness: 0.92 });
  const roof = material(THREE, '#211b1a', { roughness: 0.82 });
  const roads = graph.listEntities().filter((entity) => entity.geometry?.kind === 'ROAD').slice(0, 8);
  let houseIndex = 0;
  for (const entity of roads) {
    const road = entity.geometry;
    if (road?.kind !== 'ROAD') continue;
    const dx = road.end.x - road.start.x;
    const dz = road.end.z - road.start.z;
    const length = Math.hypot(dx, dz);
    if (length < 8) continue;
    const ux = dx / length;
    const uz = dz / length;
    const px = -uz;
    const pz = ux;
    const placements = Math.min(5, Math.max(2, Math.floor(length / 18)));
    for (let slot = 0; slot < placements; slot += 1) {
      const t = (slot + 0.55) / placements;
      for (const side of [-1, 1]) {
        const width = 4.6 + ((houseIndex * 13) % 4) * 0.45;
        const height = 5.8 + ((houseIndex * 17) % 5) * 0.6;
        const depth = 5.2;
        const offset = road.widthM * 0.5 + depth * 0.65 + 1.4;
        const x = road.start.x + dx * t + px * offset * side;
        const z = road.start.z + dz * t + pz * offset * side;
        const house = new THREE.Group();
        house.name = `reconstruction-townhouse-${houseIndex}`;
        house.userData.visualOnlyContext = true;
        house.userData.epistemic = 'RECONSTRUCTION';
        const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), houseIndex % 3 === 0 ? timber : plaster);
        body.position.y = height / 2;
        body.castShadow = true;
        body.receiveShadow = true;
        const cap = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * 0.72, 2.4, 4), roof);
        cap.position.y = height + 1.15;
        cap.rotation.y = Math.PI / 4;
        cap.castShadow = true;
        house.add(body, cap);
        house.position.set(x, 0, z);
        house.rotation.y = Math.atan2(dx, dz);
        root.add(house);
        houseIndex += 1;
      }
    }
  }

  const figureMaterial = material(THREE, '#242020', { roughness: 0.9 });
  for (let index = 0; index < 34; index += 1) {
    const angle = index * 2.399963;
    const radius = 7 + ((index * 31) % 100) * 0.22;
    const figure = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.2, 7), figureMaterial);
    body.position.y = 0.8;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), figureMaterial);
    head.position.y = 1.58;
    figure.add(body, head);
    figure.position.set(center.x + Math.cos(angle) * radius, 0, center.z + Math.sin(angle) * radius);
    figure.userData.visualOnlyContext = true;
    figure.userData.epistemic = 'RECONSTRUCTION';
    root.add(figure);
  }

  const smokeMaterial = new THREE.MeshStandardMaterial({ color: 0x6b6864, transparent: true, opacity: 0.18, depthWrite: false, roughness: 1 });
  for (let plume = 0; plume < 5; plume += 1) {
    for (let puff = 0; puff < 7; puff += 1) {
      const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.8 + puff * 0.22, 12, 8), smokeMaterial);
      smoke.position.set(center.x - 15 + plume * 7 + Math.sin(puff) * 0.7, 1.4 + puff * 1.25, center.z + 8 + Math.cos(plume) * 5);
      smoke.scale.set(1.4, 0.75, 1);
      smoke.userData.visualOnlyContext = true;
      smoke.userData.epistemic = 'RECONSTRUCTION';
      root.add(smoke);
    }
  }
}

function createAlienDesert(
  THREE: typeof THREE_NS,
  root: THREE_NS.Group,
  descriptor: SpacetimeWorldDescriptor,
  graph: WorldGraph,
  animated: AnimatedObject[],
): void {
  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(170, 130, 32, 24), material(THREE, '#7f3d1f', { roughness: 1 }));
  const positions = terrain.geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    positions.setZ(index, Math.sin(x * 0.09) * 1.4 + Math.cos(y * 0.13) * 1.1);
  }
  positions.needsUpdate = true;
  terrain.geometry.computeVertexNormals();
  terrain.rotation.x = -Math.PI / 2;
  terrain.receiveShadow = true;
  root.add(terrain);
  const stone = material(THREE, '#362b29', { metalness: 0.12, roughness: 0.76 });
  const structureCount = Math.max(1, Math.round(graph.tryGetEntity('ruins:alien-desert-complex')?.domainState?.structureCount ?? 1));
  for (let index = 0; index < structureCount; index += 1) {
    const ruin = new THREE.Mesh(new THREE.BoxGeometry(2.2 + (index % 3), 8 + (index % 4) * 2.4, 2.4), stone);
    ruin.position.set((index - 4) * 6, ruin.geometry.parameters.height / 2, 4 + Math.sin(index) * 12);
    ruin.rotation.y = index * 0.28;
    ruin.castShadow = true;
    ruin.userData.fictionInspired = true;
    root.add(ruin);
  }
  descriptor.primitives.filter((primitive) => primitive.shape === 'SUN').forEach((primitive, index) => {
    const sun = new THREE.Mesh(new THREE.SphereGeometry(index ? 4.5 : 6.5, 32, 20), material(THREE, index ? '#7fcfff' : '#ffb24d', { emissive: index ? '#5fbfff' : '#ff7d2d', roughness: 0.3 }));
    sun.position.copy(pointOf(THREE, primitive));
    root.add(sun);
    animated.push({ object: sun, phase: index * 1.7, speed: 0.14, baseY: sun.position.y, mode: 'PULSE' });
  });
}

function createMarsStation(THREE: typeof THREE_NS, root: THREE_NS.Group, descriptor: SpacetimeWorldDescriptor, graph: WorldGraph): void {
  const terrain = new THREE.Mesh(new THREE.CircleGeometry(78, 64), material(THREE, '#6f2d20', { roughness: 1 }));
  terrain.rotation.x = -Math.PI / 2;
  terrain.receiveShadow = true;
  root.add(terrain);
  const habitatMaterial = material(THREE, '#c4cdd2', { metalness: 0.62, roughness: 0.28 });
  const glass = material(THREE, descriptor.palette[2], { emissive: '#173e55', opacity: 0.42, metalness: 0.1, roughness: 0.12 });
  const moduleCount = Math.max(1, Math.round(graph.tryGetEntity('building:mars-research-station')?.domainState?.habitatModules ?? 1));
  for (let index = 0; index < moduleCount; index += 1) {
    const module = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 10, 32), habitatMaterial);
    module.rotation.z = Math.PI / 2;
    module.position.set((index - 1.5) * 11, 4, Math.sin(index * 1.8) * 9);
    module.castShadow = true;
    module.userData.simulatedResearchHabitat = true;
    root.add(module);
    const window = new THREE.Mesh(new THREE.CircleGeometry(1.7, 24), glass);
    window.position.set(module.position.x + 5.02, module.position.y, module.position.z);
    window.rotation.y = Math.PI / 2;
    root.add(window);
  }
  for (let side = -1; side <= 1; side += 2) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(16, 0.18, 7), material(THREE, '#143f71', { emissive: '#06264a', metalness: 0.72, roughness: 0.18 }));
    panel.position.set(side * 19, 2.6, 15);
    panel.rotation.z = side * 0.08;
    root.add(panel);
  }
}

/**
 * Presentation-only layer for a descriptor derived from the canonical WorldGraph.
 * It never creates state, advances a solver, or changes epistemic/provenance data.
 */
export function createSpacetimeWorldVisualLayer(
  THREE: typeof THREE_NS,
  descriptor: SpacetimeWorldDescriptor,
  graph: WorldGraph,
): SpacetimeWorldVisualHandle {
  const root = new THREE.Group();
  markScientificDisclosure(root, descriptor);
  const animated: AnimatedObject[] = [];
  switch (descriptor.kind) {
    case 'WORMHOLE_RINGS': createWormhole(THREE, root, descriptor, animated); break;
    case 'GRAVITY_WELL_GRID': createGravityWell(THREE, root, descriptor, animated); break;
    case 'QUANTUM_BARRIER': createQuantum(THREE, root, descriptor, animated); break;
    case 'RELATIVISTIC_CLOCKS': createClocks(THREE, root, descriptor, animated); break;
    case 'TIMELINE_BRANCHES': createTimelines(THREE, root, descriptor, animated); break;
    case 'HISTORICAL_CITY': createHistoricalCity(THREE, root, descriptor, graph); break;
    case 'ALIEN_DESERT': createAlienDesert(THREE, root, descriptor, graph, animated); break;
    case 'MARS_STATION': createMarsStation(THREE, root, descriptor, graph); break;
  }
  root.traverse((object) => {
    object.userData.epistemic ??= descriptor.epistemic;
    object.userData.sourceEntityIds ??= [...descriptor.sourceEntityIds];
  });
  const summary: SpacetimeWorldVisualSummary = {
    kind: descriptor.kind,
    epistemic: descriptor.epistemic,
    sourceEntityIds: [...descriptor.sourceEntityIds],
    objectCount: root.children.length,
    limitations: [...descriptor.limitations],
  };
  let disposed = false;
  return {
    root,
    summary,
    update(elapsedSeconds) {
      if (disposed) return;
      for (const entry of animated) {
        const phase = entry.phase + elapsedSeconds * entry.speed;
        if (entry.mode === 'ROTATE_Y') entry.object.rotation.y = phase;
        else if (entry.mode === 'ROTATE_Z') entry.object.rotation.z = phase;
        else if (entry.mode === 'FLOAT') entry.object.position.y = entry.baseY + Math.sin(phase) * 0.35;
        else {
          const scale = 1 + Math.sin(phase) * 0.08;
          entry.object.scale.setScalar(scale);
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      disposeSceneResources(root);
    },
  };
}
