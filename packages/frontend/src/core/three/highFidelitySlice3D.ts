import type * as THREE_NS from 'three';
import { EventRegistry, EventStream, ingestTransmissions, type GenesisEvent } from '../events';
import { computeField, heatColor, type AnalysisMode } from '../simulation/analysis';
import { EpidemicCitySimulation, type EpidemicCityParams } from '../simulation/epidemicCity';
import { SimulationClock, type ClockSpeed } from '../simulationClock/clock';
import type { SimAgent } from '../simulation/types';
import type { SimParams } from '../types';
import { HEALTH_COLORS, HumanoidAgentVisual, mapSimAgentToHumanoid, type AgentHealthState, type HumanoidAgentState } from './humanoidAgentVisual';
import type { PostProcessingModules, PostProcessor, Sim3D, ThreeRenderMetrics } from './types';
import { createPhiladelphiaLegendVisual, type PhiladelphiaLegendViewMode, type PhiladelphiaLegendVisual } from './philadelphiaLegendVisual';

/** Jeden metr wizualny jest skalowany wyłącznie z odczytywanego modelu CityWorld. */
export const HIGH_FIDELITY_WORLD_SCALE = 0.02;
const HF_ANALYSIS_COLS = 34;
const HF_ANALYSIS_ROWS = 22;
const LOD1_COUNT = 12;
const LOD2_COUNT = 32;
const EVENT_MARKER_SECONDS = 7;

export type HighFidelityCameraMode = 'city' | 'street' | 'agent' | 'event';

export interface HighFidelitySliceCallbacks {
  onAgentSelected?: (id: number | null) => void;
}

export interface HighFidelityEventView {
  from: number;
  to: number;
  day: number;
  eventId: string;
}

interface MaterialBundle {
  asphalt: THREE_NS.MeshStandardMaterial;
  concrete: THREE_NS.MeshStandardMaterial;
  brick: THREE_NS.MeshStandardMaterial;
  glass: THREE_NS.MeshStandardMaterial;
  metal: THREE_NS.MeshStandardMaterial;
  markings: THREE_NS.MeshStandardMaterial;
}

interface UrbanAssetSpec {
  id: string;
  path: string;
  position: readonly [number, number, number];
  scale: number;
  rotationY?: number;
  bounds?: readonly [number, number, number, number, number, number];
}

interface EventMarker {
  group: THREE_NS.Group;
  born: number;
  event: GenesisEvent;
}

/**
 * Jeden wysokiej jakości fragment świata, a nie nowy World State.
 *
 * Model epidemii pozostaje jedynym właścicielem agentów, ruchu, transmisji i czasu
 * naukowego. Ta klasa czyta `agents()`, `objects()`, `streets` i `lastTransmissions()`
 * oraz prezentuje je jako PBR street slice z LOD0–2.
 */
export class HighFidelityStreetSlice3D implements Sim3D {
  cameraAutoRotateSpeed = 0.08;
  private readonly simulation: EpidemicCitySimulation;
  private readonly clock = new SimulationClock();
  private readonly registry: EventRegistry;
  private readonly stream: EventStream;
  private readonly callbacks: HighFidelitySliceCallbacks;
  private readonly eventSeed: number | string | undefined;

  private THREE: typeof THREE_NS | null = null;
  private scene: THREE_NS.Scene | null = null;
  private camera: THREE_NS.PerspectiveCamera | null = null;
  private raycaster: THREE_NS.Raycaster | null = null;
  private viewport = { w: 1, h: 1 };
  private timeSeconds = 0;
  private eventCursor = 0;
  private cameraMode: HighFidelityCameraMode = 'street';
  private analysisMode: AnalysisMode = 'risk';
  private showHeatmap = true;
  private selectedId: number | null = null;
  private latestEvent: HighFidelityEventView | null = null;
  private latestEventTarget: number | null = null;
  private hero: THREE_NS.Group | null = null;
  private heroMixer: THREE_NS.AnimationMixer | null = null;
  /** Materiał istniejącego ubrania GLB — kolor stanu nie jest nakładaną figurką. */
  private heroEpidemicMaterial: THREE_NS.MeshStandardMaterial | null = null;
  private heroLoaded = false;
  private heroLoadFailed = false;
  /** Lokalny CC0 HDRI 1K wzmacnia odbicia PBR; błąd ładowania zachowuje stabilny baseline świateł. */
  private readonly hdriEnabled = true;
  private lod1 = new Map<number, HumanoidAgentVisual>();
  private lod2: HighFidelityCrowd | null = null;
  private analysisMesh: THREE_NS.InstancedMesh | null = null;
  private analysisMaterial: THREE_NS.MeshBasicMaterial | null = null;
  private materials: MaterialBundle | null = null;
  private sceneObjects: THREE_NS.Object3D[] = [];
  private readonly urbanAssets = new Map<string, THREE_NS.Object3D>();
  private eventMarkers = new Map<string, EventMarker>();
  private followTarget: THREE_NS.Vector3 | null = null;
  private lastTickMs = 0;
  private metrics: ThreeRenderMetrics = { fps: 0, frameMs: 0, renderMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0 };
  private pointerDown: { x: number; y: number } | null = null;
  private pointerDragged = false;
  /** Opcjonalna scenografia legendy; nie zawiera World State ani solvera. */
  private readonly philadelphiaLegendMode: PhiladelphiaLegendViewMode | null;
  private philadelphiaLegend: PhiladelphiaLegendVisual | null = null;

  constructor(
    params: Partial<EpidemicCityParams> = {},
    callbacks: HighFidelitySliceCallbacks = {},
    existingSimulation?: EpidemicCitySimulation,
    philadelphiaLegendMode: PhiladelphiaLegendViewMode | null = null,
  ) {
    this.simulation = existingSimulation ?? new EpidemicCitySimulation(params);
    this.philadelphiaLegendMode = philadelphiaLegendMode;
    this.eventSeed = this.simulation.getParams().seed as number | undefined;
    this.registry = new EventRegistry({ modelId: 'epidemic.city', seed: this.eventSeed });
    this.stream = new EventStream(this.registry);
    this.eventCursor = this.stream.cursor();
    this.callbacks = callbacks;
  }

  getSim(): EpidemicCitySimulation { return this.simulation; }
  getLatestEvent(): HighFidelityEventView | null { return this.latestEvent; }
  getCameraMode(): HighFidelityCameraMode { return this.cameraMode; }
  isHeroAssetLoaded(): boolean { return this.heroLoaded; }
  isHeroAssetFailed(): boolean { return this.heroLoadFailed; }
  isPhiladelphiaLegendScenario(): boolean { return this.philadelphiaLegendMode !== null; }

  setAnalysisMode(mode: AnalysisMode): void { this.analysisMode = mode; }
  setShowHeatmap(value: boolean): void { this.showHeatmap = value; }

  setCameraMode(mode: HighFidelityCameraMode): number | null {
    this.cameraMode = mode;
    if (mode === 'city') {
      this.selectedId = null;
      this.followTarget = null;
      this.callbacks.onAgentSelected?.(null);
      return null;
    }
    if ((mode === 'agent' || mode === 'event') && !this.hero && !this.heroLoadFailed) void this.loadHeroAsset();
    const agents = this.simulation.agents();
    const infected = agents.find((agent) => agent.state === 'I') ?? agents.find((agent) => agent.state === 'E');
    const moving = agents.find((agent) => Math.hypot(agent.vx, agent.vy) > 0.001);
    const candidateId = mode === 'event'
      ? this.latestEventTarget
      : (this.selectedId ?? infected?.id ?? moving?.id ?? agents[0]?.id ?? null);
    this.selectAgent(candidateId);
    return candidateId;
  }

  focusLatestEvent(): number | null {
    if (this.latestEventTarget === null) return null;
    this.cameraMode = 'event';
    this.selectAgent(this.latestEventTarget);
    return this.latestEventTarget;
  }

  reset(): void {
    this.clock.reset();
    this.simulation.reset();
    this.registry.reset();
    this.eventCursor = this.stream.cursor();
    this.latestEvent = null;
    this.latestEventTarget = null;
    this.selectedId = null;
    this.cameraMode = 'street';
    this.followTarget = null;
    this.callbacks.onAgentSelected?.(null);
  }

  init(THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera, w: number, h: number): void {
    this.THREE = THREE;
    this.scene = scene;
    this.camera = camera;
    this.viewport = { w, h };
    this.raycaster = new THREE.Raycaster();
    scene.background = new THREE.Color(0xc8d9e7);
    scene.fog = new THREE.FogExp2(0xd7e2e7, 0.016);
    camera.position.set(5.8, 2.8, 8.8);
    camera.lookAt(0, 1.2, 0);

    this.addLighting();
    if (this.philadelphiaLegendMode) {
      this.addPhiladelphiaLegendScene(this.philadelphiaLegendMode);
      return;
    }
    this.createMaterials();
    this.addStreetSlice();
    void this.loadUrbanAssetsV2();
    this.addAnalysisLayer();
    this.lod2 = new HighFidelityCrowd(THREE, LOD2_COUNT);
    this.lod2.addTo(scene);
    if ((this.cameraMode === 'agent' || this.cameraMode === 'event') && !this.hero && !this.heroLoadFailed) void this.loadHeroAsset();
  }

  setupPostProcessing(
    modules: PostProcessingModules,
    renderer: THREE_NS.WebGLRenderer,
    scene: THREE_NS.Scene,
    camera: THREE_NS.PerspectiveCamera,
    w: number,
    h: number,
  ): PostProcessor {
    const THREE = this.THREE!;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // HDRI ładuje się asynchronicznie po pierwszym kadrze; podstawą pozostają PBR + światła.
    if (this.hdriEnabled) void this.loadHdri(renderer);
    renderer.toneMappingExposure = 1.02;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const composer = new modules.EffectComposer(renderer);
    composer.addPass(new modules.RenderPass(scene, camera));
    const bloom = new modules.UnrealBloomPass(new THREE.Vector2(w, h), 0.17, 0.55, 0.92);
    composer.addPass(bloom);
    composer.addPass(new modules.OutputPass());
    return { render: () => composer.render(), setSize: (width, height) => composer.setSize(width, height), dispose: () => composer.dispose() };
  }

  update(dt: number, params: SimParams): void {
    if (this.philadelphiaLegend) {
      this.timeSeconds += dt;
      this.philadelphiaLegend.update(this.timeSeconds);
      return;
    }
    const speed = Math.max(0, Number(params.clockSpeed ?? 1)) as ClockSpeed;
    if (speed !== this.clock.speed) this.clock.setSpeed(speed);
    if (this.clock.running) this.timeSeconds += dt;
    const startedAt = performance.now();
    this.clock.advance(dt, (dtDays) => {
      this.simulation.tick(dtDays);
      ingestTransmissions(this.registry, this.simulation.lastTransmissions(), {
        simTime: this.clock.time,
        modelId: 'epidemic.city',
        seed: this.eventSeed,
        params: this.simulation.getParams(),
      });
    });
    this.lastTickMs = performance.now() - startedAt;
    this.heroMixer?.update(dt);
  }

  syncScene(_scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera): void {
    if (this.philadelphiaLegend && this.THREE) {
      camera.position.lerp(new this.THREE.Vector3(8.5, 4.1, 10.5), 0.055);
      camera.lookAt(0, 0.65, 0);
      return;
    }
    if (!this.THREE || !this.scene || !this.lod2) return;
    const allStates = this.simulation.agents().map((agent) => this.toVisualState(agent));
    const focus = this.pickFocusState(allStates);
    this.syncHero(focus);
    this.syncLod1(allStates, focus);
    this.syncLod2(allStates, focus);
    this.syncAnalysis(this.simulation.agents());
    this.syncEvents();
    this.syncEventMarkers();
    this.syncFollowTarget(focus);

    if (this.cameraMode === 'city') {
      this.followTarget = null;
      camera.position.lerp(new this.THREE.Vector3(5.8, 7.1, 10.6), 0.045);
      camera.lookAt(0, 0.7, 0);
    }
  }

  getOrbitTarget(): THREE_NS.Vector3 | null { return this.followTarget; }

  getOrbitFocusDistance(): number | null {
    if (!this.followTarget) return null;
    if (this.cameraMode === 'street') return 8.4;
    if (this.cameraMode === 'event') return 5.1;
    return 2.65;
  }

  getOrbitCameraDirection(): THREE_NS.Vector3 | null {
    if (!this.THREE || !this.followTarget) return null;
    if (this.cameraMode === 'street') return new this.THREE.Vector3(1.6, 0.08, 3.2).normalize();
    if (this.cameraMode === 'event') return new this.THREE.Vector3(3.2, 0.46, 3.8).normalize();
    return new this.THREE.Vector3(1.9, 0.75, 2.3).normalize();
  }

  onResize(w: number, h: number): void { this.viewport = { w, h }; }
  onRenderMetrics(metrics: ThreeRenderMetrics): void { this.metrics = metrics; }

  getStats(): Record<string, number> {
    if (this.philadelphiaLegend) return {
      historical_legend: 1,
      hypothetical_visualization: 1,
      real_engine_available: 0,
      webgl_fps: this.metrics.fps,
      webgl_frame_ms: this.metrics.frameMs,
      webgl_render_ms: this.metrics.renderMs,
      webgl_draw_calls: this.metrics.drawCalls,
      webgl_triangles: this.metrics.triangles,
      webgl_geometries: this.metrics.geometries,
      webgl_textures: this.metrics.textures,
    };
    return {
      ...this.simulation.stats(),
      sim_clock_days: Math.round(this.clock.time * 100) / 100,
      hf_lod0_ready: this.heroLoaded ? 1 : 0,
      hf_lod0_asset_failed: this.heroLoadFailed ? 1 : 0,
      hf_lod1_agents: this.lod1.size,
      hf_lod2_agents: this.lod2?.count ?? 0,
      hf_selected_agent: this.selectedId ?? -1,
      hf_event_count: this.stream.count(),
      sim_tick_ms: this.lastTickMs,
      webgl_fps: this.metrics.fps,
      webgl_frame_ms: this.metrics.frameMs,
      webgl_render_ms: this.metrics.renderMs,
      webgl_draw_calls: this.metrics.drawCalls,
      webgl_triangles: this.metrics.triangles,
      webgl_geometries: this.metrics.geometries,
      webgl_textures: this.metrics.textures,
    };
  }

  pointer(x: number, y: number, type: 'down' | 'move' | 'up'): void {
    if (type === 'down') { this.pointerDown = { x, y }; this.pointerDragged = false; return; }
    if (type === 'move') {
      if (this.pointerDown && Math.hypot(x - this.pointerDown.x, y - this.pointerDown.y) > 6) this.pointerDragged = true;
      return;
    }
    const dragged = this.pointerDragged;
    this.pointerDown = null;
    this.pointerDragged = false;
    if (dragged || !this.THREE || !this.camera || !this.raycaster) return;
    const ndc = new this.THREE.Vector2((x / this.viewport.w) * 2 - 1, -(y / this.viewport.h) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const roots = [...this.lod1.values()].map((visual) => visual.root);
    if (this.hero) roots.push(this.hero);
    const hit = this.raycaster.intersectObjects(roots, true)[0];
    let node: THREE_NS.Object3D | null = hit?.object ?? null;
    while (node && typeof node.userData.agentId !== 'number') node = node.parent;
    if (node && typeof node.userData.agentId === 'number') this.selectAgent(node.userData.agentId as number);
  }

  dispose(): void {
    for (const visual of this.lod1.values()) visual.dispose();
    this.lod1.clear();
    this.lod2?.dispose();
    this.lod2 = null;
    this.heroMixer?.stopAllAction();
    this.heroMixer = null;
    this.philadelphiaLegend?.dispose();
    this.philadelphiaLegend = null;
    this.analysisMesh?.geometry.dispose();
    this.analysisMaterial?.dispose();
    this.materials?.asphalt.dispose();
    this.materials?.concrete.dispose();
    this.materials?.brick.dispose();
    for (const object of this.sceneObjects) this.disposeObject(object);
    for (const marker of this.eventMarkers.values()) this.disposeObject(marker.group);
    this.sceneObjects = [];
    this.eventMarkers.clear();
  }

  private addLighting(): void {
    const THREE = this.THREE!;
    // Neutralne dzienne światło: kontrast materiałów i skala miasta bez neonowego gradingu.
    const sky = new THREE.HemisphereLight(0xc7d8e8, 0x5b5348, 1.42);
    this.scene!.add(sky);
    const sun = new THREE.DirectionalLight(0xffe2bd, 3.0);
    sun.position.set(-8, 13, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -9; sun.shadow.camera.right = 9; sun.shadow.camera.top = 9; sun.shadow.camera.bottom = -9;
    sun.shadow.bias = -0.00022;
    sun.shadow.normalBias = 0.018;
    this.scene!.add(sun);
    const fill = new THREE.DirectionalLight(0xc2d3df, 0.78);
    fill.position.set(8, 5, -7);
    this.scene!.add(fill);
  }

  private addPhiladelphiaLegendScene(mode: PhiladelphiaLegendViewMode): void {
    const THREE = this.THREE!;
    // To środowisko jest wyłącznie prezentacyjnym tłem oznaczonej legendy.
    // Nie ma obiektów CityWorld, agentów, zdarzeń ani obliczeń pola elektromagnetycznego.
    this.scene!.background = new THREE.Color(0x081923);
    this.scene!.fog = new THREE.FogExp2(0x102d3a, 0.035);
    const moon = new THREE.DirectionalLight(0xaad8e8, 1.35);
    moon.position.set(-4, 8, 6);
    this.scene!.add(moon);
    const legend = createPhiladelphiaLegendVisual(THREE, mode);
    this.philadelphiaLegend = legend;
    this.scene!.add(legend.root);
  }

  private createMaterials(): void {
    const THREE = this.THREE!;
    this.materials = {
      asphalt: new THREE.MeshStandardMaterial({ color: 0x313943, roughness: 0.87, metalness: 0.04, aoMapIntensity: 0.62 }),
      concrete: new THREE.MeshStandardMaterial({ color: 0x9da1a2, roughness: 0.82, metalness: 0.02, aoMapIntensity: 0.74 }),
      brick: new THREE.MeshStandardMaterial({ color: 0x8a5140, roughness: 0.78, metalness: 0.01, aoMapIntensity: 0.68 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x7190a3, roughness: 0.18, metalness: 0.22, transparent: true, opacity: 0.58 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x3d4850, roughness: 0.38, metalness: 0.82 }),
      markings: new THREE.MeshStandardMaterial({ color: 0xe7e2d2, roughness: 0.54, metalness: 0.02 }),
    };
    const loader = new THREE.TextureLoader();
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/asphalt/diffuse.jpg', this.materials.asphalt, 'map', true, 5, 2);
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/asphalt/normal.jpg', this.materials.asphalt, 'normalMap', false, 5, 2);
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/asphalt/roughness.jpg', this.materials.asphalt, 'roughnessMap', false, 5, 2);
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/asphalt/ao.jpg', this.materials.asphalt, 'aoMap', false, 5, 2);
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/concrete/diffuse.jpg', this.materials.concrete, 'map', true, 4, 2);
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/concrete/normal.jpg', this.materials.concrete, 'normalMap', false, 4, 2);
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/concrete/roughness.jpg', this.materials.concrete, 'roughnessMap', false, 4, 2);
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/concrete/ao.jpg', this.materials.concrete, 'aoMap', false, 4, 2);
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/brick/diffuse.jpg', this.materials.brick, 'map', true, 3, 2);
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/brick/normal.jpg', this.materials.brick, 'normalMap', false, 3, 2);
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/brick/roughness.jpg', this.materials.brick, 'roughnessMap', false, 3, 2);
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/brick/ao.jpg', this.materials.brick, 'aoMap', false, 3, 2);
  }

  /** HDRI jest CC0 assetem środowiska; nie jest mapą świata ani źródłem danych modelu. */
  private async loadHdri(renderer: THREE_NS.WebGLRenderer): Promise<void> {
    try {
      const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js');
      if (!this.THREE || !this.scene) return;
      const pmrem = new this.THREE.PMREMGenerator(renderer);
      new RGBELoader().load('/assets/genesis-hf/hdr/braustuble_alley_1k.hdr', (texture) => {
        if (!this.scene) { texture.dispose(); pmrem.dispose(); return; }
        const environment = pmrem.fromEquirectangular(texture).texture;
        this.scene.environment = environment;
        texture.dispose();
        pmrem.dispose();
      }, undefined, () => pmrem.dispose());
    } catch {
      // PBR materiały i fizyczne oświetlenie są nadal pełnym fallbackiem bez HDRI.
    }
  }

  private loadPbrTexture(
    loader: THREE_NS.TextureLoader,
    path: string,
    material: THREE_NS.MeshStandardMaterial,
    slot: 'map' | 'normalMap' | 'roughnessMap' | 'aoMap',
    srgb: boolean,
    repeatX: number,
    repeatY: number,
  ): void {
    const THREE = this.THREE!;
    loader.load(path, (texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
      material[slot] = texture as never;
      material.needsUpdate = true;
    }, undefined, () => undefined);
  }

  private addStreetSlice(): void {
    const THREE = this.THREE!;
    const materials = this.materials!;
    const worldW = this.simulation.worldWidth * HIGH_FIDELITY_WORLD_SCALE;
    const worldH = this.simulation.worldHeight * HIGH_FIDELITY_WORLD_SCALE;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(worldW + 2, worldH + 2), new THREE.MeshStandardMaterial({ color: 0x405048, roughness: 0.97 }));

    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.enableAo(ground);
    this.addSceneObject(ground);

    const roadWidth = 1.35;
    const walkWidth = 1.12;
    for (const y of this.simulation.streets.h) {
      const z = this.toWorldY(y);
      const road = new THREE.Mesh(new THREE.BoxGeometry(worldW, 0.08, roadWidth), materials.asphalt);
      road.position.set(0, 0.02, z); road.receiveShadow = true; this.enableAo(road); this.addSceneObject(road);
      for (const offset of [-roadWidth / 2 - walkWidth / 2, roadWidth / 2 + walkWidth / 2]) {
        const walk = new THREE.Mesh(new THREE.BoxGeometry(worldW, 0.055, walkWidth), materials.concrete);
        walk.position.set(0, 0.045, z + offset); walk.receiveShadow = true; this.enableAo(walk); this.addSceneObject(walk);
      }
      this.addRoadLine(worldW, z, false);
    }
    for (const x of this.simulation.streets.v) {
      const px = this.toWorldX(x);
      const road = new THREE.Mesh(new THREE.BoxGeometry(roadWidth, 0.082, worldH), materials.asphalt);
      road.position.set(px, 0.025, 0); road.receiveShadow = true; this.enableAo(road); this.addSceneObject(road);
      for (const offset of [-roadWidth / 2 - walkWidth / 2, roadWidth / 2 + walkWidth / 2]) {
        const walk = new THREE.Mesh(new THREE.BoxGeometry(walkWidth, 0.058, worldH), materials.concrete);
        walk.position.set(px + offset, 0.048, 0); walk.receiveShadow = true; this.enableAo(walk); this.addSceneObject(walk);
      }
      this.addRoadLine(worldH, px, true);
    }

    this.addUrbanStreetDetails();
  }

  private addRoadLine(length: number, position: number, vertical: boolean): void {
    const THREE = this.THREE!;
    const material = new THREE.MeshStandardMaterial({ color: 0xf7dcaa, emissive: 0x9c7340, emissiveIntensity: 0.08, roughness: 0.5 });
    for (let offset = -length / 2 + 0.25; offset < length / 2; offset += 0.72) {
      const marker = new THREE.Mesh(new THREE.BoxGeometry(vertical ? 0.07 : 0.36, 0.025, vertical ? 0.36 : 0.07), material);
      marker.position.set(vertical ? position : offset, 0.09, vertical ? offset : position);
      this.addSceneObject(marker);
    }
  }

  /**
   * V2.1 ładuje profesjonalną, modułową scenografię CC0. Nie ma tu danych populacji
   * ani logiki modelu — to wyłącznie zastępowalna powłoka wizualna kwartału.
   */
  private async loadUrbanAssetsV2(): Promise<void> {
    if (!this.THREE || !this.scene) return;
    const [{ GLTFLoader }] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js')]);
    const assets: UrbanAssetSpec[] = [
      { id: 'apartments-modules', path: '/assets/genesis-hf-v2/models/modular_urban_apartments_facade/modular_urban_apartments_facade.gltf', position: [0, 0, 0], scale: 1 },
      { id: 'escape', path: '/assets/genesis-hf-v2/models/modular_fire_escape/modular_fire_escape.gltf', position: [-3.15, 0.08, -2.45], scale: 0.44 },
      { id: 'seating-a', path: '/assets/genesis-hf-v2/models/modular_street_seating/modular_street_seating.gltf', position: [-1.9, 0.09, -1.95], scale: 0.72 },
      { id: 'seating-b', path: '/assets/genesis-hf-v2/models/modular_street_seating/modular_street_seating.gltf', position: [2.7, 0.09, 2.05], scale: 0.72, rotationY: Math.PI },
      { id: 'car', path: '/assets/genesis-hf-v2/models/covered_car/covered_car.gltf', position: [-0.85, 0.09, 0.53], scale: 0.55, rotationY: Math.PI / 2 },
      { id: 'hydrant', path: '/assets/genesis-hf-v2/models/fire_hydrant/fire_hydrant.gltf', position: [1.85, 0.1, -1.83], scale: 0.74 },
      ...[-5.7, -2.8, 0.2, 3.3, 6.1].map((x, index): UrbanAssetSpec => ({ id: `lamp-${index}`, path: '/assets/genesis-hf-v2/models/street_lamp_01/street_lamp_01.gltf', position: [x, 0.1, -1.92], scale: 0.88 })),
    ];
    const loaded = new Map<string, THREE_NS.Object3D>();
    const pending = new Map<string, Promise<THREE_NS.Object3D | null>>();
    const loader = new GLTFLoader();
    const getPrototype = (path: string): Promise<THREE_NS.Object3D | null> => {
      const existing = loaded.get(path);
      if (existing) return Promise.resolve(existing);
      const active = pending.get(path);
      if (active) return active;
      const request = new Promise<THREE_NS.Object3D | null>((resolve) => loader.load(path, (gltf) => {
        loaded.set(path, gltf.scene); resolve(gltf.scene);
      }, undefined, () => resolve(null)));
      pending.set(path, request);
      return request;
    };
    await Promise.all(assets.map(async (spec) => {
      const prototype = await getPrototype(spec.path);
      if (!prototype) return;
      const instantiate = (source: THREE_NS.Object3D) => {
        if (spec.id === 'apartments-modules') {
          this.addModularFacadeBuildings(source);
          return;
        }
        const root = source.clone(true);
        root.name = `v2-urban-${spec.id}`;
        root.traverse((node) => {
          const mesh = node as THREE_NS.Mesh;
          if (!mesh.isMesh) return;
          const [minX, maxX, minY, maxY, minZ, maxZ] = spec.bounds ?? [-Infinity, Infinity, -Infinity, Infinity, -Infinity, Infinity];
          const { x, y, z } = mesh.position;
          mesh.visible = x >= minX && x <= maxX && y >= minY && y <= maxY && z >= minZ && z <= maxZ;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          if (mesh.geometry.getAttribute('uv') && !mesh.geometry.getAttribute('uv2')) mesh.geometry.setAttribute('uv2', mesh.geometry.getAttribute('uv'));
        });
        const bounds = new this.THREE!.Box3();
        root.traverse((node) => {
          const mesh = node as THREE_NS.Mesh;
          if (mesh.isMesh && mesh.visible) bounds.expandByObject(mesh);
        });
        const center = bounds.getCenter(new this.THREE!.Vector3());
        root.position.set(-center.x, -bounds.min.y, -center.z);
        const wrapper = new this.THREE!.Group();
        wrapper.name = root.name;
        wrapper.position.set(...spec.position);
        wrapper.scale.setScalar(spec.scale);
        wrapper.rotation.y = spec.rotationY ?? 0;
        wrapper.add(root);
        this.scene!.add(wrapper);
        this.urbanAssets.set(spec.id, wrapper);
      };
      instantiate(prototype);
    }));
  }

  private addModularFacadeBuildings(source: THREE_NS.Object3D): void {
    const THREE = this.THREE!;
    const materials = this.materials!;
    const tile = (name: string, x: number, y: number, z: number, into: THREE_NS.Group) => {
      const template = source.getObjectByName(name) as THREE_NS.Mesh | undefined;
      if (!template?.isMesh) return;
      const mesh = template.clone();
      mesh.position.set(x, y, z);
      mesh.rotation.set(0, 0, 0);
      mesh.scale.set(1, 1, 1);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (mesh.geometry.getAttribute('uv') && !mesh.geometry.getAttribute('uv2')) mesh.geometry.setAttribute('uv2', mesh.geometry.getAttribute('uv'));
      into.add(mesh);
    };
    const createFacade = (id: string, position: readonly [number, number, number], rotationY: number, facadeScale: number) => {
      const building = new THREE.Group();
      building.name = `v2-modular-facade-${id}`;
      const body = new THREE.Mesh(new THREE.BoxGeometry(13.2, 12, 1.25), materials.brick);
      body.position.set(0, 6, -0.58); body.castShadow = true; body.receiveShadow = true; this.enableAo(body); building.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(13.8, 0.36, 1.72), materials.metal);
      roof.position.set(0, 12.18, -0.46); roof.castShadow = true; building.add(roof);
      for (const x of [-4, 0, 4]) {
        tile('wall_door_centered_large_01', x, 0, 0.08, building);
        tile('wall_window_centered_large_01', x, 4, 0.08, building);
        tile('wall_window_centered_large_02', x, 8, 0.08, building);
      }
      building.position.set(...position);
      building.rotation.y = rotationY;
      building.scale.setScalar(facadeScale);
      this.scene!.add(building);
      this.urbanAssets.set(id, building);
    };
    createFacade('apartments-a', [-4.9, 0.06, -4.85], 0, 0.44);
    createFacade('apartments-b', [4.85, 0.06, -5.25], Math.PI, 0.4);
  }

  private addUrbanStreetDetails(): void {
    const THREE = this.THREE!;
    const materials = this.materials!;
    const curbMaterial = new THREE.MeshStandardMaterial({ color: 0x777b79, roughness: 0.72, metalness: 0.03 });
    const curbSegments: Array<readonly [number, number, number, number, number, number]> = [
      [0, 0.115, -2.12, 14.4, 0.16, 0.12], [0, 0.115, 2.12, 14.4, 0.16, 0.12],
      [-2.12, 0.115, 0, 0.12, 0.16, 12.8], [2.12, 0.115, 0, 0.12, 0.16, 12.8],
    ];
    for (const [x, y, z, w, h, d] of curbSegments) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), curbMaterial);
      curb.position.set(x, y, z); curb.castShadow = true; curb.receiveShadow = true; this.enableAo(curb); this.addSceneObject(curb);
    }
    for (let offset = -0.92; offset <= 0.92; offset += 0.27) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.022, 0.14), materials.markings);
      stripe.position.set(offset, 0.104, -0.62); stripe.receiveShadow = true; this.addSceneObject(stripe);
    }
    for (const [x, z, rotation] of [[-1.9, 1.75, 0], [2.0, -1.7, Math.PI]] as const) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.45, 10), materials.metal);
      pole.position.set(x, 0.8, z); pole.castShadow = true;
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), new THREE.MeshStandardMaterial({ color: 0x3e6b88, roughness: 0.42, metalness: 0.12, side: THREE.DoubleSide }));
      face.position.set(x, 1.45, z); face.rotation.y = rotation;
      this.addSceneObject(pole); this.addSceneObject(face);
    }
  }

  private enableAo(mesh: THREE_NS.Mesh): void {
    const geometry = mesh.geometry;
    const uv = geometry.getAttribute('uv');
    if (uv && !geometry.getAttribute('uv2')) geometry.setAttribute('uv2', uv);
  }

  private addAnalysisLayer(): void {
    const THREE = this.THREE!;
    this.analysisMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
    this.analysisMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.analysisMaterial, HF_ANALYSIS_COLS * HF_ANALYSIS_ROWS);
    this.analysisMesh.rotation.x = -Math.PI / 2;
    this.analysisMesh.position.y = 0.125;
    this.analysisMesh.count = 0;
    this.scene!.add(this.analysisMesh);
  }

  private toVisualState(agent: SimAgent): HumanoidAgentState {
    const state = mapSimAgentToHumanoid(agent, this.simulation.worldWidth, this.simulation.worldHeight, HIGH_FIDELITY_WORLD_SCALE, this.simulation.worldWidth * 0.1);
    return state;
  }

  private pickFocusState(states: readonly HumanoidAgentState[]): HumanoidAgentState | null {
    const selected = this.selectedId === null ? null : states.find((state) => state.id === this.selectedId) ?? null;
    if (selected) return selected;
    const infected = states.find((state) => state.health === 'I') ?? states.find((state) => state.health === 'E');
    return infected ?? states[0] ?? null;
  }

  private syncHero(focus: HumanoidAgentState | null): void {
    if (!focus || !this.hero) return;
    this.hero.visible = true;
    this.hero.userData.agentId = focus.id;
    this.hero.position.set(focus.worldX, 0, focus.worldZ);
    this.hero.rotation.y = focus.facing;
    const color = HEALTH_COLORS[focus.health];
    if (this.heroEpidemicMaterial) {
      this.heroEpidemicMaterial.color.setHex(color);
      this.heroEpidemicMaterial.emissive.setHex(color);
      this.heroEpidemicMaterial.emissiveIntensity = focus.health === 'I' ? 0.22 + Math.sin(this.timeSeconds * 3) * 0.08 : 0.06;
    }
  }

  private syncLod1(states: readonly HumanoidAgentState[], focus: HumanoidAgentState | null): void {
    const ids = new Set<number>();
    const candidates = this.cameraMode === 'agent'
      ? []
      : states.filter((state) => state.id !== focus?.id).slice(0, LOD1_COUNT);
    for (const state of candidates) {
      ids.add(state.id);
      let visual = this.lod1.get(state.id);
      if (!visual) {
        visual = new HumanoidAgentVisual(this.THREE!, state.id);
        visual.root.scale.setScalar(1.55);
        // Cień skinned LOD0 jest dowodem bliskiego realizmu; LOD1 pozostaje czytelny,
        // lecz nie multiplikuje kosztu mapy cieni w software WebGL.
        visual.root.traverse((node) => {
          const mesh = node as THREE_NS.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = false;
          const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          if (material && 'emissive' in material) {
            const standard = material as THREE_NS.MeshStandardMaterial;
            standard.emissive.copy(standard.color).multiplyScalar(0.38);
            standard.emissiveIntensity = 0.42;
          }
        });
        this.lod1.set(state.id, visual);
        this.scene!.add(visual.root);
      }
      visual.setSelected(state.id === this.selectedId);
      visual.sync(state, this.timeSeconds);
    }
    for (const [id, visual] of [...this.lod1]) {
      if (ids.has(id)) continue;
      this.scene!.remove(visual.root);
      visual.dispose();
      this.lod1.delete(id);
    }
  }

  private syncLod2(states: readonly HumanoidAgentState[], focus: HumanoidAgentState | null): void {
    if (this.cameraMode !== 'city') {
      this.lod2!.update([], this.timeSeconds);
      return;
    }
    const excluded = new Set<number>([focus?.id ?? -1, ...this.lod1.keys()]);
    this.lod2!.update(states.filter((state) => !excluded.has(state.id)).slice(0, LOD2_COUNT), this.timeSeconds);
  }

  private syncAnalysis(agents: readonly SimAgent[]): void {
    if (!this.analysisMesh || !this.THREE) return;
    if (!this.showHeatmap || this.analysisMode === 'none') { this.analysisMesh.count = 0; return; }
    const field = computeField(agents, this.simulation.worldWidth, this.simulation.worldHeight, this.analysisMode, HF_ANALYSIS_COLS, HF_ANALYSIS_ROWS);
    const cellW = this.simulation.worldWidth / field.cols * HIGH_FIDELITY_WORLD_SCALE;
    const cellH = this.simulation.worldHeight / field.rows * HIGH_FIDELITY_WORLD_SCALE;
    const matrix = new this.THREE.Matrix4();
    const position = new this.THREE.Vector3();
    const scale = new this.THREE.Vector3();
    const rotation = new this.THREE.Quaternion();
    for (let row = 0; row < field.rows; row++) for (let col = 0; col < field.cols; col++) {
      const index = row * field.cols + col;
      position.set(this.toWorldX((col + 0.5) * this.simulation.worldWidth / field.cols), 0, this.toWorldY((row + 0.5) * this.simulation.worldHeight / field.rows));
      scale.set(cellW * 0.96, cellH * 0.96, 1);
      matrix.compose(position, rotation, scale);
      this.analysisMesh.setMatrixAt(index, matrix);
      const [r, g, b] = heatColor(field.values[index]);
      this.analysisMesh.setColorAt(index, new this.THREE.Color(r, g, b));
    }
    this.analysisMesh.count = field.cols * field.rows;
    this.analysisMesh.instanceMatrix.needsUpdate = true;
    if (this.analysisMesh.instanceColor) this.analysisMesh.instanceColor.needsUpdate = true;
  }

  private syncEvents(): void {
    const batch = this.stream.getEventsSince(this.eventCursor);
    this.eventCursor = batch.cursor;
    for (const event of batch.events) {
      if (event.type !== 'infection.transmission' || !event.location || event.source?.kind !== 'agent') continue;
      const target = event.affectedEntities.find((entity) => entity.kind === 'agent');
      if (!target || typeof target.id !== 'number') continue;
      this.latestEvent = { from: Number(event.source.id), to: target.id, day: event.timestamp, eventId: event.id };
      this.latestEventTarget = target.id;
      this.addEventMarker(event);
    }
  }

  private addEventMarker(event: GenesisEvent): void {
    if (!this.THREE || !this.scene || !event.location || this.eventMarkers.has(event.id)) return;
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.name = `hf-real-event-${event.id}`;
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xff9b7d, transparent: true, opacity: 0.34, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.022, 10, 32), ringMaterial);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.16; group.add(ring);
    const pulse = new THREE.PointLight(0xffc2a1, 1.45, 2.1, 2);
    pulse.position.y = 0.42; group.add(pulse);
    group.position.set(this.toWorldX(event.location.x), 0, this.toWorldY(event.location.y));
    this.scene.add(group);
    this.eventMarkers.set(event.id, { group, born: this.timeSeconds, event });
  }

  private syncEventMarkers(): void {
    for (const [id, marker] of [...this.eventMarkers]) {
      const age = this.timeSeconds - marker.born;
      const ring = marker.group.children.find((node) => (node as THREE_NS.Mesh).isMesh) as THREE_NS.Mesh | undefined;
      if (ring) ring.scale.setScalar(1 + Math.max(0, age) * 0.11);
      if (age <= EVENT_MARKER_SECONDS) continue;
      this.scene?.remove(marker.group);
      this.disposeObject(marker.group);
      this.eventMarkers.delete(id);
    }
  }

  private syncFollowTarget(focus: HumanoidAgentState | null): void {
    if (!this.THREE || this.cameraMode === 'city') return;
    const target = this.cameraMode === 'street'
      // Prawdziwe skrzyżowanie layoutu (`streetsV[1]` × `streetsH[1]`), nie punkt wymyślony przez renderer.
      ? { x: this.simulation.streets.v[1], y: this.simulation.streets.h[1] }
      : this.cameraMode === 'event' && this.latestEvent && this.registry.get(this.latestEvent.eventId)?.location
        ? this.registry.get(this.latestEvent.eventId)!.location!
        : focus ? { x: (focus.worldX / HIGH_FIDELITY_WORLD_SCALE) + this.simulation.worldWidth / 2, y: (focus.worldZ / HIGH_FIDELITY_WORLD_SCALE) + this.simulation.worldHeight / 2 } : null;
    if (!target) return;
    const y = this.cameraMode === 'agent' ? 1.32 : this.cameraMode === 'street' ? 1.43 : 0.72;
    this.followTarget = new this.THREE.Vector3(this.toWorldX(target.x), y, this.toWorldY(target.y));
  }

  private selectAgent(id: number | null): void {
    this.selectedId = id;
    this.callbacks.onAgentSelected?.(id);
  }

  private toWorldX(x: number): number { return (x - this.simulation.worldWidth / 2) * HIGH_FIDELITY_WORLD_SCALE; }
  private toWorldY(y: number): number { return (y - this.simulation.worldHeight / 2) * HIGH_FIDELITY_WORLD_SCALE; }

  private addSceneObject(object: THREE_NS.Object3D): void {
    this.scene!.add(object);
    this.sceneObjects.push(object);
  }

  private disposeObject(object: THREE_NS.Object3D): void {
    object.traverse((node) => {
      const mesh = node as THREE_NS.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material;
      if (material && !Array.isArray(material) && !Object.values(this.materials ?? {}).includes(material as never)) material.dispose();
    });
  }

  private async loadHeroAsset(): Promise<void> {
    try {
      const [{ GLTFLoader }] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js')]);
      if (!this.THREE || !this.scene) return;
      const loader = new GLTFLoader();
      loader.load('/assets/genesis-hf/characters/mpfb-lod0.glb', (gltf) => {
        if (!this.THREE || !this.scene) return;
        const hero = gltf.scene;
        const bounds = new this.THREE.Box3().setFromObject(hero);
        const size = bounds.getSize(new this.THREE.Vector3());
        const center = bounds.getCenter(new this.THREE.Vector3());
        const height = Math.max(0.001, size.y);
        const scale = 1.72 / height;
        hero.scale.setScalar(scale);
        hero.position.y = -bounds.min.y * scale;
        hero.position.x = -center.x * scale;
        hero.position.z = -center.z * scale;
        hero.traverse((node) => {
          const mesh = node as THREE_NS.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          // Tylko istniejący materiał ubrania otrzymuje język epidemiologiczny.
          if (!this.heroEpidemicMaterial && /casualsuit|clothes|shirt|dress/i.test(mesh.name)) {
            const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
            if (source && 'color' in source) {
              const tinted = (source as THREE_NS.MeshStandardMaterial).clone();
              mesh.material = tinted;
              this.heroEpidemicMaterial = tinted;
            }
          }
        });
        const heroRoot = new this.THREE.Group();
        heroRoot.name = 'hf-lod0-real-agent';
        heroRoot.add(hero);
        this.hero = heroRoot;
        this.scene.add(heroRoot);
        if (gltf.animations.length) {
          this.heroMixer = new this.THREE.AnimationMixer(hero);
          this.heroMixer.clipAction(gltf.animations[0]).play();
        }
        this.heroLoaded = true;
      }, undefined, () => { this.heroLoadFailed = true; });
    } catch {
      this.heroLoadFailed = true;
    }
  }
}

/**
 * LOD2 zachowuje realne pozycje, kierunki i stan epidemiologiczny, ale używa
 * dwóch współdzielonych instanced meshów. To prezentacja zdalnego tłumu, nie
 * drugi system postaci ani demografia zastępcza.
 */
class HighFidelityCrowd {
  private static readonly healthKeys: readonly AgentHealthState[] = ['S', 'E', 'I', 'R', 'D', 'unknown'];
  readonly bodies = new Map<AgentHealthState, THREE_NS.InstancedMesh>();
  readonly head: THREE_NS.InstancedMesh;
  readonly glow: THREE_NS.InstancedMesh;
  private readonly matrix: THREE_NS.Matrix4;
  private readonly position: THREE_NS.Vector3;
  private readonly scale: THREE_NS.Vector3;
  private readonly rotation: THREE_NS.Quaternion;
  private readonly axis: THREE_NS.Vector3;
  count = 0;

  constructor(private readonly THREE: typeof THREE_NS, readonly capacity: number) {
    const bodyGeometry = new THREE.CapsuleGeometry(0.17, 0.62, 8, 12);
    for (const health of HighFidelityCrowd.healthKeys) {
      const color = new THREE.Color(HEALTH_COLORS[health]).lerp(new THREE.Color(0x64707a), 0.34);
      const material = new THREE.MeshBasicMaterial({ color });
      const body = new THREE.InstancedMesh(bodyGeometry, material, capacity);
      body.name = `hf-lod2-clothes-${health}`;
      this.bodies.set(health, body);
    }
    this.head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.145, 14, 12), new THREE.MeshBasicMaterial({ color: 0xd6a27c }), capacity);
    this.glow = new THREE.InstancedMesh(new THREE.RingGeometry(0.24, 0.29, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.16, depthWrite: false }), capacity);
    this.glow.rotation.x = -Math.PI / 2;
    this.matrix = new THREE.Matrix4(); this.position = new THREE.Vector3(); this.scale = new THREE.Vector3(1, 1, 1); this.rotation = new THREE.Quaternion(); this.axis = new THREE.Vector3(0, 1, 0);
    this.head.name = 'hf-lod2-heads'; this.glow.name = 'hf-lod2-epidemiology';
  }

  addTo(scene: THREE_NS.Scene): void { scene.add(...this.bodies.values(), this.head, this.glow); }

  update(states: readonly HumanoidAgentState[], time: number): void {
    this.count = Math.min(states.length, this.capacity);
    const cursors = new Map<AgentHealthState, number>(HighFidelityCrowd.healthKeys.map((health) => [health, 0]));
    for (let index = 0; index < this.count; index++) {
      const state = states[index];
      const health = state.health;
      const bodyIndex = cursors.get(health) ?? 0;
      cursors.set(health, bodyIndex + 1);
      const pulse = health === 'I' ? 1 + Math.sin(time * 3.1) * 0.035 : 1;
      this.rotation.setFromAxisAngle(this.axis, state.facing);
      this.position.set(state.worldX, 0.62, state.worldZ); this.scale.setScalar(1); this.matrix.compose(this.position, this.rotation, this.scale); this.bodies.get(health)!.setMatrixAt(bodyIndex, this.matrix);
      this.position.set(state.worldX, 1.31, state.worldZ); this.matrix.compose(this.position, this.rotation, this.scale); this.head.setMatrixAt(index, this.matrix);
      this.position.set(state.worldX, 0.075, state.worldZ); this.scale.setScalar(pulse); this.matrix.compose(this.position, this.rotation, this.scale); this.glow.setMatrixAt(index, this.matrix); this.glow.setColorAt(index, new this.THREE.Color(HEALTH_COLORS[health]));
    }
    for (const [health, body] of this.bodies) { body.count = cursors.get(health) ?? 0; body.instanceMatrix.needsUpdate = true; }
    for (const mesh of [this.head, this.glow]) { mesh.count = this.count; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  }

  dispose(): void {
    for (const body of this.bodies.values()) { body.geometry.dispose(); const material = body.material; if (!Array.isArray(material)) material.dispose(); }
    for (const mesh of [this.head, this.glow]) { mesh.geometry.dispose(); const material = mesh.material; if (!Array.isArray(material)) material.dispose(); }
  }
}
