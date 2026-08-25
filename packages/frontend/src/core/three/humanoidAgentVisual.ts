import type * as THREE_NS from 'three';
import type { SimAgent } from '../simulation/types';
import { buildCharacter, paletteFromSeed, type Character, type PoseMode } from './characterRig';

/**
 * MOST MODELU → HUMANOID 3D.
 *
 * Ten moduł NIE zapisuje do SimAgent ani do silnika epidemii. Mapuje wyłącznie
 * aktualny, rzeczywisty stan modelu na pozycję, orientację, animację i czytelne
 * wskazówki wizualne. Dzięki temu ta sama symulacja może mieć Canvas fallback,
 * renderer Three.js, a w przyszłości renderer WebGPU — bez zmiany nauki.
 */

export type AgentHealthState = 'S' | 'E' | 'I' | 'R' | 'D' | 'unknown';

export interface HumanoidAgentState {
  id: number;
  /** Dane istniejącego SimAgent; renderer nie tworzy własnej demografii. */
  age?: number;
  role?: string;
  worldX: number;
  worldZ: number;
  facing: number;
  speed: number;
  gait: number;
  pose: PoseMode;
  health: AgentHealthState;
  behavior: string;
  /** Czas w realnym stanie epidemiologicznym, przekazywany wyłącznie do animacji przejścia. */
  stateSince: number;
  isolated: boolean;
  hospitalized: boolean;
}

/**
 * High-fidelity City View: populacja ma czytać się jako warstwa skali miasta.
 * Mapowanie nadal korzysta wyłącznie z realnego SimAgent i nie zmienia stanu modelu.
 */
export const HUMAN_VISUAL_HEIGHT = 0.30;
/** Rig focusu jest czytelny, lecz nie może wizualnie konkurować z tkanką miejską. */
export const DETAILED_HUMAN_HEIGHT = 0.68;

export const HEALTH_COLORS: Record<AgentHealthState, number> = {
  S: 0x54d98c,
  E: 0xe8b34a,
  I: 0xf05555,
  R: 0x5aa2ff,
  D: 0x6b7280,
  unknown: 0xcbd5e1,
};

/**
 * Czyste mapowanie testowalne bez WebGL. `velocityScale` odpowiada prędkości
 * używanej przez EpidemicCitySimulation (worldWidth * 0.10 px/dzień).
 */
export function mapSimAgentToHumanoid(
  agent: SimAgent,
  worldWidth: number,
  worldHeight: number,
  worldScale: number,
  velocityScale: number,
): HumanoidAgentState {
  const velocity = Math.hypot(agent.vx, agent.vy);
  const speed = Math.max(0, Math.min(1, velocity / Math.max(1e-6, velocityScale)));
  const moving = velocity > 1e-3;
  const behavior = agent.behavior || 'idle';
  const socialGesture = behavior === 'talk' || behavior === 'phone';
  const health: AgentHealthState = agent.state === 'S' || agent.state === 'E' || agent.state === 'I' || agent.state === 'R' || agent.state === 'D'
    ? agent.state
    : 'unknown';

  return {
    id: agent.id,
    age: agent.age,
    role: agent.role,
    worldX: (agent.x - worldWidth / 2) * worldScale,
    worldZ: (agent.y - worldHeight / 2) * worldScale,
    facing: moving ? Math.atan2(agent.vx, agent.vy) : 0,
    speed,
    gait: agent.gait ?? 0,
    pose: moving ? 'walk' : socialGesture ? 'gesture' : 'idle',
    health,
    behavior,
    stateSince: agent.stateSince,
    isolated: agent.isolated,
    hospitalized: Boolean(agent.hospitalized),
  };
}

/** Pełny humanoid dla bliskich / wybranych agentów. */
export class HumanoidAgentVisual {
  readonly root: THREE_NS.Group;
  private readonly character: Character;
  private readonly healthRing: THREE_NS.Mesh;
  private readonly isolationRing: THREE_NS.Mesh;
  private readonly hospitalCross: THREE_NS.Group;
  private readonly healthMaterial: THREE_NS.MeshBasicMaterial;
  private readonly isolationMaterial: THREE_NS.MeshBasicMaterial;
  private readonly hospitalMaterial: THREE_NS.MeshBasicMaterial;
  private lastFacing = 0;
  private selected = false;

  constructor(THREE: typeof THREE_NS, id: number) {
    this.root = new THREE.Group();
    this.root.name = `humanoid-agent-${id}`;
    this.root.userData.agentId = id;

    this.character = buildCharacter(THREE, { height: DETAILED_HUMAN_HEIGHT, ...paletteFromSeed(id + 1) });
    this.root.add(this.character.root);

    this.healthMaterial = new THREE.MeshBasicMaterial({ color: HEALTH_COLORS.S, transparent: true, opacity: 0.85, depthWrite: false });
    const healthGeometry = new THREE.RingGeometry(0.075, 0.098, 20);
    healthGeometry.rotateX(-Math.PI / 2);
    this.healthRing = new THREE.Mesh(healthGeometry, this.healthMaterial);
    this.healthRing.position.y = DETAILED_HUMAN_HEIGHT * 1.06;
    this.root.add(this.healthRing);

    this.isolationMaterial = new THREE.MeshBasicMaterial({ color: 0xd7dde8, transparent: true, opacity: 0.75, depthWrite: false });
    const isolationGeometry = new THREE.RingGeometry(0.085, 0.105, 20);
    isolationGeometry.rotateX(-Math.PI / 2);
    this.isolationRing = new THREE.Mesh(isolationGeometry, this.isolationMaterial);
    this.isolationRing.position.y = 0.014;
    this.isolationRing.visible = false;
    this.root.add(this.isolationRing);

    this.hospitalMaterial = new THREE.MeshBasicMaterial({ color: 0xfff5f5, depthWrite: false });
    this.hospitalCross = new THREE.Group();
    const barH = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.030, 0.014), this.hospitalMaterial);
    const barV = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.10, 0.014), this.hospitalMaterial);
    const background = new THREE.Mesh(new THREE.CircleGeometry(0.082, 16), new THREE.MeshBasicMaterial({ color: 0xc73b3b, depthWrite: false }));
    background.position.z = -0.008;
    this.hospitalCross.add(background, barH, barV);
    this.hospitalCross.position.set(0, DETAILED_HUMAN_HEIGHT * 1.18, 0);
    this.hospitalCross.visible = false;
    this.root.add(this.hospitalCross);
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
  }

  sync(state: HumanoidAgentState, timeSeconds: number): void {
    // D pozostaje neutralną, nieruchomą sylwetką w ostatniej pozycji modelu;
    // nie sugerujemy upadku, ciała ani severity, których model nie opisuje.
    this.root.visible = true;
    this.root.position.set(state.worldX, 0, state.worldZ);
    if (state.speed > 0.001) this.lastFacing = state.facing;
    this.character.setFacing(this.lastFacing);
    this.character.update(state.health === 'D' ? 'idle' : state.pose, state.pose === 'walk' ? state.gait : timeSeconds, state.health === 'D' ? 0 : state.speed);

    const pulse = state.health === 'I' ? 0.5 + 0.5 * Math.sin(timeSeconds * 3.2) : state.health === 'E' ? 0.5 + 0.5 * Math.sin(timeSeconds * 1.8) : state.health === 'R' ? 0.5 + 0.5 * Math.sin(timeSeconds * 1.1) : 0;
    const intensity = state.health === 'S' ? 0.24 : state.health === 'E' ? 0.46 + pulse * 0.10 : state.health === 'I' ? 0.68 + pulse * 0.14 : state.health === 'R' ? 0.52 + (1 - Math.min(1, state.stateSince / 4)) * 0.12 : state.health === 'D' ? 0.88 : 0.20;
    this.character.setEpidemicTint(HEALTH_COLORS[state.health], intensity);
    this.healthMaterial.color.setHex(this.selected ? 0xffd166 : HEALTH_COLORS[state.health]);
    this.healthMaterial.opacity = state.health === 'D' ? 0.45 : 0.72 + pulse * 0.22;
    this.healthRing.scale.setScalar((this.selected ? 1.22 : 1) * (1 + pulse * (state.health === 'I' ? 0.12 : 0.05)));
    this.isolationRing.visible = state.isolated && !state.hospitalized;
    this.isolationRing.rotation.z = timeSeconds * 0.7;
    this.hospitalCross.visible = state.hospitalized;
  }

  dispose(): void {
    this.character.dispose();
    this.healthRing.geometry.dispose();
    this.isolationRing.geometry.dispose();
    this.healthMaterial.dispose();
    this.isolationMaterial.dispose();
    this.hospitalMaterial.dispose();
    this.hospitalCross.traverse((node) => {
      const mesh = node as THREE_NS.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material;
      if (material && material !== this.hospitalMaterial && !Array.isArray(material)) material.dispose();
    });
  }
}

/**
 * Medium-LOD crowd: wciąż pełna, czytelna postać 3D (tułów, głowa, włosy,
 * ręce, dwie nogi i stopy), ale z geometrią współdzieloną przez InstancedMesh.
 * Jest to świadomy renderer skalujący P0 — nie Canvasowy symbol ani „czarny
 * patyk”. Ruch kończyn pochodzi z `gait` tego samego SimAgent.
 */
export class InstancedHumanoidCrowd {
  readonly torso: THREE_NS.InstancedMesh;
  readonly head: THREE_NS.InstancedMesh;
  readonly hair: THREE_NS.InstancedMesh;
  readonly leftArm: THREE_NS.InstancedMesh;
  readonly rightArm: THREE_NS.InstancedMesh;
  readonly leftLeg: THREE_NS.InstancedMesh;
  readonly rightLeg: THREE_NS.InstancedMesh;
  readonly status: THREE_NS.InstancedMesh;
  readonly aura: THREE_NS.InstancedMesh;
  private readonly matrix: THREE_NS.Matrix4;
  private readonly facing: THREE_NS.Quaternion;
  private readonly localRotation: THREE_NS.Quaternion;
  private readonly composedRotation: THREE_NS.Quaternion;
  private readonly position: THREE_NS.Vector3;
  private readonly scale: THREE_NS.Vector3;
  private readonly ids: number[] = [];
  private readonly meshes: THREE_NS.InstancedMesh[];
  private readonly yAxis: THREE_NS.Vector3;
  private readonly xAxis: THREE_NS.Vector3;
  private count = 0;

  constructor(private readonly THREE: typeof THREE_NS, readonly capacity: number) {
    const clothingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.72, metalness: 0.02, emissive: 0xffffff, emissiveIntensity: 0.18 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.86, emissive: 0xffffff, emissiveIntensity: 0.10 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92, emissive: 0xffffff, emissiveIntensity: 0.06 });
    const statusMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.76, depthWrite: false });
    this.torso = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.142, 0.37, 6, 10), clothingMat, capacity);
    this.head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.120, 12, 10), skinMat, capacity);
    this.hair = new THREE.InstancedMesh(new THREE.SphereGeometry(0.078, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat, capacity);
    const limbGeometry = new THREE.CapsuleGeometry(0.052, 0.33, 5, 7);
    this.leftArm = new THREE.InstancedMesh(limbGeometry, clothingMat, capacity);
    this.rightArm = new THREE.InstancedMesh(limbGeometry.clone(), clothingMat, capacity);
    const legGeometry = new THREE.CapsuleGeometry(0.062, 0.42, 5, 7);
    this.leftLeg = new THREE.InstancedMesh(legGeometry, clothingMat, capacity);
    this.rightLeg = new THREE.InstancedMesh(legGeometry.clone(), clothingMat, capacity);
    this.status = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.070, 0), statusMat, capacity);
    this.aura = new THREE.InstancedMesh(new THREE.CircleGeometry(0.070, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.20, depthWrite: false }), capacity);
    this.aura.rotation.x = -Math.PI / 2;
    this.torso.name = 'instanced-humanoid-torsos';
    this.head.name = 'instanced-humanoid-heads';
    this.hair.name = 'instanced-humanoid-hair';
    this.leftArm.name = 'instanced-humanoid-left-arms';
    this.rightArm.name = 'instanced-humanoid-right-arms';
    this.leftLeg.name = 'instanced-humanoid-left-legs';
    this.rightLeg.name = 'instanced-humanoid-right-legs';
    this.status.name = 'instanced-humanoid-health-markers';
    this.aura.name = 'instanced-humanoid-epidemiology-aura';
    this.meshes = [this.torso, this.head, this.hair, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.status, this.aura];
    for (const mesh of this.meshes) mesh.frustumCulled = false;
    this.matrix = new THREE.Matrix4();
    this.facing = new THREE.Quaternion();
    this.localRotation = new THREE.Quaternion();
    this.composedRotation = new THREE.Quaternion();
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3(1, 1, 1);
    this.yAxis = new THREE.Vector3(0, 1, 0);
    this.xAxis = new THREE.Vector3(1, 0, 0);
  }

  addTo(scene: THREE_NS.Scene): void {
    scene.add(...this.meshes);
  }

  pickTargets(): THREE_NS.Object3D[] {
    return this.meshes;
  }

  update(states: readonly HumanoidAgentState[]): void {
    this.count = Math.min(states.length, this.capacity);
    this.ids.length = this.count;
    for (let i = 0; i < this.count; i++) {
      const state = states[i];
      this.ids[i] = state.id;
      this.facing.setFromAxisAngle(this.yAxis, state.facing);
      const palette = paletteFromSeed(state.id + 1);
      const shirt = new this.THREE.Color(palette.shirt);
      const skin = new this.THREE.Color(palette.skin);
      const hair = new this.THREE.Color(palette.hair);
      const pants = new this.THREE.Color(palette.pants);
      const health = new this.THREE.Color(HEALTH_COLORS[state.health]);
      const pulse = state.health === 'I' ? 0.5 + 0.5 * Math.sin(state.gait * 2.2) : state.health === 'E' ? 0.5 + 0.5 * Math.sin(state.gait * 1.2) : 0;
      const tint = state.health === 'S' ? 0.24 : state.health === 'E' ? 0.46 + pulse * 0.10 : state.health === 'I' ? 0.68 + pulse * 0.14 : state.health === 'R' ? 0.52 + (1 - Math.min(1, state.stateSince / 4)) * 0.12 : state.health === 'D' ? 0.88 : 0.20;
      shirt.lerp(health, tint);
      pants.lerp(health, tint * 0.48);
      const ageScale = state.age === undefined ? 1 : state.age < 18 ? 0.78 : state.age >= 70 ? 0.90 : 1;
      const deterministicBuild = 0.94 + ((state.id * 17) % 7) * 0.018;
      const scale = HUMAN_VISUAL_HEIGHT * ageScale * deterministicBuild;
      const stride = state.speed > 0.02 ? Math.sin(state.gait) * 0.52 * state.speed : Math.sin(state.gait * 0.4) * 0.035;
      const armSwing = state.pose === 'gesture' ? Math.sin(state.gait * 1.8) * 0.42 : -stride * 0.85;
      const statusScale = (state.hospitalized ? 1.25 : state.isolated ? 1.14 : 1 + pulse * (state.health === 'I' ? 0.10 : 0.04)) * scale;
      const side = scale * 0.18;

      this.compose(i, this.torso, state.worldX, scale * 0.92, state.worldZ, this.facing, scale, shirt);
      this.compose(i, this.head, state.worldX, scale * 1.67, state.worldZ, this.facing, scale, skin);
      this.compose(i, this.hair, state.worldX, scale * 1.76, state.worldZ, this.facing, scale, hair);

      this.localRotation.setFromAxisAngle(this.xAxis, armSwing);
      this.composedRotation.copy(this.facing).multiply(this.localRotation);
      this.compose(i, this.leftArm, state.worldX - side, scale * 1.17, state.worldZ, this.composedRotation, scale, shirt);
      this.localRotation.setFromAxisAngle(this.xAxis, -armSwing);
      this.composedRotation.copy(this.facing).multiply(this.localRotation);
      this.compose(i, this.rightArm, state.worldX + side, scale * 1.17, state.worldZ, this.composedRotation, scale, shirt);

      this.localRotation.setFromAxisAngle(this.xAxis, stride);
      this.composedRotation.copy(this.facing).multiply(this.localRotation);
      this.compose(i, this.leftLeg, state.worldX - scale * 0.08, scale * 0.35, state.worldZ, this.composedRotation, scale, pants);
      this.localRotation.setFromAxisAngle(this.xAxis, -stride);
      this.composedRotation.copy(this.facing).multiply(this.localRotation);
      this.compose(i, this.rightLeg, state.worldX + scale * 0.08, scale * 0.35, state.worldZ, this.composedRotation, scale, pants);

      this.compose(i, this.status, state.worldX, scale * 1.95, state.worldZ, this.facing, statusScale, health);
      this.compose(i, this.aura, state.worldX, 0.018, state.worldZ, this.facing, 1 + pulse * 0.12, health);
    }
    for (const mesh of this.meshes) {
      mesh.count = this.count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private compose(index: number, mesh: THREE_NS.InstancedMesh, x: number, y: number, z: number, rotation: THREE_NS.Quaternion, factor: number, color: THREE_NS.Color): void {
    this.position.set(x, y, z);
    this.scale.setScalar(factor);
    this.matrix.compose(this.position, rotation, this.scale);
    mesh.setMatrixAt(index, this.matrix);
    mesh.setColorAt(index, color);
  }

  agentIdForInstance(instanceId: number | undefined): number | null {
    if (instanceId === undefined || instanceId < 0 || instanceId >= this.ids.length) return null;
    return this.ids[instanceId] ?? null;
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      const material = mesh.material;
      if (!Array.isArray(material)) material.dispose();
    }
  }
}
