import { PUMP_PIPE_DEFAULTS } from '../../engineeringGraph/pumpPipe';
import { DEFAULT_EPIDEMIC, type EpidemicParams } from '../../epidemic/sir';
import { withCascades, relationshipCascadeRule, type CascadeRule } from '../cascade/cascadeRules';
import { withEventRules, thresholdCrossingRule, type WorldEventRule } from '../events/worldEventRules';
import type { EntityId, WorldModelEntityPatch } from '../ecs/types';
import type { TemporalUpdater } from '../temporal/temporalEngine';
import { addChemistryLab, addChemistrySubstance, type ChemistryExperimentOptions } from './chemistryKinetics';
import { addPopulation } from './epidemicSEIR';
import { HYDRAULICS_DOMAIN_ID, HYDRAULICS_PUMP_PIPE_SOLVER_ID } from './hydraulicsPumpPipe';
import { makeGenesisCityRouter, makeGenesisCityUpdater } from './genesisCityWorld';
import { generateWorld, type GeneratedWorld } from '../generation/worldGenerator';
import type { WorldBlueprint } from '../generation/worldBlueprint';
import type { WorldGraph } from '../ecs/worldGraph';

/**
 * GENESIS CITY WORLD 2.0 — the canonical World Generation 1.0 reference
 * world: a real multi-scale, multi-domain city GENERATED from a declarative
 * `WorldBlueprint`, not hand-assembled entity-by-entity like
 * genesisCityWorld.ts (v1, still the canonical single-tier demo — kept,
 * not replaced).
 *
 * CITY (generated: districts, buildings, roads — generic structure, honestly
 * UNGROUNDED_APPROXIMATION; no fabricated science at scales nothing solves)
 *  ├── hospital-building -> population (real RK4 SEIR, attached post-generation
 *  │                        via the existing addPopulation — reused, not reimplemented)
 *  ├── chemistry-lab-building -> lab -> substance (real Arrhenius kinetics,
 *  │                        attached post-generation via addChemistryLab/addChemistrySubstance)
 *  ├── water-system-building -> pump-pipe (real hydraulics EngineeringModel,
 *  │                        declared DIRECTLY in the blueprint with its own
 *  │                        domainBinding — proving the generator itself can
 *  │                        attach a real solver contract, not just structure)
 *  └── environmental-context (descriptive only — NOT_MODELED, no solver exists)
 *
 * A real, non-fabricated CASCADE is wired: the pump-pipe entity `feedsInto`
 * the hospital building (a genuine service-dependency relationship, not a
 * scientific coupling); when the real hydraulics solver reports
 * `volumetricFlow <= 0` (an actual re-solved consequence of an
 * intervention, e.g. a flow-rate cut), a `relationshipCascadeRule` flags
 * the hospital building's water service as interrupted — an HONEST
 * qualitative consequence flag, not a second physics simulation.
 *
 * A real, non-fabricated EVENT RULE is wired: `thresholdCrossingRule` emits
 * `epidemiology.outbreak.thresholdcrossed` the first tick the real SEIR
 * solver's own infected compartment crosses a declared threshold.
 */
export interface GenesisCityWorld2Options {
  seed?: number;
  epidemicParams?: EpidemicParams;
  chemistry?: ChemistryExperimentOptions;
  outbreakThreshold?: number;
}

export interface GenesisCityWorld2 {
  graph: WorldGraph;
  generated: GeneratedWorld;
  blueprint: WorldBlueprint;
  cityId: EntityId;
  districtIds: readonly EntityId[];
  roadIds: readonly EntityId[];
  hospitalBuildingId: EntityId;
  populationId: EntityId;
  labBuildingId: EntityId;
  labId: EntityId;
  substanceId: EntityId;
  waterSystemBuildingId: EntityId;
  pumpPipeId: EntityId;
  environmentId: EntityId;
  epidemicParams: EpidemicParams;
  updater: TemporalUpdater;
  eventRules: readonly WorldEventRule[];
  cascadeRules: readonly CascadeRule[];
}

const DISTRICT_COUNT = 3;
const ROAD_COUNT = 4;

function buildBlueprint(options: GenesisCityWorld2Options): WorldBlueprint {
  return {
    worldId: 'genesis-city-2',
    seed: options.seed ?? 1,
    provenanceNote: 'Genesis City World 2.0 — canonical World Generation 1.0 reference world.',
    root: {
      ref: { kind: 'city', id: 'genesis-city-2' },
      label: 'Genesis City 2.0',
      scaleLevel: 'MACRO_CITY',
      spatial: { position: { x: 0, y: 0, z: 0 } },
      // Districts reuse the generic 'REGION' scale at a finer granularity than a top-level world
      // region — C3's scale levels are informational, not a strictly enforced ladder (ecs/types.ts).
      generateChildren: {
        count: DISTRICT_COUNT,
        refKind: 'district',
        refIdPrefix: 'district-',
        label: 'District',
        scaleLevel: 'REGION',
        positionJitter: { base: { x: 0, y: 0, z: 0 }, radius: 40 },
      },
      children: [
        { ref: { kind: 'building', id: 'hospital-building' }, label: 'Hospital Building', scaleLevel: 'BUILDING', spatial: { position: { x: -20, y: 0, z: 0 } } },
        { ref: { kind: 'building', id: 'chemistry-lab-building' }, label: 'Chemistry Lab Building', scaleLevel: 'BUILDING', spatial: { position: { x: 20, y: 0, z: 0 } } },
        {
          ref: { kind: 'building', id: 'water-system-building' },
          label: 'Water System Building',
          scaleLevel: 'BUILDING',
          spatial: { position: { x: 0, y: 0, z: 20 } },
          children: [
            {
              ref: { kind: 'pump-pipe-system', id: 'pump-pipe-1' },
              label: 'City Pump-Pipe System',
              scaleLevel: 'MESO_LAB',
              spatial: { position: { x: 0, y: 0, z: 19 } },
              domainState: { ...PUMP_PIPE_DEFAULTS },
              domainBinding: { solverId: HYDRAULICS_PUMP_PIPE_SOLVER_ID, domainId: HYDRAULICS_DOMAIN_ID },
              grounding: 'MODEL_ESTIMATE',
            },
          ],
        },
        {
          // NOT_MODELED by design: no executable environmental solver exists in Genesis yet —
          // these are descriptive numbers only, never advanced by any solver, never fabricated
          // as if they were. See `grounding: 'UNGROUNDED_APPROXIMATION'` (createEntity's own
          // honest default — left unset here on purpose).
          ref: { kind: 'environment', id: 'city-environment' },
          label: 'City Environmental Context',
          scaleLevel: 'BUILDING',
          domainState: { ambientTemperatureK: 288, windSpeedMS: 3 },
        },
      ],
    },
    // Roads: C3 has no dedicated road/transport-network scale; represented at the same generic
    // structural granularity as a building rather than inventing one. Purely structural, no solver.
    relationships: [{ from: { kind: 'pump-pipe-system', id: 'pump-pipe-1' }, to: { kind: 'building', id: 'hospital-building' }, kind: 'feedsInto' }],
  };
}

// `GenesisEvent.type` must match EVENT_TYPE_PATTERN (dotted lowercase segments, no underscores/hyphens) — see core/events/genesisEvent.ts.
export const OUTBREAK_EVENT_TYPE = 'epidemiology.outbreak.thresholdcrossed';
export const WATER_SERVICE_INTERRUPTED_EVENT_TYPE = 'building.waterservice.interrupted';

function buildEventRules(threshold: number): readonly WorldEventRule[] {
  return [
    thresholdCrossingRule({
      eventType: OUTBREAK_EVENT_TYPE,
      read: (entity) => entity.domainState?.I,
      threshold,
      direction: 'rising',
      cause: 'infected-compartment-threshold',
    }),
  ];
}

function buildCascadeRules(): readonly CascadeRule[] {
  return [
    relationshipCascadeRule({
      triggerEventType: 'hydraulics.pumppipe.step',
      relationshipKind: 'feedsInto',
      direction: 'from',
      deriveEffect: (relatedEntity, triggerEvent) => {
        const flow = triggerEvent.parameters.volumetricFlow;
        if (typeof flow !== 'number' || flow > 0) return undefined; // no interruption while real flow is positive
        if (relatedEntity.domainState?.waterServiceInterrupted === 1) return undefined; // already flagged, not a new event
        const patch: WorldModelEntityPatch = {
          statusLabel: 'Water service interrupted (upstream pump failure)',
          domainState: { ...relatedEntity.domainState, waterServiceInterrupted: 1 },
        };
        return { patch, eventType: WATER_SERVICE_INTERRUPTED_EVENT_TYPE, cause: 'upstream-pump-flow-zero' };
      },
    }),
  ];
}

/** Builds the Genesis City World 2.0 reference world: generated structure + real solver-bound leaves + composed event/cascade rules, ready for a `TemporalEngine`. */
export function buildGenesisCityWorld2(options: GenesisCityWorld2Options = {}): GenesisCityWorld2 {
  const epidemicParams = options.epidemicParams ?? DEFAULT_EPIDEMIC;
  const outbreakThreshold = options.outbreakThreshold ?? 1000;
  const blueprint = buildBlueprint(options);
  const generated = generateWorld(blueprint);
  const graph = generated.graph;

  const cityId = 'city:genesis-city-2';
  const districtIds = Array.from({ length: DISTRICT_COUNT }, (_, i) => `district:district-${i}`);
  const roadIds: EntityId[] = [];
  for (let i = 0; i < ROAD_COUNT; i++) {
    const id = `road:road-${i}`;
    graph.addEntity({
      id,
      ref: { kind: 'road', id: `road-${i}` },
      label: `Road ${i}`,
      scale: { level: 'BUILDING', parentEntityId: cityId },
      spatial: { position: { x: (i - ROAD_COUNT / 2) * 10, y: 0, z: -10 } },
      grounding: 'UNGROUNDED_APPROXIMATION',
      updatedAtTick: 0,
    });
    roadIds.push(id);
  }

  const hospitalBuildingId = 'building:hospital-building';
  const labBuildingId = 'building:chemistry-lab-building';
  const waterSystemBuildingId = 'building:water-system-building';
  const pumpPipeId = 'pump-pipe-system:pump-pipe-1';
  const environmentId = 'environment:city-environment';

  const populationId = addPopulation(graph, { parentEntityId: hospitalBuildingId, scale: 'MESO_LAB', params: epidemicParams });
  const labId = addChemistryLab(graph, { parentEntityId: labBuildingId, position: { x: 20, y: 0, z: 1 } });
  const substanceId = addChemistrySubstance(graph, labId, options.chemistry);

  const router = makeGenesisCityRouter(epidemicParams);
  const baseUpdater = makeGenesisCityUpdater(router);
  const eventRules = buildEventRules(outbreakThreshold);
  const cascadeRules = buildCascadeRules();
  const updater = withCascades(withEventRules(baseUpdater, eventRules), cascadeRules);

  return {
    graph,
    generated,
    blueprint,
    cityId,
    districtIds,
    roadIds,
    hospitalBuildingId,
    populationId,
    labBuildingId,
    labId,
    substanceId,
    waterSystemBuildingId,
    pumpPipeId,
    environmentId,
    epidemicParams,
    updater,
    eventRules,
    cascadeRules,
  };
}
