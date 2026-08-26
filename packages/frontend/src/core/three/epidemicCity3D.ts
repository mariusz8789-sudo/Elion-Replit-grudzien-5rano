import type * as THREE_NS from 'three';
import type { SimParams } from '../types';
import { computeField, heatColor, type AnalysisMode } from '../simulation/analysis';
import { EpidemicCitySimulation, type EpidemicCityParams } from '../simulation/epidemicCity';
import { DEFAULT_HOSPITAL_CAPACITY, evaluateHospitalState, type HospitalStatus } from '../simulation/hospitalResource';
import type { WorldStateView } from '../simulation/worldEngineContract';
import { SimulationClock, type ClockSpeed } from '../simulationClock/clock';
import type { SimAgent, WorldObject } from '../simulation/types';
import { EventRegistry, EventStream, ingestTransmissions } from '../events';
import type { PostProcessingModules, PostProcessor, Sim3D, ThreeRenderMetrics } from './types';
import { isWorldAssetApproved, isWorldAssetPathApproved } from './assetGovernance';
import {
  HumanoidAgentVisual,
  InstancedHumanoidCrowd,
  mapSimAgentToHumanoid,
  type HumanoidAgentState,
} from './humanoidAgentVisual';

/** Ten sam współczynnik świata używany przez budynki, drogi, agentów i heatmapę. */
export const CITY_WORLD_SCALE = 0.018;
const CITY_VELOCITY_SCALE_FACTOR = 0.10;
/** High-fidelity City View: detaliczne rigi są wyjątkami, a nie dominantą kadru miasta. */
const MAX_DETAILED_HUMANOIDS = 4;
// InstancedMesh utrzymuje stałą liczbę draw calls; P1 umożliwia uczciwy benchmark do 1000 agentów.
const MAX_CROWD_HUMANOIDS = 1024;
// City first: zwarty, izometryczny kadr dzielnicy zamiast odległego widoku planszy.
const CITY_CAMERA_POSITION = { x: 7.7, y: 13.2, z: 8.2 };
const CITY_CAMERA_TARGET = { x: 0, y: 0.32, z: -0.24 };
/** Czas prezentacji odczytanego eventu — nie wpływa na czas ani prawdopodobieństwo modelu. */
// Krótka obserwacja rzeczywistego kontaktu: po pauzie zegara pozostaje do inspekcji, ale w ruchu nie zamienia świata w dashboard.
const TRANSMISSION_MARKER_LIFETIME_SECONDS = 1.1;
const ANALYSIS_COLS = 36;
const ANALYSIS_ROWS = 24;

/** Presety obserwacji są cechą kamery; nie zmieniają modeli, agentów ani ich zachowania. */
export type CityCameraPreset = 'city' | 'district' | 'street' | 'agent';

export interface City3DCallbacks {
  onAgentSelected?: (agentId: number | null) => void;
  onWorldSelected?: (selection: CityWorldSelection | null) => void;
}

/** Read-only selection returned from genuine WorldState or semantic CityWorld objects. */
export interface CityWorldSelection {
  kind: 'location' | 'hotspot' | 'cluster' | 'hospital' | 'transmission';
  label: string;
  detail: string;
  x: number;
  y: number;
}

/** Zatwierdzone materiały renderera; nie są stanem świata ani danymi naukowymi. */
interface CityPbrMaterials {
  asphalt: THREE_NS.MeshStandardMaterial;
  concrete: THREE_NS.MeshStandardMaterial;
  ground: THREE_NS.MeshStandardMaterial;
  brick: THREE_NS.MeshStandardMaterial;
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
  /** Punkt kamery ulicznej pochodzi z istniejącej siatki ulic CityWorld; to cecha widoku, nie ruch ani cel agenta. */
  private streetLayoutFocus: { x: number; y: number } | null = null;
  private cameraTrackId: number | null = null;
  private detailVisuals = new Map<number, HumanoidAgentVisual>();
  private crowd: InstancedHumanoidCrowd | null = null;
  private analysisMesh: THREE_NS.InstancedMesh | null = null;
  private analysisMaterial: THREE_NS.MeshBasicMaterial | null = null;
  private cityMaterials: CityPbrMaterials | null = null;
  private semanticBuildingSlots: Array<{ group: THREE_NS.Group; building: WorldObject }> = [];
  private approvedFacadeTemplate: THREE_NS.Object3D | null = null;
  private approvedLampTemplate: THREE_NS.Object3D | null = null;
  private approvedAssetRoots: THREE_NS.Object3D[] = [];
  private worldState: WorldStateView | null = null;
  private worldOverlayGroup: THREE_NS.Group | null = null;
  private worldInteractive: THREE_NS.Object3D[] = [];
  private selectedWorld: CityWorldSelection | null = null;
  private worldOverlayFingerprint = '';
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

  /** Konsumuje gotową, niemutowalną projekcję World Engine; nie uruchamia obliczeń naukowych. */
  setWorldState(worldState: WorldStateView): void {
    this.worldState = worldState;
  }

  getSelectedWorld(): CityWorldSelection | null {
    return this.selectedWorld;
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
    this.streetLayoutFocus = null;
    this.selectAgent(null);
    this.selectWorld(null);
  }

  getCameraPreset(): CityCameraPreset {
    return this.cameraPreset;
  }

  /** Jeden mechanizm kamery dla świata, dzielnicy, ulicy i modelowego agenta. */
  setCameraPreset(preset: CityCameraPreset): number | null {
    this.cameraPreset = preset;
    if (preset === 'city') {
      this.cameraTrackId = null;
      this.streetLayoutFocus = null;
      this.resetCityCameraPending = true;
      this.selectAgent(null);
      this.selectWorld(null);
      return null;
    }
    if (preset === 'street') {
      const vertical = this.simulation.streets.v[Math.floor(this.simulation.streets.v.length / 2)] ?? this.simulation.worldWidth / 2;
      const horizontal = this.simulation.streets.h[Math.floor(this.simulation.streets.h.length / 2)] ?? this.simulation.worldHeight / 2;
      const agents = this.simulation.agents();
      const candidate = agents.find((agent) => agent.state === 'I') ?? agents.find((agent) => agent.state === 'E') ?? agents[0] ?? null;
      this.streetLayoutFocus = { x: vertical, y: horizontal };
      // Zachowujemy publiczny kontrakt presetu: identyfikator odnosi się wyłącznie do istniejącego agenta modelu.
      // Kadr korzysta jednak z bezpiecznego punktu istniejącej siatki ulic, więc nie wpada w geometrię wokół agenta.
      this.cameraTrackId = candidate?.id ?? null;
      this.selectAgent(null, true);
      return candidate?.id ?? null;
    }
    this.streetLayoutFocus = null;
    const agents = this.simulation.agents();
    const moving = agents.find((agent) => Math.hypot(agent.vx, agent.vy) > 1e-3);
    const infected = agents.find((agent) => agent.state === 'I') ?? agents.find((agent) => agent.state === 'E');
    const candidate = preset === 'agent'
      ? infected ?? moving ?? agents[0] ?? null
      : moving ?? infected ?? agents[0] ?? null;
    this.cameraTrackId = candidate?.id ?? null;
    this.selectAgent(preset === 'agent' ? candidate?.id ?? null : null);
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
    this.selectWorld(null);
  }

  init(THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera, w: number, h: number): void {
    this.THREE = THREE;
    this.scene = scene;
    this.camera = camera;
    this.viewport = { w, h };
    this.raycaster = new THREE.Raycaster();
    scene.background = new THREE.Color(0x0d1b2a);
    scene.fog = new THREE.Fog(0x0d1b2a, 18, 42);
    camera.fov = 44;
    camera.updateProjectionMatrix();
    camera.position.set(CITY_CAMERA_POSITION.x, CITY_CAMERA_POSITION.y, CITY_CAMERA_POSITION.z);
    camera.lookAt(CITY_CAMERA_TARGET.x, CITY_CAMERA_TARGET.y, CITY_CAMERA_TARGET.z);

    this.createApprovedCityMaterials();
    this.addLightsAndGround();
    this.addRoadsAndBuildings();
    this.addStreetAtmosphere();
    void this.loadApprovedCityAssets();
    this.addAnalysisLayer();
    this.worldOverlayGroup = new THREE.Group();
    this.worldOverlayGroup.name = 'read-only-worldstate-overlays';
    scene.add(this.worldOverlayGroup);
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
    renderer.toneMappingExposure = 1.06;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    void this.loadApprovedHdri(renderer);
    const composer = new modules.EffectComposer(renderer);
    composer.addPass(new modules.RenderPass(scene, camera));
    const bloom = new modules.UnrealBloomPass(new THREE.Vector2(w, h), 0.20, 0.46, 0.90);
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
    this.syncWorldStateVisuals();
    this.animateWorldMarkers();
    this.syncApprovedAssetLod();
    this.syncFollowTarget(states);
    if (this.resetCityCameraPending) {
      camera.position.set(CITY_CAMERA_POSITION.x, CITY_CAMERA_POSITION.y, CITY_CAMERA_POSITION.z);
      camera.lookAt(CITY_CAMERA_TARGET.x, CITY_CAMERA_TARGET.y, CITY_CAMERA_TARGET.z);
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
    if (this.selectedWorld) return 4.6;
    if (this.cameraPreset === 'district') return 7.2;
    // Ten sam rig i OrbitControls: STREET zachowuje wysokość obserwatora, ale
    // zostawia pełny rytm ulicy w kadrze zamiast zatrzymywać kamerę przy latarni.
    if (this.cameraPreset === 'street') return 7.8;
    return 1.85;
  }

  getOrbitCameraDirection(): THREE_NS.Vector3 | null {
    if (!this.THREE || !this.followTarget || this.cameraPreset !== 'street') return null;
    // Niski, stabilny kierunek uliczny: nadal jedna kamera OrbitControls, bez fikcyjnego ruchu lub danych agenta.
    return new this.THREE.Vector3(1.35, 0.62, 2.6).normalize();
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
    const worldHits = this.raycaster.intersectObjects([...this.worldInteractive, ...this.buildingMeshes], true);
    if (worldHits.length) {
      let node: THREE_NS.Object3D | null = worldHits[0].object;
      while (node && !node.userData.worldSelection) node = node.parent;
      if (node?.userData.worldSelection) {
        this.selectWorld(node.userData.worldSelection as CityWorldSelection);
        return;
      }
    }
    this.selectAgent(null);
    this.selectWorld(null);
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
    if (this.worldOverlayGroup) {
      for (const marker of this.worldOverlayGroup.children) {
        marker.traverse((node) => {
          const mesh = node as THREE_NS.Mesh;
          mesh.geometry?.dispose();
          const material = mesh.material;
          if (material && !Array.isArray(material)) material.dispose();
        });
      }
      this.scene?.remove(this.worldOverlayGroup);
      this.worldOverlayGroup = null;
      this.worldInteractive = [];
    }
    for (const object of this.buildingMeshes) {
      object.traverse((node) => {
        const mesh = node as THREE_NS.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material;
        if (material && !Array.isArray(material)) material.dispose();
      });
    }
    this.buildingMeshes = [];
    for (const asset of this.approvedAssetRoots) this.scene?.remove(asset);
    this.approvedAssetRoots = [];
    this.semanticBuildingSlots = [];
  }

  /** Materiały są ładowane tylko po przejściu istniejącej bramki Asset Governance. */
  private createApprovedCityMaterials(): void {
    if (!this.THREE) return;
    const THREE = this.THREE;
    this.cityMaterials = {
      asphalt: new THREE.MeshStandardMaterial({ color: 0x2b3034, roughness: 0.82, metalness: 0.03 }),
      concrete: new THREE.MeshStandardMaterial({ color: 0x87919a, roughness: 0.88, metalness: 0.02 }),
      ground: new THREE.MeshStandardMaterial({ color: 0x42534b, roughness: 0.96, metalness: 0.01 }),
      brick: new THREE.MeshStandardMaterial({ color: 0x835a4b, roughness: 0.80, metalness: 0.01 }),
    };
    const loader = new THREE.TextureLoader();
    this.loadGovernedTexture(loader, '/assets/genesis-governed-pbr/asphalt-track/diffuse.jpg', this.cityMaterials.asphalt, 'map', true, 5, 2);
    this.loadGovernedTexture(loader, '/assets/genesis-governed-pbr/asphalt-track/normal.jpg', this.cityMaterials.asphalt, 'normalMap', false, 5, 2);
    this.loadGovernedTexture(loader, '/assets/genesis-governed-pbr/asphalt-track/arm.jpg', this.cityMaterials.asphalt, 'roughnessMap', false, 5, 2);
    this.loadGovernedTexture(loader, '/assets/genesis-governed-pbr/asphalt-track/arm.jpg', this.cityMaterials.asphalt, 'aoMap', false, 5, 2);
    this.loadGovernedTexture(loader, '/assets/genesis-governed-pbr/concrete-floor-01/diffuse.jpg', this.cityMaterials.concrete, 'map', true, 4, 2);
    this.loadGovernedTexture(loader, '/assets/genesis-governed-pbr/concrete-floor-01/normal.jpg', this.cityMaterials.concrete, 'normalMap', false, 4, 2);
    this.loadGovernedTexture(loader, '/assets/genesis-governed-pbr/concrete-floor-01/arm.jpg', this.cityMaterials.concrete, 'roughnessMap', false, 4, 2);
    this.loadGovernedTexture(loader, '/assets/genesis-governed-pbr/brick-wall-10/diffuse.jpg', this.cityMaterials.brick, 'map', true, 3, 2);
    this.loadGovernedTexture(loader, '/assets/genesis-governed-pbr/brick-wall-10/normal.jpg', this.cityMaterials.brick, 'normalMap', false, 3, 2);
    this.loadGovernedTexture(loader, '/assets/genesis-governed-pbr/brick-wall-10/arm.jpg', this.cityMaterials.brick, 'roughnessMap', false, 3, 2);
    this.loadGovernedTexture(loader, '/assets/genesis-governed-pbr/concrete-floor-01/diffuse.jpg', this.cityMaterials.ground, 'map', true, 30, 22);
    this.loadGovernedTexture(loader, '/assets/genesis-governed-pbr/concrete-floor-01/normal.jpg', this.cityMaterials.ground, 'normalMap', false, 30, 22);
  }

  private loadGovernedTexture(
    loader: THREE_NS.TextureLoader,
    path: string,
    material: THREE_NS.MeshStandardMaterial,
    slot: 'map' | 'normalMap' | 'roughnessMap' | 'aoMap',
    srgb: boolean,
    repeatX: number,
    repeatY: number,
  ): void {
    if (!this.THREE || !isWorldAssetPathApproved(path)) return;
    const THREE = this.THREE;
    loader.load(path, (texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
      material[slot] = texture as never;
      material.needsUpdate = true;
    }, undefined, () => undefined);
  }

  private async loadApprovedHdri(renderer: THREE_NS.WebGLRenderer): Promise<void> {
    const path = '/assets/genesis-hf/hdr/braustuble_alley_1k.hdr';
    if (!this.THREE || !this.scene || !isWorldAssetApproved(path)) return;
    try {
      const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js');
      const THREE = this.THREE;
      const pmrem = new THREE.PMREMGenerator(renderer);
      new RGBELoader().load(path, (texture) => {
        if (!this.scene || !this.THREE) { texture.dispose(); pmrem.dispose(); return; }
        const environment = pmrem.fromEquirectangular(texture).texture;
        this.scene.environment = environment;
        this.scene.environmentIntensity = 0.38;
        // HDRI pozostaje źródłem IBL dla PBR, lecz nie przejmuje horyzontu brązowym kadrem alei.
        this.scene.background = new this.THREE.Color(0x101923);
        this.scene.fog = new this.THREE.FogExp2(0x101923, 0.022);
        texture.dispose();
        pmrem.dispose();
      }, undefined, () => pmrem.dispose());
    } catch {
      // Zatwierdzone materiały oraz światło kierunkowe pozostają pełnym fallbackiem.
    }
  }

  /** Ładuje tylko dwie zatwierdzone biblioteki city assetów; brak assetu nie zmienia danych modelu. */
  private async loadApprovedCityAssets(): Promise<void> {
    if (!this.THREE || !this.scene) return;
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      const facadePath = '/assets/genesis-hf-v2/models/modular_urban_apartments_facade/modular_urban_apartments_facade.gltf';
      const lampPath = '/assets/genesis-hf-v2/models/street_lamp_01/street_lamp_01.gltf';
      if (isWorldAssetApproved(facadePath)) {
        const facade = await loader.loadAsync(facadePath);
        this.approvedFacadeTemplate = facade.scene;
        this.attachApprovedFacades();
      }
      if (isWorldAssetApproved(lampPath)) {
        const lamp = await loader.loadAsync(lampPath);
        this.approvedLampTemplate = lamp.scene;
        this.attachApprovedLamps();
      }
    } catch {
      // Brak pliku lub błąd WebGL nie zastępuje assetu niezweryfikowanym fallbackiem.
    }
  }

  private attachApprovedFacades(): void {
    if (!this.THREE || !this.approvedFacadeTemplate || !this.scene) return;
    const THREE = this.THREE;
    // Facade asset has 118k polygons: one representative semantic location keeps the approved material language visible without turning CityWorld objects into an asset stress test.
    for (const { group, building } of this.semanticBuildingSlots
      .filter(({ building }) => building.kind === 'home' || building.kind === 'shop' || building.kind === 'school')
      .slice(0, 1)) {
      const facade = this.approvedFacadeTemplate.clone(true);
      const bounds = new THREE.Box3().setFromObject(facade);
      const size = bounds.getSize(new THREE.Vector3());
      if (size.x <= 0 || size.y <= 0 || size.z <= 0) continue;
      const width = Math.max(0.18, building.w * CITY_WORLD_SCALE);
      const depth = Math.max(0.18, building.h * CITY_WORLD_SCALE);
      const targetHeight = building.kind === 'school' ? 1.5 : building.kind === 'shop' ? 1.24 : 1.06;
      const scale = Math.min(width / size.x, depth / size.z, targetHeight / size.y);
      facade.scale.setScalar(scale * 0.92);
      const adjusted = new THREE.Box3().setFromObject(facade);
      facade.position.set(-adjusted.getCenter(new THREE.Vector3()).x, -adjusted.min.y, -adjusted.getCenter(new THREE.Vector3()).z);
      facade.userData.visualOnlyFacade = true;
      facade.userData.assetLod = 'street-only';
      facade.traverse((node) => { const mesh = node as THREE_NS.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
      group.add(facade);
      this.approvedAssetRoots.push(facade);
    }
  }

  private attachApprovedLamps(): void {
    if (!this.THREE || !this.approvedLampTemplate || !this.scene) return;
    const lampSlots = this.simulation.streets.h.flatMap((y, row) => this.simulation.streets.v.map((x, col) => ({ x, y, row, col }))).slice(0, 1);
    for (const slot of lampSlots) {
      const lamp = this.approvedLampTemplate.clone(true);
      lamp.scale.setScalar(0.09);
      lamp.position.set((slot.x - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE + 0.22, 0.01, (slot.y - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE + 0.22);
      lamp.rotation.y = ((slot.row + slot.col) % 2) * Math.PI;
      lamp.userData.visualOnlyStreetFurniture = true;
      lamp.userData.assetLod = 'always';
      lamp.traverse((node) => { const mesh = node as THREE_NS.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
      this.scene.add(lamp);
      this.approvedAssetRoots.push(lamp);
    }
  }

  /** City and district cameras retain governed PBR material density; the high-poly modular facade enters only when its street-level detail is inspectable. */
  private syncApprovedAssetLod(): void {
    const showStreetFacade = this.cameraPreset === 'street' || this.cameraPreset === 'agent' || this.selectedWorld?.kind === 'location';
    for (const asset of this.approvedAssetRoots) {
      if (asset.userData.assetLod === 'street-only') asset.visible = showStreetFacade;
    }
    for (const object of this.buildingMeshes) {
      if (object.userData.streetHidden) object.visible = this.cameraPreset !== 'street';
    }
  }

  private addLightsAndGround(): void {
    if (!this.THREE || !this.scene) return;
    const THREE = this.THREE;
    this.scene.add(new THREE.HemisphereLight(0x9ab8d4, 0x17251e, 0.92));
    this.scene.add(new THREE.AmbientLight(0x365374, 0.16));
    const key = new THREE.DirectionalLight(0xffcc91, 1.88);
    key.position.set(9, 16, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -13;
    key.shadow.camera.right = 13;
    key.shadow.camera.top = 13;
    key.shadow.camera.bottom = -13;
    key.shadow.bias = -0.00035;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x77baff, 0.86);
    rim.position.set(-9, 9, -8);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0x76d7bd, 0.22);
    fill.position.set(-2, 4, 12);
    this.scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.simulation.worldWidth * CITY_WORLD_SCALE + 3.5, this.simulation.worldHeight * CITY_WORLD_SCALE + 3.5),
      this.cityMaterials?.ground ?? new THREE.MeshStandardMaterial({ color: 0x284b3e, roughness: 0.98, metalness: 0.01 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.012;
    ground.receiveShadow = true;
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
    const roadMat = (this.cityMaterials?.concrete ?? new THREE.MeshStandardMaterial({ color: 0xe1e8ec, roughness: 0.68, metalness: 0.04 })).clone();
    roadMat.transparent = true;
    roadMat.opacity = 0.82;
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
      const treeCount = 12;
      const trees = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.12, 0), new THREE.MeshStandardMaterial({ color: 0x2d7550, roughness: 0.96 }), treeCount);
      const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.026, 0.25, 6), new THREE.MeshStandardMaterial({ color: 0x664533, roughness: 1 }), treeCount);
      for (let index = 0; index < treeCount; index++) {
        const angle = index * 2.39996 + 0.4;
        const radius = 0.38 + (index % 3) * 0.19;
        const x = px + Math.cos(angle) * radius * 1.45;
        const z = pz + Math.sin(angle) * radius * 0.90;
        const size = 0.84 + (index % 4) * 0.08;
        position.set(x, 0.30 * size, z); scale.set(size, size, size); matrix.compose(position, rotation, scale); trees.setMatrixAt(index, matrix);
        position.set(x, 0.125 * size, z); matrix.compose(position, rotation, scale); trunks.setMatrixAt(index, matrix);
        scale.set(1, 1, 1);
      }
      trees.instanceMatrix.needsUpdate = true; trunks.instanceMatrix.needsUpdate = true;
      trees.castShadow = true; trees.receiveShadow = true; trunks.castShadow = true; trunks.receiveShadow = true;
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
    const roadMat = this.cityMaterials?.asphalt ?? new THREE.MeshStandardMaterial({ color: 0x263545, roughness: 0.92, metalness: 0.03 });
    const sidewalkMat = this.cityMaterials?.concrete ?? new THREE.MeshStandardMaterial({ color: 0x9aaabd, roughness: 0.96, metalness: 0.01 });
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xc7d0d8, roughness: 0.82, metalness: 0.05 });
    const markingMat = new THREE.MeshBasicMaterial({ color: 0xeef4f7, transparent: true, opacity: 0.84 });
    const roadWidth = 0.38;
    const sidewalkWidth = 0.13;
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
      const northCurb = new THREE.Mesh(new THREE.BoxGeometry(worldW, 0.038, 0.028), curbMat.clone());
      northCurb.position.set(0, 0.018, z - roadWidth / 2);
      const southCurb = northCurb.clone(); southCurb.position.z = z + roadWidth / 2;
      [road, northWalk, southWalk, northCurb, southCurb].forEach((mesh) => { mesh.receiveShadow = true; mesh.castShadow = true; });
      this.scene.add(road, northWalk, southWalk, northCurb, southCurb);
      this.buildingMeshes.push(road, northWalk, southWalk, northCurb, southCurb);
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
      const eastCurb = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.038, worldH), curbMat.clone());
      eastCurb.position.set(px - roadWidth / 2, 0.018, 0);
      const westCurb = eastCurb.clone(); westCurb.position.x = px + roadWidth / 2;
      [road, eastWalk, westWalk, eastCurb, westCurb].forEach((mesh) => { mesh.receiveShadow = true; mesh.castShadow = true; });
      this.scene.add(road, eastWalk, westWalk, eastCurb, westCurb);
      this.buildingMeshes.push(road, eastWalk, westWalk, eastCurb, westCurb);
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
    this.addDistrictInfill();
    this.addUrbanCadence();
    // Optional call keeps a live HMR-retained renderer from crashing while the
    // newly defined visual-only method reaches a freshly constructed City3D instance.
    this.addPerimeterDistrict?.();
  }

  /**
   * Wysoka gęstość to rendererowy kontekst między prawdziwymi obiektami CityWorld.
   * Te bryły nie mają ID lokacji, nie są celami agentów i nie uczestniczą w kontakcie.
   */
  private addDistrictInfill(): void {
    if (!this.THREE || !this.scene) return;
    const realFootprints = this.simulation.objects().map((building) => ({
      x: (building.x + building.w / 2 - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE,
      z: (building.y + building.h / 2 - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE,
      w: building.w * CITY_WORLD_SCALE,
      d: building.h * CITY_WORLD_SCALE,
    }));
    const zones = [
      { x: -1.68, z: -1.66, w: 2.05, d: 1.30, cols: 3, rows: 2 },
      { x: 1.95, z: -1.66, w: 1.64, d: 1.30, cols: 2, rows: 2 },
      { x: -1.68, z: 0.96, w: 2.05, d: 0.82, cols: 3, rows: 1 },
      { x: 1.95, z: 0.96, w: 1.64, d: 0.82, cols: 2, rows: 1 },
      { x: -6.88, z: -1.68, w: 1.10, d: 1.18, cols: 1, rows: 2 },
      { x: -4.80, z: 1.64, w: 1.26, d: 1.05, cols: 2, rows: 2 },
      { x: 4.65, z: -1.45, w: 1.36, d: 1.18, cols: 2, rows: 2 },
    ];
    let serial = 0;
    for (const zone of zones) {
      const cellW = zone.w / zone.cols;
      const cellD = zone.d / zone.rows;
      for (let row = 0; row < zone.rows; row++) for (let col = 0; col < zone.cols; col++) {
        const x = zone.x - zone.w / 2 + cellW * (col + 0.5);
        const z = zone.z - zone.d / 2 + cellD * (row + 0.5);
        const w = cellW * (0.70 + ((row + col) % 3) * 0.05);
        const d = cellD * (0.70 + ((row * 2 + col) % 2) * 0.08);
        const overlapsReal = realFootprints.some((real) => Math.abs(real.x - x) < (real.w + w) * 0.54 && Math.abs(real.z - z) < (real.d + d) * 0.54);
        if (overlapsReal) continue;
        const building = this.createContextBuilding(x, z, w, d, serial++);
        this.scene.add(building);
        this.buildingMeshes.push(building);
      }
    }
  }

  /** Deterministyczna, wizualna zabudowa uzupełniająca; nie jest obiektem modelu ani World Engine. */
  private createContextBuilding(x: number, z: number, w: number, d: number, serial: number): THREE_NS.Group {
    const THREE = this.THREE!;
    const group = new THREE.Group();
    const palettes = [
      { wall: 0x657689, roof: 0x293746, glass: 0x9cc8e5 },
      { wall: 0x8a7966, roof: 0x403d39, glass: 0xc4b791 },
      { wall: 0x657970, roof: 0x2e4741, glass: 0x8ebfaf },
      { wall: 0x786d79, roof: 0x403644, glass: 0xb7a8c3 },
    ];
    const palette = palettes[serial % palettes.length];
    const height = 0.78 + (serial % 5) * 0.18;
    const facadeBase = serial % 3 === 0 ? this.cityMaterials?.brick : this.cityMaterials?.concrete;
    const facade = facadeBase?.clone() ?? new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.05 });
    facade.color.multiply(new THREE.Color(palette.wall));
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), facade);
    body.position.y = height / 2;
    body.castShadow = true; body.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 1.07, 0.11, d * 1.09), new THREE.MeshStandardMaterial({ color: palette.roof, roughness: 0.72, metalness: 0.18 }));
    roof.position.y = height + 0.05; roof.castShadow = true; roof.receiveShadow = true;
    group.add(body, roof);
    const glass = new THREE.MeshStandardMaterial({ color: palette.glass, emissive: palette.glass, emissiveIntensity: 0.34, roughness: 0.24, metalness: 0.18 });
    const columns = Math.max(1, Math.floor(w / 0.22));
    const rows = Math.max(2, Math.floor(height / 0.20));
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const pane = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.11, w / (columns + 1.5)), 0.085, 0.018), glass);
      pane.position.set(-w / 2 + (col + 1) * w / (columns + 1), 0.19 + row * Math.min(0.20, (height - 0.24) / rows), d / 2 + 0.012);
      group.add(pane);
    }
    if (serial % 3 === 0) {
      const roofUnit = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.22, w * 0.25), 0.10, Math.min(0.18, d * 0.28)), new THREE.MeshStandardMaterial({ color: 0x65717d, roughness: 0.72, metalness: 0.22 }));
      roofUnit.position.set(w * 0.18, height + 0.15, -d * 0.18); roofUnit.castShadow = true; group.add(roofUnit);
    }
    // Ciemniejszy parter i cofnięty gzyms rozbijają sylwetę pudełka, bez dodawania obiektu modelu.
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w * 1.015, Math.min(0.18, height * 0.22), d * 1.015), new THREE.MeshStandardMaterial({ color: 0x25313b, roughness: 0.52, metalness: 0.12 }));
    plinth.position.y = Math.min(0.18, height * 0.22) / 2; group.add(plinth);
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(w * 1.10, 0.035, d * 1.12), new THREE.MeshStandardMaterial({ color: 0xced4d4, roughness: 0.48, metalness: 0.18 }));
    cornice.position.y = height * 0.72; group.add(cornice);
    group.userData.visualOnlyContext = true;
    group.position.set(x, 0, z);
    return group;
  }

  /**
   * Tło miasta jest deterministyczną scenografią widoku City: nie posiada ID,
   * nie jest lokacją, nie jest celem ruchu ani kontaktem. Buduje głębię 3×3
   * dzielnicy bez ingerencji w CityWorld.
   */
  private addPerimeterDistrict(): void {
    if (!this.THREE || !this.scene) return;
    const THREE = this.THREE;
    const masses = [
      [-5.65, -3.70, 1.10, 0.72, 2.45], [-4.35, -3.55, 0.86, 0.75, 1.85], [-2.85, -3.78, 1.26, 0.70, 2.15],
      [-0.90, -3.68, 1.05, 0.82, 2.90], [1.00, -3.72, 1.20, 0.70, 2.25], [3.00, -3.62, 0.92, 0.78, 2.72], [4.65, -3.72, 1.18, 0.74, 2.12],
      [-5.90, 3.50, 1.08, 0.76, 2.20], [-4.18, 3.64, 1.30, 0.70, 2.62], [-2.08, 3.55, 0.90, 0.80, 1.98], [0.10, 3.70, 1.18, 0.72, 2.46], [2.15, 3.58, 1.00, 0.82, 2.86], [4.22, 3.66, 1.24, 0.72, 2.16],
    ] as const;
    const cool = this.cityMaterials?.concrete.clone() ?? new THREE.MeshStandardMaterial({ color: 0x667688, roughness: 0.78 });
    const warm = this.cityMaterials?.brick.clone() ?? new THREE.MeshStandardMaterial({ color: 0x80695a, roughness: 0.78 });
    cool.color.multiply(new THREE.Color(0x596d7c));
    warm.color.multiply(new THREE.Color(0x7c6658));
    const coolMasses = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cool, Math.ceil(masses.length / 2));
    const warmMasses = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), warm, Math.floor(masses.length / 2));
    const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x25313b, roughness: 0.58, metalness: 0.28 }), masses.length);
    const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.045, 0.018), new THREE.MeshStandardMaterial({ color: 0xbcdaf0, emissive: 0x4c81a5, emissiveIntensity: 0.48, roughness: 0.24, metalness: 0.16 }), masses.length * 12);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    let coolIndex = 0; let warmIndex = 0; let windowIndex = 0;
    masses.forEach(([x, z, w, d, h], index) => {
      position.set(x, h / 2, z); scale.set(w, h, d); matrix.compose(position, rotation, scale);
      (index % 2 === 0 ? coolMasses : warmMasses).setMatrixAt(index % 2 === 0 ? coolIndex++ : warmIndex++, matrix);
      position.set(x, h + 0.055, z); scale.set(w * 1.08, 0.11, d * 1.08); matrix.compose(position, rotation, scale); caps.setMatrixAt(index, matrix);
      for (let level = 0; level < 3; level++) for (let col = -1; col <= 2; col++) {
        position.set(x - w * 0.25 + col * w * 0.17, 0.58 + level * 0.48, z + d / 2 + 0.014);
        scale.set(1, 1, 1); matrix.compose(position, rotation, scale); windows.setMatrixAt(windowIndex++, matrix);
      }
    });
    coolMasses.count = coolIndex; warmMasses.count = warmIndex; windows.count = windowIndex;
    coolMasses.instanceMatrix.needsUpdate = true; warmMasses.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true; windows.instanceMatrix.needsUpdate = true;
    const context = new THREE.Group(); context.name = 'visual-only-perimeter-district'; context.userData.visualOnlyContext = true; context.userData.streetHidden = true;
    context.add(coolMasses, warmMasses, caps, windows); context.traverse((node) => { const mesh = node as THREE_NS.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
    this.scene.add(context); this.buildingMeshes.push(context);
  }

  /**
   * Deterministyczny rytm dachów i chodników opiera się wyłącznie na istniejącej
   * geometrii semantycznych lokacji i siatce ulic. Nie tworzy ruchu, zasobów,
   * infrastruktury krytycznej ani danych środowiskowych — jest VISUAL_ONLY.
   */
  private addUrbanCadence(): void {
    if (!this.THREE || !this.scene) return;
    const THREE = this.THREE;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    const rotation = new THREE.Quaternion();
    const roofSlots = this.semanticBuildingSlots.filter(({ building }) => building.kind !== 'park');
    const roofUnits = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.22, 0.10, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x65717d, roughness: 0.66, metalness: 0.28 }),
      roofSlots.length,
    );
    const skylights = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.18, 0.032, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x789cb4, emissive: 0x24495e, emissiveIntensity: 0.22, roughness: 0.22, metalness: 0.35 }),
      Math.ceil(roofSlots.length / 2),
    );
    let roofUnitIndex = 0;
    let skylightIndex = 0;
    for (const { group, building } of roofSlots) {
      const dimensions = group.userData.cityBuilding as { width: number; depth: number; height: number };
      const offset = ((Math.abs(Math.round(building.x * 3 + building.y * 5)) % 3) - 1) * 0.12;
      position.set(group.position.x + offset, dimensions.height + 0.17, group.position.z - dimensions.depth * 0.16);
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), building.kind === 'school' ? Math.PI / 2 : 0);
      matrix.compose(position, rotation, scale); roofUnits.setMatrixAt(roofUnitIndex++, matrix);
      if ((building.x + building.y) % 2 === 0) {
        position.set(group.position.x - offset, dimensions.height + 0.145, group.position.z + dimensions.depth * 0.15);
        rotation.identity(); matrix.compose(position, rotation, scale); skylights.setMatrixAt(skylightIndex++, matrix);
      }
    }
    roofUnits.count = roofUnitIndex; skylights.count = skylightIndex;
    roofUnits.instanceMatrix.needsUpdate = true; skylights.instanceMatrix.needsUpdate = true;
    roofUnits.name = 'visual-only-roof-mechanical-cadence'; skylights.name = 'visual-only-roof-skylight-cadence';

    // Minimalne donice przy skrzyżowaniach robią ulice czytelniejsze w widoku
    // CITY/DISTRICT, ale nie są roślinnością ani ruchem modelowanym przez świat.
    const planterSlots = this.simulation.streets.v.flatMap((x, col) => this.simulation.streets.h.flatMap((y, row) => {
      if ((row + col) % 2 !== 0) return [];
      const px = (x - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE;
      const pz = (y - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE;
      return [{ x: px + 0.48, z: pz + 0.48 }, { x: px - 0.48, z: pz - 0.48 }];
    }));
    const planters = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.18, 0.12, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x87929b, roughness: 0.86, metalness: 0.08 }),
      planterSlots.length,
    );
    const shrubs = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.13, 0),
      new THREE.MeshStandardMaterial({ color: 0x315f47, roughness: 0.94, metalness: 0.01 }),
      planterSlots.length,
    );
    planterSlots.forEach((slot, index) => {
      position.set(slot.x, 0.06, slot.z); rotation.identity(); scale.set(1, 1, 1); matrix.compose(position, rotation, scale); planters.setMatrixAt(index, matrix);
      const size = 0.82 + (index % 3) * 0.11;
      position.set(slot.x, 0.19 * size, slot.z); scale.set(size, size, size); matrix.compose(position, rotation, scale); shrubs.setMatrixAt(index, matrix);
    });
    planters.instanceMatrix.needsUpdate = true; shrubs.instanceMatrix.needsUpdate = true;
    planters.name = 'visual-only-sidewalk-planters'; shrubs.name = 'visual-only-sidewalk-shrubs';
    const context = new THREE.Group();
    context.name = 'visual-only-urban-cadence';
    context.userData.visualOnlyContext = true;
    context.add(roofUnits, skylights, planters, shrubs);
    context.traverse((node) => {
      const mesh = node as THREE_NS.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    this.scene.add(context);
    this.buildingMeshes.push(context);
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
    const facadeBase = building.kind === 'home' ? this.cityMaterials?.brick : this.cityMaterials?.concrete;
    const facadeMaterial = facadeBase ? facadeBase.clone() : new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.76, metalness: 0.04 });
    facadeMaterial.color.multiply(new THREE.Color(s.color));
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, s.height, d), facadeMaterial);
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
    group.userData.cityBuilding = { width: w, depth: d, height: s.height };
    group.userData.worldSelection = {
      kind: 'location',
      label: building.kind.toUpperCase(),
      detail: building.closed ? 'Closed — state supplied by the semantic CityWorld location.' : 'Semantic CityWorld location.',
      x: building.x + building.w / 2,
      y: building.y + building.h / 2,
    } satisfies CityWorldSelection;
    if (building.kind === 'park') this.addBuildingLabel(group, 'PARK', 0.34, 0);
    if (building.closed) {
      const marker = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: 0xffc857 }));
      marker.position.set(0, s.height + 0.18, d / 2 + 0.02);
      group.add(marker);
    }
    group.traverse((node) => {
      const mesh = node as THREE_NS.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    group.position.set(x, 0, z);
    this.semanticBuildingSlots.push({ group, building });
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
        this.worldInteractive = this.worldInteractive.filter((object) => object !== marker.group);
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
      group.userData.worldSelection = {
        kind: 'transmission',
        label: `Transmission ${fromId} → ${toId}`,
        detail: `Observed model transmission on simulation day ${event.timestamp}.`,
        x: event.location.x,
        y: event.location.y,
      } satisfies CityWorldSelection;
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
      this.worldInteractive.push(group);
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
        this.worldInteractive = this.worldInteractive.filter((object) => object !== marker.group);
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

  /** Wszystkie sygnały są bezpośrednim odczytem WorldState; ten renderer nie agreguje epidemii. */
  private syncWorldStateVisuals(): void {
    if (!this.THREE || !this.worldOverlayGroup || !this.worldState) return;
    const world = this.worldState;
    const fingerprint = JSON.stringify({
      hotspots: world.hotspots.map((hotspot) => [hotspot.x, hotspot.y, hotspot.infectious]),
      clusters: [...world.clusters.household, ...world.clusters.location].map((cluster) => [cluster.clusterId, cluster.locationIndex, cluster.transmissions, cluster.lastDay]),
      hospital: [world.hospital.status, world.hospital.occupiedBeds, world.hospital.occupiedIcu, world.hospital.unmetCare],
      locations: world.locations.map((location) => [location.kind, location.x, location.y, location.closed]),
    });
    if (fingerprint === this.worldOverlayFingerprint) return;
    this.worldOverlayFingerprint = fingerprint;
    const previousMarkers = [...this.worldOverlayGroup.children];
    this.worldInteractive = this.worldInteractive.filter((object) => !previousMarkers.includes(object));
    this.worldOverlayGroup.clear();
    for (const marker of previousMarkers) {
      marker.traverse((node) => {
        const mesh = node as THREE_NS.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (material && !Array.isArray(material)) material.dispose();
      });
    }

    for (const hotspot of world.hotspots) {
      this.addWorldMarker({
        kind: 'hotspot',
        label: `Hotspot · ${hotspot.infectious} infectious`,
        detail: `Grid cell aggregated from current infectious agent positions; ${hotspot.infectious} infectious agent(s).`,
        x: hotspot.x,
        y: hotspot.y,
      }, 0xff5b6b, Math.min(0.38, 0.15 + hotspot.infectious * 0.032), 0.78);
    }
    for (const cluster of [...world.clusters.household, ...world.clusters.location]) {
      const location = world.locations[cluster.locationIndex];
      // Cluster without a modeled location coordinate remains an analytics value, not an invented map marker.
      if (!location) continue;
      this.addWorldMarker({
        kind: 'cluster',
        label: `${cluster.kind} cluster · ${cluster.transmissions} transmission(s)`,
        detail: `Cluster ${cluster.clusterId}; model contact type ${cluster.contactType}; day ${cluster.firstDay}–${cluster.lastDay}.`,
        x: location.x + location.w / 2,
        y: location.y + location.h / 2,
      }, 0xb993ff, Math.min(0.34, 0.13 + cluster.transmissions * 0.028), 0.62);
    }
    const hospitalLocation = world.locations.find((location) => location.kind === 'hospital');
    if (hospitalLocation) {
      const hospitalColor: Record<string, number> = { NORMAL: 0x68d8ae, WARNING: 0xffc857, HIGH: 0xff965c, CRITICAL: 0xff5b6b };
      this.addWorldMarker({
        kind: 'hospital',
        label: `Hospital · ${world.hospital.status}`,
        detail: `Occupied beds ${world.hospital.occupiedBeds}; occupied ICU ${world.hospital.occupiedIcu}; unmet care ${world.hospital.unmetCare}.`,
        x: hospitalLocation.x + hospitalLocation.w / 2,
        y: hospitalLocation.y + hospitalLocation.h / 2,
      }, hospitalColor[world.hospital.status] ?? 0xffffff, 0.27, 0.84);
    }
  }

  private addWorldMarker(selection: CityWorldSelection, color: number, radius: number, height: number): void {
    if (!this.THREE || !this.worldOverlayGroup) return;
    const THREE = this.THREE;
    const group = new THREE.Group();
    const worldX = (selection.x - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE;
    const worldZ = (selection.y - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE;
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.60, radius, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.90, depthWrite: false, depthTest: false }));
    ring.rotation.x = -Math.PI / 2;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, height, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.76, depthWrite: false, depthTest: false }));
    stem.position.y = height / 2;
    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(Math.max(0.058, radius * 0.38), 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.98, depthWrite: false, depthTest: false }));
    cap.position.y = height;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.62, 0.012, 6, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.82, depthWrite: false, depthTest: false }));
    halo.rotation.x = Math.PI / 2;
    halo.position.y = height * 0.72;
    group.position.set(worldX, 0.07, worldZ);
    group.userData.markerPhase = ((selection.x * 17 + selection.y * 29) % 13) / 13 * Math.PI * 2;
    group.add(ring, stem, cap, halo);
    group.userData.worldSelection = selection;
    this.worldOverlayGroup.add(group);
    this.worldInteractive.push(group);
  }

  /** Ruch markera jest wyłącznie prezentacją odczytu WorldState; nie zmienia jego położenia, wartości ani symulacji. */
  private animateWorldMarkers(): void {
    if (!this.worldOverlayGroup) return;
    for (const marker of this.worldOverlayGroup.children) {
      const phase = Number(marker.userData.markerPhase ?? 0);
      const pulse = 1 + Math.sin(this.timeSeconds * 2.2 + phase) * 0.075;
      marker.scale.setScalar(pulse);
      marker.rotation.y = this.timeSeconds * 0.35 + phase;
    }
  }

  private syncFollowTarget(states: readonly HumanoidAgentState[]): void {
    if (!this.THREE) return;
    if (this.selectedWorld) {
      if (!this.followTarget) this.followTarget = new this.THREE.Vector3();
      this.followTarget.set(
        (this.selectedWorld.x - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE,
        0.26,
        (this.selectedWorld.y - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE,
      );
      return;
    }
    if (this.streetLayoutFocus) {
      if (!this.followTarget) this.followTarget = new this.THREE.Vector3();
      this.followTarget.set(
        (this.streetLayoutFocus.x - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE,
        0.46,
        (this.streetLayoutFocus.y - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE,
      );
      return;
    }
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
    if (id !== null && this.selectedWorld) this.selectWorld(null);
    this.selectedId = id;
    if (id !== null) {
      if (!preserveCameraPreset) this.cameraPreset = 'agent';
      this.cameraTrackId = id;
    }
    this.callbacks.onAgentSelected?.(id);
  }

  private selectWorld(selection: CityWorldSelection | null): void {
    this.selectedWorld = selection;
    if (selection) {
      this.selectedId = null;
      this.cameraTrackId = null;
      this.cameraPreset = 'district';
      this.callbacks.onAgentSelected?.(null);
    }
    this.callbacks.onWorldSelected?.(selection);
  }
}
