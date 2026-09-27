import { addChemistryLab, addChemistrySubstance } from '../domains/chemistryKinetics';
import { addPopulation } from '../domains/epidemicSEIR';
import { HYDRAULICS_DOMAIN_ID, HYDRAULICS_PUMP_PIPE_SOLVER_ID } from '../domains/hydraulicsPumpPipe';
import { PUMP_PIPE_DEFAULTS } from '../../engineeringGraph/pumpPipe';
import { entityId, type EntityId } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';
import type { WorldBlueprintNode } from '../generation/worldBlueprint';
import { computeEpidemicParamsFor } from './templates';
import type { WorldSpecification } from './worldSpecification';

export interface ScientificFacilityAttachment {
  postGenerate: readonly ((graph: WorldGraph) => void)[];
  ids: { scientificRoomIds: readonly EntityId[] };
}

/** Room types the chemistry solver can occupy — a lab bench or a reactor room, both real generated interior spaces (see generation/geometry/interiorGenerator.ts). */
const CHEMISTRY_ROOM_TYPES = new Set(['LAB_BENCH_ROOM', 'REACTOR_ROOM']);

function collectRooms(nodes: readonly WorldBlueprintNode[], acc: WorldBlueprintNode[]): void {
  for (const node of nodes) {
    if (node.geometry?.kind === 'ROOM') acc.push(node);
    if (node.children) collectRooms(node.children, acc);
  }
}

/**
 * WORLD GENERATION Phase 6 — SCIENTIFIC WORLDS.
 *
 * Attaches REAL, solver-bound scientific entities as children of a REAL
 * generated ROOM (never an entire building — non-negotiable #14), reusing
 * the EXACT SAME builders `LABORATORY_TEMPLATE`/`EPIDEMIOLOGY_TEMPLATE`/
 * `WATER_SYSTEM_TEMPLATE` already use (`addChemistryLab`/
 * `addChemistrySubstance`/`addPopulation`, and the same hydraulics
 * domain/solver ids) — this is not a new science layer, only a new place
 * to anchor the existing one. At most ONE facility per generated building
 * (its first matching room, in tree order), so a large generated city
 * doesn't spawn hundreds of redundant solver instances; a caller that
 * genuinely wants more can still request additional `LABORATORY`/
 * `EPIDEMIOLOGY`/`WATER_SYSTEM` templates the normal way.
 *
 * Pure and side-effect-free itself (like `compileSpecification`): returns
 * `postGenerate` steps to run against the real graph AFTER `generateWorld`,
 * the same two-phase pattern every other template already follows.
 */
export function attachScientificFacilities(spec: WorldSpecification, geometryChildren: readonly WorldBlueprintNode[]): ScientificFacilityAttachment {
  const rooms: WorldBlueprintNode[] = [];
  collectRooms(geometryChildren, rooms);

  const chemistryRequest = spec.scientificDomains?.find((d) => d.domain === 'chemistry');
  const hydraulicsRequest = spec.scientificDomains?.find((d) => d.domain === 'hydraulics');
  const epidemiologyRequest = spec.scientificDomains?.find((d) => d.domain === 'epidemiology');
  const epidemicParams = computeEpidemicParamsFor(spec);

  const postGenerate: ((graph: WorldGraph) => void)[] = [];
  const scientificRoomIds: EntityId[] = [];
  const claimedBuildingIds = new Set<string>();

  for (const room of rooms) {
    if (room.geometry?.kind !== 'ROOM') continue;
    const geometry = room.geometry;
    const buildingId = entityId(geometry.buildingRef);
    if (claimedBuildingIds.has(buildingId)) continue;

    const roomRef = room.ref;
    const roomId = entityId(roomRef);

    if (chemistryRequest && CHEMISTRY_ROOM_TYPES.has(geometry.roomType)) {
      claimedBuildingIds.add(buildingId);
      scientificRoomIds.push(roomId);
      postGenerate.push((graph) => {
        const labId = addChemistryLab(graph, {
          labId: `${roomRef.id}-lab`,
          parentEntityId: roomId,
          label: `${geometry.roomType === 'REACTOR_ROOM' ? 'Reactor' : 'Lab Bench'} (${roomRef.id})`,
        });
        addChemistrySubstance(graph, labId, { ...chemistryRequest.chemistryOptions, substanceId: `${roomRef.id}-substance` });
      });
      continue;
    }

    if (epidemiologyRequest && geometry.roomType === 'WARD') {
      claimedBuildingIds.add(buildingId);
      scientificRoomIds.push(roomId);
      postGenerate.push((graph) => {
        addPopulation(graph, { populationId: `${roomRef.id}-population`, parentEntityId: roomId, scale: 'MESO_LAB', label: `Ward Population (${roomRef.id})`, params: epidemicParams });
      });
      continue;
    }

    if (hydraulicsRequest && geometry.roomType === 'PUMP_ROOM') {
      claimedBuildingIds.add(buildingId);
      scientificRoomIds.push(roomId);
      postGenerate.push((graph) => {
        const pumpPipeRef = { kind: 'pump-pipe-system', id: `${roomRef.id}-pump-pipe` };
        graph.addEntity({
          id: entityId(pumpPipeRef),
          ref: pumpPipeRef,
          label: `Pump-Pipe System (${roomRef.id})`,
          scale: { level: 'MESO_LAB', parentEntityId: roomId },
          spatial: { position: { x: 0, y: 0, z: 0 } },
          domainState: { ...PUMP_PIPE_DEFAULTS, ...hydraulicsRequest.hydraulicsOptions },
          domainBinding: { solverId: HYDRAULICS_PUMP_PIPE_SOLVER_ID, domainId: HYDRAULICS_DOMAIN_ID },
          grounding: 'MODEL_ESTIMATE',
          updatedAtTick: 0,
        });
      });
      continue;
    }
  }

  return { postGenerate, ids: { scientificRoomIds } };
}
