import { entityId, type EntityId } from '../../ecs/types';
import type { WorldBlueprintNode, WorldBlueprintRelationship } from '../worldBlueprint';
import { generateBuilding, type GeneratedBuilding } from './buildingGenerator';
import { generateDistricts, type GeneratedDistrict } from './districtGenerator';
import { generateBuildingInterior, type BuildingInterior } from './interiorGenerator';
import { generateCityNavigation, type BuildingForNavigation } from './navigationGenerator';
import { generateParcels, type GeneratedParcel } from './parcelGenerator';
import { generateRoadNetwork, type GeneratedIntersection, type GeneratedRoad } from './roadGenerator';
import { STRUCTURAL_DETAIL_DEFAULTS, type StructuralDetailSpec } from './structuralDetailSpec';

export interface GeometryGenerationResult {
  children: readonly WorldBlueprintNode[];
  relationships: readonly WorldBlueprintRelationship[];
  ids: {
    districtIds: readonly EntityId[];
    parcelIds: readonly EntityId[];
    buildingIds: readonly EntityId[];
    roadIds: readonly EntityId[];
    intersectionIds: readonly EntityId[];
  };
}

interface ParcelWithBuilding {
  parcel: GeneratedParcel;
  building: GeneratedBuilding;
  interior?: BuildingInterior;
}

function buildingNode(entry: ParcelWithBuilding): WorldBlueprintNode {
  const { building, interior } = entry;
  const doorAndStairChildren: WorldBlueprintNode[] = [];
  if (interior) {
    for (const door of interior.doors) {
      doorAndStairChildren.push({
        ref: door.ref,
        label: `Door ${door.ref.id}`,
        scaleLevel: 'ROOM',
        geometry: { kind: 'DOOR', position: door.position, fromRef: door.fromRef, toRef: door.toRef },
      });
    }
    for (const stair of interior.stairs) {
      doorAndStairChildren.push({
        ref: stair.ref,
        label: `Stair ${stair.ref.id}`,
        scaleLevel: 'ROOM',
        geometry: { kind: 'STAIR', position: stair.position, buildingRef: stair.buildingRef, connectsFloorRefs: stair.connectsFloorRefs },
      });
    }
    for (const elevator of interior.elevators) {
      doorAndStairChildren.push({
        ref: elevator.ref,
        label: `Elevator ${elevator.ref.id}`,
        scaleLevel: 'ROOM',
        geometry: { kind: 'ELEVATOR', position: elevator.position, buildingRef: elevator.buildingRef, connectsFloorRefs: elevator.connectsFloorRefs },
      });
    }
  }

  const floorNodes: WorldBlueprintNode[] = (interior?.floors ?? []).map((floor) => {
    const roomNodes: WorldBlueprintNode[] = (interior?.rooms ?? [])
      .filter((room) => room.floorRef.id === floor.ref.id)
      .map((room) => {
        const assetSlotNodes: WorldBlueprintNode[] = (interior?.assetSlots ?? [])
          .filter((slot) => slot.roomRef.id === room.ref.id)
          .map((slot) => ({
            ref: slot.ref,
            label: `Asset Slot: ${slot.slotType}`,
            scaleLevel: 'ROOM' as const,
            geometry: { kind: 'ASSET_SLOT' as const, position: slot.position, roomRef: slot.roomRef, slotType: slot.slotType },
          }));
        return {
          ref: room.ref,
          label: `Room (${room.roomType})`,
          scaleLevel: 'ROOM' as const,
          geometry: { kind: 'ROOM' as const, bounds: room.bounds, roomType: room.roomType, floorRef: room.floorRef, buildingRef: room.buildingRef },
          children: assetSlotNodes.length > 0 ? assetSlotNodes : undefined,
        };
      });
    return {
      ref: floor.ref,
      label: `Floor ${floor.level}`,
      scaleLevel: 'FLOOR' as const,
      geometry: { kind: 'FLOOR' as const, level: floor.level, bounds: floor.bounds, heightM: floor.heightM, buildingRef: floor.buildingRef },
      children: roomNodes,
    };
  });

  return {
    ref: building.ref,
    label: `Building (${building.buildingType})`,
    scaleLevel: 'BUILDING',
    geometry: { kind: 'BUILDING', bounds: building.bounds, buildingType: building.buildingType, floorCount: building.floorCount, parcelRef: building.parcelRef, districtRef: building.districtRef },
    children: [...floorNodes, ...doorAndStairChildren],
  };
}

function parcelNode(entry: ParcelWithBuilding): WorldBlueprintNode {
  return {
    ref: entry.parcel.ref,
    label: `Parcel ${entry.parcel.ref.id}`,
    scaleLevel: 'PARCEL',
    geometry: { kind: 'PARCEL', bounds: entry.parcel.bounds, districtRef: entry.parcel.districtRef },
    children: [buildingNode(entry)],
  };
}

function districtNode(district: GeneratedDistrict, parcelEntries: readonly ParcelWithBuilding[]): WorldBlueprintNode {
  return {
    ref: district.ref,
    label: `District (${district.districtType})`,
    scaleLevel: 'DISTRICT',
    geometry: { kind: 'DISTRICT', bounds: district.bounds, districtType: district.districtType },
    children: parcelEntries.map(parcelNode),
  };
}

function roadNode(road: GeneratedRoad): WorldBlueprintNode {
  return {
    ref: road.ref,
    label: `Road ${road.ref.id}`,
    scaleLevel: 'DISTRICT',
    geometry: { kind: 'ROAD', start: road.start, end: road.end, widthM: road.widthM, roadClass: road.roadClass },
  };
}

function intersectionNode(intersection: GeneratedIntersection): WorldBlueprintNode {
  return {
    ref: intersection.ref,
    label: `Intersection ${intersection.ref.id}`,
    scaleLevel: 'DISTRICT',
    geometry: { kind: 'INTERSECTION', position: intersection.position, connectedRoadRefs: intersection.connectedRoadRefs },
  };
}

/**
 * GEOMETRY FOUNDATION — top-level composer for Phases 3-5 (district bounds,
 * roads, intersections, parcels, buildings, and — when requested — real
 * interiors and a real navigation graph). Produces a `TemplateResult`-
 * shaped fragment (`children`/`relationships`) that `compileSpecification`
 * merges into the SAME compiled blueprint every other template contributes
 * to — this is not a second pipeline, just one more contributor to the
 * existing `Specification -> Blueprint -> Generator -> World` flow.
 *
 * DETERMINISM: grid shapes (district/parcel/road layout) are pure functions
 * of `detail`'s own counts, never the rng; only district TYPE and building
 * TYPE/floor-count consume `rng`, always in district-then-parcel index
 * order, so the same `(worldId, detail, seed)` always yields a byte-
 * identical result, and a different seed only ever changes those two draws
 * (never the structural grid).
 */
export function generateCityGeometry(worldId: string, detail: StructuralDetailSpec, rng: () => number): GeometryGenerationResult {
  const citySizeM = detail.citySizeM ?? STRUCTURAL_DETAIL_DEFAULTS.citySizeM;
  const districtCount = detail.districtCount ?? STRUCTURAL_DETAIL_DEFAULTS.districtCount;
  const parcelsPerDistrict = detail.parcelsPerDistrict ?? STRUCTURAL_DETAIL_DEFAULTS.parcelsPerDistrict;
  const maxFloors = detail.maxFloors ?? STRUCTURAL_DETAIL_DEFAULTS.maxFloors;
  const roomsPerFloorSide = detail.roomsPerFloorSide ?? STRUCTURAL_DETAIL_DEFAULTS.roomsPerFloorSide;

  const layout = generateDistricts(worldId, citySizeM, districtCount, rng);
  const { roads, intersections } = generateRoadNetwork(worldId, citySizeM, layout.cols, layout.rows);

  const districtNodes: WorldBlueprintNode[] = [];
  const parcelIds: EntityId[] = [];
  const buildingIds: EntityId[] = [];
  const buildingsForNav: BuildingForNavigation[] = [];
  let buildingIndex = 0;

  for (const district of layout.districts) {
    const parcels = generateParcels(district, parcelsPerDistrict);
    const entries: ParcelWithBuilding[] = parcels.map((parcel) => {
      const requiredType = detail.requiredBuildingTypes?.[buildingIndex];
      const building = generateBuilding(parcel, district.districtType, maxFloors, rng, requiredType);
      buildingIndex += 1;
      const interior = detail.generateInteriors ? generateBuildingInterior(building, roomsPerFloorSide) : undefined;
      parcelIds.push(entityId(parcel.ref));
      buildingIds.push(entityId(building.ref));
      if (interior) {
        buildingsForNav.push({ building, floors: interior.floors, rooms: interior.rooms, stairs: interior.stairs, elevators: interior.elevators, assetSlots: interior.assetSlots });
      } else {
        buildingsForNav.push({ building, floors: [], rooms: [], stairs: [], elevators: [], assetSlots: [] });
      }
      return { parcel, building, interior };
    });
    districtNodes.push(districtNode(district, entries));
  }

  const roadNodes = roads.map(roadNode);
  const intersectionNodes = intersections.map(intersectionNode);

  const relationships: WorldBlueprintRelationship[] = [];

  const navChildren: WorldBlueprintNode[] = [];
  if (detail.generateNavigation) {
    const navigation = generateCityNavigation(worldId, layout.districts, intersections, buildingsForNav);
    for (const zone of navigation.navZones) {
      navChildren.push({ ref: zone.ref, label: `Nav Zone ${zone.ref.id}`, scaleLevel: 'DISTRICT', geometry: { kind: 'NAV_ZONE', bounds: zone.bounds, walkable: zone.walkable } });
    }
    for (const node of navigation.navNodes) {
      navChildren.push({ ref: node.ref, label: `Nav Node ${node.ref.id}`, scaleLevel: 'DISTRICT', geometry: { kind: 'NAV_NODE', position: node.position, atRef: node.atRef } });
    }
    for (const spawn of navigation.spawnPoints) {
      navChildren.push({ ref: spawn.ref, label: `Spawn Point ${spawn.ref.id}`, scaleLevel: 'DISTRICT', geometry: { kind: 'SPAWN_POINT', position: spawn.position, forKind: spawn.forKind } });
    }
    for (const approach of navigation.approachPoints) {
      navChildren.push({ ref: approach.ref, label: `Approach Point ${approach.ref.id}`, scaleLevel: 'DISTRICT', geometry: { kind: 'APPROACH_POINT', position: approach.position, targetRef: approach.targetRef } });
    }
    for (const interaction of navigation.interactionPoints) {
      navChildren.push({
        ref: interaction.ref,
        label: `Interaction Point ${interaction.ref.id}`,
        scaleLevel: 'DISTRICT',
        geometry: { kind: 'INTERACTION_POINT', position: interaction.position, targetRef: interaction.targetRef, interactionKind: interaction.interactionKind },
      });
    }
    for (const edge of navigation.navEdges) {
      navChildren.push({
        ref: edge.ref,
        label: `Nav Edge ${edge.ref.id}`,
        scaleLevel: 'DISTRICT',
        geometry: { kind: 'NAV_EDGE', fromRef: edge.fromRef, toRef: edge.toRef, costM: edge.costM, mode: edge.mode },
      });
    }
  }

  return {
    children: [...districtNodes, ...roadNodes, ...intersectionNodes, ...navChildren],
    relationships,
    ids: {
      districtIds: layout.districts.map((d) => entityId(d.ref)),
      parcelIds,
      buildingIds,
      roadIds: roads.map((r) => entityId(r.ref)),
      intersectionIds: intersections.map((i) => entityId(i.ref)),
    },
  };
}

export type { StructuralDetailSpec } from './structuralDetailSpec';
