import type * as THREE_NS from 'three';
import type { SimParams } from '../types';
import { computeField, heatColor, type AnalysisMode } from '../simulation/analysis';
import { EpidemicCitySimulation, type EpidemicCityParams } from '../simulation/epidemicCity';
import { SimulationClock, type ClockSpeed } from '../simulationClock/clock';
import type { SimAgent, WorldObject } from '../simulation/types';
import type { Sim3D, ThreeRenderMetrics } from './types';
import {
  HumanoidAgentVisual,
  InstancedHumanoidCrowd,
  mapSimAgentToHumanoid,
  type HumanoidAgentState,
} from './humanoidAgentVisual';

/** Ten sam współczynnik świata używany przez budynki, drogi, agentów i heatmapę. */
export const CITY_WORLD_SCALE = 0.018;
const CITY_VELOCITY_SCALE_FACTOR = 0.10;
const MAX_DETAILED_HUMANOIDS = 10;
const MAX_CROWD_HUMANOIDS = 512;
const ANALYSIS_COLS = 36;
const ANALYSIS_ROWS = 24;

export interface City3DCallbacks {
  onAgentSelected?: (agentId: number | null) => void;
}

/**
 * Rzeczywisty renderer WebGL dla istniejącego EpidemicCitySimulation.
 *
 * `simulation` pozostaje właścicielem nauki, czasu symulowanego, agentów,
 * kontaktów i transmisji. Ta klasa jest adapterem renderującym: może czytać
 * `agents()`, `objects()`, `lastTransmissions()` i `stats()`, lecz nigdy nie
 * modyfikuje agentów ani nie implementuje własnej epidemiologii.
 */
export class EpidemicCity3DSim implements Sim3D {
  cameraAutoRotateSpeed = 0.16;
  private readonly simulation: EpidemicCitySimulation;
  private readonly clock = new SimulationClock();
  private readonly callbacks: City3DCallbacks;
  private THREE: typeof THREE_NS | null = null;
  private camera: THREE_NS.PerspectiveCamera | null = null;
  private scene: THREE_NS.Scene | null = null;
  private raycaster: THREE_NS.Raycaster | null = null;
  private viewport = { w: 1, h: 1 };
  private timeSeconds = 0;
  private analysisMode: AnalysisMode = 'none';
  private selectedId: number | null = null;
  private pointerDown: { x: number; y: number } | null = null;
  private pointerDragged = false;
  private followTarget: THREE_NS.Vector3 | null = null;
  private detailVisuals = new Map<number, HumanoidAgentVisual>();
  private crowd: InstancedHumanoidCrowd | null = null;
  private analysisMesh: THREE_NS.InstancedMesh | null = null;
  private analysisMaterial: THREE_NS.MeshBasicMaterial | null = null;
  private transmissionMarkers = new Map<string, { mesh: THREE_NS.Mesh; born: number }>();
  private buildingMeshes: THREE_NS.Object3D[] = [];
  private lastDetailCount = 0;
  private lastCrowdCount = 0;
  private lastTickMs = 0;
  private renderMetrics: ThreeRenderMetrics = { fps: 0, frameMs: 0, renderMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0 };

  constructor(params: Partial<EpidemicCityParams> = {}, callbacks: City3DCallbacks = {}) {
    this.simulation = new EpidemicCitySimulation(params);
    this.callbacks = callbacks;
  }

  getSim(): EpidemicCitySimulation {
    return this.simulation;
  }

  setAnalysisMode(mode: AnalysisMode): void {
    this.analysisMode = mode;
  }

  setClockSpeed(speed: ClockSpeed): void {
    this.clock.setSpeed(speed);
  }

  setParam(key: string, value: number | boolean): void {
    this.simulation.setParam(key, value);
  }

  step(): void {
    this.clock.singleStep((dt) => this.simulation.tick(dt));
  }

  clearSelection(): void {
    this.selectAgent(null);
  }

  reset(): void {
    this.clock.reset();
    this.simulation.reset();
    this.selectAgent(null);
  }

  init(THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera, w: number, h: number): void {
    this.THREE = THREE;
    this.scene = scene;
    this.camera = camera;
    this.viewport = { w, h };
    this.raycaster = new THREE.Raycaster();
    scene.background = new THREE.Color(0x07111d);
    scene.fog = new THREE.Fog(0x07111d, 12, 34);
    camera.position.set(0, 13.5, 11.5);
    camera.lookAt(0, 0, 0);

    this.addLightsAndGround();
    this.addRoadsAndBuildings();
    this.addAnalysisLayer();
    this.crowd = new InstancedHumanoidCrowd(THREE, MAX_CROWD_HUMANOIDS);
    this.crowd.addTo(scene);
  }

  update(dt: number, params: SimParams): void {
    this.timeSeconds += dt;
    const speed = Number(params.clockSpeed ?? 1) as ClockSpeed;
    if (speed !== this.clock.speed) this.clock.setSpeed(speed);
    const tickStartedAt = performance.now();
    this.clock.advance(dt, (dtDays) => this.simulation.tick(dtDays));
    this.lastTickMs = performance.now() - tickStartedAt;
  }

  onRenderMetrics(metrics: ThreeRenderMetrics): void {
    this.renderMetrics = metrics;
  }

  syncScene(): void {
    if (!this.THREE || !this.scene) return;
    const agents = this.simulation.agents();
    const velocityScale = this.simulation.worldWidth * CITY_VELOCITY_SCALE_FACTOR;
    const states = agents.map((agent) => mapSimAgentToHumanoid(
      agent,
      this.simulation.worldWidth,
      this.simulation.worldHeight,
      CITY_WORLD_SCALE,
      velocityScale,
    ));

    this.syncHumanoids(states);
    this.syncAnalysis(agents);
    this.syncTransmissionMarkers();
    this.syncFollowTarget(states);
  }

  getOrbitTarget(): THREE_NS.Vector3 | null {
    return this.followTarget;
  }

  onResize(w: number, h: number): void {
    this.viewport = { w, h };
  }

  getStats(): Record<string, number> {
    return {
      ...this.simulation.stats(),
      webgl_detailed_humanoids: this.lastDetailCount,
      webgl_instanced_humanoids: this.lastCrowdCount,
      webgl_total_humanoids: this.lastDetailCount + this.lastCrowdCount,
      webgl_selected_agent: this.selectedId ?? -1,
      sim_clock_days: Math.round(this.clock.time * 100) / 100,
      sim_tick_ms: this.lastTickMs,
      webgl_fps: this.renderMetrics.fps,
      webgl_frame_ms: this.renderMetrics.frameMs,
      webgl_render_ms: this.renderMetrics.renderMs,
      webgl_draw_calls: this.renderMetrics.drawCalls,
      webgl_triangles: this.renderMetrics.triangles,
      webgl_geometries: this.renderMetrics.geometries,
      webgl_textures: this.renderMetrics.textures,
    };
  }

  pointer(x: number, y: number, type: 'down' | 'move' | 'up'): void {
    if (type === 'down') {
      this.pointerDown = { x, y };
      this.pointerDragged = false;
      return;
    }
    if (type === 'move') {
      if (this.pointerDown && Math.hypot(x - this.pointerDown.x, y - this.pointerDown.y) > 6) this.pointerDragged = true;
      return;
    }
    const wasDrag = this.pointerDragged;
    this.pointerDown = null;
    this.pointerDragged = false;
    if (wasDrag || !this.THREE || !this.camera || !this.raycaster || this.viewport.w <= 0 || this.viewport.h <= 0) return;

    const ndc = new this.THREE.Vector2((x / this.viewport.w) * 2 - 1, -(y / this.viewport.h) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);

    const detailedTargets = [...this.detailVisuals.values()].map((visual) => visual.root);
    const detailedHits = this.raycaster.intersectObjects(detailedTargets, true);
    if (detailedHits.length) {
      let node: THREE_NS.Object3D | null = detailedHits[0].object;
      while (node && typeof node.userData.agentId !== 'number') node = node.parent;
      if (node && typeof node.userData.agentId === 'number') {
        this.selectAgent(node.userData.agentId as number);
        return;
      }
    }

    if (this.crowd) {
      const crowdTargets = [this.crowd.body, this.crowd.head, this.crowd.legs, this.crowd.status];
      const crowdHits = this.raycaster.intersectObjects(crowdTargets, false);
      if (crowdHits.length) {
        const id = this.crowd.agentIdForInstance(crowdHits[0].instanceId);
        if (id !== null) {
          this.selectAgent(id);
          return;
        }
      }
    }
    this.selectAgent(null);
  }

  dispose(): void {
    for (const visual of this.detailVisuals.values()) visual.dispose();
    this.detailVisuals.clear();
    this.crowd?.dispose();
    this.crowd = null;
    this.analysisMesh?.geometry.dispose();
    this.analysisMaterial?.dispose();
    this.analysisMesh = null;
    this.analysisMaterial = null;
    for (const marker of this.transmissionMarkers.values()) {
      marker.mesh.geometry.dispose();
      (marker.mesh.material as THREE_NS.Material).dispose();
    }
    this.transmissionMarkers.clear();
    for (const object of this.buildingMeshes) {
      object.traverse((node) => {
        const mesh = node as THREE_NS.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material;
        if (material && !Array.isArray(material)) material.dispose();
      });
    }
    this.buildingMeshes = [];
  }

  private addLightsAndGround(): void {
    if (!this.THREE || !this.scene) return;
    const THREE = this.THREE;
    this.scene.add(new THREE.HemisphereLight(0xb8d8ff, 0x142016, 1.35));
    const key = new THREE.DirectionalLight(0xfff1d0, 2.0);
    key.position.set(6, 13, 7);
    key.castShadow = false;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x7eb3ff, 0.65);
    rim.position.set(-8, 5, -8);
    this.scene.add(rim);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.simulation.worldWidth * CITY_WORLD_SCALE + 2, this.simulation.worldHeight * CITY_WORLD_SCALE + 2),
      new THREE.MeshStandardMaterial({ color: 0x15251d, roughness: 0.98 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.012;
    this.scene.add(ground);
    this.buildingMeshes.push(ground);
  }

  private addRoadsAndBuildings(): void {
    if (!this.THREE || !this.scene) return;
    const THREE = this.THREE;
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 0.92 });
    const roadWidth = 0.34;
    const worldW = this.simulation.worldWidth * CITY_WORLD_SCALE;
    const worldH = this.simulation.worldHeight * CITY_WORLD_SCALE;
    const streets = this.simulation.streets;
    for (const y of streets.h) {
      const road = new THREE.Mesh(new THREE.BoxGeometry(worldW, 0.018, roadWidth), roadMat.clone());
      road.position.set(0, 0.005, (y - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE);
      this.scene.add(road);
      this.buildingMeshes.push(road);
    }
    for (const x of streets.v) {
      const road = new THREE.Mesh(new THREE.BoxGeometry(roadWidth, 0.019, worldH), roadMat.clone());
      road.position.set((x - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE, 0.007, 0);
      this.scene.add(road);
      this.buildingMeshes.push(road);
    }

    for (const building of this.simulation.objects()) {
      const group = this.createBuilding(building);
      this.scene.add(group);
      this.buildingMeshes.push(group);
    }
  }

  private createBuilding(building: WorldObject): THREE_NS.Group {
    const THREE = this.THREE!;
    const group = new THREE.Group();
    const x = (building.x + building.w / 2 - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE;
    const z = (building.y + building.h / 2 - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE;
    const w = Math.max(0.18, building.w * CITY_WORLD_SCALE);
    const d = Math.max(0.18, building.h * CITY_WORLD_SCALE);
    const style: Record<string, { color: number; height: number; roof: number }> = {
      home: { color: 0x6d8eb7, height: 0.72, roof: 0x364d6b },
      shop: { color: 0xd4a15e, height: 1.00, roof: 0x784825 },
      school: { color: 0x89bdd3, height: 1.08, roof: 0x2e687e },
      hospital: { color: 0xd9e1e8, height: 1.24, roof: 0xb13e46 },
      isolation: { color: 0x8d8c9a, height: 0.88, roof: 0x565460 },
      park: { color: 0x3d855d, height: 0.05, roof: 0x3d855d },
    };
    const s = style[building.kind] ?? { color: 0x718096, height: 0.8, roof: 0x3f4a5a };
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, s.height, d),
      new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.82, metalness: 0.02 }),
    );
    body.position.y = s.height / 2;
    group.add(body);

    if (building.kind !== 'park') {
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w * 1.08, 0.12, d * 1.08),
        new THREE.MeshStandardMaterial({ color: s.roof, roughness: 0.9 }),
      );
      roof.position.y = s.height + 0.06;
      group.add(roof);
    } else {
      for (let i = 0; i < 4; i++) {
        const tree = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 8), new THREE.MeshStandardMaterial({ color: 0x245c37, roughness: 0.95 }));
        tree.position.set((i % 2 ? 0.25 : -0.25) * w, 0.32, (i < 2 ? -0.25 : 0.25) * d);
        group.add(tree);
      }
    }
    if (building.closed) {
      const marker = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: 0xffc857 }));
      marker.position.set(0, s.height + 0.18, d / 2 + 0.02);
      group.add(marker);
    }
    group.position.set(x, 0, z);
    return group;
  }

  private addAnalysisLayer(): void {
    if (!this.THREE || !this.scene) return;
    const THREE = this.THREE;
    this.analysisMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    this.analysisMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.analysisMaterial, ANALYSIS_COLS * ANALYSIS_ROWS);
    this.analysisMesh.rotation.x = -Math.PI / 2;
    this.analysisMesh.position.y = 0.018;
    this.analysisMesh.name = 'city-analysis-field';
    this.analysisMesh.count = 0;
    this.scene.add(this.analysisMesh);
  }

  private syncHumanoids(states: readonly HumanoidAgentState[]): void {
    if (!this.scene || !this.THREE || !this.crowd) return;
    const liveStates = states.filter((state) => state.health !== 'D');
    const selected = this.selectedId === null ? null : liveStates.find((state) => state.id === this.selectedId) ?? null;
    const candidates = selected ? [selected, ...liveStates.filter((state) => state.id !== selected.id)] : liveStates;
    const detailedStates = candidates.slice(0, Math.min(MAX_DETAILED_HUMANOIDS, candidates.length));
    const detailedIds = new Set(detailedStates.map((state) => state.id));

    for (const state of detailedStates) {
      let visual = this.detailVisuals.get(state.id);
      if (!visual) {
        visual = new HumanoidAgentVisual(this.THREE, state.id);
        this.detailVisuals.set(state.id, visual);
        this.scene.add(visual.root);
      }
      visual.setSelected(state.id === this.selectedId);
      visual.sync(state, this.timeSeconds);
    }
    for (const [id, visual] of [...this.detailVisuals]) {
      if (detailedIds.has(id)) continue;
      this.scene.remove(visual.root);
      visual.dispose();
      this.detailVisuals.delete(id);
    }

    this.crowd.update(liveStates.filter((state) => !detailedIds.has(state.id)).slice(0, MAX_CROWD_HUMANOIDS));
    this.lastDetailCount = this.detailVisuals.size;
    this.lastCrowdCount = Math.min(Math.max(0, liveStates.length - this.lastDetailCount), MAX_CROWD_HUMANOIDS);
  }

  private syncAnalysis(agents: readonly SimAgent[]): void {
    if (!this.analysisMesh || !this.THREE) return;
    if (this.analysisMode === 'none') {
      this.analysisMesh.count = 0;
      return;
    }
    const field = computeField(agents, this.simulation.worldWidth, this.simulation.worldHeight, this.analysisMode, ANALYSIS_COLS, ANALYSIS_ROWS);
    const cellW = (this.simulation.worldWidth / field.cols) * CITY_WORLD_SCALE;
    const cellH = (this.simulation.worldHeight / field.rows) * CITY_WORLD_SCALE;
    const matrix = new this.THREE.Matrix4();
    const position = new this.THREE.Vector3();
    const scale = new this.THREE.Vector3();
    const quaternion = new this.THREE.Quaternion();
    for (let row = 0; row < field.rows; row++) {
      for (let col = 0; col < field.cols; col++) {
        const index = row * field.cols + col;
        const value = field.values[index];
        position.set(
          ((col + 0.5) * this.simulation.worldWidth / field.cols - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE,
          0,
          ((row + 0.5) * this.simulation.worldHeight / field.rows - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE,
        );
        scale.set(cellW * 0.97, cellH * 0.97, 1);
        matrix.compose(position, quaternion, scale);
        this.analysisMesh.setMatrixAt(index, matrix);
        const [r, g, b] = heatColor(value);
        this.analysisMesh.setColorAt(index, new this.THREE.Color(r / 255, g / 255, b / 255));
      }
    }
    this.analysisMesh.count = field.cols * field.rows;
    this.analysisMesh.instanceMatrix.needsUpdate = true;
    if (this.analysisMesh.instanceColor) this.analysisMesh.instanceColor.needsUpdate = true;
  }

  private syncTransmissionMarkers(): void {
    if (!this.THREE || !this.scene) return;
    const alive = new Set<string>();
    for (const event of this.simulation.lastTransmissions()) {
      const key = `${event.from}-${event.to}`;
      alive.add(key);
      if (!this.transmissionMarkers.has(key)) {
        const mesh = new this.THREE.Mesh(
          new this.THREE.RingGeometry(0.12, 0.16, 20),
          new this.THREE.MeshBasicMaterial({ color: 0xff5c5c, transparent: true, opacity: 0.9, depthWrite: false, side: this.THREE.DoubleSide }),
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set((event.x - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE, 0.03, (event.y - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE);
        this.scene.add(mesh);
        this.transmissionMarkers.set(key, { mesh, born: this.timeSeconds });
      }
    }
    for (const [key, marker] of this.transmissionMarkers) {
      const age = this.timeSeconds - marker.born;
      marker.mesh.scale.setScalar(1 + age * 2.5);
      (marker.mesh.material as THREE_NS.MeshBasicMaterial).opacity = Math.max(0, 0.9 - age * 1.4);
      if (age > 0.65 || (!alive.has(key) && age > 0.25)) {
        this.scene.remove(marker.mesh);
        marker.mesh.geometry.dispose();
        (marker.mesh.material as THREE_NS.Material).dispose();
        this.transmissionMarkers.delete(key);
      }
    }
  }

  private syncFollowTarget(states: readonly HumanoidAgentState[]): void {
    if (!this.THREE || this.selectedId === null) {
      this.followTarget = null;
      return;
    }
    const selected = states.find((state) => state.id === this.selectedId);
    if (!selected) {
      this.selectAgent(null);
      return;
    }
    if (!this.followTarget) this.followTarget = new this.THREE.Vector3();
    this.followTarget.set(selected.worldX, 0.85, selected.worldZ);
  }

  private selectAgent(id: number | null): void {
    this.selectedId = id;
    this.callbacks.onAgentSelected?.(id);
  }
}
