import type { EntityRef } from '../../events/genesisEvent';
import {
  entityId,
  type ChemicalComponent,
  type DomainBindingComponent,
  type EntityId,
  type GroundingLevel,
  type MaterialPhysicsComponent,
  type ScaleDomain,
  type SpatialComponent,
  type WorldModelEntity,
} from './types';
import type { WorldGraph } from './worldGraph';

/**
 * WORLD GENERATION — the smallest reusable mechanism for constructing an
 * executable world from initial conditions, rather than hand-writing a
 * `WorldModelEntity` object literal per call site (as every domain builder
 * did before this existed — see chemistryKinetics.ts/epidemicSEIR.ts/
 * hydraulicsPumpPipe.ts's own `addX` functions, which remain valid, just no
 * longer the only pattern). One blueprint declares everything a real world
 * needs at construction time: identity, initial state, scale, solver
 * ownership, parent/child placement, and relationships to other entities —
 * see `EntityBlueprint`'s fields, one per schema concept.
 *
 * DETERMINISTIC BY CONSTRUCTION: `id` is always derived from `ref`
 * (`entityId()`, the same derivation everywhere else in this ECS), every
 * other field is either given explicitly or a fixed, documented default —
 * no randomness, no wall-clock read, no counter. The same blueprint always
 * produces a byte-identical entity.
 *
 * HONEST BY DEFAULT: `grounding` defaults to `'UNGROUNDED_APPROXIMATION'`
 * — an entity with no declared `domainBinding` starts (and stays, until a
 * real solver tick says otherwise) flagged as not scientifically modeled,
 * never silently upgraded. This does not invent science; it only removes
 * boilerplate from stating the same honest starting point every domain
 * builder already had to write by hand.
 */
export interface EntityBlueprint {
  ref: EntityRef;
  label: string;
  scaleLevel: ScaleDomain;
  /** Containment parent — the same mechanism `ScaleComponent.parentEntityId` already provides; must already exist in the target graph. */
  parentEntityId?: EntityId;
  spatial?: SpatialComponent;
  physics?: MaterialPhysicsComponent;
  chemical?: ChemicalComponent;
  /** Solver ownership — `solverId: null` is a declared, honest "no solver exists yet," same as elsewhere in this ECS. Omit entirely for a pure container entity. */
  domainBinding?: DomainBindingComponent;
  domainState?: Record<string, number>;
  statusLabel?: string;
  /** Default `'UNGROUNDED_APPROXIMATION'` — override only for an entity that is deliberately grounded from tick zero (e.g. a value copied verbatim from a real measurement, or a container that's intentionally exempt). */
  grounding?: GroundingLevel;
  /** Relationships FROM this new entity to already-existing ones (e.g. `{to: pumpId, kind: 'feedsInto'}`) — applied after the entity itself is added, so every `to` must already exist in the target graph. Only meaningful via `spawnEntity` (`createEntity` alone has no graph to record them in). */
  relationships?: readonly { to: EntityId; kind: string }[];
}

/**
 * Pure construction: builds a fully-formed `WorldModelEntity` from a
 * blueprint. Does not touch a graph or validate that `parentEntityId`/
 * `relationships` targets exist — see `spawnEntity` for the graph-aware
 * version that does.
 */
export function createEntity(blueprint: EntityBlueprint): WorldModelEntity {
  return {
    id: entityId(blueprint.ref),
    ref: blueprint.ref,
    label: blueprint.label,
    scale: { level: blueprint.scaleLevel, parentEntityId: blueprint.parentEntityId },
    spatial: blueprint.spatial,
    physics: blueprint.physics,
    chemical: blueprint.chemical,
    domainBinding: blueprint.domainBinding,
    domainState: blueprint.domainState,
    statusLabel: blueprint.statusLabel,
    grounding: blueprint.grounding ?? 'UNGROUNDED_APPROXIMATION',
    updatedAtTick: 0,
  };
}

/**
 * Constructs an entity from `blueprint` and adds it to `graph` in one
 * call — initial state, scale, solver ownership, parent/child placement,
 * and relationships, all from one deterministic description. Returns the
 * new entity's id. Throws (via `WorldGraph.addEntity`/`addRelationship`)
 * for an unknown `parentEntityId` or relationship target, exactly as
 * calling those APIs by hand already would.
 */
export function spawnEntity(graph: WorldGraph, blueprint: EntityBlueprint): EntityId {
  const entity = createEntity(blueprint);
  graph.addEntity(entity);
  for (const relationship of blueprint.relationships ?? []) {
    graph.addRelationship(entity.id, relationship.to, relationship.kind);
  }
  return entity.id;
}
