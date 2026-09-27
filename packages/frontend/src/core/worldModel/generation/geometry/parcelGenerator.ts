import type { EntityRef } from '../../../events/genesisEvent';
import { boundsDepth, boundsWidth, type Bounds2D } from '../../ecs/geometry';
import type { GeneratedDistrict } from './districtGenerator';

export interface GeneratedParcel {
  ref: EntityRef;
  bounds: Bounds2D;
  districtRef: EntityRef;
}

/**
 * Subdivides one district's bounds into `parcelsPerDistrict` buildable lots,
 * grid-shaped exactly like `generateDistricts` subdivides the city bounds —
 * purely a function of the district's own bounds and the requested count,
 * never the rng, so parcel COUNT and position are deterministic regardless
 * of seed.
 *
 * Each parcel carries its OWN `districtRef` directly (the district that
 * produced it) rather than requiring any later lookup to rediscover which
 * district it belongs to — this is deliberate: World Forge's building-type
 * bug (generators.ts:27) came from reconstructing that link via
 * `districts.indexOf(...)` against the wrong array after the fact. Carrying
 * the real reference forward from the start makes that entire bug class
 * structurally impossible here.
 */
export function generateParcels(district: GeneratedDistrict, parcelsPerDistrict: number): GeneratedParcel[] {
  const count = Math.max(1, Math.floor(parcelsPerDistrict));
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const { minX, minZ } = district.bounds;
  const cellWidthM = boundsWidth(district.bounds) / cols;
  const cellDepthM = boundsDepth(district.bounds) / rows;

  const parcels: GeneratedParcel[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const bounds: Bounds2D = {
      minX: minX + col * cellWidthM,
      maxX: minX + (col + 1) * cellWidthM,
      minZ: minZ + row * cellDepthM,
      maxZ: minZ + (row + 1) * cellDepthM,
    };
    parcels.push({ ref: { kind: 'parcel', id: `${district.ref.id}-parcel-${i}` }, bounds, districtRef: district.ref });
  }
  return parcels;
}
