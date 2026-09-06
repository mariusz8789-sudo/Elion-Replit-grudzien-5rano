import type * as THREE_NS from 'three';
import type { Sim3D } from './types';
import { TemporalEngine, TemporalBranchRegistry } from '../worldModel/temporal/temporalEngine';
import {
  buildGenesisScientificCity3, RAINFALL_LOAD_MULTIPLIER,
  PUMP_TRIPPED_EVENT_TYPE, HOSPITAL_SERVICE_INTERRUPTED_EVENT_TYPE, POPULATION_ACCESS_IMPAIRED_EVENT_TYPE,
} from '../worldModel/domains/genesisScientificCity3';
import { getFrameState, compareBranches, type BranchComparison } from '../worldModel/bridge/worldFrameState';
import { getCausalAncestry, getEventHistoryFor } from '../worldModel/queries/worldQueries';
import type { EntityId, WorldModelEntity } from '../worldModel/ecs/types';
import type { GenesisEvent } from '../events/genesisEvent';
import { WorldFrameRenderer, type EntityVisualSpec } from './graphics/worldFrameRenderer';
import type { WorldFrame, WorldFrameEntity as C2Entity, EntityGrounding } from './graphics/worldFrame';
import { createPumpAssembly, createValveAssembly } from './graphics/infrastructure';
import { createPBRMaterial } from './graphics/materials';
import { applyVisualState, type CanonicalVisualState } from './graphics/visualState';
import { createSunLight, createBackgroundFill } from './graphics/lighting';
import { resolveCameraFraming, type CameraIntent } from './graphics/cameraRig';

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
 * (`bridge/worldFrameState.ts`) to C2's generic `WorldFrame` (`graphics/worldFrame.ts`); real-object
 * visuals for the pump/hospital via C2's own `createPumpAssembly`/`createValveAssembly`/
 * `createPBRMaterial`/`applyVisualState`; real-graph target resolution (`resolveNamedWorldTarget` —
 * a live scan of `graph.listEntities()`, never a hardcoded id); real camera framing via C2's
 * `resolveCameraFraming`, riding the SAME OrbitControls target/distance seam every other Genesis
 * city scene (`epidemicCity3D.ts`) already uses; and an on-demand "what if the pump fails" fork,
 * built with the EXACT same `TemporalEngine.forkBranch` + `compareBranches` pattern
 * `scenarioSession.ts`'s own hydraulics session already uses for its own fork — not a second fork
 * mechanism.
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

  private renderedIds: ReadonlySet<EntityId>;

  private THREE: typeof THREE_NS | null = null;
  private renderer: WorldFrameRenderer | null = null;
  private pumpMaterials: {
    body: THREE_NS.Material; motor: THREE_NS.Material; plinth: THREE_NS.Material; pipe: THREE_NS.Material; valve: THREE_NS.Material;
  } | null = null;
  private buildingMaterial: THREE_NS.Material | null = null;
  private landmarkMaterial: THREE_NS.Material | null = null;

  private followTarget: THREE_NS.Vector3 | null = null;
  private observationStandoff: number | null = null;
  private lastSelectedId: EntityId | null = null;

  constructor() {
    this.renderedIds = new Set<EntityId>([
      this.city.pumpPipeId, this.city.hospitalBuildingId, this.city.waterSystemBuildingId,
      this.city.labBuildingId, this.city.populationId,
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

    const pumpWords = /\b(pump|pompa|pipe|rura|water pump|hospital pump|pump station)\b/i;
    if (pumpWords.test(needle)) {
      const pump = candidates.find((entity) => entity.ref.kind === 'pump-pipe-system');
      if (pump) return { id: pump.id, label: pump.label, kind: pump.ref.kind };
    }
    const hospitalWords = /\b(hospital|szpital)\b/i;
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
    const radius = match.kind === 'pump-pipe-system' ? 1.4 : 5;
    this.lastSelectedId = match.id;
    if (!this.followTarget && this.THREE) this.followTarget = new this.THREE.Vector3();
    this.followTarget?.set(position.x, position.y + radius * 0.4, position.z);
    if (this.THREE) {
      const framing = resolveCameraFraming({ intent: cameraIntent, target: [position.x, position.y + radius * 0.4, position.z], targetRadius: radius });
      this.observationStandoff = Math.hypot(
        framing.position[0] - framing.lookAt[0], framing.position[1] - framing.lookAt[1], framing.position[2] - framing.lookAt[2],
      );
    }
    return { found: true, label: match.label };
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
   * causal engine. Returns the ancestry of the most recent population-access-impaired event on the
   * failure branch, root-first, or `null` when no failure has been triggered / the cascade never
   * reached the population.
   */
  explainWaterServiceLoss(): readonly CausalStep[] | null {
    if (!this.failureBranch) return null;
    const populationEvents = getEventHistoryFor(this.failureBranch, this.city.populationId);
    const impaired = [...populationEvents].reverse().find((event) => event.type === POPULATION_ACCESS_IMPAIRED_EVENT_TYPE);
    if (!impaired) return null;
    const ancestry: readonly GenesisEvent[] = getCausalAncestry(this.failureBranch, impaired.id);
    return [...ancestry].reverse().map((event) => ({
      type: event.type, tick: event.timestamp, cause: event.cause ?? null, parentEventId: event.parentEventId ?? null,
    }));
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
    scene.fog = new THREE.Fog(0x0c1420, 30, 90);
    createSunLight(THREE, scene, { position: [30, 40, 20] });
    createBackgroundFill(THREE, scene);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x1a2332, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    this.pumpMaterials = {
      body: createPBRMaterial(THREE, 'PAINTED_METAL'),
      motor: createPBRMaterial(THREE, 'BRUSHED_METAL'),
      plinth: createPBRMaterial(THREE, 'CONCRETE'),
      pipe: createPBRMaterial(THREE, 'BRUSHED_METAL'),
      valve: createPBRMaterial(THREE, 'POLISHED_METAL'),
    };
    this.buildingMaterial = createPBRMaterial(THREE, 'TECH_COMPOSITE');
    this.landmarkMaterial = createPBRMaterial(THREE, 'CERAMIC');

    this.renderer = new WorldFrameRenderer(THREE, scene, {
      resolveVisual: (entity) => this.resolveVisual(entity),
      updateVisual: (entity, object) => this.updateVisual(entity, object),
    });

    const hospital = this.city.graph.getEntity(this.city.hospitalBuildingId).spatial?.position ?? { x: 0, y: 0, z: 0 };
    const pump = this.city.graph.getEntity(this.city.pumpPipeId).spatial?.position ?? { x: 0, y: 0, z: 0 };
    const midX = (hospital.x + pump.x) / 2;
    const midZ = (hospital.z + pump.z) / 2;
    camera.position.set(midX + 18, 16, midZ + 24);
    camera.lookAt(midX, 1, midZ);
  }

  private hospitalPosition(): THREE_NS.Vector3Tuple {
    const hospital = this.city.graph.getEntity(this.city.hospitalBuildingId).spatial?.position ?? { x: 0, y: 0, z: 0 };
    return [hospital.x, 0.5, hospital.z];
  }

  private resolveVisual(entity: C2Entity): EntityVisualSpec {
    const THREE = this.THREE!;
    if (entity.visualHint === 'pump-pipe-system' && this.pumpMaterials) {
      const assembly = createPumpAssembly(THREE, {
        position: entity.position,
        bodyMaterial: this.pumpMaterials.body, motorMaterial: this.pumpMaterials.motor,
        plinthMaterial: this.pumpMaterials.plinth, valveMaterial: this.pumpMaterials.valve, pipeMaterial: this.pumpMaterials.pipe,
        pipeRuns: [{ to: this.hospitalPosition(), radius: 0.1 }],
      });
      const valve = createValveAssembly(THREE, {
        position: [entity.position[0] + 1.4, entity.position[1] + 0.7, entity.position[2] - 0.4],
        axis: [1, 0, 0], bodyMaterial: this.pumpMaterials.valve, handleMaterial: this.pumpMaterials.pipe,
      });
      assembly.group.add(valve.group);
      assembly.group.traverse((node) => { const mesh = node as THREE_NS.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
      return { kind: 'object', object: assembly.group };
    }
    if (entity.visualHint === 'building' && this.buildingMaterial) {
      const size = entity.id === this.city.hospitalBuildingId ? 6 : 4;
      const box = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.9, size), this.buildingMaterial.clone());
      box.position.y += (size * 0.9) / 2;
      box.castShadow = true; box.receiveShadow = true;
      return { kind: 'object', object: box };
    }
    const fallback = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), (this.landmarkMaterial ?? new THREE.MeshStandardMaterial()).clone());
    return { kind: 'object', object: fallback };
  }

  private toCanonicalState(entity: C2Entity): CanonicalVisualState {
    if (entity.visualHint === 'pump-pipe-system') {
      if (typeof entity.scalars?.volumetricFlow === 'number' && entity.scalars.volumetricFlow === 0) return 'FAILURE';
      return 'NORMAL';
    }
    if (entity.id === this.city.hospitalBuildingId) {
      if (entity.scalars?.waterServiceInterrupted === 1) return 'CRITICAL';
      return 'NORMAL';
    }
    return 'INACTIVE';
  }

  private updateVisual(entity: C2Entity, object: THREE_NS.Object3D): void {
    const THREE = this.THREE!;
    const state = this.toCanonicalState(entity);
    object.traverse((node) => {
      const mesh = node as THREE_NS.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as THREE_NS.MeshStandardMaterial | THREE_NS.MeshPhysicalMaterial;
      if (material && 'emissive' in material) applyVisualState(material, THREE, state);
    });
  }

  update(_dt: number): void {
    // Time only advances through explicit step()/triggerPumpFailure() calls (deterministic,
    // testable, and matches this world's own real solver cadence) — never a per-frame auto-tick.
  }

  syncScene(_scene: THREE_NS.Scene, _camera: THREE_NS.PerspectiveCamera): void {
    if (!this.renderer) return;
    const state = getFrameState(this.activeEngine);
    const frame: WorldFrame = {
      time: state.tick,
      entities: state.entities
        .filter((entity) => this.renderedIds.has(entity.id))
        .map((entity) => ({
          id: entity.id,
          // Every rendered entity is placed at its own REAL absolute city-space position, treated
          // as a root (no parentId) — see the module doc's "SCOPED RENDERING" note on why this
          // deliberately does not compose C3's containment hierarchy into relative offsets.
          position: [entity.transform.position.x, entity.transform.position.y, entity.transform.position.z],
          scalars: entity.scalars,
          status: entity.statusLabel,
          grounding: groundingToC2(entity.grounding),
          visualHint: entity.ref.kind,
          visible: true,
        })),
    };
    this.renderer.sync(frame);
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
    };
  }
}
