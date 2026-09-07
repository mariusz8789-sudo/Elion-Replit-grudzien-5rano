import type * as THREE_NS from 'three';
import type { SimParams } from '../types';
import { computeField, heatColor, type AnalysisMode } from '../simulation/analysis';
import { EpidemicCitySimulation, type EpidemicCityParams } from '../simulation/epidemicCity';
import { DEFAULT_HOSPITAL_CAPACITY, evaluateHospitalState, type HospitalStatus } from '../simulation/hospitalResource';
import type { WorldStateView } from '../simulation/worldEngineContract';
import { SimulationClock, type ClockSpeed } from '../simulationClock/clock';
import type { SimAgent, WorldObject } from '../simulation/types';
import { EventRegistry, EventStream, ingestTransmissions } from '../events';
import type { EarthquakeCityOverlayProjection } from '../simulationRenderer/earthquakeCoordinateMapping';
import { resolveSafeFocusDirection, type CameraOccluder } from './cityCameraSafety';
import type { PostProcessingModules, PostProcessor, Sim3D, ThreeRenderMetrics } from './types';
import { isWorldAssetApproved, isWorldAssetPathApproved } from './assetGovernance';
import { setupGraphicsPipeline, type GraphicsPipeline } from './graphics/postProcessing';
import { applyShadowPolicy } from './graphics/shadowPolicy';
import { createPBRMaterial } from './graphics/materials';
import { createSunLight, createBackgroundFill } from './graphics/lighting';
import { disposeSceneResources, disposeMaterials } from './graphics/lifecycle';
import { resolveCameraFraming, type CameraIntent } from './graphics/cameraRig';
import { createDustMotes, type DustMotesHandle } from './graphics/atmosphere';
import { detectRenderTier, tierAllowsAtmosphereParticles, atmosphereParticleCount } from './quality';
import { raycastFromScreenPoint, findTaggedAncestor, ClickDragTracker } from './graphics/picking';
import { InstanceBatch, setInstanceColor } from './graphics/instancing';
import { severityColor } from './graphics/stateVisualization';
import {
  buildTrafficNetwork, stepTrafficNetwork, greenshieldsSpeedMS, DEFAULT_GREENSHIELDS, DEFAULT_TRAFFIC_DEMAND,
  type TrafficNetwork, type TrafficCell, type TrafficStepSummary,
} from '../worldModel/domains/trafficFlow';
// GENESIS GRAPHICS ENGINE — VISUAL WORLD BUILD 1.0: reusable kits, actually wired into this
// production scene (not just proven in an isolated graphics/examples/*.ts file) via addCityExtras().
import { createRooftopEquipment, createAmbulanceBay, createIndustrialBuilding } from './graphics/buildingKit';
import { createHydrant, createUtilityBox } from './graphics/streetKit';
import { createVehicle } from './graphics/vehicleKit';
import { createTreeField, createGroundClutter } from './graphics/vegetation';
import { createPipeNetwork } from './graphics/waterInfrastructure';
import { createPostSign, createHangingSign } from './graphics/signageKit';
import { createElectricalCabinet, createCondenserUnit } from './graphics/electricalKit';
import { createAssetSlot, type AssetSlotHandle } from './graphics/assetPipeline';
import { WorldFrameRenderer } from './graphics/worldFrameRenderer';
import type { WorldFrame } from './graphics/worldFrame';
import { createWaterInfrastructureAdapter, type WaterInfrastructureAdapter } from './graphics/waterInfrastructureBridge';
import {
  HumanoidAgentVisual,
  InstancedHumanoidCrowd,
  mapSimAgentToHumanoid,
  type HumanoidAgentState,
} from './humanoidAgentVisual';

/** Ten sam współczynnik świata używany przez budynki, drogi, agentów i heatmapę. */
export const CITY_WORLD_SCALE = 0.018;
const CITY_VELOCITY_SCALE_FACTOR = 0.10;
/** Scene-space road width — shared between `addRoadsAndBuildings()`'s own road meshes and GRAPHICS
 * V7's traffic-density overlay so the overlay always lines up with the real pavement, never a
 * value that could silently drift apart from it. */
const CITY_ROAD_WIDTH_SCENE = 0.38;
/** High-fidelity City View: detaliczne rigi są wyjątkami, a nie dominantą kadru miasta. */
const MAX_DETAILED_HUMANOIDS = 4;
// InstancedMesh utrzymuje stałą liczbę draw calls; P1 umożliwia uczciwy benchmark do 1000 agentów.
const MAX_CROWD_HUMANOIDS = 1024;
// City first: zwarty, izometryczny kadr dzielnicy zamiast odległego widoku planszy.
const CITY_CAMERA_POSITION = { x: 6.8, y: 11.8, z: 7.3 };
const CITY_CAMERA_TARGET = { x: 0, y: 0.38, z: -0.18 };
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
  /** GRAPHICS V6 — kept so `getStats()` can read `getGpuMemoryEstimate()` (`webgl_gpu_bytes_estimate`),
   * the same convention `genesisScientificCitySim.ts` already established for its own pipeline field. */
  private pipeline: GraphicsPipeline | null = null;
  private raycaster: THREE_NS.Raycaster | null = null;
  private viewport = { w: 1, h: 1 };
  private timeSeconds = 0;
  private analysisMode: AnalysisMode = 'none';
  private showTransmissions = true;
  private selectedId: number | null = null;
  /** Cel jest ustawiany wyłącznie podczas odczytu prawdziwego TransmissionEvent. */
  private latestTransmissionTarget: number | null = null;
  private latestTransmissionView: CityTransmissionView | null = null;
  private readonly clickDragTracker = new ClickDragTracker();
  private followTarget: THREE_NS.Vector3 | null = null;
  private cameraPreset: CityCameraPreset = 'city';
  private resetCityCameraPending = false;
  /** Looking Glass 2.1 observation-directed standoff distance, from the real C2 CameraRig's
   * `resolveCameraFraming` for the requested CameraIntent+target radius — set only while an
   * observation request is directing the view; `getOrbitFocusDistance()` prefers it over the
   * hardcoded per-preset distances below. Cleared by any manual preset/selection change, so
   * the user's own OrbitControls drag (already the existing "hand control back" mechanism —
   * see useThreeLoop.ts) is never fought once an observation shot has settled. */
  private observationStandoff: number | null = null;
  /** Punkt kamery ulicznej pochodzi z istniejącej siatki ulic CityWorld; to cecha widoku, nie ruch ani cel agenta. */
  private streetLayoutFocus: { x: number; y: number } | null = null;
  private cameraTrackId: number | null = null;
  private detailVisuals = new Map<number, HumanoidAgentVisual>();
  private crowd: InstancedHumanoidCrowd | null = null;
  // GENESIS GRAPHICS ENGINE — atmosphere (graphics/atmosphere.ts): low ground haze for night-street
  // depth. Purely a rendering-layer depth cue — never derived from epidemic/world state.
  private cityHaze: DustMotesHandle | null = null;
  private analysisMesh: THREE_NS.InstancedMesh | null = null;
  private analysisMaterial: THREE_NS.MeshBasicMaterial | null = null;
  private cityMaterials: CityPbrMaterials | null = null;
  private semanticBuildingSlots: Array<{ group: THREE_NS.Group; building: WorldObject }> = [];
  /** Renderer-only visual volumes used to keep agent-focus shots outside building geometry. */
  private cameraOccluders: CameraOccluder[] = [];
  // Render-loop allocation audit finding: getOrbitCameraDirection() and syncScene's own fallback
  // each allocated a fresh Vector3 every frame. Safe to reuse — every real consumer
  // (useThreeLoop.ts's render loop) already .clone()s the returned vector before use.
  private scratchOrbitDirection: THREE_NS.Vector3 | null = null;
  // Render-loop allocation audit finding: syncAnalysis() allocated a fresh THREE.Color per grid
  // cell, every frame the analysis overlay is on — ANALYSIS_COLS * ANALYSIS_ROWS = 864 allocations
  // every single frame, the single largest per-frame allocation hotspot found in this scene.
  private scratchAnalysisColor: THREE_NS.Color | null = null;
  private approvedFacadeTemplate: THREE_NS.Object3D | null = null;
  private approvedLampTemplate: THREE_NS.Object3D | null = null;
  private approvedAssetRoots: THREE_NS.Object3D[] = [];
  private worldState: WorldStateView | null = null;
  private worldOverlayGroup: THREE_NS.Group | null = null;
  /** Separate SCENARIO-only hazard view; never extends or replaces epidemic WorldStateView. */
  private earthquakeOverlay: EarthquakeCityOverlayProjection | null = null;
  private earthquakeOverlayGroup: THREE_NS.Group | null = null;
  private earthquakeOverlayFingerprint = '';
  private worldInteractive: THREE_NS.Object3D[] = [];
  private selectedWorld: CityWorldSelection | null = null;
  // GENESIS GRAPHICS ENGINE — VISUAL WORLD BUILD 2.0: the C3 water-infrastructure integration seam
  // (see graphics/waterInfrastructureBridge.ts's own doc). No real C1/C3 water/pump entity exists
  // yet — this renders exactly ONE placeholder entity with `grounding: 'NOT_MODELED'`, proving the
  // WorldFrame -> adapter -> waterInfrastructure.ts pathway works end to end in this real production
  // scene, without fabricating any pump id, position provenance, or state. Deliberately NOT added to
  // `worldInteractive`/tagged with `userData.worldSelection`: it is not a queryable CityWorld
  // location, only a visual placeholder pending a real C3 producer.
  private infrastructureAdapter: WaterInfrastructureAdapter | null = null;
  private infrastructureRenderer: WorldFrameRenderer | null = null;
  private worldOverlayFingerprint = '';
  /** Efemeryczne ślady są tworzone wyłącznie z `lastTransmissions()` silnika. */
  private transmissionMarkers = new Map<string, { group: THREE_NS.Group; born: number; material: THREE_NS.MeshBasicMaterial }>();
  private buildingMeshes: THREE_NS.Object3D[] = [];
  /**
   * GRAPHICS V7 — the real Greenshields+CTM+HCM traffic-flow solver (`worldModel/domains/
   * trafficFlow.ts`), built directly from this scene's OWN real road geometry
   * (`this.simulation.roadNetworkView()` — the exact `CityRoadNetwork` `addRoadsAndBuildings()`
   * already draws roads from). Called directly rather than through the WorldGraph/TemporalEngine/
   * SolverRouter ceremony `trafficFlow.ts` also offers (`addTrafficNetworkEntity`/`buildTrafficWorld`):
   * this scene has no existing WorldGraph to attach an entity to, and the entity that ceremony
   * produces only ever carries NETWORK-WIDE aggregate scalars (Rule 6 — a `MACRO_CITY` entity is
   * not disaggregated into per-cell state) — the real per-cell density this visual needs to show
   * congestion propagation/spillback lives entirely in the closure-held `TrafficNetwork` object
   * either way, so the WorldGraph wrapper buys nothing for THIS rendering task. `trafficNetwork`
   * itself is still the exact same real solver state (`stepTrafficNetwork`, real Godunov flux), not
   * a second implementation.
   */
  private readonly trafficNetwork: TrafficNetwork;
  private trafficMesh: THREE_NS.InstancedMesh | null = null;
  /** Parallel to `trafficMesh`'s instances — index i's live `TrafficCell` (its `densityVehPerKm`
   * mutates every `stepTrafficNetwork` call), so `syncTrafficOverlay` can recolor instance i from
   * cell i's CURRENT real density without re-deriving the mapping every frame. */
  private trafficCellRefs: TrafficCell[] = [];
  private lastTrafficSummary: TrafficStepSummary | null = null;
  /**
   * GRAPHICS V2 SPRINT C-1 — real density audit finding: `createBuilding()`/`createContextBuilding()`
   * used to emit one individual `Mesh` per window pane (see PERFORMANCE.md's "Visual World Build
   * 1.0-3.0 density audit" — already identified there as the scene's single largest draw-call cost,
   * not attempted at the time because it was out of that pass's scope). Both generators now push
   * WORLD-SPACE window placements here instead of building a `Mesh` directly; `flushWindowInstances()`
   * bakes everything collected during `init()`'s whole building-generation pass into exactly TWO
   * `InstancedMesh`es (lit / dark) — one draw call per tone, city-wide, however many buildings exist.
   * Positions must be WORLD-SPACE because the resulting InstancedMesh is added directly to the scene,
   * not nested under any one building's own Group (whose local origin these panes were previously
   * relative to).
   */
  private windowInstancesLit: { position: THREE_NS.Vector3Tuple; scale: THREE_NS.Vector3Tuple }[] = [];
  private windowInstancesDark: { position: THREE_NS.Vector3Tuple; scale: THREE_NS.Vector3Tuple }[] = [];
  /** `createContextBuilding()`'s own window panes — a single global batch with per-instance COLOR
   * carrying each building's `palette.glass` tint (constant emissiveIntensity across all of them, so
   * color is the only per-instance distinction needed — no lit/dark split like the real buildings). */
  private windowInstancesContext: { position: THREE_NS.Vector3Tuple; scale: THREE_NS.Vector3Tuple; color: number }[] = [];
  /**
   * GRAPHICS V2 SPRINT F+ — the same window-instancing move (see doc above), applied to
   * `createContextBuilding()`'s remaining structural trim. `roofUnit`/`plinth`/`cornice` are
   * IDENTICAL in appearance across every context building (fixed hardcoded colors, only their
   * transform differs) — they were being rebuilt as a fresh `Mesh` + a fresh `Material` per
   * building for no visual reason. `roof` varies only by `palette.roof` (4 fixed variants), so it
   * uses per-instance COLOR the same way `windowInstancesContext` already does. `body` (the wall)
   * deliberately stays a real per-building `Mesh`: each one clones a shared brick/concrete base and
   * bakes a real color tint into it, which is genuine per-building material variation this file's
   * own "spend detail where it matters" policy (PERFORMANCE.md) says is worth the draw call, not a
   * repeated constant like these four.
   */
  private contextRoofInstances: { position: THREE_NS.Vector3Tuple; scale: THREE_NS.Vector3Tuple; color: number }[] = [];
  private contextRoofUnitInstances: { position: THREE_NS.Vector3Tuple; scale: THREE_NS.Vector3Tuple }[] = [];
  private contextPlinthInstances: { position: THREE_NS.Vector3Tuple; scale: THREE_NS.Vector3Tuple }[] = [];
  private contextCorniceInstances: { position: THREE_NS.Vector3Tuple; scale: THREE_NS.Vector3Tuple }[] = [];
  private lastDetailCount = 0;
  private lastCrowdCount = 0;
  private lastTickMs = 0;
  private renderMetrics: ThreeRenderMetrics = { fps: 0, frameMs: 0, renderMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0, textureBytesEstimate: 0 };

  constructor(
    params: Partial<EpidemicCityParams> = {},
    callbacks: City3DCallbacks = {},
    existingSimulation?: EpidemicCitySimulation,
  ) {
    this.simulation = existingSimulation ?? new EpidemicCitySimulation(params);
    // GRAPHICS V7 — real geometry-derived traffic network, built once from this exact simulation's
    // own road network (deterministic, no async wait — unlike moleculeScene3D.ts's backend-fetched
    // geometry, this solver needs nothing external).
    this.trafficNetwork = buildTrafficNetwork(this.simulation.roadNetworkView());
    this.eventSeed = this.simulation.getParams().seed as number | undefined;
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

  /** Consumes a gate-approved synthetic scenario projection without touching CityWorld or the epidemic simulation. */
  setEarthquakeScenarioOverlay(overlay: EarthquakeCityOverlayProjection | null): void {
    this.earthquakeOverlay = overlay;
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
    this.observationStandoff = null;
    this.selectAgent(null);
    this.selectWorld(null);
  }

  getCameraPreset(): CityCameraPreset {
    return this.cameraPreset;
  }

  /** Jeden mechanizm kamery dla świata, dzielnicy, ulicy i modelowego agenta. */
  setCameraPreset(preset: CityCameraPreset): number | null {
    this.cameraPreset = preset;
    this.observationStandoff = null;
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

  /**
   * Looking Glass 2.1 — deterministic, bilingual name match against every REAL
   * addressable object this city currently has: the semantic CityWorld
   * buildings (hospital/shop/school/isolation/park), the model's own live
   * hotspots/clusters (when a `WorldStateView` has been set). Returns `null`
   * — never a guess, never the nearest unrelated object — when nothing in
   * THIS run matches, e.g. "the pump": there is no pump in the epidemic
   * city, and this method will never invent one.
   */
  resolveNamedWorldTarget(query: string): CityWorldSelection | null {
    return this.resolveNamedWorldTargetWithRadius(query)?.selection ?? null;
  }

  private resolveNamedWorldTargetWithRadius(query: string): { selection: CityWorldSelection; radius: number } | null {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return null;

    const BUILDING_SYNONYMS: Record<string, WorldObject['kind']> = {
      hospital: 'hospital', szpital: 'hospital',
      shop: 'shop', sklep: 'shop',
      school: 'school', szkoła: 'school', szkola: 'school',
      isolation: 'isolation', izolacja: 'isolation',
      park: 'park',
    };
    const synonym = Object.keys(BUILDING_SYNONYMS).find((word) => needle.includes(word));
    if (synonym) {
      const kind = BUILDING_SYNONYMS[synonym];
      const match = this.semanticBuildingSlots.find((slot) => slot.building.kind === kind);
      if (match) {
        const { building } = match;
        const selection: CityWorldSelection = {
          kind: kind === 'hospital' ? 'hospital' : 'location',
          label: building.kind.toUpperCase(),
          detail: 'Resolved from the city\'s own semantic CityWorld location.',
          x: building.x + building.w / 2,
          y: building.y + building.h / 2,
        };
        return { selection, radius: Math.max(building.w, building.h) * CITY_WORLD_SCALE * 0.5 };
      }
    }
    if ((needle.includes('hotspot') || needle.includes('ognisko')) && this.worldState && this.worldState.hotspots.length > 0) {
      const hotspot = [...this.worldState.hotspots].sort((a, b) => b.infectious - a.infectious)[0]!;
      const selection: CityWorldSelection = {
        kind: 'hotspot',
        label: `Hotspot · ${hotspot.infectious} infectious`,
        detail: 'The city\'s own most active infection hotspot right now.',
        x: hotspot.x,
        y: hotspot.y,
      };
      return { selection, radius: 1.4 };
    }
    if ((needle.includes('cluster') || needle.includes('klaster')) && this.worldState) {
      const clusters = [...this.worldState.clusters.household, ...this.worldState.clusters.location];
      const best = [...clusters].sort((a, b) => b.transmissions - a.transmissions)[0];
      const location = best ? this.worldState.locations[best.locationIndex] : undefined;
      if (best && location) {
        const selection: CityWorldSelection = {
          kind: 'cluster',
          label: `${best.kind} cluster · ${best.transmissions} transmission(s)`,
          detail: `Cluster ${best.clusterId}.`,
          x: location.x + location.w / 2,
          y: location.y + location.h / 2,
        };
        return { selection, radius: 1.2 };
      }
    }
    return null;
  }

  /**
   * Looking Glass 2.1 — the real observation-execution boundary for the city.
   * Resolves `query` against every real addressable object (buildings,
   * hotspots, clusters, or a real infected/exposed agent), and — when found —
   * actually moves the camera there through the real C2 CameraRig math
   * (`resolveCameraFraming`) riding the SAME OrbitControls target/distance
   * seam every existing preset already uses (`getOrbitTarget`/
   * `getOrbitFocusDistance`, eased by `useThreeLoop.ts`'s own damped lerp) —
   * no second camera system, no per-frame override of this file's own render
   * loop, and the user's own drag still takes over exactly as it already
   * does for every other preset once the shot settles. `found: false` is an
   * honest report, not a silent fallback.
   */
  applyObservationTarget(query: string, cameraIntent: CameraIntent): { found: boolean; label: string | null } {
    const needle = query.trim().toLowerCase();
    if (/\b(infected|zaka[żz]on|exposed|nara[żz]on)/i.test(needle)) {
      const id = this.focusFirstInfected();
      if (id === null) return { found: false, label: null };
      const agent = this.simulation.agents().find((candidate) => candidate.id === id);
      if (!agent) return { found: false, label: null };
      this.applyObservationFraming(cameraIntent, agent.x, agent.y, 0.85, 0.6);
      return { found: true, label: `Agent #${id}` };
    }
    const resolved = this.resolveNamedWorldTargetWithRadius(query);
    if (!resolved) return { found: false, label: null };
    this.selectWorld(resolved.selection);
    this.applyObservationFraming(cameraIntent, resolved.selection.x, resolved.selection.y, 0.26, resolved.radius);
    return { found: true, label: resolved.selection.label };
  }

  /** Computes the CameraRig-resolved standoff for a real world position and stores it for
   * `getOrbitFocusDistance()` — see that method's own doc for why this never touches
   * `camera.position` directly (the existing OrbitControls/lerp seam already does that). */
  private applyObservationFraming(cameraIntent: CameraIntent, worldGridX: number, worldGridY: number, height: number, targetRadius: number): void {
    const target: [number, number, number] = [
      (worldGridX - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE,
      height,
      (worldGridY - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE,
    ];
    const framing = resolveCameraFraming({ intent: cameraIntent, target, targetRadius });
    this.observationStandoff = Math.hypot(
      framing.position[0] - framing.lookAt[0],
      framing.position[1] - framing.lookAt[1],
      framing.position[2] - framing.lookAt[2],
    );
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
    this.scratchOrbitDirection = new THREE.Vector3();
    this.scratchAnalysisColor = new THREE.Color();
    scene.background = new THREE.Color(0x0d1b2a);
    scene.fog = new THREE.Fog(0x0d1b2a, 18, 42);
    camera.fov = 44;
    camera.updateProjectionMatrix();
    camera.position.set(CITY_CAMERA_POSITION.x, CITY_CAMERA_POSITION.y, CITY_CAMERA_POSITION.z);
    camera.lookAt(CITY_CAMERA_TARGET.x, CITY_CAMERA_TARGET.y, CITY_CAMERA_TARGET.z);

    this.createApprovedCityMaterials();
    this.addLightsAndGround();
    this.addRoadsAndBuildings();
    this.addTrafficOverlay();
    this.addStreetAtmosphere();
    // GENESIS GRAPHICS ENGINE — one shadow-policy pass over the finished scene, superseding every
    // per-builder castShadow/receiveShadow guess above (see graphics/shadowPolicy.ts's own doc:
    // that's the intended pattern, not a bug — a single caster budget can't afford every curb,
    // window pane and bench casting into the one shadow map). Buildings/roads/masses stay casters
    // (they're well above the size threshold); thin street furniture (curbs, benches, window
    // instances) stops costing shadow-map time for a shadow no one would see anyway. Run again
    // after the async approved-asset facades/lamps attach, below, since they arrive later.
    applyShadowPolicy(THREE, scene);
    void this.loadApprovedCityAssets();
    this.addAnalysisLayer();
    this.addCityExtras();
    this.initWaterInfrastructureSeam();
    this.worldOverlayGroup = new THREE.Group();
    this.worldOverlayGroup.name = 'read-only-worldstate-overlays';
    scene.add(this.worldOverlayGroup);
    this.earthquakeOverlayGroup = new THREE.Group();
    this.earthquakeOverlayGroup.name = 'read-only-earthquake-scenario-overlay';
    scene.add(this.earthquakeOverlayGroup);
    this.crowd = new InstancedHumanoidCrowd(THREE, MAX_CROWD_HUMANOIDS);
    this.crowd.addTo(scene);

    // GENESIS GRAPHICS ENGINE — atmosphere (graphics/atmosphere.ts): low, warm-tinted ground haze
    // (streetlamp-lit night air) for street-level atmospheric depth. Generic/reusable primitive —
    // no city-specific logic lives in atmosphere.ts itself. Quality-gated (quality.ts's
    // tierAllowsAtmosphereParticles/atmosphereParticleCount): skipped entirely at 'low' tier, scaled
    // by device tier otherwise, instead of a fixed count regardless of hardware.
    const atmosphereTier = detectRenderTier();
    if (tierAllowsAtmosphereParticles(atmosphereTier)) {
      const worldW = this.simulation.worldWidth * CITY_WORLD_SCALE;
      const worldH = this.simulation.worldHeight * CITY_WORLD_SCALE;
      this.cityHaze = createDustMotes(THREE, {
        bounds: [worldW * 0.5, 0.9, worldH * 0.5],
        center: [0, 0.9, 0],
        count: atmosphereParticleCount(260, atmosphereTier),
        size: 0.05,
        color: 0xd9b57a,
        opacity: 0.1,
        driftSpeed: 0.09,
      });
      scene.add(this.cityHaze.points);
    }
  }

  /**
   * GENESIS GRAPHICS ENGINE — the same shared `graphics/postProcessing.ts` pipeline the lab scene
   * uses (`setupGraphicsPipeline`), not a second, independently-maintained bloom-only chain. Real
   * upgrade over the previous RenderPass→Bloom→Output chain: this tier-gates in `GTAOPass`, which
   * gives street-level contact shadows (buildings meeting the sidewalk, agents meeting the
   * street) that a plain directional-light shadow map alone doesn't produce — see
   * `graphics/PERFORMANCE.md` for the cost this adds at the `'high'` tier only.
   *
   * `ambient: { mode: 'none' }` because this scene already runs its OWN environment story
   * (`loadApprovedHdri`, below) — a specific low `environmentIntensity` tuned for a night city, a
   * solid background color, and exponential fog for depth — none of which the shared pipeline's
   * generic "studio box" IBL role knows about or should override.
   */
  setupPostProcessing(
    modules: PostProcessingModules,
    renderer: THREE_NS.WebGLRenderer,
    scene: THREE_NS.Scene,
    camera: THREE_NS.PerspectiveCamera,
    w: number,
    h: number,
  ): PostProcessor {
    void this.loadApprovedHdri(renderer);
    const pipeline: GraphicsPipeline = setupGraphicsPipeline(this.THREE!, modules, renderer, {
      scene, camera, width: w, height: h,
      // Odrobinę niższa ekspozycja zachowuje szczegół PBR w jasnych oknach,
      // a bogatszy IBL/fill poniżej wyciąga materiał fasad z czerni bez neonów.
      toneMappingExposure: 1.00,
      bloom: { strength: 0.20, radius: 0.46, threshold: 0.90 },
      ambient: { mode: 'none' },
    });
    this.pipeline = pipeline;
    return pipeline;
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
    this.cityHaze?.update(dt);
    // GRAPHICS V7 — real dt (seconds), continuous regardless of `clock.running`: traffic is a
    // real-time physical process (like the haze drift above), not scaled by the epidemic model's
    // own simulated-days clock. `stepTrafficNetwork` internally sub-steps for its own CFL bound, so
    // this is stable for whatever real dt useThreeLoop.ts passes.
    this.lastTrafficSummary = stepTrafficNetwork(this.trafficNetwork, DEFAULT_GREENSHIELDS, dt, DEFAULT_TRAFFIC_DEMAND);
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
    this.syncTrafficOverlay();
    this.syncAnalysis(agents);
    this.syncTransmissionMarkers();
    this.syncWorldStateVisuals();
    this.syncEarthquakeScenarioVisuals();
    this.animateWorldMarkers();
    this.syncApprovedAssetLod();
    this.syncWaterInfrastructureSeam();
    this.syncFollowTarget(states);
    if (this.resetCityCameraPending) {
      camera.position.set(CITY_CAMERA_POSITION.x, CITY_CAMERA_POSITION.y, CITY_CAMERA_POSITION.z);
      camera.lookAt(CITY_CAMERA_TARGET.x, CITY_CAMERA_TARGET.y, CITY_CAMERA_TARGET.z);
      this.resetCityCameraPending = false;
    }
    if (this.followTarget) {
      const focusDistance = this.getOrbitFocusDistance() ?? 4.2;
      const focusDirection = this.getOrbitCameraDirection() ?? this.scratchOrbitDirection?.set(1, 0.72, 1).normalize() ?? new this.THREE.Vector3(1, 0.72, 1).normalize();
      if (this.cameraPreset === 'agent') {
        const safe = resolveSafeFocusDirection(
          this.followTarget,
          { x: focusDirection.x, y: focusDirection.y, z: focusDirection.z },
          focusDistance,
          this.cameraOccluders,
        );
        if (safe) focusDirection.set(safe.x, safe.y, safe.z);
      }
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
    // Looking Glass 2.1: an active observation request's own CameraRig-resolved standoff
    // (see applyObservationTarget) takes priority over every hardcoded preset distance below —
    // it is the real answer to "how far should the camera stand for THIS CameraIntent", not a guess.
    if (this.observationStandoff !== null) return this.observationStandoff;
    if (this.selectedWorld) return 4.6;
    if (this.cameraPreset === 'district') return 7.2;
    // Ten sam rig i OrbitControls: STREET zachowuje wysokość obserwatora, ale
    // zostawia pełny rytm ulicy w kadrze zamiast zatrzymywać kamerę przy latarni.
    if (this.cameraPreset === 'street') return 7.8;
    return 1.85;
  }

  getOrbitCameraDirection(): THREE_NS.Vector3 | null {
    if (!this.THREE || !this.followTarget || this.cameraPreset !== 'street' || !this.scratchOrbitDirection) return null;
    // Niski, stabilny kierunek uliczny: nadal jedna kamera OrbitControls, bez fikcyjnego ruchu lub danych agenta.
    return this.scratchOrbitDirection.set(1.35, 0.62, 2.6).normalize();
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
      // GRAPHICS V7 — real Greenshields+CTM+HCM traffic state (worldModel/domains/trafficFlow.ts),
      // the same numbers driving the road-overlay color.
      traffic_mean_speed_ms: this.lastTrafficSummary?.meanSpeedMS ?? 0,
      traffic_mean_density_veh_per_km: this.lastTrafficSummary?.meanDensityVehPerKm ?? 0,
      traffic_congested_fraction: this.lastTrafficSummary?.congestedCellFraction ?? 0,
      webgl_fps: this.renderMetrics.fps,
      webgl_frame_ms: this.renderMetrics.frameMs,
      webgl_render_ms: this.renderMetrics.renderMs,
      webgl_draw_calls: this.renderMetrics.drawCalls,
      webgl_triangles: this.renderMetrics.triangles,
      webgl_geometries: this.renderMetrics.geometries,
      webgl_textures: this.renderMetrics.textures,
      // GRAPHICS V3 — real estimated bytes (see diagnostics.ts's estimateSceneTextureMemory),
      // closing PERFORMANCE_BUDGET.md §6's "texture memory is currently unmeasured" gap.
      webgl_texture_bytes_estimate: this.renderMetrics.textureBytesEstimate,
      // GRAPHICS V6 — the rest of §6's "total GPU memory" gap: geometry (exact) + this pipeline's
      // own render targets (see diagnostics.ts's estimateSceneGpuMemory for exactly what's covered).
      webgl_geometry_bytes_estimate: this.pipeline?.getGpuMemoryEstimate().geometryBytes ?? 0,
      webgl_gpu_bytes_estimate: this.pipeline?.getGpuMemoryEstimate().totalBytes ?? 0,
    };
  }

  pointer(x: number, y: number, type: 'down' | 'move' | 'up'): void {
    if (type === 'down' || type === 'move') {
      this.clickDragTracker.track(x, y, type);
      return;
    }
    const wasDrag = this.clickDragTracker.finish();
    if (wasDrag || !this.THREE || !this.camera || !this.raycaster || this.viewport.w <= 0 || this.viewport.h <= 0) return;

    const detailedTargets = [...this.detailVisuals.values()].map((visual) => visual.root);
    const detailedHits = raycastFromScreenPoint(this.THREE, this.raycaster, this.camera, x, y, this.viewport.w, this.viewport.h, detailedTargets);
    if (detailedHits.length) {
      const node = findTaggedAncestor(detailedHits[0].object, (d) => typeof d.agentId === 'number');
      if (node) {
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
      const node = findTaggedAncestor(worldHits[0].object, (d) => d.worldSelection !== undefined);
      if (node) {
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
    if (this.cityHaze) {
      this.scene?.remove(this.cityHaze.points);
      this.cityHaze.dispose();
      this.cityHaze = null;
    }
    this.analysisMesh?.geometry.dispose();
    this.analysisMaterial?.dispose();
    this.analysisMesh = null;
    this.analysisMaterial = null;
    // Resource-lifecycle audit finding: `this.cityMaterials` (asphalt/concrete/ground/brick, each
    // carrying real loaded textures — map/normalMap/roughnessMap/aoMap from
    // `createApprovedCityMaterials`) was never disposed at all — not the materials, not their
    // textures. Some building/road meshes below reference these same instances directly (not
    // cloned), so this call and the per-mesh traversal below can both reach the same material;
    // three.js's `.dispose()` is idempotent, so that's harmless, not a double-free bug.
    if (this.cityMaterials) disposeMaterials(Object.values(this.cityMaterials));
    for (const marker of this.transmissionMarkers.values()) disposeSceneResources(marker.group);
    this.transmissionMarkers.clear();
    if (this.worldOverlayGroup) {
      for (const marker of this.worldOverlayGroup.children) disposeSceneResources(marker);
      this.scene?.remove(this.worldOverlayGroup);
      this.worldOverlayGroup = null;
      this.worldInteractive = [];
    }
    for (const object of this.buildingMeshes) disposeSceneResources(object);
    this.buildingMeshes = [];
    this.infrastructureRenderer?.dispose();
    this.infrastructureRenderer = null;
    this.infrastructureAdapter?.dispose();
    this.infrastructureAdapter = null;
    // Resource-lifecycle audit finding: the approved-asset clones (facade/lamp GLTF instances
    // actually placed in the scene via .clone(true)) were only ever removed from the scene graph
    // here, never disposed — their geometry/materials/textures leaked on every teardown. The raw
    // templates they're cloned from (never themselves added to the scene) were never disposed
    // either.
    for (const asset of this.approvedAssetRoots) {
      this.scene?.remove(asset);
      disposeSceneResources(asset);
    }
    this.approvedAssetRoots = [];
    if (this.approvedFacadeTemplate) disposeSceneResources(this.approvedFacadeTemplate);
    if (this.approvedLampTemplate) disposeSceneResources(this.approvedLampTemplate);
    this.approvedFacadeTemplate = null;
    this.approvedLampTemplate = null;
    this.semanticBuildingSlots = [];
    this.cameraOccluders = [];
  }

  /**
   * Bazowe strojenie (kolor/roughness/metalness) pochodzi teraz z GENESIS GRAPHICS ENGINE —
   * `createPBRMaterial`'s CONCRETE/ASPHALT/BRICK/GROUND kategorie (generalizowane z tych właśnie
   * wartości) — jedno źródło prawdy zamiast duplikatu w tym pliku. Materiały są ładowane tylko po
   * przejściu istniejącej bramki Asset Governance.
   */
  private createApprovedCityMaterials(): void {
    if (!this.THREE) return;
    const THREE = this.THREE;
    this.cityMaterials = {
      asphalt: createPBRMaterial(THREE, 'ASPHALT') as THREE_NS.MeshStandardMaterial,
      concrete: createPBRMaterial(THREE, 'CONCRETE') as THREE_NS.MeshStandardMaterial,
      ground: createPBRMaterial(THREE, 'GROUND') as THREE_NS.MeshStandardMaterial,
      brick: createPBRMaterial(THREE, 'BRICK') as THREE_NS.MeshStandardMaterial,
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
      // The shared palette (graphics/materials.ts) now seeds this slot with a real procedural
      // fallback texture at construction time (previously undefined) — dispose it before
      // overwriting, or every governed-texture load leaks the fallback's WebGL texture.
      (material[slot] as THREE_NS.Texture | undefined)?.dispose();
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
        this.scene.environmentIntensity = 0.46;
        // HDRI pozostaje źródłem IBL dla PBR, lecz nie przejmuje horyzontu brązowym kadrem alei.
        this.scene.background = new this.THREE.Color(0x101923);
        this.scene.fog = new this.THREE.FogExp2(0x142331, 0.018);
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
      // These GLTF assets attach after init()'s own shadow-policy pass already ran (they're
      // loaded async) — re-run it so they get the same size-based cast/receive decision instead
      // of keeping whatever the loader's own traverse() forced.
      if (this.THREE && this.scene) applyShadowPolicy(this.THREE, this.scene);
    } catch {
      // Brak pliku lub błąd WebGL nie zastępuje assetu niezweryfikowanym fallbackiem.
    }
  }

  /**
   * GENESIS GRAPHICS ENGINE — VISUAL WORLD BUILD 3.0: asset-pipeline swap proof
   * (`graphics/assetPipeline.ts`'s `createAssetSlot`), end to end with a real governed asset — not
   * just the seam in isolation. `/assets/genesis-procedural/ambulance/ambulance.glb` is a REAL,
   * valid binary glTF (see `scripts/exportAmbulanceAsset.mjs` and its `assetGovernance.ts` manifest
   * entry for full provenance): if it loads, `slot.replace()` swaps it in at the procedural
   * fallback's exact transform and disposes the fallback; if it fails to load (network, asset
   * missing), the procedural `createVehicle` fallback this method was given simply stays exactly as
   * it already was — never a gap, never a crash.
   */
  private async loadAmbulanceAsset(slot: AssetSlotHandle): Promise<void> {
    const path = '/assets/genesis-procedural/ambulance/ambulance.glb';
    if (!this.THREE || !isWorldAssetApproved(path)) return;
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(path);
      // The slot may have been disposed (scene torn down) while this async load was in flight —
      // `AssetSlotHandle.dispose()` detaches `.current` from its parent, so a null parent here means
      // there is no live scene left to swap into.
      if (!slot.current.parent) return;
      const real = gltf.scene;
      real.traverse((node) => {
        const mesh = node as THREE_NS.Mesh;
        if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
      });
      slot.replace(real);
    } catch {
      // Procedural fallback stays in place — no asset, no crash, no silent gap.
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
    createBackgroundFill(THREE, this.scene, { skyColor: 0xa9c8df, groundColor: 0x20362d, intensity: 0.96 });
    this.scene.add(new THREE.AmbientLight(0x486682, 0.20));
    createSunLight(THREE, this.scene, {
      position: [9, 16, 10], color: 0xffcc91, intensity: 1.74,
      shadowMapSize: 1024, shadowFrustumHalfExtent: 13, shadowBias: -0.00035,
    });
    const rim = new THREE.DirectionalLight(0x87c5f2, 0.94);
    rim.position.set(-9, 9, -8);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0x8edcc5, 0.28);
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

    // Podziały płyt i niskie słupki są wyłącznie skalą chodnika: wynikają z
    // już istniejącej siatki ulic, nie tworzą danych ruchu, tras ani transportu.
    const paverSlots: Array<{ x: number; z: number; turn: boolean }> = [];
    for (const y of streets.h) {
      const z = (y - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE;
      for (let x = -worldW / 2 + 0.18; x < worldW / 2; x += 0.46) {
        paverSlots.push({ x, z: z - 0.29, turn: false }, { x, z: z + 0.29, turn: false });
      }
    }
    for (const x of streets.v) {
      const px = (x - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE;
      for (let z = -worldH / 2 + 0.18; z < worldH / 2; z += 0.46) {
        paverSlots.push({ x: px - 0.29, z, turn: true }, { x: px + 0.29, z, turn: true });
      }
    }
    const paverJoints = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.010, 0.008, 0.105),
      new THREE.MeshStandardMaterial({ color: 0x5b6871, roughness: 0.92, metalness: 0.02 }),
      paverSlots.length,
    );
    paverSlots.forEach((slot, index) => {
      position.set(slot.x, 0.018, slot.z);
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), slot.turn ? Math.PI / 2 : 0);
      matrix.compose(position, rotation, scale); paverJoints.setMatrixAt(index, matrix);
    });
    paverJoints.instanceMatrix.needsUpdate = true;
    paverJoints.name = 'visual-only-sidewalk-paver-joints';

    const bollardSlots: Array<{ x: number; z: number }> = [];
    streets.v.forEach((x) => streets.h.forEach((y) => {
      const ix = (x - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE;
      const iz = (y - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE;
      bollardSlots.push({ x: ix - 0.36, z: iz - 0.36 }, { x: ix + 0.36, z: iz + 0.36 });
    }));
    const bollards = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.028, 0.034, 0.20, 8),
      new THREE.MeshStandardMaterial({ color: 0x394956, roughness: 0.50, metalness: 0.56 }),
      bollardSlots.length,
    );
    bollardSlots.forEach((slot, index) => {
      position.set(slot.x, 0.10, slot.z); rotation.identity(); matrix.compose(position, rotation, scale); bollards.setMatrixAt(index, matrix);
    });
    bollards.instanceMatrix.needsUpdate = true;
    bollards.name = 'visual-only-intersection-bollards';
    const groundCadence = new THREE.Group();
    groundCadence.name = 'visual-only-ground-cadence';
    groundCadence.userData.visualOnlyContext = true;
    groundCadence.add(paverJoints, bollards);
    groundCadence.traverse((node) => {
      const mesh = node as THREE_NS.Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
    });
    this.scene.add(groundCadence); this.buildingMeshes.push(groundCadence);

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
    const roadWidth = CITY_ROAD_WIDTH_SCENE;
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
    // Every window pane `createBuilding()`/`createContextBuilding()` collected above (both are called
    // by this point — the former just above, the latter inside `addDistrictInfill()`) gets baked into
    // 3 InstancedMeshes here, in one call, before any of the already-instanced generators below run.
    this.flushWindowInstances();
    // SPRINT F+: same "collect during generation, bake once" move for the remaining identical
    // per-context-building structural trim (roof/roofUnit/plinth/cornice) — see the method's own doc.
    this.flushContextStructuralInstances();
    this.addUrbanCadence();
    // Optional call keeps a live HMR-retained renderer from crashing while the
    // newly defined visual-only method reaches a freshly constructed City3D instance.
    this.addPerimeterDistrict?.();
    this.addFarCityBackdrop();
  }

  /**
   * GRAPHICS V7 — real congestion, painted onto the SAME road geometry `addRoadsAndBuildings()` just
   * built (same street coordinates, same `CITY_WORLD_SCALE`), not a second road system. One thin
   * colored slab per real CTM cell (`this.trafficNetwork.links[].cells`), so real spatial phenomena
   * the Godunov scheme actually produces — a queue forming at a signal, a shockwave propagating back
   * from it — are visible as real per-cell color variation along a street, not a single per-street
   * average that would flatten out exactly the behaviour this solver exists to show. One
   * `InstancedMesh` for every cell across the whole network (one draw call regardless of cell count,
   * same discipline as this file's `flushWindowInstances`/`analysisMesh`), recolored every frame
   * from each cell's live `densityVehPerKm` (see `syncTrafficOverlay`) via `setInstanceColor`'s
   * partial-buffer upload — never rebuilt.
   *
   * Cell positions are derived the same way `buildTrafficNetwork` derived the cells themselves: a
   * link's cell `i` spans real world-units `[i·cellLength, (i+1)·cellLength)` along its street,
   * starting at that street's own origin (world x=0 for an EW/horizontal street, world y=0 for an
   * NS/vertical one) — the exact convention `roadNetwork.ts`'s `road:h:${row}`/`road:v:${col}`
   * segments use, since `this.trafficNetwork` was built from this scene's own real
   * `roadNetworkView()`.
   */
  private addTrafficOverlay(): void {
    if (!this.THREE || !this.scene) return;
    const THREE = this.THREE;
    const streets = this.simulation.streets;
    const worldWidth = this.simulation.worldWidth;
    const worldHeight = this.simulation.worldHeight;
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 });
    const batch = new InstanceBatch(THREE, new THREE.BoxGeometry(1, 1, 1), material);
    const overlayHeight = 0.006;
    const overlayY = 0.021; // just above the road surface (top ~0.017-0.019) — real geometric separation, not a depthWrite hack.
    const overlayWidthScene = CITY_ROAD_WIDTH_SCENE * 0.82; // slightly narrower than the road so lane markings/curbs stay visible at the edges.

    this.trafficCellRefs = [];
    for (const link of this.trafficNetwork.links) {
      const isEW = link.orientation === 'EW';
      const crossStreetWorld = isEW ? streets.h[link.streetIndex] : streets.v[link.streetIndex];
      if (crossStreetWorld === undefined) continue; // defensive: streetIndex always comes from this exact streets array, should not happen.
      const crossScene = isEW
        ? (crossStreetWorld - worldHeight / 2) * CITY_WORLD_SCALE
        : (crossStreetWorld - worldWidth / 2) * CITY_WORLD_SCALE;

      let alongWorld = 0;
      for (const cell of link.cells) {
        const midAlongWorld = alongWorld + cell.lengthM / 2;
        const alongScene = isEW
          ? (midAlongWorld - worldWidth / 2) * CITY_WORLD_SCALE
          : (midAlongWorld - worldHeight / 2) * CITY_WORLD_SCALE;
        const cellLengthScene = cell.lengthM * CITY_WORLD_SCALE;
        const position: THREE_NS.Vector3Tuple = isEW ? [alongScene, overlayY, crossScene] : [crossScene, overlayY, alongScene];
        const scale: THREE_NS.Vector3Tuple = isEW
          ? [cellLengthScene, overlayHeight, overlayWidthScene]
          : [overlayWidthScene, overlayHeight, cellLengthScene];
        // Real starting color for zero density — free-flow green, the same convention
        // syncTrafficOverlay recomputes every frame afterward via severityColor.
        batch.add(position, [0, 0, 0], scale, 0x3ddc84);
        this.trafficCellRefs.push(cell);
        alongWorld += cell.lengthM;
      }
    }

    const mesh = batch.build(this.scene, false);
    if (mesh) {
      mesh.name = 'genesis-city-traffic-overlay';
      this.trafficMesh = mesh;
      this.buildingMeshes.push(mesh);
    }
  }

  /**
   * Recolors every real traffic cell from its CURRENT `densityVehPerKm` — called every frame
   * (`syncScene`), since unlike the molecule scene's static conformer, traffic genuinely evolves
   * continuously. Cheap: `setInstanceColor` uploads exactly the touched instances' bytes, and this
   * network's cell count is tens, not thousands. `t = 1 − speed/freeFlowSpeed` (0 = free-flowing,
   * 1 = jammed) maps onto `stateVisualization.ts`'s own real green→amber→red severity convention —
   * the same "how concerning is this real value" language every other state-driven visual in this
   * engine already uses, not a bespoke traffic-only color ramp.
   */
  private syncTrafficOverlay(): void {
    if (!this.trafficMesh || !this.THREE) return;
    const THREE = this.THREE;
    const fd = DEFAULT_GREENSHIELDS;
    for (let i = 0; i < this.trafficCellRefs.length; i++) {
      const cell = this.trafficCellRefs[i]!;
      const speedFraction = greenshieldsSpeedMS(cell.densityVehPerKm, fd) / fd.freeFlowSpeedMS;
      setInstanceColor(this.trafficMesh, i, severityColor(THREE, 1 - speedFraction));
    }
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
    group.add(body);
    // GRAPHICS V2 SPRINT F+: roof/roofUnit/plinth/cornice below are all identical in appearance
    // across every context building (roof varies only by the 4-entry `palette.roof`, the other
    // three are fixed constants) — collected as WORLD-SPACE instance placements instead of built as
    // per-building Mesh+Material pairs; `flushContextStructuralInstances()` bakes them into a
    // handful of city-wide InstancedMeshes once every context building has been generated (same
    // technique as `windowInstancesContext` above).
    this.contextRoofInstances.push({ position: [x, height + 0.05, z], scale: [w * 1.07, 0.11, d * 1.09], color: palette.roof });
    // GRAPHICS V2 SPRINT C-1: same instancing move as `createBuilding()` above — every context
    // building's window panes go into one global, city-wide `InstancedMesh` (per-instance COLOR
    // carries this building's own `palette.glass` tint, since all context windows share the same
    // constant emissiveIntensity already, unlike the real buildings' lit/dark contrast).
    const columns = Math.max(1, Math.floor(w / 0.22));
    const rows = Math.max(2, Math.floor(height / 0.20));
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const position: THREE_NS.Vector3Tuple = [x - w / 2 + (col + 1) * w / (columns + 1), 0.19 + row * Math.min(0.20, (height - 0.24) / rows), z + d / 2 + 0.012];
      const scale: THREE_NS.Vector3Tuple = [Math.min(0.11, w / (columns + 1.5)), 0.085, 0.018];
      this.windowInstancesContext.push({ position, scale, color: palette.glass });
    }
    if (serial % 3 === 0) {
      this.contextRoofUnitInstances.push({
        position: [x + w * 0.18, height + 0.15, z - d * 0.18],
        scale: [Math.min(0.22, w * 0.25), 0.10, Math.min(0.18, d * 0.28)],
      });
    }
    // Ciemniejszy parter i cofnięty gzyms rozbijają sylwetę pudełka, bez dodawania obiektu modelu.
    const plinthHeight = Math.min(0.18, height * 0.22);
    this.contextPlinthInstances.push({ position: [x, plinthHeight / 2, z], scale: [w * 1.015, plinthHeight, d * 1.015] });
    this.contextCorniceInstances.push({ position: [x, height * 0.72, z], scale: [w * 1.10, 0.035, d * 1.12] });
    group.userData.visualOnlyContext = true;
    this.cameraOccluders.push({
      centerX: x,
      centerZ: z,
      halfWidth: w / 2,
      halfDepth: d / 2,
      top: height + (serial % 3 === 0 ? 0.20 : 0.105),
    });
    group.position.set(x, 0, z);
    return group;
  }

  /**
   * Bakes every window pane collected by `createBuilding()`/`createContextBuilding()` during this
   * `init()` call into three `InstancedMesh`es (real-building lit, real-building dark, context) and
   * adds them directly to the scene. Call once, after every building-generating method has run.
   * Empty inputs are skipped rather than building a zero-instance mesh.
   */
  private flushWindowInstances(): void {
    if (!this.THREE || !this.scene) return;
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.name = 'genesis-city-window-instances';
    group.userData.visualOnlyContext = true;

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();

    const bakeUniform = (
      entries: readonly { position: THREE_NS.Vector3Tuple; scale: THREE_NS.Vector3Tuple }[],
      material: THREE_NS.Material,
      name: string,
    ): void => {
      if (entries.length === 0) return;
      const mesh = new THREE.InstancedMesh(unitBox, material, entries.length);
      mesh.name = name;
      entries.forEach((entry, i) => {
        position.set(...entry.position);
        scale.set(...entry.scale);
        matrix.compose(position, rotation, scale);
        mesh.setMatrixAt(i, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    };

    bakeUniform(
      this.windowInstancesLit,
      new THREE.MeshStandardMaterial({ color: 0xd8efff, emissive: 0x8ccfff, emissiveIntensity: 0.82, roughness: 0.28, metalness: 0.14 }),
      'genesis-city-windows-lit',
    );
    bakeUniform(
      this.windowInstancesDark,
      new THREE.MeshStandardMaterial({ color: 0x426b88, emissive: 0x10243a, emissiveIntensity: 0.25, roughness: 0.38, metalness: 0.16 }),
      'genesis-city-windows-dark',
    );

    if (this.windowInstancesContext.length > 0) {
      const contextMesh = new THREE.InstancedMesh(
        unitBox,
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.34, roughness: 0.24, metalness: 0.18 }),
        this.windowInstancesContext.length,
      );
      contextMesh.name = 'genesis-city-windows-context';
      const colorScratch = new THREE.Color();
      this.windowInstancesContext.forEach((entry, i) => {
        position.set(...entry.position);
        scale.set(...entry.scale);
        matrix.compose(position, rotation, scale);
        contextMesh.setMatrixAt(i, matrix);
        contextMesh.setColorAt(i, colorScratch.set(entry.color));
      });
      contextMesh.instanceMatrix.needsUpdate = true;
      if (contextMesh.instanceColor) contextMesh.instanceColor.needsUpdate = true;
      contextMesh.castShadow = true;
      contextMesh.receiveShadow = true;
      group.add(contextMesh);
    }

    if (group.children.length > 0) {
      this.scene.add(group);
      this.buildingMeshes.push(group);
    } else {
      unitBox.dispose();
    }

    this.windowInstancesLit = [];
    this.windowInstancesDark = [];
    this.windowInstancesContext = [];
  }

  /**
   * GRAPHICS V2 SPRINT F+ — bakes `createContextBuilding()`'s roof/roofUnit/plinth/cornice
   * placements (see those fields' own doc) into a handful of city-wide `InstancedMesh`es, the same
   * technique `flushWindowInstances()` already uses. Kept as its own group/method rather than
   * folded into `flushWindowInstances()` so that method's own SPRINT C-1 regression test (which
   * asserts its group holds AT MOST 3 InstancedMeshes) keeps meaning exactly what it says.
   */
  private flushContextStructuralInstances(): void {
    if (!this.THREE || !this.scene) return;
    const THREE = this.THREE;
    const group = new THREE.Group();
    group.name = 'genesis-city-context-structural-instances';
    group.userData.visualOnlyContext = true;

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();

    const bakeUniform = (
      entries: readonly { position: THREE_NS.Vector3Tuple; scale: THREE_NS.Vector3Tuple }[],
      material: THREE_NS.Material,
      name: string,
    ): void => {
      if (entries.length === 0) return;
      const mesh = new THREE.InstancedMesh(unitBox, material, entries.length);
      mesh.name = name;
      entries.forEach((entry, i) => {
        position.set(...entry.position);
        scale.set(...entry.scale);
        matrix.compose(position, rotation, scale);
        mesh.setMatrixAt(i, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    };

    if (this.contextRoofInstances.length > 0) {
      const roofMesh = new THREE.InstancedMesh(
        unitBox,
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0.18 }),
        this.contextRoofInstances.length,
      );
      roofMesh.name = 'genesis-city-context-roofs';
      const colorScratch = new THREE.Color();
      this.contextRoofInstances.forEach((entry, i) => {
        position.set(...entry.position);
        scale.set(...entry.scale);
        matrix.compose(position, rotation, scale);
        roofMesh.setMatrixAt(i, matrix);
        roofMesh.setColorAt(i, colorScratch.set(entry.color));
      });
      roofMesh.instanceMatrix.needsUpdate = true;
      if (roofMesh.instanceColor) roofMesh.instanceColor.needsUpdate = true;
      roofMesh.castShadow = true;
      roofMesh.receiveShadow = true;
      group.add(roofMesh);
    }
    bakeUniform(
      this.contextRoofUnitInstances,
      new THREE.MeshStandardMaterial({ color: 0x65717d, roughness: 0.72, metalness: 0.22 }),
      'genesis-city-context-roof-units',
    );
    bakeUniform(
      this.contextPlinthInstances,
      new THREE.MeshStandardMaterial({ color: 0x25313b, roughness: 0.52, metalness: 0.12 }),
      'genesis-city-context-plinths',
    );
    bakeUniform(
      this.contextCorniceInstances,
      new THREE.MeshStandardMaterial({ color: 0xced4d4, roughness: 0.48, metalness: 0.18 }),
      'genesis-city-context-cornices',
    );

    if (group.children.length > 0) {
      this.scene.add(group);
      this.buildingMeshes.push(group);
    } else {
      unitBox.dispose();
    }

    this.contextRoofInstances = [];
    this.contextRoofUnitInstances = [];
    this.contextPlinthInstances = [];
    this.contextCorniceInstances = [];
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
    const sideWindows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, 0.045, 0.13), new THREE.MeshStandardMaterial({ color: 0xbcdaf0, emissive: 0x4c81a5, emissiveIntensity: 0.42, roughness: 0.24, metalness: 0.16 }), masses.length * 12);
    const facadeBands = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x26313d, roughness: 0.64, metalness: 0.20 }), masses.length * 2);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const litTones = [new THREE.Color(0xc5e7f8), new THREE.Color(0xffe0a6), new THREE.Color(0x9dd8ff)];
    let coolIndex = 0; let warmIndex = 0; let windowIndex = 0; let sideWindowIndex = 0; let bandIndex = 0;
    masses.forEach(([x, z, w, d, h], index) => {
      position.set(x, h / 2, z); scale.set(w, h, d); matrix.compose(position, rotation, scale);
      (index % 2 === 0 ? coolMasses : warmMasses).setMatrixAt(index % 2 === 0 ? coolIndex++ : warmIndex++, matrix);
      position.set(x, h + 0.055, z); scale.set(w * 1.08, 0.11, d * 1.08); matrix.compose(position, rotation, scale); caps.setMatrixAt(index, matrix);
      for (let level = 0; level < 3; level++) for (let col = -1; col <= 2; col++) {
        position.set(x - w * 0.25 + col * w * 0.17, 0.58 + level * 0.48, z + d / 2 + 0.014);
        scale.set(1, 1, 1); matrix.compose(position, rotation, scale); windows.setMatrixAt(windowIndex++, matrix);
        windows.setColorAt(windowIndex - 1, litTones[(index + level * 2 + col + 3) % litTones.length]);
        position.set(x + w / 2 + 0.014, 0.58 + level * 0.48, z - d * 0.24 + col * d * 0.16);
        matrix.compose(position, rotation, scale); sideWindows.setMatrixAt(sideWindowIndex++, matrix);
        sideWindows.setColorAt(sideWindowIndex - 1, litTones[(index + level + col + 4) % litTones.length]);
      }
      position.set(x, 0.98, z + d / 2 + 0.013); scale.set(w * 0.88, 0.032, 0.018); matrix.compose(position, rotation, scale); facadeBands.setMatrixAt(bandIndex++, matrix);
      position.set(x + w / 2 + 0.013, 0.98, z); scale.set(0.018, 0.032, d * 0.86); matrix.compose(position, rotation, scale); facadeBands.setMatrixAt(bandIndex++, matrix);
    });
    coolMasses.count = coolIndex; warmMasses.count = warmIndex; windows.count = windowIndex; sideWindows.count = sideWindowIndex; facadeBands.count = bandIndex;
    coolMasses.instanceMatrix.needsUpdate = true; warmMasses.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true; windows.instanceMatrix.needsUpdate = true; sideWindows.instanceMatrix.needsUpdate = true; facadeBands.instanceMatrix.needsUpdate = true;
    if (windows.instanceColor) windows.instanceColor.needsUpdate = true;
    if (sideWindows.instanceColor) sideWindows.instanceColor.needsUpdate = true;
    const context = new THREE.Group(); context.name = 'visual-only-perimeter-district'; context.userData.visualOnlyContext = true; context.userData.streetHidden = true;
    context.add(coolMasses, warmMasses, caps, windows, sideWindows, facadeBands); context.traverse((node) => { const mesh = node as THREE_NS.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
    this.scene.add(context); this.buildingMeshes.push(context);
  }

  /**
   * Low-detail outer skyline extends the same city frame beyond the primary
   * semantic district. It is one instanced visual-only horizon layer: no IDs,
   * no locations, no agent targets, no routing and no epidemiological meaning.
   */
  private addFarCityBackdrop(): void {
    if (!this.THREE || !this.scene) return;
    const THREE = this.THREE;
    const parcels = [
      [-5.80, -5.10, 1.10, 0.52, 1.45], [-4.25, -5.18, 0.82, 0.58, 1.12], [-2.88, -5.06, 1.22, 0.48, 1.58], [-1.12, -5.20, 0.92, 0.55, 1.28], [0.42, -5.08, 1.12, 0.52, 1.72], [2.10, -5.18, 0.82, 0.58, 1.18], [3.52, -5.10, 1.20, 0.50, 1.54], [5.18, -5.16, 0.90, 0.54, 1.30],
      [-5.65, 5.02, 1.02, 0.56, 1.34], [-4.10, 5.16, 1.24, 0.50, 1.62], [-2.30, 5.04, 0.86, 0.58, 1.16], [-0.82, 5.18, 1.14, 0.52, 1.48], [0.90, 5.06, 0.92, 0.56, 1.24], [2.42, 5.16, 1.26, 0.48, 1.68], [4.22, 5.02, 0.86, 0.56, 1.20], [5.42, 5.16, 0.74, 0.50, 1.08],
    ] as const;
    const massMaterial = this.cityMaterials?.concrete.clone() ?? new THREE.MeshStandardMaterial({ color: 0x43525f, roughness: 0.88, metalness: 0.06 });
    massMaterial.color.multiply(new THREE.Color(0x596d7d));
    const horizonMasses = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), massMaterial, parcels.length);
    const horizonBands = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.026, 0.018),
      new THREE.MeshStandardMaterial({ color: 0x9bc9df, emissive: 0x315e75, emissiveIntensity: 0.34, roughness: 0.32, metalness: 0.18 }),
      parcels.length * 2,
    );
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    let bandIndex = 0;
    parcels.forEach(([x, z, w, d, h], index) => {
      position.set(x, h / 2, z); scale.set(w, h, d); matrix.compose(position, rotation, scale); horizonMasses.setMatrixAt(index, matrix);
      const facingZ = z < 0 ? z + d / 2 + 0.012 : z - d / 2 - 0.012;
      for (const ratio of [0.38, 0.68]) {
        position.set(x, h * ratio, facingZ); scale.set(w * 0.70, 1, 1); matrix.compose(position, rotation, scale); horizonBands.setMatrixAt(bandIndex++, matrix);
      }
    });
    horizonBands.count = bandIndex;
    horizonMasses.instanceMatrix.needsUpdate = true; horizonBands.instanceMatrix.needsUpdate = true;
    horizonMasses.name = 'visual-only-far-city-masses'; horizonBands.name = 'visual-only-far-city-window-bands';
    const context = new THREE.Group();
    context.name = 'visual-only-far-city-backdrop';
    context.userData.visualOnlyContext = true;
    context.userData.streetHidden = true;
    context.add(horizonMasses, horizonBands);
    context.traverse((node) => { const mesh = node as THREE_NS.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
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
    const worldW = this.simulation.worldWidth * CITY_WORLD_SCALE;
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

    // Spójne kompozycje uliczne: statyczne przejścia, oznaczenia zatok i mała
    // architektura są wyprowadzone wyłącznie z bieżącej siatki ulic. Nie są
    // pojazdami, transportem publicznym, trasą ani modelem mobilności.
    const crosswalkAlongX = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.046, 0.008, 0.115),
      new THREE.MeshBasicMaterial({ color: 0xe4edf1, transparent: true, opacity: 0.82 }),
      this.simulation.streets.v.length * this.simulation.streets.h.length * 4,
    );
    const crosswalkAlongZ = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.115, 0.008, 0.046),
      new THREE.MeshBasicMaterial({ color: 0xe4edf1, transparent: true, opacity: 0.82 }),
      this.simulation.streets.v.length * this.simulation.streets.h.length * 4,
    );
    const bayTicks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.018, 0.008, 0.15),
      new THREE.MeshBasicMaterial({ color: 0xc3d2d8, transparent: true, opacity: 0.58 }),
      this.simulation.streets.h.length * 12,
    );
    const streetBenches = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.22, 0.055, 0.085),
      new THREE.MeshStandardMaterial({ color: 0x815739, roughness: 0.76, metalness: 0.10 }),
      planterSlots.length,
    );
    const litterBins = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.065, 0.12, 0.065),
      new THREE.MeshStandardMaterial({ color: 0x3b4e58, roughness: 0.50, metalness: 0.48 }),
      planterSlots.length,
    );
    let xCrossingIndex = 0;
    let zCrossingIndex = 0;
    let bayIndex = 0;
    this.simulation.streets.v.forEach((x, column) => this.simulation.streets.h.forEach((y, row) => {
      const px = (x - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE;
      const pz = (y - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE;
      for (let stripe = 0; stripe < 4; stripe++) {
        position.set(px - 0.15 + stripe * 0.10, 0.023, pz - 0.23); rotation.identity(); scale.set(1, 1, 1); matrix.compose(position, rotation, scale);
        crosswalkAlongX.setMatrixAt(xCrossingIndex++, matrix);
        position.set(px - 0.23, 0.023, pz - 0.15 + stripe * 0.10); matrix.compose(position, rotation, scale);
        crosswalkAlongZ.setMatrixAt(zCrossingIndex++, matrix);
      }
      if ((row + column) % 2 === 0) {
        position.set(px + 0.48, 0.04, pz + 0.30); rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2); matrix.compose(position, rotation, scale);
        streetBenches.setMatrixAt((row * this.simulation.streets.v.length + column) % planterSlots.length, matrix);
        position.set(px + 0.33, 0.06, pz + 0.30); rotation.identity(); matrix.compose(position, rotation, scale);
        litterBins.setMatrixAt((row * this.simulation.streets.v.length + column) % planterSlots.length, matrix);
      }
    }));
    this.simulation.streets.h.forEach((y, row) => {
      const z = (y - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE + 0.30;
      for (let slot = 0; slot < 12; slot++) {
        const x = -worldW / 2 + 0.48 + slot * (worldW - 0.96) / 11;
        if ((slot + row) % 3 === 0) continue;
        position.set(x, 0.022, z); rotation.identity(); matrix.compose(position, rotation, scale); bayTicks.setMatrixAt(bayIndex++, matrix);
      }
    });
    crosswalkAlongX.count = xCrossingIndex; crosswalkAlongZ.count = zCrossingIndex; bayTicks.count = bayIndex;
    crosswalkAlongX.instanceMatrix.needsUpdate = true; crosswalkAlongZ.instanceMatrix.needsUpdate = true; bayTicks.instanceMatrix.needsUpdate = true;
    streetBenches.instanceMatrix.needsUpdate = true; litterBins.instanceMatrix.needsUpdate = true;
    crosswalkAlongX.name = 'visual-only-crosswalks-horizontal'; crosswalkAlongZ.name = 'visual-only-crosswalks-vertical';
    bayTicks.name = 'visual-only-parking-bay-ticks'; streetBenches.name = 'visual-only-street-benches'; litterBins.name = 'visual-only-street-bins';
    const context = new THREE.Group();
    context.name = 'visual-only-urban-cadence';
    context.userData.visualOnlyContext = true;
    context.add(roofUnits, skylights, planters, shrubs, crosswalkAlongX, crosswalkAlongZ, bayTicks, streetBenches, litterBins);
    context.traverse((node) => {
      const mesh = node as THREE_NS.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    this.scene.add(context);
    this.buildingMeshes.push(context);
  }

  /**
   * GENESIS GRAPHICS ENGINE — VISUAL WORLD BUILD 1.0: real production use of the new
   * building/street/vehicle/vegetation kits (`graphics/buildingKit.ts`, `graphics/streetKit.ts`,
   * `graphics/vehicleKit.ts`, `graphics/vegetation.ts`) — purely ADDITIVE on top of the existing,
   * proven `createBuilding`/`addRoadsAndBuildings`/`addUrbanCadence` output, never replacing it.
   *
   * Two categories of content, kept honest about which is which:
   *  - Hospital detailing (ambulance bay, rooftop HVAC, a parked ambulance, hospital-frontage
   *    trees, a service building) is anchored to the REAL hospital `WorldObject` CityWorld already
   *    placed (`this.semanticBuildingSlots`) — it decorates a real location, it doesn't invent one.
   *  - Rooftop equipment on other real buildings, street furniture (hydrants/utility boxes), extra
   *    parked vehicles, and park ground clutter are DECORATIVE population/context — same documented
   *    status as this file's own `createContextBuilding`/`addUrbanCadence` output: never a
   *    WorldFrame/C3 entity, never a location, never an agent target.
   */
  private addCityExtras(): void {
    if (!this.THREE || !this.scene) return;
    const THREE = this.THREE;
    const streets = this.simulation.streets;
    const worldWidth = this.simulation.worldWidth;
    const worldHeight = this.simulation.worldHeight;

    const brushedMetal = createPBRMaterial(THREE, 'BRUSHED_METAL') as THREE_NS.MeshStandardMaterial;
    const paintedMetal = createPBRMaterial(THREE, 'PAINTED_METAL') as THREE_NS.MeshStandardMaterial;
    const concreteMaterial: THREE_NS.Material = this.cityMaterials?.concrete ?? paintedMetal;
    const canopyMaterial = paintedMetal.clone();
    canopyMaterial.color.setHex(0xd9e1e8);

    const extras = new THREE.Group();
    extras.name = 'visual-world-build-city-extras';
    extras.userData.visualOnlyContext = true;

    // --- Hospital detail: anchored to the REAL hospital building CityWorld placed. ---
    const hospitalSlot = this.semanticBuildingSlots.find((slot) => slot.building.kind === 'hospital');
    if (hospitalSlot) {
      const dims = hospitalSlot.group.userData.cityBuilding as { width: number; depth: number; height: number };
      const hx = hospitalSlot.group.position.x;
      const hz = hospitalSlot.group.position.z;
      const bayDepth = 0.34;
      const bayWidth = Math.min(dims.depth * 0.62, 0.5);
      const bayCenterX = hx + dims.width / 2 + bayDepth / 2 + 0.03;
      extras.add(createAmbulanceBay(THREE, {
        position: [bayCenterX, 0, hz],
        width: bayDepth, depth: bayWidth,
        canopyMaterial, padMaterial: concreteMaterial,
      }));
      extras.add(createRooftopEquipment(THREE, {
        position: [hx, dims.height, hz], footprintWidth: dims.width, footprintDepth: dims.depth,
        unitCount: 4, seed: 17, material: brushedMetal,
      }));
      const ambulance = createVehicle(THREE, {
        kind: 'ambulance',
        position: [bayCenterX, 0, hz],
        headingRadians: Math.PI / 2,
        bodyMaterial: new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.35, metalness: 0.2 }),
        state: 'PARKED',
        seed: 3,
      });
      // GENESIS GRAPHICS ENGINE — VISUAL WORLD BUILD 3.0: asset-pipeline swap proof
      // (graphics/assetPipeline.ts's createAssetSlot). The procedural ambulance renders
      // immediately; if the real, governed GLB asset loads, it swaps in at the exact same
      // transform, and the procedural fallback is disposed — never both at once, never a gap
      // where nothing is shown.
      const ambulanceSlot = createAssetSlot(ambulance.group);
      extras.add(ambulanceSlot.current);
      void this.loadAmbulanceAsset(ambulanceSlot);
      // Small service/utility building behind the hospital (opposite the entrance facade) — the
      // "service access" the mission's hospital composition asks for, using the new industrial
      // building kit rather than hand-inlined geometry.
      extras.add(createIndustrialBuilding(THREE, {
        position: [hx, 0, hz - dims.depth / 2 - 0.32],
        width: dims.width * 0.5, depth: 0.3, kind: 'industrial', seed: 29,
        wallMaterial: brushedMetal, roofMaterial: paintedMetal,
      }));
      // Ground-level electrical service beside the hospital's own service building — geometry only,
      // no electrical state of any kind (see electricalKit.ts's own "seam, not science" doc).
      extras.add(createElectricalCabinet(THREE, {
        position: [hx + dims.width * 0.32, 0, hz - dims.depth / 2 - 0.20],
        bodyMaterial: paintedMetal, hazardStripeMaterial: new THREE.MeshBasicMaterial({ color: 0xf5c542 }),
      }));
      extras.add(createCondenserUnit(THREE, {
        position: [hx + dims.width * 0.32 + 0.16, 0, hz - dims.depth / 2 - 0.20],
        bodyMaterial: brushedMetal,
      }));
      const hospitalTrees = createTreeField(THREE, {
        count: 6, width: dims.width * 0.5, depth: 0.3, center: [hx - dims.width / 2 - 0.22, hz],
        // `vegetation.ts`'s default scaleRange assumes a normal outdoor-scene scale (trunk ~1.6m).
        // This city renders at CITY_WORLD_SCALE-compressed units (buildings are ~1-2 units tall,
        // the park's own hand-placed trees are a 0.55-unit ConeGeometry) — matching that scale here,
        // not the module's own generic default, is what keeps a tree a tree instead of a landmark.
        scaleRange: [0.22, 0.32],
        seed: 0x4841a, trunkMaterial: brushedMetal, canopyMaterial: new THREE.MeshStandardMaterial({ color: 0x3d6b3f, roughness: 0.92 }),
      });
      extras.add(hospitalTrees.group);
    }

    // --- Sparse rooftop equipment on other real buildings — every roof reads as serviced, without
    // touching `createBuilding` itself. ---
    for (const slot of this.semanticBuildingSlots) {
      if (slot.building.kind === 'park' || slot.building.kind === 'hospital') continue;
      const seed = Math.abs(Math.round(slot.building.x * 13 + slot.building.y * 17));
      if (seed % 3 !== 0) continue;
      const dims = slot.group.userData.cityBuilding as { width: number; depth: number; height: number };
      extras.add(createRooftopEquipment(THREE, {
        position: [slot.group.position.x, dims.height, slot.group.position.z],
        footprintWidth: dims.width, footprintDepth: dims.depth,
        unitCount: 1 + (seed % 2), seed, material: brushedMetal, antenna: seed % 6 === 0,
      }));
    }

    // --- Street furniture: real hydrant/utility-box silhouettes at a subset of intersections,
    // distinct from `addUrbanCadence`'s own instanced bench/bin/planter cadence above. ---
    streets.v.forEach((x, col) => streets.h.forEach((y, row) => {
      const slot = row * streets.v.length + col;
      const px = (x - worldWidth / 2) * CITY_WORLD_SCALE;
      const pz = (y - worldHeight / 2) * CITY_WORLD_SCALE;
      if (slot % 4 === 1) extras.add(createHydrant(THREE, { position: [px + 0.62, 0, pz - 0.62], material: brushedMetal }));
      if (slot % 4 === 3) extras.add(createUtilityBox(THREE, { position: [px - 0.62, 0, pz + 0.62], headingRadians: Math.PI / 4, material: paintedMetal }));
    }));

    // --- Signage: real post signs at a subset of intersections (distinct slots from the hydrant/
    // utility-box loop above) and one hanging sign on the real shop building's own frontage. ---
    const signPanelMaterial = new THREE.MeshStandardMaterial({ color: 0xe7edf4, emissive: 0x9fd4ff, emissiveIntensity: 0.2, roughness: 0.4 });
    streets.v.forEach((x, col) => streets.h.forEach((y, row) => {
      const slot = row * streets.v.length + col;
      if (slot % 4 !== 0) return;
      const px = (x - worldWidth / 2) * CITY_WORLD_SCALE;
      const pz = (y - worldHeight / 2) * CITY_WORLD_SCALE;
      extras.add(createPostSign(THREE, {
        position: [px - 0.60, 0, pz - 0.35], headingRadians: ((slot % 3) * Math.PI) / 4,
        panelWidth: 0.16, panelHeight: 0.11, panelCenterHeight: 0.34,
        postMaterial: paintedMetal, panelMaterial: signPanelMaterial,
      }).group);
    }));
    const shopSlot = this.semanticBuildingSlots.find((slot) => slot.building.kind === 'shop');
    if (shopSlot) {
      const dims = shopSlot.group.userData.cityBuilding as { width: number; depth: number; height: number };
      extras.add(createHangingSign(THREE, {
        position: [shopSlot.group.position.x - dims.width * 0.3, dims.height * 0.42, shopSlot.group.position.z + dims.depth / 2],
        armLength: 0.14, dropHeight: 0.05, panelWidth: 0.18, panelHeight: 0.1,
        bracketMaterial: brushedMetal, panelMaterial: signPanelMaterial,
      }).group);
    }

    // --- Decorative parked vehicles along one real street — visible city population, never a
    // WorldFrame/C3 entity (see this method's own doc). ---
    if (streets.h.length > 0) {
      const y = streets.h[0]!;
      const z = (y - worldHeight / 2) * CITY_WORLD_SCALE + 0.30;
      const worldW = worldWidth * CITY_WORLD_SCALE;
      const kinds: Array<'car' | 'van'> = ['car', 'van', 'car', 'car', 'van', 'car'];
      kinds.forEach((kind, index) => {
        const x = -worldW / 2 + 1.1 + index * 1.35;
        if (x > worldW / 2 - 0.6) return;
        const vehicle = createVehicle(THREE, {
          kind, position: [x, 0, z], headingRadians: 0,
          bodyMaterial: new THREE.MeshStandardMaterial({ color: [0x8a3d3d, 0x3d5a8a, 0x6b6b6b, 0x3d8a5e, 0x8a7a3d][index % 5], roughness: 0.4, metalness: 0.25 }),
          state: 'PARKED', seed: index + 1,
        });
        extras.add(vehicle.group);
      });
    }

    // --- Extra ground clutter around the park — real production use of `vegetation.ts` beyond its
    // own isolated example file. ---
    const parkSlot = this.semanticBuildingSlots.find((slot) => slot.building.kind === 'park');
    if (parkSlot) {
      const clutter = createGroundClutter(THREE, {
        count: 14, width: 0.9, depth: 0.9, center: [parkSlot.group.position.x, parkSlot.group.position.z], seed: 0x7ee1a, material: concreteMaterial,
        // See the hospitalTrees scaleRange comment above — matching this city's compressed scale.
        scaleRange: [0.25, 0.45],
      });
      extras.add(clutter.group);
    }

    extras.traverse((node) => {
      const mesh = node as THREE_NS.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    this.scene.add(extras);
    this.buildingMeshes.push(extras);
  }

  /**
   * GENESIS GRAPHICS ENGINE — VISUAL WORLD BUILD 2.0: sets up the water-infrastructure C3
   * integration seam (`graphics/waterInfrastructureBridge.ts`) in this real production scene. See
   * that module's doc and this class's `infrastructureAdapter` field comment for the full honesty
   * contract — in short: no real C1/C3 pump/valve entity exists yet, so this renders exactly one
   * placeholder `WorldFrame` entity with no `status`, which the adapter renders as a real,
   * correctly-positioned pump WITHOUT any dynamic status — never a fabricated NORMAL/WARNING/
   * FAILED/OFFLINE reading (the object is tagged `userData.notModeled = true` instead). A short decorative pipe run
   * connects it toward the hospital wall, same status as this file's own `createContextBuilding`/
   * street furniture: real geometry, explicitly not a WorldFrame/C3 entity.
   */
  private initWaterInfrastructureSeam(): void {
    if (!this.THREE || !this.scene) return;
    const THREE = this.THREE;
    const brushedMetal = createPBRMaterial(THREE, 'BRUSHED_METAL') as THREE_NS.MeshStandardMaterial;
    const copper = new THREE.MeshStandardMaterial({ color: 0xb87a4a, roughness: 0.35, metalness: 0.85 });
    this.infrastructureAdapter = createWaterInfrastructureAdapter(THREE, { housingMaterial: brushedMetal, pipeMaterial: copper });
    this.infrastructureRenderer = new WorldFrameRenderer(THREE, this.scene, {
      resolveVisual: this.infrastructureAdapter.resolveVisual,
      updateVisual: this.infrastructureAdapter.updateVisual,
    });
    this.syncWaterInfrastructureSeam();

    const hospitalSlot = this.semanticBuildingSlots.find((slot) => slot.building.kind === 'hospital');
    if (hospitalSlot) {
      const dims = hospitalSlot.group.userData.cityBuilding as { width: number; depth: number; height: number };
      const hx = hospitalSlot.group.position.x;
      const hz = hospitalSlot.group.position.z;
      const pumpPosition = this.infrastructurePlaceholderPosition(hospitalSlot.group.position, dims);
      const pipe = createPipeNetwork(THREE, {
        waypoints: [[pumpPosition[0], 0.1, pumpPosition[2]], [hx, 0.1, hz - dims.depth / 2 - 0.05]],
        radius: 0.014, material: copper,
      });
      pipe.userData.visualOnlyContext = true;
      this.scene.add(pipe);
      this.buildingMeshes.push(pipe);
    }
  }

  /** Placeholder position for the not-yet-real water/pump entity: beside the real hospital
   * building's own service-yard side (opposite its entrance facade), so it reads as plausible
   * infrastructure rather than a marker floating in open ground. */
  private infrastructurePlaceholderPosition(hospitalPosition: THREE_NS.Vector3, dims: { width: number; depth: number }): THREE_NS.Vector3Tuple {
    return [hospitalPosition.x + dims.width * 0.42, 0, hospitalPosition.z - dims.depth / 2 - 0.30];
  }

  private syncWaterInfrastructureSeam(): void {
    if (!this.infrastructureRenderer) return;
    const hospitalSlot = this.semanticBuildingSlots.find((slot) => slot.building.kind === 'hospital');
    const frame: WorldFrame = { time: this.timeSeconds, entities: [] };
    if (hospitalSlot) {
      const dims = hospitalSlot.group.userData.cityBuilding as { width: number; depth: number; height: number };
      frame.entities = [{
        id: 'infrastructure:city-water-pump-placeholder',
        position: this.infrastructurePlaceholderPosition(hospitalSlot.group.position, dims),
        visualHint: 'object:water-pump',
        // Deliberately NOT `grounding: 'NOT_MODELED'` — that field is about VISUAL identity ("do we
        // know what this looks like"), not scientific truth, and would make WorldFrameRenderer
        // itself swap in its own generic abstract placeholder sphere instead of a real pump (see
        // worldFrameRenderer.ts's own doc). A pump's appearance IS known; its STATE is not — so
        // `status` stays omitted, and the adapter's own honesty check (see
        // waterInfrastructureBridge.ts) is what actually prevents a fabricated NORMAL/WARNING/
        // FAILED/OFFLINE reading, tagging `userData.notModeled = true` instead.
      }];
    }
    this.infrastructureRenderer.sync(frame);
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
      // Warstwowy cokół, cofnięte szklenie parteru i rama wejścia rozbijają
      // bryłę na elewację → wejście → chodnik; nadal nie zmieniają lokacji modelu.
      const groundHeight = Math.min(0.34, s.height * 0.28);
      const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(w * 1.025, groundHeight, d * 1.025),
        new THREE.MeshStandardMaterial({ color: variation % 2 ? 0x283b48 : 0x35434b, roughness: 0.68, metalness: 0.12 }),
      );
      plinth.position.y = groundHeight / 2;
      const groundGlass = new THREE.Mesh(
        new THREE.BoxGeometry(Math.min(w * 0.46, 0.74), Math.max(0.15, groundHeight * 0.58), 0.026),
        new THREE.MeshStandardMaterial({ color: 0x7fa5b8, emissive: 0x1d485d, emissiveIntensity: 0.34, roughness: 0.22, metalness: 0.28 }),
      );
      groundGlass.position.set(variation % 2 ? -w * 0.20 : w * 0.20, groundHeight * 0.52, d / 2 + 0.017);
      const entryCanopy = new THREE.Mesh(
        new THREE.BoxGeometry(Math.min(w * 0.42, 0.52), 0.028, 0.13),
        new THREE.MeshStandardMaterial({ color: s.roof, roughness: 0.58, metalness: 0.26 }),
      );
      entryCanopy.position.set(variation % 2 ? w * 0.20 : -w * 0.20, groundHeight + 0.04, d / 2 + 0.075);
      group.add(plinth, groundGlass, entryCanopy);
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
      // GRAPHICS V2 SPRINT C-1: window panes are no longer individual Mesh objects — each one is
      // pushed (in WORLD space, since `group.position` is set only at the end of this function) into
      // `windowInstancesLit`/`windowInstancesDark`, baked into exactly two InstancedMeshes for the
      // whole city by `flushWindowInstances()` once every building has been generated. Same visual
      // result (still two distinct lit/dark materials, same positions/sizes), far fewer draw calls.
      const columns = Math.max(1, Math.floor(w / 0.30));
      const rows = Math.max(1, Math.floor(s.height / 0.31));
      const windowWidth = Math.min(0.15, w / (columns + 1.35));
      for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
        const lit = (row * 3 + col * 5 + variation) % 4 !== 0;
        const position: THREE_NS.Vector3Tuple = [x - w / 2 + (col + 1) * w / (columns + 1), 0.28 + row * 0.26, z + d / 2 + 0.014];
        const scale: THREE_NS.Vector3Tuple = [windowWidth, 0.115, 0.024];
        (lit ? this.windowInstancesLit : this.windowInstancesDark).push({ position, scale });
      }
      // Dwie współdzielone boczne bandy dają odczyt kondygnacji z obu stron
      // bryły, ale unikają setek pojedynczych okien i dodatkowych draw calls. Only 2 meshes per
      // building — cheap enough to stay individual Meshes rather than joining the window instancing.
      const sideBandDark = new THREE.MeshStandardMaterial({ color: 0x426b88, emissive: 0x10243a, emissiveIntensity: 0.25, roughness: 0.38, metalness: 0.16 });
      const sideBandLit = new THREE.MeshStandardMaterial({ color: 0xd8efff, emissive: 0x8ccfff, emissiveIntensity: 0.82, roughness: 0.28, metalness: 0.14 });
      for (const side of [-1, 1] as const) {
        const sideBand = new THREE.Mesh(
          new THREE.BoxGeometry(0.026, Math.min(0.44, s.height * 0.42), d * 0.62),
          (variation + (side > 0 ? 1 : 0)) % 4 === 0 ? sideBandDark : sideBandLit,
        );
        sideBand.position.set(side * (w / 2 + 0.014), s.height * 0.52, 0);
        group.add(sideBand);
      }
      const doorHeight = Math.min(0.48, s.height * 0.38);
      const door = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.19, w * 0.18), doorHeight, 0.038), new THREE.MeshStandardMaterial({ color: 0x183247, roughness: 0.64, metalness: 0.16, emissive: 0x091622, emissiveIntensity: 0.35 }));
      door.position.set(variation % 2 ? w * 0.22 : -w * 0.22, doorHeight / 2, d / 2 + 0.026); group.add(door);
      const entryFrameMat = new THREE.MeshStandardMaterial({ color: 0xb9c7cf, roughness: 0.42, metalness: 0.36 });
      const entryFrameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.022, doorHeight + 0.055, 0.044), entryFrameMat);
      const entryFrameRight = entryFrameLeft.clone();
      const entryFrameTop = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.23, w * 0.21), 0.022, 0.044), entryFrameMat);
      const doorX = door.position.x;
      entryFrameLeft.position.set(doorX - Math.min(0.11, w * 0.10), doorHeight / 2, d / 2 + 0.030);
      entryFrameRight.position.set(doorX + Math.min(0.11, w * 0.10), doorHeight / 2, d / 2 + 0.030);
      entryFrameTop.position.set(doorX, doorHeight + 0.028, d / 2 + 0.030);
      group.add(entryFrameLeft, entryFrameRight, entryFrameTop);
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
    if (building.kind !== 'park') {
      this.cameraOccluders.push({
        centerX: x,
        centerZ: z,
        halfWidth: w / 2,
        halfDepth: d / 2,
        top: s.height + 0.20,
      });
    }
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

    const crowdStates = liveStates.filter((state) => !detailedIds.has(state.id)).slice(0, MAX_CROWD_HUMANOIDS);
    // Frustum-only cull (no distance cutoff — this scene's camera standoff varies too much across
    // presets to guess a safe distance without real-hardware verification; the frustum test itself
    // is exact regardless of scale, unlike InstancedMesh's own broken per-batch bounding sphere —
    // see PERFORMANCE.md's "crowd frustum culling is disabled" finding).
    this.crowd.update(crowdStates, this.camera ? { camera: this.camera } : undefined);
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
    if (!this.analysisMesh || !this.THREE || !this.scratchAnalysisColor) return;
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
    const color = this.scratchAnalysisColor;
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
        this.analysisMesh.setColorAt(index, color.setRGB(r / 255, g / 255, b / 255));
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

  /**
   * Scenario-only layer. Synthetic Earthquake fixtures remain separate from
   * epidemic hotspots, locations, clusters and hospital signals even where
   * their display anchors coincide with an existing CityWorld object.
   */
  private syncEarthquakeScenarioVisuals(): void {
    if (!this.THREE || !this.earthquakeOverlayGroup) return;
    const overlay = this.earthquakeOverlay;
    const fingerprint = overlay ? JSON.stringify({
      mapping: [overlay.mappingId, overlay.mappingSchemaVersion, overlay.mappingFingerprint],
      run: overlay.sourceHazardRunId,
      status: overlay.datasetStatus,
      sites: overlay.sites.map((site) => [site.overlayId, site.cityX, site.cityY, site.severity, site.severityValue, site.uncertaintyLow, site.uncertaintyHigh]),
    }) : '';
    if (fingerprint === this.earthquakeOverlayFingerprint) return;
    this.earthquakeOverlayFingerprint = fingerprint;
    const previous = [...this.earthquakeOverlayGroup.children];
    this.earthquakeOverlayGroup.clear();
    for (const marker of previous) marker.traverse((node) => {
      const mesh = node as THREE_NS.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (material && !Array.isArray(material)) material.dispose();
    });
    if (!overlay || overlay.datasetStatus !== 'SCENARIO') return;

    const THREE = this.THREE;
    const severityColor: Record<string, number> = { NONE: 0x8ea5af, MINOR: 0xf4c95d, MODERATE: 0xff995e, SEVERE: 0xf05b78 };
    for (const site of overlay.sites) {
      const color = severityColor[site.severity] ?? 0xffffff;
      const group = new THREE.Group();
      const worldX = (site.cityX - this.simulation.worldWidth / 2) * CITY_WORLD_SCALE;
      const worldZ = (site.cityY - this.simulation.worldHeight / 2) * CITY_WORLD_SCALE;
      const uncertaintyRadius = Math.max(0.14, Math.min(0.42, 0.12 + site.uncertaintyHigh * 0.26));
      const coreRadius = Math.max(0.065, Math.min(0.19, 0.055 + site.severityValue * 0.14));
      const uncertaintyRing = new THREE.Mesh(
        new THREE.RingGeometry(uncertaintyRadius * 0.78, uncertaintyRadius, 28),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }),
      );
      uncertaintyRing.rotation.x = -Math.PI / 2;
      const coreRing = new THREE.Mesh(
        new THREE.RingGeometry(coreRadius * 0.55, coreRadius, 28),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, depthWrite: false }),
      );
      coreRing.rotation.x = -Math.PI / 2;
      coreRing.position.y = 0.012;
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, 0.32, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.84, depthWrite: false }),
      );
      stem.position.y = 0.17;
      const scenarioCap = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.07, 0),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.96, depthWrite: false }),
      );
      scenarioCap.position.y = 0.37;
      group.position.set(worldX, 0.075, worldZ);
      group.userData.markerPhase = ((site.cityX * 13 + site.cityY * 19) % 11) / 11 * Math.PI * 2;
      group.userData.scenarioOverlay = true;
      group.userData.scenarioLabel = `SCENARIO · SYNTHETIC · ${site.severity}`;
      group.add(uncertaintyRing, coreRing, stem, scenarioCap);
      this.earthquakeOverlayGroup.add(group);
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
    if (!this.earthquakeOverlayGroup) return;
    for (const marker of this.earthquakeOverlayGroup.children) {
      const phase = Number(marker.userData.markerPhase ?? 0);
      const pulse = 1 + Math.sin(this.timeSeconds * 1.45 + phase) * 0.045;
      marker.scale.setScalar(pulse);
      marker.rotation.y = -(this.timeSeconds * 0.18 + phase);
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
