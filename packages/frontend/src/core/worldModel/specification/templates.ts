import { PUMP_PIPE_DEFAULTS } from '../../engineeringGraph/pumpPipe';
import { DEFAULT_EPIDEMIC } from '../../epidemic/sir';
import { addChemistryLab, addChemistrySubstance } from '../domains/chemistryKinetics';
import { addPopulation } from '../domains/epidemicSEIR';
import { HYDRAULICS_DOMAIN_ID, HYDRAULICS_PUMP_PIPE_SOLVER_ID } from '../domains/hydraulicsPumpPipe';
import type { EntityId } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';
import type { WorldBlueprintNode, WorldBlueprintRelationship } from '../generation/worldBlueprint';
import type { WorldSpecification } from './worldSpecification';

/**
 * WORLD TEMPLATE SYSTEM.
 *
 * A `WorldTemplate` contributes a COMPOSABLE fragment toward one coherent
 * generated world: blueprint `children` to append under the compiled root,
 * extra `relationships`, and `postGenerate` steps that attach REAL,
 * solver-bound leaf entities to the graph after `generateWorld` runs —
 * exactly the same two-phase pattern `domains/genesisCityWorld2.ts`
 * already established (generic structure via the blueprint, real science
 * via the EXISTING `addPopulation`/`addChemistryLab`/`addChemistrySubstance`
 * builders, never reimplemented here). Multiple templates compose into ONE
 * world because `specification/compiler.ts` merges their `children` under
 * a single root and runs every `postGenerate` step against the SAME
 * generated graph — never separate disconnected demos.
 *
 * Every template uses NAMESPACED, template-specific ids so requesting
 * several at once never collides (e.g. `LABORATORY`'s lab is
 * `lab:lab1`/`substance:s1`; `INDUSTRIAL_SITE`'s own reactor, when
 * requested alongside it, is `lab:industrial-reactor-lab`/
 * `substance:industrial-reactor-substance` — distinct ids, same real
 * chemistry solver).
 */
export interface TemplateResult {
  children: readonly WorldBlueprintNode[];
  relationships: readonly WorldBlueprintRelationship[];
  postGenerate: readonly ((graph: WorldGraph) => void)[];
  /** Ids this template created, keyed by role (e.g. `hospitalBuildingId`, or `cityDistrictIds` for a list) — so the compiler/reference world never has to guess or re-hardcode them independently. */
  ids: Record<string, EntityId | readonly EntityId[]>;
}

export type WorldTemplate = (spec: WorldSpecification, rng: () => number) => TemplateResult;

const EMPTY: Pick<TemplateResult, 'relationships' | 'postGenerate'> = { relationships: [], postGenerate: [] };

/**
 * CITY: procedural districts, buildings, roads, and one environmental-
 * context node — purely structural, honestly ungrounded (no terrain/
 * traffic/weather solver exists in Genesis). Roads are represented at the
 * same generic `BUILDING` structural granularity as a building — C3 has no
 * dedicated road/transport-network scale, and does not fabricate one here.
 */
export const CITY_TEMPLATE: WorldTemplate = (spec, rng) => {
  const geo = spec.geography ?? {};
  const districtCount = geo.districtCount ?? (spec.levelOfDetail === 'HIGH' ? 5 : spec.levelOfDetail === 'LOW' ? 1 : 3);
  const buildingsPerDistrict = geo.buildingsPerDistrict ?? (spec.levelOfDetail === 'HIGH' ? 8 : spec.levelOfDetail === 'LOW' ? 1 : 3);
  const roadCount = spec.levelOfDetail === 'HIGH' ? 8 : spec.levelOfDetail === 'LOW' ? 2 : 4;

  const districts: WorldBlueprintNode[] = [];
  const districtIds: EntityId[] = [];
  const buildingIds: EntityId[] = [];

  for (let d = 0; d < districtCount; d++) {
    const districtId = `district:city-district-${d}`;
    districtIds.push(districtId);
    const buildings: WorldBlueprintNode[] = [];
    for (let b = 0; b < buildingsPerDistrict; b++) {
      const buildingId = `building:city-building-${d}-${b}`;
      buildingIds.push(buildingId);
      buildings.push({
        ref: { kind: 'building', id: `city-building-${d}-${b}` },
        label: `Building ${d}-${b}`,
        scaleLevel: 'BUILDING',
        spatial: { position: { x: (rng() * 2 - 1) * 40, y: 0, z: (rng() * 2 - 1) * 40 } },
      });
    }
    districts.push({
      ref: { kind: 'district', id: `city-district-${d}` },
      label: `District ${d}`,
      scaleLevel: 'REGION',
      spatial: { position: { x: (rng() * 2 - 1) * 80, y: 0, z: (rng() * 2 - 1) * 80 } },
      children: buildings,
    });
  }

  const roadIds: EntityId[] = [];
  const roads: WorldBlueprintNode[] = [];
  for (let r = 0; r < roadCount; r++) {
    const roadId: EntityId = `road:city-road-${r}`;
    roadIds.push(roadId);
    roads.push({
      ref: { kind: 'road', id: `city-road-${r}` },
      label: `Road ${r}`,
      scaleLevel: 'BUILDING',
      spatial: { position: { x: (r - roadCount / 2) * 10, y: 0, z: -10 } },
    });
  }

  const environmentId: EntityId = 'environment:city-environment';
  const environment: WorldBlueprintNode = {
    // Descriptive only — NOT_MODELED: no environmental/weather solver exists in Genesis.
    ref: { kind: 'environment', id: 'city-environment' },
    label: 'City Environmental Context',
    scaleLevel: 'BUILDING',
    domainState: { ambientTemperatureK: 288, windSpeedMS: 3 },
  };

  return {
    children: [...districts, ...roads, environment],
    ...EMPTY,
    ids: { cityDistrictIds: districtIds, cityBuildingIds: buildingIds, cityRoadIds: roadIds, environmentId },
  };
};

/** LABORATORY: a lab building containing a real Arrhenius-kinetics-bound substance (chemistry), attached post-generation via the existing addChemistryLab/addChemistrySubstance. */
export const LABORATORY_TEMPLATE: WorldTemplate = (spec) => {
  const labBuildingId: EntityId = 'building:chemistry-lab-building';
  const labId: EntityId = 'lab:lab1';
  const substanceId: EntityId = 'substance:s1';
  const chemistryRequest = spec.scientificDomains?.find((d) => d.domain === 'chemistry');
  const labChild: WorldBlueprintNode = {
    ref: { kind: 'building', id: 'chemistry-lab-building' },
    label: 'Chemistry Lab Building',
    scaleLevel: 'BUILDING',
    spatial: { position: { x: 20, y: 0, z: 0 } },
  };
  const postGenerate = (graph: WorldGraph): void => {
    addChemistryLab(graph, { labId: 'lab1', parentEntityId: labBuildingId, position: { x: 20, y: 0, z: 1 } });
    addChemistrySubstance(graph, labId, { ...chemistryRequest?.chemistryOptions, substanceId: 's1' });
  };
  return { children: [labChild], relationships: [], postGenerate: [postGenerate], ids: { labBuildingId, labId, substanceId } };
};

/** WATER_SYSTEM: a water-system building containing a real hydraulics-bound pump-pipe system, declared directly in the blueprint (the generator itself attaches the solver binding — no post-generation step needed for this domain). */
export const WATER_SYSTEM_TEMPLATE: WorldTemplate = (spec) => {
  const waterSystemBuildingId: EntityId = 'building:water-system-building';
  const pumpPipeId: EntityId = 'pump-pipe-system:pump-pipe-1';
  const hydraulicsRequest = spec.scientificDomains?.find((d) => d.domain === 'hydraulics');
  const child: WorldBlueprintNode = {
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
        domainState: { ...PUMP_PIPE_DEFAULTS, ...hydraulicsRequest?.hydraulicsOptions },
        domainBinding: { solverId: HYDRAULICS_PUMP_PIPE_SOLVER_ID, domainId: HYDRAULICS_DOMAIN_ID },
        grounding: 'MODEL_ESTIMATE',
      },
    ],
  };
  return { children: [child], ...EMPTY, ids: { waterSystemBuildingId, pumpPipeId } };
};

/** The exact real `EpidemicParams` `EPIDEMIOLOGY_TEMPLATE` derives from a specification — exported so a caller building its own router (e.g. `domains/genesisScientificCity3.ts`, reusing `makeEpidemicSEIRSolver`) never has to re-derive or duplicate this computation. */
export function computeEpidemicParamsFor(spec: WorldSpecification) {
  return { ...DEFAULT_EPIDEMIC, ...spec.population?.epidemicParams, population: spec.population?.count ?? DEFAULT_EPIDEMIC.population };
}

/** EPIDEMIOLOGY: a hospital building containing a real RK4-SEIR-bound population, attached post-generation via the existing addPopulation. */
export const EPIDEMIOLOGY_TEMPLATE: WorldTemplate = (spec) => {
  const hospitalBuildingId: EntityId = 'building:hospital-building';
  const populationId: EntityId = 'population:city-1';
  const epidemicParams = computeEpidemicParamsFor(spec);
  const child: WorldBlueprintNode = {
    ref: { kind: 'building', id: 'hospital-building' },
    label: 'Hospital Building',
    scaleLevel: 'BUILDING',
    spatial: { position: { x: -20, y: 0, z: 0 } },
  };
  const postGenerate = (graph: WorldGraph): void => {
    addPopulation(graph, { parentEntityId: hospitalBuildingId, scale: 'MESO_LAB', params: epidemicParams });
  };
  return { children: [child], relationships: [], postGenerate: [postGenerate], ids: { hospitalBuildingId, populationId } };
};

/**
 * INDUSTRIAL_SITE: an honest structural container with generic equipment
 * (UNGROUNDED_APPROXIMATION — no industrial-process solver exists in
 * Genesis). If a `chemistry` domain is explicitly requested, ALSO attaches
 * a real chemistry-bound reactor via the same reused
 * addChemistryLab/addChemistrySubstance builders, under ids namespaced
 * apart from `LABORATORY_TEMPLATE`'s so both can be requested together.
 */
export const INDUSTRIAL_SITE_TEMPLATE: WorldTemplate = (spec) => {
  const siteBuildingId: EntityId = 'building:industrial-site-building';
  const equipmentId: EntityId = 'equipment:industrial-process-line';
  const chemistryRequest = spec.scientificDomains?.find((d) => d.domain === 'chemistry');

  const child: WorldBlueprintNode = {
    ref: { kind: 'building', id: 'industrial-site-building' },
    label: 'Industrial Site',
    scaleLevel: 'BUILDING',
    spatial: { position: { x: 0, y: 0, z: -30 } },
    children: [
      {
        // Honest structural placeholder: no real industrial-process solver exists yet.
        ref: { kind: 'equipment', id: 'industrial-process-line' },
        label: 'Process Line',
        scaleLevel: 'ROOM',
        spatial: { position: { x: 0, y: 0, z: -31 } },
      },
    ],
  };

  const baseIds: TemplateResult['ids'] = { siteBuildingId, equipmentId };
  if (!chemistryRequest) return { children: [child], ...EMPTY, ids: baseIds };

  const reactorLabId: EntityId = 'lab:industrial-reactor-lab';
  const postGenerate = (graph: WorldGraph): void => {
    const labId = addChemistryLab(graph, { labId: 'industrial-reactor-lab', parentEntityId: siteBuildingId, position: { x: 0, y: 0, z: -32 } });
    addChemistrySubstance(graph, labId, { ...chemistryRequest.chemistryOptions, substanceId: 'industrial-reactor-substance' });
  };
  return { children: [child], relationships: [], postGenerate: [postGenerate], ids: { ...baseIds, reactorLabId } };
};

export const WORLD_TEMPLATES: Record<import('./worldSpecification').WorldTemplateId, WorldTemplate> = {
  CITY: CITY_TEMPLATE,
  LABORATORY: LABORATORY_TEMPLATE,
  WATER_SYSTEM: WATER_SYSTEM_TEMPLATE,
  EPIDEMIOLOGY: EPIDEMIOLOGY_TEMPLATE,
  INDUSTRIAL_SITE: INDUSTRIAL_SITE_TEMPLATE,
};
