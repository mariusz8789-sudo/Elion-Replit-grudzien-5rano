import { useCallback, useEffect, useMemo, useState } from 'react';
import type * as THREE_NS from 'three';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../../core/three/types';
import type { SimParams } from '../../core/types';
import { useThreeLoop } from '../../core/three/useThreeLoop';
import { WorldFrameRenderer, type EntityVisualSpec } from '../../core/three/graphics/worldFrameRenderer';
import { InteractionController } from '../../core/three/graphics/interaction';
import type { WorldFrameEntity, WorldFrameEntityId } from '../../core/three/graphics/worldFrame';
import { buildTerrainFieldMesh, type TerrainFieldMesh } from '../../core/three/graphics/terrainField';
import { severityColor } from '../../core/three/graphics/stateVisualization';
import { createFireVfx, type FireVfxHandle } from '../../core/three/graphics/fireVfx';
import { createSceneEnvironment, type SceneEnvironmentHandle } from '../../core/three/graphics/sceneEnvironment';
import { createPBRMaterial, type StaticGenesisMaterialId } from '../../core/three/graphics/materials';
import { setupGraphicsPipeline, type GraphicsPipeline } from '../../core/three/graphics/postProcessing';
import { getFrameState } from '../../core/worldModel/bridge/worldFrameState';
import { toGraphicsWorldFrame } from '../../core/worldModel/bridge/graphicsWorldFrameAdapter';
import { buildGenesisScientificCity4, type GenesisScientificCity4 } from '../../core/worldModel/domains/genesisScientificCity4';
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
 * a painted facade. The tint (`colorForVisualHint`, and `updateVisual`'s tripped/interrupted override)
 * still layers on top via `PBRMaterialOverrides.color` — status coloring is unchanged.
 */
const VISUAL_HINT_MATERIAL: Readonly<Record<string, StaticGenesisMaterialId>> = {
  planet: 'CONCRETE',
  region: 'CONCRETE',
  city: 'CONCRETE',
  district: 'BRICK',
  road: 'ASPHALT',
  building: 'PAINTED_METAL',
  'pump-pipe-system': 'BRUSHED_METAL',
  population: 'TECH_COMPOSITE',
  lab: 'CERAMIC',
  substance: 'TECH_COMPOSITE',
  environment: 'TECH_COMPOSITE',
};

function materialCategoryForVisualHint(hint?: string): StaticGenesisMaterialId {
  return (hint ? VISUAL_HINT_MATERIAL[hint] : undefined) ?? 'CONCRETE';
}

export class GenesisWorldSim3D implements Sim3D {
  cameraAutoRotateSpeed = 0;
  private THREE: typeof THREE_NS | null = null;
  private scene: THREE_NS.Scene | null = null;
  private root: THREE_NS.Group | null = null;
  private renderer: WorldFrameRenderer | null = null;
  private interaction: InteractionController | null = null;
  private width = 300;
  private height = 300;
  private sceneEnvironment: SceneEnvironmentHandle | null = null;
  private pipeline: GraphicsPipeline | null = null;

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
  }

  private activeEngine(): TemporalEngine {
    return this.showFork && this.forkEngine ? this.forkEngine : this.city.base.engine;
  }

  init(THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera, w: number, h: number): void {
    this.THREE = THREE;
    this.scene = scene;
    this.width = w;
    this.height = h;

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
      hourOfDay: 21,
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
    });

    this.root = new THREE.Group();
    scene.add(this.root);

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
    };

    this.renderer = new WorldFrameRenderer(THREE, this.root, { resolveVisual, updateVisual });
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

    camera.position.set(10, 55, 95);
    camera.lookAt(0, 0, 0);

    this.syncNow();
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
      bloom: { strength: 0.35, radius: 0.5, threshold: 0.85 },
      ambient: { mode: 'none' },
    });
    return this.pipeline;
  }

  getOrbitTarget(): THREE_NS.Vector3 | null {
    return this.THREE ? new this.THREE.Vector3(0, 0, 0) : null;
  }

  private syncNow(): void {
    if (!this.renderer) return;
    const engine = this.activeEngine();
    const frame = getFrameState(engine, this.scrubTick ?? undefined);
    this.renderer.sync(toGraphicsWorldFrame(frame));
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
      if (this.wildfireField && this.scene && !this.wildfireField.mesh.parent) {
        this.scene.add(this.wildfireField.mesh);
      }
      if (this.fireVfx && this.scene && !this.fireVfx.group.parent) {
        this.scene.add(this.fireVfx.group);
      }
    } else {
      if (this.root) this.root.visible = true;
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
      if (this.landslideField && this.scene && !this.landslideField.mesh.parent) {
        this.scene.add(this.landslideField.mesh);
      }
    } else {
      if (this.root) this.root.visible = true;
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
    // than an ambient demo. The fire VFX and the shared environment's ambient haze are the
    // exceptions, same split `genesisScientificCitySim.ts`'s own `update(dt)` already draws: both
    // are pure rendering-layer animation (flicker/rise, particle drift), not simulation time, so
    // they keep moving every real frame regardless of world-clock state.
    this.sceneEnvironment?.update(dt);
    if (this.showWildfire) this.fireVfx?.update(dt);
  }

  syncScene(): void {
    this.syncNow();
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
  }
}

export function GenesisWorldScreen() {
  const sim = useMemo(() => new GenesisWorldSim3D(), []);
  const params = useMemo<SimParams>(() => ({}), []);
  const { canvasRef, loading, failed } = useThreeLoop(sim, params, true);

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

  const handleToggleFork = (show: boolean) => {
    sim.setShowFork(show);
    setShowFork(show);
    setPumpStatus(readPumpStatus(show));
  };

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
        <canvas ref={canvasRef} className="character-canvas" aria-label="Genesis Scientific City 4.0 (Three.js)" />
        {loading && (
          <div className="route-loading" role="status">
            Ładowanie silnika 3D…
          </div>
        )}
        {failed && <div className="empty-state">Nie udało się uruchomić WebGL na tym urządzeniu.</div>}
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
