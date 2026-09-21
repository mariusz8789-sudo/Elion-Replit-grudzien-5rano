import type { EntityRef } from '../../../events/genesisEvent';
import type { Bounds2D, DistrictType } from '../../ecs/geometry';
import { pickWeighted, type WeightedOption } from './weightedPick';

export interface GeneratedDistrict {
  ref: EntityRef;
  bounds: Bounds2D;
  districtType: DistrictType;
}

export interface DistrictLayout {
  districts: readonly GeneratedDistrict[];
  cols: number;
  rows: number;
  cellWidthM: number;
  cellDepthM: number;
}

const DISTRICT_TYPE_WEIGHTS: readonly WeightedOption<DistrictType>[] = [
  { value: 'RESIDENTIAL', weight: 3 },
  { value: 'COMMERCIAL', weight: 2 },
  { value: 'INDUSTRIAL', weight: 1 },
  { value: 'CIVIC', weight: 1 },
  { value: 'PARK', weight: 1 },
  { value: 'MIXED_USE', weight: 2 },
];

/**
 * Deterministically lays out `districtCount` districts as a grid subdividing
 * a `citySizeM` x `citySizeM` square centered at the origin. Grid SHAPE
 * (cols/rows, and hence every district's bounds) is derived purely from
 * `districtCount` and `citySizeM` — never randomized — so it is reproducible
 * independent of any rng draw; only each district's TYPE consumes the
 * seeded rng, one draw per district, in district-index order.
 */
export function generateDistricts(worldId: string, citySizeM: number, districtCount: number, rng: () => number): DistrictLayout {
  const count = Math.max(1, Math.floor(districtCount));
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const half = citySizeM / 2;
  const cellWidthM = citySizeM / cols;
  const cellDepthM = citySizeM / rows;

  const districts: GeneratedDistrict[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const bounds: Bounds2D = {
      minX: -half + col * cellWidthM,
      maxX: -half + (col + 1) * cellWidthM,
      minZ: -half + row * cellDepthM,
      maxZ: -half + (row + 1) * cellDepthM,
    };
    const districtType = pickWeighted(DISTRICT_TYPE_WEIGHTS, rng);
    districts.push({ ref: { kind: 'district', id: `${worldId}-district-${i}` }, bounds, districtType });
  }

  return { districts, cols, rows, cellWidthM, cellDepthM };
}
