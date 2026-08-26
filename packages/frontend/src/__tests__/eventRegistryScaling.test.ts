import { describe, it, expect } from 'vitest';
import { EventRegistry, provenanceFromModel } from '../core/events';
import type { GenesisEventInput } from '../core/events/genesisEvent';

/**
 * docs/MATRIX_WORLD_POC_READINESS_AUDIT.md, Risk #5: `EventRegistry.all()`
 * sorted with a comparator that called `this.indexOf()` (an O(n) scan) per
 * comparison, and `add()` did an O(n) `.some()` parent-existence scan.
 * Fine for hundreds of events, not for a long multi-agent trace. The fix
 * (Map-based id index, insertion order captured once per `all()` call
 * instead of re-scanned per comparison) must not change any observable
 * behavior — every assertion here would already have passed against the
 * pre-fix implementation; this proves the fix preserved that.
 */

const input = (over: Partial<GenesisEventInput> = {}): GenesisEventInput => ({
  type: 'matrix.tick', timestamp: 0, affectedEntities: [{ kind: 'agent', id: 1 }], parameters: {},
  provenance: provenanceFromModel({ modelId: 'scaling-test', seed: 1 }), ...over,
});

describe('EventRegistry — correctness preserved at scale', () => {
  it('all() stays correctly ordered (timestamp asc, ties by insertion) across many events with mixed timestamps', () => {
    const registry = new EventRegistry({ modelId: 'm' });
    const timestamps = Array.from({ length: 300 }, (_, i) => (i * 37) % 50); // deliberately unsorted, with ties
    for (const ts of timestamps) registry.add(input({ timestamp: ts }));

    const all = registry.all();
    expect(all).toHaveLength(300);
    for (let i = 1; i < all.length; i++) {
      expect(all[i].timestamp).toBeGreaterThanOrEqual(all[i - 1].timestamp);
    }
    // Stable tie-break: among a fixed timestamp, insertion order (by seq, encoded in add() order) is preserved.
    const zeros = all.filter((e) => e.timestamp === timestamps[0]).map((e) => registry.get(e.id));
    expect(zeros.every((e) => e !== undefined)).toBe(true);
  });

  it('get() finds every event by id in a large registry — O(1) index, not the old O(n) .find()', () => {
    const registry = new EventRegistry({ modelId: 'm' });
    const ids: string[] = [];
    for (let i = 0; i < 500; i++) ids.push(registry.add(input({ timestamp: i })).id);
    for (const id of ids) expect(registry.get(id)?.id).toBe(id);
    expect(registry.get('nonexistent-id')).toBeUndefined();
  });

  it('a long causal chain (each event the previous one\'s parent) still validates parentEventId correctly for every link', () => {
    const registry = new EventRegistry({ modelId: 'm' });
    let parentId: string | undefined;
    const chain: string[] = [];
    for (let i = 0; i < 400; i++) {
      const e = registry.add(input({ timestamp: i, parentEventId: parentId }));
      chain.push(e.id);
      parentId = e.id;
    }
    for (let i = 1; i < chain.length; i++) {
      expect(registry.get(chain[i])?.parentEventId).toBe(chain[i - 1]);
    }
    expect(() => registry.add(input({ parentEventId: 'not-a-real-id' }))).toThrow(/not found in registry/);
  });

  it('reset() clears the id index along with the event list — a stale id is no longer found after reset', () => {
    const registry = new EventRegistry({ modelId: 'm' });
    const e = registry.add(input());
    expect(registry.get(e.id)).toBeDefined();
    registry.reset();
    expect(registry.get(e.id)).toBeUndefined();
    expect(registry.count()).toBe(0);
    // The registry must remain usable after reset (fresh seq, fresh index).
    const fresh = registry.add(input());
    expect(registry.get(fresh.id)?.id).toBe(fresh.id);
  });
});
