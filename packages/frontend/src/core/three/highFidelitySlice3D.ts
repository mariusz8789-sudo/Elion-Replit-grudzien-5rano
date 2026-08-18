import type * as THREE_NS from 'three';
import { EventRegistry, EventStream, ingestTransmissions, type GenesisEvent } from '../events';
import { computeField, heatColor, type AnalysisMode } from '../simulation/analysis';
import { EpidemicCitySimulation, type EpidemicCityParams } from '../simulation/epidemicCity';
import { SimulationClock, type ClockSpeed } from '../simulationClock/clock';
import type { SimAgent, WorldObject } from '../simulation/types';
import type { SimParams } from '../types';
import { HEALTH_COLORS, HumanoidAgentVisual, mapSimAgentToHumanoid, type HumanoidAgentState } from './humanoidAgentVisual';
import type { PostProcessingModules, PostProcessor, Sim3D, ThreeRenderMetrics } from './types';

/** Jeden metr wizualny jest skalowany wyłącznie z odczytywanego modelu CityWorld. */
export const HIGH_FIDELITY_WORLD_SCALE = 0.02;
const HF_ANALYSIS_COLS = 34;
const HF_ANALYSIS_ROWS = 22;
const LOD1_COUNT = 7;
const LOD2_COUNT = 18;
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
  /** PMREM HDRI jest dostępne po walidacji na prawdziwym GPU; sandboxowy WebGL startuje stabilnym PBR baseline’em. */
  private readonly hdriEnabled = false;
  private lod1 = new Map<number, HumanoidAgentVisual>();
  private lod2: HighFidelityCrowd | null = null;
  private analysisMesh: THREE_NS.InstancedMesh | null = null;
  private analysisMaterial: THREE_NS.MeshBasicMaterial | null = null;
  private materials: MaterialBundle | null = null;
  private sceneObjects: THREE_NS.Object3D[] = [];
  private eventMarkers = new Map<string, EventMarker>();
  private followTarget: THREE_NS.Vector3 | null = null;
  private lastTickMs = 0;
  private metrics: ThreeRenderMetrics = { fps: 0, frameMs: 0, renderMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0 };
  private pointerDown: { x: number; y: number } | null = null;
  private pointerDragged = false;

  constructor(params: Partial<EpidemicCityParams> = {}, callbacks: HighFidelitySliceCallbacks = {}) {
    this.simulation = new EpidemicCitySimulation(params);
    this.eventSeed = params.seed;
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
    scene.background = new THREE.Color(0x1e2a3d);
    scene.fog = new THREE.FogExp2(0x243147, 0.026);
    camera.position.set(5.8, 2.8, 8.8);
    camera.lookAt(0, 1.2, 0);

    this.addLighting();
    this.createMaterials();
    this.addStreetSlice();
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
    // HDRI pozostaje zaimplementowane jako opcjonalny krok jakościowy, ale nie jest
    // ładowane w pierwszym kadrze sandboxowego WebGL; podstawą proofu są PBR + światła.
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
    if (this.cameraMode === 'street') return 7.6;
    if (this.cameraMode === 'event') return 3.9;
    return 2.65;
  }

  getOrbitCameraDirection(): THREE_NS.Vector3 | null {
    if (!this.THREE || !this.followTarget) return null;
    if (this.cameraMode === 'street') return new this.THREE.Vector3(1.6, 1.0, 3.2).normalize();
    if (this.cameraMode === 'event') return new this.THREE.Vector3(2.4, 1.05, 2.8).normalize();
    return new this.THREE.Vector3(1.9, 0.75, 2.3).normalize();
  }

  onResize(w: number, h: number): void { this.viewport = { w, h }; }
  onRenderMetrics(metrics: ThreeRenderMetrics): void { this.metrics = metrics; }

  getStats(): Record<string, number> {
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
    const sky = new THREE.HemisphereLight(0xb9c9e0, 0x2c2421, 1.45);
    this.scene!.add(sky);
    const sun = new THREE.DirectionalLight(0xffd0a1, 4.25);
    sun.position.set(-9, 12, 8);
    sun.castShadow = true;
    // 512² utrzymuje czytelne cienie kontaktowe na WebGL/SwiftShader bez kosztu pełnej mapy 2048².
    sun.shadow.mapSize.set(512, 512);
    sun.shadow.camera.left = -8; sun.shadow.camera.right = 8; sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8;
    sun.shadow.bias = -0.00035;
    this.scene!.add(sun);
    const fill = new THREE.DirectionalLight(0x9db7e6, 1.05);
    fill.position.set(7, 4, -6);
    this.scene!.add(fill);
    const warm = new THREE.PointLight(0xffb66e, 8.5, 10, 2);
    warm.position.set(-2.2, 3.3, 1.8);
    this.scene!.add(warm);
  }

  private createMaterials(): void {
    const THREE = this.THREE!;
    this.materials = {
      asphalt: new THREE.MeshStandardMaterial({ color: 0x313943, roughness: 0.87, metalness: 0.04 }),
      concrete: new THREE.MeshStandardMaterial({ color: 0x9da1a2, roughness: 0.82, metalness: 0.02 }),
      brick: new THREE.MeshStandardMaterial({ color: 0x8a5140, roughness: 0.78, metalness: 0.01 }),
    };
    const loader = new THREE.TextureLoader();
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/asphalt/diffuse.jpg', this.materials.asphalt, 'map', true, 5, 2);
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/asphalt/normal.jpg', this.materials.asphalt, 'normalMap', false, 5, 2);
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/asphalt/roughness.jpg', this.materials.asphalt, 'roughnessMap', false, 5, 2);
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/concrete/diffuse.jpg', this.materials.concrete, 'map', true, 4, 2);
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/concrete/normal.jpg', this.materials.concrete, 'normalMap', false, 4, 2);
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/concrete/roughness.jpg', this.materials.concrete, 'roughnessMap', false, 4, 2);
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/brick/diffuse.jpg', this.materials.brick, 'map', true, 3, 2);
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/brick/normal.jpg', this.materials.brick, 'normalMap', false, 3, 2);
    this.loadPbrTexture(loader, '/assets/genesis-hf/pbr/brick/roughness.jpg', this.materials.brick, 'roughnessMap', false, 3, 2);

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
    slot: 'map' | 'normalMap' | 'roughnessMap',
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
    this.addSceneObject(ground);

    const roadWidth = 1.35;
    const walkWidth = 1.12;
    for (const y of this.simulation.streets.h) {
      const z = this.toWorldY(y);
      const road = new THREE.Mesh(new THREE.BoxGeometry(worldW, 0.08, roadWidth), materials.asphalt);
      road.position.set(0, 0.02, z); road.receiveShadow = true; this.addSceneObject(road);
      for (const offset of [-roadWidth / 2 - walkWidth / 2, roadWidth / 2 + walkWidth / 2]) {
        const walk = new THREE.Mesh(new THREE.BoxGeometry(worldW, 0.055, walkWidth), materials.concrete);
        walk.position.set(0, 0.045, z + offset); walk.receiveShadow = true; this.addSceneObject(walk);
      }
      this.addRoadLine(worldW, z, false);
    }
    for (const x of this.simulation.streets.v) {
      const px = this.toWorldX(x);
      const road = new THREE.Mesh(new THREE.BoxGeometry(roadWidth, 0.082, worldH), materials.asphalt);
      road.position.set(px, 0.025, 0); road.receiveShadow = true; this.addSceneObject(road);
      for (const offset of [-roadWidth / 2 - walkWidth / 2, roadWidth / 2 + walkWidth / 2]) {
        const walk = new THREE.Mesh(new THREE.BoxGeometry(walkWidth, 0.058, worldH), materials.concrete);
        walk.position.set(px + offset, 0.048, 0); walk.receiveShadow = true; this.addSceneObject(walk);
      }
      this.addRoadLine(worldH, px, true);
    }

    const anchors = [...this.simulation.objects()].sort((a, b) => this.objectPriority(b) - this.objectPriority(a)).slice(0, 7);
    for (const object of anchors) this.addPbrBuilding(object);
    this.addStreetFurniture();
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

  private objectPriority(object: WorldObject): number {
    return object.kind === 'hospital' ? 6 : object.kind === 'school' ? 5 : object.kind === 'shop' ? 4 : object.kind === 'home' ? 3 : object.kind === 'isolation' ? 2 : 1;
  }

  private addPbrBuilding(object: WorldObject): void {
    const THREE = this.THREE!;
    const width = Math.max(2.3, object.w * HIGH_FIDELITY_WORLD_SCALE);
    const depth = Math.max(2.2, object.h * HIGH_FIDELITY_WORLD_SCALE);
    const height = object.kind === 'hospital' ? 5.3 : object.kind === 'school' ? 4.6 : object.kind === 'shop' ? 3.7 : 3.25;
    const group = new THREE.Group();
    group.name = `hf-${object.kind}-${object.x}-${object.y}`;
    group.position.set(this.toWorldX(object.x + object.w / 2), 0, this.toWorldY(object.y + object.h / 2));
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), this.materials!.brick);
    body.position.y = height / 2; body.castShadow = true; body.receiveShadow = true;
    group.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(width * 1.04, 0.22, depth * 1.05), new THREE.MeshStandardMaterial({ color: 0x313943, roughness: 0.63, metalness: 0.18 }));
    roof.position.y = height + 0.11; roof.castShadow = true; group.add(roof);
    const glass = new THREE.MeshStandardMaterial({ color: 0x6888a3, emissive: 0x496d89, emissiveIntensity: 0.42, roughness: 0.19, metalness: 0.24 });
    const cols = Math.max(2, Math.floor(width / 1.2));
    const rows = Math.max(1, Math.floor(height / 1.28));
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const window = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.72, width / (cols + 1.2)), 0.66, 0.045), glass);
      window.position.set(-width / 2 + (col + 1) * width / (cols + 1), 0.85 + row * 1.18, depth / 2 + 0.026);
      group.add(window);
    }
    const entryColor = object.kind === 'hospital' ? 0xd85d5d : object.kind === 'school' ? 0x56afcf : object.kind === 'shop' ? 0xd49a57 : 0x33495b;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.75, 0.07), new THREE.MeshStandardMaterial({ color: entryColor, roughness: 0.44, metalness: 0.19 }));
    door.position.set(0, 0.875, depth / 2 + 0.05); group.add(door);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(Math.min(2.3, width * 0.5), 0.32, 0.075), new THREE.MeshStandardMaterial({ color: entryColor, emissive: entryColor, emissiveIntensity: 0.34, roughness: 0.45 }));
    sign.position.set(0, Math.min(height - 0.44, 2.45), depth / 2 + 0.08); group.add(sign);
    if (object.closed) {
      const closed = new THREE.Mesh(new THREE.BoxGeometry(width * 0.75, 0.18, 0.09), new THREE.MeshBasicMaterial({ color: 0xffbd54 }));
      closed.position.set(0, height + 0.42, depth / 2 + 0.11); group.add(closed);
    }
    group.userData.hfBuilding = true;
    this.addSceneObject(group);
  }

  private addStreetFurniture(): void {
    const THREE = this.THREE!;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2d3640, roughness: 0.49, metalness: 0.71 });
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffcf90, emissive: 0xff9c48, emissiveIntensity: 1.5, roughness: 0.36 });
    for (const x of [-6.2, -2.8, 0.8, 4.2, 7.1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 2.75, 10), poleMat);
      pole.position.set(x, 1.38, -1.8); pole.castShadow = true; this.addSceneObject(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), bulbMat);
      lamp.position.set(x, 2.72, -1.8); this.addSceneObject(lamp);
    }
    const treeMaterial = new THREE.MeshStandardMaterial({ color: 0x31594a, roughness: 0.92 });
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x513a2b, roughness: 0.96 });
    for (const [x, z, s] of [[-7.1, 2.7, 1.2], [-5.8, 3.6, 0.95], [6.4, 3.1, 1.15], [7.4, -0.9, 0.8]] as const) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.10 * s, 0.14 * s, 1.7 * s, 10), trunkMaterial);
      trunk.position.y = 0.85 * s; trunk.castShadow = true; tree.add(trunk);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.77 * s, 2), treeMaterial);
      crown.position.y = 2.0 * s; crown.castShadow = true; tree.add(crown);
      tree.position.set(x, 0, z); this.addSceneObject(tree);
    }
  }

  private addAnalysisLayer(): void {
    const THREE = this.THREE!;
    this.analysisMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide });
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
        visual.root.scale.setScalar(1.83);
        // Cień skinned LOD0 jest dowodem bliskiego realizmu; LOD1 pozostaje czytelny,
        // lecz nie multiplikuje kosztu mapy cieni w software WebGL.
        visual.root.traverse((node) => { const mesh = node as THREE_NS.Mesh; if (mesh.isMesh) mesh.castShadow = false; });
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
    if (this.cameraMode === 'agent') {
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
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xff7272, transparent: true, opacity: 0.82, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.05, 10, 32), ringMaterial);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.16; group.add(ring);
    const pulse = new THREE.PointLight(0xff5c5c, 9, 4, 2);
    pulse.position.y = 0.48; group.add(pulse);
    group.position.set(this.toWorldX(event.location.x), 0, this.toWorldY(event.location.y));
    this.scene.add(group);
    this.eventMarkers.set(event.id, { group, born: this.timeSeconds, event });
  }

  private syncEventMarkers(): void {
    for (const [id, marker] of [...this.eventMarkers]) {
      const age = this.timeSeconds - marker.born;
      const ring = marker.group.children.find((node) => (node as THREE_NS.Mesh).isMesh) as THREE_NS.Mesh | undefined;
      if (ring) ring.scale.setScalar(1 + Math.max(0, age) * 0.22);
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
    const y = this.cameraMode === 'agent' ? 1.32 : this.cameraMode === 'street' ? 0.88 : 0.72;
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
  readonly body: THREE_NS.InstancedMesh;
  readonly head: THREE_NS.InstancedMesh;
  readonly glow: THREE_NS.InstancedMesh;
  private readonly matrix: THREE_NS.Matrix4;
  private readonly position: THREE_NS.Vector3;
  private readonly scale: THREE_NS.Vector3;
  private readonly rotation: THREE_NS.Quaternion;
  private readonly axis: THREE_NS.Vector3;
  count = 0;

  constructor(private readonly THREE: typeof THREE_NS, readonly capacity: number) {
    const clothes = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.63, metalness: 0.03 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd6a27c, vertexColors: true, roughness: 0.72, metalness: 0 });
    this.body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.24, 0.72, 8, 12), clothes, capacity);
    this.head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.19, 14, 12), skin, capacity);
    this.glow = new THREE.InstancedMesh(new THREE.RingGeometry(0.31, 0.37, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false }), capacity);
    this.glow.rotation.x = -Math.PI / 2;
    this.matrix = new THREE.Matrix4(); this.position = new THREE.Vector3(); this.scale = new THREE.Vector3(1, 1, 1); this.rotation = new THREE.Quaternion(); this.axis = new THREE.Vector3(0, 1, 0);
    this.body.name = 'hf-lod2-bodies'; this.head.name = 'hf-lod2-heads'; this.glow.name = 'hf-lod2-epidemiology';
  }

  addTo(scene: THREE_NS.Scene): void { scene.add(this.body, this.head, this.glow); }

  update(states: readonly HumanoidAgentState[], time: number): void {
    this.count = Math.min(states.length, this.capacity);
    for (let index = 0; index < this.count; index++) {
      const state = states[index];
      const color = new this.THREE.Color(HEALTH_COLORS[state.health]);
      const pulse = state.health === 'I' ? 1 + Math.sin(time * 3.1) * 0.06 : 1;
      this.rotation.setFromAxisAngle(this.axis, state.facing);
      this.position.set(state.worldX, 0.84, state.worldZ); this.scale.setScalar(1); this.matrix.compose(this.position, this.rotation, this.scale); this.body.setMatrixAt(index, this.matrix); this.body.setColorAt(index, color);
      this.position.set(state.worldX, 1.54, state.worldZ); this.matrix.compose(this.position, this.rotation, this.scale); this.head.setMatrixAt(index, this.matrix); this.head.setColorAt(index, new this.THREE.Color(0xd6a27c));
      this.position.set(state.worldX, 0.075, state.worldZ); this.scale.setScalar(pulse); this.matrix.compose(this.position, this.rotation, this.scale); this.glow.setMatrixAt(index, this.matrix); this.glow.setColorAt(index, color);
    }
    for (const mesh of [this.body, this.head, this.glow]) { mesh.count = this.count; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  }

  dispose(): void {
    for (const mesh of [this.body, this.head, this.glow]) { mesh.geometry.dispose(); const material = mesh.material; if (!Array.isArray(material)) material.dispose(); }
  }
}
