import type { EntityRef } from '../../events/genesisEvent';
import type { EpidemicParams } from '../../epidemic/sir';
import type { ChemistryExperimentOptions } from '../domains/chemistryKinetics';
import type { PumpPipeDefaults } from '../../engineeringGraph/pumpPipe';
import type { ScaleDomain } from '../ecs/types';
import type { WorldBlueprintNode, WorldBlueprintRelationship } from '../generation/worldBlueprint';

/**
 * GENERATIVE SCIENTIFIC WORLD MODEL 2.0 — WORLD SPECIFICATION.
 *
 * A `WorldSpecification` is what a user/agent WANTS to exist and be
 * simulated — "a coastal city with 500k inhabitants, a river, a hospital,
 * a laboratory, and water infrastructure." It is DELIBERATELY a different
 * layer from `WorldBlueprint` (generation/worldBlueprint.ts, the
 * declarative entity-tree description) and `WorldGraph` (the executable
 * ECS state): a specification describes INTENT at the level a person would
 * actually phrase a request, using named templates
 * (specification/templates.ts) and high-level knobs (population size,
 * geography, requested scientific domains) instead of blueprint-node
 * literals. `specification/compiler.ts::compileSpecification` is the ONLY
 * thing that turns one into a `WorldBlueprint` — nothing here touches a
 * `WorldGraph` directly.
 *
 * Every field is DATA, never a function or a side effect: a specification
 * is safe to log, diff, hash, or store, exactly like a `WorldBlueprint` is.
 */

/** The composable base world templates — see specification/templates.ts. A specification MAY request several at once ("CITY + LABORATORY + WATER_SYSTEM"), which the compiler composes into one coherent world, never separate disconnected demos. */
export type WorldTemplateId = 'CITY' | 'LABORATORY' | 'WATER_SYSTEM' | 'EPIDEMIOLOGY' | 'INDUSTRIAL_SITE';

export interface GeographySpec {
  /** Purely structural/topological flags consumed by the CITY template's procedural expansion (specification/templates.ts) — they do not imply a hydrology or terrain solver exists. */
  hasRiver?: boolean;
  coastal?: boolean;
  regionCount?: number;
  districtCount?: number;
  buildingsPerDistrict?: number;
}

export interface PopulationSpec {
  count: number;
  /** Overrides onto `DEFAULT_EPIDEMIC` (core/epidemic/sir.ts) — the same real params the existing EPIDEMIOLOGY domain already accepts, never a second parameter set. */
  epidemicParams?: Partial<EpidemicParams>;
}

/** One requested real scientific subsystem. `required: true` means validation FAILS if Genesis has no real solver for it (see specification/validation.ts) — never a silent substitution. */
export interface ScientificDomainRequest {
  domain: 'chemistry' | 'epidemiology' | 'hydraulics' | 'kinematics';
  required: boolean;
  chemistryOptions?: ChemistryExperimentOptions;
  hydraulicsOptions?: Partial<PumpPipeDefaults>;
}

/** A first-class initial condition on one already-identifiable entity (by `EntityRef`) — e.g. `{target: {kind:'substance', id:'s1'}, path: 'physics.temperatureK', value: 800}`. `path` uses the same dotted-path vocabulary `executeIntervention` already supports (bridge/worldFrameState.ts::parametersToPatch). */
export interface InitialConditionSpec {
  target: EntityRef;
  path: string;
  value: number;
}

/** A DECLARED possible future intervention — data only, applied later by a scenario runner once the world's `TemporalEngine` actually reaches `atTick` (see generation/worldGenerator.ts::applyDueInterventions, which this compiles directly into). */
export interface InterventionSpec {
  atTick: number;
  label: string;
  target: EntityRef;
  parameters: Record<string, number>;
}

/**
 * `'STRICT'`: a `required: true` scientific-domain request with no real
 * solver, or any other unmet requirement, fails validation outright.
 * `'PERMISSIVE'`: unmet non-required requirements are allowed through,
 * honestly marked (`UNGROUNDED_APPROXIMATION`/`statusLabel`) rather than
 * fabricated — the default for a specification that only asks for
 * structure, not necessarily every domain to be real.
 */
export type GroundingExpectation = 'STRICT' | 'PERMISSIVE';

export interface WorldSpecification {
  worldId: string;
  /** Seeds the compiled blueprint's `WorldBlueprint.seed` — same specification + seed always compiles to the same canonical blueprint, hence the same generated world. */
  seed: number;
  /** One or more base templates to compose — see specification/templates.ts. */
  worldType: readonly WorldTemplateId[];
  /** Root structural scale of the generated world (see ecs/types.ts's `ScaleDomain`) — defaults to `'MACRO_CITY'` in the compiler if omitted. */
  scale?: ScaleDomain;
  geography?: GeographySpec;
  population?: PopulationSpec;
  scientificDomains?: readonly ScientificDomainRequest[];
  initialConditions?: readonly InitialConditionSpec[];
  interventions?: readonly InterventionSpec[];
  /**
   * ESCAPE HATCH, not the primary authoring path: one or two ad-hoc entities
   * a template doesn't cover, reusing `WorldBlueprintNode` directly (never a
   * third node ontology). Still compiled by `compileSpecification` like
   * everything else — this does not bypass the compiler or the validation
   * gate. Prefer a template (specification/templates.ts) whenever one fits.
   */
  extraEntities?: readonly WorldBlueprintNode[];
  /** Relationships between named entities (by `EntityRef`) — passed straight through to the compiled `WorldBlueprint.relationships`. */
  relationships?: readonly WorldBlueprintRelationship[];
  /** Descriptive only: how far a scenario runner intends to advance the generated world. Not enforced by the compiler or generator — advancing further or less is still a valid use of the same generated world. */
  temporalHorizonTicks?: number;
  /** Descriptive only: dotted scalar paths (e.g. `'population.I'`) the requester cares about observing — consumed by a scenario runner/test/C1, never enforced or interpreted by the compiler itself. */
  requestedObservables?: readonly string[];
  levelOfDetail?: 'LOW' | 'MEDIUM' | 'HIGH';
  groundingExpectations?: GroundingExpectation;
  provenanceNote?: string;
}
