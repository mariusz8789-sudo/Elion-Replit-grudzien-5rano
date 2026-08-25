import type * as THREE_NS from 'three';
import type { SimParams } from '../types';
import { computeField, heatColor, type AnalysisMode } from '../simulation/analysis';
import { EpidemicCitySimulation, type EpidemicCityParams } from '../simulation/epidemicCity';
import { DEFAULT_HOSPITAL_CAPACITY, evaluateHospitalState, type HospitalStatus } from '../simulation/hospitalResource';
import { SimulationClock, type ClockSpeed } from '../simulationClock/clock';
import type { SimAgent, WorldObject } from '../simulation/types';
import { EventRegistry, EventStream, ingestTransmissions } from '../events';
import type { PostProcessingModules, PostProcessor, Sim3D, ThreeRenderMetrics } from './types';
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
// InstancedMesh utrzymuje stałą liczbę draw calls; P1 umożliwia uczciwy benchmark do 1000 agentów.
const MAX_CROWD_HUMANOIDS = 1024;
/** Czas prezentacji odczytanego eventu — nie wpływa na czas ani prawdopodobieństwo modelu. */
// Krótka obserwacja rzeczywistego kontaktu: po pauzie zegara pozostaje do inspekcji, ale w ruchu nie zamienia świata w dashboard.
const TRANSMISSION_MARKER_LIFETIME_SECONDS = 1.1;
const ANALYSIS_COLS = 36;
const ANALYSIS_ROWS = 24;

/** Presety obserwacji są cechą kamery; nie zmieniają modeli, agentów ani ich zachowania. */
export type CityCameraPreset = 'city' | 'district' | 'street' | 'agent';

export interface City3DCallbacks {
  onAgentSelected?: (agentId: number | null) => void;
}

/** Ostatnie rzeczywiście zaobserwowane A→B do prezentacji; to nie jest nowy Event Engine ani historia zdarzeń. */
export interface CityTransmissionView {
  from: number;
  to: number;
  day: number;
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
  /** Jeden kontraktowy rejestr per przebieg; nie jest World State i renderer czyta wyłącznie przez EventStream. */
  private readonly eventRegistry: EventRegistry;
  private readonly eventStream: EventStream;
  private readonly eventSeed: number | string | undefined;
  private eventCursor = 0;
  private readonly callbacks: City3DCallbacks;
  private THREE: typeof THREE_NS | null = null;
  private camera: THREE_NS.PerspectiveCamera | null = null;
  private scene: THREE_NS.Scene | null = null;
  private raycaster: THREE_NS.Raycaster | null = null;
  private viewport = { w: 1, h: 1 };
  private timeSeconds = 0;
  private analysisMode: AnalysisMode = 'none';
  private showTransmissions = true;
  private selectedId: number | null = null;
  /** Cel jest ustawiany wyłącznie podczas odczytu prawdziwego TransmissionEvent. */
  private latestTransmissionTarget: number | null = null;
  private latestTransmissionView: CityTransmissionView | null = null;
  private pointerDown: { x: number; y: number } | null = null;
  private pointerDragged = false;
  private followTarget: THREE_NS.Vector3 | null = null;
  private cameraPreset: CityCameraPreset = 'city';
  private resetCityCameraPending = false;
  /** Agent pozostaje źródłem punktu kamery; preset ulicy nie tworzy wirtualnej choreografii. */
  private cameraTrackId: number | null = null;
  private detailVisuals = new Map<number, HumanoidAgentVisual>();
  private crowd: InstancedHumanoidCrowd | null = null;
  private analysisMesh: THREE_NS.InstancedMesh | null = null;
  private analysisMaterial: THREE_NS.MeshBasicMaterial | null = null;
  /** Efemeryczne ślady są tworzone wyłącznie z `lastTransmissions()` silnika. */
  private transmissionMarkers = new Map<string, { group: THREE_NS.Group; born: number; material: THREE_NS.MeshBasicMaterial }>();
  private buildingMeshes: THREE_NS.Object3D[] = [];
  private lastDetailCount = 0;
  private lastCrowdCount = 0;
  private lastTickMs = 0;
  private renderMetrics: ThreeRenderMetrics = { fps: 0, frameMs: 0, renderMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0 };

  constructor(params: Partial<EpidemicCityParams> = {}, callbacks: City3DCallbacks = {}) {
    this.simulation = new EpidemicCitySimulation(params);
    this.eventSeed = params.seed;
    this.eventRegistry = new EventRegistry({ modelId: 'epidemic.city', seed: this.eventSeed });
    this.eventStream = new EventStream(this.eventRegistry);
    this.eventCursor = this.eventStream.cursor();
    this.callbacks = callbacks;
  }

  getSim(): EpidemicCitySimulation {
    return this.simulation;
  }

  setAnalysisMode(mode: AnalysisMode): void {
    this.analysisMode = mode;
  }

  /** Widoczność zmienia wyłącznie renderer; źródłem śladów nadal są eventy modelu. */
  setShowTransmissions(visible: boolean): void {
    this.showTransmissions = visible;
  }

  setClockSpeed(speed: ClockSpeed): void {
    this.clock.setSpeed(speed);
  }

  /** View-model UI pochodzi z najnowszego odczytu `lastTransmissions()`, nie tworzy ani nie przepisuje eventu. */
  getLatestTransmissionView(): CityTransmissionView | null {
    return this.latestTransmissionView;
  }

  setParam(key: string, value: number | boolean): void {
    this.simulation.setParam(key, value);
  }

  step(): void {
    this.clock.singleStep((dt) => this.simulation.tick(dt));
  }

  clearSelection(): void {
    this.cameraPreset = 'city';
    this.cameraTrackId = null;
    this.selectAgent(null);
  }

  getCameraPreset(): CityCameraPreset {
    return this.cameraPreset;
  }

  /** Jeden mechanizm kamery dla świata, dzielnicy, ulicy i modelowego agenta. */
  setCameraPreset(preset: CityCameraPreset): number | null {
    this.cameraPreset = preset;
    if (preset === 'city') {
      this.cameraTrackId = null;
      this.resetCityCameraPending = true;
      this.selectAgent(null);
      return null;
    }
    const agents = this.simulation.agents();
    const moving = agents.find((agent) => Math.hypot(agent.vx, agent.vy) > 1e-3);
    const infected = agents.find((agent) => agent.state === 'I') ?? agents.find((agent) => agent.state === 'E');
    const candidate = (preset === 'agent' || preset === 'street')
      ? infected ?? moving ?? agents[0] ?? null
      : moving ?? infected ?? agents[0] ?? null;
    this.cameraTrackId = candidate?.id ?? null;
    // STREET i AGENT używają prawdziwego celu oraz pełnego rigu; nie tworzą osobnej postaci ani kamery.
    this.selectAgent((preset === 'agent' || preset === 'street') ? candidate?.id ?? null : null, preset === 'street');
    return candidate?.id ?? null;
  }

  /** Wybiera faktycznego zakażonego/narażonego agenta z aktualnego stanu modelu. */
  focusFirstInfected(): number | null {
    const agent = this.simulation.agents().find((candidate) => candidate.state === 'I')
      ?? this.simulation.agents().find((candidate) => candidate.state === 'E')
      ?? null;
    this.selectAgent(agent?.id ?? null);
    return agent?.id ?? null;
  }

  /** Fokus ma sens tylko dla celu prawdziwego zdarzenia odczytanego z modelu. */
  focusLatestTransmission(): number | null {
    if (this.latestTransmissionTarget === null) return null;
    const target = this.simulation.agents().find((agent) => agent.id === this.latestTransmissionTarget) ?? null;
    this.selectAgent(target?.id ?? null);
    return target?.id ?? null;
  }

  reset(): void {
    this.clock.reset();
    this.simulation.reset();
    this.eventRegistry.reset();
    this.eventCursor = this.eventStream.cursor();
    this.latestTransmissionTarget = null;
    this.latestTransmissionView = null;
    this.selectAgent(null);
  }

  init(THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera, w: number, h: number): void {
    this.THREE = THREE;
    this.scene = scene;
    this.camera = camera;
    this.viewport = { w, h };
    this.raycaster = new THREE.Raycaster();
    scene.background = new THREE.Color(0x0d1c2d);
    scene.fog = new THREE.Fog(0x0d1c2d, 16, 38);
    camera.position.set(0, 12.2, 11.0);
    camera.lookAt(0, 0, 0);

    this.addLightsAndGround();
    this.addRoadsAndBuildings();
    this.addStreetAtmosphere();
    this.addAnalysisLayer();
    this.crowd = new InstancedHumanoidCrowd(THREE, MAX_CROWD_HUMANOIDS);
    this.crowd.addTo(scene);
  }

  /** Delikatny bloom wzmacnia rzeczywiste światła, okna i epidemiologiczne akcenty bez efektu "neonowej gry". */
  setupPostProcessing(
    modules: PostProcessingModules,
    renderer: THREE_NS.WebGLRenderer,
    scene: THREE_NS.Scene,
    camera: THREE_NS.PerspectiveCamera,
    w: number,
    h: number,
  ): PostProcessor {
    const THREE = this.THREE!;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const composer = new modules.EffectComposer(renderer);
    composer.addPass(new modules.RenderPass(scene, camera));
    const bloom = new modules.UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.42, 0.88);
    composer.addPass(bloom);
    composer.addPass(new modules.OutputPass());
    return {
      render: () => composer.render(),
      setSize: (width, height) => composer.setSize(width, height),
      dispose: () => composer.dispose(),
    };
  }

  update(dt: number, params: SimParams): void {
    const speed = Number(params.clockSpeed ?? 1) as ClockSpeed;
    if (speed !== this.clock.speed) this.clock.setSpeed(speed);
    // Ślad eventu zatrzymuje się razem z czasem modelu; ręczny krok można więc sprawdzić bez wyścigu z renderem.
    if (this.clock.running) this.timeSeconds += dt;
    const tickStartedAt = performance.now();
    this.clock.advance(dt, (dtDays) => {
      this.simulation.tick(dtDays);
      // Adapter odczytuje wyłącznie faktyczne TransmissionEvent po każdym kroku modelu.
      ingestTransmissions(this.eventRegistry, this.simulation.lastTransmissions(), {
        simTime: this.clock.time,
        modelId: 'epidemic.city',
        seed: this.eventSeed,
        params: this.simulation.getParams(),
      });
    });
    this.lastTickMs = performance.now() - tickStartedAt;
  }

  onRenderMetrics(metrics: ThreeRenderMetrics): void {
    this.renderMetrics = metrics;
  }

  syncScene(_scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera): void {
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
    if (this.resetCityCameraPending) {
      camera.position.set(0, 12.2, 11.0);
      camera.lookAt(0, 0, 0);
      this.resetCityCameraPending = false;
    }
    if (this.followTarget) {
      const focusDistance = this.getOrbitFocusDistance() ?? 4.2;
      const focusDirection = this.getOrbitCameraDirection() ?? new this.THREE.Vector3(1, 0.72, 1).normalize();
      // Pierwsza klatka focusu używa tej samej orientacji co wspólna pętla OrbitControls, bez drugiej kamery.
      camera.position.copy(this.followTarget).addScaledVector(focusDirection, focusDistance);
      camera.lookAt(this.followTarget);
    }
  }

  getOrbitTarget(): THREE_NS.Vector3 | null {
    return this.followTarget;
  }

  getOrbitFocusDistance(): number | null {
    if (!this.followTarget) return null;
    if (this.cameraPreset === 'district') return 7.2;
    // Ten sam rig i OrbitControls: STREET jest na wysokości obserwatora, AGENT pozwala obejrzeć twarz i ubranie.
    if (this.cameraPreset === 'street') return 2.9;
    return 1.85;
  }

  getOrbitCameraDirection(): THREE_NS.Vector3 | null {
    if (!this.THREE || !this.followTarget || this.cameraPreset !== 'street') return null;
    // Niski, stabilny kierunek uliczny: nadal jedna kamera OrbitControls, bez fikcyjnego ruchu lub danych agenta.
    return new this.THREE.Vector3(1, 0.16, 1).normalize();
  }

  onResize(w: number, h: number): void {
    this.viewport = { w, h };
  }

  /**
   * Kody statusu szpitala jako liczby, żeby zmieścić się w kontrakcie
   * `getStats(): Record<string, number>`, którego trzyma się cała reszta tego
   * ekranu. Etykieta wraca z `HOSPITAL_STATUS_LABELS` po stronie UI — liczba
   * tutaj nie jest wynikiem, tylko indeksem.
   */
  private hospitalStatusCode(status: HospitalStatus): number {
    return (['NORMAL', 'WARNING', 'HIGH', 'CRITICAL'] as const).indexOf(status);
  }

  getStats(): Record<string, number> {
    const base = this.simulation.stats();
    // Realna księgowość łóżek nad realną liczbą hospitalizowanych — ta sama
    // czysta funkcja, którą pokrywają testy Scientific Core i Discovery
    // Engine. Pojemność domyślna (`DEFAULT_HOSPITAL_CAPACITY`) jest tą samą
    // stałą co w silniku, nie liczbą wymyśloną dla ekranu.
    const hospital = evaluateHospitalState(
      { day: base.dzien, hospitalizedNow: base.hospitalizowani },
      DEFAULT_HOSPITAL_CAPACITY,
    );
    return {
      ...base,
      hosp_total_beds: DEFAULT_HOSPITAL_CAPACITY.totalBeds,
      hosp_icu_beds: DEFAULT_HOSPITAL_CAPACITY.icuBeds,
      hosp_occupied_beds: hospital.occupiedBeds,
      hosp_occupied_icu: hospital.occupiedIcu,
      hosp_unmet_care: hospital.unmetCare,
      hosp_bed_occupancy_pct: Math.round(hospital.bedOccupancy * 1000) / 10,
      hosp_icu_occupancy_pct: Math.round(hospital.icuOccupancy * 1000) / 10,
      hosp_status_code: this.hospitalStatusCode(hospital.status),
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
      const crowdHits = this.raycaster.intersectObjects(this.crowd.pickTargets(), false);
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
      marker.group.traverse((node) => {
        const mesh = node as THREE_NS.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material;
        if (material && !Array.isArray(material)) material.dispose();
      });
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
    this.scene.add(new THREE.HemisphereLight(0xa9c9ff, 0x1c3022, 1.72));
    this.scene.add(new THREE.AmbientLight(0x7598c4, 0.28));
    const key = new THREE.DirectionalLight(0xffd7a1, 2.65);
    key.position.set(7, 15, 8);
    key.castShadow = false;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x79b6ff, 1.15);
    rim.position.set(-9, 7, -8);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0x8ce3c6, 0.55);
    fill.position.set(-2, 4, 12);
    this.scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.simulation.worldWidth * CITY_WORLD_SCALE + 2, this.simulation.worldHeight * CITY_WORLD_SCALE + 2),
      new THREE.MeshStandardMaterial({ color: 0x224033, roughness: 0.94, metalness: 0.02 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.012;
    this.scene.add(ground);
    this.buildingMeshes.push(ground);
  }

  /** Lekka, deterministyczna infrastruktura uliczna; nie jest drugim modelem miasta. */
  private addStreetAtmosphere(): void {
    if (!this.THREE || !this.scene) return;
    const THREE = this.THREE;
    const worldW = this.simulation.worldWidth * CITY_WORLD_SCALE;
    const worldH = this.simulation.worldHeight * CITY_WORLD_SCALE;
    const streets = this.simulation.streets;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    const rotation = new THREE.Quaternion();
    const roadMat = new THREE.MeshBasicMaterial({ color: 0xf2f6ff, transparent: true, opacity: 0.76 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x34495e, roughness: 0.62, metalness: 0.58 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd89a, transparent: true, opacity: 0.94 });
    const lamps: Array<{ x: number; z: number }> = [];
    for (const y of streets.h) for (let x = -worldW / 2 + 0.55; x < worldW / 2; x += 1.4) lamps.push({ x, z: (y - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE - 0.30 });
    for (const x of streets.v) for (let z = -worldH / 2 + 0.65; z < worldH / 2; z += 1.55) lamps.push({ x: (x - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE + 0.30, z });
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.032, 0.66, 7), poleMat, lamps.length);
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), bulbMat, lamps.length);
    lamps.forEach((lamp, index) => {
      position.set(lamp.x, 0.33, lamp.z); matrix.compose(position, rotation, scale); poles.setMatrixAt(index, matrix);
      position.set(lamp.x, 0.67, lamp.z); matrix.compose(position, rotation, scale); bulbs.setMatrixAt(index, matrix);
    });
    poles.instanceMatrix.needsUpdate = true; bulbs.instanceMatrix.needsUpdate = true;
    poles.name = 'city-streetlight-poles'; bulbs.name = 'city-streetlight-bulbs';
    this.scene.add(poles, bulbs); this.buildingMeshes.push(poles, bulbs);

    // Dziewięć punktów świetlnych na skrzyżowaniach zapewnia głębię bez kosztu światła per latarnia.
    streets.v.forEach((x, col) => streets.h.forEach((y, row) => {
      const light = new THREE.PointLight(0xffc875, 0.62 + ((row + col) % 3) * 0.12, 3.1, 2);
      light.position.set((x - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE, 1.20, (y - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE);
      this.scene!.add(light);
    }));

    const crossings = new THREE.InstancedMesh(new THREE.BoxGeometry(0.055, 0.009, 0.25), roadMat, streets.v.length * streets.h.length * 10);
    let crossingIndex = 0;
    streets.v.forEach((x) => streets.h.forEach((y) => {
      const ix = (x - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE;
      const iz = (y - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE;
      for (let mark = -2; mark <= 2; mark++) {
        position.set(ix + mark * 0.07, 0.026, iz - 0.23); matrix.compose(position, rotation, scale); crossings.setMatrixAt(crossingIndex++, matrix);
        position.set(ix - 0.23, 0.026, iz + mark * 0.07); rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2); matrix.compose(position, rotation, scale); crossings.setMatrixAt(crossingIndex++, matrix); rotation.identity();
      }
    }));
    crossings.count = crossingIndex; crossings.instanceMatrix.needsUpdate = true; crossings.name = 'city-crosswalks';
    this.scene.add(crossings); this.buildingMeshes.push(crossings);

    const park = this.simulation.objects().find((object) => object.kind === 'park');
    if (park) {
      const px = (park.x + park.w / 2 - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE;
      const pz = (park.y + park.h / 2 - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE;
      const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(0.15, 0.62, 7), new THREE.MeshStandardMaterial({ color: 0x1f6b43, roughness: 0.95 }), 18);
      const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.026, 0.036, 0.34, 6), new THREE.MeshStandardMaterial({ color: 0x65412d, roughness: 1 }), 18);
      for (let index = 0; index < 18; index++) {
        const angle = index * 2.39996;
        const radius = 0.26 + (index % 4) * 0.13;
        const x = px + Math.cos(angle) * radius * 1.65;
        const z = pz + Math.sin(angle) * radius;
        position.set(x, 0.48, z); matrix.compose(position, rotation, scale); trees.setMatrixAt(index, matrix);
        position.set(x, 0.17, z); matrix.compose(position, rotation, scale); trunks.setMatrixAt(index, matrix);
      }
      trees.instanceMatrix.needsUpdate = true; trunks.instanceMatrix.needsUpdate = true;
      trees.name = 'city-park-tree-canopies'; trunks.name = 'city-park-tree-trunks';
      this.scene.add(trees, trunks); this.buildingMeshes.push(trees, trunks);
    }

    const benches = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.055, 0.10), new THREE.MeshStandardMaterial({ color: 0x8d5d3c, roughness: 0.78, metalness: 0.08 }), 8);
    for (let index = 0; index < 8; index++) {
      position.set(-worldW / 2 + 0.72 + (index % 4) * 1.7, 0.18, worldH / 2 - 0.48 - Math.floor(index / 4) * 1.2);
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), index % 2 ? Math.PI / 2 : 0); matrix.compose(position, rotation, scale); benches.setMatrixAt(index, matrix); rotation.identity();
    }
    benches.instanceMatrix.needsUpdate = true; benches.name = 'city-street-benches';
    this.scene.add(benches); this.buildingMeshes.push(benches);
  }

  private addRoadsAndBuildings(): void {
    if (!this.THREE || !this.scene) return;
    const THREE = this.THREE;
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x2d3848, roughness: 0.84, metalness: 0.04 });
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x91a6bb, roughness: 0.88, metalness: 0.02 });
    const markingMat = new THREE.MeshBasicMaterial({ color: 0xf2f7ff, transparent: true, opacity: 0.92 });
    const roadWidth = 0.34;
    const sidewalkWidth = 0.10;
    const worldW = this.simulation.worldWidth * CITY_WORLD_SCALE;
    const worldH = this.simulation.worldHeight * CITY_WORLD_SCALE;
    const streets = this.simulation.streets;
    for (const y of streets.h) {
      const z = (y - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE;
      const road = new THREE.Mesh(new THREE.BoxGeometry(worldW, 0.018, roadWidth), roadMat.clone());
      road.position.set(0, 0.005, z);
      const northWalk = new THREE.Mesh(new THREE.BoxGeometry(worldW, 0.014, sidewalkWidth), sidewalkMat.clone());
      northWalk.position.set(0, 0.003, z - roadWidth / 2 - sidewalkWidth / 2);
      const southWalk = northWalk.clone(); southWalk.position.z = z + roadWidth / 2 + sidewalkWidth / 2;
      this.scene.add(road, northWalk, southWalk);
      this.buildingMeshes.push(road, northWalk, southWalk);
      for (let xi = -worldW / 2 + 0.35; xi < worldW / 2; xi += 0.58) {
        const mark = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.008, 0.022), markingMat);
        mark.position.set(xi, 0.018, z); this.scene.add(mark); this.buildingMeshes.push(mark);
      }
    }
    for (const x of streets.v) {
      const px = (x - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE;
      const road = new THREE.Mesh(new THREE.BoxGeometry(roadWidth, 0.019, worldH), roadMat.clone());
      road.position.set(px, 0.007, 0);
      const eastWalk = new THREE.Mesh(new THREE.BoxGeometry(sidewalkWidth, 0.014, worldH), sidewalkMat.clone());
      eastWalk.position.set(px - roadWidth / 2 - sidewalkWidth / 2, 0.003, 0);
      const westWalk = eastWalk.clone(); westWalk.position.x = px + roadWidth / 2 + sidewalkWidth / 2;
      this.scene.add(road, eastWalk, westWalk);
      this.buildingMeshes.push(road, eastWalk, westWalk);
      for (let zi = -worldH / 2 + 0.35; zi < worldH / 2; zi += 0.58) {
        const mark = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.008, 0.25), markingMat);
        mark.position.set(px, 0.018, zi); this.scene.add(mark); this.buildingMeshes.push(mark);
      }
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
    const style: Record<string, { color: number; height: number; roof: number; accent: number }> = {
      // Wysokości odpowiadają parterom i piętrom w tej samej skali co rig człowieka oraz drogi.
      home: { color: 0x6d8eb7, height: 1.18, roof: 0x364d6b, accent: 0xffd37c },
      shop: { color: 0xd4a15e, height: 1.32, roof: 0x784825, accent: 0xffcd70 },
      school: { color: 0x89bdd3, height: 1.56, roof: 0x2e687e, accent: 0x7ce9ff },
      hospital: { color: 0xd9e1e8, height: 1.82, roof: 0xb13e46, accent: 0xff6670 },
      isolation: { color: 0x8d8c9a, height: 1.28, roof: 0x565460, accent: 0xc6b6f5 },
      park: { color: 0x3d855d, height: 0.05, roof: 0x3d855d, accent: 0x78dca0 },
    };
    const s = style[building.kind] ?? { color: 0x718096, height: 0.8, roof: 0x3f4a5a, accent: 0x9fb3c8 };
    // Wariacja zależy wyłącznie od stabilnej geometrii CityWorld — nie jest losowym stanem dodatkowym.
    const variation = Math.abs(Math.round(building.x * 7 + building.y * 11 + building.w * 3)) % 5;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, s.height, d),
      new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.76, metalness: 0.04 }),
    );
    body.userData.focusOccluder = true;
    body.position.y = s.height / 2;
    group.add(body);

    if (building.kind !== 'park') {
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w * (1.04 + variation * 0.008), 0.12 + (variation % 2) * 0.025, d * 1.08),
        new THREE.MeshStandardMaterial({ color: s.roof, roughness: 0.83, metalness: 0.10 }),
      );
      roof.userData.focusOccluder = true;
      roof.position.y = s.height + 0.06;
      group.add(roof);
      if (building.kind === 'home' || variation === 0) {
        const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.26, 0.09), new THREE.MeshStandardMaterial({ color: 0x684d49, roughness: 0.92 }));
        chimney.position.set(w * 0.28, s.height + 0.20, -d * 0.18); group.add(chimney);
      }
      const litGlass = new THREE.MeshStandardMaterial({ color: 0xd8efff, emissive: 0x8ccfff, emissiveIntensity: 0.82, roughness: 0.28, metalness: 0.14 });
      const darkGlass = new THREE.MeshStandardMaterial({ color: 0x426b88, emissive: 0x10243a, emissiveIntensity: 0.25, roughness: 0.38, metalness: 0.16 });
      const columns = Math.max(1, Math.floor(w / 0.30));
      const rows = Math.max(1, Math.floor(s.height / 0.31));
      for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
        const lit = (row * 3 + col * 5 + variation) % 4 !== 0;
        const window = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.15, w / (columns + 1.35)), 0.115, 0.024), lit ? litGlass : darkGlass);
        window.position.set(-w / 2 + (col + 1) * w / (columns + 1), 0.28 + row * 0.26, d / 2 + 0.014);
        group.add(window);
      }
      const doorHeight = Math.min(0.48, s.height * 0.38);
      const door = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.19, w * 0.18), doorHeight, 0.038), new THREE.MeshStandardMaterial({ color: 0x183247, roughness: 0.64, metalness: 0.16, emissive: 0x091622, emissiveIntensity: 0.35 }));
      door.position.set(variation % 2 ? w * 0.22 : -w * 0.22, doorHeight / 2, d / 2 + 0.026); group.add(door);
      if (building.kind === 'home' || building.kind === 'school') {
        const balcony = new THREE.Mesh(new THREE.BoxGeometry(Math.min(w * 0.56, 0.72), 0.032, 0.14), new THREE.MeshStandardMaterial({ color: s.roof, roughness: 0.72, metalness: 0.18 }));
        balcony.position.set(variation % 2 ? -w * 0.14 : w * 0.14, s.height * 0.54, d / 2 + 0.07); group.add(balcony);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(Math.min(w * 0.52, 0.68), 0.11, 0.018), new THREE.MeshStandardMaterial({ color: 0xbfd4e5, roughness: 0.42, metalness: 0.42 }));
        rail.position.set(balcony.position.x, s.height * 0.54 + 0.07, d / 2 + 0.135); group.add(rail);
      }
      if (building.kind !== 'home') {
        const awning = new THREE.Mesh(new THREE.BoxGeometry(Math.min(w * 0.68, 0.90), 0.045, 0.16), new THREE.MeshStandardMaterial({ color: s.accent, emissive: s.accent, emissiveIntensity: 0.18, roughness: 0.55 }));
        awning.position.set(0, Math.min(s.height - 0.18, 0.78), d / 2 + 0.10); group.add(awning);
      }
      const sign = new THREE.Mesh(new THREE.BoxGeometry(Math.min(w * 0.62, 0.78), 0.085, 0.03), new THREE.MeshBasicMaterial({ color: s.accent }));
      sign.position.set(0, Math.min(s.height - 0.17, 0.75), d / 2 + 0.028);
      group.add(sign);
      if (building.kind === 'hospital') {
        const crossMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.045, 0.03), crossMat);
        const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.18, 0.03), crossMat);
        crossH.position.set(0, s.height + 0.18, d / 2 + 0.032); crossV.position.copy(crossH.position); group.add(crossH, crossV);
      }
      const label: Record<string, string> = { shop: 'SKLEP', school: 'SZKOŁA', hospital: 'SZPITAL', isolation: 'IZOLACJA' };
      if (label[building.kind]) this.addBuildingLabel(group, label[building.kind], s.height + 0.28, d / 2 + 0.08);
    } else {
      for (let i = 0; i < 4; i++) {
        const tree = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 8), new THREE.MeshStandardMaterial({ color: 0x245c37, roughness: 0.95 }));
        tree.position.set((i % 2 ? 0.25 : -0.25) * w, 0.32, (i < 2 ? -0.25 : 0.25) * d);
        group.add(tree);
      }
    }
    group.userData.cityBuilding = { width: w, depth: d };
    if (building.kind === 'park') this.addBuildingLabel(group, 'PARK', 0.34, 0);
    if (building.closed) {
      const marker = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: 0xffc857 }));
      marker.position.set(0, s.height + 0.18, d / 2 + 0.02);
      group.add(marker);
    }
    group.position.set(x, 0, z);
    return group;
  }

  /** Etykieta opisuje wyłącznie rodzaj obiektu zwróconego przez CityWorld. */
  private addBuildingLabel(group: THREE_NS.Group, text: string, y: number, z: number): void {
    if (!this.THREE || typeof document === 'undefined') return;
    const THREE = this.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = 'rgba(6, 16, 29, .78)';
    ctx.roundRect(3, 5, 250, 54, 10); ctx.fill();
    ctx.strokeStyle = '#9fd4ff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = '700 25px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 33);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.scale.set(0.95, 0.24, 1);
    sprite.position.set(0, y, z);
    group.add(sprite);
  }

  private addAnalysisLayer(): void {
    if (!this.THREE || !this.scene) return;
    const THREE = this.THREE;
    this.analysisMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.48, depthWrite: false, side: THREE.DoubleSide });
    this.analysisMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.analysisMaterial, ANALYSIS_COLS * ANALYSIS_ROWS);
    this.analysisMesh.rotation.x = -Math.PI / 2;
    this.analysisMesh.position.y = 0.035;
    this.analysisMesh.name = 'city-analysis-field';
    this.analysisMesh.count = 0;
    this.scene.add(this.analysisMesh);
  }

  private syncHumanoids(states: readonly HumanoidAgentState[]): void {
    if (!this.scene || !this.THREE || !this.crowd) return;
    const liveStates = states;
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
    this.syncFocusOcclusion(selected);
    this.lastDetailCount = this.detailVisuals.size;
    this.lastCrowdCount = Math.min(Math.max(0, liveStates.length - this.lastDetailCount), MAX_CROWD_HUMANOIDS);
  }

  /** Odsłania tylko rendererową bryłę zawierającą wybranego realnego agenta; po zamknięciu focusu przywraca materiały. */
  private syncFocusOcclusion(selected: HumanoidAgentState | null): void {
    for (const object of this.buildingMeshes) {
      const bounds = object.userData.cityBuilding as { width: number; depth: number } | undefined;
      if (!bounds) continue;
      const containsSelected = Boolean(selected
        && Math.abs(object.position.x - selected.worldX) < bounds.width * 0.52
        && Math.abs(object.position.z - selected.worldZ) < bounds.depth * 0.52);
      object.traverse((node) => {
        const mesh = node as THREE_NS.Mesh;
        if (!mesh.isMesh || !mesh.userData.focusOccluder) return;
        const material = mesh.material;
        if (Array.isArray(material)) return;
        const original = mesh.userData.focusMaterialState as { transparent: boolean; depthWrite: boolean; opacity: number } | undefined;
        if (!original) {
          mesh.userData.focusMaterialState = { transparent: material.transparent, depthWrite: material.depthWrite, opacity: material.opacity };
        }
        const base = (mesh.userData.focusMaterialState as { transparent: boolean; depthWrite: boolean; opacity: number });
        material.transparent = containsSelected || base.transparent;
        material.depthWrite = containsSelected ? false : base.depthWrite;
        material.opacity = containsSelected ? Math.min(base.opacity, 0.025) : base.opacity;
      });
    }
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
        // Gamma zwiększa czytelność rzeczywistego pola przy małej liczbie przypadków;
        // nie dodaje danych i nie zmienia porządku komórek.
        const [r, g, b] = heatColor(Math.pow(Math.max(0, value), 0.45));
        this.analysisMesh.setColorAt(index, new this.THREE.Color(r / 255, g / 255, b / 255));
      }
    }
    this.analysisMesh.count = field.cols * field.rows;
    this.analysisMesh.instanceMatrix.needsUpdate = true;
    if (this.analysisMesh.instanceColor) this.analysisMesh.instanceColor.needsUpdate = true;
  }

  private syncTransmissionMarkers(): void {
    if (!this.THREE || !this.scene) return;
    if (!this.showTransmissions) {
      for (const marker of this.transmissionMarkers.values()) this.scene.remove(marker.group);
      this.transmissionMarkers.clear();
      return;
    }
    const THREE = this.THREE;
    const agents = new Map(this.simulation.agents().map((agent) => [agent.id, agent]));
    const batch = this.eventStream.getEventsSince(this.eventCursor);
    this.eventCursor = batch.cursor;
    // Strumień zachowuje wszystkie prawdziwe zdarzenia; świat 3D eksponuje tylko najnowsze, aby nie zamienić sceny w pajęczynę markerów.
    const latestTransmissionEvent = [...batch.events].reverse().find((event) => event.type === 'infection.transmission');
    if (latestTransmissionEvent) {
      for (const marker of this.transmissionMarkers.values()) {
        this.scene.remove(marker.group);
        marker.group.traverse((node) => {
          const mesh = node as THREE_NS.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const material = mesh.material;
          if (material && !Array.isArray(material)) material.dispose();
        });
      }
      this.transmissionMarkers.clear();
    }
    for (const event of latestTransmissionEvent ? [latestTransmissionEvent] : []) {
      const fromId = Number(event.source?.id);
      const toId = Number(event.affectedEntities[0]?.id);
      if (!Number.isFinite(fromId) || !Number.isFinite(toId) || !event.location) continue;
      const key = event.id;
      this.latestTransmissionTarget = toId;
      this.latestTransmissionView = { from: fromId, to: toId, day: event.timestamp };
      if (this.transmissionMarkers.has(key)) continue;
      const from = agents.get(fromId);
      const to = agents.get(toId);
      if (!from || !to) continue;
      // Dyskretna trajektoria w przestrzeni: jedynie realny kontakt A→B z modelu, bez billboardu lub danych dekoracyjnych.
      const source = new THREE.Vector3((from.x - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE, 0.74, (from.y - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE);
      const target = new THREE.Vector3((to.x - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE, 0.74, (to.y - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE);
      const contact = new THREE.Vector3((event.location.x - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE, 0.055, (event.location.y - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE);
      const middle = source.clone().lerp(target, 0.5); middle.y += Math.max(0.14, source.distanceTo(target) * 0.26);
      const curve = new THREE.QuadraticBezierCurve3(source, middle, target);
      const material = new THREE.MeshBasicMaterial({ color: 0xff8b96, transparent: true, opacity: 0.82, depthWrite: false, depthTest: true });
      const group = new THREE.Group(); group.name = `transmission-${key}`;
      const arc = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.013, 5, false), material);
      const contactMaterial = new THREE.MeshBasicMaterial({ color: 0xffd3d8, transparent: true, opacity: 0.72, depthWrite: false, depthTest: true });
      const pulse = new THREE.Mesh(new THREE.RingGeometry(0.040, 0.072, 20), contactMaterial);
      pulse.rotation.x = -Math.PI / 2; pulse.position.copy(contact);
      const targetPulse = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.078, 20), contactMaterial.clone());
      targetPulse.rotation.x = -Math.PI / 2; targetPulse.position.copy(target); targetPulse.position.y = 0.065;
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.105, 5), material.clone());
      arrow.position.copy(target); arrow.position.y += 0.045;
      const direction = target.clone().sub(source).normalize();
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      group.add(arc, pulse, targetPulse, arrow); this.scene.add(group);
      this.transmissionMarkers.set(key, { group, born: this.timeSeconds, material });
    }
    for (const [key, marker] of this.transmissionMarkers) {
      const age = this.timeSeconds - marker.born;
      marker.group.traverse((node) => {
        const mesh = node as THREE_NS.Mesh;
        const material = mesh.material as THREE_NS.MeshBasicMaterial;
        if (material?.transparent) material.opacity = Math.max(0, 0.82 * (1 - age / TRANSMISSION_MARKER_LIFETIME_SECONDS));
      });
      if (age > TRANSMISSION_MARKER_LIFETIME_SECONDS) {
        this.scene.remove(marker.group);
        marker.group.traverse((node) => {
          const mesh = node as THREE_NS.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const material = mesh.material;
          if (material && !Array.isArray(material)) material.dispose();
        });
        this.transmissionMarkers.delete(key);
      }
    }
  }

  private syncFollowTarget(states: readonly HumanoidAgentState[]): void {
    if (!this.THREE) return;
    const trackedId = this.selectedId ?? this.cameraTrackId;
    if (trackedId === null) {
      this.followTarget = null;
      return;
    }
    const tracked = states.find((state) => state.id === trackedId);
    if (!tracked) {
      this.cameraTrackId = null;
      this.selectAgent(null);
      return;
    }
    if (!this.followTarget) this.followTarget = new this.THREE.Vector3();
    const focusHeight = this.cameraPreset === 'district' ? 0.2 : this.cameraPreset === 'street' ? 0.42 : 0.85;
    this.followTarget.set(tracked.worldX, focusHeight, tracked.worldZ);
  }

  private selectAgent(id: number | null, preserveCameraPreset = false): void {
    this.selectedId = id;
    if (id !== null) {
      if (!preserveCameraPreset) this.cameraPreset = 'agent';
      this.cameraTrackId = id;
    }
    this.callbacks.onAgentSelected?.(id);
  }
}
