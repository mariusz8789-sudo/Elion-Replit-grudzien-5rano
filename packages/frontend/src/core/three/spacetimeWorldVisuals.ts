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
  const ringMaterial = material(THREE, descriptor.palette[1], { emissive: descriptor.palette[1], opacity: 0.5, metalness: 0.72, roughness: 0.16 });
  const ringGeometry = new THREE.TorusGeometry(1, 0.016, 6, 48);
  const rings = new THREE.InstancedMesh(ringGeometry, ringMaterial, descriptor.primitives.length);
  rings.name = 'wormhole-instanced-embedding-rings';
  rings.userData.sourcePrimitiveIds = descriptor.primitives.map((primitive) => primitive.id);
  rings.userData.visualAnalogy = 'EMBEDDING_DIAGRAM_NOT_SPACETIME_OBSERVATION';
  const transform = new THREE.Object3D();
  descriptor.primitives.forEach((primitive, index) => {
    const radius = Math.max(0.4, primitive.scale[0]);
    const displayedRadius = radius * (0.62 + primitive.intensity * 0.38);
    transform.position.copy(pointOf(THREE, primitive));
    transform.scale.setScalar(displayedRadius);
    transform.updateMatrix();
    rings.setMatrixAt(index, transform.matrix);
    rings.setColorAt(index, new THREE.Color(index % 2 ? descriptor.palette[2] : descriptor.palette[1]));
  });
  rings.instanceMatrix.needsUpdate = true;
  if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
  root.add(rings);
  animated.push({ object: rings, phase: 0, speed: 0.11, baseY: rings.position.y, mode: 'PULSE' });

  const throatRadius = Math.max(3, descriptor.primitives[Math.floor(descriptor.primitives.length / 2)]?.scale[0] ?? 8);
  const throat = new THREE.Mesh(
    new THREE.CylinderGeometry(throatRadius * 0.48, throatRadius * 0.48, throatRadius * 3.6, 48, 1, true),
    material(THREE, '#071224', { emissive: descriptor.palette[1], opacity: 0.18, metalness: 0.3, roughness: 0.08 }),
  );
  throat.position.y = 10;
  throat.rotation.x = Math.PI / 2;
  throat.name = 'wormhole-illustrative-throat';
  throat.userData.visualAnalogy = 'ILLUSTRATIVE_THROAT_NOT_TRAVERSABILITY_CLAIM';
  root.add(throat);
  animated.push({ object: throat, phase: 0, speed: 0.05, baseY: throat.position.y, mode: 'ROTATE_Y' });

  const stars = new Float32Array(1600 * 3);
  for (let index = 0; index < 1600; index += 1) {
    const angle = index * 2.399963;
    const radius = throatRadius * (1.4 + ((index * 37) % 100) / 17);
    stars[index * 3] = Math.cos(angle) * radius;
    stars[index * 3 + 1] = 10 + Math.sin(angle * 1.7) * radius * 0.55;
    stars[index * 3 + 2] = (((index * 53) % 200) / 100 - 1) * throatRadius * 8;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(stars, 3));
  const starField = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: '#d8f5ff', size: 0.13, sizeAttenuation: true, transparent: true, opacity: 0.72, depthWrite: false }));
  starField.name = 'wormhole-deep-starfield';
  starField.userData.visualOnlyContext = true;
  root.add(starField);
  animated.push({ object: starField, phase: 0, speed: 0.025, baseY: 0, mode: 'ROTATE_Z' });

  const diskPoints = new Float32Array(1200 * 3);
  for (let index = 0; index < 1200; index += 1) {
    const u = ((index * 71) % 1200) / 1200;
    const angle = index * 2.399963 + u * Math.PI * 8;
    const radius = throatRadius * (0.6 + u * 2.4);
    diskPoints[index * 3] = Math.cos(angle) * radius;
    diskPoints[index * 3 + 1] = 10 + Math.sin(angle) * radius;
    diskPoints[index * 3 + 2] = ((((index * 47) % 100) / 100) - 0.5) * throatRadius * 0.22;
  }
  const diskGeometry = new THREE.BufferGeometry();
  diskGeometry.setAttribute('position', new THREE.BufferAttribute(diskPoints, 3));
  const accretionStyle = new THREE.Points(diskGeometry, new THREE.PointsMaterial({ color: descriptor.palette[2], size: 0.19, transparent: true, opacity: 0.62, depthWrite: false }));
  accretionStyle.name = 'wormhole-accretion-style-presentation';
  accretionStyle.userData.visualAnalogy = 'ARTISTIC_ACCRETION_STYLE_NOT_GENERAL_RELATIVITY_OUTPUT';
  root.add(accretionStyle);
  animated.push({ object: accretionStyle, phase: 0, speed: 0.08, baseY: 0, mode: 'ROTATE_Z' });

  for (let layer = 0; layer < 2; layer += 1) {
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(throatRadius * (0.7 + layer * 0.32), 28, 18),
      new THREE.MeshBasicMaterial({ color: layer ? descriptor.palette[2] : descriptor.palette[1], transparent: true, opacity: layer ? 0.045 : 0.07, depthWrite: false, side: THREE.BackSide }),
    );
    glow.name = `wormhole-illustrative-glow-${layer}`;
    glow.position.y = 10;
    glow.userData.visualAnalogy = 'ARTISTIC_GLOW_NOT_SCIENTIFIC_MEASUREMENT';
    root.add(glow);
  }
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
  const gridSegments: THREE_NS.Vector3[] = [];
  for (let row = 0; row < size; row += 1) {
    const horizontal = points.slice(row * size, row * size + size);
    for (let index = 1; index < horizontal.length; index += 1) gridSegments.push(horizontal[index - 1]!, horizontal[index]!);
  }
  for (let column = 0; column < size; column += 1) {
    const vertical: THREE_NS.Vector3[] = [];
    for (let row = 0; row < size; row += 1) {
      const point = points[row * size + column];
      if (point) vertical.push(point);
    }
    for (let index = 1; index < vertical.length; index += 1) gridSegments.push(vertical[index - 1]!, vertical[index]!);
  }
  const curvatureGrid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridSegments), gridMaterial);
  curvatureGrid.name = 'cosmology-model-curvature-grid';
  curvatureGrid.userData.visualAnalogy = 'AMPLIFIED_EMBEDDING_GRID_NOT_DIRECT_OBSERVATION';
  root.add(curvatureGrid);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(4.2, 48, 32),
    material(THREE, '#010207', { emissive: descriptor.palette[2], metalness: 0.86, roughness: 0.08 }),
  );
  core.position.y = -17;
  core.name = 'cosmology-gravity-well-core';
  core.userData.visualAnalogy = 'GRAVITY_WELL_PRESENTATION_NOT_COMPACT_OBJECT_IMAGE';
  root.add(core);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(9.5, 0.35, 12, 96),
    material(THREE, descriptor.palette[2], { emissive: descriptor.palette[2], opacity: 0.58, roughness: 0.14 }),
  );
  halo.position.y = -12;
  halo.rotation.x = Math.PI / 2.5;
  halo.name = 'cosmology-accretion-style-ring';
  halo.userData.visualAnalogy = 'ARTISTIC_ACCRETION_STYLE_NOT_GENERAL_RELATIVITY_OUTPUT';
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
  inferredHalo.name = 'cosmology-inferred-dark-matter-halo';
  inferredHalo.userData.epistemic = 'MODEL_INFERRED_DISTRIBUTION';
  root.add(inferredHalo);
  animated.push({ object: inferredHalo, phase: 0, speed: 0.018, baseY: 0, mode: 'ROTATE_Y' });

  const deepStars = new Float32Array(1800 * 3);
  for (let index = 0; index < 1800; index += 1) {
    const angle = index * 2.399963;
    const radius = 48 + ((index * 61) % 100) * 0.72;
    deepStars[index * 3] = Math.cos(angle) * radius;
    deepStars[index * 3 + 1] = -8 + ((((index * 43) % 100) / 100) - 0.5) * 96;
    deepStars[index * 3 + 2] = Math.sin(angle) * radius;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(deepStars, 3));
  const starfield = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: '#dbeeff', size: 0.17, transparent: true, opacity: 0.76, depthWrite: false }));
  starfield.name = 'cosmology-deep-starfield';
  starfield.userData.visualOnlyContext = true;
  root.add(starfield);
  animated.push({ object: starfield, phase: 0, speed: -0.004, baseY: 0, mode: 'ROTATE_Y' });

  const diskPositions = new Float32Array(900 * 3);
  for (let index = 0; index < 900; index += 1) {
    const angle = index * 2.399963;
    const radius = 6 + ((index * 67) % 100) * 0.19;
    diskPositions[index * 3] = Math.cos(angle) * radius;
    diskPositions[index * 3 + 1] = -13 + Math.sin(angle * 2.1) * 0.7;
    diskPositions[index * 3 + 2] = Math.sin(angle) * radius;
  }
  const diskGeometry = new THREE.BufferGeometry();
  diskGeometry.setAttribute('position', new THREE.BufferAttribute(diskPositions, 3));
  const disk = new THREE.Points(diskGeometry, new THREE.PointsMaterial({ color: '#75d9ff', size: 0.21, transparent: true, opacity: 0.58, depthWrite: false }));
  disk.name = 'cosmology-accretion-style-particles';
  disk.userData.visualAnalogy = 'ARTISTIC_ACCRETION_STYLE_NOT_SOLVER_OUTPUT';
  root.add(disk);
  animated.push({ object: disk, phase: 0, speed: 0.1, baseY: 0, mode: 'ROTATE_Y' });
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

  const roads = graph.listEntities().filter((entity) => entity.geometry?.kind === 'ROAD').slice(0, 8);
  const houses: Array<{ x: number; z: number; width: number; height: number; depth: number; rotation: number; timber: boolean }> = [];
  const pavers: Array<{ x: number; z: number; rotation: number; width: number }> = [];
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
    const paverCount = Math.min(18, Math.max(5, Math.floor(length / 5)));
    for (let paverIndex = 0; paverIndex < paverCount; paverIndex += 1) {
      const t = (paverIndex + 0.5) / paverCount;
      pavers.push({ x: road.start.x + dx * t, z: road.start.z + dz * t, rotation: Math.atan2(dx, dz), width: Math.min(road.widthM, 5.5) });
    }
    for (let slot = 0; slot < placements; slot += 1) {
      const t = (slot + 0.55) / placements;
      for (const side of [-1, 1]) {
        const width = 4.6 + ((houseIndex * 13) % 4) * 0.45;
        const height = 5.8 + ((houseIndex * 17) % 5) * 0.6;
        const depth = 5.2;
        const offset = road.widthM * 0.5 + depth * 0.65 + 1.4;
        const x = road.start.x + dx * t + px * offset * side;
        const z = road.start.z + dz * t + pz * offset * side;
        houses.push({ x, z, width, height, depth, rotation: Math.atan2(dx, dz), timber: houseIndex % 3 === 0 });
        houseIndex += 1;
      }
    }
  }

  const houseMaterial = material(THREE, '#9b7d58', { roughness: 0.92 });
  const houseBodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), houseMaterial, houses.length);
  houseBodies.name = 'reconstruction-instanced-townhouses';
  houseBodies.userData.visualOnlyContext = true;
  houseBodies.userData.epistemic = 'RECONSTRUCTION';
  const roofMaterial = material(THREE, '#211b1a', { roughness: 0.82 });
  const houseRoofs = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 4), roofMaterial, houses.length);
  houseRoofs.name = 'reconstruction-instanced-roofs';
  houseRoofs.userData.visualOnlyContext = true;
  houseRoofs.userData.epistemic = 'RECONSTRUCTION';
  const transform = new THREE.Object3D();
  houses.forEach((house, index) => {
    transform.position.set(house.x, house.height / 2, house.z);
    transform.rotation.set(0, house.rotation, 0);
    transform.scale.set(house.width, house.height, house.depth);
    transform.updateMatrix();
    houseBodies.setMatrixAt(index, transform.matrix);
    houseBodies.setColorAt(index, new THREE.Color(house.timber ? '#503424' : index % 2 ? '#9b7d58' : '#b19a78'));
    transform.position.set(house.x, house.height + 1.15, house.z);
    transform.rotation.set(0, house.rotation + Math.PI / 4, 0);
    transform.scale.set(Math.max(house.width, house.depth) * 0.72, 2.4, Math.max(house.width, house.depth) * 0.72);
    transform.updateMatrix();
    houseRoofs.setMatrixAt(index, transform.matrix);
  });
  houseBodies.instanceMatrix.needsUpdate = true;
  houseRoofs.instanceMatrix.needsUpdate = true;
  if (houseBodies.instanceColor) houseBodies.instanceColor.needsUpdate = true;
  root.add(houseBodies, houseRoofs);

  const paverMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.08, 1), material(THREE, '#574f47', { roughness: 0.98 }), pavers.length);
  paverMesh.name = 'reconstruction-instanced-street-pavers';
  paverMesh.userData.visualOnlyContext = true;
  paverMesh.userData.epistemic = 'RECONSTRUCTION';
  pavers.forEach((paver, index) => {
    transform.position.set(paver.x, 0.09, paver.z);
    transform.rotation.set(0, paver.rotation, 0);
    transform.scale.set(paver.width, 1, 3.7);
    transform.updateMatrix();
    paverMesh.setMatrixAt(index, transform.matrix);
  });
  paverMesh.instanceMatrix.needsUpdate = true;
  root.add(paverMesh);

  const figureMaterial = material(THREE, '#242020', { roughness: 0.9 });
  const crowdBodies = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 1.2, 7), figureMaterial, 34);
  crowdBodies.name = 'reconstruction-instanced-crowd-bodies';
  crowdBodies.userData.visualOnlyContext = true;
  crowdBodies.userData.epistemic = 'RECONSTRUCTION';
  const crowdHeads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 10, 8), figureMaterial, 34);
  crowdHeads.name = 'reconstruction-instanced-crowd-heads';
  crowdHeads.userData.visualOnlyContext = true;
  crowdHeads.userData.epistemic = 'RECONSTRUCTION';
  for (let index = 0; index < 34; index += 1) {
    const angle = index * 2.399963;
    const radius = 7 + ((index * 31) % 100) * 0.22;
    const x = center.x + Math.cos(angle) * radius;
    const z = center.z + Math.sin(angle) * radius;
    transform.position.set(x, 0.8, z);
    transform.rotation.set(0, angle + Math.PI, 0);
    transform.scale.setScalar(1);
    transform.updateMatrix();
    crowdBodies.setMatrixAt(index, transform.matrix);
    transform.position.y = 1.58;
    transform.updateMatrix();
    crowdHeads.setMatrixAt(index, transform.matrix);
  }
  crowdBodies.instanceMatrix.needsUpdate = true;
  crowdHeads.instanceMatrix.needsUpdate = true;
  root.add(crowdBodies, crowdHeads);

  const smokePoints = new Float32Array(350 * 3);
  for (let plume = 0; plume < 5; plume += 1) {
    for (let puff = 0; puff < 70; puff += 1) {
      const index = plume * 70 + puff;
      smokePoints[index * 3] = center.x - 15 + plume * 7 + Math.sin(puff * 1.7) * (0.6 + puff * 0.025);
      smokePoints[index * 3 + 1] = 1.2 + puff * 0.19;
      smokePoints[index * 3 + 2] = center.z + 8 + Math.cos(plume * 1.3) * 5 + Math.cos(puff * 1.1) * 0.8;
    }
  }
  const smokeGeometry = new THREE.BufferGeometry();
  smokeGeometry.setAttribute('position', new THREE.BufferAttribute(smokePoints, 3));
  const smoke = new THREE.Points(smokeGeometry, new THREE.PointsMaterial({ color: 0x8a8580, size: 0.72, transparent: true, opacity: 0.2, depthWrite: false }));
  smoke.name = 'reconstruction-atmospheric-smoke';
  smoke.userData.visualOnlyContext = true;
  smoke.userData.epistemic = 'RECONSTRUCTION';
  root.add(smoke);
}

function createAlienDesert(
  THREE: typeof THREE_NS,
  root: THREE_NS.Group,
  descriptor: SpacetimeWorldDescriptor,
  graph: WorldGraph,
  animated: AnimatedObject[],
): void {
  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(170, 130, 32, 24), material(THREE, '#7f3d1f', { roughness: 1 }));
  terrain.name = 'alien-desert-dune-terrain';
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
  const carvedStone = material(THREE, '#5f3c35', { emissive: '#261317', metalness: 0.32, roughness: 0.54 });
  const structureCount = Math.max(1, Math.round(graph.tryGetEntity('ruins:alien-desert-complex')?.domainState?.structureCount ?? 1));
  for (let index = 0; index < structureCount; index += 1) {
    const ruin = new THREE.Group();
    ruin.name = `alien-ruin-complex-${index}`;
    ruin.position.set((index - (structureCount - 1) / 2) * 7.4, 0, 4 + Math.sin(index) * 12);
    ruin.rotation.y = index * 0.28;
    ruin.userData.fictionInspired = true;
    ruin.userData.visualOnlyContext = true;
    const height = 8 + (index % 4) * 2.4;
    const pillarSpacing = 2.1 + (index % 3) * 0.35;
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.15, height, 1.45), stone);
      pillar.position.set(side * pillarSpacing, height / 2, 0);
      pillar.rotation.z = side * 0.035;
      pillar.castShadow = true;
      ruin.add(pillar);
      for (let band = 0; band < 3; band += 1) {
        const glyphBand = new THREE.Mesh(new THREE.BoxGeometry(1.23, 0.18, 1.52), carvedStone);
        glyphBand.position.set(side * pillarSpacing, height * (0.32 + band * 0.18), 0);
        ruin.add(glyphBand);
      }
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(pillarSpacing * 2 + 1.3, 1.05, 1.6), stone);
    lintel.position.y = height - 0.35;
    lintel.castShadow = true;
    const aperture = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.22, 8, 36), carvedStone);
    aperture.position.set(0, height * 0.48, 0.84);
    ruin.add(lintel, aperture);
    root.add(ruin);
  }
  descriptor.primitives.filter((primitive) => primitive.shape === 'SUN').forEach((primitive, index) => {
    const sun = new THREE.Mesh(new THREE.SphereGeometry(index ? 4.5 : 6.5, 32, 20), material(THREE, index ? '#7fcfff' : '#ffb24d', { emissive: index ? '#5fbfff' : '#ff7d2d', roughness: 0.3 }));
    sun.name = index ? 'alien-secondary-sun' : 'alien-primary-sun';
    sun.position.copy(pointOf(THREE, primitive));
    root.add(sun);
    const light = new THREE.PointLight(index ? 0x78cfff : 0xffb46a, index ? 3.2 : 4.8, 240, 1.2);
    light.name = index ? 'alien-secondary-sun-light' : 'alien-primary-sun-light';
    light.position.copy(sun.position);
    root.add(light);
    animated.push({ object: sun, phase: index * 1.7, speed: 0.14, baseY: sun.position.y, mode: 'PULSE' });
  });

  const rocks = material(THREE, '#4b2d27', { roughness: 0.94 });
  const boulderInstances = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rocks, 24);
  boulderInstances.name = 'alien-desert-instanced-boulders';
  boulderInstances.userData.visualOnlyContext = true;
  const boulderTransform = new THREE.Object3D();
  for (let index = 0; index < 24; index += 1) {
    const angle = index * 2.399963;
    const radius = 18 + ((index * 41) % 100) * 0.46;
    const scale = 0.45 + (index % 5) * 0.22;
    boulderTransform.position.set(Math.cos(angle) * radius, scale * 0.5, Math.sin(angle) * radius);
    boulderTransform.scale.set(scale, scale * (0.55 + (index % 3) * 0.2), scale);
    boulderTransform.rotation.set(index * 0.17, index * 0.31, index * 0.09);
    boulderTransform.updateMatrix();
    boulderInstances.setMatrixAt(index, boulderTransform.matrix);
  }
  boulderInstances.instanceMatrix.needsUpdate = true;
  boulderInstances.castShadow = true;
  root.add(boulderInstances);

  const dustPositions = new Float32Array(780 * 3);
  for (let index = 0; index < 780; index += 1) {
    const angle = index * 2.399963;
    const radius = 4 + ((index * 47) % 100) * 0.72;
    dustPositions[index * 3] = Math.cos(angle) * radius;
    dustPositions[index * 3 + 1] = 0.35 + ((index * 23) % 100) * 0.055;
    dustPositions[index * 3 + 2] = Math.sin(angle) * radius;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0xe0a067, size: 0.14, transparent: true, opacity: 0.34, depthWrite: false }));
  dust.name = 'alien-desert-atmospheric-dust';
  dust.userData.fictionInspired = true;
  root.add(dust);
  animated.push({ object: dust, phase: 0, speed: 0.012, baseY: 0, mode: 'ROTATE_Y' });

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(125, 32, 18),
    new THREE.MeshBasicMaterial({ color: 0x8d3f2a, transparent: true, opacity: 0.085, depthWrite: false, side: THREE.BackSide }),
  );
  atmosphere.name = 'alien-desert-atmosphere';
  atmosphere.userData.fictionInspired = true;
  root.add(atmosphere);
}

function createUnderwaterCity(
  THREE: typeof THREE_NS,
  root: THREE_NS.Group,
  descriptor: SpacetimeWorldDescriptor,
  graph: WorldGraph,
  animated: AnimatedObject[],
): void {
  const context = graph.tryGetEntity('environment:underwater-ocean-context');
  const habitat = graph.tryGetEntity('building:underwater-research-habitat');
  const observatory = graph.tryGetEntity('instrument:underwater-observatory');
  const habitatCount = Math.max(3, Math.round(habitat?.domainState?.habitatModules ?? 8));
  const sensorCount = Math.max(4, Math.round(observatory?.domainState?.sensorNodes ?? 12));
  const floorY = (context?.spatial?.position.y ?? -28) - 3;
  const habitatY = floorY + 3.6;

  const seabedGeometry = new THREE.PlaneGeometry(180, 150, 40, 32);
  const seabedPositions = seabedGeometry.attributes.position;
  for (let index = 0; index < seabedPositions.count; index += 1) {
    const x = seabedPositions.getX(index);
    const y = seabedPositions.getY(index);
    seabedPositions.setZ(index, Math.sin(x * 0.07) * 1.1 + Math.cos(y * 0.085) * 0.8 + Math.sin((x + y) * 0.035) * 0.65);
  }
  seabedPositions.needsUpdate = true;
  seabedGeometry.computeVertexNormals();
  const seabed = new THREE.Mesh(seabedGeometry, material(THREE, '#173c43', { roughness: 0.96 }));
  seabed.name = 'underwater-layered-seabed';
  seabed.rotation.x = -Math.PI / 2;
  seabed.position.y = floorY;
  seabed.receiveShadow = true;
  root.add(seabed);

  const hullMaterial = material(THREE, '#91aeb6', { metalness: 0.68, roughness: 0.28 });
  const glassMaterial = material(THREE, descriptor.palette[2], { emissive: '#0b5965', opacity: 0.31, metalness: 0.08, roughness: 0.12 });
  const domeGeometry = new THREE.SphereGeometry(4.2, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.52);
  const domes = new THREE.InstancedMesh(domeGeometry, glassMaterial, habitatCount);
  domes.name = 'underwater-instanced-habitat-domes';
  domes.userData.simulationOnly = true;
  const bases = new THREE.InstancedMesh(new THREE.CylinderGeometry(4.5, 5, 1.1, 28), hullMaterial, habitatCount);
  bases.name = 'underwater-instanced-habitat-bases';
  bases.userData.simulationOnly = true;
  const modulePositions: THREE_NS.Vector3[] = [];
  const transform = new THREE.Object3D();
  for (let index = 0; index < habitatCount; index += 1) {
    const angle = index / habitatCount * Math.PI * 2;
    const radius = index % 2 ? 24 : 15;
    const position = new THREE.Vector3(Math.cos(angle) * radius, habitatY, Math.sin(angle) * radius);
    modulePositions.push(position);
    transform.position.copy(position);
    transform.rotation.set(0, angle, 0);
    transform.scale.setScalar(1 + (index % 3) * 0.08);
    transform.updateMatrix();
    domes.setMatrixAt(index, transform.matrix);
    transform.position.y = floorY + 0.55;
    transform.scale.setScalar(1);
    transform.updateMatrix();
    bases.setMatrixAt(index, transform.matrix);
  }
  domes.instanceMatrix.needsUpdate = true;
  bases.instanceMatrix.needsUpdate = true;
  root.add(domes, bases);

  const tunnelPairs = modulePositions.map((position, index) => [position, modulePositions[(index + 1) % modulePositions.length]!] as const);
  const tunnels = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.15, 1.15, 1, 18, 1, true), glassMaterial, tunnelPairs.length);
  tunnels.name = 'underwater-instanced-pressure-tunnels';
  tunnels.userData.simulationOnly = true;
  tunnelPairs.forEach(([from, to], index) => {
    const direction = to.clone().sub(from);
    transform.position.copy(from.clone().lerp(to, 0.5));
    transform.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    transform.scale.set(1, direction.length(), 1);
    transform.updateMatrix();
    tunnels.setMatrixAt(index, transform.matrix);
  });
  tunnels.instanceMatrix.needsUpdate = true;
  root.add(tunnels);

  const sensorPods = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.55, 4.8, 12), hullMaterial, sensorCount);
  sensorPods.name = 'underwater-instanced-observation-array';
  sensorPods.userData.simulationOnly = true;
  for (let index = 0; index < sensorCount; index += 1) {
    const angle = index / sensorCount * Math.PI * 2;
    const radius = 34 + (index % 3) * 3;
    transform.position.set(Math.cos(angle) * radius, floorY + 2.4, Math.sin(angle) * radius);
    transform.rotation.set(0, angle, 0);
    transform.scale.setScalar(1);
    transform.updateMatrix();
    sensorPods.setMatrixAt(index, transform.matrix);
  }
  sensorPods.instanceMatrix.needsUpdate = true;
  root.add(sensorPods);

  const marineSnowPositions = new Float32Array(2200 * 3);
  for (let index = 0; index < 2200; index += 1) {
    const angle = index * 2.399963;
    const radius = 3 + ((index * 53) % 100) * 0.76;
    marineSnowPositions[index * 3] = Math.cos(angle) * radius;
    marineSnowPositions[index * 3 + 1] = floorY + 1 + ((index * 29) % 100) * 0.48;
    marineSnowPositions[index * 3 + 2] = Math.sin(angle) * radius;
  }
  const marineSnowGeometry = new THREE.BufferGeometry();
  marineSnowGeometry.setAttribute('position', new THREE.BufferAttribute(marineSnowPositions, 3));
  const marineSnow = new THREE.Points(marineSnowGeometry, new THREE.PointsMaterial({ color: '#8de2dc', size: 0.075, transparent: true, opacity: 0.34, depthWrite: false }));
  marineSnow.name = 'underwater-marine-snow';
  marineSnow.userData.visualOnlyContext = true;
  root.add(marineSnow);
  animated.push({ object: marineSnow, phase: 0, speed: 0.006, baseY: marineSnow.position.y, mode: 'ROTATE_Y' });

  const bubbles = new Float32Array(520 * 3);
  for (let index = 0; index < 520; index += 1) {
    const source = modulePositions[index % modulePositions.length]!;
    bubbles[index * 3] = source.x + Math.sin(index * 1.7) * 2.1;
    bubbles[index * 3 + 1] = habitatY + ((index * 17) % 100) * 0.31;
    bubbles[index * 3 + 2] = source.z + Math.cos(index * 1.3) * 2.1;
  }
  const bubbleGeometry = new THREE.BufferGeometry();
  bubbleGeometry.setAttribute('position', new THREE.BufferAttribute(bubbles, 3));
  const bubbleField = new THREE.Points(bubbleGeometry, new THREE.PointsMaterial({ color: '#c6ffff', size: 0.12, transparent: true, opacity: 0.42, depthWrite: false }));
  bubbleField.name = 'underwater-bubble-columns';
  bubbleField.userData.visualOnlyContext = true;
  root.add(bubbleField);
  animated.push({ object: bubbleField, phase: 0.4, speed: 0.12, baseY: bubbleField.position.y, mode: 'FLOAT' });

  const fishMaterial = material(THREE, '#2baab5', { emissive: '#063d48', opacity: 0.72, roughness: 0.5 });
  const fish = new THREE.InstancedMesh(new THREE.ConeGeometry(0.28, 1.4, 5), fishMaterial, 120);
  fish.name = 'underwater-instanced-fauna-silhouettes';
  fish.userData.visualOnlyContext = true;
  fish.userData.visualAnalogy = 'AMBIENT_FAUNA_NOT_SPECIES_OBSERVATION';
  for (let index = 0; index < 120; index += 1) {
    const angle = index * 2.399963;
    const radius = 12 + ((index * 41) % 100) * 0.47;
    transform.position.set(Math.cos(angle) * radius, floorY + 6 + ((index * 23) % 100) * 0.22, Math.sin(angle) * radius);
    transform.rotation.set(Math.PI / 2, angle + Math.PI / 2, 0);
    transform.scale.setScalar(0.65 + (index % 5) * 0.1);
    transform.updateMatrix();
    fish.setMatrixAt(index, transform.matrix);
  }
  fish.instanceMatrix.needsUpdate = true;
  root.add(fish);

  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 10, 8), material(THREE, '#baffff', { emissive: '#76ffff', roughness: 0.1 }), habitatCount * 6);
  lights.name = 'underwater-instanced-habitat-lights';
  for (let index = 0; index < habitatCount * 6; index += 1) {
    const moduleIndex = index % habitatCount;
    const angle = Math.floor(index / habitatCount) / 6 * Math.PI * 2;
    const center = modulePositions[moduleIndex]!;
    transform.position.set(center.x + Math.cos(angle) * 4.1, habitatY + 1.6, center.z + Math.sin(angle) * 4.1);
    transform.rotation.set(0, 0, 0);
    transform.scale.setScalar(1);
    transform.updateMatrix();
    lights.setMatrixAt(index, transform.matrix);
  }
  lights.instanceMatrix.needsUpdate = true;
  root.add(lights);

  const waterVolume = new THREE.Mesh(
    new THREE.SphereGeometry(115, 32, 18),
    new THREE.MeshBasicMaterial({ color: 0x01253a, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.BackSide }),
  );
  waterVolume.name = 'underwater-volume-atmosphere';
  waterVolume.position.y = floorY + 24;
  waterVolume.userData.visualOnlyContext = true;
  root.add(waterVolume);
}

function createMarsStation(
  THREE: typeof THREE_NS,
  root: THREE_NS.Group,
  descriptor: SpacetimeWorldDescriptor,
  graph: WorldGraph,
  animated: AnimatedObject[],
): void {
  const terrain = new THREE.Mesh(new THREE.CircleGeometry(78, 96), material(THREE, '#6f2d20', { roughness: 1 }));
  terrain.name = 'mars-regolith-terrain';
  const terrainPositions = terrain.geometry.attributes.position;
  for (let index = 0; index < terrainPositions.count; index += 1) {
    const x = terrainPositions.getX(index);
    const y = terrainPositions.getY(index);
    const craterA = Math.exp(-((x - 27) ** 2 + (y + 18) ** 2) / 65) * -2.4;
    const craterB = Math.exp(-((x + 34) ** 2 + (y - 22) ** 2) / 110) * -3.2;
    terrainPositions.setZ(index, Math.sin(x * 0.075) * 0.7 + Math.cos(y * 0.09) * 0.5 + craterA + craterB);
  }
  terrainPositions.needsUpdate = true;
  terrain.geometry.computeVertexNormals();
  terrain.rotation.x = -Math.PI / 2;
  terrain.receiveShadow = true;
  root.add(terrain);
  const habitatMaterial = material(THREE, '#c4cdd2', { metalness: 0.62, roughness: 0.28 });
  const glass = material(THREE, descriptor.palette[2], { emissive: '#173e55', opacity: 0.42, metalness: 0.1, roughness: 0.12 });
  const moduleCount = Math.max(1, Math.round(graph.tryGetEntity('building:mars-research-station')?.domainState?.habitatModules ?? 1));
  const modulePositions: THREE_NS.Vector3[] = [];
  const moduleInstances = new THREE.InstancedMesh(new THREE.CylinderGeometry(4, 4, 10, 32), habitatMaterial, moduleCount);
  moduleInstances.name = 'mars-instanced-habitat-modules';
  moduleInstances.userData.simulatedResearchHabitat = true;
  const windowInstances = new THREE.InstancedMesh(new THREE.CircleGeometry(1.7, 24), glass, moduleCount);
  windowInstances.name = 'mars-instanced-habitat-windows';
  const transform = new THREE.Object3D();
  for (let index = 0; index < moduleCount; index += 1) {
    const position = new THREE.Vector3((index - 1.5) * 11, 4, Math.sin(index * 1.8) * 9);
    modulePositions.push(position);
    transform.position.copy(position);
    transform.rotation.set(0, 0, Math.PI / 2);
    transform.scale.setScalar(1);
    transform.updateMatrix();
    moduleInstances.setMatrixAt(index, transform.matrix);
    transform.position.set(position.x + 5.02, position.y, position.z);
    transform.rotation.set(0, Math.PI / 2, 0);
    transform.updateMatrix();
    windowInstances.setMatrixAt(index, transform.matrix);
  }
  moduleInstances.instanceMatrix.needsUpdate = true;
  windowInstances.instanceMatrix.needsUpdate = true;
  moduleInstances.castShadow = true;
  root.add(moduleInstances, windowInstances);

  const connectorInstances = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.2, 1.2, 1, 20), habitatMaterial, Math.max(0, modulePositions.length - 1));
  connectorInstances.name = 'mars-instanced-pressurized-connectors';
  for (let index = 1; index < modulePositions.length; index += 1) {
    const from = modulePositions[index - 1]!;
    const to = modulePositions[index]!;
    const midpoint = from.clone().lerp(to, 0.5);
    const direction = to.clone().sub(from);
    transform.position.copy(midpoint);
    transform.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    transform.scale.set(1, direction.length(), 1);
    transform.updateMatrix();
    connectorInstances.setMatrixAt(index - 1, transform.matrix);
  }
  connectorInstances.instanceMatrix.needsUpdate = true;
  connectorInstances.castShadow = true;
  root.add(connectorInstances);

  const panelInstances = new THREE.InstancedMesh(
    new THREE.BoxGeometry(16, 0.18, 7),
    material(THREE, '#143f71', { emissive: '#06264a', metalness: 0.72, roughness: 0.18 }),
    2,
  );
  panelInstances.name = 'mars-instanced-solar-arrays';
  for (const [index, side] of [-1, 1].entries()) {
    transform.position.set(side * 19, 2.6, 15);
    transform.rotation.set(0, 0, side * 0.08);
    transform.scale.setScalar(1);
    transform.updateMatrix();
    panelInstances.setMatrixAt(index, transform.matrix);
  }
  panelInstances.instanceMatrix.needsUpdate = true;
  root.add(panelInstances);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.42, 12, 16), habitatMaterial);
  mast.name = 'mars-communications-mast';
  mast.position.set(3, 6, -17);
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(4.6, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.34),
    material(THREE, '#dfe7ea', { metalness: 0.74, roughness: 0.22 }),
  );
  dish.name = 'mars-communications-dish';
  dish.position.set(3, 12, -17);
  dish.rotation.x = Math.PI * 0.62;
  root.add(mast, dish);

  const rover = new THREE.Group();
  rover.name = 'mars-field-rover';
  rover.position.set(-13, 1.2, -11);
  rover.userData.simulatedResearchEquipment = true;
  const roverBody = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.25, 3), habitatMaterial);
  roverBody.position.y = 1.05;
  roverBody.castShadow = true;
  rover.add(roverBody);
  const wheelMaterial = material(THREE, '#171819', { metalness: 0.42, roughness: 0.75 });
  const wheelInstances = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.75, 0.75, 0.5, 18), wheelMaterial, 6);
  wheelInstances.name = 'mars-rover-instanced-wheels';
  let wheelIndex = 0;
  for (const x of [-1.65, 0, 1.65]) {
    for (const z of [-1.75, 1.75]) {
      transform.position.set(x, 0.55, z);
      transform.rotation.set(Math.PI / 2, 0, 0);
      transform.scale.setScalar(1);
      transform.updateMatrix();
      wheelInstances.setMatrixAt(wheelIndex, transform.matrix);
      wheelIndex += 1;
    }
  }
  wheelInstances.instanceMatrix.needsUpdate = true;
  rover.add(wheelInstances);
  const sensorMast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 2.8, 12), habitatMaterial);
  sensorMast.position.set(1.25, 3.1, 0);
  const sensorHead = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 0.7), glass);
  sensorHead.position.set(1.25, 4.55, 0);
  rover.add(sensorMast, sensorHead);
  root.add(rover);

  const regolithRocks = material(THREE, '#49221c', { roughness: 0.98 });
  const rockInstances = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), regolithRocks, 30);
  rockInstances.name = 'mars-instanced-regolith-rocks';
  for (let index = 0; index < 30; index += 1) {
    const angle = index * 2.399963;
    const radius = 22 + ((index * 29) % 100) * 0.43;
    const scale = 0.3 + (index % 6) * 0.16;
    transform.position.set(Math.cos(angle) * radius, scale * 0.25, Math.sin(angle) * radius);
    transform.rotation.set(index * 0.13, index * 0.29, index * 0.07);
    transform.scale.set(scale, scale * 0.55, scale);
    transform.updateMatrix();
    rockInstances.setMatrixAt(index, transform.matrix);
  }
  rockInstances.instanceMatrix.needsUpdate = true;
  root.add(rockInstances);

  const dustPositions = new Float32Array(420 * 3);
  for (let index = 0; index < 420; index += 1) {
    const angle = index * 2.399963;
    const radius = 6 + ((index * 37) % 100) * 0.62;
    dustPositions[index * 3] = Math.cos(angle) * radius;
    dustPositions[index * 3 + 1] = 0.3 + ((index * 19) % 100) * 0.025;
    dustPositions[index * 3 + 2] = Math.sin(angle) * radius;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0xc86d4d, size: 0.1, transparent: true, opacity: 0.28, depthWrite: false }));
  dust.name = 'mars-regolith-dust';
  root.add(dust);
  animated.push({ object: dust, phase: 0, speed: 0.008, baseY: 0, mode: 'ROTATE_Y' });
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
    case 'MARS_STATION': createMarsStation(THREE, root, descriptor, graph, animated); break;
    case 'UNDERWATER_CITY': createUnderwaterCity(THREE, root, descriptor, graph, animated); break;
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
