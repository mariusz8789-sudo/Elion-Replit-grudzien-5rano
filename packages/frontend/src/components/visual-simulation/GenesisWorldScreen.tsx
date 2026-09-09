import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE_NS from 'three';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../../core/three/types';
import type { SimParams } from '../../core/types';
import { useThreeLoop } from '../../core/three/useThreeLoop';
import { FirstPersonController, type MoveKey, type Obstacle } from '../../core/three/firstPersonController';
import { WorldFrameRenderer, type EntityVisualSpec } from '../../core/three/graphics/worldFrameRenderer';
import { InteractionController } from '../../core/three/graphics/interaction';
import type { WorldFrameEntity, WorldFrameEntityId } from '../../core/three/graphics/worldFrame';
import { buildTerrainFieldMesh, type TerrainFieldMesh } from '../../core/three/graphics/terrainField';
import { severityColor } from '../../core/three/graphics/stateVisualization';
import { createFireVfx, type FireVfxHandle } from '../../core/three/graphics/fireVfx';
import { createSceneEnvironment, type SceneEnvironmentHandle } from '../../core/three/graphics/sceneEnvironment';
import { computeSunState } from '../../core/three/graphics/environment';
import { createPBRMaterial, type StaticGenesisMaterialId } from '../../core/three/graphics/materials';
import { setupGraphicsPipeline, type GraphicsPipeline } from '../../core/three/graphics/postProcessing';
import { createPracticalLight } from '../../core/three/graphics/lighting';
import { createLightShaft } from '../../core/three/graphics/atmosphere';
import { createFacadeBuilding } from '../../core/three/graphics/buildingKit';
import { createWaterSurface, captureDryLook, applyWetLook, type WaterSurfaceHandle } from '../../core/three/graphics/water';
import { createVehicle, type VehicleHandle, type VehicleKind } from '../../core/three/graphics/vehicleKit';
import { HumanoidAgentVisual, type HumanoidAgentState } from '../../core/three/humanoidAgentVisual';
import { configureCinematicCamera } from '../../core/three/graphics/cinematicCamera';
import { getFrameState } from '../../core/worldModel/bridge/worldFrameState';
import { toGraphicsWorldFrame } from '../../core/worldModel/bridge/graphicsWorldFrameAdapter';
import { inspectEntity, leversForEntity, applyLeverIntervention, type EntityInspection } from '../../core/worldModel/bridge/entityInteractionBridge';
import { GENESIS_FLOOD_CATALOG, type WorldLever, type LeverSceneKind } from '../../core/agent/worldGoalIntent';
import { compareWorldActions, type CrossActionComparison } from '../../core/agent/crossActionComparison';
import { toMechanismRun } from '../../core/agent/discoveryStrategies';
import type { StrategyRun, StrategyRound } from '../../core/agent/discoveryStrategy';
import { runWorldDiscoveryAndRemember } from '../../core/agent/worldDiscoverySession';
import { admitWorldQuestion } from '../../core/agent/discoveryAdmission';
import { DISCOVERY_ORCHESTRATOR_CONTRACT_VERSION, type DiscoveryRan } from '../../core/agent/discoveryOrchestrator';
import { buildGenesisMatrixView, type GenesisMatrixView } from '../../core/agent/genesisMatrix';
import { narrateIntro, narrateRound, narrateNext, narrateInvestigation, type NarrationPhase } from '../../core/agent/genesisNarration';
import { detectRenderTier, type InteractiveRenderTier } from '../../core/three/quality';
import { buildGenesisScientificCity4, type GenesisScientificCity4 } from '../../core/worldModel/domains/genesisScientificCity4';
import { GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID } from '../../core/worldModel/domains/genesisScientificCity3';
import { buildSyntheticTerrain, type TerrainHeightfield } from '../../core/worldModel/domains/floodInundation';
import { buildUniformFuelBed, simulateWildfireSpread, type WildfireSpreadResult, type WindVector } from '../../core/worldModel/domains/wildfireSpread';
import {
  buildSlopeStabilityField, simulateLandslideRunout, runoutAreaM2, DEFAULT_SOIL_PARAMS,
  type SlopeStabilityField, type RunoutField,
} from '../../core/worldModel/domains/landslide';
import type { TemporalEngine } from '../../core/worldModel/temporal/temporalEngine';
import { PUMP_PIPE_DEFAULTS } from '../../core/engineeringGraph/pumpPipe';

export interface WildfireFieldSummary {
  readonly headRosMS: number;
  readonly headFirelineIntensityKWm: number;
  readonly headFlameLengthM: number;
  readonly reachedCells: number;
  readonly totalCells: number;
}

export interface LandslideFieldSummary {
  readonly minFactorOfSafety: number;
  readonly unstableCells: number;
  readonly totalCells: number;
  readonly maxVelocityAnywhereMS: number;
  readonly longestRunoutDistanceM: number;
  readonly runoutAreaM2: number;
  readonly pathsLeavingModelledArea: number;
}

/**
 * GENESIS WORLD OBSERVATION (Trinity browser verification page).
 *
 * Wires REAL C3 output (`buildGenesisScientificCity4` -> `getFrameState` ->
 * `toGraphicsWorldFrame`) into the EXISTING, generic C2 render pathway
 * (`WorldFrameRenderer` + `InteractionController`) on the EXISTING Sim3D/
 * useThreeLoop harness (the same infrastructure every other 3D lab page
 * already uses) — no second renderer, no second camera system, no second
 * picking implementation. This is C3's one browser-reachable observation
 * surface for verifying the Trinity pipeline end to end with real eyes on
 * a real WebGL canvas, not a claim resting only on vitest.
 */

const VISUAL_HINT_COLOR: Readonly<Record<string, number>> = {
  planet: 0x223344,
  region: 0x2a3a4a,
  city: 0x445566,
  district: 0x334455,
  road: 0x1c2430,
  building: 0x778899,
  'pump-pipe-system': 0x3388ff,
  population: 0xffaa33,
  lab: 0x33ccaa,
  substance: 0xcc66ff,
  environment: 0x66ddff,
  floodplain: 0x2266aa,
};

function colorForVisualHint(hint?: string): number {
  return (hint ? VISUAL_HINT_COLOR[hint] : undefined) ?? 0x8899aa;
}

/**
 * TIER1.3 — every entity box used to be a flat `MeshStandardMaterial({color, roughness:0.6})`, the
 * one hand-rolled placeholder material the audit found on this scene (no texture, no roughness/
 * metalness differentiation between a pump and a building). Mapping each `visualHint` onto a real
 * `materials.ts` PBR category — the same procedural-texture system every other production scene
 * already composes with — gives this scene actual material variety for free, without inventing any
 * new visual language: metal infrastructure reads as metal, roads read as asphalt, buildings read as
 * a real windowed facade (`BUILDING_FACADE`, see `materials.ts`'s own `makeBuildingFacadeSurface`
 * doc — floor-clustered lit/unlit windows with real frames, not a flat box). The tint
 * (`colorForVisualHint`, and `updateVisual`'s tripped/interrupted override)
 * still layers on top via `PBRMaterialOverrides.color` — status coloring is unchanged.
 */
const VISUAL_HINT_MATERIAL: Readonly<Record<string, StaticGenesisMaterialId>> = {
  planet: 'CONCRETE',
  region: 'CONCRETE',
  city: 'CONCRETE',
  district: 'BRICK',
  road: 'ASPHALT',
  building: 'BUILDING_FACADE',
  'pump-pipe-system': 'BRUSHED_METAL',
  population: 'TECH_COMPOSITE',
  lab: 'CERAMIC',
  substance: 'TECH_COMPOSITE',
  environment: 'TECH_COMPOSITE',
  floodplain: 'GROUND',
};

function materialCategoryForVisualHint(hint?: string): StaticGenesisMaterialId {
  return (hint ? VISUAL_HINT_MATERIAL[hint] : undefined) ?? 'CONCRETE';
}

// GENERIC INTERACTION SYSTEM — same distance+facing-dot proximity gate `labScene3D.ts` already
// proves in production for its one console (see that file's `INTERACT_MAX_DISTANCE`/
// `INTERACT_MIN_FACING_DOT`/`nearStation`), generalized here over EVERY entity the player can walk up
// to rather than one hardcoded point: `INTERACT_OVERRIDES` lets a specific entity (e.g. the
// city-scale floodplain, much bigger than a single box) declare its own trigger volume, while
// everything else uses these defaults, tuned for this scene's city scale instead of a room.
const INTERACT_DEFAULT_MAX_DISTANCE = 16;
const INTERACT_DEFAULT_MIN_FACING_DOT = 0.25;
const INTERACT_OVERRIDES: Readonly<Record<string, { maxDistance?: number; minFacingDot?: number }>> = {
  [GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID]: { maxDistance: 30 },
};

/**
 * GENERIC INTERACTION SYSTEM — the real, city-wide floodplain entity `addGenesisScientificCityFloodplain`
 * adds to this exact world (see `genesisScientificCity4.ts`) carries no spatial component of its own
 * today (`floodInundation.ts::addFloodplain` hardcodes `{x:0,y:0,z:0}`, since C3 has never needed a
 * position for a scalar it only ever consumed numerically) — a real, honestly-scoped gap, not a
 * fabrication: siting it is a presentation decision, not a scientific one, so it is made here, once, on
 * the C2 side, via `TemporalEngine.applyExternalPatch` (never a direct `graph.updateEntity`, so `scrubTo`
 * replays it correctly). Placed a fixed offset from the pump it drains into (the one real spatial
 * relationship the graph already declares between them), at a scale large enough to read as a
 * city-scale basin next to the pump's much smaller mechanical footprint.
 */
const FLOODPLAIN_OFFSET_FROM_PUMP = { x: 42, y: 0, z: -10 } as const;
const FLOODPLAIN_RENDER_SCALE = 16;

/**
 * PRIORITY 3 — LIVING LAYER, tied to real world state (never pure decoration).
 *
 * Day/night: `createSceneEnvironment` baked a fixed `hourOfDay: 21` at construction with no way to
 * animate it — this scene's own sun/fog now instead track the REAL `WorldFrameState.simulatedTime`
 * (`TemporalEngine`'s own clock, already advanced by every real tick/fork this scene already drives),
 * re-deriving the day's sun state via `environment.ts`'s own pure `computeSunState` on every
 * `syncNow()` — never a decorative clock running on its own. `GENESIS_WORLD_BASE_HOUR_OF_DAY` is the
 * hour the world STARTS at (tick 0), matching the mood the scene already had; from there time only
 * ever moves because the real model did. Documented simplification: the sky dome's own gradient stays
 * fixed at its initial bake (recomputing its per-vertex color buffer every sync would cost real GPU
 * upload bandwidth for a background element) — the sun light and fog, the two cues that actually read
 * as "day vs night" at ground level, do move with real time.
 */
const GENESIS_WORLD_BASE_HOUR_OF_DAY = 21;

/**
 * Real standing water on the floodplain: `waterLevelM` is the SAME real hydrology scalar the status
 * line and the floodplain's own inspect panel already read (`floodInundation.ts`'s own solve) — this
 * is that number given an actual literal water surface, not a second estimate. Below this depth
 * (a few centimetres) the plane is hidden rather than drawn as a barely-visible sliver.
 */
const FLOOD_WATER_MIN_VISIBLE_DEPTH_M = 0.03;

/**
 * ASTRA B4 — the floodplain's own box (its `visualHint: 'floodplain'` → `GROUND` material) darkens
 * and smooths toward a wet-look as `waterLevelM` rises, via the same `applyWetLook` every other
 * Genesis rain/wet surface uses. Scoped to the floodplain entity itself, not the whole 400-unit
 * ground plane: the solver models one basin, not city-wide rainfall, so claiming the entire ground
 * got wet would visually assert more than the model does. 1.5 m is a presentation choice (not a
 * scientific claim) — roughly the top of the range this catalog's own experiments explore — past
 * which the surface is already at its wettest visual state.
 */
const FLOOD_GROUND_WETNESS_REFERENCE_M = 1.5;

/**
 * PRIORITY 2 — REAL WORLD GEOMETRY. Like the floodplain above, every entity here also renders at the
 * SAME placeholder `scale: 1` (a 1.5-unit cube — confirmed by actually reading `getFrameState()`'s own
 * output, not assumed) regardless of what it represents: a hospital and a pump box the same size. Real
 * `spatial.scale` is presentation-only data (no solver anywhere consumes it — see `collectScalars`/
 * `toFrameEntity`), so giving the city's real BUILDINGS a real, walkable, human-relatable footprint —
 * and then colliding the player against that same footprint via `FirstPersonController`'s existing
 * `obstacles` option — is the same class of honest, additive presentation decision the floodplain siting
 * above already is: it changes how big/where something is drawn, never any scientific reading. The
 * water-system building is deliberately left unresized: it sits only 1 unit from the pump's own real
 * position (`(0,0,20)` vs `(0,0,19)`), so a real building-sized footprint there would swallow the
 * pump's own collision box and make the flagship pump interaction harder to reach — never worth it for
 * a presentation change.
 */
const HOSPITAL_BUILDING_SCALE = 7; // ~10.5-unit footprint — a real small building, not a placeholder cube
const LAB_BUILDING_SCALE = 6; // ~9-unit footprint
const PUMP_EQUIPMENT_SCALE = 3; // ~4.5-unit footprint — infrastructure, not a building

/** Half-extent (world units) of an entity's own rendered box, from its `spatial.scale` — mirrors `resolveVisual`'s own `Math.max(1.5, 1.5 * scale)` box-size math exactly, so a collision obstacle always matches what the player can actually see. */
function footprintHalfExtent(scale: number): number {
  return Math.max(1.5, 1.5 * scale) / 2;
}

/** A stable, deterministic seed derived from an entity's own real id — never `Math.random()`, so a
 * rebuilt scene (replay, branch switch) reproduces the identical building every time, the same
 * convention `genesisScientificCitySim.ts`'s own `stableSeed` already documents. */
function stableSeed(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash | 0);
}

/** Builds a square AABB obstacle centered on a real entity position, sized from its own real render scale. */
function buildingObstacle(position: { x: number; z: number }, scale: number): Obstacle {
  const half = footprintHalfExtent(scale);
  return { minX: position.x - half, maxX: position.x + half, minZ: position.z - half, maxZ: position.z + half };
}

/**
 * PRIORITY 2 — the ONE flagship building interior (mandate: "one excellent flagship environment, not
 * dozens"). The hospital, not an arbitrary building: it is the real narrative center of this world's
 * only scripted cascade (pump trip -> hospital water service interrupted -> population access
 * impaired), so walking inside it and inspecting the SAME real `hospitalBuildingId` entity at its
 * reception desk is a genuine "go see the consequence up close" moment, not decoration.
 */
const HOSPITAL_ENTRANCE_MAX_DISTANCE = 4;
const HOSPITAL_ENTRANCE_MIN_FACING_DOT = 0.3;
/** A private interior pocket far outside the outdoor room bounds (±190) and past the fog-shrouded edge
 * of the 400-unit ground plane, so it is never visible from, or reachable from, the outdoor city. */
const HOSPITAL_INTERIOR_ORIGIN = { x: 320, z: 320 } as const;
const HOSPITAL_INTERIOR_HALF = 5; // a 10x10 room
const HOSPITAL_INTERIOR_WALL_HEIGHT = 3.2;
const HOSPITAL_INTERIOR_DESK_POSITION = { x: HOSPITAL_INTERIOR_ORIGIN.x, z: HOSPITAL_INTERIOR_ORIGIN.z - 3 } as const;
const HOSPITAL_INTERIOR_SPAWN = { x: HOSPITAL_INTERIOR_ORIGIN.x, z: HOSPITAL_INTERIOR_ORIGIN.z + 3 } as const;

export class GenesisWorldSim3D implements Sim3D {
  cameraAutoRotateSpeed = 0;
  // LIVING WORLD — this scene now drives the camera itself (FirstPersonController), the same reason
  // labScene3D.ts sets this: without it, useThreeLoop.ts's OrbitControls.update() runs every frame
  // and silently fights any position/orientation this class sets directly on the camera.
  disableOrbitControls = true;
  private THREE: typeof THREE_NS | null = null;
  private scene: THREE_NS.Scene | null = null;
  private root: THREE_NS.Group | null = null;
  private renderer: WorldFrameRenderer | null = null;
  private interaction: InteractionController | null = null;
  private width = 300;
  private height = 300;
  private sceneEnvironment: SceneEnvironmentHandle | null = null;
  private pipeline: GraphicsPipeline | null = null;
  /** PRIORITY 3 — the floodplain's REAL standing water, a literal surface at the real `waterLevelM`
   * the hydrology solve reports — see `FLOOD_WATER_MIN_VISIBLE_DEPTH_M`'s own doc. ASTRA B4: a real
   * `createWaterSurface` (transmission + scrolling ripple) rather than a static flat-color plane. */
  private floodWater: WaterSurfaceHandle | null = null;
  /** GAME-GRADE C2 — shared base materials for `createFacadeBuilding`'s output. Cloned per building
   * (see `resolveBoundaryPlaceholder`'s own doc), created once here so cleanup has one owner. */
  private buildingWallMaterial: THREE_NS.Material | null = null;
  private buildingWindowMaterial: THREE_NS.Material | null = null;

  /**
   * C2-2 — AMBIENT LIFE: decorative vehicles/pedestrians looping the three REAL hospital/lab/pump
   * landmark positions (see `buildAmbientLife`'s own doc for why this is a simple loop rather than
   * "the real road network" — this world has no road network for anything to honestly follow).
   * `bodyMaterial` is stored per vehicle only because it's a fresh instance this scene created (not
   * one of `vehicleKit.ts`'s own defaults), so cleanup has a clear single owner, same convention as
   * `buildingWallMaterial` above.
   */
  private ambientVehicles: { handle: VehicleHandle; bodyMaterial: THREE_NS.Material; angularSpeed: number; phase: number }[] = [];
  private ambientPedestrians: { visual: HumanoidAgentVisual; id: number; angularSpeed: number; phase: number }[] = [];
  private ambientLoopCenter = { x: 0, z: 0 };
  private ambientVehicleLoopRadius = { x: 0, z: 0 };
  private ambientPedestrianLoopRadius = { x: 0, z: 0 };
  private ambientTimeSeconds = 0;

  /**
   * PLAY A LIVE EXPERIMENT ROUND — the real `StrategyRun` (`discoveryStrategy.ts`'s own contract,
   * projected from an ALREADY-COMPLETED `DiscoveryLoopResult` via `toMechanismRun`, never a second
   * search engine) the player is currently stepping through round by round. `null` when no run has
   * been played yet or the player dismissed it. Neither `discoveryLoop.ts` nor `inquiryLoop.ts` is
   * touched or reimplemented anywhere in this feature — `runStrategyDiscovery()` below calls the
   * SAME `runWorldDiscoveryAndRemember` seam `WorldDiscoveryPanel.tsx` already uses.
   */
  lastStrategyRun: StrategyRun | null = null;
  stagedRoundIndex = -1;
  /** Decorative-only beacon marking the lever the currently staged round pulled — see `stageRound()`'s
   * own doc for why this animates the lever's OWN declared `sceneForm` rather than guessing one from
   * its id, and why it is a separately-owned object rather than a mutation of the target entity's own
   * (state-driven, `updateVisual`-owned) material. */
  private roundStageBeacon: THREE_NS.Mesh | null = null;
  private roundStageKind: LeverSceneKind | null = null;
  private roundStageElapsed = 0;

  /**
   * WOW MOMENTS — an observer scientist standing beside the round-stage beacon, reacting to the
   * REAL verdict of the currently staged round (never a scripted animation). `showStatusOverlay:
   * false` because this is not an epidemiological agent — see `humanoidAgentVisual.ts::sync()`'s
   * own doc for why forcing `health:'unknown'` onto a non-epidemic actor is a category error this
   * codebase already refuses elsewhere. Built once, repositioned/shown per `stageRound()`, hidden on
   * `clearRoundStage()` — the same lifecycle split the beacon itself already uses.
   */
  private observerScientist: HumanoidAgentVisual | null = null;
  private observerFacing = 0;

  /**
   * VOICE GUIDE — the joined Genesis Matrix view (`genesisMatrix.ts`) for the currently staged run,
   * built once when the run completes, never per round: it is a projection of the WHOLE `StrategyRun`,
   * not one round of it. `narrateStagedRound()` reads this, bounded at the staged round index, so the
   * voice never describes a round the player has not reached yet.
   */
  private lastMatrixView: GenesisMatrixView | null = null;
  /**
   * How many of `narrateInvestigation`'s lines have already been spoken — the high-water mark that
   * makes each `stageRound()` speak only what is NEW since the last staged round, never replaying the
   * whole investigation from the top. Stepping backward (`prevRound()`) naturally stays silent rather
   * than re-speaking old lines: `narrateInvestigation` at a smaller index produces a script no longer
   * than this mark, so there is nothing past it to slice out.
   */
  private narratedLineCount = 0;
  /** Device capability tier (`quality.ts`) — read once in `init()`. Used only to decide how carefully
   * the Voice Guide manages the `speechSynthesis` queue (see `speakNarration()`'s own doc); it never
   * gates whether narration plays at all. */
  private renderTier: InteractiveRenderTier = 'medium';

  /**
   * LIVING WORLD — reuses the SAME production first-person controller `labScene3D.ts`/
   * `FirstPersonLabScreen.tsx`/`InvestorDemoScreen.tsx` already drive (pure movement math, no THREE
   * dependency, real WASD/mouse-look/accel-decel/collision/head-bob, fully tested) — not a second
   * camera system. Room bounds are the ground plane's own extent (`groundSize` in `init()`), with a
   * margin so the player can't walk past the visible ground edge into the fog.
   */
  private controller: FirstPersonController | null = null;
  private fpState: ReturnType<FirstPersonController['update']> | null = null;

  /**
   * GENERIC INTERACTION SYSTEM — every entity the player can walk up to and act on, not just the
   * pump. Populated once in the constructor (needs only `this.city`'s own real ids, no THREE
   * dependency), positions refreshed every `syncNow()` from the same frame the renderer already
   * draws from (never re-derived or guessed). Hospital/lab/population have no real lever in
   * `GENESIS_FLOOD_LEVERS` today — they are honestly INSPECT-only (see `leversForEntity`), not
   * excluded, so a player can still walk up and see their real state.
   */
  private readonly interactableIds: readonly WorldFrameEntityId[];
  private interactablePositions = new Map<WorldFrameEntityId, readonly [number, number, number]>();
  /** The nearest interactable entity the player is close enough to, and roughly facing — the one
   * spatial trigger this scene exposes, generalized from the pump-only version. `null` when none is
   * in range. Read by React via `getNearestInteractableId()` (not `getStats()`: an entity id is not a
   * number, and `Sim3D.getStats()`'s shared contract is `Record<string, number>` for every scene). */
  nearestInteractableId: WorldFrameEntityId | null = null;

  /**
   * PRIORITY 2 — REAL WORLD GEOMETRY. `controller` above is now the OUTDOOR player; `interiorController`
   * is a second, independent `FirstPersonController` for the one flagship building interior (the
   * hospital), built lazily on first entry with its own small room bounds far from the outdoor city
   * (see `HOSPITAL_INTERIOR_ORIGIN`'s own doc). `insideBuildingId` selects which one is actually driving
   * the camera this frame (`activeController()`) — never both, since only one first-person body exists.
   */
  private interiorController: FirstPersonController | null = null;
  private interiorGroup: THREE_NS.Group | null = null;
  insideBuildingId: WorldFrameEntityId | null = null;
  /** The hospital's real entrance point (just outside its own real, resized footprint), computed once
   * in `init()` from the hospital's real position — never guessed independently of where the building
   * actually renders. */
  private hospitalEntrancePosition: readonly [number, number, number] | null = null;
  /** True once the player (outdoors) is close enough to, and facing, the hospital's real entrance — the
   * separate, navigation-only trigger from `nearestInteractableId`'s science-interaction trigger. */
  nearHospitalEntrance = false;

  readonly city: GenesisScientificCity4;
  forkEngine: TemporalEngine | null = null;
  showFork = false;
  scrubTick: number | null = null;
  hoveredId: WorldFrameEntityId | null = null;

  /**
   * Real Rothermel (1972) surface-fire-spread + Finney (2002) minimum-travel-time field
   * (`wildfireSpread.ts`, already shipped by C3, previously with no visualization anywhere in
   * `core/three/`), rendered through the new generic `terrainField.ts` kit. Built lazily on first
   * toggle — the site has nothing to do with `city`'s Alicante slice, it is its own standalone
   * demonstration terrain (`buildSyntheticTerrain`, `surveyed: false`), so it replaces the entity
   * view rather than sharing world space with it.
   */
  private wildfireField: TerrainFieldMesh | null = null;
  private wildfireResult: WildfireSpreadResult | null = null;
  /**
   * WOW SPRINT — a real flame+smoke effect at the fire's actual ignition point (read off the built
   * terrain mesh's own vertex position, not re-derived by hand), scaled by the SAME real
   * `headFlameLengthM`/`headFirelineIntensityKWm` the status line already shows. Closes the "fire is
   * modelled scientifically but has zero flame/smoke visually" gap on the EXISTING wildfire toggle —
   * no new UI surface. `null` whenever the real solve produced no flame (`headFlameLengthM <= 0`):
   * `createFireVfx` refuses a non-positive height, and inventing a positive one to show SOMETHING
   * would be exactly the fabrication this engine's honesty rule forbids.
   */
  private fireVfx: FireVfxHandle | null = null;
  showWildfire = false;

  /**
   * Real infinite-slope stability + sliding-block runout field (`landslide.ts`, also already
   * shipped by C3 with no visualization anywhere), on its own standalone demonstration terrain —
   * the same `terrainField.ts` kit's second real application, proving the "one shared piece, not
   * three one-off terrain meshes" the kit's own module doc argues for. Mutually exclusive with the
   * wildfire field (`setShowWildfire`/`setShowLandslide` each hide the other): both replace the
   * entity view with one full-screen terrain mesh, so showing both at once would just overdraw one
   * with the other for no benefit.
   */
  private landslideField: TerrainFieldMesh | null = null;
  private landslideTerrain: TerrainHeightfield | null = null;
  private landslideStability: SlopeStabilityField | null = null;
  private landslideRunout: RunoutField | null = null;
  showLandslide = false;

  /** Set by the React component to receive selection changes — the ONLY coupling between this Sim3D and React, exactly the pattern `interaction.ts` documents (`onSelect`). */
  onSelect?: (id: WorldFrameEntityId | null) => void;

  constructor() {
    this.city = buildGenesisScientificCity4({ rainfallAtTick: 2, populationCount: 5000 });
    this.interactableIds = [
      this.city.pumpPipeId,
      GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
      this.city.hospitalBuildingId,
      this.city.labId,
      this.city.populationId,
    ];
  }

  private activeEngine(): TemporalEngine {
    return this.showFork && this.forkEngine ? this.forkEngine : this.city.base.engine;
  }

  init(THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera, w: number, h: number): void {
    this.THREE = THREE;
    this.scene = scene;
    this.width = w;
    this.height = h;
    // VOICE GUIDE — read once; only decides how carefully `speakNarration()` manages the
    // `speechSynthesis` queue, never whether narration plays (see that method's own doc).
    this.renderTier = detectRenderTier();

    // C2-3 — this scene's camera is ALWAYS first-person (the outdoor `controller` or the hospital's
    // own `interiorController`; unlike `labScene3D.ts` there is no establishing shot or hero close-up
    // to cut to), so `SCIENTIST_POV` is not one cinematic phase among several here — it's the one lens
    // this whole scene ever needs, applied once. `useThreeLoop.ts` hands every scene a generic
    // `PerspectiveCamera(50, 1, 0.01, 2000)`; the wider 68deg FOV genuinely reads as "occupying the
    // space" rather than looking through a narrow tube (the same reasoning `labScene3D.ts`'s own
    // FREE-phase choice already documents), and SCIENTIST_POV has no DOF opinion, correctly: a
    // scientist's own vision isn't selectively blurred (nothing in `setupPostProcessing` below passes
    // `depthOfField`, so this was already true here — this just makes the lens match on purpose).
    //
    // The profile's own `far: 100` is NOT adopted: it's tuned for `labScene3D.ts`'s single-room set,
    // not this scene's real 400-unit ground (`groundSize: 400` below) with a deliberately low
    // `fogDensity: 0.0022` so the whole city stays legible at a distance (at that density, fog barely
    // fades even at 400 units — nothing like the profile's small-room assumption). A hard far-plane
    // clip at 100 would cut real, intended-to-be-visible geometry well before fog ever meaningfully
    // dims it — a visible regression, not an improvement. Keeping this scene's own far plane and
    // adopting only the profile's FOV/near is the same class of honest, explained deviation as
    // `resolveBoundaryPlaceholder`'s own (wiring the real code path instead of the directive's literal
    // line) and `buildAmbientLife`'s own (a loop instead of a road network that doesn't exist here).
    const previousFar = camera.far;
    configureCinematicCamera(camera, 'SCIENTIST_POV');
    camera.far = previousFar;
    camera.updateProjectionMatrix();

    // TIER1.3 — this scene used to hand-roll its own background color, a single hemisphere+directional
    // light pair, and a flat unlit-looking ground plane, independently of the shared exterior baseline
    // every other outdoor scene composes with (see `sceneEnvironment.ts`'s own module doc — this scene
    // was one of the very hand-rolled cases it names). Mirrors `genesisScientificCitySim.ts`'s own
    // night-preset call: `hourOfDay: 21` drives the dark sky/fog mood this scene already had (was a flat
    // `0x0a0f1a` background), while the sun/fill overrides keep the world actually lit and legible
    // rather than physically-dim-night-dark (see that scene's own comment on why the raw preset alone
    // leaves geometry "nearly unlit and floating in fog").
    this.sceneEnvironment = createSceneEnvironment(THREE, scene, {
      mode: 'OUTDOOR',
      hourOfDay: GENESIS_WORLD_BASE_HOUR_OF_DAY,
      fogDensity: 0.0022,
      groundSize: 400,
      // A legible slate tone, not a physically-dim night ground: this is an OBSERVATION surface
      // (command-center view of the whole scientific city, entities scattered across it), not a
      // moody establishing shot — the audit's own "Genesis World reads as empty/void" finding was
      // largely this ground rendering near-black under the originally much darker tint+lighting,
      // worsened by the camera's steep top-down angle exposing most of the frame to that dark plane.
      groundMaterial: createPBRMaterial(THREE, 'CONCRETE', { color: 0x4a5c78 }),
      sunPosition: [60, 100, 40],
      sunColor: 0xdfe8ff,
      sunIntensity: 2.6,
      fillIntensity: 2,
      fillSkyColor: 0xbcd2ff,
      fillGroundColor: 0x3a3a46,
      // ASTRA B3 — `createSceneEnvironment`'s ambient haze was reaching this scene only as an
      // unopinionated default (warm 0xd9b57a "dust" tan, tuned for an indoor/desert palette elsewhere)
      // rather than a deliberate choice; made explicit here and re-tinted cool blue-grey to match this
      // scene's own night palette (`fillSkyColor`/`groundMaterial` above), so it reads as night haze
      // giving the empty air over the 400-unit ground real depth, not a color mismatch nobody chose.
      ambientHaze: true,
      ambientHazeOptions: { color: 0x9fb3d9, opacity: 0.07 },
    });

    this.root = new THREE.Group();
    scene.add(this.root);

    // Declared here (not down with the rest of PRIORITY 2's building setup) because
    // `resolveBoundaryPlaceholder` below needs it in its closure too, and this is the one canonical
    // place both consumers read from — no second literal of this id anywhere in this file.
    const labBuildingId: WorldFrameEntityId = 'building:chemistry-lab-building';

    // GAME-GRADE C2 — same recipe `genesisScientificCitySim.ts` already proved: a plain CONCRETE wall
    // and a white, warm-emissive window base (InstanceBatch multiplies this by each window's own
    // lit/unlit vertex color, so white lets that tint show through undistorted; the emissive feeds
    // the bloom threshold ASTRA B2 already lowered for exactly this kind of light source).
    this.buildingWallMaterial = createPBRMaterial(THREE, 'CONCRETE');
    this.buildingWindowMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.25, metalness: 0.05, emissive: 0xffc98a, emissiveIntensity: 0.45,
    });

    const resolveVisual = (entity: WorldFrameEntity): EntityVisualSpec => {
      const size = Math.max(1.5, 1.5 * (entity.scale ?? 1));
      const geometry = new THREE.BoxGeometry(size, size, size);
      const material = createPBRMaterial(THREE, materialCategoryForVisualHint(entity.visualHint), {
        color: colorForVisualHint(entity.visualHint),
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return { kind: 'object', object: mesh };
    };
    const updateVisual = (entity: WorldFrameEntity, object: THREE_NS.Object3D): void => {
      const mesh = object as THREE_NS.Mesh;
      const material = mesh.material as THREE_NS.MeshStandardMaterial;
      const tripped = entity.visualHint === 'pump-pipe-system' && entity.scalars?.volumetricFlow === 0;
      const interrupted = typeof entity.status === 'string' && entity.status.toLowerCase().includes('interrupted');
      material.color.set(tripped ? 0xff3333 : interrupted ? 0xff8800 : colorForVisualHint(entity.visualHint));
      // ASTRA B4 — the floodplain's own ground box gets visibly wetter as the REAL waterLevelM scalar
      // rises, via the shared wet-look helper every rain-reactive surface in Genesis already uses.
      // `captureDryLook` right after the color line above (not once at creation) so this reads the
      // color this exact call just set, never accumulating darkness/roughness across repeated syncs.
      if (entity.visualHint === 'floodplain' && !tripped && !interrupted) {
        const waterLevelM = typeof entity.scalars?.waterLevelM === 'number' ? entity.scalars.waterLevelM : 0;
        const wetness = Math.max(0, Math.min(1, waterLevelM / FLOOD_GROUND_WETNESS_REFERENCE_M));
        applyWetLook(THREE, material, captureDryLook(material), wetness);
      }
    };

    // ASTRA B1 — every `building`-kind entity in this world (hospital, chemistry lab, water-system,
    // and the procedural city-grid fillers) is `NOT_MODELED` (no domain binding — nobody solves
    // building architecture), so `WorldFrameRenderer.sync()` never reaches `resolveVisual` for any of
    // them at all: it routes straight to the boundary-placeholder path BEFORE `resolveVisual` is ever
    // called (confirmed by direct instrumentation, not assumed). Every other NOT_MODELED kind still
    // gets the renderer's own default sphere, reproduced verbatim below (not exported to override
    // selectively).
    //
    // GAME-GRADE C2 — B1's first pass gave `building`-kind entities a wireframe box SHAPED like their
    // real footprint instead of the renderer's generic sphere, reasoning that a real windowed facade
    // would be dishonest here. Revisited: `createFacadeBuilding` tags its own output
    // `userData.visualOnlyContext = true` by default specifically for this case — a proven, shipped
    // building block (`genesisScientificCitySim.ts` already uses it for its own decorative background
    // buildings under the exact same tag) whose window pattern is deterministic massing, not a claim
    // about any real occupancy/state data. That is a materially different claim from what B1 was
    // actually guarding against (a solver-derived reading rendered as if measured); a plausible window
    // grid on a building whose EXISTENCE and FOOTPRINT are real is no more dishonest than giving the
    // pump a plausible metal color no solver picked either. `resolveVisual`'s bare `BoxGeometry` (this
    // scene's single biggest "reads like a debug view" culprit) is why this kit exists in the first
    // place — see that function's own doc there: "the reason genesisScientificCitySim had to render
    // its buildings as bare BoxGeometry." This scene had the same reason; wiring it here removes it,
    // in the ONE place these entities actually render (the placeholder path, not `resolveVisual`).
    const resolveBoundaryPlaceholder = (_THREE: typeof THREE_NS, entity: WorldFrameEntity): THREE_NS.Object3D => {
      if (entity.visualHint === 'building' && this.buildingWallMaterial && this.buildingWindowMaterial) {
        const scale = entity.scale ?? 1;
        const isHospital = entity.id === this.city.hospitalBuildingId;
        const isLab = entity.id === labBuildingId;
        // The exact footprint the existing collision obstacle already uses (`footprintHalfExtent`'s
        // own formula) for the two real, walkable buildings, so the visual silhouette always matches
        // what actually blocks the player; a plausible default for the water-system building and the
        // procedural city-grid fillers, which carry no presentation-scale patch (`scale` stays 1) and
        // have no collision of their own to match.
        const footprint = isHospital || isLab ? Math.max(1.5, 1.5 * scale) : 4.5;
        const height = isHospital ? 9 : isLab ? 8 : 6 + (stableSeed(entity.id) % 8);
        // `WorldFrameRenderer.applyTransform` applies `object.scale.setScalar(entity.scale)` UNIFORMLY
        // on top of whatever this returns (ADAPTER_CONTRACT.md rule 4, and the exact bug ASTRA B1
        // already found and fixed for this building's own graph-children). Dividing every dimension by
        // that same `scale` here cancels it out, so the absolute sizes above are the final on-screen
        // size, not `scale` squared. A no-op for entities with no presentation-scale patch (`scale===1`).
        // `floorHeight` (default 1.2) is an ABSOLUTE local-space constant `createFacadeBuilding` uses
        // to derive window-row count/size — it has no idea its output is about to be rescaled. Dividing
        // width/depth/height by `scale` without also dividing `floorHeight` by the SAME `scale` breaks
        // that ratio: for the hospital (scale 7), `height/scale` collapses to about one floor's worth,
        // so `rows = floor(height/floorHeight)` rounds down to a single giant "window" per facade —
        // confirmed the hard way via a real Chromium screenshot, not assumed. Scaling `floorHeight` by
        // the same factor keeps every internal ratio (row count, window proportions) identical to what
        // it would be at the true absolute size, so the facade reads correctly at any presentation scale.
        const building = createFacadeBuilding(THREE, {
          position: [0, 0, 0],
          width: footprint / scale, depth: footprint / scale, height: height / scale,
          floorHeight: 1.2 / scale,
          seed: stableSeed(entity.id),
          wallMaterial: this.buildingWallMaterial.clone(),
          windowMaterial: this.buildingWindowMaterial.clone(),
          roofMaterial: this.buildingWallMaterial.clone(),
          litFraction: isHospital ? 0.6 : 0.4,
        });
        return building;
      }
      const boundaryMaterial = new THREE.MeshBasicMaterial({ color: 0x5a6b7a, wireframe: true, transparent: true, opacity: 0.35 });
      const radius = 0.5 * (entity.scale ?? 1);
      return new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), boundaryMaterial);
    };

    this.renderer = new WorldFrameRenderer(THREE, this.root, { resolveVisual, updateVisual, resolveBoundaryPlaceholder });
    this.interaction = new InteractionController(THREE, {
      camera,
      resolver: this.renderer,
      // While a terrain field overlay is showing, the entity boxes are hidden — excluding `root`
      // from the raycast targets too, not just from rendering, so a click can't "select" a hidden box.
      getTargets: () => (this.root && !this.showWildfire && !this.showLandslide ? [this.root] : []),
      onHoverChange: (id) => {
        this.hoveredId = id;
      },
      onSelect: (id) => {
        this.onSelect?.(id);
      },
    });

    // LIVING WORLD — spawn a short walk from the pump's REAL current position (read straight off a
    // live frame, not guessed), facing it, so the flagship interaction is reachable within a few
    // seconds instead of requiring the player to hunt across the whole 400-unit ground plane first.
    const spawnFrame = getFrameState(this.city.base.engine);
    const pumpEntity = spawnFrame.entities.find((e) => e.id === this.city.pumpPipeId);
    const pumpPos = pumpEntity ? pumpEntity.transform.position : { x: 0, y: 0, z: 0 };

    // GENERIC INTERACTION SYSTEM — site the floodplain (see `FLOODPLAIN_OFFSET_FROM_PUMP`'s own doc)
    // once, on the live base engine, via the correct live-mutation API (`applyExternalPatch`, not a
    // direct `graph.updateEntity`) so `scrubTo` replays this placement instead of losing it.
    const floodplainPos = {
      x: pumpPos.x + FLOODPLAIN_OFFSET_FROM_PUMP.x,
      y: pumpPos.y + FLOODPLAIN_OFFSET_FROM_PUMP.y,
      z: pumpPos.z + FLOODPLAIN_OFFSET_FROM_PUMP.z,
    };
    this.city.base.engine.applyExternalPatch(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID, {
      spatial: {
        position: floodplainPos,
        scale: { x: FLOODPLAIN_RENDER_SCALE, y: FLOODPLAIN_RENDER_SCALE, z: FLOODPLAIN_RENDER_SCALE },
      },
    });
    this.buildFloodWaterMesh(THREE, scene, floodplainPos);

    // PRIORITY 2 — REAL WORLD GEOMETRY. Give the hospital, lab building, and pump a real, walkable
    // footprint (see the constants' own doc for why the water-system building is deliberately skipped),
    // at their own REAL, already-templated positions — read from the same live frame, never guessed —
    // so this only changes SIZE, never WHERE anything is. `buildingObstacle` below then turns those same
    // real footprints into real collision.
    const hospitalEntity = spawnFrame.entities.find((e) => e.id === this.city.hospitalBuildingId);
    const hospitalPos = hospitalEntity ? hospitalEntity.transform.position : { x: 0, y: 0, z: 0 };
    const labBuildingEntity = spawnFrame.entities.find((e) => e.id === labBuildingId);
    const labBuildingPos = labBuildingEntity ? labBuildingEntity.transform.position : { x: 0, y: 0, z: 0 };
    for (const [id, position, scale] of [
      [this.city.hospitalBuildingId, hospitalPos, HOSPITAL_BUILDING_SCALE],
      [labBuildingId, labBuildingPos, LAB_BUILDING_SCALE],
      [this.city.pumpPipeId, pumpPos, PUMP_EQUIPMENT_SCALE],
    ] as const) {
      this.city.base.engine.applyExternalPatch(id, {
        spatial: { position, scale: { x: scale, y: scale, z: scale } },
      });
    }

    // ASTRA B1 — a real bug this session's own Chromium check caught, not present in any unit test:
    // `WorldFrameRenderer` parents a graph CHILD's mesh under its WorldModel parent's own mesh
    // (`ensureParented`), and Three.js scale is multiplicative down that hierarchy. The hospital/lab
    // resize above is presentation-only (a footprint choice, not a scientific one — see that block's
    // own doc), but it silently ALSO multiplies the render size of every entity parented to those
    // buildings in the graph: `population:city-1` (a real child of the hospital) rendered at
    // `HOSPITAL_BUILDING_SCALE`× its own size, filling the screen as a giant flat-colored box that
    // looked exactly like a broken "building" — because it effectively was one, just not the one
    // anybody meant to resize. Counter-scaling each DIRECT child by the inverse of its parent's
    // presentation scale cancels the inherited multiplication, restoring the size it would have
    // rendered at before the building was ever resized — this changes no science (population's own
    // declared scale was never 7 to begin with; this repairs an accidental side effect of a rendering
    // choice, not the model). Only DIRECT children need correcting: `substance:s1` is a child of
    // `lab:lab1`, not of the lab building itself, so fixing `lab1`'s own scale already cancels the
    // whole chain for its descendant too — patching `substance` as well would double-correct it.
    for (const [id, parentScale] of [
      [this.city.populationId, HOSPITAL_BUILDING_SCALE],
      [this.city.labId, LAB_BUILDING_SCALE],
    ] as const) {
      const inverse = 1 / parentScale;
      const ownPosition = spawnFrame.entities.find((e) => e.id === id)?.transform.position ?? { x: 0, y: 0, z: 0 };
      this.city.base.engine.applyExternalPatch(id, {
        spatial: { position: ownPosition, scale: { x: inverse, y: inverse, z: inverse } },
      });
    }

    const obstacles: Obstacle[] = [
      buildingObstacle(hospitalPos, HOSPITAL_BUILDING_SCALE),
      buildingObstacle(labBuildingPos, LAB_BUILDING_SCALE),
      buildingObstacle(pumpPos, PUMP_EQUIPMENT_SCALE),
      buildingObstacle(
        { x: pumpPos.x + FLOODPLAIN_OFFSET_FROM_PUMP.x, z: pumpPos.z + FLOODPLAIN_OFFSET_FROM_PUMP.z },
        FLOODPLAIN_RENDER_SCALE,
      ),
    ];

    // The hospital's real entrance: just outside its own real (now-resized) south face, facing north
    // into the building — computed from the SAME real position/scale the collision obstacle above uses.
    const hospitalHalf = footprintHalfExtent(HOSPITAL_BUILDING_SCALE);
    this.hospitalEntrancePosition = [hospitalPos.x, hospitalPos.y, hospitalPos.z + hospitalHalf + 2];

    const spawnPosition = { x: pumpPos.x, z: pumpPos.z + 22 };
    const dx = pumpPos.x - spawnPosition.x;
    const dz = pumpPos.z - spawnPosition.z;
    // Matches this controller's own convention (`getForward()`: `{x:-sin(yaw), z:-cos(yaw)}`).
    const spawnYaw = Math.atan2(-dx, -dz);
    const half = 400 / 2 - 10; // groundSize/2, minus a margin so the player can't walk into the fog edge
    this.controller = new FirstPersonController({
      room: { minX: -half, maxX: half, minZ: -half, maxZ: half },
      obstacles,
      startPosition: spawnPosition,
      startYaw: spawnYaw,
      eyeHeight: 1.7,
      moveSpeed: 7,
    });
    camera.position.set(spawnPosition.x, this.controller.getState().position.y, spawnPosition.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(0, spawnYaw, 0);

    this.buildHospitalInterior(THREE, scene);
    this.buildLandmarkLighting(THREE, scene, [hospitalPos, labBuildingPos, pumpPos]);
    this.buildAmbientLife(THREE, scene, [hospitalPos, labBuildingPos, pumpPos]);
    this.buildObserverScientist(THREE, scene);

    this.syncNow();
  }

  /**
   * PRIORITY 3 — a real water surface over the floodplain's own real footprint, built once (a plain
   * transparent blue plane); `syncNow()` moves its height and toggles its visibility from the SAME
   * real `waterLevelM` scalar the status line/inspect panel already read, every sync — never a
   * decorative animation of its own.
   */
  private buildFloodWaterMesh(THREE: typeof THREE_NS, scene: THREE_NS.Scene, floodplainPos: { x: number; y: number; z: number }): void {
    const size = Math.max(1.5, 1.5 * FLOODPLAIN_RENDER_SCALE);
    // ASTRA B4 — real transmission + a scrolling ripple normal map (`graphics/water.ts`'s own shared
    // module, the same one every other Genesis water surface composes with) instead of a static flat
    // `MeshStandardMaterial` plane. Same base color (0x1a5ea8) as before, preserved for both visual
    // continuity and the existing scene test that locates this mesh by that exact color.
    const water = createWaterSurface(THREE, {
      width: size, depth: size, color: 0x1a5ea8, roughness: 0.12, thicknessMeters: 1.2,
    });
    water.mesh.position.set(floodplainPos.x, floodplainPos.y, floodplainPos.z);
    water.mesh.visible = false;
    scene.add(water.mesh);
    this.floodWater = water;
  }

  /**
   * ASTRA B2 — the flagship's night has no real light sources outside the hospital interior at all:
   * `streetKit.ts`'s lamp is honestly documented as emissive geometry only (see that file's own
   * "HONEST SCOPE" note), never wired here anyway, so nothing outdoors actually illuminates anything.
   * There is no street network in this scene to line with lamps (entities are scattered landmarks, not
   * a road grid), so this places one warm, non-shadow-casting `createPracticalLight` at each real
   * landmark instead — reads as a lit entrance/fixture, not decoration, and gives the lowered bloom
   * threshold (`setupPostProcessing`) real light to catch alongside the facade windows' own emissive.
   */
  private buildLandmarkLighting(
    THREE: typeof THREE_NS,
    scene: THREE_NS.Scene,
    positions: readonly { x: number; y: number; z: number }[],
  ): void {
    for (const pos of positions) {
      createPracticalLight(THREE, scene, {
        position: [pos.x, 4, pos.z],
        color: 0xffc38a,
        intensity: 6,
        distance: 26,
        decay: 2,
      });
    }
  }

  /**
   * C2-2 — AMBIENT LIFE. `vehicleKit.ts`/`humanoidAgentVisual.ts` are both already documented as
   * DECORATIVE, caller-drives-motion kits — `vehicleKit.ts`'s own doc states outright "every vehicle
   * here is DECORATIVE city population... it never claims to be a WorldFrame/C3 entity", and
   * `HumanoidAgentState` is a plain interface with no required link to a real `SimAgent`. That is
   * exactly the honesty label this scene needs, because there is no real road network here for
   * anything to follow: this world's `road:city-road-*` entities (`CITY_TEMPLATE`, in
   * `specification/templates.ts`) are single-point, NOT_MODELED placeholders, and that template's own
   * doc says outright "C3 has no dedicated road/transport-network scale, and does not fabricate one
   * here." `core/world/roadNetwork.ts`'s real `CityLayout`/`buildRoadNetwork` is a completely separate
   * subsystem belonging only to the `epidemicCity3D.ts`/`City3DWebGLScreen.tsx` family of scenes (the
   * `#/city3d` route) — it has no relationship to `genesisScientificCity4`'s world at all. Importing
   * it here just so these vehicles could "follow" it would fabricate a connection C3 never declared,
   * dressing up decoration as a real network — the same class of dishonesty this engine's grounding
   * discipline exists to prevent, just moved into road geometry instead of a sensor reading.
   *
   * What this DOES do: loop a handful of vehicles/pedestrians around a simple ellipse sized from the
   * three REAL landmark positions passed in (never guessed, never re-derived independently of where
   * `init()` actually placed the hospital/lab/pump) — filling the empty ground between them with
   * motion, honestly scoped as ambiance rather than a traffic/pedestrian simulation. Positions are
   * driven every real frame in `updateAmbientLife()`, the same "pure rendering-layer animation, not
   * simulation time" category `update(dt)`'s own doc already carves out for the fire VFX/haze/player
   * movement.
   */
  private buildAmbientLife(
    THREE: typeof THREE_NS,
    scene: THREE_NS.Scene,
    landmarks: readonly { x: number; z: number }[],
  ): void {
    const xs = landmarks.map((p) => p.x);
    const zs = landmarks.map((p) => p.z);
    this.ambientLoopCenter = { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanZ = Math.max(...zs) - Math.min(...zs);
    // Margin clears the largest real landmark footprint in this scene (the hospital's own
    // `footprintHalfExtent(HOSPITAL_BUILDING_SCALE)` = 5.25) plus room for a vehicle body/pedestrian
    // silhouette — the pedestrian loop sits inside the vehicle loop, like a sidewalk inside a street.
    this.ambientVehicleLoopRadius = { x: spanX / 2 + 14, z: spanZ / 2 + 14 };
    this.ambientPedestrianLoopRadius = { x: spanX / 2 + 8, z: spanZ / 2 + 8 };

    const kinds: VehicleKind[] = ['car', 'van', 'ambulance', 'car'];
    const colors: THREE_NS.ColorRepresentation[] = [0x8a2f2f, 0x2f5c9a, 0xd8d8d8, 0x4a7a4a];
    kinds.forEach((kind, i) => {
      const bodyMaterial = createPBRMaterial(THREE, 'PAINTED_METAL', { color: colors[i % colors.length] });
      const handle = createVehicle(THREE, {
        kind,
        // Repositioned every frame in `updateAmbientLife()` — this scene drives motion itself, per
        // `vehicleKit.ts`'s own "kit owns geometry, caller owns motion" boundary.
        position: [0, 0, 0],
        bodyMaterial,
        seed: i * 11 + 5,
        state: kind === 'ambulance' ? 'EMERGENCY' : 'MOVING',
      });
      scene.add(handle.group);
      this.ambientVehicles.push({ handle, bodyMaterial, angularSpeed: 0.045 + i * 0.012, phase: (i / kinds.length) * Math.PI * 2 });
    });

    const pedestrianCount = 4;
    for (let i = 0; i < pedestrianCount; i++) {
      const id = 900_000 + i; // far outside any real entity/population id range, so it can never collide with one
      const visual = new HumanoidAgentVisual(THREE, id);
      scene.add(visual.root);
      this.ambientPedestrians.push({ visual, id, angularSpeed: 0.10 + i * 0.02, phase: (i / pedestrianCount) * Math.PI * 2 + 0.6 });
    }

    this.updateAmbientLife(0); // place everyone at their real starting point immediately, not at the origin for one visible frame
  }

  /** Advances every ambient vehicle/pedestrian one step along its own ellipse — see `buildAmbientLife`'s
   * own doc for why an ellipse (not "the real road network"). Heading is always the path's own tangent
   * at this instant (`d/dangle`), so it exactly matches the direction each frame's position actually
   * moved from the last, without tracking a separate velocity. */
  private updateAmbientLife(dt: number): void {
    this.ambientTimeSeconds += dt;
    const t = this.ambientTimeSeconds;
    for (const v of this.ambientVehicles) {
      const angle = v.phase + t * v.angularSpeed;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = this.ambientLoopCenter.x + this.ambientVehicleLoopRadius.x * cos;
      const z = this.ambientLoopCenter.z + this.ambientVehicleLoopRadius.z * sin;
      v.handle.group.position.set(x, 0, z);
      v.handle.group.rotation.y = Math.atan2(-this.ambientVehicleLoopRadius.x * sin, this.ambientVehicleLoopRadius.z * cos);
    }
    for (const p of this.ambientPedestrians) {
      const angle = p.phase + t * p.angularSpeed;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = this.ambientLoopCenter.x + this.ambientPedestrianLoopRadius.x * cos;
      const z = this.ambientLoopCenter.z + this.ambientPedestrianLoopRadius.z * sin;
      const facing = Math.atan2(-this.ambientPedestrianLoopRadius.x * sin, this.ambientPedestrianLoopRadius.z * cos);
      const state: HumanoidAgentState = {
        id: p.id,
        worldX: x,
        worldZ: z,
        facing,
        speed: 0.4,
        gait: t * 3.4 + p.phase * 2,
        pose: 'walk',
        health: 'unknown', // decorative ambiance — never a claim about the real population's own epidemiological state
        behavior: 'walk',
        stateSince: 0,
        isolated: false,
        hospitalized: false,
      };
      p.visual.sync(state, t);
    }
  }

  /** Builds the observer scientist once — hidden until a round is actually staged (`stageRound()`
   * makes it visible and positions it at the real lever's target). Reused across rounds/runs, never
   * rebuilt, the same "build once, reposition" discipline the round-stage beacon itself follows. */
  private buildObserverScientist(THREE: typeof THREE_NS, scene: THREE_NS.Scene): void {
    const id = 999_999; // outside any real entity/population id range, same convention as ambient pedestrians
    this.observerScientist = new HumanoidAgentVisual(THREE, id);
    this.observerScientist.root.visible = false;
    scene.add(this.observerScientist.root);
  }

  /**
   * WOW MOMENTS — the observer scientist's pose/facing, driven EACH frame purely from the real
   * verdict of the currently staged round and, once the search has actually finished (the staged
   * round is the last one), the run's real cross-cutting `sufficiency`/`competingModels` fields —
   * never a scripted timeline. Three real states, three honestly distinct reactions:
   *
   *  - A round's verdict is `SUPPORTED_WITHIN_PROTOCOL` AND (once finished) the run actually settled
   *    on ONE mechanism (`sufficiency.status === 'SUPPORTED_MECHANISM_FOUND'` and
   *    `competingModels.status === 'SINGLE_EXPLANATION'`) → pose 'gesture', facing the beacon: this
   *    is the one case that has actually earned a confident reaction.
   *  - The run finished `COMPETING_MODELS_UNRESOLVED` → pose stays 'idle' (deliberately NOT the
   *    confident gesture — a false "eureka" here would misrepresent an unresolved result) while the
   *    facing genuinely oscillates between the beacon and the player, standing in for "torn between
   *    rival explanations" — the honest visual available given `StrategyRound` carries no per-
   *    hypothesis world position to point at (see `genesisMatrix.ts`'s own doc on why SPACE is `null`).
   *  - Anything else (mid-search, falsified, inconclusive) → plain 'idle', facing the beacon.
   */
  private updateObserverScientist(): void {
    const scientist = this.observerScientist;
    if (!scientist || !scientist.root.visible || !this.lastStrategyRun) return;
    // Reuses the clock `updateAmbientLife(dt)` already advances this same frame — one shared scene
    // clock, not a second timer.
    const t = this.ambientTimeSeconds;
    const round = this.lastStrategyRun.rounds[this.stagedRoundIndex];
    if (!round) return;
    const isLastRound = this.stagedRoundIndex === this.lastStrategyRun.rounds.length - 1;
    const verdict = round.verdicts[0] ?? null;

    const singleExplanationSupported =
      verdict?.assessment === 'SUPPORTED_WITHIN_PROTOCOL' &&
      isLastRound &&
      this.lastMatrixView?.sufficiency?.status === 'SUPPORTED_MECHANISM_FOUND' &&
      this.lastMatrixView?.competingModels?.status === 'SINGLE_EXPLANATION';
    const competingUnresolved = isLastRound && this.lastMatrixView?.competingModels?.status === 'COMPETING_MODELS_UNRESOLVED';

    const beaconPos = this.roundStageBeacon?.position;
    const beaconAngle = beaconPos
      ? Math.atan2(beaconPos.x - scientist.root.position.x, beaconPos.z - scientist.root.position.z)
      : this.observerFacing;

    if (competingUnresolved) {
      // Torn between rival explanations: facing swings slowly between the beacon and straight ahead,
      // never settling — the honest stand-in for "not yet resolved" described in this method's doc.
      this.observerFacing = beaconAngle + Math.sin(t * 0.9) * 0.9;
    } else {
      this.observerFacing = beaconAngle;
    }

    const state: HumanoidAgentState = {
      id: 999_999,
      worldX: scientist.root.position.x,
      worldZ: scientist.root.position.z,
      facing: this.observerFacing,
      speed: 0,
      gait: 0,
      pose: singleExplanationSupported ? 'gesture' : 'idle',
      health: 'unknown',
      behavior: singleExplanationSupported ? 'react-supported' : competingUnresolved ? 'react-unresolved' : 'observe',
      stateSince: 0,
      isolated: false,
      hospitalized: false,
    };
    scientist.sync(state, t, false);
  }

  /** Hides/shows the ambient vehicles/pedestrians alongside `this.root` — same toggle the hazard-field
   * overlays (`setShowWildfire`/`setShowLandslide`) already apply to every other entity mesh, since
   * these live directly under `scene` (not `this.root`) and would otherwise keep showing through. */
  private setAmbientLifeVisible(visible: boolean): void {
    for (const v of this.ambientVehicles) v.handle.group.visible = visible;
    for (const p of this.ambientPedestrians) p.visual.root.visible = visible;
  }

  /**
   * PRIORITY 2 — the hospital's real interior: 4 walls + a floor + a reception desk, built ONCE at a
   * private pocket far from the outdoor city (`HOSPITAL_INTERIOR_ORIGIN`) and left in the scene
   * permanently — fog/distance already keep it invisible from outdoors (see that constant's own doc),
   * so there is nothing to toggle. The desk itself carries no separate id: `interactablePositions` (see
   * `syncNow()`) overrides `hospitalBuildingId`'s OWN position to the desk's local point while
   * `insideBuildingId` is set, so inspecting the desk inspects the exact same real hospital entity a
   * player could also reach from outside — one real entity, two spatial doors to it.
   */
  private buildHospitalInterior(THREE: typeof THREE_NS, scene: THREE_NS.Scene): void {
    const group = new THREE.Group();
    const { x: ox, z: oz } = HOSPITAL_INTERIOR_ORIGIN;
    const h = HOSPITAL_INTERIOR_HALF;
    const wallHeight = HOSPITAL_INTERIOR_WALL_HEIGHT;
    const wallThickness = 0.3;

    const floorMaterial = createPBRMaterial(THREE, 'LAB_FLOOR', {});
    const floor = new THREE.Mesh(new THREE.BoxGeometry(h * 2, 0.2, h * 2), floorMaterial);
    floor.position.set(ox, -0.1, oz);
    floor.receiveShadow = true;
    group.add(floor);

    const wallMaterial = createPBRMaterial(THREE, 'LAB_WALL', {});
    // North/south walls run along X (with a doorway gap in the south wall, at oz + h); east/west run along Z.
    const northWall = new THREE.Mesh(new THREE.BoxGeometry(h * 2, wallHeight, wallThickness), wallMaterial);
    northWall.position.set(ox, wallHeight / 2, oz - h);
    const southWallLeft = new THREE.Mesh(new THREE.BoxGeometry(h - 1, wallHeight, wallThickness), wallMaterial);
    southWallLeft.position.set(ox - h + (h - 1) / 2, wallHeight / 2, oz + h);
    const southWallRight = new THREE.Mesh(new THREE.BoxGeometry(h - 1, wallHeight, wallThickness), wallMaterial);
    southWallRight.position.set(ox + h - (h - 1) / 2, wallHeight / 2, oz + h);
    const eastWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, h * 2), wallMaterial);
    eastWall.position.set(ox + h, wallHeight / 2, oz);
    const westWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, h * 2), wallMaterial);
    westWall.position.set(ox - h, wallHeight / 2, oz);
    for (const wall of [northWall, southWallLeft, southWallRight, eastWall, westWall]) {
      wall.castShadow = true;
      wall.receiveShadow = true;
      group.add(wall);
    }

    const deskMaterial = createPBRMaterial(THREE, 'PAINTED_METAL', { color: 0x8899aa });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), deskMaterial);
    desk.position.set(HOSPITAL_INTERIOR_DESK_POSITION.x, 0.5, HOSPITAL_INTERIOR_DESK_POSITION.z);
    desk.castShadow = true;
    desk.receiveShadow = true;
    group.add(desk);

    const light = new THREE.PointLight(0xdfe8ff, 12, h * 4, 2);
    light.position.set(ox, wallHeight - 0.3, oz);
    group.add(light);

    // ASTRA B3 — a real interior is exactly what `atmosphere.ts`'s light shaft was built for (see
    // `labScene3D.ts`'s own use of it for a skylight beam), unlike the outdoor city where there is no
    // comparable single aperture. Streams in through the doorway gap in the south wall (see the wall
    // layout above), angled down and inward, so the entrance itself reads as a source of light rather
    // than a plain dark gap in the wall.
    const doorShaft = createLightShaft(THREE, {
      origin: [ox, wallHeight - 0.2, oz + h],
      direction: [0, -1, -0.6],
      length: h * 1.6,
      width: 2.2,
      color: 0xfff3d6,
      opacity: 0.3,
    });
    group.add(doorShaft);

    scene.add(group);
    this.interiorGroup = group;
  }

  /** PRIORITY 2 — whichever first-person body is actually driving the camera this frame: the outdoor
   * player, or the hospital interior's, never both. */
  private activeController(): FirstPersonController | null {
    return this.insideBuildingId ? this.interiorController : this.controller;
  }

  setMoveKey(key: MoveKey, down: boolean): void {
    this.activeController()?.setKey(key, down);
  }

  setRunning(running: boolean): void {
    this.activeController()?.setSpeedMultiplier(running ? 2.2 : 1);
  }

  addMouseLook(dx: number, dy: number): void {
    this.activeController()?.addMouseDelta(dx, dy);
  }

  /**
   * PRIORITY 2 — steps the player from the outdoor world into the hospital's real interior. Builds the
   * interior `FirstPersonController` lazily on first entry (its own small room bounds/obstacle around
   * `HOSPITAL_INTERIOR_ORIGIN`), and leaves the OUTDOOR controller's own position/yaw untouched — so
   * exiting resumes exactly where the player physically was, facing the entrance, matching how
   * `labScene3D.ts`'s own single-room convention never needed a "return position" of its own either.
   */
  enterHospital(): void {
    if (this.insideBuildingId) return;
    if (!this.interiorController) {
      const h = HOSPITAL_INTERIOR_HALF - 0.5; // stay inside the walls, not embedded in them
      this.interiorController = new FirstPersonController({
        room: {
          minX: HOSPITAL_INTERIOR_ORIGIN.x - h,
          maxX: HOSPITAL_INTERIOR_ORIGIN.x + h,
          minZ: HOSPITAL_INTERIOR_ORIGIN.z - h,
          maxZ: HOSPITAL_INTERIOR_ORIGIN.z + h,
        },
        obstacles: [buildingObstacle(HOSPITAL_INTERIOR_DESK_POSITION, 1.5)],
        startPosition: HOSPITAL_INTERIOR_SPAWN,
        startYaw: Math.PI, // facing -z, i.e. north, toward the desk from the south spawn point
        eyeHeight: 1.7,
        moveSpeed: 4,
      });
    } else {
      this.interiorController.teleport(HOSPITAL_INTERIOR_SPAWN, Math.PI);
    }
    this.insideBuildingId = this.city.hospitalBuildingId;
  }

  /** PRIORITY 2 — steps back outside; the outdoor controller's own state was never touched, so the
   * player resumes exactly where they left, right at the entrance. */
  exitHospital(): void {
    this.insideBuildingId = null;
  }

  onResize(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }

  /**
   * TIER1.3 — this scene had no `setupPostProcessing` at all, meaning `useThreeLoop.ts` never ran
   * `setupGraphicsPipeline` for it: no ACES tone mapping (the same filmic response every other
   * production scene renders with), no shadow-map configuration (`createSceneEnvironment`'s sun light
   * above requests `castShadow` per-tier, but nothing ever turned `renderer.shadowMap.enabled` on),
   * and no bloom/antialiasing pass. `ambient: { mode: 'none' }` matches `genesisScientificCitySim.ts`'s
   * own choice for the same reason: `createSceneEnvironment` already owns this scene's sky/fog/lighting
   * mood, so a second generic IBL box would fight it rather than help metal entities (pump-pipe-system,
   * building) reflect something.
   */
  setupPostProcessing(
    modules: PostProcessingModules,
    renderer: THREE_NS.WebGLRenderer,
    scene: THREE_NS.Scene,
    camera: THREE_NS.PerspectiveCamera,
    w: number,
    h: number,
  ): PostProcessor {
    this.pipeline = setupGraphicsPipeline(this.THREE!, modules, renderer, {
      scene, camera, width: w, height: h,
      // ASTRA B2 — exposure matches `genesisScientificCitySim.ts`'s own night tuning (1.15, up from
      // this scene's un-boosted 1.05 default) rather than a bigger jump: the sun/fill intensities above
      // are deliberately kept high for legibility (this is a walkable, not a moody establishing shot),
      // so mood comes from the new landmark lights + facade windows actually being visible to bloom,
      // not from darkening the whole scene. Threshold dropped from 0.85 (needed near-white/emissive to
      // trigger at all — with no real outdoor lights, almost nothing ever crossed it) to 0.65, so the
      // new `createPracticalLight` fixtures and `BUILDING_FACADE`'s lit windows actually bloom.
      toneMappingExposure: 1.15,
      bloom: { strength: 0.35, radius: 0.5, threshold: 0.65 },
      ambient: { mode: 'none' },
      // ASTRA B5 — this scene never opted into SSR at all (the 'cinematic' default tier gate was never
      // even reached), unlike its sibling `genesisScientificCitySim.ts` which already proved these exact
      // values safe at 'high' after a headless-Chromium check. Same numbers, same reasoning: wet streets
      // and metal infrastructure reflecting the scene around them, without requiring the top tier.
      reflections: { enabled: true, minTier: 'high', strength: 0.4, maxDistance: 45 },
    });
    return this.pipeline;
  }

  private syncNow(): void {
    if (!this.renderer) return;
    const engine = this.activeEngine();
    const frame = getFrameState(engine, this.scrubTick ?? undefined);
    const graphicsFrame = toGraphicsWorldFrame(frame);
    this.renderer.sync(graphicsFrame);
    // GENERIC INTERACTION SYSTEM — every interactable entity's real, current position, read off the
    // SAME frame the renderer just drew from (never re-derived or approximated), refreshed on every
    // sync so a fork/branch that moves an entity stays correct.
    for (const id of this.interactableIds) {
      const entity = graphicsFrame.entities.find((e) => e.id === id);
      if (entity) this.interactablePositions.set(id, entity.position);
    }
    // PRIORITY 2 — while inside the hospital, the SAME real `hospitalBuildingId` is reached through its
    // interior desk instead of its outdoor footprint: override just that one entry's position to the
    // desk's local point so `updateNearestInteractable()` (unaware of indoor/outdoor at all) keeps
    // working unmodified, both doors leading to the one real entity.
    if (this.insideBuildingId === this.city.hospitalBuildingId) {
      this.interactablePositions.set(this.city.hospitalBuildingId, [
        HOSPITAL_INTERIOR_DESK_POSITION.x,
        1,
        HOSPITAL_INTERIOR_DESK_POSITION.z,
      ]);
    }

    // PRIORITY 3 — LIVING LAYER. Real day/night from the real simulated clock (see
    // `GENESIS_WORLD_BASE_HOUR_OF_DAY`'s own doc) and real standing water from the floodplain's own
    // real `waterLevelM` scalar — both re-derived from THIS frame, never advanced on their own.
    if (this.THREE && this.sceneEnvironment) {
      const hourOfDay = (GENESIS_WORLD_BASE_HOUR_OF_DAY + frame.simulatedTime / 3600) % 24;
      const sunState = computeSunState(this.THREE, hourOfDay);
      this.sceneEnvironment.sun.color.setHex(sunState.color);
      this.sceneEnvironment.sun.intensity = sunState.intensity;
      this.sceneEnvironment.sun.position.set(
        sunState.direction[0] * 60,
        sunState.direction[1] * 60,
        sunState.direction[2] * 60,
      );
      if (this.scene?.fog) (this.scene.fog as THREE_NS.FogExp2).color.setHex(sunState.fogColor);
    }
    if (this.floodWater) {
      const floodplain = graphicsFrame.entities.find((e) => e.id === GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID);
      const waterLevelM = floodplain?.scalars?.waterLevelM ?? 0;
      this.floodWater.mesh.visible = waterLevelM > FLOOD_WATER_MIN_VISIBLE_DEPTH_M;
      this.floodWater.mesh.position.y = waterLevelM;
    }
  }

  /** Advances the base world (and the counterfactual fork, if one exists) by one real tick. */
  advanceTick(): void {
    this.city.base.engine.advance(1, this.city.updater);
    this.forkEngine?.advance(1, this.city.updater);
    this.syncNow();
  }

  /**
   * Forks the base world AT ITS CURRENT TICK with a real emergency-repair intervention: the pump's
   * flow is reset to its known-safe baseline (`PUMP_PIPE_DEFAULTS.volumetricFlow`), regardless of
   * whether it has already tripped — an "operator manually resets the pump" intervention (mission
   * section 10's own example), deliberately robust to WHEN the observer clicks the button, unlike
   * `worldModelGenesisScientificCity4.test.ts`'s narrower "reduce flow before the trip resolves"
   * intervention (which only prevents a trip that hasn't happened yet).
   */
  createFork(): void {
    if (this.forkEngine) return;
    const engine = this.city.base.engine;
    this.forkEngine = engine.forkBranch(engine.tick, 'browser-verification-fork', (graph) => {
      const p = graph.getEntity(this.city.pumpPipeId);
      graph.updateEntity(this.city.pumpPipeId, {
        domainState: { ...p.domainState, volumetricFlow: PUMP_PIPE_DEFAULTS.volumetricFlow },
        statusLabel: 'Pump reset to safe flow (counterfactual intervention)',
      });
    });
    this.showFork = true;
    this.syncNow();
  }

  setShowFork(show: boolean): void {
    this.showFork = show;
    this.syncNow();
  }

  setScrubTick(tick: number | null): void {
    this.scrubTick = tick;
    this.syncNow();
  }

  /**
   * Builds the real wildfire demonstration field once, on first use: a small synthetic terrain
   * (`buildSyntheticTerrain` — a stated, `surveyed: false` bowl, same honesty convention as
   * `floodInundation.ts`'s own reference terrain), a uniform short-grass fuel bed, and one real
   * Rothermel/MTT solve for a single ignition point. `arrivalTimeS` is real per-cell solver output;
   * a cell the fire never reaches (`Infinity`) is passed through as `null` to `terrainField.ts`,
   * which renders it in a plain "unburned ground" tone — never bent onto the severity scale.
   */
  private buildWildfireDemo(): void {
    if (!this.THREE || this.wildfireField) return;
    const THREE = this.THREE;
    const terrain = buildSyntheticTerrain({ cols: 30, rows: 30, cellSizeM: 6, seed: 7, reliefM: 4 });
    const fuelBed = buildUniformFuelBed(terrain, 'FM1_SHORT_GRASS', 0.06);
    const wind: WindVector = { speedMph: 15, directionDegrees: 45 };
    const ignitionIndex = Math.floor(terrain.rows / 2) * terrain.cols + Math.floor(terrain.cols / 2);
    const result = simulateWildfireSpread(fuelBed, wind, [ignitionIndex]);
    this.wildfireResult = result;

    let maxFiniteArrivalS = 0;
    for (const t of result.arrivalTimeS) {
      if (Number.isFinite(t) && t > maxFiniteArrivalS) maxFiniteArrivalS = t;
    }

    this.wildfireField = buildTerrainFieldMesh(THREE, terrain, {
      heightScale: 3,
      // A muted olive/brown "unburned ground" — visually distinct from severityColor's own
      // green/amber/red range, so a not-yet-reached cell never reads as a false "low severity" REAL reading.
      noDataColor: 0x4a3f2a,
      cellValueOf: (i) => {
        const t = result.arrivalTimeS[i];
        return Number.isFinite(t) ? t : null;
      },
      // Soonest-to-ignite cells (t=0, at the fire front) read red/hot; the slowest-to-reach real
      // arrivals fade toward green — an arrival-time heatmap, not a burned/unburned binary.
      colorOfValue: (T, value) => severityColor(T, maxFiniteArrivalS > 0 ? 1 - value / maxFiniteArrivalS : 0),
    });
    this.wildfireField.mesh.position.y = 0.01; // avoid z-fighting with the base ground plane

    // The real ignition point's WORLD position, read directly off the mesh `terrainField.ts` just
    // built (vertex `ignitionIndex`, plus the mesh's own y offset above) — not re-derived from the
    // grid math by hand, so it can never drift out of sync with where the terrain mesh actually put it.
    const positions = this.wildfireField.mesh.geometry.getAttribute('position') as THREE_NS.BufferAttribute;
    const ignitionWorld = new THREE.Vector3(
      positions.getX(ignitionIndex),
      positions.getY(ignitionIndex),
      positions.getZ(ignitionIndex),
    ).add(this.wildfireField.mesh.position);

    if (result.headFlameLengthM > 0) {
      this.fireVfx = createFireVfx(THREE, {
        origin: [ignitionWorld.x, ignitionWorld.y, ignitionWorld.z],
        // The real Byram flame length this same solve already reports in the status line — the
        // effect's actual height, not a fabricated visual constant.
        flameHeightM: result.headFlameLengthM,
        // A rendering SATURATION reference, not a scientific classification: 5000 kW/m sits solidly
        // in the "extreme" fireline-intensity range fire-behaviour operations guidance describes, so
        // a real intensity at or above it reads as fully "hot" rather than scaling the brightness
        // linearly to an arbitrarily large number. This scales particle brightness/flicker only —
        // it is never displayed as its own number/badge alongside the real kW/m reading.
        intensity: Math.min(1, result.headFirelineIntensityKWm / 5000),
      });
    }
  }

  private removeOverlayMesh(field: TerrainFieldMesh | null): void {
    if (field?.mesh.parent) field.mesh.parent.remove(field.mesh);
  }

  private removeFireVfx(): void {
    if (this.fireVfx?.group.parent) this.fireVfx.group.parent.remove(this.fireVfx.group);
  }

  setShowWildfire(show: boolean): void {
    this.showWildfire = show;
    if (show) {
      this.showLandslide = false;
      this.removeOverlayMesh(this.landslideField);
      this.buildWildfireDemo();
      if (this.root) this.root.visible = false;
      this.setAmbientLifeVisible(false);
      if (this.wildfireField && this.scene && !this.wildfireField.mesh.parent) {
        this.scene.add(this.wildfireField.mesh);
      }
      if (this.fireVfx && this.scene && !this.fireVfx.group.parent) {
        this.scene.add(this.fireVfx.group);
      }
    } else {
      if (this.root) this.root.visible = true;
      this.setAmbientLifeVisible(true);
      this.removeOverlayMesh(this.wildfireField);
      this.removeFireVfx();
    }
  }

  getWildfireSummary(): WildfireFieldSummary | null {
    if (!this.wildfireResult) return null;
    const totalCells = this.wildfireResult.arrivalTimeS.length;
    let reachedCells = 0;
    for (const t of this.wildfireResult.arrivalTimeS) if (Number.isFinite(t)) reachedCells++;
    return {
      headRosMS: this.wildfireResult.headRosMS,
      headFirelineIntensityKWm: this.wildfireResult.headFirelineIntensityKWm,
      headFlameLengthM: this.wildfireResult.headFlameLengthM,
      reachedCells,
      totalCells,
    };
  }

  /**
   * Builds the real landslide demonstration field once, on first use: a steeper synthetic terrain
   * (more relief than the wildfire demo's — infinite-slope stability needs real steep ground to
   * produce any unstable cells at all), `DEFAULT_SOIL_PARAMS` (literature-typical, not a survey —
   * same honesty convention as `wildfireSpread.ts`'s stated fuel moisture), a real per-cell factor
   * of safety (`buildSlopeStabilityField`), and a real sliding-block runout trace from every
   * unstable cell (`simulateLandslideRunout`). Factor of safety is defined for every cell — there is
   * no "unreached" concept here the way wildfire has unburned cells — so every cell gets a real
   * color, never `terrainField.ts`'s `noDataColor` fallback.
   */
  private buildLandslideDemo(): void {
    if (!this.THREE || this.landslideField) return;
    const THREE = this.THREE;
    // reliefM=40 (steeper than the wildfire demo's own bowl) actually produces a real mix of
    // stable/marginal/unstable cells with DEFAULT_SOIL_PARAMS — verified numerically before picking
    // this value, since a too-gentle synthetic bowl would honestly compute zero unstable cells and
    // make the runout half of this demo untestable in the browser.
    const terrain = buildSyntheticTerrain({ cols: 30, rows: 30, cellSizeM: 6, seed: 11, reliefM: 40 });
    const stability = buildSlopeStabilityField(terrain, DEFAULT_SOIL_PARAMS);
    const runout = simulateLandslideRunout(terrain, DEFAULT_SOIL_PARAMS, stability);
    this.landslideTerrain = terrain;
    this.landslideStability = stability;
    this.landslideRunout = runout;

    this.landslideField = buildTerrainFieldMesh(THREE, terrain, {
      heightScale: 3,
      cellValueOf: (i) => stability.factorOfSafety[i],
      // FS=0 (driving stress dominates) reads red/unstable; FS>=2 (twice the conventional
      // UNSTABLE/STABLE threshold of 1.0) reads green/stable — severityColor's own clamping
      // handles the FS_SAFETY_CAP=100 case on near-flat ground without a special case here.
      colorOfValue: (T, value) => severityColor(T, 1 - value / 2),
    });
    this.landslideField.mesh.position.y = 0.01; // avoid z-fighting with the base ground plane
  }

  setShowLandslide(show: boolean): void {
    this.showLandslide = show;
    if (show) {
      this.showWildfire = false;
      this.removeOverlayMesh(this.wildfireField);
      this.removeFireVfx();
      this.buildLandslideDemo();
      if (this.root) this.root.visible = false;
      this.setAmbientLifeVisible(false);
      if (this.landslideField && this.scene && !this.landslideField.mesh.parent) {
        this.scene.add(this.landslideField.mesh);
      }
    } else {
      if (this.root) this.root.visible = true;
      this.setAmbientLifeVisible(true);
      this.removeOverlayMesh(this.landslideField);
    }
  }

  getLandslideSummary(): LandslideFieldSummary | null {
    if (!this.landslideTerrain || !this.landslideStability || !this.landslideRunout) return null;
    const totalCells = this.landslideStability.factorOfSafety.length;
    let minFactorOfSafety = Number.POSITIVE_INFINITY;
    for (const fs of this.landslideStability.factorOfSafety) if (fs < minFactorOfSafety) minFactorOfSafety = fs;
    return {
      minFactorOfSafety,
      unstableCells: this.landslideStability.unstableCellIndices.length,
      totalCells,
      maxVelocityAnywhereMS: this.landslideRunout.maxVelocityAnywhereMS,
      longestRunoutDistanceM: this.landslideRunout.longestRunoutDistanceM,
      runoutAreaM2: runoutAreaM2(this.landslideRunout, this.landslideTerrain, this.landslideStability),
      pathsLeavingModelledArea: this.landslideRunout.pathsLeavingModelledArea,
    };
  }

  update(dt: number): void {
    // Evolution is user-driven (advanceTick()), not continuous — every tick shown is one the
    // observer explicitly asked for, matching this page's role as a verification surface rather
    // than an ambient demo. The fire VFX, the shared environment's ambient haze, and (LIVING WORLD)
    // the player's own movement are the exceptions, same split `genesisScientificCitySim.ts`'s own
    // `update(dt)` already draws: all three are pure rendering-layer/player-input animation, not
    // simulation time, so they keep moving every real frame regardless of world-clock state.
    this.sceneEnvironment?.update(dt);
    if (this.showWildfire) this.fireVfx?.update(dt);
    if (this.floodWater?.mesh.visible) this.floodWater.update(dt); // ripple only scrolls while there's water to see it on
    this.updateAmbientLife(dt);
    this.updateRoundStageBeacon(dt);
    this.updateObserverScientist();
    const active = this.activeController();
    if (active) this.fpState = active.update(dt);
  }

  /** Pure rendering-layer animation for the round-stage beacon — timing is artistic (a smooth loop
   * so "an action is happening here" reads clearly), but its EXISTENCE, position and kind are all
   * decided in `stageRound()` from real data; nothing here invents a value. */
  private updateRoundStageBeacon(dt: number): void {
    if (!this.roundStageBeacon || !this.roundStageKind) return;
    this.roundStageElapsed += dt;
    const t = this.roundStageElapsed;
    if (this.roundStageKind === 'VALVE_TURN') {
      this.roundStageBeacon.rotation.z += dt * 2.4;
    } else if (this.roundStageKind === 'GATE_SLIDE') {
      this.roundStageBeacon.scale.x = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.6));
    } else {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
      this.roundStageBeacon.scale.setScalar(0.85 + pulse * 0.3);
      (this.roundStageBeacon.material as THREE_NS.MeshBasicMaterial).opacity = 0.4 + pulse * 0.4;
    }
  }

  syncScene(_scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera): void {
    this.syncNow();
    if (this.fpState) {
      camera.position.set(this.fpState.position.x, this.fpState.position.y + this.fpState.bobOffset, this.fpState.position.z);
      camera.rotation.set(this.fpState.pitch, this.fpState.yaw, 0);
    }
    this.updateNearestInteractable(camera);
    if (!this.insideBuildingId) this.updateNearHospitalEntrance(camera);
    else this.nearHospitalEntrance = false;
  }

  /**
   * PRIORITY 2 — the hospital's own entrance trigger: same distance+facing-dot pattern as the science
   * interaction system, but deliberately separate from it (`nearestInteractableId`) — "walk through a
   * door" is navigation, not inspecting or changing a scientific parameter, and conflating the two would
   * make a single proximity check decide between two unrelated actions.
   */
  private updateNearHospitalEntrance(camera: THREE_NS.PerspectiveCamera): void {
    if (!this.THREE || !this.hospitalEntrancePosition) {
      this.nearHospitalEntrance = false;
      return;
    }
    const [px, py, pz] = this.hospitalEntrancePosition;
    const dx = px - camera.position.x;
    const dy = py - camera.position.y;
    const dz = pz - camera.position.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance > HOSPITAL_ENTRANCE_MAX_DISTANCE || distance < 1e-6) {
      this.nearHospitalEntrance = false;
      return;
    }
    const forward = new this.THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const toEntrance = new this.THREE.Vector3(dx, dy, dz).normalize();
    this.nearHospitalEntrance = forward.dot(toEntrance) > HOSPITAL_ENTRANCE_MIN_FACING_DOT;
  }

  /**
   * GENERIC INTERACTION SYSTEM — the same distance+facing-dot pattern `labScene3D.ts` proves in
   * production for its one console, generalized over every entity in `interactableIds`: the nearest
   * one that is both close enough AND roughly faced wins (never the raw-nearest regardless of facing —
   * a player standing between two entities but looking at neither should trigger nothing). Still not
   * a generic raycast-based interaction system (that's `graphics/interaction.ts`'s own, separate,
   * pointer-driven mechanism, orthogonal to this first-person proximity trigger).
   */
  private updateNearestInteractable(camera: THREE_NS.PerspectiveCamera): void {
    if (!this.THREE) {
      this.nearestInteractableId = null;
      return;
    }
    const forward = new this.THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    let bestId: WorldFrameEntityId | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const id of this.interactableIds) {
      const position = this.interactablePositions.get(id);
      if (!position) continue;
      const [px, py, pz] = position;
      const dx = px - camera.position.x;
      const dy = py - camera.position.y;
      const dz = pz - camera.position.z;
      const distance = Math.hypot(dx, dy, dz);
      const override = INTERACT_OVERRIDES[id];
      const maxDistance = override?.maxDistance ?? INTERACT_DEFAULT_MAX_DISTANCE;
      const minFacingDot = override?.minFacingDot ?? INTERACT_DEFAULT_MIN_FACING_DOT;
      if (distance > maxDistance || distance < 1e-6 || distance >= bestDistance) continue;
      const toEntity = new this.THREE.Vector3(dx, dy, dz).normalize();
      if (forward.dot(toEntity) > minFacingDot) {
        bestId = id;
        bestDistance = distance;
      }
    }
    this.nearestInteractableId = bestId;
  }

  getNearestInteractableId(): WorldFrameEntityId | null {
    return this.nearestInteractableId;
  }

  /** Real, current state of any entity — the INSPECT half of walk→inspect→change→experiment→fork. */
  inspect(entityId: WorldFrameEntityId): EntityInspection | null {
    return inspectEntity(this.activeEngine().graph, entityId);
  }

  /** The real, declared levers (if any) that target this exact entity — empty for an honestly inspect-only entity. */
  leversFor(entityId: WorldFrameEntityId): readonly WorldLever[] {
    return leversForEntity(GENESIS_FLOOD_CATALOG, entityId);
  }

  /**
   * Runs ONE real lever on the BASE engine (never the currently-viewed fork — an intervention forks
   * from the live world, matching `createFork()`'s own convention) and switches the view to it, the
   * same single-shot pattern `createFork()` already used for the pump alone, now generic over any
   * entity with a real lever.
   */
  applyLever(lever: WorldLever, label: string): void {
    if (this.forkEngine) return;
    this.forkEngine = applyLeverIntervention(
      this.city.base.engine,
      lever,
      GENESIS_FLOOD_CATALOG.metricPhrases['peak flood depth']!,
      'minimize',
      label,
    );
    this.showFork = true;
    this.syncNow();
  }

  /** The most recent real experiment's result — read by React to render the comparison panel. */
  lastComparison: CrossActionComparison | null = null;

  /**
   * PRIORITY 4 (most important) — connects the walk-up interaction system to Genesis' own real
   * Discovery Engine: `crossActionComparison.ts`'s `compareWorldActions`, the SAME engine
   * `WorldDiscoveryPanel.tsx` already uses elsewhere in this app. Every real lever this world
   * declares is forked from one shared control and measured against the same real objective — a
   * genuine "what happens if we change things here", not a guess, and not a second ranking engine:
   * this calls the real one, unmodified.
   *
   * Runs on the catalog's OWN reference world (`catalog.buildWorld()`), not the player's live walked
   * city — the same architecture every Discovery Engine surface in this app already uses (`discoveryLoop.ts`'s
   * own multi-round search does the same). A comparison needs one controlled, reproducible baseline
   * every arm forks from; the player's own world — already mid-scenario, maybe already forked by an
   * earlier walk-up intervention — cannot promise to still be that. `applyComparisonWinner()` below is
   * what turns the experiment's real answer into a change the player actually SEES: it applies the
   * SAME winning lever object to the player's own live engine, reusing `applyLever()` verbatim.
   */
  runExperiment(): CrossActionComparison {
    this.lastComparison = compareWorldActions({ goal: 'minimize peak flood depth', catalog: GENESIS_FLOOD_CATALOG });
    return this.lastComparison;
  }

  /** Applies the last experiment's real winning lever to the LIVE world. A no-op if no comparison has
   * run, no lever won (a refusal, a tie with no single best, or a genuinely unrankable result — see
   * `CrossActionComparison.status`), or a fork already exists (single-shot, matching `applyLever()`). */
  applyComparisonWinner(): void {
    if (!this.lastComparison || this.forkEngine) return;
    const winningId = this.lastComparison.bestActionIds[0];
    if (!winningId) return;
    const lever = GENESIS_FLOOD_CATALOG.levers.find((l) => l.leverId === winningId);
    if (!lever) return;
    this.applyLever(lever, `experiment-winner:${lever.leverId}`);
    this.lastComparison = null;
  }

  // ---------------------------------------------------------------------------------------------
  // PLAY A LIVE EXPERIMENT ROUND — StrategyRun.rounds staged live: why -> what -> reference ->
  // predicted -> observed -> assessment -> nextExperiment, with a declared (never guessed) scenic
  // form for whichever real lever the round pulled. See the field docs above for the contract.
  // ---------------------------------------------------------------------------------------------

  /**
   * Runs the SAME real search `WorldDiscoveryPanel.tsx` already runs (`runWorldDiscoveryAndRemember`
   * — the one seam; `discoveryLoop.ts` itself is neither touched nor called a second way here), then
   * projects its already-computed, real `DiscoveryLoopResult` into the shared `StrategyRun` contract
   * (`toMechanismRun`) and stages round 1. Returns `null` for a refused or comparison-shaped goal
   * (nothing to play round-by-round) rather than fabricating rounds a search never produced.
   */
  runStrategyDiscovery(goalText = 'minimize peak flood depth'): StrategyRun | null {
    const state = runWorldDiscoveryAndRemember(goalText, GENESIS_FLOOD_CATALOG.catalogId);
    if (state.kind !== 'COMPLETE') {
      this.lastStrategyRun = null;
      this.lastMatrixView = null;
      this.clearRoundStage();
      return null;
    }
    const run = toMechanismRun(state.result);
    this.lastStrategyRun = run;
    // VOICE GUIDE — the joined view `narrateStagedRound()` reads from. Built from a real `DiscoveryRan`
    // outcome: `run` is the same real `StrategyRun` just computed, and `admitWorldQuestion(goalText)` is
    // the exact same pure, side-effect-free admission check `runWorldDiscoveryAndRemember` already ran
    // internally to reach this COMPLETE state — recomputing it here reads the same real value rather
    // than fabricating one, since `WorldDiscoveryRememberedState` does not carry the `Admission` object
    // itself back out.
    const outcome: DiscoveryRan = {
      status: 'RAN',
      contractVersion: DISCOVERY_ORCHESTRATOR_CONTRACT_VERSION,
      shape: 'MECHANISM',
      admission: admitWorldQuestion(goalText),
      run,
      // The real narrowing decision `runWorldDiscoveryAndRemember` already made
      // for THIS run (`WorldDiscoveryMemoryUse`/`PriorInvestigationWarning` are
      // the same shape) — not a re-derived guess.
      priorInvestigation: state.memory,
      // MECHANISM has no generation continuation, so there is nothing real to
      // report here. Null with the reason the orchestrator itself gives, rather
      // than a fabricated second run this search never performed.
      generated: null,
      noGenerationReason:
        'This question shape has no generation path: only PARAMETER can derive a value nobody declared.',
    };
    this.lastMatrixView = buildGenesisMatrixView(outcome);
    this.narratedLineCount = 0;
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    if (run.rounds.length > 0) this.stageRound(0);
    else this.clearRoundStage();
    return run;
  }

  /**
   * Finds the real lever this round actually pulled, by the SAME `hypothesisId` both this round's
   * verdict and the lever's own `hypothesis()` factory agree on — never a second, parallel mapping
   * that could drift from the one the loop actually used. Calling `lever.hypothesis(...)` here is
   * side-effect-free: it only builds and returns a plain `MechanisticHypothesis` object, the same
   * pure read `applyLeverIntervention` itself does before ever touching `apply`.
   */
  private leverForRound(round: StrategyRound): WorldLever | undefined {
    const hypothesisId = round.verdicts[0]?.hypothesisId;
    if (!hypothesisId) return undefined;
    return GENESIS_FLOOD_CATALOG.levers.find((l) => l.hypothesis('placeholder', 'minimize').hypothesisId === hypothesisId);
  }

  /**
   * Stages one round: focuses the round-stage beacon on the real lever's own `targetEntityId` (its
   * CURRENT live position, read off the tracked mesh — never a stored/stale one) and plays that
   * lever's own DECLARED `sceneForm` (see `worldGoalIntent.ts`'s own doc for why this reads a
   * declaration rather than pattern-matching `leverId`). A round whose lever declares no `sceneForm`,
   * or whose hypothesis matches no lever in this catalog at all, still stages honestly: the beacon
   * simply does not appear, and the round's real why/what/reference/predicted/observed/assessment
   * text is unaffected — the animation is decoration on top of the real data, never a condition for it.
   */
  stageRound(index: number): void {
    if (!this.lastStrategyRun || index < 0 || index >= this.lastStrategyRun.rounds.length) return;
    this.stagedRoundIndex = index;
    this.roundStageElapsed = 0;
    this.clearRoundStageBeacon();
    this.narrateStagedRound(index);
    if (!this.THREE || !this.scene || !this.renderer) return;
    const round = this.lastStrategyRun.rounds[index]!;
    const lever = this.leverForRound(round);
    const sceneForm = lever?.sceneForm;
    if (!lever || !sceneForm) return;
    const target = this.renderer.getObjectForEntity(lever.targetEntityId);
    if (!target) return;
    const THREE = this.THREE;
    const position = target.getWorldPosition(new THREE.Vector3());
    this.roundStageKind = sceneForm.kind;
    this.roundStageBeacon = this.buildRoundStageBeacon(THREE, sceneForm.kind);
    this.roundStageBeacon.position.set(position.x, position.y + 2.2, position.z);
    this.scene.add(this.roundStageBeacon);

    // WOW MOMENTS — stand the observer scientist beside the real lever's target, offset by a fixed
    // 1.8m so it never overlaps the beacon itself; `updateObserverScientist()` decides its pose/
    // facing every frame from the round's real verdict, never here.
    if (this.observerScientist) {
      this.observerScientist.root.position.set(position.x + 1.8, position.y, position.z);
      this.observerScientist.root.visible = true;
    }
  }

  /**
   * VOICE GUIDE — one spoken utterance per staged round, composed from exactly the two sources the
   * brief names: the lever's own declared `sceneForm.actionLabel` (what the world shows — never
   * generated here; `genesisNarration.ts`'s own doc explains why that module deliberately says
   * nothing about the physical scene) and the lines `narrateInvestigation` produces once bounded at
   * this round (what the science means).
   *
   * `narrateInvestigation(view, index)` is what keeps the voice from ever getting ahead of the
   * screen: its script is a strict, deterministic function of `index` (intro, then one
   * `narrateRound()` per round up to and including it, then the closing line only once `index` is the
   * last round) — never a version of the run the player has not reached yet. Re-computing it here and
   * slicing off everything already spoken (`narratedLineCount`, the high-water mark) is exactly "the
   * new lines for this round," never a re-derivation of what `narrateRound` itself decided.
   */
  private narrateStagedRound(index: number): void {
    if (!this.lastMatrixView || !this.lastStrategyRun) return;
    const round = this.lastStrategyRun.rounds[index];
    if (!round) return;
    const lever = this.leverForRound(round);
    const script = narrateInvestigation(this.lastMatrixView, index);
    const newLines = script.slice(this.narratedLineCount);
    this.narratedLineCount = script.length;
    // Nothing new to say — stepping backward to an already-narrated round, most commonly. Stay
    // silent rather than re-announcing just the action label with no science attached to it: an
    // utterance with nothing new is not "one utterance," it's noise.
    if (newLines.length === 0) return;
    const parts: string[] = [];
    if (lever?.sceneForm?.actionLabel) parts.push(lever.sceneForm.actionLabel);
    for (const line of newLines) parts.push(line.text);
    this.speakNarration(parts.join(' '));
  }

  /**
   * VOICE GUIDE — the one place `speechSynthesis`/`SpeechSynthesisUtterance` is used in this repo.
   * Thin on purpose: `narrateStagedRound()` above already produced the exact words from real
   * `GenesisMatrixView` data; this only has to get them read aloud without ever breaking the scene.
   *
   * Tier-respecting, never tier-gated: narration always attempts to play, on every device — a weaker
   * device gets a plainer, less carefully-managed queue, never silence. `cancel()`-before-`speak()`
   * keeps a fast-clicking desktop player's audio in sync with the round on screen; skipped at `'low'`
   * tier because repeatedly cancelling mid-utterance is a known source of a stuck/silent
   * `speechSynthesis` queue on weaker mobile browsers, and a queued line lagging slightly behind is a
   * far better failure mode there than losing audio entirely — matching the brief's own "doesn't have
   * to be perfect where the player is looking more than listening."
   */
  private speakNarration(text: string): void {
    if (typeof window === 'undefined') return;
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
    try {
      if (this.renderTier !== 'low') synth.cancel();
      synth.speak(new SpeechSynthesisUtterance(text));
    } catch {
      // Narration is decoration on the real visual staging, never a requirement for it — a
      // browser/platform speech failure must never break the scene.
    }
  }

  /** Three distinct, declared treatments — never a generic "something is happening here" blob — so
   * the SAME beacon slot genuinely reads differently for a valve, a gate, and a ground treatment. */
  private buildRoundStageBeacon(THREE: typeof THREE_NS, kind: LeverSceneKind): THREE_NS.Mesh {
    const material = new THREE.MeshBasicMaterial({ color: 0x38e0ff, transparent: true, opacity: 0.85, depthWrite: false });
    if (kind === 'VALVE_TURN') {
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.09, 8, 20), material);
      mesh.name = 'round-stage-valve';
      return mesh;
    }
    if (kind === 'GATE_SLIDE') {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.12), material);
      mesh.name = 'round-stage-gate';
      return mesh;
    }
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), material);
    mesh.name = 'round-stage-ground-treatment';
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  private clearRoundStageBeacon(): void {
    // Hidden every time the beacon is cleared, not just disposed on full dismiss — a round whose
    // lever declares no `sceneForm`/target must not leave the observer scientist standing at a
    // stale position from a PREVIOUS round; `stageRound()` re-shows it only once it finds a real one.
    if (this.observerScientist) this.observerScientist.root.visible = false;
    if (!this.roundStageBeacon) return;
    this.roundStageBeacon.parent?.remove(this.roundStageBeacon);
    this.roundStageBeacon.geometry.dispose();
    (this.roundStageBeacon.material as THREE_NS.Material).dispose();
    this.roundStageBeacon = null;
    this.roundStageKind = null;
  }

  /** Clears just the staged round/beacon, keeping `lastStrategyRun` itself (used when a round index
   * turns out invalid); `dismissStrategyRun()` below is the full "player closed the panel" reset. */
  clearRoundStage(): void {
    this.stagedRoundIndex = -1;
    this.clearRoundStageBeacon();
  }

  dismissStrategyRun(): void {
    this.lastStrategyRun = null;
    this.lastMatrixView = null;
    this.narratedLineCount = 0;
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    this.clearRoundStage();
  }

  /** Steps to the next/previous round of the currently staged run — a no-op past either end, so a
   * caller never has to compute or clamp the index itself. */
  nextRound(): void {
    if (!this.lastStrategyRun) return;
    this.stageRound(Math.min(this.stagedRoundIndex + 1, this.lastStrategyRun.rounds.length - 1));
  }

  prevRound(): void {
    if (!this.lastStrategyRun) return;
    this.stageRound(Math.max(this.stagedRoundIndex - 1, 0));
  }

  /**
   * A plain, serialisable projection of the currently staged round for React — the exact
   * why/what/reference/predicted/observed/assessment/nextExperiment vocabulary, read straight off
   * `StrategyRun`/`StrategyRound`, nothing computed or re-derived here.
   */
  getCurrentRoundView(): {
    readonly roundNumber: number;
    readonly totalRounds: number;
    readonly why: string;
    readonly what: string;
    readonly actionLabel: string | null;
    readonly reference: number | null;
    readonly predicted: number | null;
    readonly observed: number | null;
    readonly assessment: string | null;
    readonly nextExperimentAction: string | null;
  } | null {
    if (!this.lastStrategyRun || this.stagedRoundIndex < 0) return null;
    const round = this.lastStrategyRun.rounds[this.stagedRoundIndex];
    if (!round) return null;
    const verdict = round.verdicts[0] ?? null;
    const isLastRound = this.stagedRoundIndex === this.lastStrategyRun.rounds.length - 1;
    return {
      roundNumber: round.round,
      totalRounds: this.lastStrategyRun.rounds.length,
      why: round.why,
      what: round.what,
      actionLabel: this.leverForRound(round)?.sceneForm?.actionLabel ?? null,
      // `reference` lives on the round itself (what `observed` was judged against); `predicted` is
      // per-hypothesis on the verdict — see `discoveryStrategy.ts`'s own doc for why the two live at
      // different levels (a MECHANISM round always carries exactly one verdict, so reading `[0]` here
      // loses nothing; a PARAMETER round's several verdicts each get their own real prediction, and
      // this view shows the one for the hypothesis this round actually tested).
      reference: round.reference,
      predicted: verdict?.predicted ?? null,
      observed: round.observed,
      assessment: verdict?.assessment ?? null,
      // The loop's own proposal is only meaningful once the search is actually finished — mid-run it
      // would be the wrong round's proposal read early, so it is shown only from the last round.
      nextExperimentAction: isLastRound ? (this.lastStrategyRun.nextExperiment?.action ?? null) : null,
    };
  }

  /**
   * MATRIX UI — the same joined view Voice Guide already narrates from
   * (`buildGenesisMatrixView`, computed once per run in `runStrategyDiscovery()`), exposed here so
   * the React layer can render the whole loop (Theory/Prediction/Simulation/Evidence/Falsification)
   * as a live panel instead of only reading it aloud.
   */
  getMatrixView(): GenesisMatrixView | null {
    return this.lastMatrixView;
  }

  getStats(): Record<string, number> {
    return {
      nearInteractable: this.nearestInteractableId !== null ? 1 : 0,
      forked: this.forkEngine ? 1 : 0,
      nearHospitalEntrance: this.nearHospitalEntrance ? 1 : 0,
      insideHospital: this.insideBuildingId ? 1 : 0,
    };
  }

  pointer(x: number, y: number, type: 'down' | 'move' | 'up'): void {
    if (!this.interaction) return;
    if (type === 'down') this.interaction.pointerDown(x, y);
    else if (type === 'move') this.interaction.pointerMove(x, y, this.width, this.height);
    else this.interaction.pointerUp(x, y, this.width, this.height);
  }

  dispose(): void {
    this.renderer?.dispose();
    this.wildfireField?.dispose();
    this.landslideField?.dispose();
    this.fireVfx?.dispose();
    this.sceneEnvironment?.dispose();
    this.sceneEnvironment = null;
    // GAME-GRADE C2 — the renderer's own dispose() above already disposes every tracked object,
    // which covers every per-building `.clone()` of these; these two are the shared base instances
    // those clones came from, never themselves added to the scene, so nothing else owns them.
    this.buildingWallMaterial?.dispose();
    this.buildingWallMaterial = null;
    this.buildingWindowMaterial?.dispose();
    this.buildingWindowMaterial = null;
    // PRIORITY 2 — the hospital interior's own geometry/materials: built once in `init()`, disposed
    // here the same way every other GPU resource in this scene already is.
    if (this.interiorGroup) {
      this.interiorGroup.parent?.remove(this.interiorGroup);
      this.interiorGroup.traverse((object) => {
        const mesh = object as THREE_NS.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const material = mesh.material as THREE_NS.Material | THREE_NS.Material[];
        for (const m of Array.isArray(material) ? material : [material]) m.dispose();
      });
      this.interiorGroup = null;
    }
    if (this.floodWater) {
      this.floodWater.mesh.parent?.remove(this.floodWater.mesh);
      this.floodWater.dispose();
      this.floodWater = null;
    }
    // C2-2 — ambient vehicles/pedestrians: each `bodyMaterial` was created fresh in `buildAmbientLife`
    // (never one of `vehicleKit.ts`'s own defaults), so it needs disposing here explicitly; `handle.dispose()`
    // only frees geometry/materials the kit itself created.
    for (const v of this.ambientVehicles) {
      v.handle.group.parent?.remove(v.handle.group);
      v.handle.dispose();
      v.bodyMaterial.dispose();
    }
    this.ambientVehicles = [];
    for (const p of this.ambientPedestrians) {
      p.visual.root.parent?.remove(p.visual.root);
      p.visual.dispose();
    }
    this.ambientPedestrians = [];
    if (this.observerScientist) {
      this.observerScientist.root.parent?.remove(this.observerScientist.root);
      this.observerScientist.dispose();
      this.observerScientist = null;
    }
    this.clearRoundStageBeacon();
    // VOICE GUIDE — stop any pending line rather than leaving a scene the player has already left
    // still talking.
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
  }
}

/**
 * MATRIX UI — the whole loop (Theory → Prediction → Simulation → Evidence → Falsification) as a
 * live panel, fed EXCLUSIVELY by real fields off `GenesisMatrixView` (`genesisMatrix.ts`) — the
 * same join Voice Guide already narrates from. Every stage's text is either read verbatim off
 * `narrateIntro`/`narrateRound`/`narrateNext` (never paraphrased — those functions already assert
 * their words against real data, re-typing the sentence here would just be a second, unverified
 * copy of it) or a bare field (`view.evidence`) that narration has no phase for at all.
 *
 * COMPETING MODELS gets its own explicit block, not just the sentence buried in FALSIFICATION's
 * narration text: when `competingModels.status === 'COMPETING_MODELS_UNRESOLVED'`, the real rival
 * hypothesis ids (`competingHypothesisIds`) are rendered as a genuine list, each with its own
 * `data-testid`, so "several explanations still stand" is a structural fact a reader (or a test)
 * can see, not a decoration.
 */
export function MatrixPanel({ view, roundNumber, run }: { view: GenesisMatrixView; roundNumber: number; run: StrategyRun | null }) {
  const introLines = narrateIntro(view);
  const entry = view.entries.find((e) => e.round === roundNumber) ?? null;
  const roundLines = entry ? narrateRound(entry) : [];
  const isLastRound = view.entries.length > 0 && roundNumber === view.entries[view.entries.length - 1]!.round;
  const nextLines = isLastRound ? narrateNext(view) : [];

  const byPhase = (phase: NarrationPhase, lines: readonly { phase: NarrationPhase; text: string }[]) =>
    lines.filter((l) => l.phase === phase);

  return (
    <div className="gx-matrix-panel" data-testid="genesis-matrix-panel">
      <div className="gx-matrix-header">
        <span className="gx-experiment-world">Genesis Matrix — the real loop this run actually ran</span>
        {/* HONESTY BOUNDARY (item 16) — every value on this panel is simulation output; this badge
            says so explicitly rather than letting the panel's scientific framing imply a physical
            apparatus Genesis does not have an interface to today. */}
        <span className="gx-matrix-badge" data-testid="matrix-provenance-badge">SIMULATION</span>
      </div>

      <div className="gx-matrix-stage" data-testid="matrix-stage-theory">
        <span className="gx-matrix-stage-label">THEORY</span>
        {byPhase('INTRO', introLines).map((l, i) => <p key={`i${i}`} className="gsc-caption">{l.text}</p>)}
        {byPhase('CAVEAT', introLines).map((l, i) => <p key={`c${i}`} className="gx-matrix-caveat">{l.text}</p>)}
      </div>

      {/* HYPOTHESES — the real run.surviving/falsified/untested partition (discoveryStrategy.ts's own
          contract), not a UI-invented status. `run` is null only when no StrategyRun exists yet at
          all (never mid-run), so that case renders NOT AVAILABLE rather than an empty list guessed
          to mean "no hypotheses". */}
      <div className="gx-matrix-stage" data-testid="matrix-stage-hypotheses">
        <span className="gx-matrix-stage-label">HYPOTHESES</span>
        {!run ? (
          <p className="gx-matrix-empty" data-testid="matrix-hypotheses-unavailable">NOT AVAILABLE</p>
        ) : (
          <ul className="gx-matrix-hyp-list">
            {run.surviving.map((id) => (
              <li key={id} className="gx-matrix-hyp gx-matrix-hyp-supported" data-testid={`matrix-hypothesis-${id}`}>
                <code>{id}</code><span>SUPPORTED</span>
              </li>
            ))}
            {run.falsified.map((id) => (
              <li key={id} className="gx-matrix-hyp gx-matrix-hyp-falsified" data-testid={`matrix-hypothesis-${id}`}>
                <code>{id}</code><span>FALSIFIED</span>
              </li>
            ))}
            {run.untested.map((id) => (
              <li key={id} className="gx-matrix-hyp gx-matrix-hyp-untested" data-testid={`matrix-hypothesis-${id}`}>
                <code>{id}</code><span>UNTESTED</span>
              </li>
            ))}
          </ul>
        )}
        {/* DECLARED_SPACE_INSUFFICIENT (item 7) — a real, nameable finding ("none of the mechanisms we
            declared explains this"), framed as a discovery moment, never an error banner: no red
            alarm styling, real nextStep/caveat text verbatim from modelSufficiency.ts. */}
        {view.sufficiency?.status === 'DECLARED_SPACE_INSUFFICIENT' && (
          <div className="gx-matrix-insufficient" data-testid="matrix-space-insufficient">
            <strong>Known mechanisms exhausted</strong>
            <p className="gsc-caption">
              None of the {view.sufficiency.declaredMechanismCount} declared mechanism(s) explains the observation.
            </p>
            {view.sufficiency.nextStep && <p className="gsc-caption" data-testid="matrix-insufficient-next-step">{view.sufficiency.nextStep}</p>}
            {view.sufficiency.caveat && <p className="gx-matrix-caveat">{view.sufficiency.caveat}</p>}
          </div>
        )}
      </div>

      <div className="gx-matrix-stage" data-testid="matrix-stage-prediction">
        <span className="gx-matrix-stage-label">PREDICTION</span>
        {byPhase('PREDICTION', roundLines).length === 0
          ? <p className="gx-matrix-empty" data-testid="matrix-no-prediction">This shape asserts a direction, not a predicted value.</p>
          : byPhase('PREDICTION', roundLines).map((l, i) => <p key={`p${i}`} className="gsc-caption">{l.text}</p>)}
      </div>

      <div className="gx-matrix-stage" data-testid="matrix-stage-simulation">
        <span className="gx-matrix-stage-label">SIMULATION</span>
        {byPhase('ACTION', roundLines).map((l, i) => <p key={`a${i}`} className="gsc-caption">{l.text}</p>)}
        {byPhase('OBSERVATION', roundLines).map((l, i) => <p key={`o${i}`} className="gsc-caption">{l.text}</p>)}
      </div>

      <div className="gx-matrix-stage" data-testid="matrix-stage-evidence">
        <span className="gx-matrix-stage-label">EVIDENCE</span>
        {view.evidence
          ? (
            <p className="gsc-caption" data-testid="matrix-evidence-bundle">
              Bundle <code>{view.evidence.bundleId}</code> — replay {view.evidence.replayVerdict}
            </p>
          )
          : <p className="gx-matrix-empty" data-testid="matrix-no-evidence">No evidence bundle attached to this run.</p>}
      </div>

      <div className="gx-matrix-stage" data-testid="matrix-stage-falsification">
        <span className="gx-matrix-stage-label">FALSIFICATION</span>
        {byPhase('VERDICT', roundLines).map((l, i) => <p key={`v${i}`} className="gsc-caption">{l.text}</p>)}
        {view.competingModels?.status === 'COMPETING_MODELS_UNRESOLVED' && (
          <div className="gx-matrix-competing" data-testid="matrix-competing-models">
            <strong>
              {view.competingModels.competingHypothesisIds.length} rival explanations still fit every observation:
            </strong>
            <ul>
              {view.competingModels.competingHypothesisIds.map((id) => (
                <li key={id} data-testid={`matrix-competing-model-${id}`}>{id}</li>
              ))}
            </ul>
          </div>
        )}
        {byPhase('VERDICT', nextLines).map((l, i) => <p key={`nv${i}`} className="gsc-caption">{l.text}</p>)}
        {byPhase('NEXT', nextLines).map((l, i) => <p key={`nn${i}`} className="gsc-caption">{l.text}</p>)}
      </div>

      {/* WHY THIS EXPERIMENT? (item 4) — real reasoning text off NextAction.why, the selector's own
          words, never a UI-authored explanation. Only meaningful once the search actually finished
          (same isLastRound gate the existing nextExperimentAction read already uses) — mid-run there
          is no next-experiment decision yet to explain. */}
      <div className="gx-matrix-stage" data-testid="matrix-stage-why">
        <span className="gx-matrix-stage-label">WHY THIS EXPERIMENT?</span>
        {isLastRound && view.nextExperiment ? (
          <>
            <p className="gx-matrix-decided" data-testid="matrix-genesis-decided">Genesis decided: {view.nextExperiment.action}</p>
            <p className="gsc-caption" data-testid="matrix-why-text">{view.nextExperiment.why}</p>
            {view.nextExperiment.about.length > 0 && (
              <p className="gsc-caption" data-testid="matrix-why-about">About: {view.nextExperiment.about.join(', ')}</p>
            )}
          </>
        ) : (
          <p className="gx-matrix-empty" data-testid="matrix-why-unavailable">Reason not yet available.</p>
        )}
      </div>

      {/* MEMORY (item 14) — PriorInvestigationDecision, real content off discoveryOrchestrator.ts.
          Null genuinely means "no prior investigation influenced this run" (its own doc: "no prior
          investigation, or none of it applies here") — a real, informative state, not a missing-data
          gap, so it gets its own honest sentence rather than NOT AVAILABLE. */}
      <div className="gx-matrix-stage" data-testid="matrix-stage-memory">
        <span className="gx-matrix-stage-label">MEMORY</span>
        {view.priorInvestigation ? (
          <p className="gsc-caption" data-testid="matrix-memory-text">{view.priorInvestigation.reason}</p>
        ) : (
          <p className="gx-matrix-empty" data-testid="matrix-memory-none">No prior investigation influenced this run.</p>
        )}
      </div>

      {/* INFORMATION GAIN (item 3) — genuinely not computed anywhere in this codebase today
          (inquiryLoop.ts's own doc: "No score, no ranking function, no expected-information number" —
          selection is a boolean discriminability check, not a quantified gain). Stated plainly rather
          than fabricated for this panel. */}
      <div className="gx-matrix-stage" data-testid="matrix-stage-information-gain">
        <span className="gx-matrix-stage-label">INFORMATION GAIN</span>
        <p className="gx-matrix-empty" data-testid="matrix-information-gain-unavailable">NOT AVAILABLE — no selector in Genesis computes a quantified information-gain score yet; next-experiment choice above is a real but non-numeric reason.</p>
      </div>
    </div>
  );
}

// LIVING WORLD — the exact same key-code -> MoveKey map `FirstPersonLabScreen.tsx` already uses,
// so WASD/arrow-key behavior is identical across every Genesis scene that walks.
const MOVE_KEYS: Record<string, MoveKey> = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

export function GenesisWorldScreen() {
  const sim = useMemo(() => new GenesisWorldSim3D(), []);
  const params = useMemo<SimParams>(() => ({}), []);

  // GENERIC INTERACTION SYSTEM — the nearest walkable entity's id + real state + real available
  // levers, refreshed on the same ~250ms cadence `getStats()` already drives (see `useThreeLoop.ts`),
  // piggy-backing on that existing throttle rather than adding a second polling loop. `getStats()`'s
  // own numeric return isn't rendered directly (an entity id isn't a number — see `getNearestInteractableId()`'s
  // own doc), only used to trigger this callback at all.
  const [nearestId, setNearestId] = useState<WorldFrameEntityId | null>(null);
  const [inspection, setInspection] = useState<EntityInspection | null>(null);
  const [availableLevers, setAvailableLevers] = useState<readonly WorldLever[]>([]);
  // PRIORITY 2 — REAL WORLD GEOMETRY: the hospital's entrance/interior state, unlike the science
  // interaction fields above, actually IS carried straight off `getStats()`'s numeric contract (a
  // boolean fits `Record<string, number>` fine, unlike an entity id).
  const [nearHospitalEntrance, setNearHospitalEntrance] = useState(false);
  const [insideHospital, setInsideHospital] = useState(false);
  // PRIORITY 4 — the last real experiment's result (`compareWorldActions`, Genesis' own Discovery
  // Engine), cleared whenever the player walks away from the entity that triggered it.
  const [comparison, setComparison] = useState<CrossActionComparison | null>(null);
  // PLAY A LIVE EXPERIMENT ROUND — the currently staged round, read straight off
  // `sim.getCurrentRoundView()` on the same poll cadence everything else here already uses, rather
  // than a second timer. `strategyRun` (the whole search) and `roundView` (just the staged round) are
  // separate pieces of state because "a search finished" and "which round is on screen right now" are
  // genuinely different facts — advancing the round must not re-run the search.
  const [strategyRun, setStrategyRun] = useState<StrategyRun | null>(null);
  const [roundView, setRoundView] = useState<ReturnType<GenesisWorldSim3D['getCurrentRoundView']>>(null);
  // MATRIX UI — the same joined view, kept as its own piece of state (not derived from `roundView`)
  // because it carries cross-cutting fields (competingModels/sufficiency/evidence/priorInvestigation)
  // that live on the WHOLE run, not on any one staged round.
  const [matrixView, setMatrixView] = useState<GenesisMatrixView | null>(null);
  const lastNearestIdRef = useRef<WorldFrameEntityId | null>(null);
  const onStats = useCallback((s: Record<string, number>) => {
    const id = sim.getNearestInteractableId();
    if (lastNearestIdRef.current !== id) {
      lastNearestIdRef.current = id;
      setComparison(null);
    }
    setNearestId(id);
    setInspection(id ? sim.inspect(id) : null);
    setAvailableLevers(id ? sim.leversFor(id) : []);
    setNearHospitalEntrance(s.nearHospitalEntrance === 1);
    setInsideHospital(s.insideHospital === 1);
    setRoundView(sim.getCurrentRoundView());
    setMatrixView(sim.getMatrixView());
  }, [sim]);
  const { canvasRef, loading, failed } = useThreeLoop(sim, params, true, onStats);

  const [tick, setTick] = useState(0);
  const [forkTick, setForkTick] = useState<number | null>(null);
  const [showFork, setShowFork] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [selected, setSelected] = useState<WorldFrameEntityId | null>(null);
  const [pumpStatus, setPumpStatus] = useState('');
  const [showWildfire, setShowWildfireState] = useState(false);
  const [wildfireSummary, setWildfireSummary] = useState<WildfireFieldSummary | null>(null);
  const [showLandslide, setShowLandslideState] = useState(false);
  const [landslideSummary, setLandslideSummary] = useState<LandslideFieldSummary | null>(null);

  useEffect(() => {
    sim.onSelect = (id: WorldFrameEntityId | null) => setSelected(id);
    return () => {
      sim.onSelect = undefined;
    };
  }, [sim]);

  // Takes the intended view mode as an explicit argument rather than closing over the `showFork`
  // React state — a caller that just called `setShowFork(next)` cannot then read `readPumpStatus()`
  // synchronously and expect it to see `next` (state updates are not synchronous), so every call
  // site passes the value it actually intends to display.
  const readPumpStatus = useCallback(
    (viewingFork: boolean): string => {
      const engine = viewingFork && sim.forkEngine ? sim.forkEngine : sim.city.base.engine;
      const pump = engine.graph.getEntity(sim.city.pumpPipeId);
      const flow = pump.domainState?.volumetricFlow;
      return `flow=${typeof flow === 'number' ? flow.toFixed(3) : '?'} m3/s — ${pump.statusLabel ?? 'nominal'}`;
    },
    [sim],
  );

  const handleAdvance = () => {
    sim.advanceTick();
    setTick(sim.city.base.engine.tick);
    if (sim.forkEngine) setForkTick(sim.forkEngine.tick);
    setPumpStatus(readPumpStatus(showFork));
  };

  const handleFork = () => {
    sim.createFork();
    setForkTick(sim.forkEngine?.tick ?? null);
    setShowFork(true);
    setPumpStatus(readPumpStatus(true));
  };

  // GENERIC INTERACTION SYSTEM — the generalized "press E / click a lever button" action: any real
  // lever on the entity the player is currently near, not just the pump's own hardcoded reset. Runs
  // the real `apply()` mutation via `entityInteractionBridge.ts` and switches the view to the new
  // fork, so the panel's own `inspection` (refreshed on the next stats tick, reading the now-active
  // fork engine) shows the REAL consequence — never a second, separately-computed "preview".
  const handleApplyLever = (lever: WorldLever) => {
    sim.applyLever(lever, `walk-up:${lever.leverId}`);
    setForkTick(sim.forkEngine?.tick ?? null);
    setShowFork(true);
    setPumpStatus(readPumpStatus(true));
  };

  // PRIORITY 4 (most important) — "check what happens if we change things here", answered by
  // Genesis' own real Discovery Engine (`compareWorldActions`), not a guess: every real lever this
  // world declares, forked from one shared control and measured against the same real objective.
  const handleRunExperiment = () => {
    setComparison(sim.runExperiment());
  };
  const handleApplyWinner = () => {
    sim.applyComparisonWinner();
    setComparison(null);
    setForkTick(sim.forkEngine?.tick ?? null);
    setShowFork(true);
    setPumpStatus(readPumpStatus(true));
  };

  const handleToggleFork = (show: boolean) => {
    sim.setShowFork(show);
    setShowFork(show);
    setPumpStatus(readPumpStatus(show));
  };

  // PLAY A LIVE EXPERIMENT ROUND — the real, multi-round search (`discoveryLoop.ts`, via the SAME
  // `runWorldDiscoveryAndRemember` seam `WorldDiscoveryPanel.tsx` already uses), staged round by
  // round: why -> what -> reference -> predicted -> observed -> assessment -> nextExperiment. Distinct
  // from `handleRunExperiment` above: that answers "which single option wins" in one shot;  this plays
  // back the search itself as it actually happened, one real round at a time.
  const handlePlayStrategyRound = () => {
    const run = sim.runStrategyDiscovery();
    setStrategyRun(run);
    setRoundView(sim.getCurrentRoundView());
    setMatrixView(sim.getMatrixView());
  };
  const handleNextRound = () => {
    sim.nextRound();
    setRoundView(sim.getCurrentRoundView());
    setMatrixView(sim.getMatrixView());
  };
  const handlePrevRound = () => {
    sim.prevRound();
    setRoundView(sim.getCurrentRoundView());
    setMatrixView(sim.getMatrixView());
  };
  const handleDismissStrategyRun = () => {
    sim.dismissStrategyRun();
    setStrategyRun(null);
    setRoundView(null);
    setMatrixView(null);
  };

  // PRIORITY 2 — REAL WORLD GEOMETRY: step through the hospital's real entrance. Movement/look input
  // keeps flowing to whichever `FirstPersonController` is now active (`sim.activeController()`
  // internally) — no separate React-level mode switch needed beyond these two calls.
  const handleEnterHospital = () => {
    sim.enterHospital();
    setInsideHospital(true);
    setNearHospitalEntrance(false);
  };
  const handleExitHospital = () => {
    sim.exitHospital();
    setInsideHospital(false);
  };

  // LIVING WORLD — pointer lock: entering "mouse-look" mode is an explicit player gesture (browser
  // requirement), the same click-to-lock pattern `FirstPersonLabScreen.tsx` already proves. `entered`
  // is deliberately a SEPARATE flag from `locked`: pointer lock is a desktop-mouse concept that a
  // touch device typically never grants (`pointerlockchange` may simply never fire there), so gating
  // the crosshair/interact-prompt HUD on `locked` alone would leave a mobile player who dismissed the
  // "enter world" overlay with no visible interaction feedback ever again. `entered` tracks "the
  // player has started playing" for HUD purposes; `locked` still gates the actual desktop mouse-look
  // listener below, where real pointer lock is what makes raw `movementX/Y` deltas meaningful.
  const [locked, setLocked] = useState(false);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onClick = () => {
      setEntered(true);
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
    };
    const onLockChange = () => setLocked(document.pointerLockElement === canvas);
    canvas.addEventListener('click', onClick);
    document.addEventListener('pointerlockchange', onLockChange);
    return () => {
      canvas.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onLockChange);
    };
  }, [canvasRef]);

  // LIVING WORLD — mobile: single-finger drag on the canvas is the touch equivalent of mouse-look
  // (unconditional — real pointer lock, which the desktop listener below requires, is a mouse concept
  // a touch device generally never grants). Movement itself is not gated by `entered`/`locked` at all
  // (see the D-pad buttons in the render below and the keyboard handler's own move keys), matching
  // this scene's existing convention that WASD already works before the world is "entered."
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      dragging = true;
      lastX = e.touches[0]!.clientX;
      lastY = e.touches[0]!.clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!dragging || e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0]!;
      sim.addMouseLook(touch.clientX - lastX, touch.clientY - lastY);
      lastX = touch.clientX;
      lastY = touch.clientY;
    };
    const onTouchEnd = () => { dragging = false; };
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);
    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [canvasRef, sim]);

  // LIVING WORLD / GENERIC INTERACTION SYSTEM — movement + look + the spatial interaction. `E` runs
  // the sole lever when exactly one exists (the pump's own original flow); an entity with SEVERAL
  // real levers (the floodplain's outlet/infiltration pair) uses number keys `1`.."9" instead, one per
  // `availableLevers` slot. Deliberately keyboard-only, never relying on clicking the panel's own
  // buttons: real browser Pointer Lock routes ALL mouse events to the LOCKED element (this scene's own
  // canvas, per the Pointer Lock spec) regardless of where the cursor visually is, so a click on any
  // other on-screen element while locked never reaches it — confirmed the hard way via a real
  // Chromium walkthrough, not assumed. The panel's buttons stay real `<button onClick>`s purely for
  // touch/mouse use when NOT locked (mobile never locks; desktop can `Esc` first), matching the
  // existing D-pad/enter-overlay convention of never requiring pointer lock for anything.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const move = MOVE_KEYS[e.code];
      if (move) { sim.setMoveKey(move, true); return; }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { sim.setRunning(true); return; }
      if (forkTick === null && availableLevers.length === 1 && e.code === 'KeyE') {
        handleApplyLever(availableLevers[0]!);
        return;
      }
      if (forkTick === null && availableLevers.length > 1 && /^Digit[1-9]$/.test(e.code)) {
        const index = Number(e.code.slice(5)) - 1;
        if (index < availableLevers.length) handleApplyLever(availableLevers[index]!);
        return;
      }
      if (e.code === 'KeyF') {
        if (insideHospital) handleExitHospital();
        else if (nearHospitalEntrance) handleEnterHospital();
        return;
      }
      if (e.code === 'KeyR' && forkTick === null && availableLevers.length > 0) {
        handleRunExperiment();
        return;
      }
      if (e.code === 'Enter' && forkTick === null && comparison && comparison.bestActionIds.length > 0) {
        handleApplyWinner();
        return;
      }
      if (e.code === 'KeyP' && !comparison && !strategyRun && availableLevers.length > 0) {
        handlePlayStrategyRound();
        return;
      }
      if (e.code === 'Escape' && document.pointerLockElement) document.exitPointerLock();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const move = MOVE_KEYS[e.code];
      if (move) { sim.setMoveKey(move, false); return; }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') sim.setRunning(false);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement) sim.addMouseLook(e.movementX, e.movementY);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousemove', onMouseMove);
    };
  }, [sim, availableLevers, forkTick, insideHospital, nearHospitalEntrance, comparison, strategyRun]);

  const handleScrub = (value: number) => {
    setScrubValue(value);
    setScrubbing(true);
    sim.setScrubTick(value);
  };

  const handleLive = () => {
    setScrubbing(false);
    sim.setScrubTick(null);
  };

  const handleToggleWildfire = (show: boolean) => {
    sim.setShowWildfire(show);
    setShowWildfireState(show);
    setWildfireSummary(sim.getWildfireSummary());
    // The two terrain fields are mutually exclusive in the scene (sim.setShowWildfire already
    // hides the landslide mesh) — mirror that in React state so the status line never shows both.
    if (show) setShowLandslideState(false);
  };

  const handleToggleLandslide = (show: boolean) => {
    sim.setShowLandslide(show);
    setShowLandslideState(show);
    setLandslideSummary(sim.getLandslideSummary());
    if (show) setShowWildfireState(false);
  };

  return (
    <main id="main-content" tabIndex={-1} className="home genesis-world-screen">
      <div className="honesty-row">
        <span className="honesty educational">Genesis World Observation (Trinity)</span>
        <span className="honesty-note">
          Real Genesis Scientific City 4.0, generated through the createScientificWorld Trinity entry point and rendered via the generic
          WorldFrameRenderer (C2). Click an object to select it; use the controls below to advance time, scrub the timeline, and fork a
          counterfactual (emergency flow-reduction) world for comparison. The wildfire field toggle shows a real Rothermel/MTT fire-spread
          solve (C3, `wildfireSpread.ts`) on a separate synthetic demonstration terrain, rendered via the generic terrainField kit (C2).
          The landslide field toggle shows a real infinite-slope stability + sliding-block runout solve (C3, `landslide.ts`) the same way,
          on its own steeper demonstration terrain.
        </span>
      </div>

      <div className="character-stage">
        <canvas ref={canvasRef} className="character-canvas" aria-label="Genesis Scientific City 4.0 (Three.js) — walkable first-person view" />
        {loading && (
          <div className="route-loading" role="status">
            Ładowanie silnika 3D…
          </div>
        )}
        {failed && <div className="empty-state">Nie udało się uruchomić WebGL na tym urządzeniu.</div>}

        {!entered && !loading && !failed && (
          <div
            className="fp-lab-enter"
            data-testid="genesis-world-enter"
            role="button"
            tabIndex={0}
            onClick={() => { setEntered(true); canvasRef.current?.requestPointerLock(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { setEntered(true); canvasRef.current?.requestPointerLock(); } }}
          >
            <p className="fp-lab-enter-title">Tap or click to walk into Genesis World</p>
            <p className="fp-lab-enter-hint">
              Desktop: WASD — walk · Shift — run · mouse — look · E/1-9 — interact · F — enter/exit a
              building · Esc — exit. Touch: drag to look · D-pad to walk · tap the prompt to interact.
            </p>
          </div>
        )}

        {entered && <div className="fp-lab-crosshair" aria-hidden="true" />}
        {/* Desktop-only hint: Esc only does something once real pointer lock (a mouse concept) is
            active — a touch device never sees this, since `locked` there generally never becomes true. */}
        {entered && locked && (
          <p className="fp-lab-enter-hint" style={{ position: 'absolute', left: '1rem', top: '1rem' }}>Esc — exit mouse-look</p>
        )}

        {/* PRIORITY 2 — REAL WORLD GEOMETRY: the hospital's real entrance/exit trigger, deliberately
            separate from the science-interaction panel below (walking through a door is navigation,
            not inspecting or changing a parameter). Same keyboard-first reasoning as the lever buttons
            above: `F` is the actual desktop affordance under pointer lock, the button a touch/unlocked
            fallback. */}
        {entered && !insideHospital && nearHospitalEntrance && (
          <button type="button" className="fp-lab-prompt" data-testid="genesis-world-enter-hospital" onClick={handleEnterHospital}>
            F — enter hospital
          </button>
        )}
        {entered && insideHospital && (
          <button type="button" className="fp-lab-prompt" data-testid="genesis-world-exit-hospital" onClick={handleExitHospital}>
            F — exit hospital
          </button>
        )}

        {/* GENERIC INTERACTION SYSTEM — walk up to ANY of `interactableIds`, not just the pump: shows
            the entity's real, current state (`inspectEntity`) and, when the world declares a real
            lever targeting it (`leversForEntity`), a button per lever that runs the real intervention
            (`applyLeverIntervention`) and forks the world. An entity with no declared lever (hospital,
            lab, population today) is shown honestly as inspect-only, never a fake "nothing to see". */}
        {entered && nearestId && forkTick === null && inspection && (
          <div className="gx-interact-panel" data-testid="genesis-world-interact-panel">
            <strong data-testid="interact-panel-label">{inspection.label}</strong>
            <span data-testid="interact-panel-state">
              {Object.entries(inspection.domainState ?? {})
                .slice(0, 4)
                .map(([key, value]) => `${key}=${typeof value === 'number' ? value.toFixed(3) : String(value)}`)
                .join(' · ') || 'no domain state'}
              {inspection.statusLabel ? ` · ${inspection.statusLabel}` : ''}
            </span>
            {availableLevers.length > 0 ? (
              <div className="gx-interact-panel-levers">
                {/* Keyboard hotkey shown alongside every button: `E` for the sole-lever case, `1`.."9"
                    when there is a real choice to make — mouse-look pointer lock (a real desktop
                    concept) routes clicks to the canvas, not to this button, so the hotkey is the
                    actual desktop affordance; the button itself still works normally on touch, or on
                    desktop after `Esc`. */}
                {availableLevers.map((lever, index) => (
                  <button
                    key={lever.leverId}
                    type="button"
                    className="chip-btn"
                    data-testid={`lever-btn-${lever.leverId}`}
                    onClick={() => handleApplyLever(lever)}
                  >
                    {availableLevers.length === 1 ? 'E — ' : `${index + 1} — `}
                    {lever.leverId.replace('lever:', '').replace(/-/g, ' ')}
                  </button>
                ))}
              </div>
            ) : (
              <span data-testid="interact-panel-inspect-only">Inspect only — no real intervention modelled for this entity yet.</span>
            )}

            {/* PRIORITY 4 (most important) — "check what happens if we change things here", answered
                by Genesis' own real Discovery Engine (compareWorldActions), the SAME engine
                WorldDiscoveryPanel.tsx already runs elsewhere in this app: every real lever this world
                declares, forked from one shared control and measured against the same real objective.
                Runs on the catalog's own reference world (never the player's live city — see
                `runExperiment()`'s own doc for why), so applying the real winner is a separate,
                explicit second step that changes the world the player is actually standing in. */}
            {availableLevers.length > 0 && !comparison && (
              <button type="button" className="chip-btn" data-testid="run-experiment-btn" onClick={handleRunExperiment}>
                R — run real experiment (compare every option)
              </button>
            )}
            {comparison && (
              <div className="gx-experiment-result" data-testid="experiment-result">
                <span className="gx-experiment-world" data-testid="experiment-world">
                  Ran in world <code>{comparison.worldId}</code> ({comparison.domainId})
                </span>
                <span>
                  {comparison.status === 'REFUSED' || comparison.status === 'BLOCKED' || comparison.status === 'NOT_MODELLED'
                    ? `Experiment could not run: ${comparison.refusalReason ?? comparison.status}`
                    : `Real comparison (${comparison.status.toLowerCase()}), objective: ${comparison.objective?.metric ?? '?'}`}
                </span>
                {comparison.ranking.map((evidence) => (
                  <div key={evidence.actionId} data-testid={`experiment-rank-${evidence.actionId}`}>
                    {comparison.bestActionIds.includes(evidence.actionId) ? '★ ' : ''}
                    {evidence.label}: {evidence.directionVerdict.toLowerCase()}
                    {evidence.absoluteDelta !== null ? ` (Δ${evidence.absoluteDelta.toFixed(4)})` : ''}
                  </div>
                ))}
                <div className="gx-interact-panel-levers">
                  {comparison.bestActionIds.length > 0 && (
                    <button type="button" className="chip-btn" data-testid="apply-experiment-winner-btn" onClick={handleApplyWinner}>
                      Enter — apply winning option to this world
                    </button>
                  )}
                  <button type="button" className="chip-btn" data-testid="dismiss-experiment-btn" onClick={() => setComparison(null)}>
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* PLAY A LIVE EXPERIMENT ROUND — the real multi-round search (`discoveryLoop.ts`, the same
                one `WorldDiscoveryPanel.tsx` runs elsewhere), staged round by round: why -> what ->
                reference -> predicted -> observed -> assessment -> nextExperiment, every value read
                straight off the loop's own real result (`StrategyRound`/`StrategyVerdict` —
                `discoveryStrategy.ts`), never fabricated. The round-stage beacon in the 3D scene (see
                `stageRound()`'s own doc) plays whichever real lever this round pulled, using that
                lever's own DECLARED `sceneForm` — never a guess made here from its id. */}
            {availableLevers.length > 0 && !comparison && !strategyRun && (
              <button type="button" className="chip-btn" data-testid="play-strategy-round-btn" onClick={handlePlayStrategyRound}>
                P — play a live experiment round
              </button>
            )}
            {strategyRun && roundView && (
              <div className="gx-round-stage" data-testid="strategy-round-stage">
                <span className="gx-experiment-world" data-testid="round-stage-domain">
                  Live search in <code>{strategyRun.domainId}</code> — round {roundView.roundNumber} / {roundView.totalRounds}
                </span>
                {roundView.actionLabel && (
                  <p className="wd-trace-what" data-testid="round-stage-action">
                    {roundView.actionLabel}
                  </p>
                )}
                <p className="wd-trace-why" data-testid="round-stage-why">{roundView.why}</p>
                <p className="wd-trace-what" data-testid="round-stage-what">{roundView.what}</p>
                <p className="gsc-caption" data-testid="round-stage-numbers">
                  reference: {roundView.reference === null ? '—' : roundView.reference.toFixed(4)} · predicted:{' '}
                  {roundView.predicted === null ? '—' : roundView.predicted.toFixed(4)} · observed:{' '}
                  {roundView.observed === null ? '—' : roundView.observed.toFixed(4)}
                </p>
                {roundView.assessment && (
                  <span className={`wd-verdict wd-${roundView.assessment}`} data-testid="round-stage-assessment">
                    {roundView.assessment}
                  </span>
                )}
                {roundView.nextExperimentAction && (
                  <p className="gsc-caption" data-testid="round-stage-next-experiment">
                    Next experiment: {roundView.nextExperimentAction}
                  </p>
                )}
                <div className="gx-interact-panel-levers">
                  <button
                    type="button"
                    className="chip-btn"
                    data-testid="round-prev-btn"
                    onClick={handlePrevRound}
                    disabled={roundView.roundNumber <= 1}
                  >
                    ◀ prev round
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    data-testid="round-next-btn"
                    onClick={handleNextRound}
                    disabled={roundView.roundNumber >= roundView.totalRounds}
                  >
                    next round ▶
                  </button>
                  <button type="button" className="chip-btn" data-testid="dismiss-round-stage-btn" onClick={handleDismissStrategyRun}>
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            {matrixView && roundView && <MatrixPanel view={matrixView} roundNumber={roundView.roundNumber} run={strategyRun} />}
          </div>
        )}

        {entered && (
          <div className="gx-dpad" aria-label="Walk" data-testid="genesis-world-dpad">
            <button type="button" className="gx-dpad-btn gx-dpad-up" aria-label="Walk forward"
              onPointerDown={(e) => { e.preventDefault(); sim.setMoveKey('forward', true); }}
              onPointerUp={() => sim.setMoveKey('forward', false)}
              onPointerLeave={() => sim.setMoveKey('forward', false)}>▲</button>
            <button type="button" className="gx-dpad-btn gx-dpad-left" aria-label="Strafe left"
              onPointerDown={(e) => { e.preventDefault(); sim.setMoveKey('left', true); }}
              onPointerUp={() => sim.setMoveKey('left', false)}
              onPointerLeave={() => sim.setMoveKey('left', false)}>◀</button>
            <button type="button" className="gx-dpad-btn gx-dpad-right" aria-label="Strafe right"
              onPointerDown={(e) => { e.preventDefault(); sim.setMoveKey('right', true); }}
              onPointerUp={() => sim.setMoveKey('right', false)}
              onPointerLeave={() => sim.setMoveKey('right', false)}>▶</button>
            <button type="button" className="gx-dpad-btn gx-dpad-down" aria-label="Walk back"
              onPointerDown={(e) => { e.preventDefault(); sim.setMoveKey('back', true); }}
              onPointerUp={() => sim.setMoveKey('back', false)}
              onPointerLeave={() => sim.setMoveKey('back', false)}>▼</button>
          </div>
        )}
      </div>

      <div className="sim-transport" data-testid="genesis-world-controls">
        <button className="chip-btn" data-testid="advance-tick" onClick={handleAdvance}>
          Advance tick
        </button>
        <button className="chip-btn" data-testid="create-fork" onClick={handleFork} disabled={forkTick !== null}>
          Create counterfactual fork
        </button>
        <button className="chip-btn" data-testid="show-base" aria-pressed={!showFork} onClick={() => handleToggleFork(false)} disabled={forkTick === null}>
          Base world
        </button>
        <button className="chip-btn" data-testid="show-fork" aria-pressed={showFork} onClick={() => handleToggleFork(true)} disabled={forkTick === null}>
          Fork world
        </button>
        <label>
          Scrub tick
          <input
            type="range"
            data-testid="scrub-slider"
            min={0}
            max={Math.max(1, tick)}
            value={scrubValue}
            onChange={(e) => handleScrub(Number(e.target.value))}
          />
        </label>
        <button className="chip-btn" data-testid="go-live" onClick={handleLive} disabled={!scrubbing}>
          Live
        </button>
        <button className="chip-btn" data-testid="toggle-wildfire" aria-pressed={showWildfire} onClick={() => handleToggleWildfire(!showWildfire)}>
          {showWildfire ? 'Hide wildfire field' : 'Show wildfire field (Rothermel/MTT)'}
        </button>
        <button className="chip-btn" data-testid="toggle-landslide" aria-pressed={showLandslide} onClick={() => handleToggleLandslide(!showLandslide)}>
          {showLandslide ? 'Hide landslide field' : 'Show landslide field (FS + runout)'}
        </button>
      </div>

      <p className="footer-note" data-testid="genesis-world-status">
        Base tick: <span data-testid="base-tick">{tick}</span>
        {forkTick !== null && (
          <>
            {' '}
            · Fork tick: <span data-testid="fork-tick">{forkTick}</span> · Viewing: <span data-testid="viewing">{showFork ? 'fork' : 'base'}</span>
          </>
        )}
        {scrubbing && (
          <>
            {' '}
            · Scrubbed to tick <span data-testid="scrub-tick">{scrubValue}</span>
          </>
        )}
        {pumpStatus && (
          <>
            {' '}
            · Pump: <span data-testid="pump-status">{pumpStatus}</span>
          </>
        )}
        {selected && (
          <>
            {' '}
            · Selected: <span data-testid="selected-entity">{selected}</span>
          </>
        )}
        {showWildfire && wildfireSummary && (
          <>
            {' '}
            · Wildfire: head ROS <span data-testid="wildfire-head-ros">{wildfireSummary.headRosMS.toFixed(3)}</span> m/s · intensity{' '}
            <span data-testid="wildfire-intensity">{wildfireSummary.headFirelineIntensityKWm.toFixed(0)}</span> kW/m · flame length{' '}
            <span data-testid="wildfire-flame-length">{wildfireSummary.headFlameLengthM.toFixed(1)}</span> m · reached{' '}
            <span data-testid="wildfire-reached-cells">
              {wildfireSummary.reachedCells}/{wildfireSummary.totalCells}
            </span>{' '}
            cells (Rothermel 1972 / Finney 2002 MTT, synthetic demo terrain)
          </>
        )}
        {showLandslide && landslideSummary && (
          <>
            {' '}
            · Landslide: min FS <span data-testid="landslide-min-fs">{landslideSummary.minFactorOfSafety.toFixed(2)}</span> · unstable{' '}
            <span data-testid="landslide-unstable-cells">
              {landslideSummary.unstableCells}/{landslideSummary.totalCells}
            </span>{' '}
            cells · max runout velocity <span data-testid="landslide-max-velocity">{landslideSummary.maxVelocityAnywhereMS.toFixed(2)}</span> m/s ·
            longest runout <span data-testid="landslide-longest-runout">{landslideSummary.longestRunoutDistanceM.toFixed(0)}</span> m
            {landslideSummary.pathsLeavingModelledArea > 0 && (
              <>
                {' '}
                (<span data-testid="landslide-paths-left-area">{landslideSummary.pathsLeavingModelledArea}</span> path
                {landslideSummary.pathsLeavingModelledArea === 1 ? '' : 's'} left the modelled area still moving — a lower bound)
              </>
            )}{' '}
            (Skempton & DeLory 1957 infinite-slope stability, sliding-block runout, synthetic demo terrain)
          </>
        )}
      </p>
    </main>
  );
}
