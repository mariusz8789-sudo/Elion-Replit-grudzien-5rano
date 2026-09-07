import { parametersToPatch } from '../bridge/worldFrameState';
import { entityId, type WorldModelEntity } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';
import { mulberry32, type WorldBlueprint, type WorldBlueprintNode, type WorldBlueprintRelationship } from '../generation/worldBlueprint';
import { generateWorld, type GeneratedWorld } from '../generation/worldGenerator';
import { WORLD_TEMPLATES, type TemplateResult } from './templates';
import { validateSpecification } from './validation';
import { validateWorldInvariants } from './worldInvariants';
import type { WorldSpecification, WorldTemplateId } from './worldSpecification';

/**
 * SPECIFICATION → BLUEPRINT COMPILER.
 *
 * The ONLY thing that turns a `WorldSpecification` into a `WorldBlueprint`.
 * Deterministic (one `mulberry32` PRNG seeded from `spec.seed`, consumed by
 * templates in `spec.worldType`'s own order — same specification always
 * compiles to a canonically identical blueprint), inspectable (the
 * blueprint it returns is the same real contract
 * `generation/worldGenerator.ts::generateWorld` already consumes — nothing
 * here bypasses it), and side-effect-free: `compileSpecification` never
 * touches a `WorldGraph`. The pipeline stays exactly
 * `Specification -> Blueprint -> Generator -> World`.
 *
 * THROWS on an invalid specification (see specification/validation.ts) —
 * consistent with how the rest of this ECS reports a contract violation
 * (`WorldGraph.addEntity`/`addRelationship` also throw), never a silent
 * substitution.
 */
export interface CompiledSpecification {
  blueprint: WorldBlueprint;
  /** Steps to run AFTER `generateWorld(blueprint)` — real solver-bound leaves each template attaches (see specification/templates.ts), plus one step applying `spec.initialConditions`. */
  postGenerate: readonly ((graph: WorldGraph) => void)[];
  /** Every id each requested template created, keyed by template — so a scenario/reference-world caller never has to re-derive or hardcode them independently. */
  templateIds: Partial<Record<WorldTemplateId, TemplateResult['ids']>>;
}

const SCALE_ROOT_KIND: Partial<Record<NonNullable<WorldSpecification['scale']>, string>> = {
  PLANET: 'planet',
  REGION: 'region',
  MACRO_CITY: 'city',
};

export function compileSpecification(spec: WorldSpecification): CompiledSpecification {
  const validation = validateSpecification(spec);
  if (!validation.ok) {
    const summary = validation.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new Error(`WorldSpecification "${spec.worldId}" failed validation: ${summary}`);
  }

  const rng = mulberry32(spec.seed);
  const children: WorldBlueprintNode[] = [];
  // Resolved as a POSTGENERATE step (below), never as `blueprint.relationships` — a relationship
  // may reference an entity a template only attaches AFTER `generateWorld` runs (e.g. a real
  // solver-bound population/substance), so it must not be resolved before that attachment
  // happens. `generateWorld`'s own eager `blueprint.relationships` resolution remains correct
  // and unchanged for blueprint-only callers (see worldModelWorldGenerator.test.ts) — this
  // compiler simply never uses that path itself.
  const relationships: WorldBlueprintRelationship[] = [...(spec.relationships ?? [])];
  const postGenerate: ((graph: WorldGraph) => void)[] = [];
  const templateIds: Partial<Record<WorldTemplateId, TemplateResult['ids']>> = {};

  // Deterministic order: exactly the order `spec.worldType` was authored in — never re-sorted,
  // so the PRNG draw sequence (and hence any jittered structure) is reproducible.
  for (const templateId of spec.worldType) {
    const template = WORLD_TEMPLATES[templateId];
    const result = template(spec, rng);
    children.push(...result.children);
    relationships.push(...result.relationships);
    postGenerate.push(...result.postGenerate);
    templateIds[templateId] = result.ids;
  }

  children.push(...(spec.extraEntities ?? []));

  if (relationships.length > 0) {
    postGenerate.push((graph) => {
      for (const relationship of relationships) {
        graph.addRelationship(entityId(relationship.from), entityId(relationship.to), relationship.kind);
      }
    });
  }

  if ((spec.initialConditions ?? []).length > 0) {
    postGenerate.push((graph) => {
      for (const condition of spec.initialConditions ?? []) {
        const id = entityId(condition.target);
        const current: WorldModelEntity = graph.getEntity(id);
        graph.updateEntity(id, parametersToPatch(current, { [condition.path]: condition.value }));
      }
    });
  }

  const scale = spec.scale ?? 'MACRO_CITY';
  const rootKind = SCALE_ROOT_KIND[scale] ?? 'world';
  const blueprint: WorldBlueprint = {
    worldId: spec.worldId,
    seed: spec.seed,
    startSimulatedTime: 0,
    provenanceNote: spec.provenanceNote ?? `Compiled from WorldSpecification "${spec.worldId}" (templates: ${spec.worldType.join(' + ')}).`,
    root: {
      ref: { kind: rootKind, id: spec.worldId },
      label: `Generated World (${spec.worldType.join(' + ')})`,
      scaleLevel: scale,
      spatial: { position: { x: 0, y: 0, z: 0 } },
      children,
    },
    interventions: spec.interventions,
  };

  return { blueprint, postGenerate, templateIds };
}

export interface SpecifiedWorld {
  graph: GeneratedWorld['graph'];
  generated: GeneratedWorld;
  compiled: CompiledSpecification;
}

/**
 * Convenience end-to-end entry point: compile, generate, and run every
 * `postGenerate` step against the SAME real graph — the same two-phase
 * pattern `domains/genesisCityWorld2.ts` already established by hand, now
 * driven declaratively from a `WorldSpecification`. Validates the
 * resulting graph's structural invariants (specification/worldInvariants.ts)
 * before returning — "fail fast if structurally invalid," never silently
 * hand back a malformed world.
 */
export function generateSpecifiedWorld(spec: WorldSpecification): SpecifiedWorld {
  const compiled = compileSpecification(spec);
  const generated = generateWorld(compiled.blueprint);
  for (const step of compiled.postGenerate) step(generated.graph);

  const invariants = validateWorldInvariants(generated.graph);
  if (!invariants.ok) {
    const summary = invariants.violations.map((v) => (v.entityId ? `${v.entityId}: ${v.message}` : v.message)).join('; ');
    throw new Error(`Generated world "${spec.worldId}" failed structural invariants: ${summary}`);
  }

  return { graph: generated.graph, generated, compiled };
}
