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
  worldX: number;
  worldZ: number;
  facing: number;
  speed: number;
  gait: number;
  pose: PoseMode;
  health: AgentHealthState;
  behavior: string;
  isolated: boolean;
  hospitalized: boolean;
}

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
    worldX: (agent.x - worldWidth / 2) * worldScale,
    worldZ: (agent.y - worldHeight / 2) * worldScale,
    facing: moving ? Math.atan2(agent.vx, agent.vy) : 0,
    speed,
    gait: agent.gait ?? 0,
    pose: moving ? 'walk' : socialGesture ? 'gesture' : 'idle',
    health,
    behavior,
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

    this.character = buildCharacter(THREE, { height: 1.75, ...paletteFromSeed(id + 1) });
    this.root.add(this.character.root);

    this.healthMaterial = new THREE.MeshBasicMaterial({ color: HEALTH_COLORS.S, transparent: true, opacity: 0.85, depthWrite: false });
    const healthGeometry = new THREE.RingGeometry(0.16, 0.20, 20);
    healthGeometry.rotateX(-Math.PI / 2);
    this.healthRing = new THREE.Mesh(healthGeometry, this.healthMaterial);
    this.healthRing.position.y = 0.012;
    this.root.add(this.healthRing);

    this.isolationMaterial = new THREE.MeshBasicMaterial({ color: 0xd7dde8, transparent: true, opacity: 0.75, depthWrite: false });
    const isolationGeometry = new THREE.RingGeometry(0.25, 0.275, 24);
    isolationGeometry.rotateX(-Math.PI / 2);
    this.isolationRing = new THREE.Mesh(isolationGeometry, this.isolationMaterial);
    this.isolationRing.position.y = 0.014;
    this.isolationRing.visible = false;
    this.root.add(this.isolationRing);

    this.hospitalMaterial = new THREE.MeshBasicMaterial({ color: 0xfff5f5, depthWrite: false });
    this.hospitalCross = new THREE.Group();
    const barH = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.018), this.hospitalMaterial);
    const barV = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.018), this.hospitalMaterial);
    const background = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), new THREE.MeshBasicMaterial({ color: 0xc73b3b, depthWrite: false }));
    background.position.z = -0.008;
    this.hospitalCross.add(background, barH, barV);
    this.hospitalCross.position.set(0, 2.02, 0);
    this.hospitalCross.visible = false;
    this.root.add(this.hospitalCross);
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
  }

  sync(state: HumanoidAgentState, timeSeconds: number): void {
    this.root.visible = state.health !== 'D';
    this.root.position.set(state.worldX, 0, state.worldZ);
    if (state.speed > 0.001) this.lastFacing = state.facing;
    this.character.setFacing(this.lastFacing);
    this.character.update(state.pose, state.pose === 'walk' ? state.gait : timeSeconds, state.speed);

    this.healthMaterial.color.setHex(this.selected ? 0xffd166 : HEALTH_COLORS[state.health]);
    this.healthRing.scale.setScalar(this.selected ? 1.5 : 1);
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
 * Instanced 3D crowd for agents outside the detailed-character budget. It is
 * still a human-shaped, lit 3D representation — not dots or 2D sticks — and
 * keeps draw calls bounded while full rigs remain reserved for nearby agents.
 */
export class InstancedHumanoidCrowd {
  readonly body: THREE_NS.InstancedMesh;
  readonly head: THREE_NS.InstancedMesh;
  readonly legs: THREE_NS.InstancedMesh;
  readonly status: THREE_NS.InstancedMesh;
  private readonly matrix: THREE_NS.Matrix4;
  private readonly quaternion: THREE_NS.Quaternion;
  private readonly position: THREE_NS.Vector3;
  private readonly scale: THREE_NS.Vector3;
  private readonly ids: number[] = [];
  private count = 0;

  constructor(private readonly THREE: typeof THREE_NS, readonly capacity: number) {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.88 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9 });
    const statusMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
    this.body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.09, 0.30, 4, 6), bodyMat, capacity);
    this.head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.105, 8, 7), headMat, capacity);
    this.legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.52, 0.15), bodyMat, capacity);
    this.status = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 6, 5), statusMat, capacity);
    this.body.name = 'instanced-humanoid-bodies';
    this.head.name = 'instanced-humanoid-heads';
    this.legs.name = 'instanced-humanoid-legs';
    this.status.name = 'instanced-humanoid-statuses';
    this.body.frustumCulled = this.head.frustumCulled = this.legs.frustumCulled = this.status.frustumCulled = false;
    this.matrix = new THREE.Matrix4();
    this.quaternion = new THREE.Quaternion();
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3(1, 1, 1);
  }

  addTo(scene: THREE_NS.Scene): void {
    scene.add(this.body, this.head, this.legs, this.status);
  }

  update(states: readonly HumanoidAgentState[]): void {
    this.count = Math.min(states.length, this.capacity);
    this.ids.length = this.count;
    for (let i = 0; i < this.count; i++) {
      const state = states[i];
      this.ids[i] = state.id;
      this.quaternion.setFromAxisAngle(new this.THREE.Vector3(0, 1, 0), state.facing);
      const palette = paletteFromSeed(state.id + 1);
      const shirt = new this.THREE.Color(palette.shirt);
      const skin = new this.THREE.Color(palette.skin);
      const health = new this.THREE.Color(HEALTH_COLORS[state.health]);

      this.position.set(state.worldX, 0.92, state.worldZ);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.body.setMatrixAt(i, this.matrix);
      this.body.setColorAt(i, shirt);

      this.position.set(state.worldX, 1.62, state.worldZ);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.head.setMatrixAt(i, this.matrix);
      this.head.setColorAt(i, skin);

      this.position.set(state.worldX, 0.28, state.worldZ);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.legs.setMatrixAt(i, this.matrix);
      this.legs.setColorAt(i, shirt.clone().multiplyScalar(0.6));

      this.position.set(state.worldX, 1.84, state.worldZ);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.status.setMatrixAt(i, this.matrix);
      this.status.setColorAt(i, health);
    }
    this.body.count = this.head.count = this.legs.count = this.status.count = this.count;
    this.body.instanceMatrix.needsUpdate = this.head.instanceMatrix.needsUpdate = this.legs.instanceMatrix.needsUpdate = this.status.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    if (this.head.instanceColor) this.head.instanceColor.needsUpdate = true;
    if (this.legs.instanceColor) this.legs.instanceColor.needsUpdate = true;
    if (this.status.instanceColor) this.status.instanceColor.needsUpdate = true;
  }

  agentIdForInstance(instanceId: number | undefined): number | null {
    if (instanceId === undefined || instanceId < 0 || instanceId >= this.ids.length) return null;
    return this.ids[instanceId] ?? null;
  }

  dispose(): void {
    for (const mesh of [this.body, this.head, this.legs, this.status]) {
      mesh.geometry.dispose();
      const material = mesh.material;
      if (!Array.isArray(material)) material.dispose();
    }
  }
}
