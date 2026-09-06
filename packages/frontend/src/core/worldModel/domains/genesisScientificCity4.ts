import type { EntityId } from '../ecs/types';
import { createScientificWorld, type CreateScientificWorldResult } from '../orchestration/createScientificWorld';
import { WorldRegistry } from '../persistence/worldRegistry';
import type { TemporalUpdater } from '../temporal/temporalEngine';
import {
  buildGenesisScientificCity3Specification,
  buildGenesisScientificCity3Updater,
  GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID,
  type GenesisScientificCity3Options,
} from './genesisScientificCity3';

/**
 * GENESIS SCIENTIFIC CITY 4.0 — the first true Trinity demo (Genesis
 * Scientific World Model 3.0, section 17).
 *
 * The exact same reference scenario as Genesis Scientific City 3.0 —
 * SAME specification, SAME templates, SAME real solvers, SAME rainfall ->
 * pump-trip -> hospital-service -> population-access cascade — but built
 * through the ONE canonical Trinity entry point
 * (`orchestration/createScientificWorld.ts`) instead of City 3.0's own
 * bespoke compile/generate/wrap pipeline, and registered in the real
 * `WorldRegistry` (section 6) rather than handed back as a bare object.
 *
 * This is NOT a second world engine, a second branch system, or a second
 * scenario implementation: `buildGenesisScientificCity3Specification` and
 * `buildGenesisScientificCity3Updater` are reused VERBATIM from City 3.0 —
 * the only new thing here is proving they compose correctly through the
 * Trinity entry point, which is what section 17 actually asks a "first true
 * demo" to demonstrate. (City 4.0 intentionally has no PLANET/REGION
 * ancestor — that wrap is City 3.0's own one-off composition, not part of
 * the generic `WorldSpecification` -> `createScientificWorld` path; the
 * generated CITY-scale entity ids are identical either way, since the wrap
 * only changes the root's ancestry, never a template's own child ids.)
 */
export interface GenesisScientificCity4Options extends GenesisScientificCity3Options {
  worldId?: string;
}

export interface GenesisScientificCity4 {
  base: CreateScientificWorldResult;
  registry: WorldRegistry;
  updater: TemporalUpdater;
  pumpPipeId: EntityId;
  hospitalBuildingId: EntityId;
  populationId: EntityId;
  labId: EntityId;
  substanceId: EntityId;
}

export function buildGenesisScientificCity4(options: GenesisScientificCity4Options = {}): GenesisScientificCity4 {
  const specification = {
    ...buildGenesisScientificCity3Specification(options),
    worldId: options.worldId ?? 'genesis-scientific-city-4',
  };

  const base = createScientificWorld({ kind: 'specification', specification });
  const updater = buildGenesisScientificCity3Updater(specification, options);

  const registry = new WorldRegistry();
  registry.save(base);

  return {
    base,
    registry,
    updater,
    pumpPipeId: GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID,
    hospitalBuildingId: 'building:hospital-building',
    populationId: 'population:city-1',
    labId: 'lab:lab1',
    substanceId: 'substance:s1',
  };
}
