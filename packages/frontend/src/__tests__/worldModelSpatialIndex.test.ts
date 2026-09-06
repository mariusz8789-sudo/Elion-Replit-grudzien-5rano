import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../core/worldModel/generation/worldBlueprint';
import { entityId, type EntityId, type Vector3, type WorldModelEntity } from '../core/worldModel/ecs/types';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';

/**
 * SPATIAL INDEX 1.0 — correctness and benchmark.
 *
 * `WorldGraph.querySpatialContext` is now backed by an adaptive grid
 * (ecs/spatialIndex.ts) instead of an O(n) linear scan, with the exact same
 * public signature and the exact same real-distance contract. This file
 * proves the index returns results IDENTICAL to the original linear scan
 * (reimplemented independently here as `bruteForceNear`, never imported
 * from production code, so a bug shared between the two could not hide
 * this test) at 1k/5k/10k/50k+ entities, stays correct across mutation and
 * cloning, and measures the real before/after cost difference in this run.
 */
function entityAt(id: number, position: Vector3, hasSpatial = true): WorldModelEntity {
  const ref = { kind: 'point', id };
  return {
    id: entityId(ref),
    ref,
    label: `point-${id}`,
    scale: { level: 'MICRO_MOLECULAR' },
    spatial: hasSpatial ? { position } : undefined,
    grounding: 'UNGROUNDED_APPROXIMATION',
    updatedAtTick: 0,
  };
}

function buildRandomGraph(count: number, seed: number, extent: number): { graph: WorldGraph; entities: readonly WorldModelEntity[] } {
  const rng = mulberry32(seed);
  const graph = new WorldGraph();
  const entities: WorldModelEntity[] = [];
  for (let i = 0; i < count; i++) {
    // ~5% of entities have no spatial component at all — querySpatialContext must keep excluding them.
    const hasSpatial = rng() > 0.05;
    const position: Vector3 = { x: (rng() * 2 - 1) * extent, y: (rng() * 2 - 1) * extent, z: (rng() * 2 - 1) * extent };
    const entity = entityAt(i, position, hasSpatial);
    graph.addEntity(entity);
    entities.push(entity);
  }
  return { graph, entities };
}

/** The ORIGINAL linear-scan implementation `querySpatialContext` used before Spatial Index 1.0 — reimplemented independently as the correctness reference. */
function bruteForceNear(entities: readonly WorldModelEntity[], point: Vector3, radius: number): Set<EntityId> {
  const ids = new Set<EntityId>();
  for (const entity of entities) {
    if (!entity.spatial) continue;
    const p = entity.spatial.position;
    const dx = p.x - point.x;
    const dy = p.y - point.y;
    const dz = p.z - point.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= radius) ids.add(entity.id);
  }
  return ids;
}

function randomQueries(seed: number, extent: number, count: number, radiusFraction = 0.3): readonly { point: Vector3; radius: number }[] {
  const rng = mulberry32(seed);
  const queries: { point: Vector3; radius: number }[] = [];
  for (let i = 0; i < count; i++) {
    queries.push({
      point: { x: (rng() * 2 - 1) * extent, y: (rng() * 2 - 1) * extent, z: (rng() * 2 - 1) * extent },
      radius: rng() * extent * radiusFraction,
    });
  }
  return queries;
}

describe.each([1000, 5000, 10000, 50000])('Spatial Index 1.0 correctness at %i entities', (count) => {
  it('returns the exact same entity set as the original linear scan, for many random queries', () => {
    const extent = 100 + count / 10; // a wider world for a larger entity count, like a real generated world would have
    const { graph, entities } = buildRandomGraph(count, 1, extent);
    const queries = randomQueries(2, extent, 15);

    for (const { point, radius } of queries) {
      const indexed = new Set(graph.querySpatialContext(point, radius).map((e) => e.id));
      const reference = bruteForceNear(entities, point, radius);
      expect(indexed).toEqual(reference);
    }
  });

  it('stays correct after entities move, are added, and are removed (index invalidation)', () => {
    const extent = 100 + count / 10;
    const { graph, entities } = buildRandomGraph(count, 3, extent);

    // Move a batch of entities far away.
    const moved = entities.slice(0, Math.min(50, entities.length));
    for (const entity of moved) {
      if (!entity.spatial) continue;
      graph.updateEntity(entity.id, { spatial: { position: { x: extent * 5, y: extent * 5, z: extent * 5 } } });
    }
    // Remove a few, add a few new ones.
    const removed = entities.slice(moved.length, moved.length + 20).map((e) => e.id);
    for (const id of removed) graph.removeEntity(id);
    const added: WorldModelEntity[] = [];
    for (let i = 0; i < 20; i++) {
      const entity = entityAt(1_000_000 + i, { x: 0, y: 0, z: 0 });
      graph.addEntity(entity);
      added.push(entity);
    }

    const liveEntities = graph.listEntities();
    const queries = randomQueries(4, extent, 8);
    for (const { point, radius } of queries) {
      const indexed = new Set(graph.querySpatialContext(point, radius).map((e) => e.id));
      const reference = bruteForceNear(liveEntities, point, radius);
      expect(indexed).toEqual(reference);
    }
    // The newly added cluster at the origin is findable.
    expect(new Set(graph.querySpatialContext({ x: 0, y: 0, z: 0 }, 1).map((e) => e.id))).toEqual(new Set(added.map((e) => e.id)));
  });

  it('a cloned graph indexes and queries independently and correctly', () => {
    const extent = 100 + count / 10;
    const { graph, entities } = buildRandomGraph(count, 5, extent);
    const clone = graph.clone();

    // Mutate only the clone.
    const target = entities[0];
    if (target.spatial) clone.updateEntity(target.id, { spatial: { position: { x: extent * 10, y: 0, z: 0 } } });

    const queryPoint = target.spatial?.position ?? { x: 0, y: 0, z: 0 };
    const originalResult = new Set(graph.querySpatialContext(queryPoint, 0.001).map((e) => e.id));
    const cloneResult = new Set(clone.querySpatialContext(queryPoint, 0.001).map((e) => e.id));
    expect(originalResult.has(target.id)).toBe(true); // untouched original still finds it at its original position
    expect(cloneResult.has(target.id)).toBe(false); // the clone moved its own copy away, independently
  });
});

describe('Spatial Index 1.0 benchmark (before/after, this run/machine)', () => {
  // Two honest scenarios: a "local" query (small radius relative to world extent — the realistic
  // C1 "what's near this point" case the index is actually for) and a "broad" one (a large radius
  // that legitimately matches a big fraction of the world, where any spatial index's advantage
  // over a linear scan naturally shrinks — reported too, not hidden).
  const SCENARIOS = [
    { name: 'local (small radius)', radiusFraction: 0.02 },
    { name: 'broad (large radius)', radiusFraction: 0.3 },
  ] as const;

  for (const scenario of SCENARIOS) {
    it.each([1000, 5000, 10000, 50000])(`measures indexed vs brute-force query cost at %i entities — ${scenario.name}`, (count) => {
      const extent = 100 + count / 10;
      const { graph, entities } = buildRandomGraph(count, 7, extent);
      const queries = randomQueries(8, extent, 30, scenario.radiusFraction);

      // Warm the index once (first query after any mutation always pays one O(n) rebuild —
      // exactly like the very first call in real usage would).
      graph.querySpatialContext(queries[0].point, queries[0].radius);

      const indexedStart = performance.now();
      for (const { point, radius } of queries) graph.querySpatialContext(point, radius);
      const indexedMs = performance.now() - indexedStart;

      const bruteStart = performance.now();
      for (const { point, radius } of queries) bruteForceNear(entities, point, radius);
      const bruteMs = performance.now() - bruteStart;

      console.warn(
        `[C3 Spatial Index 1.0 — measured this run/machine, single sample, not a benchmark suite] ${count} entities, ${queries.length} queries, ${scenario.name}:\n` +
          `  BEFORE (linear scan, reimplemented as reference): ${bruteMs.toFixed(3)}ms total (${(bruteMs / queries.length).toFixed(4)}ms/query)\n` +
          `  AFTER  (Spatial Index 1.0, warm):                  ${indexedMs.toFixed(3)}ms total (${(indexedMs / queries.length).toFixed(4)}ms/query)\n` +
          `  speedup: ${(bruteMs / Math.max(indexedMs, 0.0001)).toFixed(1)}x`,
      );

      expect(indexedMs).toBeGreaterThanOrEqual(0);
      expect(bruteMs).toBeGreaterThanOrEqual(0);
    });
  }
});
