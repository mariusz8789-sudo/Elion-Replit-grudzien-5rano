import type { EntityRef, GenesisLocation } from '../../events/genesisEvent';

/**
 * C3 — GENESIS WORLD MODEL ENGINE: ECS component contracts.
 *
 * This is deliberately NOT a second entity ontology: `EntityRef` is the same
 * neutral {kind,id} reference already used by `GenesisEvent`
 * (core/events/genesisEvent.ts), and a `WorldModelEntity` is projected into
 * the existing `WorldState`/`WorldEntity` contract (core/world/scientificWorldState.ts)
 * via `bridge/worldFrameState.ts::projectToWorldState`, so C2's existing
 * `ScientificWorldRuntime` and C1's existing `worldContracts.ts` keep being
 * the only render/interaction contracts — C3 only adds the persistent,
 * multi-scale, temporal state that produces them.
 */

/** Level of spatial/physical detail an entity is currently modeled at. */
export type ScaleDomain = 'MACRO_CITY' | 'MESO_LAB' | 'MICRO_MOLECULAR' | 'NANO_ATOMIC';

export const SCALE_DOMAIN_ORDER: readonly ScaleDomain[] = [
  'MACRO_CITY',
  'MESO_LAB',
  'MICRO_MOLECULAR',
  'NANO_ATOMIC',
];

/**
 * Scientific-integrity disclosure required by C3's mission rules:
 *  - GROUNDED_EXACT: produced by a real domain solver with an exact/closed-form update.
 *  - MODEL_ESTIMATE: produced by a real domain solver applying an empirical/approximate model.
 *  - PROCEDURAL_APPROXIMATION: no domain solver registered for this binding; a generic
 *    physical heuristic (e.g. inertial integration) advanced the entity instead.
 *  - UNGROUNDED_APPROXIMATION: the entity carries no domain binding at all — C1 must be
 *    alerted (see `SolverRouter.routeTick().ungrounded`).
 */
export type GroundingLevel =
  | 'GROUNDED_EXACT'
  | 'MODEL_ESTIMATE'
  | 'PROCEDURAL_APPROXIMATION'
  | 'UNGROUNDED_APPROXIMATION';

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface SpatialComponent {
  position: Vector3;
  rotation?: Vector3;
  scale?: Vector3;
  boundingRadius?: number;
}

export type StateOfMatter = 'solid' | 'liquid' | 'gas' | 'plasma';

export interface MaterialPhysicsComponent {
  massKg: number;
  densityKgM3?: number;
  temperatureK?: number;
  pressurePa?: number;
  viscosityPaS?: number;
  stateOfMatter?: StateOfMatter;
  velocityMS?: Vector3;
}

export interface ChemicalComponent {
  smiles?: string;
  formula?: string;
  charge?: number;
  energyStateEv?: number;
  /** Fraction (0..1) of the original substance remaining — the real, solver-computed molecular state (e.g. first-order decay). */
  concentrationFraction?: number;
  /** Reaction kinetics parameters (Arrhenius law) — optional per-substance override of a solver's baseline. */
  activationEnergyKJ?: number;
  preExponentialLog10?: number;
}

/** Linkage to a real Genesis solver (see solvers/solverRouter.ts). `solverId: null` is a declared, honest "no solver exists yet". */
export interface DomainBindingComponent {
  solverId: string | null;
  domainId: string;
}

export interface ScaleComponent {
  level: ScaleDomain;
  /** Containment parent across scales (e.g. molecule -> reactor -> lab -> city). Root entities omit this. */
  parentEntityId?: string;
}

export type EntityId = string;

export function entityId(ref: EntityRef): EntityId {
  return `${ref.kind}:${ref.id}`;
}

/**
 * A C3 world-model entity. Persists independently of whether anything is
 * currently observing/rendering it (rule: "ABSOLUTE PERSISTENCE").
 */
export interface WorldModelEntity {
  readonly id: EntityId;
  readonly ref: EntityRef;
  label: string;
  scale: ScaleComponent;
  spatial?: SpatialComponent;
  physics?: MaterialPhysicsComponent;
  chemical?: ChemicalComponent;
  domainBinding?: DomainBindingComponent;
  /**
   * Generic numeric ledger for real solver output that does not fit the
   * fixed physical components above (e.g. epidemiological compartments
   * S/E/I/R/D). Same role as `ScientificProperty` bags elsewhere in Genesis
   * — a deliberate escape hatch, not a second ontology per domain.
   */
  domainState?: Record<string, number>;
  /** Human-readable, solver-set description of the entity's current qualitative state (e.g. "largely intact"). Display-only — C2/C1 never compute it themselves. */
  statusLabel?: string;
  grounding: GroundingLevel;
  /** Tick this entity's state was last advanced at. */
  updatedAtTick: number;
}

export type WorldModelEntityPatch = Partial<
  Pick<WorldModelEntity, 'label' | 'spatial' | 'physics' | 'chemical' | 'domainBinding' | 'domainState' | 'statusLabel' | 'grounding'>
> & { scale?: Partial<ScaleComponent> };

export function locationOf(entity: WorldModelEntity): GenesisLocation | undefined {
  return entity.spatial ? { x: entity.spatial.position.x, y: entity.spatial.position.y, z: entity.spatial.position.z } : undefined;
}
