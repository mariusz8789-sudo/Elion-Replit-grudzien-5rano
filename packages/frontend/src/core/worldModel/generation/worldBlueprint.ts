import type { EntityRef } from '../../events/genesisEvent';
import type {
  ChemicalComponent,
  DomainBindingComponent,
  GroundingLevel,
  MaterialPhysicsComponent,
  ScaleDomain,
  SpatialComponent,
  Vector3,
} from '../ecs/types';

/**
 * WORLD GENERATION 1.0 — WORLD BLUEPRINT.
 *
 * A `WorldBlueprint` is a pure, declarative description of a world: NOT a
 * second entity ontology. Every node reuses exactly the same component
 * shapes `EntityBlueprint` (ecs/entityFactory.ts) already defines
 * (spatial/physics/chemical/domainBinding/domainState/grounding) — a
 * blueprint node is that same shape, made recursive (`children`) and given
 * a place for declarative bulk generation (`generateChildren`).
 *
 * `WorldGenerator.generateWorld()` (generation/worldGenerator.ts) is the
 * ONLY thing that turns a blueprint into a real `WorldGraph`, via the
 * existing `spawnEntity`/`WorldGraph.addRelationship` — a blueprint itself
 * never touches a graph and is safe to serialize, diff, or hash on its own.
 *
 * DETERMINISM CONTRACT: `generateWorld(blueprint)` called twice with the
 * SAME blueprint (same `seed` included) MUST produce a canonically
 * identical `WorldGraph` (see worldModelWorldGenerator.test.ts). A
 * different `seed` may produce a different, still internally valid, world
 * ONLY where a node declares `generateChildren` with `positionJitter` — a
 * blueprint with no such node is fully deterministic regardless of seed.
 */

/** A generic seeded PRNG (mulberry32) — deterministic: the same seed always produces the same sequence. Never `Math.random()`. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Declarative bulk-generation of `count` structurally identical children
 * under one blueprint node (e.g. "50 buildings in this district") —
 * executed by the generator, never here. Every generated child's identity
 * (`ref`) is a deterministic `${refKind}:${refIdPrefix}${index}`, exactly
 * like any other `EntityRef` — only its OPTIONAL position jitter consumes
 * the blueprint's seeded PRNG.
 */
export interface WorldBlueprintGeneratedChildren {
  count: number;
  refKind: string;
  refIdPrefix: string;
  label: string;
  scaleLevel: ScaleDomain;
  domainBinding?: DomainBindingComponent;
  /** Shared physics TEMPLATE applied identically to every generated child (e.g. a starting velocity for a kinematics-bound population) — not per-child randomized; use `positionJitter` for the one thing that does vary per child. */
  physics?: MaterialPhysicsComponent;
  grounding?: GroundingLevel;
  /** Deterministic seeded jitter around `base`, on x/z, within `radius` — omit for a fixed, unjittered `base` position for every generated child. */
  positionJitter?: { base: Vector3; radius: number };
}

export interface WorldBlueprintNode {
  ref: EntityRef;
  label: string;
  scaleLevel: ScaleDomain;
  spatial?: SpatialComponent;
  physics?: MaterialPhysicsComponent;
  chemical?: ChemicalComponent;
  /** `solverId: null` is a declared, honest "no real solver exists yet for this node" — never omit this to silently mean the same thing. */
  domainBinding?: DomainBindingComponent;
  domainState?: Record<string, number>;
  statusLabel?: string;
  /** Defaults to `'UNGROUNDED_APPROXIMATION'`, same honest default as `createEntity` — see ecs/entityFactory.ts. */
  grounding?: GroundingLevel;
  children?: readonly WorldBlueprintNode[];
  generateChildren?: WorldBlueprintGeneratedChildren;
}

/** A non-hierarchical relationship between two blueprint nodes, resolved by `ref` — mirrors `WorldGraph.addRelationship`, applied after every node exists. */
export interface WorldBlueprintRelationship {
  from: EntityRef;
  to: EntityRef;
  kind: string;
}

/**
 * Declares a possible future intervention on a generated world — DATA only.
 * A blueprint never applies its own interventions (that requires a live,
 * ticking `TemporalEngine`, which does not exist yet at generation time);
 * a scenario runner or test applies one via the existing
 * `bridge/worldFrameState.ts::executeIntervention` once the engine reaches
 * `atTick`. See `applyDueInterventions` in worldGenerator.ts.
 */
export interface WorldBlueprintIntervention {
  atTick: number;
  label: string;
  target: EntityRef;
  parameters: Record<string, number>;
}

export interface WorldBlueprint {
  worldId: string;
  /** Seeds the generator's PRNG — see `mulberry32`. Two generations with the same blueprint (including this seed) are canonically identical. */
  seed: number;
  /** Free-text description of this blueprint's own origin (e.g. "hand-authored reference scenario", "derived from 2024 city census") — carried into the `world.generation.completed` journal event's provenance, never interpreted by the generator itself. */
  provenanceNote?: string;
  /**
   * Which named templates (`specification/templates.ts`) produced this
   * blueprint, in request order — set by `compileSpecification`, never by a
   * hand-authored blueprint (a blueprint built directly, outside the
   * specification pipeline, simply omits this and the generation event's
   * own `parameters.templateIds` is correspondingly absent, exactly as
   * before this field existed).
   *
   * Carried into `world.generation.completed`'s `parameters.templateIds` as
   * STRUCTURED, machine-queryable provenance — `provenanceNote` above
   * already names these templates too, but only inside a free-text sentence
   * a caller auditing the event stream would have to parse, and one a
   * caller-supplied `provenanceNote` can silently omit. This field cannot be
   * silently overridden that way: it is set once, directly from
   * `spec.worldType`, independent of what note text a caller chooses.
   *
   * Deliberately typed as generic `readonly string[]`, not
   * `specification/worldSpecification.ts`'s own `WorldTemplateId` union:
   * `generation/` is the domain-blind layer in the declared
   * `Specification -> Blueprint -> Generator -> World` pipeline and must not
   * import back from `specification/`, which already imports THIS module.
   */
  templateIds?: readonly string[];
  /**
   * The specification's requested level of detail
   * (`WorldSpecification.levelOfDetail`), when this blueprint was compiled
   * from one — carried into `world.generation.completed`'s
   * `parameters.levelOfDetail` for the same reason as `templateIds` above:
   * real, structured provenance for "how coarse or fine was this world asked
   * to be", not reconstructable from the graph's entity count alone (two
   * different templates at the same level of detail produce different
   * counts, and the same template at two levels produces different structure
   * entirely — see `specification/templates.ts::CITY_TEMPLATE`'s own
   * `districtCount`/`buildingsPerDistrict` scaling).
   */
  levelOfDetail?: 'LOW' | 'MEDIUM' | 'HIGH';
  /** World Generation 1.0: seeds `TemporalEngine`'s simulated clock (see temporalEngine.ts's `startSimulatedTime` option). Defaults to 0. */
  startSimulatedTime?: number;
  root: WorldBlueprintNode;
  relationships?: readonly WorldBlueprintRelationship[];
  interventions?: readonly WorldBlueprintIntervention[];
}
