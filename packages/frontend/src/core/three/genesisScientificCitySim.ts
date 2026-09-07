import type * as THREE_NS from 'three';
import type { PostProcessingModules, PostProcessor, Sim3D, ThreeRenderMetrics } from './types';
import { TemporalEngine, TemporalBranchRegistry } from '../worldModel/temporal/temporalEngine';
import {
  buildGenesisScientificCity3, RAINFALL_LOAD_MULTIPLIER, rainfallSchedule,
  RAINFALL_EVENT_TYPE, PUMP_TRIPPED_EVENT_TYPE, HOSPITAL_SERVICE_INTERRUPTED_EVENT_TYPE, POPULATION_ACCESS_IMPAIRED_EVENT_TYPE,
} from '../worldModel/domains/genesisScientificCity3';
import { withScheduledEvents } from '../worldModel/events/worldEventRules';
import { withCrossDomainCouplings } from '../worldModel/crossDomain/crossDomainCoupling';
import { getFrameState, compareBranches, type BranchComparison } from '../worldModel/bridge/worldFrameState';
import { getCausalAncestry, getEventHistoryFor } from '../worldModel/queries/worldQueries';
import type { EntityId, WorldModelEntity } from '../worldModel/ecs/types';
import type { GenesisEvent } from '../events/genesisEvent';
import { WorldFrameRenderer, type EntityVisualSpec } from './graphics/worldFrameRenderer';
import type { WorldFrame, WorldFrameEntity as C2Entity, EntityGrounding } from './graphics/worldFrame';
import { createWaterInfrastructureAdapter, type WaterInfrastructureAdapter } from './graphics/waterInfrastructureBridge';
import { createPipeNetwork, createValve, type WaterInfrastructureState } from './graphics/waterInfrastructure';
import { createFacadeBuilding, createIndustrialBuilding } from './graphics/buildingKit';
import { createStreetLight, createHydrant, createUtilityBox, createBollardBarrier, createSidewalk, createRoadMarkings } from './graphics/streetKit';
import { createTreeField, type VegetationFieldHandle } from './graphics/vegetation';
import { createVehicle } from './graphics/vehicleKit';
import { createPostSign } from './graphics/signageKit';
import { createPBRMaterial } from './graphics/materials';
import { applyVisualState, type CanonicalVisualState } from './graphics/visualState';
import { resolveCameraFraming, type CameraIntent } from './graphics/cameraRig';
import { createSceneEnvironment, type SceneEnvironmentHandle } from './graphics/sceneEnvironment';
import { disposeSceneResources } from './graphics/lifecycle';
import { setupGraphicsPipeline, configureDOF, type GraphicsPipeline } from './graphics/postProcessing';
import { captureDryLook, applyWetLook, type DryMaterialLook } from './graphics/water';
import { configureCinematicCamera, recommendedDofForProfile, FocusPuller, type CinematicCameraProfile } from './graphics/cinematicCamera';

/**
 * GENESIS — CITY INFRASTRUCTURE INTEGRATION 1.0
 * ==============================================================================
 *
 * The presentation layer (Sim3D, per the C1/C2/C3 boundary — this file decides HOW the real
 * `genesisScientificCity3` world LOOKS and how the camera moves; it computes no physics and owns no
 * world state) for the first genuine cross-domain object in Genesis: the real
 * `pump-pipe-system:pump-pipe-1` entity, its real Darcy-Weisbach/Swamee-Jain hydraulics, its real
 * `feedsInto` relationship to `building:hospital-building`, and the real scripted cascade
 * (`domains/genesisScientificCity3.ts`) that already connects a pump trip to a hospital
 * water-service interruption to a population-access-impaired event — all C3, none of it duplicated
 * here.
 *
 * WHAT THIS FILE ADDS (and nothing more): a `WorldFrame` adapter from C3's real `WorldFrameState`
 * (`bridge/worldFrameState.ts`) to C2's generic `WorldFrame` (`graphics/worldFrame.ts`); real-graph
 * target resolution (`resolveNamedWorldTarget` — a live scan of `graph.listEntities()`, never a
 * hardcoded id); real camera framing via C2's `resolveCameraFraming`, riding the SAME OrbitControls
 * target/distance seam every other Genesis city scene (`epidemicCity3D.ts`) already uses; and an
 * on-demand "what if the pump fails" fork, built with the EXACT same `TemporalEngine.forkBranch` +
 * `compareBranches` pattern `scenarioSession.ts`'s own hydraulics session already uses for its own
 * fork — not a second fork mechanism.
 *
 * TRINITY INTEGRATION 3.0: the pump's own visual is now C2's `createWaterInfrastructureAdapter`
 * (`graphics/waterInfrastructureBridge.ts`) — the honest `WorldFrameRenderer` seam C2 built
 * specifically to receive a real C3 pump entity, superseding this file's own earlier
 * `createPumpAssembly`/`createValveAssembly` (deleted; see `graphics/infrastructure.ts`'s removal in
 * this same mission). One real gap found in that bridge and worked around by calling C2's OWN
 * separately-exported `createPipeNetwork`/`createValve` (`graphics/waterInfrastructure.ts`) directly
 * rather than through the adapter: `WaterInfrastructureAdapter` has no notion of a pipe run to a
 * SECOND entity's position (the pump's real `feedsInto` connection to the hospital) — its `resolveVisual`
 * always builds at local origin `[0,0,0]`, by design, since `WorldFrameRenderer.applyTransform`
 * repositions the returned object to the entity's own absolute position every sync. The pipe/valve
 * connecting pump to hospital are therefore built ONCE in `init()` as static scene decoration (their
 * real endpoints never move), not as WorldFrame entities — this is reuse of C2's own exported kit
 * functions, not a second visual system.
 *
 * SCOPED RENDERING (an honest limitation, not a general policy): `CITY_TEMPLATE`'s own generic
 * district/road/city-grid buildings are structural filler this scenario has no reason to visualize —
 * this scene renders only the scenario's NAMED, causally-relevant entities (pump-pipe system,
 * hospital, water-system building, lab, population), each at its own real generated position.
 */

const GENESIS_CITY_DT_SECONDS = 3600; // one hour per tick — matches makeGenesisCityUpdater's own dt-to-day conversion for the epidemiology solver
const FAILURE_ADVANCE_TICKS = 3; // enough for the real hydraulics solver to re-solve and the cascade chain to fully propagate (one hop per tick — see cascadeRules.ts's own documented limitation)

export type RenderedCityBranch = 'BASELINE' | 'FAILURE';

export interface CityTargetMatch {
  id: EntityId;
  label: string;
  kind: string;
}

export interface PumpFailureOutcome {
  forkTick: number;
  tripped: boolean;
  hospitalInterrupted: boolean;
  branchId: string;
}

export interface CausalStep {
  type: string;
  tick: number;
  cause: string | null;
  parentEventId: string | null;
}

export interface InfrastructureComparisonRow {
  label: string;
  entityId: EntityId;
  baseline: Readonly<Record<string, number>> | null;
  failure: Readonly<Record<string, number>> | null;
  equal: boolean;
}

export interface RainfallScenarioOutcome {
  scheduledAtTick: number;
  tripped: boolean;
  hospitalInterrupted: boolean;
}

export interface CurrentStateSummary {
  tick: number;
  pumpFlow: number;
  pumpTripped: boolean;
  hospitalInterrupted: boolean;
  narration: string;
}

export interface ReplayWindow {
  fromTick: number;
  toTick: number;
}

/** A road/pavement material this scene can flip between its normal ("dry") PBR look and a wetter
 * one once `RAINFALL_EVENT_TYPE` has actually fired — via `graphics/water.ts`'s own
 * `captureDryLook`/`applyWetLook` (a real PBR roughness/color response, not a shader trick standing
 * in for state), reused here rather than re-implemented; see `applyRainfallVisualState`'s own doc. */
interface WetSurfaceMaterial {
  material: THREE_NS.MeshStandardMaterial;
  dry: DryMaterialLook;
}

function groundingToC2(level: WorldModelEntity['grounding']): EntityGrounding {
  return level === 'GROUNDED_EXACT' ? 'MODELED' : 'DERIVED';
}

/** Which of this scenario's own entities actually get a rendered object — see the module doc's
 * "SCOPED RENDERING" note. Populated once the sim knows the real ids `buildGenesisScientificCity3`
 * generated (constructor time), never a hardcoded literal elsewhere in this file. */
export class GenesisScientificCitySim implements Sim3D {
  cameraAutoRotateSpeed = 0.12;

  private readonly city = buildGenesisScientificCity3({ seed: 1 });
  private readonly registry = new TemporalBranchRegistry();
  private engine: TemporalEngine = new TemporalEngine(this.city.graph, { label: 'baseline', registry: this.registry });
  private failureBranch: TemporalEngine | null = null;
  private viewingBranch: RenderedCityBranch = 'BASELINE';
  private rainfallOutcome: RainfallScenarioOutcome | null = null;
  private replay: { fromTick: number; toTick: number; cursor: number } | null = null;

  private renderedIds: ReadonlySet<EntityId>;

  private THREE: typeof THREE_NS | null = null;
  private renderer: WorldFrameRenderer | null = null;
  private waterAdapter: WaterInfrastructureAdapter | null = null;
  private pumpMaterials: {
    body: THREE_NS.Material; motor: THREE_NS.Material; plinth: THREE_NS.Material; pipe: THREE_NS.Material; valve: THREE_NS.Material;
  } | null = null;
  private buildingMaterial: THREE_NS.Material | null = null;
  private landmarkMaterial: THREE_NS.Material | null = null;
  private windowMaterial: THREE_NS.Material | null = null;
  /** GRAPHICS V2 decorative context (see `addCityContext`) — held only so `dispose()` can free it. */
  private contextGroup: THREE_NS.Group | null = null;
  private contextMaterials: THREE_NS.Material[] = [];
  private trees: VegetationFieldHandle | null = null;
  /** GRAPHICS V2 SPRINT C-2: the road/pavement materials this scene can make read as rain-wet once
   * the REAL `RAINFALL_EVENT_TYPE` scenario has actually fired (`isRainfallScenarioActive()`) — see
   * `applyRainfallVisualState`'s own doc for why this is a rendering-only response to a real C3
   * event, never a second weather system. */
  private wetSurfaceMaterials: WetSurfaceMaterial[] = [];
  private rainfallVisualApplied = false;
  private readonly dryFogDensity = 0.0075;
  // +40% over baseline — noticeably heavier atmosphere without erasing the skyline the flagship
  // scene exists to show (found live: 0.0145 read as fog erasing most of the city past ~40m).
  private readonly rainFogDensity = 0.0105;

  /** GRAPHICS V2 SPRINT D — cinematic lens/focus polish, reusing `cinematicCamera.ts` exactly as
   * `labScene3D.ts` already does (see `updateCinematicFraming`'s own doc): no second camera system,
   * just the lens (FOV/DOF) half of the shot this scene wasn't using yet. */
  private pipeline: GraphicsPipeline | null = null;
  private appliedCinematicProfile: CinematicCameraProfile | null = null;
  private focusPuller: FocusPuller | null = null;
  /** Real WebGLRenderer.info counters, fed by useThreeLoop through the existing Sim3D
   * `onRenderMetrics` hook. This scene previously implemented neither the hook nor a readout, so it
   * could not be measured at all — which made the graphics performance budget unenforceable on the
   * one scene that matters most. Same keys epidemicCity3D already publishes, so any tooling that
   * reads one reads the other. */
  private renderMetrics: ThreeRenderMetrics = { fps: 0, frameMs: 0, renderMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0 };
  private sceneEnvironment: SceneEnvironmentHandle | null = null;

  private followTarget: THREE_NS.Vector3 | null = null;
  private observationStandoff: number | null = null;
  private lastSelectedId: EntityId | null = null;

  constructor() {
    // waterSystemBuildingId is deliberately EXCLUDED: it's a generic UNGROUNDED_APPROXIMATION
    // container box (4x3.6x4) generated one unit away from the real pump-pipe-system entity
    // (z=20 vs z=19 — see WATER_SYSTEM_TEMPLATE in specification/templates.ts) and, at that scale,
    // fully engulfs the much smaller real pump assembly. The pump's own composite visual already
    // represents the water-system infrastructure honestly; rendering the generic containing shell
    // on top of it would only hide the one entity this whole mission is about.
    this.renderedIds = new Set<EntityId>([
      this.city.pumpPipeId, this.city.hospitalBuildingId, this.city.labBuildingId, this.city.populationId,
    ]);
  }

  get activeEngine(): TemporalEngine {
    return this.viewingBranch === 'FAILURE' && this.failureBranch ? this.failureBranch : this.engine;
  }

  getIds() {
    return {
      pumpPipeId: this.city.pumpPipeId,
      hospitalBuildingId: this.city.hospitalBuildingId,
      waterSystemBuildingId: this.city.waterSystemBuildingId,
      labBuildingId: this.city.labBuildingId,
      populationId: this.city.populationId,
    };
  }

  // --- Time -----------------------------------------------------------------

  /** Advances the LIVE baseline engine by `hours` real hours (each tick = 1 hour, see
   * GENESIS_CITY_DT_SECONDS) — the pump stays healthy here unless `triggerPumpFailure` has forked
   * off a separate branch, which advances independently. */
  step(hours = 1): void {
    for (let i = 0; i < hours; i++) this.engine.advance(GENESIS_CITY_DT_SECONDS, this.city.updater);
  }

  setViewingBranch(branch: RenderedCityBranch): void {
    if (branch === 'FAILURE' && !this.failureBranch) return;
    this.viewingBranch = branch;
  }

  getViewingBranch(): RenderedCityBranch {
    return this.viewingBranch;
  }

  // --- Target resolution (C1's job: WHAT/WHERE) ------------------------------

  /**
   * A REAL scan of this world's live entity graph — never a hardcoded id. "Pump"/"water pump"/
   * "hospital pump"/"pump station" (and Polish "pompa") all resolve through the SAME real-kind
   * check; "pipe"/"water pipe" resolve to the SAME real pump-pipe-system entity, since no separate
   * pipe entity exists in this world (the pipe's own geometry is that entity's own domainState —
   * see genesisScientificCity3.ts's own module doc) — an honest alias, not a fabricated object.
   */
  resolveNamedWorldTarget(query: string): CityTargetMatch | null {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return null;
    const graph = this.activeEngine.graph;
    const candidates = graph.listEntities().filter((entity) => this.renderedIds.has(entity.id));

    // Polish nouns decline ("pompa"/"pompę"/"pompie"/"pompy"/"pompą") — matching the bare stem
    // (found live: "Pokaż pompę." failed against a whole-word "pompa" check) covers every real
    // inflection without a second per-case list. English "pump" doesn't decline this way, so it
    // stays a plain word match (still covers "pump station"/"hospital pump"/"water pump", each of
    // which contains the word "pump" itself).
    const pumpWords = /\b(pumps?|pomp\w*|pipe|rur\w*)\b/i;
    if (pumpWords.test(needle)) {
      const pump = candidates.find((entity) => entity.ref.kind === 'pump-pipe-system');
      if (pump) return { id: pump.id, label: pump.label, kind: pump.ref.kind };
    }
    const hospitalWords = /\b(hospital|szpital\w*)\b/i;
    if (hospitalWords.test(needle)) {
      const hospital = candidates.find((entity) => entity.id === this.city.hospitalBuildingId);
      if (hospital) return { id: hospital.id, label: hospital.label, kind: hospital.ref.kind };
    }
    // General fallback: real label/kind substring match over the rendered set — still a live
    // semantic scan, not a switch keyed on the query text itself.
    const byLabel = candidates.find((entity) => entity.label.toLowerCase().includes(needle) || entity.ref.kind.toLowerCase().includes(needle));
    return byLabel ? { id: byLabel.id, label: byLabel.label, kind: byLabel.ref.kind } : null;
  }

  /** Resolves `query` and, when found, actually frames the camera on it via C2's real
   * `resolveCameraFraming`, riding the same OrbitControls target/distance seam
   * `epidemicCity3D.ts`'s own `applyObservationTarget` uses — no second camera system. */
  applyObservationTarget(query: string, cameraIntent: CameraIntent): { found: boolean; label: string | null } {
    const match = this.resolveNamedWorldTarget(query);
    if (!match) return { found: false, label: null };
    const entity = this.activeEngine.graph.getEntity(match.id);
    const position = entity.spatial?.position ?? { x: 0, y: 0, z: 0 };
    // Radius roughly matching each real object's own visual footprint so MACRO framing stands just
    // outside the geometry rather than clipping into it (or, the opposite failure mode found live
    // after switching to C2's real createPump geometry: a radius left over from this file's own
    // much larger deleted createPumpAssembly made the camera stand absurdly far from C2's genuinely
    // small ~0.12-0.24m pump housing). C2's real pump/inlet/outlet/status-light footprint is roughly
    // 0.25m across — see graphics/waterInfrastructure.ts's own createPump dimensions.
    const radius = match.kind === 'pump-pipe-system' ? 0.25 : 5;
    this.lastSelectedId = match.id;
    this.frameCameraOn([position.x, position.y, position.z], radius, cameraIntent);
    return { found: true, label: match.label };
  }

  /** Shared body behind `applyObservationTarget`'s per-entity framing — factored out so SPRINT C-3's
   * initial subject framing (below, in `init()`) can frame a POINT/RADIUS that isn't tied to a
   * single named entity (the pump+hospital pair's own midpoint/span) through the exact same real
   * `resolveCameraFraming` + `followTarget`/`observationStandoff` seam, rather than a second camera
   * mechanism. */
  private frameCameraOn(position: THREE_NS.Vector3Tuple, radius: number, cameraIntent: CameraIntent): void {
    if (!this.followTarget && this.THREE) this.followTarget = new this.THREE.Vector3();
    this.followTarget?.set(position[0], position[1] + radius * 0.4, position[2]);
    if (this.THREE) {
      const framing = resolveCameraFraming({ intent: cameraIntent, target: [position[0], position[1] + radius * 0.4, position[2]], targetRadius: radius });
      this.observationStandoff = Math.hypot(
        framing.position[0] - framing.lookAt[0], framing.position[1] - framing.lookAt[1], framing.position[2] - framing.lookAt[2],
      );
    }
  }

  getOrbitTarget(): THREE_NS.Vector3 | null {
    return this.followTarget;
  }

  getOrbitFocusDistance(): number | null {
    return this.followTarget ? this.observationStandoff : null;
  }

  // --- Failure scenario (C3's real solver/cascade — this file only triggers and reads it) -------

  /**
   * Forks the LIVE baseline at its current tick (same `TemporalEngine.forkBranch` mechanism
   * `scenarioSession.ts`'s hydraulics session already uses for its own fork) and raises the pump's
   * real volumetric-flow demand by the EXACT same multiplier the scripted rainfall scenario uses
   * (`RAINFALL_LOAD_MULTIPLIER`, exported from genesisScientificCity3.ts for this purpose) — then
   * advances the fork far enough for the REAL hydraulics solver to re-solve headLoss and the
   * EXISTING cascade chain (pump trip -> hospital service interrupted -> population access
   * impaired) to fire on its own, exactly as it would for the scripted scenario. No second failure
   * mechanism, no directly-forced "FAILED" flag bypassing the solver.
   */
  triggerPumpFailure(): PumpFailureOutcome {
    const forkTick = this.engine.tick;
    const pumpId = this.city.pumpPipeId;
    const forked = this.engine.forkBranch(forkTick, 'pump-failure', (graph) => {
      const current = graph.getEntity(pumpId);
      const currentFlow = current.domainState?.volumetricFlow ?? 0;
      graph.updateEntity(pumpId, { domainState: { ...current.domainState, volumetricFlow: currentFlow * RAINFALL_LOAD_MULTIPLIER } });
    });
    for (let i = 0; i < FAILURE_ADVANCE_TICKS; i++) forked.advance(GENESIS_CITY_DT_SECONDS, this.city.updater);
    this.failureBranch = forked;
    this.viewingBranch = 'FAILURE';

    const pumpEvents = getEventHistoryFor(forked, pumpId);
    const hospitalEvents = getEventHistoryFor(forked, this.city.hospitalBuildingId);
    return {
      forkTick,
      tripped: pumpEvents.some((event) => event.type === PUMP_TRIPPED_EVENT_TYPE),
      hospitalInterrupted: hospitalEvents.some((event) => event.type === HOSPITAL_SERVICE_INTERRUPTED_EVENT_TYPE),
      branchId: forked.branchId,
    };
  }

  /**
   * "Why did the hospital lose water service?" — walks the REAL causal chain via
   * `getEventHistoryFor`/`getCausalAncestry` (`worldModel/queries/worldQueries.ts`), never a second
   * causal engine. Reads whichever engine is currently active (`activeEngine`) — the SAME real
   * chain fires whether the pump was tripped by `triggerPumpFailure`'s direct fork or by
   * `triggerRainfallScenario`'s real scripted rainfall event on the baseline, since both ultimately
   * raise the pump's real `volumetricFlow` and let the SAME existing cascade run. Returns the
   * ancestry of the most recent population-access-impaired event, root-first, or `null` when
   * nothing has failed yet on the currently-viewed engine.
   */
  explainWaterServiceLoss(): readonly CausalStep[] | null {
    const engine = this.activeEngine;
    const populationEvents = getEventHistoryFor(engine, this.city.populationId);
    const impaired = [...populationEvents].reverse().find((event) => event.type === POPULATION_ACCESS_IMPAIRED_EVENT_TYPE);
    if (!impaired) return null;
    const ancestry: readonly GenesisEvent[] = getCausalAncestry(engine, impaired.id);
    return [...ancestry].reverse().map((event) => ({
      type: event.type, tick: event.timestamp, cause: event.cause ?? null, parentEventId: event.parentEventId ?? null,
    }));
  }

  // --- Scientific Director: the flagship "extreme rainfall" scenario --------------------------

  /**
   * "Pokaż mi miasto podczas ekstremalnego deszczu" / "Show me the city during extreme rainfall" —
   * schedules C3's OWN real scripted rainfall event (`RAINFALL_EVENT_TYPE`, `rainfallSchedule()`,
   * both exported from `genesisScientificCity3.ts` for this exact purpose) on the LIVE baseline
   * engine via the EXISTING `withScheduledEvents` decorator (`worldEventRules.ts`) wrapping this
   * world's own real updater — the IDENTICAL mechanism `buildGenesisScientificCity3`'s own
   * `rainfallAtTick` option uses at construction time, invoked here on an already-running engine
   * instead. This establishes the SCENARIO on the baseline itself (not a counterfactual fork) —
   * `describeCurrentState`/`explainWaterServiceLoss`/`step` all keep reading this same engine
   * afterward. Idempotent: calling this again just returns the already-computed real outcome.
   *
   * COMPOSITION ORDER, found the hard way (this file's own tests caught it): `city.updater` was
   * built WITHOUT `rainfallAtTick`, so its own internal rainfall-to-load coupling instance sits
   * deep inside the chain with nothing ever feeding it a rainfall event — wrapping the WHOLE
   * already-composed `city.updater` in `withScheduledEvents` from the outside adds the event too
   * late for that inner coupling to ever see it (`withScheduledEvents`'s own event is appended
   * AFTER its inner updater — here, the entire rest of the chain — has already run for that tick).
   * The fix reuses the EXACT SAME coupling object (`city.couplings[0]`, exposed for this purpose)
   * in a second, live application wrapped OUTSIDE `withScheduledEvents`, so it sees the event the
   * moment it's added, in the same tick — no new coupling defined, no cascade logic duplicated,
   * just the correct nesting order for a dynamically-timed (rather than construction-time) trigger.
   *
   * HONEST LIMITATION (mandatory Step 0 finding of this mission): the rainfall event's own
   * `intensityMmPerHour` parameter is recorded for provenance but is NOT read anywhere by the real
   * rainfall-to-load coupling — `genesisScientificCity3.ts`'s `rainfallToLoad.deriveEffect` applies
   * a FIXED `RAINFALL_LOAD_MULTIPLIER`, never scaled by any intensity value, even though
   * `defineCrossDomainCoupling`'s own `deriveEffect` signature is handed the full triggering event
   * (parameters included) — the capability to read it exists in the framework, this one coupling
   * simply doesn't use it. This method can therefore trigger the real scripted scenario, but cannot
   * honestly support "what if rainfall were N% lower" — see the control loop's own explicit refusal
   * for that request, which does not call this method at all.
   */
  triggerRainfallScenario(): RainfallScenarioOutcome {
    if (this.rainfallOutcome) return this.rainfallOutcome;
    const scheduledAtTick = this.engine.tick + 1;
    const updaterWithRainfall = withCrossDomainCouplings(
      withScheduledEvents(this.city.updater, rainfallSchedule(scheduledAtTick)),
      [this.city.couplings[0]], // the real rainfall -> hydraulic-load coupling, reused verbatim
    );
    this.engine.advance(GENESIS_CITY_DT_SECONDS, updaterWithRainfall);
    for (let i = 0; i < FAILURE_ADVANCE_TICKS; i++) this.engine.advance(GENESIS_CITY_DT_SECONDS, this.city.updater);

    const pumpEvents = getEventHistoryFor(this.engine, this.city.pumpPipeId);
    const hospitalEvents = getEventHistoryFor(this.engine, this.city.hospitalBuildingId);
    this.rainfallOutcome = {
      scheduledAtTick,
      tripped: pumpEvents.some((event) => event.type === PUMP_TRIPPED_EVENT_TYPE),
      hospitalInterrupted: hospitalEvents.some((event) => event.type === HOSPITAL_SERVICE_INTERRUPTED_EVENT_TYPE),
    };
    return this.rainfallOutcome;
  }

  isRainfallScenarioActive(): boolean {
    return this.rainfallOutcome !== null;
  }

  /**
   * "What's happening?" / "Co się dzieje?" — a grounded status summary read directly from
   * `activeEngine`'s real solver output, never a fabricated narrative. Real event carries the real
   * rainfall event type (`RAINFALL_EVENT_TYPE`) as a documented constant so this narration's own
   * wording stays traceable to the same real event the engine recorded.
   */
  describeCurrentState(): CurrentStateSummary {
    const engine = this.activeEngine;
    const pump = engine.graph.tryGetEntity(this.city.pumpPipeId);
    const hospital = engine.graph.tryGetEntity(this.city.hospitalBuildingId);
    const pumpFlow = pump?.domainState?.volumetricFlow ?? 0;
    const pumpTripped = pumpFlow === 0;
    const hospitalInterrupted = hospital?.domainState?.waterServiceInterrupted === 1;
    const rainfallEvents = getEventHistoryFor(engine, this.city.environmentId);
    const rainfallOccurred = rainfallEvents.some((event) => event.type === RAINFALL_EVENT_TYPE);
    const narration = pumpTripped
      ? `The pump has tripped (real overload-protection threshold exceeded on its own solved headLoss)${hospitalInterrupted ? "; the hospital's water service is interrupted as a direct, real consequence" : ''}.`
      : rainfallOccurred
        ? `Extreme rainfall has occurred; the pump is still operating normally at ${pumpFlow.toFixed(3)} m³/s.`
        : `The pump is operating normally at ${pumpFlow.toFixed(3)} m³/s. No incident has occurred.`;
    return { tick: engine.tick, pumpFlow, pumpTripped, hospitalInterrupted, narration };
  }

  /** The ONE counterfactual this mission's flagship explicitly asks about, honestly refused — see
   * `triggerRainfallScenario`'s own doc for the exact gap. */
  getRainfallCounterfactualGap(): string {
    return 'NOT_MODELLED — rainfall intensity is not a real parameterized input in the current '
      + 'hydraulics model: the scripted "extreme rainfall" event always raises the pump\'s real flow '
      + 'demand by a fixed multiplier, regardless of any intensity value carried on the event. There '
      + 'is no honest way to run a "rainfall 30% lower" counterfactual until the rainfall-to-load '
      + 'coupling is changed to actually read a real intensity parameter.';
  }

  // --- Replay: the ALREADY-COMPUTED real history, not a re-narrated fiction -------------------

  /**
   * "Replay what happened" — steps back through the real history of whichever engine is active via
   * C3's own `getFrameState(engine, timestamp)` (`bridge/worldFrameState.ts`), one real tick at a
   * time — not a second replay engine. `fromTick` is the engine's own real fork point
   * (`TemporalEngine.forkedAtTick`) when viewing a fork, or 0 for the baseline. Returns `null` when
   * there is nothing yet to replay (fewer than one real tick of history).
   */
  startReplay(): ReplayWindow | null {
    const engine = this.activeEngine;
    const fromTick = engine.forkedAtTick ?? 0;
    const toTick = engine.tick;
    if (fromTick >= toTick) return null;
    this.replay = { fromTick, toTick, cursor: fromTick };
    return { fromTick, toTick };
  }

  isReplaying(): boolean {
    return this.replay !== null;
  }

  getReplayTick(): number | null {
    return this.replay?.cursor ?? null;
  }

  /** Advances the replay cursor by one real tick. Returns `false` once replay reaches the present
   * (and clears replay mode, handing the view back to the live current state). */
  advanceReplay(): boolean {
    if (!this.replay) return false;
    this.replay.cursor += 1;
    if (this.replay.cursor >= this.replay.toTick) {
      this.replay = null;
      return false;
    }
    return true;
  }

  stopReplay(): void {
    this.replay = null;
  }

  /** WORLD A (pump normal) vs WORLD B (pump failure) — the real `compareBranches` mechanism
   * (`bridge/worldFrameState.ts`), the same one `scenarioSession.ts`'s hydraulics fork already uses,
   * read back for the pump/hospital/population trio rather than a single focal entity. */
  getComparison(): readonly InfrastructureComparisonRow[] | null {
    if (!this.failureBranch) return null;
    const atTick = this.failureBranch.tick;
    const comparison: BranchComparison = compareBranches(this.registry, this.engine.branchId, this.failureBranch.branchId, atTick);
    const rows: Array<{ label: string; id: EntityId }> = [
      { label: 'Pump', id: this.city.pumpPipeId },
      { label: 'Hospital', id: this.city.hospitalBuildingId },
    ];
    return rows.map(({ label, id }) => {
      const diff = comparison.entityDiffs.find((entry) => entry.id === id);
      return {
        label, entityId: id,
        baseline: diff?.worldA?.domainState ?? null,
        failure: diff?.worldB?.domainState ?? null,
        equal: diff?.equal ?? true,
      };
    });
  }

  // --- Sim3D lifecycle --------------------------------------------------------

  init(THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera, _w: number, _h: number): void {
    this.THREE = THREE;
    scene.background = new THREE.Color(0x0c1420);
    // GENESIS GRAPHICS ENGINE — VISUAL WORLD BUILD 3.0: the shared exterior environment baseline
    // (sky/fog/sun/fill/ground/tier-gated haze) every Sim3D scene needs, replacing this scene's own
    // ad hoc bare PlaneGeometry ground + two lights with no render-tier awareness. `hourOfDay: 21`
    // keeps this scene's original night mood (its own hand-picked 0x0c1420 tone already matched
    // `environment.ts`'s own NIGHT palette); the CONCRETE category (tinted toward the scene's
    // original ground tone) fits a paved scientific-city site better than the GROUND category's
    // default grass/dirt look. Nothing else about this scene (camera, target resolution,
    // intervention/cascade logic, entity visuals) is touched — see this file's own module doc for
    // that boundary.
    this.sceneEnvironment = createSceneEnvironment(THREE, scene, {
      mode: 'OUTDOOR',
      hourOfDay: 21,
      // SPRINT B — atmosphere. 0.014 buried the skyline the district now has; this keeps real
      // atmospheric depth (near geometry crisp, far towers fading) while letting the horizon read.
      fogDensity: 0.0075,
      groundMaterial: createPBRMaterial(THREE, 'CONCRETE', { color: 0x1a2332 }),
      // `hourOfDay: 21` (9pm) puts computeSunState's sun direction BELOW the horizon (negative y)
      // AND floors its intensity at a physically-dim 0.15 — both correct for a real night sky, but
      // together they left this scene's ground/buildings nearly unlit and floating in fog (found via
      // this scene's own first Chromium screenshot of this wiring). `sunPosition`/`sunColor`/
      // `sunIntensity` restore this scene's own pre-existing key light exactly (`createSunLight`
      // with `position: [30, 40, 20]` and no other overrides used to mean its defaults: color
      // 0xffd9a0, intensity 2) — the dark mood stays entirely in the fog/sky/background, which
      // `hourOfDay: 21` still genuinely drives.
      sunPosition: [30, 40, 20],
      sunColor: 0xffd9a0,
      sunIntensity: 2,
      // GRAPHICS V2: `createBackgroundFill`'s 0.4 default assumes the sun does most of the work.
      // With the city context now filling the frame, that left streets and lower facades reading as
      // muddy near-black. A warmer, stronger hemisphere fill lifts the whole scene into "legible
      // dusk" without touching the fog/sky mood `hourOfDay: 21` drives.
      // Cool sky bounce against the warm key above: the warm/cool separation the design target
      // relies on, and what stops a night scene reading as uniformly grey.
      fillIntensity: 1.15,
      fillSkyColor: 0x8fa8d4,
      fillGroundColor: 0x6b5c49,
    });

    this.pumpMaterials = {
      body: createPBRMaterial(THREE, 'PAINTED_METAL'),
      motor: createPBRMaterial(THREE, 'BRUSHED_METAL'),
      plinth: createPBRMaterial(THREE, 'CONCRETE'),
      pipe: createPBRMaterial(THREE, 'BRUSHED_METAL'),
      valve: createPBRMaterial(THREE, 'POLISHED_METAL'),
    };
    this.buildingMaterial = createPBRMaterial(THREE, 'CONCRETE');
    this.landmarkMaterial = createPBRMaterial(THREE, 'CERAMIC');
    // GRAPHICS V2: windows are instanced per building (`createFacadeBuilding`), and `InstanceBatch`
    // sets `vertexColors = true` on whatever material it is given — so this is a dedicated material
    // for that use, never shared with the wall/landmark materials. `resolveVisual` clones it per
    // entity, because `updateVisual`'s `applyVisualState` mutates emissive on the materials it
    // traverses: a shared instance would make one building's state tint every other building's
    // windows too.
    this.windowMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.05, emissive: 0xffc98a, emissiveIntensity: 0.45 });

    // C2's real, tested, honest WorldFrame seam for the pump — see the module doc's "TRINITY
    // INTEGRATION 3.0" note. `resolveVisual`/`updateVisual` below delegate to it for the one
    // entity whose visualHint is 'object:water-pump'; every other entity keeps this file's own
    // fallback visuals.
    this.waterAdapter = createWaterInfrastructureAdapter(THREE, {
      housingMaterial: this.pumpMaterials.body,
      pipeMaterial: this.pumpMaterials.pipe,
      valveMaterial: this.pumpMaterials.valve,
    });

    this.renderer = new WorldFrameRenderer(THREE, scene, {
      resolveVisual: (entity) => this.resolveVisual(entity),
      updateVisual: (entity, object) => this.updateVisual(entity, object),
    });

    const hospital = this.hospitalPosition();
    const pumpEntityPos = this.city.graph.getEntity(this.city.pumpPipeId).spatial?.position ?? { x: 0, y: 0, z: 0 };
    const pump: THREE_NS.Vector3Tuple = [pumpEntityPos.x, pumpEntityPos.y + 0.5, pumpEntityPos.z];

    // The pump -> hospital pipe run: a REAL connection (the entity's own `feedsInto` relationship
    // in genesisScientificCity3.ts), rendered with C2's OWN exported `createPipeNetwork`/`createValve`
    // (graphics/waterInfrastructure.ts) directly, since `WaterInfrastructureAdapter` itself has no
    // pipe-to-a-second-position concept (see module doc). Built once here — the real endpoints are
    // static generated-world positions that never move — not resynced every frame.
    // GRAPHICS V2: decorative city context (roads/buildings/lights/trees/vehicles) around the real
    // entities — pure reuse of kits this scene already had available but never called. Added BEFORE
    // the pipe run so the pipe and pump read as sitting IN a place, not floating in a void.
    this.addCityContext(THREE, scene);

    scene.add(createPipeNetwork(THREE, { waypoints: [pump, hospital], radius: 0.1, material: this.pumpMaterials.pipe }));
    const midpoint: THREE_NS.Vector3Tuple = [(pump[0] + hospital[0]) / 2, (pump[1] + hospital[1]) / 2, (pump[2] + hospital[2]) / 2];
    scene.add(createValve(THREE, { position: midpoint, material: this.pumpMaterials.valve }));

    const midX = (hospital[0] + pump[0]) / 2;
    const midZ = (hospital[2] + pump[2]) / 2;
    // SPRINT B — composition. The old framing was a low, close shot chosen when this scene held three
    // primitives on an empty plane; with a real district around them it cropped into rooftops and
    // read as an accident. This is an elevated three-quarter establishing shot: the pump/hospital
    // pair stay the subject, the street grid gives depth, and the skyline closes the background.
    // Only the INITIAL framing changes — `applyObservationTarget`/`resolveCameraFraming` and the
    // OrbitControls target seam C1's observation flow drives are untouched.
    camera.position.set(midX + 46, 34, midZ + 62);
    camera.lookAt(midX, 4, midZ);

    // SPRINT D — cinematic lens polish. The establishing pose above is a WIDE shot in composition
    // but was still using the generic 50deg lens `useThreeLoop.ts` constructs every camera with;
    // `configureCinematicCamera`/`FocusPuller` are `cinematicCamera.ts`'s existing lens/focus
    // primitives (already proven in `labScene3D.ts`) — reused here, not a second camera system.
    // The focus pull starts at this establishing shot's own real distance (everything reads sharp
    // at this range regardless) and eases toward the hero standoff as `updateCinematicFraming`
    // (called every frame from `syncScene`) detects the SPRINT C-3 push-in has arrived.
    const establishingDistance = camera.position.distanceTo(new THREE.Vector3(midX, 4, midZ));
    this.applyCinematicProfile(camera, 'WIDE_ESTABLISHING');
    this.focusPuller = new FocusPuller(establishingDistance);

    // SPRINT C-3 — subject framing. The wide shot above sets the FIRST frame's static establishing
    // pose; left alone, it was also the scene's PERMANENT resting camera, and the pump/hospital
    // pair — the actual subject of this whole scenario — read as two small objects lost in a much
    // bigger district (found live in Sprint C-1/C-2's own screenshots). This reuses the EXACT SAME
    // real camera-framing seam C1's "show me the hospital" queries already drive (`frameCameraOn`,
    // shared with `applyObservationTarget`; `useThreeLoop.ts`'s existing per-frame lerp toward
    // `getOrbitTarget()`/`getOrbitFocusDistance()` does the rest) to push the camera in from the
    // wide establish onto the flagship PAIR over the first couple of seconds — a real "establish,
    // then find your subject" cinematic beat, not a second camera mechanism.
    //
    // Framing the pair (not just `applyObservationTarget('hospital', ...)`'s own hardcoded
    // building-only radius of 5) matters here: found live that a hospital-only radius crops the
    // pump entirely out of frame, which is exactly the "lost the pump/hospital as the visual
    // subject" defect this sprint exists to fix. `pairSpan` is the real half-distance between the
    // two entities plus the hospital's own half-width, so the standoff this produces always
    // includes both, however far apart a future generated world places them.
    const pairSpan = Math.max(Math.hypot(hospital[0] - pump[0], hospital[2] - pump[2]) / 2 + 4, 6);
    this.frameCameraOn([midX, 3, midZ], pairSpan, 'CINEMATIC');
    if (this.observationStandoff) this.focusPuller?.pullTo(this.observationStandoff);
  }

  /**
   * GRAPHICS V2 — decorative city context around the REAL entities.
   *
   * HONEST STATUS, stated up front: everything this method builds is **decorative context, not
   * science**. Not one object here is a C3/WorldFrame entity, none carries state, none is
   * selectable, and every group is tagged `userData.visualOnlyContext = true` — the exact status
   * `epidemicCity3D.ts`'s own `addCityExtras()` established for the same kind of massing. The real
   * entities (pump, hospital, population) continue to come from C3 through `WorldFrameRenderer`
   * alone; this only stops them from floating in an empty void.
   *
   * It is pure REUSE of kits that already existed and simply were not wired into this scene:
   * `buildingKit`, `streetKit`, `vegetation`, `vehicleKit`, `signageKit`. No new visual system.
   */
  private addCityContext(THREE: typeof THREE_NS, scene: THREE_NS.Scene): void {
    const group = new THREE.Group();
    group.name = 'genesis-scientific-city-context';
    group.userData.visualOnlyContext = true;

    const asphalt = createPBRMaterial(THREE, 'ASPHALT');
    const concrete = createPBRMaterial(THREE, 'CONCRETE');
    const roof = createPBRMaterial(THREE, 'CONCRETE', { color: 0x3a3d44 });
    // SPRINT B — facade variation. A district where every building shares one wall material reads as
    // one extruded texture, which is most of what made this look like a technical demo. These are
    // the SAME `materials.ts` PBR categories already in the palette (each carries its own procedural
    // surface detail and roughness variation) — a spread of real building surfaces, not a new
    // material system, and nothing here encodes or implies any scientific value.
    const facadeMaterials = [
      createPBRMaterial(THREE, 'CONCRETE', { color: 0x6d6f75 }),   // bare concrete
      createPBRMaterial(THREE, 'CONCRETE', { color: 0xb8ab97 }),   // pale render/stucco
      createPBRMaterial(THREE, 'BRICK'),                            // brick
      createPBRMaterial(THREE, 'CONCRETE', { color: 0x8a9299 }),   // grey-blue panel
      createPBRMaterial(THREE, 'TECH_COMPOSITE', { color: 0x55606b }), // curtain-wall-ish
    ];
    const kerb = createPBRMaterial(THREE, 'CONCRETE', { color: 0x9a9a96 });
    const paving = createPBRMaterial(THREE, 'CONCRETE', { color: 0x7c7b78 });
    const paint = new THREE.MeshStandardMaterial({ color: 0xd8d4c4, roughness: 0.85, metalness: 0 });
    const metal = createPBRMaterial(THREE, 'BRUSHED_METAL');
    const lampGlow = new THREE.MeshStandardMaterial({ color: 0xffe6b8, emissive: 0xffd08a, emissiveIntensity: 2.2, roughness: 0.35 });
    const contextWindow = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.05, emissive: 0xffc98a, emissiveIntensity: 0.35 });
    const trunk = createPBRMaterial(THREE, 'CONCRETE', { color: 0x4a3b2c });
    const canopy = createPBRMaterial(THREE, 'CONCRETE', { color: 0x2f5d34 });
    const carBody = createPBRMaterial(THREE, 'PAINTED_METAL');
    const carGlass = createPBRMaterial(THREE, 'TECH_COMPOSITE', { color: 0x1c2733 });
    this.contextMaterials = [asphalt, concrete, roof, metal, lampGlow, contextWindow, trunk, canopy, carBody, carGlass, kerb, paving, paint, ...facadeMaterials];

    // SPRINT C-2: register the road/pavement surfaces so `applyRainfallVisualState` can make them
    // read as rain-wet once the real `RAINFALL_EVENT_TYPE` scenario fires — see that method's own
    // doc. Registered here (not cloned) because these materials are already shared, scene-owned
    // instances this method is the sole author of.
    this.wetSurfaceMaterials = ([asphalt, paving, kerb] as THREE_NS.Material[]).map((material) => {
      const standard = material as THREE_NS.MeshStandardMaterial;
      return { material: standard, dry: captureDryLook(standard) };
    });

    // Keep-out zones: the real entities' own positions, so context never buries the science.
    const keepOut: { x: number; z: number; r: number }[] = [];
    for (const id of this.renderedIds) {
      const p = this.city.graph.getEntity(id).spatial?.position;
      if (p) keepOut.push({ x: p.x, z: p.z, r: 9 });
    }
    const blocked = (x: number, z: number, pad = 0) =>
      keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + pad);

    // --- Roads: a cross of asphalt strips through the site -----------------------------------
    const roadWidth = 9;
    const roadLength = 150;
    for (const [w, d, ry] of [[roadWidth, roadLength, 0], [roadLength, roadWidth, 0]] as const) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(w, d), asphalt);
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = ry;
      road.position.y = 0.02;
      road.receiveShadow = true;
      group.add(road);
    }

    // SPRINT B — pavements, kerbs and a painted centreline. This is the change that makes the
    // carriageway read as a street: a real edge, a height difference for light to catch, and a
    // scale reference a viewer already knows how to read. Uses streetKit's own new
    // `createSidewalk`/`createRoadMarkings`; markings are one InstancedMesh per run.
    const halfRoad = roadWidth / 2;
    const pavementWidth = 4.5;
    const runEnd = roadLength / 2;
    for (const side of [-1, 1] as const) {
      const offset = side * (halfRoad + pavementWidth / 2);
      group.add(createSidewalk(THREE, {
        from: [offset, 0, -runEnd], to: [offset, 0, runEnd],
        width: pavementWidth, kerbHeight: 0.18, surfaceMaterial: paving, kerbMaterial: kerb,
      }));
      group.add(createSidewalk(THREE, {
        from: [-runEnd, 0, offset], to: [runEnd, 0, offset],
        width: pavementWidth, kerbHeight: 0.18, surfaceMaterial: paving, kerbMaterial: kerb,
      }));
    }
    group.add(createRoadMarkings(THREE, {
      from: [0, 0, -runEnd], to: [0, 0, runEnd],
      dashLength: 3, gapLength: 4.5, width: 0.28, material: paint,
    }));
    group.add(createRoadMarkings(THREE, {
      from: [-runEnd, 0, 0], to: [runEnd, 0, 0],
      dashLength: 3, gapLength: 4.5, width: 0.28, material: paint,
    }));

    // --- Context buildings on a loose grid, skipping the real entities' plots -----------------
    // Density is what makes a skyline read as a city rather than a diorama (see
    // `graphics/design-target/README.md`, quality 1). Detail falls off with distance instead of the
    // count being capped: near blocks get rooftop equipment and dense window rows, far blocks get
    // neither — the same "spend detail where the user actually looks" rule PERFORMANCE.md sets out.
    const step = 26;
    const RING = 5;
    for (let gx = -RING; gx <= RING; gx++) {
      for (let gz = -RING; gz <= RING; gz++) {
        const x = gx * step + (gx % 2 ? 5 : -3);
        const z = gz * step + (gz % 2 ? -4 : 6);
        if (Math.abs(x) < roadWidth || Math.abs(z) < roadWidth) continue; // keep the roads clear
        if (blocked(x, z, 8)) continue;
        const ring = Math.max(Math.abs(gx), Math.abs(gz));
        const seed = this.stableSeed(`ctx:${gx}:${gz}`);
        const near = ring <= 2;
        if ((gx + gz) % 3 === 0 && near) {
          group.add(createIndustrialBuilding(THREE, {
            position: [x, 0, z], width: 12 + (seed % 5), depth: 10 + (seed % 4),
            seed, wallMaterial: facadeMaterials[seed % facadeMaterials.length], roofMaterial: roof,
          }));
        } else {
          group.add(createFacadeBuilding(THREE, {
            position: [x, 0, z],
            width: 9 + (seed % 5), depth: 8 + (seed % 4),
            // Taller towards the outskirts so the horizon carries a real skyline silhouette.
            height: 7 + (seed % 13) + ring * 3.5,
            seed, wallMaterial: facadeMaterials[seed % facadeMaterials.length], windowMaterial: contextWindow.clone(), roofMaterial: near ? roof : undefined,
            // Coarser window rows further out: fewer instances per building, same silhouette.
            floorHeight: near ? 1.2 : 2.0,
            litFraction: 0.4,
            rooftopEquipment: near,
          }));
        }
      }
    }

    // --- Street lights along both roads ------------------------------------------------------
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      for (const [x, z] of [[roadWidth * 0.75, i * 18], [-roadWidth * 0.75, i * 18], [i * 18, roadWidth * 0.75], [i * 18, -roadWidth * 0.75]] as const) {
        if (blocked(x, z)) continue;
        group.add(createStreetLight(THREE, {
          position: [x, 0, z], height: 7.5,
          poleMaterial: metal, lampMaterial: lampGlow,
          headingRadians: Math.abs(x) > Math.abs(z) ? (x > 0 ? Math.PI : 0) : (z > 0 ? -Math.PI / 2 : Math.PI / 2),
        }));
      }
    }

    // --- Parked vehicles. vehicleKit is authored at epidemicCity3D's CITY_WORLD_SCALE (~0.018),
    // so a ~0.5-unit car needs scaling up to read as a real car in this scene's metric units.
    const VEHICLE_SCALE = 8;
    const parked: [number, number, number][] = [
      [roadWidth * 0.55, -22, 0], [-roadWidth * 0.55, -34, Math.PI],
      [roadWidth * 0.55, 30, 0], [-roadWidth * 0.55, 44, Math.PI],
      [26, roadWidth * 0.55, Math.PI / 2], [-38, -roadWidth * 0.55, -Math.PI / 2],
    ];
    for (const [x, z, heading] of parked) {
      if (blocked(x, z)) continue;
      const seed = this.stableSeed(`car:${x}:${z}`);
      const vehicle = createVehicle(THREE, {
        kind: seed % 4 === 0 ? 'van' : 'car',
        position: [0, 0, 0], headingRadians: heading, seed,
        bodyMaterial: carBody.clone(), glassMaterial: carGlass, wheelMaterial: metal,
      });
      vehicle.group.scale.setScalar(VEHICLE_SCALE);
      vehicle.group.position.set(x, 0, z);
      group.add(vehicle.group);
    }

    // --- Street furniture + signage at the intersection ---------------------------------------
    for (const [x, z] of [[roadWidth * 0.8, roadWidth * 0.8], [-roadWidth * 0.8, -roadWidth * 0.8]] as const) {
      if (blocked(x, z)) continue;
      const sign = createPostSign(THREE, {
        position: [x, 0, z], panelWidth: 2.2, panelHeight: 1.1,
        panelCenterHeight: 3.2, postRadius: 0.08,
        postMaterial: metal, panelMaterial: concrete,
      });
      group.add(sign.group);
    }
    for (const [x, z] of [[roadWidth * 0.7, -12], [-roadWidth * 0.7, 16]] as const) {
      if (blocked(x, z)) continue;
      const hydrant = createHydrant(THREE, { position: [x, 0, z], material: carBody });
      hydrant.scale.setScalar(8);
      group.add(hydrant);
      const box = createUtilityBox(THREE, { position: [x + 3, 0, z + 2], material: metal });
      box.scale.setScalar(8);
      group.add(box);
    }
    group.add(createBollardBarrier(THREE, {
      from: [roadWidth * 0.9, 0, -roadWidth * 0.9], to: [roadWidth * 0.9 + 7, 0, -roadWidth * 0.9], postCount: 5, material: metal,
    }));

    // --- Vegetation: instanced, so a whole field costs 2 draw calls --------------------------
    this.trees = createTreeField(THREE, {
      count: 90, width: 150, depth: 150, seed: 0x5c17,
      trunkMaterial: trunk, canopyMaterial: canopy, scaleRange: [1.4, 2.6],
    });
    group.add(this.trees.group);

    scene.add(group);
    this.contextGroup = group;
  }

  /** A stable, deterministic seed derived from an entity's own real id — never `Math.random()`, so
   * a rebuilt scene (replay, branch switch) reproduces the identical building every time, per the
   * deterministic-variation convention `buildingKit.ts` documents. */
  private stableSeed(id: string): number {
    let hash = 2166136261;
    for (let i = 0; i < id.length; i++) {
      hash ^= id.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash | 0);
  }

  private hospitalPosition(): THREE_NS.Vector3Tuple {
    const hospital = this.city.graph.getEntity(this.city.hospitalBuildingId).spatial?.position ?? { x: 0, y: 0, z: 0 };
    return [hospital.x, 0.5, hospital.z];
  }

  private resolveVisual(entity: C2Entity): EntityVisualSpec {
    const THREE = this.THREE!;
    if (entity.visualHint === 'object:water-pump' && this.waterAdapter) {
      return this.waterAdapter.resolveVisual(entity);
    }
    if (entity.visualHint === 'building' && this.buildingMaterial && this.windowMaterial) {
      // GRAPHICS V2: a real windowed facade (`buildingKit.createFacadeBuilding`) instead of the bare
      // BoxGeometry this scene used to draw — the kit existed, this scene simply wasn't using it.
      // Built at LOCAL ORIGIN [0,0,0] with its base on y=0, because WorldFrameRenderer.applyTransform
      // overwrites `.position` outright every sync (ADAPTER_CONTRACT.md rule 4); the entity's own
      // real C3 position is what places it.
      const isHospital = entity.id === this.city.hospitalBuildingId;
      const width = isHospital ? 7 : 4.5;
      const depth = isHospital ? 6 : 4.5;
      const height = isHospital ? 7.5 : 6 + (this.stableSeed(entity.id) % 5);
      const building = createFacadeBuilding(THREE, {
        position: [0, 0, 0],
        width, depth, height,
        seed: this.stableSeed(entity.id),
        // Cloned per entity: `updateVisual` mutates emissive on what it traverses, so sharing these
        // would let one building's CRITICAL state repaint every other building in the scene.
        wallMaterial: this.buildingMaterial.clone(),
        windowMaterial: this.windowMaterial.clone(),
        roofMaterial: this.buildingMaterial.clone(),
        litFraction: isHospital ? 0.8 : 0.45,
      });
      // A real C3 entity, not decorative massing — clear the kit's default context tag so nothing
      // downstream mistakes a modeled hospital for background filler.
      building.userData.visualOnlyContext = false;

      // GRAPHICS V2 — a dedicated STATUS BAND rather than tinting the whole facade. Previously
      // `updateVisual` ran `applyVisualState` over every mesh in the object, which repainted the
      // entire building in the state colour: a nominal hospital rendered as a solid green block,
      // which looked like a toy AND overstated the signal. The state still has to be visible (it is
      // real C3 data), so it moves onto this one band; the building itself keeps its real material.
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(width * 1.01, height * 0.045, depth * 1.01),
        new THREE.MeshStandardMaterial({ color: 0x8d9199, roughness: 0.5, emissive: 0x000000, emissiveIntensity: 0 }),
      );
      band.position.y = height * 0.82;
      band.userData.genesisStatusIndicator = true;
      building.add(band);
      return { kind: 'object', object: building };
    }
    const fallback = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), (this.landmarkMaterial ?? new THREE.MeshStandardMaterial()).clone());
    return { kind: 'object', object: fallback };
  }

  /** The pump's own canonical state now lives in C2's `waterInfrastructureBridge.ts` (driven off
   * this same `WorldFrameEntity.status`/`.grounding` — see `updateVisual` below); this function only
   * ever runs for the entities that DON'T go through that bridge. */
  private toCanonicalState(entity: C2Entity): CanonicalVisualState {
    if (entity.id === this.city.hospitalBuildingId) {
      if (entity.scalars?.waterServiceInterrupted === 1) return 'CRITICAL';
      return 'NORMAL';
    }
    return 'INACTIVE';
  }

  private updateVisual(entity: C2Entity, object: THREE_NS.Object3D): void {
    if (entity.visualHint === 'object:water-pump' && this.waterAdapter) {
      this.waterAdapter.updateVisual(entity, object);
      return;
    }
    const THREE = this.THREE!;
    const state = this.toCanonicalState(entity);

    // GRAPHICS V2: prefer a dedicated status indicator when the visual has one (see `resolveVisual`'s
    // status band). Repainting every mesh — the old behaviour, kept as the fallback for visuals that
    // carry no indicator — turns a whole building into a solid block of state colour, which reads as
    // a toy rather than a city. The state itself is unchanged either way: same real C3 value, same
    // `applyVisualState` mapping, just applied where it belongs.
    const indicators: THREE_NS.Mesh[] = [];
    object.traverse((node) => {
      if ((node as THREE_NS.Mesh).isMesh && node.userData.genesisStatusIndicator) indicators.push(node as THREE_NS.Mesh);
    });

    const targets = indicators.length > 0 ? indicators : (() => {
      const all: THREE_NS.Mesh[] = [];
      object.traverse((node) => { if ((node as THREE_NS.Mesh).isMesh) all.push(node as THREE_NS.Mesh); });
      return all;
    })();

    for (const mesh of targets) {
      const material = mesh.material as THREE_NS.MeshStandardMaterial | THREE_NS.MeshPhysicalMaterial;
      if (material && 'emissive' in material) applyVisualState(material, THREE, state);
    }
  }

  /**
   * GRAPHICS V2: this scene had NO post-processing at all — it rendered straight to the canvas, so
   * its emissive windows, street lamps and status band could never bloom, and its tone mapping was
   * whatever the raw renderer defaulted to. That is most of the gap between "technical 3D" and the
   * look in `graphics/design-target/`.
   *
   * This is the SAME shared `setupGraphicsPipeline` (`graphics/postProcessing.ts`) that
   * `epidemicCity3D.ts` already uses — not a second pipeline. Bloom is a little stronger and its
   * threshold a little lower than the epidemic city's, because this is a dusk scene whose light
   * comes mostly from small emissive sources (windows, lamps) rather than a lit daytime facade.
   */
  setupPostProcessing(
    modules: PostProcessingModules,
    renderer: THREE_NS.WebGLRenderer,
    scene: THREE_NS.Scene,
    camera: THREE_NS.PerspectiveCamera,
    w: number,
    h: number,
  ): PostProcessor {
    const pipeline = setupGraphicsPipeline(this.THREE!, modules, renderer, {
      scene, camera, width: w, height: h,
      toneMappingExposure: 1.15,
      bloom: { strength: 0.5, radius: 0.6, threshold: 0.68 },
      ambient: { mode: 'none' },
      // SPRINT D — a subtle rack focus matching the SAME real establish->hero framing SPRINT C-3
      // already drives: sharp everywhere at the wide establishing distance (`focusPuller`'s seed),
      // easing toward a shallower hero focus on the pump/hospital pair as `updateCinematicFraming`
      // (called every frame from `syncScene`) detects the push-in has arrived. `minTier: 'medium'`
      // matches `recommendedDofForProfile`'s own HERO_CLOSE_UP blur strength (0.35) rather than a
      // one-off tuned value, so the lens and the DOF pass always agree on how strong the look is.
      depthOfField: configureDOF({
        focusDistance: this.focusPuller?.value ?? 60,
        blurStrength: recommendedDofForProfile('HERO_CLOSE_UP', this.focusPuller?.value ?? 60).blurStrength,
        minTier: 'medium',
      }),
    });
    this.pipeline = pipeline;
    return pipeline;
  }

  update(dt: number): void {
    // Time only advances through explicit step()/triggerPumpFailure() calls (deterministic,
    // testable, and matches this world's own real solver cadence) — never a per-frame auto-tick.
    // The shared environment's ambient haze is a pure rendering-layer effect (particle drift), not
    // simulation time, so it still animates every real frame regardless of world-clock state —
    // same split epidemicCity3D.ts's own cityHaze already draws between "world time" and "visual
    // motion that just needs to look alive."
    this.sceneEnvironment?.update(dt);
    // SPRINT D — advances the establish->hero rack focus started in `init()`. `update(dt)` (not
    // `syncScene`) is where this scene actually has a real `dt`; the lens-profile switch itself
    // lives in `syncScene` (it has the live camera, which this method deliberately does not).
    if (this.focusPuller) {
      const distance = this.focusPuller.update(dt);
      this.pipeline?.setFocusDistance(distance);
    }
  }

  /** Releases this scene's own environment resources. The rest of this file's materials/renderer
   * predate this addition and are a separate, pre-existing lifecycle gap — not widened here. */
  dispose(): void {
    this.sceneEnvironment?.dispose();
    this.sceneEnvironment = null;
    // GRAPHICS V2 context teardown. `disposeSceneResources` frees the geometry/materials of
    // everything under the group; the vegetation field owns its own instanced buffers, and the
    // shared context materials were created here so they are disposed here (nothing else holds
    // them) — the same ownership rule every kit in this engine follows.
    this.trees?.dispose();
    this.trees = null;
    if (this.contextGroup) {
      this.contextGroup.parent?.remove(this.contextGroup);
      disposeSceneResources(this.contextGroup);
      this.contextGroup = null;
    }
    for (const material of this.contextMaterials) material.dispose();
    this.contextMaterials = [];
    this.windowMaterial?.dispose();
    this.windowMaterial = null;
    this.wetSurfaceMaterials = [];
    this.rainfallVisualApplied = false;
    // SPRINT D cleanup. The pipeline's own GPU resources are freed by `useThreeLoop.ts`'s separate
    // `post.dispose()` call on the SAME object this field points at — only the reference itself
    // needs clearing here so `update()` never calls into a torn-down pipeline afterward.
    this.pipeline = null;
    this.appliedCinematicProfile = null;
    this.focusPuller = null;
  }

  /**
   * GRAPHICS V2 SPRINT C-2 — renders the REAL `RAINFALL_EVENT_TYPE` scenario, once it has actually
   * fired (`isRainfallScenarioActive()`, backed by `this.rainfallOutcome`), as a visible atmosphere
   * change: denser fog and wetter-looking road/pavement surfaces via `graphics/water.ts`'s own
   * `captureDryLook`/`applyWetLook` (SPRINT F+: reused, not re-implemented — an earlier version of
   * this method hand-rolled the same roughness/color response before this file's own audit found
   * `water.ts` already had it) — lower `roughness` reads as more specular under the same real
   * lighting, a real PBR response, not a fabricated shader standing in for state.
   *
   * HONEST SCOPE, stated up front: this is a RENDERING reaction to a real, already-fired C3 event —
   * it adds no weather solver, no precipitation model, and no new simulated quantity. Genesis has no
   * rainfall-intensity parameter (`getRainfallCounterfactualGap()` already documents that gap
   * explicitly); this method reads only the one real boolean fact C3 actually models — whether the
   * scripted scenario has begun — and always applies the same fixed visual response, exactly as
   * honest a mapping as `waterInfrastructureBridge.ts`'s NORMAL/FAILED -> geometry color mapping.
   *
   * Idempotent and reversible: it is called every frame from `syncScene` but only touches materials
   * on the one frame the boolean actually flips, and would restore the dry look if `rainfallOutcome`
   * were ever cleared (it currently never is — the scenario is one-way — but this does not assume
   * that either).
   */
  private applyRainfallVisualState(scene: THREE_NS.Scene): void {
    const active = this.isRainfallScenarioActive();
    if (active === this.rainfallVisualApplied) return;
    this.rainfallVisualApplied = active;

    if (scene.fog && 'density' in scene.fog) {
      (scene.fog as THREE_NS.FogExp2).density = active ? this.rainFogDensity : this.dryFogDensity;
    }
    for (const surface of this.wetSurfaceMaterials) {
      applyWetLook(this.THREE!, surface.material, surface.dry, active ? 1 : 0);
    }
  }

  /**
   * Applies a named `cinematicCamera.ts` profile's FOV, then immediately restores THIS scene's own
   * near/far clip planes. `cinematicCamera.ts`'s profiles (`near`/`far` included) were tuned for
   * `labScene3D.ts`'s single-room scale (a few metres) — found live that applying its
   * `WIDE_ESTABLISHING` profile as-is (`far: 100`) clipped most of this city (a ~150-unit road grid
   * viewed from ~84 units out) into a black screen. Reusing the profile for its FOV/DOF pairing
   * while overriding near/far for this scene's real spatial scale is the same kind of override
   * `sceneEnvironment.ts` already grants every caller for its own shared defaults — not a fork of
   * the module.
   */
  private applyCinematicProfile(camera: THREE_NS.PerspectiveCamera, profile: CinematicCameraProfile): void {
    configureCinematicCamera(camera, profile);
    camera.near = 0.1;
    camera.far = 600;
    camera.updateProjectionMatrix();
    this.appliedCinematicProfile = profile;
  }

  /**
   * GRAPHICS V2 SPRINT D — the lens half of the SPRINT C-3 establish->hero camera move.
   * `configureCinematicCamera` (`cinematicCamera.ts`, already proven in `labScene3D.ts`) swaps the
   * live camera's FOV between `WIDE_ESTABLISHING` (68deg, matches the initial wide shot) and
   * `HERO_CLOSE_UP` (40deg, a real cinematic lens change, not just a position move) once the
   * per-frame lerp `useThreeLoop.ts` already runs toward `getOrbitTarget()` has actually arrived —
   * detected here from the LIVE camera-to-target distance, the same real number that lerp is
   * closing. Applied only on change (`appliedCinematicProfile`), exactly like `labScene3D.ts`'s own
   * convention, so this never fights `updateProjectionMatrix` every frame for no reason.
   */
  private updateCinematicFraming(camera: THREE_NS.PerspectiveCamera): void {
    if (!this.followTarget || !this.observationStandoff) return;
    const distance = camera.position.distanceTo(this.followTarget);
    const desiredProfile: CinematicCameraProfile = distance > this.observationStandoff * 1.4 ? 'WIDE_ESTABLISHING' : 'HERO_CLOSE_UP';
    if (desiredProfile !== this.appliedCinematicProfile) {
      this.applyCinematicProfile(camera, desiredProfile);
    }
  }

  syncScene(_scene: THREE_NS.Scene, _camera: THREE_NS.PerspectiveCamera): void {
    if (!this.renderer) return;
    this.applyRainfallVisualState(_scene);
    this.updateCinematicFraming(_camera);
    // While replaying, render the REAL historical state at the cursor tick — getFrameState's own
    // optional `timestamp` param (bridge/worldFrameState.ts) already does this via the engine's
    // real scrubTo, so replay needs no second history/snapshot mechanism.
    const state = getFrameState(this.activeEngine, this.replay?.cursor);
    const frame: WorldFrame = {
      time: state.tick,
      entities: state.entities
        .filter((entity) => this.renderedIds.has(entity.id))
        .map((entity) => {
          const isPump = entity.id === this.city.pumpPipeId;
          // C2's waterInfrastructureBridge.ts recognizes exactly 'object:water-pump' (its own
          // documented visual-hint contract) and a `status` of one of its own
          // WaterInfrastructureState values — a real domain fact (WHAT changed, C1's job) computed
          // here from the pump's own real solver output, never a fabricated label. Every other
          // entity keeps its real domainBinding kind as its hint.
          const status: WaterInfrastructureState | string | undefined = isPump
            ? (typeof entity.scalars.volumetricFlow === 'number' && entity.scalars.volumetricFlow === 0 ? 'FAILED' : 'NORMAL')
            : entity.statusLabel;
          return {
            id: entity.id,
            // Every rendered entity is placed at its own REAL absolute city-space position, treated
            // as a root (no parentId) — see the module doc's "SCOPED RENDERING" note on why this
            // deliberately does not compose C3's containment hierarchy into relative offsets.
            position: [entity.transform.position.x, entity.transform.position.y, entity.transform.position.z],
            // GRAPHICS V2 — a PRESENTATION decision, explicitly not a claim about physical size.
            // `waterInfrastructure.ts`'s pump is authored at epidemicCity3D's CITY_WORLD_SCALE
            // (~0.018), so at scale 1 it renders as a ~0.5-unit dome — invisible next to this scene's
            // metric-scale buildings, even though it is the subject of the whole scenario. C3 models
            // no real extent for this entity (`boundingRadius` is not forwarded through the frame
            // contract — see SOLVER_DATA_CONTRACT.md §6, gap 7), so there is nothing real to read a
            // size from; this scales it to a legible one. `scale` also feeds cameraRig's
            // `targetRadius`, so framing stays consistent with what is drawn.
            scale: isPump ? 12 : 1,
            scalars: entity.scalars,
            status,
            grounding: groundingToC2(entity.grounding),
            visualHint: isPump ? 'object:water-pump' : entity.ref.kind,
            visible: true,
          };
        }),
    };
    this.renderer.sync(frame);
  }

  onRenderMetrics(metrics: ThreeRenderMetrics): void {
    this.renderMetrics = metrics;
  }

  getStats(): Record<string, number> {
    const pump = this.activeEngine.graph.tryGetEntity(this.city.pumpPipeId);
    const hospital = this.activeEngine.graph.tryGetEntity(this.city.hospitalBuildingId);
    return {
      tick: this.activeEngine.tick,
      viewingFailureBranch: this.viewingBranch === 'FAILURE' ? 1 : 0,
      hasFailureBranch: this.failureBranch ? 1 : 0,
      pumpFlow: pump?.domainState?.volumetricFlow ?? 0,
      pumpHeadLoss: pump?.domainState?.headLoss ?? 0,
      hospitalInterrupted: hospital?.domainState?.waterServiceInterrupted ?? 0,
      selected: this.lastSelectedId ? 1 : 0,
      rainfallActive: this.rainfallOutcome ? 1 : 0,
      // SPRINT C-2: distinct from `rainfallActive` (a world-model fact) — this is whether the
      // RENDERING has actually reacted to it yet (`applyRainfallVisualState`, driven by `syncScene`).
      rainfallVisualApplied: this.rainfallVisualApplied ? 1 : 0,
      // SPRINT D — the live rack-focus distance `update()` feeds into `GraphicsPipeline.setFocusDistance`;
      // exposed for the same observability reason `webgl_*` is (and so a test can verify the pull
      // actually progresses without a real WebGLRenderer to read DOF uniforms back out of).
      cinematicFocusDistance: this.focusPuller?.value ?? 0,

      replaying: this.replay ? 1 : 0,
      replayTick: this.replay?.cursor ?? -1,
      webgl_fps: this.renderMetrics.fps,
      webgl_frame_ms: this.renderMetrics.frameMs,
      webgl_render_ms: this.renderMetrics.renderMs,
      webgl_draw_calls: this.renderMetrics.drawCalls,
      webgl_triangles: this.renderMetrics.triangles,
      webgl_geometries: this.renderMetrics.geometries,
      webgl_textures: this.renderMetrics.textures,
    };
  }
}
