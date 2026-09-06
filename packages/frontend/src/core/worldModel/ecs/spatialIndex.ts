import type { EntityId, Vector3 } from './types';

/**
 * SPATIAL INDEX 1.0.
 *
 * An adaptive uniform grid backing `WorldGraph.querySpatialContext` —
 * replacing its previous O(n) linear scan, with the EXACT same public
 * result for the same inputs (see `WorldGraph.querySpatialContext`, which
 * always re-filters this index's candidates by the same real distance
 * formula before returning — this index can only ever affect performance,
 * never correctness).
 *
 * DESIGN: cell size is chosen from the CURRENT entity set's bounding box
 * and count at rebuild time (`extent / entityCount^(1/3)`, targeting ~1
 * entity per cell on average) rather than a fixed constant — a fixed cell
 * size tuned for one world's coordinate scale (say, a city spanning tens of
 * units) would be badly wrong for another (a synthetic world spanning
 * thousands), silently degrading a radius query back toward scanning most
 * cells. Rebuilding is a single O(n) bucketing pass — the SAME asymptotic
 * cost as the linear scan it replaces — so even the adversarial case (every
 * entity moves, then one query, every tick) never regresses complexity;
 * `WorldGraph` marks the index dirty on every add/remove and on every
 * `spatial`-touching update, and this class only pays the rebuild cost
 * lazily, on the next query after a dirty mark. Between mutations, repeated
 * queries reuse the built index at genuine sub-linear cost.
 *
 * HONEST LIMITATION: because the cell size is fixed for the lifetime of one
 * build, a world whose spatial distribution changes drastically WITHOUT any
 * add/remove/spatial-update in between (impossible today — position only
 * ever changes via a spatial-touching update, which always marks dirty)
 * cannot go stale. A more advanced future version could additionally
 * revisit cell size using a moving average instead of a fresh bounding-box
 * scan each rebuild; not done here — this is Spatial Index 1.0, not a
 * hand-tuned final version.
 */
export class SpatialIndex {
  private cellSize = 1;
  private readonly cells = new Map<string, Set<EntityId>>();
  private dirty = true;

  markDirty(): void {
    this.dirty = true;
  }

  isDirty(): boolean {
    return this.dirty;
  }

  /** Rebuilds the grid from scratch. O(n) in `entries.length` — the same order as the linear scan this index replaces. */
  rebuild(entries: Iterable<{ id: EntityId; position: Vector3 }>): void {
    this.cells.clear();
    const list = [...entries];
    this.cellSize = computeCellSize(list.map((e) => e.position));
    for (const entry of list) {
      this.bucketFor(entry.position).add(entry.id);
    }
    this.dirty = false;
  }

  /**
   * Every entity id in a cell that could contain a point within `radius` of
   * `point` — a SUPERSET of the true answer (the caller always re-checks
   * real distance), never a subset, by construction: the cell range below
   * covers the query sphere's full axis-aligned bounding box.
   */
  candidatesNear(point: Vector3, radius: number): readonly EntityId[] {
    const minX = Math.floor((point.x - radius) / this.cellSize);
    const maxX = Math.floor((point.x + radius) / this.cellSize);
    const minY = Math.floor((point.y - radius) / this.cellSize);
    const maxY = Math.floor((point.y + radius) / this.cellSize);
    const minZ = Math.floor((point.z - radius) / this.cellSize);
    const maxZ = Math.floor((point.z + radius) / this.cellSize);

    const candidates: EntityId[] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const bucket = this.cells.get(cellKey(x, y, z));
          if (bucket) for (const id of bucket) candidates.push(id);
        }
      }
    }
    return candidates;
  }

  private bucketFor(position: Vector3): Set<EntityId> {
    const key = cellKey(Math.floor(position.x / this.cellSize), Math.floor(position.y / this.cellSize), Math.floor(position.z / this.cellSize));
    let bucket = this.cells.get(key);
    if (!bucket) {
      bucket = new Set();
      this.cells.set(key, bucket);
    }
    return bucket;
  }
}

function cellKey(cx: number, cy: number, cz: number): string {
  return `${cx}:${cy}:${cz}`;
}

/** Targets ~1 entity per cell on average, from the current bounding box — see the class doc comment above for why this isn't a fixed constant. */
function computeCellSize(positions: readonly Vector3[]): number {
  if (positions.length === 0) return 1;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of positions) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
  const cellsPerAxis = Math.max(Math.cbrt(positions.length), 1);
  return Math.max(extent / cellsPerAxis, 1e-6);
}
