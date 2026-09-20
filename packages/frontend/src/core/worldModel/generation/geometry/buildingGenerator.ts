import type { EntityRef } from '../../../events/genesisEvent';
import { boundsDepth, boundsWidth, type Bounds2D, type BuildingType, type DistrictType } from '../../ecs/geometry';
import type { GeneratedParcel } from './parcelGenerator';
import { pickWeighted, type WeightedOption } from './weightedPick';

export interface GeneratedBuilding {
  ref: EntityRef;
  bounds: Bounds2D;
  buildingType: BuildingType;
  floorCount: number;
  parcelRef: EntityRef;
  districtRef: EntityRef;
}

/**
 * Which building types a district of each type can produce, and their
 * relative weight — the FIXED counterpart to World Forge's broken
 * district->building-type resolution (generators.ts:27 reconstructed the
 * district via `districts.indexOf(t)` against the wrong array, silently
 * defaulting most buildings to RESIDENTIAL/HOTEL regardless of their real
 * district). Here every parcel already carries its real `districtRef`
 * forward from `generateParcels` — see that file's doc — so this table is
 * looked up directly by the district's own (already-known) type, never
 * reconstructed.
 */
const BUILDING_TYPE_WEIGHTS_BY_DISTRICT: Readonly<Record<DistrictType, readonly WeightedOption<BuildingType>[]>> = {
  RESIDENTIAL: [
    { value: 'RESIDENTIAL', weight: 6 },
    { value: 'COMMERCIAL', weight: 1 },
  ],
  COMMERCIAL: [
    { value: 'COMMERCIAL', weight: 6 },
    { value: 'RESIDENTIAL', weight: 1 },
  ],
  INDUSTRIAL: [
    { value: 'INDUSTRIAL', weight: 5 },
    { value: 'WATER_RESEARCH_FACILITY', weight: 1 },
  ],
  CIVIC: [
    { value: 'CIVIC', weight: 3 },
    { value: 'HOSPITAL', weight: 2 },
    { value: 'LABORATORY', weight: 1 },
    { value: 'RESEARCH_CAMPUS', weight: 1 },
  ],
  PARK: [{ value: 'CIVIC', weight: 1 }],
  MIXED_USE: [
    { value: 'RESIDENTIAL', weight: 3 },
    { value: 'COMMERCIAL', weight: 3 },
    { value: 'CIVIC', weight: 1 },
  ],
  SCIENTIFIC: [
    { value: 'RESEARCH_CAMPUS', weight: 3 },
    { value: 'LABORATORY', weight: 2 },
    { value: 'BIOLOGY_LAB', weight: 1 },
    { value: 'CHEMISTRY_LAB', weight: 1 },
    { value: 'IMAGING_CENTER', weight: 1 },
    { value: 'MICROSCOPY_CENTER', weight: 1 },
    { value: 'BIOMEDICAL_CENTER', weight: 1 },
  ],
};

const MAX_FLOORS_BY_BUILDING_TYPE: Readonly<Record<BuildingType, number>> = {
  RESIDENTIAL: 8,
  COMMERCIAL: 6,
  INDUSTRIAL: 3,
  CIVIC: 5,
  HOSPITAL: 10,
  LABORATORY: 6,
  BIOLOGY_LAB: 6,
  CHEMISTRY_LAB: 6,
  IMAGING_CENTER: 4,
  MICROSCOPY_CENTER: 4,
  RESEARCH_CAMPUS: 5,
  BIOMEDICAL_CENTER: 8,
  WATER_RESEARCH_FACILITY: 3,
};

/**
 * Generates ONE building per parcel, inset from the parcel's edges by a
 * setback margin. `buildingType` is drawn from `districtType`'s real weight
 * table (never World Forge's broken lookup — see this file's own doc), and
 * `floorCount` is capped by BOTH the requested `maxFloorsCap` and the
 * building type's own realistic ceiling. The floor-count rng draw always
 * happens, even when the effective cap collapses to 1, to keep the PRNG
 * sequence position of every later draw fixed across otherwise-identical
 * runs — the same fixed-order convention `worldGenerator.ts::spawnNode`
 * already establishes for generated children.
 */
export function generateBuilding(parcel: GeneratedParcel, districtType: DistrictType, maxFloorsCap: number, rng: () => number): GeneratedBuilding {
  const marginX = Math.min(boundsWidth(parcel.bounds) * 0.4, Math.max(1, boundsWidth(parcel.bounds) * 0.1));
  const marginZ = Math.min(boundsDepth(parcel.bounds) * 0.4, Math.max(1, boundsDepth(parcel.bounds) * 0.1));
  const bounds: Bounds2D = {
    minX: parcel.bounds.minX + marginX,
    maxX: parcel.bounds.maxX - marginX,
    minZ: parcel.bounds.minZ + marginZ,
    maxZ: parcel.bounds.maxZ - marginZ,
  };

  const weights = BUILDING_TYPE_WEIGHTS_BY_DISTRICT[districtType];
  const buildingType = pickWeighted(weights, rng);
  const typeMax = MAX_FLOORS_BY_BUILDING_TYPE[buildingType];
  const cap = Math.max(1, Math.min(Math.floor(maxFloorsCap), typeMax));
  const floorRoll = rng();
  const floorCount = cap <= 1 ? 1 : 1 + Math.floor(floorRoll * cap);

  return {
    ref: { kind: 'building', id: `${parcel.ref.id}-building` },
    bounds,
    buildingType,
    floorCount,
    parcelRef: parcel.ref,
    districtRef: parcel.districtRef,
  };
}
