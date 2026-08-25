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
import { approvedWorldAssetCount, isWorldAssetApproved, isWorldAssetPathApproved, unverifiedWorldAssetCount } from './assetGovernance';

/**
 * Wysokość kamery ulicznej. Ponad najwyższą koroną (4,91 jednostki ≈ 9,8 m),
 * więc szpaler przestaje dzielić kadr — ale wciąż na tyle nisko, żeby to była
 * ulica, a nie widok dzielnicy.
 */
const HF_STREET_EYE_HEIGHT = 6.2;

/**
 * Środek największej wolnej przerwy między przeszkodami na odcinku [from, to].
 * Używane przez kamerę uliczną, żeby nigdy nie stanąć tuż za pniem.
 */
function largestGapCentre(obstacles: readonly number[], from: number, to: number): number {
  const marks = [from, ...obstacles.filter((x) => x > from && x < to), to];
  let bestCentre = (from + to) / 2;
  let bestWidth = -1;
  for (let i = 1; i < marks.length; i++) {
    const width = marks[i] - marks[i - 1];
    if (width > bestWidth) { bestWidth = width; bestCentre = (marks[i - 1] + marks[i]) / 2; }
  }
  return bestCentre;
}

/** Jeden metr wizualny jest skalowany wyłącznie z odczytywanego modelu CityWorld. */
export const HIGH_FIDELITY_WORLD_SCALE = 0.02;
const HF_ANALYSIS_COLS = 34;
const HF_ANALYSIS_ROWS = 22;
/** Średni plan — proceduralny rig z chodem: tańszy, animowany, zróżnicowany. */
const LOD1_COUNT = 22;
/**
 * Ilu NAJBLIŻSZYCH agentów dostaje prawdziwą, skinowaną postać glTF zamiast
 * proceduralnej sylwetki. To jest różnica między „ludźmi na ulicy" a
 * „kolorowymi kapsułami": w kadrze ulicznym widz patrzy właśnie na tę grupę.
 * Liczba jest świadomie mała — każdy klon to pełny skinned mesh.
 */
/**
 * Ilu agentów dostaje pełną, skinowaną postać glTF. Świadomie NISKA liczba:
 * hierarchia skali wymaga KILKU szczegółowych ludzi blisko kamery, a nie tłumu
 * bohaterów — przy 10 kadr zamieniał się w galerię tych samych modeli.
 */
const REAL_HUMAN_COUNT = 3;
/**
 * Docelowa wysokość klonowanych ludzi glTF, w tych samych jednostkach co
 * `DETAILED_HUMAN_HEIGHT` (0.86) proceduralnego rigu LOD1 — WCZEŚNIEJ klony
 * celowały w 1.72 (realny metraż), czyli 2x więcej niż reszta sceny używa dla
 * "bliskiego" człowieka. To był główny powód wrażenia "ludzie za duzi".
 */
const REAL_HUMAN_TARGET_HEIGHT = 0.9;
/** Dalszy plan — instancing; to jest większość populacji i ma być mała. */
const LOD2_COUNT = 140;

/**
 * Proporcje sylwetki LOD2, wyprowadzone ze skali świata (1 jednostka = 2 m).
 * Suma bodyLength + 2·bodyRadius + 2·headRadius wynosi dokładnie 0,9 jednostki,
 * czyli 1,8 m — tyle samo, co animowany LOD0. Bez tego tłum i postacie przy
 * kamerze byłyby dwoma różnymi gatunkami w jednej scenie.
 */
const HF_CROWD = {
  bodyRadius: 0.11,
  bodyLength: 0.57,
  headRadius: 0.055,
  /** Środek kapsuły tułowia: połowa jej pełnej wysokości (0,79). */
  bodyCentreY: 0.395,
  /** Głowa siada na tułowiu: 0,79 + promień głowy. */
  headCentreY: 0.845,
} as const;
const EVENT_MARKER_SECONDS = 7;

export type HighFidelityCameraMode = 'city' | 'district' | 'street' | 'hospital' | 'agent' | 'event';

/**
 * Ujęcie komponowane: stała pozycja i cel liczone z granic świata modelu.
 * Kamery miejskie NIE śledzą agenta — śledzenie stawiało obiektyw w losowym
 * miejscu (regularnie przy pniu drzewa) i gubiło kompozycję kadru.
 */
export interface ComposedShot { pos: [number, number, number]; look: [number, number, number] }

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
  /** Nawierzchnia kwartału — osobny materiał, bo ma inną gęstość teksela niż chodnik. */
  ground: THREE_NS.MeshStandardMaterial;
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
  private cameraMode: HighFidelityCameraMode = 'city';
  private analysisMode: AnalysisMode = 'risk';
  private showHeatmap = true;
  private selectedId: number | null = null;
  private latestEvent: HighFidelityEventView | null = null;
  private latestEventTarget: number | null = null;
  private hero: THREE_NS.Group | null = null;
  private heroMixer: THREE_NS.AnimationMixer | null = null;
  /** Surowy glTF postaci trzymany RAZ jako szablon do klonowania tłumu LOD1. */
  private humanTemplate: THREE_NS.Group | null = null;
  private humanTemplateClips: THREE_NS.AnimationClip[] = [];
  private humanTemplateScale = 1;
  private humanTemplateOffsetY = 0;
  private realHumans = new Map<number, { root: THREE_NS.Group; mixer: THREE_NS.AnimationMixer | null; tints: THREE_NS.MeshStandardMaterial[]; hueJitter: number; satJitter: number; lightJitter: number }>();
  private realHumanLoadStarted = false;
  /** Delta ostatniej klatki — miksery animacji muszą dostać realny czas, nie prędkość agenta. */
  private lastFrameDt = 0.016;
  /** Materiał istniejącego ubrania GLB — kolor stanu nie jest nakładaną figurką. */
  private heroEpidemicMaterial: THREE_NS.MeshStandardMaterial | null = null;
  private heroLoaded = false;
  private heroLoadFailed = false;
  /** Realne pozycje pni — podstawa doboru kadru ulicznego. */
  private treeSpots: Array<[number, number]> = [];
  /** Lokalny CC0 HDRI 1K wzmacnia odbicia PBR; błąd ładowania zachowuje stabilny baseline świateł. */
  private readonly hdriEnabled = true;
  private lod1 = new Map<number, HumanoidAgentVisual>();
  private lod2: HighFidelityCrowd | null = null;
  private analysisMesh: THREE_NS.InstancedMesh | null = null;
  private analysisMaterial: THREE_NS.MeshBasicMaterial | null = null;
  private materials: MaterialBundle | null = null;
  /** Elewacje czekające na tekstury — mapy PBR dochodzą po zbudowaniu geometrii. */
  private facadeMaterials: Array<{ mat: THREE_NS.MeshStandardMaterial; kind: string; w: number; h: number }> = [];
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
    if (mode === 'city' || mode === 'district' || mode === 'hospital') {
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
    // Ekspozycja poniżej 1: ACES ma wtedy zapas w światłach zamiast ścinać je
    // do bieli. Razem z obniżonym budżetem świateł to jest właśnie ta zmiana,
    // która przywraca kolor gruntowi i listowiu.
    renderer.toneMappingExposure = 0.86;
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
    this.lastFrameDt = dt;
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

    const shot = this.composedShot();
    if (shot) {
      this.followTarget = null;
      camera.position.lerp(new this.THREE.Vector3(...shot.pos), 0.05);
      camera.lookAt(...shot.look);
    }
  }

  /**
   * SYSTEM KOMPONOWANYCH KAMER.
   *
   * Wszystkie ujęcia miejskie mają stałą, policzoną z granic świata pozycję,
   * więc kadr jest powtarzalny i nigdy nie ląduje w koronie drzewa. Tylko
   * `agent` (diagnostyka) i `event` nadal podążają za obiektem — to jest ich
   * jedyny sens. Zwraca null, gdy tryb ma używać orbity.
   */
  private composedShot(): ComposedShot | null {
    const w = this.simulation.worldWidth * HIGH_FIDELITY_WORLD_SCALE;
    const h = this.simulation.worldHeight * HIGH_FIDELITY_WORLD_SCALE;
    const lane = this.simulation.streets.h.length ? this.toWorldY(this.simulation.streets.h[0]) : 0;

    switch (this.cameraMode) {
      case 'city':
        // GŁÓWNY WIDOK: cały kwartał, lekko podniesiony, bez lotu ptaka.
        return { pos: [w * 0.42, h * 0.62, h * 1.12], look: [0, 1.6, 0] };
      case 'district':
        // Analiza hotspotu — bliżej, wciąż ponad tłumem.
        return { pos: [w * 0.3, h * 0.5, h * 0.95], look: [0, 1.2, 0] };
      case 'street': {
        // KADR ULICZNY: MIASTO JEST BOHATEREM, NIE SZPALER.
        //
        // Dwa realne błędy, które ten kadr psuły, obydwa policzone, nie zgadnięte:
        //
        // 1. Filtr `z > lane` łapał rzędy drzew z WSZYSTKICH trzech ulic
        //    poziomych, nie tylko z tej, przy której stoi kamera — więc „luka"
        //    liczona była na wymieszanym zbiorze i nie odpowiadała rzeczywistości.
        //    Teraz bierzemy wyłącznie rząd przypisany do tego pasa.
        //
        // 2. Korony sięgają 4,91 jednostki (9,8 m). Kamera na wysokości oczu
        //    (1,78) siedziała pod nimi, więc ŻADNE przesunięcie w poziomie nie
        //    mogło jej uwolnić od pni. Kadr idzie ponad koronę i patrzy wzdłuż
        //    ulicy pod kątem — widać jezdnię, oba chodniki, fasady i populację
        //    jako małe sylwetki, a drzewa są poniżej linii wzroku.
        const nearRow = this.treeSpots
          .filter(([, z]) => z > lane && z - lane < 3)
          .map(([x]) => x)
          .sort((a, b) => a - b);
        const gapCentre = largestGapCentre(nearRow, -w / 2, w / 2);
        return {
          pos: [gapCentre - 4.2, HF_STREET_EYE_HEIGHT, lane + 7.2],
          look: [gapCentre + 5.5, 0.9, lane - 1.2],
        };
      }
      case 'hospital': {
        const hospital = this.simulation.objects().find((o) => o.kind === 'hospital');
        if (!hospital) return { pos: [w * 0.3, h * 0.5, h * 0.9], look: [0, 1.2, 0] };
        const hx = this.toWorldX(hospital.x + hospital.w / 2);
        const hz = this.toWorldY(hospital.y + hospital.h / 2);
        return { pos: [hx + 5.2, 3.4, hz + 7.4], look: [hx, 1.6, hz] };
      }
      default:
        return null; // agent / event korzystają z orbity
    }
  }

  getOrbitTarget(): THREE_NS.Vector3 | null { return this.followTarget; }

  getOrbitFocusDistance(): number | null {
    if (!this.followTarget) return null;
    // Trochę dalej niż poprzednio (4.6): mniejsi ludzie + szerszy kadr dają
    // wrażenie skali ulicy, zamiast kilku ludzi wypełniających cały ekran.
    if (this.cameraMode === 'street') return 6.4;
    if (this.cameraMode === 'event') return 5.1;
    return 2.65;
  }

  getOrbitCameraDirection(): THREE_NS.Vector3 | null {
    if (!this.THREE || !this.followTarget) return null;
    if (this.cameraMode === 'street') return new this.THREE.Vector3(1.35, 0.012, 2.6).normalize();
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
      hf_approved_assets: approvedWorldAssetCount(),
      hf_unverified_assets: unverifiedWorldAssetCount(),
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
    this.materials?.ground.dispose();
    this.materials?.brick.dispose();
    for (const object of this.sceneObjects) this.disposeObject(object);
    for (const marker of this.eventMarkers.values()) this.disposeObject(marker.group);
    this.sceneObjects = [];
    this.eventMarkers.clear();
  }

  private addLighting(): void {
    const THREE = this.THREE!;
    // BUDŻET ŚWIATŁA — scena była prześwietlona i to, a nie geometria, dawało
    // efekt „plastiku": grunt wychodził prawie biały, ciemnozielone listowie
    // (HSL lightness 0.22–0.35) renderowało się jako neonowa żółć, a tło jako
    // szara plama. Three.js v0.170 używa fizycznych jednostek światła, więc
    // słońce 4.2 + hemisfera 0.85 + fill 0.5 + IBL z HDRI wypychało całą krzywą
    // tonalną w biel, zanim jeszcze zadziałała ekspozycja 1.18.
    //
    // Sumaryczny budżet jest tu obniżony ok. 2×, żeby krzywa miała zapas i
    // materiały odzyskały własny kolor. Kierunek i barwa świateł zostają —
    // zmienia się natężenie, nie zamysł.
    const sky = new THREE.HemisphereLight(0xbcd4ee, 0x6b5a44, 0.42);
    this.scene!.add(sky);
    // GOLDEN HOUR: słońce nisko nad horyzontem daje długie, kierunkowe cienie
    // i ciepłe zamodelowanie brył. Wysokie, białe światło spłaszczało kwartał.
    const sun = new THREE.DirectionalLight(0xffd9a0, 2.15);
    sun.position.set(-16, 7.5, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -16; sun.shadow.camera.right = 16; sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -16;
    sun.shadow.bias = -0.00022;
    sun.shadow.normalBias = 0.018;
    this.scene!.add(sun);
    const fill = new THREE.DirectionalLight(0x9fc0e0, 0.26);
    fill.position.set(10, 6, -9);
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
      // Podłoże kwartału: ta sama zweryfikowana tekstura betonu co chodnik, ale
      // dużo ciemniejsza i o innym rozstawie teksela. Bez własnego materiału
      // grunt był jednolitą płaszczyzną, którą HDRI i mgła malowały na beż.
      ground: new THREE.MeshStandardMaterial({ color: 0x4a4d4b, roughness: 0.95, metalness: 0.01, aoMapIntensity: 0.5 }),
      brick: new THREE.MeshStandardMaterial({ color: 0x8a5140, roughness: 0.78, metalness: 0.01, aoMapIntensity: 0.68 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x7190a3, roughness: 0.18, metalness: 0.22, transparent: true, opacity: 0.58 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x3d4850, roughness: 0.38, metalness: 0.82 }),
      markings: new THREE.MeshStandardMaterial({ color: 0xe7e2d2, roughness: 0.54, metalness: 0.02 }),
    };
    const loader = new THREE.TextureLoader();
    // GOVERNED PBR — wyłącznie zestawy z potwierdzonym źródłem, licencją CC0 i
    // policzonym skrótem SHA-256 (patrz assetGovernance.ts). Poprzednie ścieżki
    // /assets/genesis-hf/pbr/ nie mają rekordu licencji i są w manifeście
    // UNVERIFIED, więc bramka i tak by ich nie wpuściła.
    //
    // Poly Haven pakuje ARM w jeden plik: R=ambient occlusion, G=roughness,
    // B=metalness. Three.js czyta aoMap z kanału R i roughnessMap z G, więc ten
    // sam obraz podpięty pod oba sloty jest poprawnym użyciem, nie skrótem.
    this.loadPbrTexture(loader, '/assets/genesis-governed-pbr/asphalt-track/diffuse.jpg', this.materials.asphalt, 'map', true, 5, 2);
    this.loadPbrTexture(loader, '/assets/genesis-governed-pbr/asphalt-track/normal.jpg', this.materials.asphalt, 'normalMap', false, 5, 2);
    this.loadPbrTexture(loader, '/assets/genesis-governed-pbr/asphalt-track/arm.jpg', this.materials.asphalt, 'roughnessMap', false, 5, 2);
    this.loadPbrTexture(loader, '/assets/genesis-governed-pbr/asphalt-track/arm.jpg', this.materials.asphalt, 'aoMap', false, 5, 2);
    this.loadPbrTexture(loader, '/assets/genesis-governed-pbr/concrete-floor-01/diffuse.jpg', this.materials.concrete, 'map', true, 4, 2);
    this.loadPbrTexture(loader, '/assets/genesis-governed-pbr/concrete-floor-01/normal.jpg', this.materials.concrete, 'normalMap', false, 4, 2);
    this.loadPbrTexture(loader, '/assets/genesis-governed-pbr/concrete-floor-01/arm.jpg', this.materials.concrete, 'roughnessMap', false, 4, 2);
    this.loadPbrTexture(loader, '/assets/genesis-governed-pbr/concrete-floor-01/arm.jpg', this.materials.concrete, 'aoMap', false, 4, 2);
    // Wysoki rozstaw: podłoże jest wielokrotnie większe od chodnika, więc bez
    // zagęszczenia tekstura rozciągnęłaby się w jednolitą plamę.
    this.loadPbrTexture(loader, '/assets/genesis-governed-pbr/concrete-floor-01/diffuse.jpg', this.materials.ground, 'map', true, 50, 34);
    this.loadPbrTexture(loader, '/assets/genesis-governed-pbr/concrete-floor-01/normal.jpg', this.materials.ground, 'normalMap', false, 50, 34);
    this.loadPbrTexture(loader, '/assets/genesis-governed-pbr/concrete-floor-01/arm.jpg', this.materials.ground, 'roughnessMap', false, 50, 34);
    this.loadPbrTexture(loader, '/assets/genesis-governed-pbr/brick-wall-10/diffuse.jpg', this.materials.brick, 'map', true, 3, 2);
    this.loadPbrTexture(loader, '/assets/genesis-governed-pbr/brick-wall-10/normal.jpg', this.materials.brick, 'normalMap', false, 3, 2);
    this.loadPbrTexture(loader, '/assets/genesis-governed-pbr/brick-wall-10/arm.jpg', this.materials.brick, 'roughnessMap', false, 3, 2);
    this.loadPbrTexture(loader, '/assets/genesis-governed-pbr/brick-wall-10/arm.jpg', this.materials.brick, 'aoMap', false, 3, 2);
  }

  /** HDRI jest CC0 assetem środowiska; nie jest mapą świata ani źródłem danych modelu. */
  private async loadHdri(renderer: THREE_NS.WebGLRenderer): Promise<void> {
    const hdriPath = '/assets/genesis-hf/hdr/braustuble_alley_1k.hdr';
    if (!isWorldAssetApproved(hdriPath)) return;
    try {
      const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js');
      if (!this.THREE || !this.scene) return;
      const pmrem = new this.THREE.PMREMGenerator(renderer);
      new RGBELoader().load(hdriPath, (texture) => {
        if (!this.scene) { texture.dispose(); pmrem.dispose(); return; }
        const environment = pmrem.fromEquirectangular(texture).texture;
        this.scene.environment = environment;
        // IBL dokłada się do KAŻDEGO materiału PBR, więc przy pełnej sile
        // sumuje się ze światłami kierunkowymi i to on dopychał scenę w biel.
        this.scene.environmentIntensity = 0.55;
        // TŁO ze środowiska HDRI zamiast płaskiego jasnego koloru. Bez tego
        // kwartał "unosił się" na białym prześwietlonym niebie i cała scena
        // czytała się jak makieta na stole, mimo poprawnych materiałów PBR.
        this.scene.background = environment;
        this.scene.backgroundBlurriness = 0.42;
        // Tło musi mieć tę samą jasność co oświetlenie ze środowiska, inaczej
        // horyzont świeci mocniej niż oświetlona scena i wypłukuje jej górę.
        this.scene.backgroundIntensity = 0.6;
        // Mgła dociągnięta do realnego tła, żeby horyzont nie odcinał się kantem.
        // Mgła przy 0.0105 dawała ok. 6% przesłony na krańcu kwartału, czyli
        // praktycznie nic — nie ona rozjaśniała grunt (winna była jednolita
        // płaszczyzna bez tekstury). Teraz ma realne zadanie: wygasić daleką
        // krawędź płyty. Barwa zestrojona z przyciemnionym tłem HDRI.
        if (this.THREE) this.scene.fog = new this.THREE.FogExp2(0x6b6358, 0.024);
        texture.dispose();
        pmrem.dispose();
      }, undefined, () => pmrem.dispose());
    } catch {
      // PBR materiały i fizyczne oświetlenie są nadal pełnym fallbackiem bez HDRI.
    }
  }

  /**
   * MATERIAŁ ELEWACJI O STAŁEJ GĘSTOŚCI TEKSELI.
   *
   * Dotąd wszystkie budynki współdzieliły JEDEN materiał ze stałym
   * `texture.repeat` (np. 3x2). BoxGeometry ma UV 0..1 na ścianę, więc ten sam
   * repeat rozciągał cegłę na całą elewację niezależnie od jej rozmiaru —
   * 10-jednostkowa ściana dostawała cegły ~6 m szerokości. To jest powód, dla
   * którego budynki czytały się jak gładkie pudełka MIMO wczytanych map PBR.
   */
  private facadeMaterial(kind: string, w: number, h: number): THREE_NS.MeshStandardMaterial {
    const THREE = this.THREE!;
    const base = kind === 'home' ? this.materials!.brick : this.materials!.concrete;
    const mat = base.clone();
    const slots: Array<'map' | 'normalMap' | 'roughnessMap' | 'aoMap'> = ['map', 'normalMap', 'roughnessMap', 'aoMap'];
    for (const slot of slots) {
      const src = base[slot] as THREE_NS.Texture | null;
      if (!src) continue;
      const tex = src.clone();
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
      tex.needsUpdate = true;
      mat[slot] = tex as never;
    }
    mat.needsUpdate = true;
    this.facadeMaterials.push({ mat, kind, w, h });
    return mat;
  }

  /**
   * Ponowne nałożenie map po asynchronicznym dojściu tekstur. Geometria powstaje
   * natychmiast, a mapy PBR dopiero po pobraniu — klon zrobiony za wcześnie
   * kopiowałby pusty slot i budynek zostawał gładki.
   */
  private refreshFacadeTextures(): void {
    const THREE = this.THREE;
    if (!THREE || !this.materials) return;
    const slots: Array<'map' | 'normalMap' | 'roughnessMap' | 'aoMap'> = ['map', 'normalMap', 'roughnessMap', 'aoMap'];
    for (const entry of this.facadeMaterials) {
      const base = entry.kind === 'home' ? this.materials.brick : this.materials.concrete;
      for (const slot of slots) {
        const src = base[slot] as THREE_NS.Texture | null;
        if (!src || entry.mat[slot]) continue;
        const tex = src.clone();
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(Math.max(1, Math.round(entry.w)), Math.max(1, Math.round(entry.h)));
        tex.needsUpdate = true;
        entry.mat[slot] = tex as never;
        entry.mat.needsUpdate = true;
      }
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
    // Bramka prowenancji: plik bez potwierdzonego źródła i licencji nie wchodzi
    // do sceny. Materiał zostaje wtedy przy swoim kolorze bazowym — brak
    // tekstury jest widoczny, a nie zastąpiony czymś nieudokumentowanym.
    if (!isWorldAssetPathApproved(path)) return;
    const THREE = this.THREE!;
    loader.load(path, (texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
      material[slot] = texture as never;
      material.needsUpdate = true;
      this.refreshFacadeTextures();
    }, undefined, () => undefined);
  }

  private addStreetSlice(): void {
    const THREE = this.THREE!;
    const materials = this.materials!;
    const worldW = this.simulation.worldWidth * HIGH_FIDELITY_WORLD_SCALE;
    const worldH = this.simulation.worldHeight * HIGH_FIDELITY_WORLD_SCALE;
    // PODŁOŻE — ograniczone, nie nieskończone. Wcześniej płaszczyzna miała 9×
    // rozmiar świata, więc większość kadru stanowił grunt rozpuszczony we mgle:
    // stąd wrażenie pustej, jasnobeżowej płyty. Teraz jest to nawierzchnia
    // kwartału o skończonym zasięgu i z realną teksturą.
    // Zasięg 2.6× odsłaniał krawędź płyty w kadrze. 5× z proporcjonalnie
    // gęstszą teksturą i mgłą, która wygasza dal — płyta nie kończy się szwem,
    // tylko rozpływa. Nie jest to przykrycie problemu: gęstość teksela zostaje
    // stała (ok. 3,6 m na kafel), więc podłoże nadal jest materiałem, nie plamą.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(worldW * 5, worldH * 5), materials.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.enableAo(ground);
    this.addSceneObject(ground);

    const roadWidth = 1.35;
    const walkWidth = 1.12;
    // Zasięg skrzyżowania: jezdnia plus chodnik ulicy poprzecznej. Do tego
    // miejsca dobiega chodnik ulicy równoległej i tam się kończy.
    const crossReach = roadWidth / 2 + walkWidth;
    const hLines = this.simulation.streets.h.map((y) => this.toWorldY(y));
    const vLines = this.simulation.streets.v.map((x) => this.toWorldX(x));

    // --- JEZDNIE: pełne przęsła, bez przerw ---
    for (const z of hLines) {
      const road = new THREE.Mesh(new THREE.BoxGeometry(worldW, 0.08, roadWidth), materials.asphalt);
      road.position.set(0, 0.02, z); road.receiveShadow = true; this.enableAo(road); this.addSceneObject(road);
    }
    for (const px of vLines) {
      const road = new THREE.Mesh(new THREE.BoxGeometry(roadWidth, 0.082, worldH), materials.asphalt);
      road.position.set(px, 0.025, 0); road.receiveShadow = true; this.enableAo(road); this.addSceneObject(road);
    }

    // --- SKRZYŻOWANIA: jedna tafla asfaltu ponad obiema jezdniami ---
    // Bez tego pionowa jezdnia leżała nad poziomą i szew był widoczny.
    for (const z of hLines) {
      for (const px of vLines) {
        const patch = new THREE.Mesh(new THREE.BoxGeometry(roadWidth, 0.086, roadWidth), materials.asphalt);
        patch.position.set(px, 0.028, z); patch.receiveShadow = true; this.enableAo(patch); this.addSceneObject(patch);
      }
    }

    // --- CHODNIKI: segmentowane, przerwane na każdym skrzyżowaniu ---
    // To był właściwy powód „pływających kafli": chodnik biegł przez CAŁĄ
    // szerokość świata na wyższym Y niż jezdnia, więc kładł betonowy pas w
    // poprzek każdej jezdni prostopadłej i ciął ją na prostokąty.
    for (const z of hLines) {
      for (const offset of [-roadWidth / 2 - walkWidth / 2, roadWidth / 2 + walkWidth / 2]) {
        for (const [from, to] of this.spanSegments(-worldW / 2, worldW / 2, vLines, crossReach)) {
          const walk = new THREE.Mesh(new THREE.BoxGeometry(to - from, 0.055, walkWidth), materials.concrete);
          walk.position.set((from + to) / 2, 0.045, z + offset);
          walk.receiveShadow = true; this.enableAo(walk); this.addSceneObject(walk);
        }
      }
      this.addRoadLine(worldW, z, false, vLines, crossReach);
    }
    for (const px of vLines) {
      for (const offset of [-roadWidth / 2 - walkWidth / 2, roadWidth / 2 + walkWidth / 2]) {
        for (const [from, to] of this.spanSegments(-worldH / 2, worldH / 2, hLines, crossReach)) {
          const walk = new THREE.Mesh(new THREE.BoxGeometry(walkWidth, 0.058, to - from), materials.concrete);
          walk.position.set(px + offset, 0.048, (from + to) / 2);
          walk.receiveShadow = true; this.enableAo(walk); this.addSceneObject(walk);
        }
      }
      this.addRoadLine(worldH, px, true, hLines, crossReach);
    }

    // --- NAROŻNIKI: domykają chodnik wokół skrzyżowania ---
    // Bez nich w każdym rogu zostawała dziura, przez którą było widać podłoże.
    for (const z of hLines) {
      for (const px of vLines) {
        for (const dx of [-1, 1]) {
          for (const dz of [-1, 1]) {
            const corner = new THREE.Mesh(new THREE.BoxGeometry(walkWidth, 0.055, walkWidth), materials.concrete);
            corner.position.set(px + dx * (roadWidth / 2 + walkWidth / 2), 0.046, z + dz * (roadWidth / 2 + walkWidth / 2));
            corner.receiveShadow = true; this.enableAo(corner); this.addSceneObject(corner);
          }
        }
      }
    }

    this.addModelBuildings();
    this.addStreetTrees();
    this.addTraffic();
    this.addBackgroundCity();
    this.addUrbanStreetDetails();
  }

  /**
   * BUDYNKI Z MODELU — kwartał dotąd renderował płaską płytę i JEDEN prop
   * fasady, mimo że `simulation.objects()` zwraca prawdziwe budynki świata
   * (sklep, szkoła, szpital, izolacja, park + siatka domów) wraz z ich
   * pozycją, rozmiarem i stanem `closed`. To był brak konsumpcji istniejących
   * danych, nie brak assetów — scena wyglądała jak rekwizyty na płycie.
   *
   * Renderer pozostaje READ-ONLY: nie tworzy budynków, nie zmienia layoutu,
   * tylko wystawia to, co model już opisuje. Wysokość jest funkcją rodzaju
   * (prezentacja), a nie wymyśloną daną naukową.
   */
  private addModelBuildings(): void {
    const THREE = this.THREE!;
    const materials = this.materials!;
    const scale = HIGH_FIDELITY_WORLD_SCALE;

    // Wysokość kondygnacji wg funkcji budynku — czysta warstwa prezentacji.
    const storeys: Record<string, number> = {
      home: 2, shop: 1, school: 3, hospital: 4, isolation: 2, park: 0,
    };
    const STOREY = 1.5;

    for (const obj of this.simulation.objects()) {
      const w = obj.w * scale;
      const d = obj.h * scale;
      const cx = this.toWorldX(obj.x + obj.w / 2);
      const cz = this.toWorldY(obj.y + obj.h / 2);

      if (obj.kind === 'park') {
        this.addPark(cx, cz, w, d);
        continue;
      }

      const levels = storeys[obj.kind] ?? 2;
      const height = Math.max(STOREY, levels * STOREY);
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(w, height, d),
        this.facadeMaterial(obj.kind, Math.max(w, d), height),
      );
      body.position.set(cx, height / 2, cz);
      body.castShadow = true;
      body.receiveShadow = true;
      this.enableAo(body);
      this.addSceneObject(body);

      // Gzyms/dach — bez niego bryły czytają się jak pudełka.
      const capGeo = new THREE.BoxGeometry(w * 1.04, 0.08, d * 1.04);
      const cap = new THREE.Mesh(capGeo, materials.metal);
      cap.position.set(cx, height + 0.04, cz);
      cap.castShadow = true;
      this.addSceneObject(cap);

      this.addRetailBase(cx, cz, w, d, obj.kind);
      this.addFacadeDetail(cx, cz, w, d, height, levels, obj.kind, Boolean(obj.closed));
      if (obj.label) this.addBuildingSign(cx, cz, w, d, obj.label, obj.kind);
    }
  }

  /**
   * PARTER USŁUGOWY — ciemniejsza, przeszklona baza pod elewacją. Bez niej
   * budynki stały "wprost z asfaltu" i czytały się jak wyciągnięte prostopadłościany.
   */
  private addRetailBase(cx: number, cz: number, w: number, d: number, kind: string): void {
    const THREE = this.THREE!;
    if (kind === 'home') return;
    const h = 1.45;
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.01, h, d * 1.01),
      new THREE.MeshStandardMaterial({ color: 0x2c2f35, roughness: 0.35, metalness: 0.15 }),
    );
    base.position.set(cx, h / 2, cz);
    base.castShadow = true; base.receiveShadow = true;
    this.addSceneObject(base);
    // Witryna: ciepłe światło wnętrza widoczne z ulicy.
    for (const sz of [d / 2 + 0.012, -d / 2 - 0.012]) {
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.82, h * 0.62),
        new THREE.MeshStandardMaterial({
          color: 0xffdda8, emissive: 0xffc27a, emissiveIntensity: 0.75,
          roughness: 0.15, metalness: 0.1,
        }),
      );
      glass.position.set(cx, h * 0.55, cz + sz);
      if (sz < 0) glass.rotation.y = Math.PI;
      this.addSceneObject(glass);
    }
  }

  /**
   * SZYLD Z MODELU — `WorldObject.label` ("Sklep", "Szkoła", "Szpital", ...) jest
   * realną daną layoutu i dotąd nie był w ogóle pokazywany w świecie 3D.
   * Renderujemy go jako teksturę canvas, więc widz czyta funkcję budynku
   * bezpośrednio z ulicy, a nie z legendy w panelu.
   */
  private addBuildingSign(cx: number, cz: number, w: number, d: number, label: string, kind: string): void {
    const THREE = this.THREE!;
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = kind === 'hospital' ? '#f2f4f7' : kind === 'school' ? '#1d3a5c' : '#14181d';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = kind === 'hospital' ? '#c8322d' : '#f6e3c0';
    ctx.font = 'bold 68px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label.toUpperCase(), 256, 68);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const signW = Math.min(w * 0.42, 1.25);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(signW, signW * 0.25),
      new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.6 }),
    );
    sign.position.set(cx, 1.78, cz + d / 2 + 0.04);
    this.addSceneObject(sign);
  }

  /**
   * RUCH ULICZNY — samochody, autobus i przystanki jako scenografia kwartału.
   * WAŻNE: to jest warstwa WIZUALNA. Model epidemii nie opisuje pojazdów ani
   * transportu zbiorowego, więc nic tu nie przenosi zakażeń i nic nie jest
   * liczone. Gdy kontrakt modelu dostanie transport, te obiekty dostaną dane;
   * do tego czasu są jawnie oznaczone jako scenografia.
   */
  private addTraffic(): void {
    const THREE = this.THREE!;
    const worldW = this.simulation.worldWidth * HIGH_FIDELITY_WORLD_SCALE;
    const lanes = this.simulation.streets.h.map((y) => this.toWorldY(y));
    if (!lanes.length) return;

    const carBody = new THREE.BoxGeometry(0.92, 0.3, 0.42);
    const carCab = new THREE.BoxGeometry(0.46, 0.22, 0.4);
    const wheelGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.06, 10);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 });
    const paints = [0x9aa3ad, 0x2b3a4a, 0x8c2f2a, 0xd8d3c8, 0x1d1f24, 0x3f5f4a];

    let slot = 0;
    for (const z of lanes) {
      for (let x = -worldW / 2 + 1.4; x < worldW / 2 - 1; x += 3.1) {
        const hsh = ((slot * 2654435761) >>> 0);
        const r = (n: number) => (((hsh >>> n) & 0xff) / 255);
        slot++;
        if (r(3) < 0.32) continue;
        const dir = r(5) > 0.5 ? 1 : -1;
        const lane = z + dir * 0.34;
        const paint = paints[slot % paints.length];
        const g = new THREE.Group();
        const body = new THREE.Mesh(carBody, new THREE.MeshStandardMaterial({ color: paint, roughness: 0.42, metalness: 0.35 }));
        body.position.y = 0.24; body.castShadow = true; g.add(body);
        const cab = new THREE.Mesh(carCab, new THREE.MeshStandardMaterial({ color: 0x1a2027, roughness: 0.2, metalness: 0.3 }));
        cab.position.set(-0.05, 0.44, 0); cab.castShadow = true; g.add(cab);
        for (const wx of [-0.3, 0.3]) for (const wz of [-0.21, 0.21]) {
          const wheel = new THREE.Mesh(wheelGeo, wheelMat);
          wheel.rotation.x = Math.PI / 2;
          wheel.position.set(wx, 0.085, wz);
          g.add(wheel);
        }
        g.position.set(x + r(11) * 0.6, 0.06, lane);
        g.rotation.y = dir > 0 ? 0 : Math.PI;
        this.addSceneObject(g);
      }
    }

    // Autobus miejski — czytelna sylwetka transportu zbiorowego.
    const bus = new THREE.Group();
    const busBody = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.72, 0.62),
      new THREE.MeshStandardMaterial({ color: 0xd9a02b, roughness: 0.5, metalness: 0.2 }),
    );
    busBody.position.y = 0.52; busBody.castShadow = true; bus.add(busBody);
    const busGlass = new THREE.Mesh(
      new THREE.BoxGeometry(2.45, 0.26, 0.64),
      new THREE.MeshStandardMaterial({ color: 0x22303c, roughness: 0.15, metalness: 0.4 }),
    );
    busGlass.position.y = 0.72; bus.add(busGlass);
    for (const wx of [-0.85, 0.85]) for (const wz of [-0.31, 0.31]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.11, wz);
      bus.add(wheel);
    }
    bus.position.set(-worldW * 0.16, 0.06, lanes[0] - 0.34);
    bus.rotation.y = Math.PI;
    this.addSceneObject(bus);

    // Przystanki przy chodniku.
    for (const [i, z] of lanes.entries()) {
      const stop = new THREE.Group();
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(1.25, 0.05, 0.42),
        new THREE.MeshStandardMaterial({ color: 0x39424c, roughness: 0.5, metalness: 0.45 }),
      );
      roof.position.y = 0.92; roof.castShadow = true; stop.add(roof);
      for (const px of [-0.55, 0.55]) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.025, 0.92, 8),
          new THREE.MeshStandardMaterial({ color: 0x2e353d, roughness: 0.55, metalness: 0.5 }),
        );
        post.position.set(px, 0.46, -0.16); stop.add(post);
      }
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(1.15, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x18202a, emissive: 0x2b3f52, emissiveIntensity: 0.5, roughness: 0.3 }),
      );
      panel.position.set(0, 0.56, -0.2); stop.add(panel);
      stop.position.set(i === 0 ? -2.6 : 3.1, 0.06, z + 1.5);
      this.addSceneObject(stop);
    }
  }

  /** Szpaler drzew wzdłuż chodników — instancing, jeden draw call na całą ulicę. */
  /**
   * DRZEWO PROCEDURALNE — pień ze zbieżnością, rozwidlone konary i WARSTWOWA
   * korona z kilku brył. Zastępuje pojedynczy ikosaedr ("zielona kula na
   * patyku"), najbardziej rzucający się w oczy element proceduralny w kadrze.
   * Wariant deterministyczny (seed), więc świat jest powtarzalny.
   */
  private buildTree(seed: number): THREE_NS.Group {
    const THREE = this.THREE!;
    const hs = ((seed * 2654435761) >>> 0);
    const r01 = (n: number) => (((hs >>> (n % 24)) & 0xff) / 255);

    const group = new THREE.Group();
    const height = 2.6 + r01(0) * 1.9;
    const bark = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.075, 0.3 + r01(3) * 0.14, 0.085 + r01(5) * 0.045),
      roughness: 0.94,
    });
    // Listowie: ciemniejsze i mniej nasycone niż wcześniej. Przy flatShadingu
    // górne ścianki łapią pełne słońce, więc jasna baza wychodziła neonem
    // nawet po skorygowaniu ekspozycji — kolor bazowy musi mieć zapas w dół.
    const leaf = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.245 + r01(6) * 0.055, 0.26 + r01(9) * 0.16, 0.13 + r01(12) * 0.075),
      roughness: 0.92,
      flatShading: true,
    });

    // Drzewo ULICZNE ma wysoki, czysty pień i koronę zaczynającą się ponad
    // parterem — inaczej zasłania witryny i całą fasadę.
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(height * 0.026, height * 0.05, height * 0.74, 7), bark);
    trunk.position.y = height * 0.37;
    trunk.castShadow = true;
    group.add(trunk);

    const branches = 2 + Math.floor(r01(15) * 3);
    for (let i = 0; i < branches; i++) {
      const a = (i / branches) * Math.PI * 2 + r01(18) * 1.2;
      const len = height * (0.2 + r01(21 + i) * 0.14);
      const br = new THREE.Mesh(new THREE.CylinderGeometry(height * 0.012, height * 0.022, len, 5), bark);
      br.position.set(Math.cos(a) * height * 0.075, height * 0.6 + i * height * 0.045, Math.sin(a) * height * 0.075);
      br.rotation.z = Math.cos(a) * 0.55;
      br.rotation.x = Math.sin(a) * 0.55;
      br.castShadow = true;
      group.add(br);
    }

    // Korona: WIĘCEJ i MNIEJSZYCH brył zamiast kilku wielkich kul. Poprzednio
    // 3–5 icosahedronów o promieniu do 0.24·h dawało koronę ~7 m szerokości
    // przy 5–9 m wysokości — kształt prawie kulisty, czytany jako „kula na
    // patyku". Drobniejsze bryły w węższym obrysie czytają się jako listowie.
    const blobs = 6 + Math.floor(r01(2) * 4);
    for (let i = 0; i < blobs; i++) {
      const rr = height * (0.082 + r01(4 + i) * 0.05);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, 1), leaf);
      const a = (i / blobs) * Math.PI * 2 + r01(19) * 0.9;
      const spread = height * (0.045 + r01(7 + i) * 0.07);
      crown.position.set(
        Math.cos(a) * spread,
        height * (0.76 + r01(10 + i) * 0.2),
        Math.sin(a) * spread,
      );
      crown.scale.y = 0.72 + r01(16 + i) * 0.3;
      crown.castShadow = true;
      group.add(crown);
    }
    return group;
  }

  /** Szpaler drzew wzdłuż chodników — rzadziej i DALEJ od osi jezdni. */
  private addStreetTrees(): void {
    const worldW = this.simulation.worldWidth * HIGH_FIDELITY_WORLD_SCALE;
    const spots: Array<[number, number]> = [];
    for (const y of this.simulation.streets.h) {
      const z = this.toWorldY(y);
      // Wcześniej szpaler stał dokładnie tam, gdzie ustawia się kamera uliczna,
      // i zasłaniał cały kadr. Rozstaw 5.2, odsunięcie 2.15 od osi jezdni.
      // Rozstaw 5.2 dawał zwarty szpaler po obu stronach każdej jezdni — na
      // kadrze wychodził las zasłaniający kwartał. 8.6 zostawia prześwity,
      // przez które widać architekturę, po którą ta scena w ogóle powstała.
      for (let x = -worldW / 2 + 1.6; x < worldW / 2; x += 8.6) {
        spots.push([x, z + 2.35]);
        spots.push([x + 4.3, z - 2.35]);
      }
    }
    // Kamera uliczna musi wiedzieć, GDZIE stoją pnie, żeby nie stanąć za jednym
    // z nich. Zapisujemy realne pozycje zamiast zgadywać je drugi raz.
    this.treeSpots = spots.map(([x, z]) => [x, z] as [number, number]);
    spots.forEach(([x, z], i) => {
      const tree = this.buildTree(i + 7);
      tree.position.set(x, 0.06, z);
      tree.rotation.y = ((i * 97) % 360) * Math.PI / 180;
      this.addSceneObject(tree);
    });
  }

  /**
   * DETAL ELEWACJI — podniesienie poziomu renderingu z "pudełko + płaska plama
   * okna" do realnej architektury: wnęki okienne z ościeżem, parapety, nadproża,
   * podziały międzykondygnacyjne i gzyms wieńczący.
   *
   * Wszystko powtarzalne idzie przez InstancedMesh, więc cały detal jednego
   * budynku to kilka draw calli, nie kilkaset.
   */
  private addFacadeDetail(
    cx: number, cz: number, w: number, d: number,
    height: number, levels: number, kind: string, closed: boolean,
  ): void {
    const THREE = this.THREE!;
    if (levels <= 0) return;

    const groundTop = kind === 'home' ? 0.15 : 1.45;   // parter usługowy albo cokół
    const usable = height - groundTop - 0.35;          // pod gzymsem
    if (usable <= 0.6) return;
    const rows = Math.max(1, Math.min(levels, Math.floor(usable / 1.5)));
    const bays = Math.max(2, Math.min(8, Math.floor(w / 1.15)));
    const perFace = rows * bays;
    const total = perFace * 2;

    const WIN_W = 0.62, WIN_H = 0.95, REVEAL = 0.09;

    // Wnęka: ciemny prostopadłościan wpuszczony w lico — daje realny cień okna.
    const reveal = new THREE.InstancedMesh(
      new THREE.BoxGeometry(WIN_W, WIN_H, REVEAL * 2),
      new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.85 }),
      total,
    );
    // Szyba: osobno, żeby stan `closed` gasił światło bez gaszenia ościeża.
    const glass = new THREE.InstancedMesh(
      new THREE.BoxGeometry(WIN_W * 0.86, WIN_H * 0.86, 0.02),
      new THREE.MeshStandardMaterial({
        color: closed ? 0x2b3138 : 0xbcd8e8,
        emissive: closed ? 0x000000 : 0x3d5b6e,
        emissiveIntensity: closed ? 0 : 0.6,
        roughness: 0.16, metalness: 0.25,
      }),
      total,
    );
    // Parapet — wystaje z lica, łapie światło i rzuca cień na elewację.
    const sill = new THREE.InstancedMesh(
      new THREE.BoxGeometry(WIN_W * 1.2, 0.07, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xb9b2a4, roughness: 0.75 }),
      total,
    );
    sill.castShadow = true;
    // Nadproże.
    const lintel = new THREE.InstancedMesh(
      new THREE.BoxGeometry(WIN_W * 1.16, 0.09, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xa89e8d, roughness: 0.8 }),
      total,
    );
    lintel.castShadow = true;

    const m = new THREE.Matrix4();
    const rot = new THREE.Matrix4().makeRotationY(Math.PI);
    let i = 0;
    for (let r = 0; r < rows; r++) {
      const y = groundTop + 0.62 + r * 1.5;
      if (y + WIN_H / 2 > height - 0.4) continue;
      for (let b = 0; b < bays; b++) {
        const ox = -w / 2 + (w / bays) * (b + 0.5);
        for (const face of [1, -1]) {
          const z = cz + face * (d / 2);
          const flip = face < 0;
          const place = (mesh: THREE_NS.InstancedMesh, dy: number, dz: number) => {
            m.makeTranslation(cx + ox, y + dy, z + face * dz);
            if (flip) m.multiply(rot);
            mesh.setMatrixAt(i, m);
          };
          place(reveal, 0, -REVEAL);
          place(glass, 0, -REVEAL * 0.4);
          place(sill, -WIN_H / 2 - 0.05, 0.05);
          place(lintel, WIN_H / 2 + 0.06, 0.03);
          i++;
        }
      }
    }
    for (const mesh of [reveal, glass, sill, lintel]) {
      mesh.count = i;
      mesh.instanceMatrix.needsUpdate = true;
      this.addSceneObject(mesh);
    }

    // Gzyms wieńczący — wyraźny okap zamiast ostrej krawędzi bryły.
    const cornice = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.07, 0.22, d * 1.07),
      new THREE.MeshStandardMaterial({ color: 0x9a9184, roughness: 0.78 }),
    );
    cornice.position.set(cx, height - 0.16, cz);
    cornice.castShadow = true;
    cornice.receiveShadow = true;
    this.addSceneObject(cornice);

    // Pas międzykondygnacyjny nad parterem.
    if (kind !== 'home') {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(w * 1.04, 0.14, d * 1.04),
        new THREE.MeshStandardMaterial({ color: 0x8f8778, roughness: 0.8 }),
      );
      band.position.set(cx, groundTop + 0.05, cz);
      band.castShadow = true;
      this.addSceneObject(band);
    }
  }

  /** Park z modelu: trawa + drzewa (instancing). Pozycja i rozmiar pochodzą z layoutu. */
  private addPark(cx: number, cz: number, w: number, d: number): void {
    const THREE = this.THREE!;
    const grass = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.06, d),
      new THREE.MeshStandardMaterial({ color: 0x3f6b43, roughness: 0.95 }),
    );
    grass.position.set(cx, 0.07, cz);
    grass.receiveShadow = true;
    this.addSceneObject(grass);

    const count = Math.max(3, Math.floor((w * d) / 1.1));
    const trunkGeo = new THREE.CylinderGeometry(0.045, 0.06, 0.42, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 });
    const crownGeo = new THREE.IcosahedronGeometry(0.3, 0);
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x35632f, roughness: 0.85, flatShading: true });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, count);
    crowns.castShadow = true;
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      // Deterministyczne rozmieszczenie — ten sam świat przy tym samym seedzie.
      const h = ((i * 2654435761) >>> 0);
      const fx = (((h >>> 3) & 0xff) / 255 - 0.5) * (w - 0.5);
      const fz = (((h >>> 13) & 0xff) / 255 - 0.5) * (d - 0.5);
      const sc = 0.8 + ((h >>> 21) & 0xff) / 255 * 0.5;
      m.makeTranslation(cx + fx, 0.3 * sc, cz + fz);
      trunks.setMatrixAt(i, m);
      m.makeTranslation(cx + fx, 0.62 * sc, cz + fz);
      crowns.setMatrixAt(i, m);
    }
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    this.addSceneObject(trunks);
    this.addSceneObject(crowns);
  }

  /**
   * TŁO MIASTA — pierścień brył ZA granicami świata modelu, gasnący we mgle.
   * Czysta scenografia: nie zawiera agentów, nie jest World State i nie ma
   * z nią żadnej interakcji epidemiologicznej. Istnieje wyłącznie po to, żeby
   * kwartał nie kończył się ostrą krawędzią w pustce.
   */
  private addBackgroundCity(): void {
    const THREE = this.THREE!;
    const worldW = this.simulation.worldWidth * HIGH_FIDELITY_WORLD_SCALE;
    const worldH = this.simulation.worldHeight * HIGH_FIDELITY_WORLD_SCALE;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8896a6, roughness: 0.95 });
    const COUNT = 130;
    const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    mesh.name = 'hf-background-scenery';
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3();
    for (let i = 0; i < COUNT; i++) {
      const h = ((i * 40503 + 12345) >>> 0);
      const r01 = (n: number) => (((h >>> n) & 0xff) / 255);
      const ring = worldW * (2.1 + r01(2) * 2.6);
      const angle = (i / COUNT) * Math.PI * 2 + r01(5) * 0.08;
      const height = 6 + r01(9) * 22;
      pos.set(Math.cos(angle) * ring, height / 2, Math.sin(angle) * (ring * (worldH / worldW)));
      sc.set(2.6 + r01(13) * 4.2, height, 2.6 + r01(17) * 4.2);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r01(21) * Math.PI);
      m.compose(pos, q, sc);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.addSceneObject(mesh);
  }

  /**
   * Dzieli odcinek [from, to] na kawałki pomiędzy przecięciami, zostawiając
   * wokół każdego przecięcia przerwę o zasięgu `reach`. Tak powstaje chodnik,
   * który dobiega do skrzyżowania i się kończy, zamiast przez nie przechodzić.
   */
  private spanSegments(from: number, to: number, crossings: readonly number[], reach: number): Array<[number, number]> {
    const blocked = [...crossings].sort((a, b) => a - b);
    const out: Array<[number, number]> = [];
    let cursor = from;
    for (const c of blocked) {
      const gapStart = c - reach;
      const gapEnd = c + reach;
      if (gapStart > cursor) out.push([cursor, Math.min(gapStart, to)]);
      cursor = Math.max(cursor, gapEnd);
    }
    if (cursor < to) out.push([cursor, to]);
    // Odcinki krótsze niż 5 cm nie mają fizycznego sensu i tylko generują z-fighting.
    return out.filter(([a, b]) => b - a > 0.05);
  }

  private addRoadLine(
    length: number,
    position: number,
    vertical: boolean,
    crossings: readonly number[] = [],
    reach = 0,
  ): void {
    const THREE = this.THREE!;
    const material = new THREE.MeshStandardMaterial({ color: 0xf7dcaa, emissive: 0x9c7340, emissiveIntensity: 0.08, roughness: 0.5 });
    for (let offset = -length / 2 + 0.25; offset < length / 2; offset += 0.72) {
      // Przerywana oś nie biegnie przez skrzyżowanie — tak jest w realnej ulicy
      // i dzięki temu tafla skrzyżowania czyta się jako jedna powierzchnia.
      if (crossings.some((c) => Math.abs(offset - c) < reach)) continue;
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
    // Scenografia miejska przechodzi przez tę samą bramkę. Hydrant, ławka,
    // samochód i klatka pożarowa nie mają rekordu licencji, więc po prostu ich
    // nie ma w kadrze — zamiast trafiać tam „na razie".
    const approvedAssets = assets.filter((asset) => isWorldAssetApproved(asset.path));
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
    await Promise.all(approvedAssets.map(async (spec) => {
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

  /**
   * Ładuje szablon postaci RAZ i klonuje go (SkeletonUtils) dla kilku
   * najbliższych agentów. Nie tworzy nowych agentów ani demografii — każdy
   * klon jest przypięty do istniejącego, realnego stanu z modelu.
   */
  private async loadHumanTemplate(): Promise<void> {
    if (this.realHumanLoadStarted) return;
    this.realHumanLoadStarted = true;
    // DRUGA ścieżka do tego samego nieudokumentowanego GLB. Bramka na
    // loadHeroAsset nie wystarczała — szablon tłumu LOD1 wchodził obok niej.
    // Bez tej blokady „APPROVED" na pasku UI byłoby nieprawdą.
    if (!isWorldAssetApproved('/assets/genesis-hf/characters/mpfb-lod0.glb')) {
      this.humanTemplate = null;
      return;
    }
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      if (!this.THREE) return;
      const gltf = await new Promise<{ scene: THREE_NS.Group; animations: THREE_NS.AnimationClip[] }>((resolve, reject) => {
        new GLTFLoader().load('/assets/genesis-hf/characters/mpfb-lod0.glb',
          (g) => resolve(g as unknown as { scene: THREE_NS.Group; animations: THREE_NS.AnimationClip[] }),
          undefined, reject);
      });
      if (!this.THREE) return;
      const bounds = new this.THREE.Box3().setFromObject(gltf.scene);
      const size = bounds.getSize(new this.THREE.Vector3());
      this.humanTemplateScale = REAL_HUMAN_TARGET_HEIGHT / Math.max(0.001, size.y);
      this.humanTemplateOffsetY = -bounds.min.y * this.humanTemplateScale;
      this.humanTemplate = gltf.scene;
      this.humanTemplateClips = gltf.animations ?? [];
    } catch {
      this.humanTemplate = null; // Bez szablonu zostaje proceduralny LOD1 — bez atrapy.
    }
  }

  /** Buduje/aktualizuje klony prawdziwej postaci dla najbliższych agentów. */
  private syncRealHumans(states: readonly HumanoidAgentState[]): Set<number> {
    const claimed = new Set<number>();
    if (!this.THREE || !this.scene) return claimed;
    if (this.cameraMode === 'agent' || this.cameraMode === 'event') return claimed;
    if (!this.humanTemplate) { void this.loadHumanTemplate(); return claimed; }

    const cam = this.camera;
    const near = [...states];
    if (cam) {
      near.sort((a, b) =>
        ((a.worldX - cam.position.x) ** 2 + (a.worldZ - cam.position.z) ** 2)
        - ((b.worldX - cam.position.x) ** 2 + (b.worldZ - cam.position.z) ** 2));
    }
    const chosen = near.slice(0, REAL_HUMAN_COUNT);

    for (const state of chosen) {
      claimed.add(state.id);
      let entry = this.realHumans.get(state.id);
      if (!entry) {
        const created = this.instantiateRealHuman(state.id);
        if (!created) break;
        entry = created;
        this.realHumans.set(state.id, entry);
        this.scene.add(entry.root);
      }
      entry.root.visible = true;
      entry.root.position.set(state.worldX, this.humanTemplateOffsetY, state.worldZ);
      entry.root.rotation.y = state.facing;
      // Kolor ubrania NIESIE stan epidemiologiczny — to jest wymóg czytelności
      // (zdrowy/narażony/zakażony/ozdrowiały/zgon muszą być widoczne w świecie,
      // nie tylko na liście). Rodzina barwy = stan modelu; dokładny odcień
      // (nasycenie/jasność) jest deterministyczną cechą OSOBY, żeby dwudziestu
      // "podatnych" nie nosiło identycznej zieleni — to jest oddzielna oś
      // różnorodności od koloru, nie zamiennik dla niego.
      if (entry.tints.length && this.THREE) {
        const base = new this.THREE.Color(HEALTH_COLORS[state.health]);
        const hsl = { h: 0, s: 0, l: 0 };
        base.getHSL(hsl);
        const finalH = (hsl.h + entry.hueJitter + 1) % 1;
        const finalS = Math.min(1, Math.max(0.18, hsl.s + entry.satJitter));
        const finalL = Math.min(0.72, Math.max(0.16, hsl.l + entry.lightJitter));
        for (const mat of entry.tints) mat.color.setHSL(finalH, finalS, finalL);
      }
      if (entry.mixer) entry.mixer.update(state.health === 'D' ? 0 : this.lastFrameDt);
    }
    for (const [id, entry] of [...this.realHumans]) {
      if (claimed.has(id)) continue;
      this.scene.remove(entry.root);
      entry.root.traverse((n) => {
        const m = n as THREE_NS.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      this.realHumans.delete(id);
    }
    return claimed;
  }

  private instantiateRealHuman(agentId: number): { root: THREE_NS.Group; mixer: THREE_NS.AnimationMixer | null; tints: THREE_NS.MeshStandardMaterial[]; hueJitter: number; satJitter: number; lightJitter: number } | null {
    const THREE = this.THREE;
    if (!THREE || !this.humanTemplate) return null;
    const clone = this.cloneSkinned(this.humanTemplate);
    clone.scale.setScalar(this.humanTemplateScale);
    // Deterministyczna wariancja wzrostu/obrotu: ci sami ludzie w tej samej
    // klatce nie mogą być sześcioma identycznymi kopiami.
    const h = ((agentId * 2654435761) >>> 0);
    const r01 = (n: number) => (((h >>> n) & 0xff) / 255);
    // Wzrost 0.88-1.12 (dziecko/dorosly/senior w granicach jednego assetu),
    // lekki skos sylwetki i obrot - zeby dziesieciu ludzi nie bylo jednym czlowiekiem.
    clone.scale.multiplyScalar(0.88 + r01(0) * 0.24);
    clone.scale.x *= 0.94 + r01(3) * 0.12;
    clone.rotation.y = (r01(5) - 0.5) * 0.7;
    const tints: THREE_NS.MeshStandardMaterial[] = [];
    clone.traverse((node) => {
      const mesh = node as THREE_NS.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const src0 = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (src0 && 'color' in src0) {
        // Kazdy klon dostaje WLASNE materialy: inaczej zmiana koloru jednej
        // osoby przemalowywala caly tlum na ten sam odcien.
        const cloned = (src0 as THREE_NS.MeshStandardMaterial).clone();
        if (/casualsuit|clothes|shirt|dress|trouser|pant|jacket|coat|skirt|shoe|sock/i.test(mesh.name)) {
          // WSZYSTKIE części garderoby trafiają na listę — jeśli tylko jedna
          // (np. koszula) dostawała kolor stanu, reszta (spodnie, buty) zostawała
          // w surowym kolorze assetu i dawała losowe łaty różowego/beżowego.
          tints.push(cloned);
        } else if (/skin|body|head|face|high-poly/i.test(mesh.name)) {
          // "high-poly" to prawdziwa nazwa materiału ciała w tym assecie
          // (Human.high-poly) — "skin"/"body" nigdy tam nie występowało,
          // więc ten kanał wariancji wcześniej nic nie robił.
          // Szerszy zakres odcieni skóry: przesunięcie odcienia+nasycenia+jasności,
          // nie tylko jasności — jeden płaski "beż ±trochę" nie daje realnej
          // różnorodności populacji.
          cloned.color.offsetHSL((r01(19) - 0.5) * 0.05, (r01(21) - 0.5) * 0.14, (r01(17) - 0.5) * 0.24);
        } else if (/hair|ponytail/i.test(mesh.name)) {
          // Realna nazwa to "ponytail01" — "hair" też się nie trafiał.
          cloned.color.setHSL(0.06 + r01(20) * 0.06, 0.12 + r01(22) * 0.5, 0.06 + r01(24) * 0.34);
        }
        mesh.material = cloned;
      }
    });
    const root = new THREE.Group();
    root.name = 'hf-lod1-real-human';
    root.add(clone);
    let mixer: THREE_NS.AnimationMixer | null = null;
    if (this.humanTemplateClips.length) {
      mixer = new THREE.AnimationMixer(clone);
      mixer.clipAction(this.humanTemplateClips[0]).play();
    }
    // Deterministyczna, MAŁA wariancja wokół barwy stanu zdrowia — wystarczy,
    // by ubrania nie były identyczne, za mało, by zamaskować sygnał S/E/I/R/D.
    const hueJitter = (r01(27) - 0.5) * 0.05;
    const satJitter = (r01(29) - 0.5) * 0.3;
    const lightJitter = (r01(31) - 0.5) * 0.22;
    return { root, mixer, tints, hueJitter, satJitter, lightJitter };
  }

  /** Klon zachowujący skeleton (SkinnedMesh nie da się poprawnie sklonować przez .clone()). */
  private cloneSkinned(source: THREE_NS.Group): THREE_NS.Group {
    const bones = new Map<string, THREE_NS.Bone>();
    const clone = source.clone(true) as THREE_NS.Group;
    clone.traverse((n) => { const b = n as THREE_NS.Bone; if (b.isBone) bones.set(b.name, b); });
    source.traverse((srcNode) => {
      const srcSkinned = srcNode as THREE_NS.SkinnedMesh;
      if (!srcSkinned.isSkinnedMesh) return;
      const target = clone.getObjectByName(srcSkinned.name) as THREE_NS.SkinnedMesh | undefined;
      if (!target || !target.isSkinnedMesh) return;
      const rebound = srcSkinned.skeleton.bones.map((b) => bones.get(b.name) ?? b);
      const skeleton = new (this.THREE!).Skeleton(rebound, srcSkinned.skeleton.boneInverses);
      target.bind(skeleton, srcSkinned.bindMatrix);
    });
    return clone;
  }

  private syncLod1(states: readonly HumanoidAgentState[], focus: HumanoidAgentState | null): void {
    const realIds = this.syncRealHumans(states.filter((s) => s.id !== focus?.id));
    const ids = new Set<number>();
    const candidates = this.cameraMode === 'agent'
      ? []
      : states.filter((state) => state.id !== focus?.id && !realIds.has(state.id)).slice(0, LOD1_COUNT);
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
          // Postacie MUSZĄ rzucać cień — bez kontaktu z gruntem czytały się jak
          // naklejki zawieszone nad ulicą, a nie ludzie stojący na chodniku.
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          if (material && 'emissive' in material) {
            // Emisja własna została USUNIĘTA: rozświetlała ubrania na płaski,
            // zabawkowy kolor i kasowała całe cieniowanie PBR. Stan
            // epidemiologiczny niosą kolor materiału i znaczniki, nie świecenie.
            const standard = material as THREE_NS.MeshStandardMaterial;
            standard.emissive.setRGB(0, 0, 0);
            standard.emissiveIntensity = 0;
            standard.roughness = Math.min(1, Math.max(0.55, standard.roughness));
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
    // Tłum dalekiego planu jest widoczny w KAŻDYM trybie kamery — wcześniej
    // poza widokiem CITY miasto było wyludnione, co psuło poczucie skali.
    const excluded = new Set<number>([focus?.id ?? -1, ...this.lod1.keys(), ...this.realHumans.keys()]);
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
    // LOD0 nie ma udokumentowanego źródła ani licencji, więc NIE jest ładowany.
    // Scena spada na LOD1/LOD2, a status trafia do metryk i na pasek UI —
    // brak jest zgłoszony, nie zamaskowany.
    const heroPath = '/assets/genesis-hf/characters/mpfb-lod0.glb';
    if (!isWorldAssetApproved(heroPath)) {
      this.heroLoadFailed = true;
      return;
    }
    try {
      const [{ GLTFLoader }] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js')]);
      if (!this.THREE || !this.scene) return;
      const loader = new GLTFLoader();
      loader.load(heroPath, (gltf) => {
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
    // SKALA: 1 jednostka świata = 2 m (człowiek 1,8 m = 0,9 jednostki).
    // Poprzednia sylwetka mierzyła 1,455 jednostki, czyli 2,91 m — o 62% za
    // dużo. Razem z nieoświetlonym materiałem dawało to „kolorowy marker",
    // a nie postać. Proporcje poniżej sumują się dokładnie do 0,9.
    const bodyGeometry = new THREE.CapsuleGeometry(HF_CROWD.bodyRadius, HF_CROWD.bodyLength, 6, 10);
    for (const health of HighFidelityCrowd.healthKeys) {
      // Barwa stanu zdrowia zostaje, ale bliżej ubrania niż znacznika:
      // silniejsze zmieszanie z szarością odbiera jej charakter etykiety.
      const color = new THREE.Color(HEALTH_COLORS[health]).lerp(new THREE.Color(0x64707a), 0.46);
      // MeshLambertMaterial zamiast MeshBasicMaterial: postać wchodzi w to samo
      // oświetlenie co reszta sceny i przestaje być płaską naklejką. Lambert,
      // bo przy 140 instancjach jest tańszy od PBR, a różnicy na tym dystansie
      // i tak nie widać.
      const material = new THREE.MeshLambertMaterial({ color });
      const body = new THREE.InstancedMesh(bodyGeometry, material, capacity);
      body.name = `hf-lod2-clothes-${health}`;
      body.castShadow = true;
      body.receiveShadow = true;
      this.bodies.set(health, body);
    }
    this.head = new THREE.InstancedMesh(
      new THREE.SphereGeometry(HF_CROWD.headRadius, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xc79a78 }),
      capacity,
    );
    this.head.castShadow = true;
    // Pierścień stanu zostaje jako odczyt epidemiologiczny, ale przeskalowany
    // do nowej sylwetki i przygaszony, żeby nie dominował nad postacią.
    this.glow = new THREE.InstancedMesh(new THREE.RingGeometry(0.15, 0.19, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.13, depthWrite: false }), capacity);
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
      this.position.set(state.worldX, HF_CROWD.bodyCentreY, state.worldZ); this.scale.setScalar(1); this.matrix.compose(this.position, this.rotation, this.scale); this.bodies.get(health)!.setMatrixAt(bodyIndex, this.matrix);
      this.position.set(state.worldX, HF_CROWD.headCentreY, state.worldZ); this.matrix.compose(this.position, this.rotation, this.scale); this.head.setMatrixAt(index, this.matrix);
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
