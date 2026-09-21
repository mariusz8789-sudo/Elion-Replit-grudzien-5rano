import { describe, expect, it } from 'vitest';
import {
  computeManifestFingerprint, createConstruct, isValidConstructManifest,
  loadConstruct, unloadConstruct, type ConstructItemInput, type ConstructLoaders, type ConstructManifest,
} from '../core/worldModel/construct/construct';

/**
 * GENESIS CONSTRUCT — deterministic staging layer. Unit tests cover the
 * contract in isolation; `constructGenesisScientificCity4.test.ts` proves
 * the real integration (manifest -> load -> real WORLD -> provenance ->
 * unload) against the actual production `buildGenesisScientificCity4`.
 */

function item(overrides: Partial<ConstructItemInput> = {}): ConstructItemInput {
  return {
    itemId: 'item-1', type: 'ASSET', sourceRef: 'ref:item-1', fingerprint: 'fp_item1',
    epistemicStatus: 'SIMULATION', loadOrder: 0,
    ...overrides,
  };
}

function manifest(overrides: Partial<ConstructManifest> = {}): ConstructManifest {
  return {
    constructId: 'construct-1', seed: 42, requestedBy: 'test', timestamp: '2026-09-12T00:00:00.000Z',
    items: [item()],
    ...overrides,
  };
}

describe('isValidConstructManifest — genuine structural validation, never a placeholder', () => {
  it('accepts a well-formed manifest', () => {
    expect(isValidConstructManifest(manifest())).toBe(true);
  });
  it('rejects an empty constructId', () => {
    expect(isValidConstructManifest(manifest({ constructId: '' }))).toBe(false);
  });
  it('rejects a non-finite seed', () => {
    expect(isValidConstructManifest(manifest({ seed: Number.NaN }))).toBe(false);
  });
  it('rejects an empty requestedBy', () => {
    expect(isValidConstructManifest(manifest({ requestedBy: '' }))).toBe(false);
  });
  it('rejects an item with an empty sourceRef', () => {
    expect(isValidConstructManifest(manifest({ items: [item({ sourceRef: '' })] }))).toBe(false);
  });
  it('rejects an item with an empty fingerprint', () => {
    expect(isValidConstructManifest(manifest({ items: [item({ fingerprint: '' })] }))).toBe(false);
  });
  it('rejects duplicate itemIds', () => {
    expect(isValidConstructManifest(manifest({ items: [item({ itemId: 'x' }), item({ itemId: 'x' })] }))).toBe(false);
  });
  it('an empty items array is valid — nothing to load is not malformed', () => {
    expect(isValidConstructManifest(manifest({ items: [] }))).toBe(true);
  });
});

describe('createConstruct / loadConstruct reject an invalid manifest explicitly', () => {
  it('createConstruct throws on an invalid manifest, never silently proceeds', () => {
    expect(() => createConstruct(manifest({ constructId: '' }))).toThrow(/Invalid Construct manifest/);
  });
  it('loadConstruct throws on an invalid manifest before touching any loader', () => {
    let called = false;
    expect(() => loadConstruct(manifest({ constructId: '' }), { ASSET: () => { called = true; return { fingerprint: 'x' }; } })).toThrow();
    expect(called).toBe(false);
  });
});

describe('determinism', () => {
  it('the same manifest twice produces an identical fingerprint', () => {
    const m = manifest();
    expect(computeManifestFingerprint(m)).toBe(computeManifestFingerprint(m));
  });

  it('shuffling item ARRAY ORDER does not change the fingerprint — load order is loadOrder, not position', () => {
    const a = item({ itemId: 'a', loadOrder: 0 });
    const b = item({ itemId: 'b', loadOrder: 1 });
    const forward = manifest({ items: [a, b] });
    const shuffled = manifest({ items: [b, a] });
    expect(computeManifestFingerprint(forward)).toBe(computeManifestFingerprint(shuffled));
  });

  it('changing the seed changes the fingerprint', () => {
    expect(computeManifestFingerprint(manifest({ seed: 42 }))).not.toBe(computeManifestFingerprint(manifest({ seed: 43 })));
  });

  it('changing an item\'s declared fingerprint changes the manifest fingerprint', () => {
    const f1 = computeManifestFingerprint(manifest({ items: [item({ fingerprint: 'fp_a' })] }));
    const f2 = computeManifestFingerprint(manifest({ items: [item({ fingerprint: 'fp_b' })] }));
    expect(f1).not.toBe(f2);
  });

  it('changing an item\'s epistemicStatus changes the manifest fingerprint', () => {
    const f1 = computeManifestFingerprint(manifest({ items: [item({ epistemicStatus: 'SIMULATION' })] }));
    const f2 = computeManifestFingerprint(manifest({ items: [item({ epistemicStatus: 'MODEL' })] }));
    expect(f1).not.toBe(f2);
  });

  it('requestedBy/timestamp do NOT affect the fingerprint — request metadata, not content identity', () => {
    const f1 = computeManifestFingerprint(manifest({ requestedBy: 'alice', timestamp: '2020-01-01T00:00:00.000Z' }));
    const f2 = computeManifestFingerprint(manifest({ requestedBy: 'bob', timestamp: '2099-01-01T00:00:00.000Z' }));
    expect(f1).toBe(f2);
  });

  it('source contains no Date.now()/Math.random() in identity/fingerprint logic', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../core/worldModel/construct/construct.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/Date\.now\(\)/);
    expect(source).not.toMatch(/Math\.random\(\)/);
  });
});

describe('loading state machine', () => {
  it('createConstruct starts EMPTY_CONSTRUCT with nothing loaded', () => {
    const record = createConstruct(manifest());
    expect(record.state).toBe('EMPTY_CONSTRUCT');
    expect(record.loadedItems).toEqual([]);
    expect(record.failedItems).toEqual([]);
  });

  it('every item resolved -> LOADED', () => {
    const loaders: ConstructLoaders = { ASSET: () => ({ fingerprint: 'loaded_fp' }) };
    const record = loadConstruct(manifest(), loaders);
    expect(record.state).toBe('LOADED');
    expect(record.loadedItems).toEqual([{ itemId: 'item-1', type: 'ASSET', sourceRef: 'ref:item-1', epistemicStatus: 'SIMULATION', fingerprint: 'loaded_fp' }]);
    expect(record.failedItems).toEqual([]);
  });

  it('a missing sourceRef (loader returns null) -> PARTIAL_LOADED with a real failedItems entry, never a silent skip', () => {
    const m = manifest({ items: [item({ itemId: 'ok' }), item({ itemId: 'missing', sourceRef: 'ref:missing' })] });
    const loaders: ConstructLoaders = { ASSET: (i) => (i.itemId === 'missing' ? null : { fingerprint: 'fp' }) };
    const record = loadConstruct(m, loaders);
    expect(record.state).toBe('PARTIAL_LOADED');
    expect(record.loadedItems.map((i) => i.itemId)).toEqual(['ok']);
    expect(record.failedItems).toEqual([{ itemId: 'missing', reason: 'Loader for type ASSET could not resolve sourceRef "ref:missing".' }]);
  });

  it('no loader registered for a type -> FAILED, with an honest reason naming the missing loader', () => {
    const record = loadConstruct(manifest(), {});
    expect(record.state).toBe('FAILED');
    expect(record.failedItems).toEqual([{ itemId: 'item-1', reason: 'No loader registered for type ASSET.' }]);
  });

  it('items load in loadOrder, never manifest.items array order', () => {
    const order: string[] = [];
    const m = manifest({ items: [item({ itemId: 'second', loadOrder: 1 }), item({ itemId: 'first', loadOrder: 0 })] });
    loadConstruct(m, { ASSET: (i) => { order.push(i.itemId); return { fingerprint: 'fp' }; } });
    expect(order).toEqual(['first', 'second']);
  });

  it('unloadConstruct returns to EMPTY_CONSTRUCT, clearing loaded/failed items but keeping identity', () => {
    const loaded = loadConstruct(manifest(), { ASSET: () => ({ fingerprint: 'fp' }) });
    const unloaded = unloadConstruct(loaded);
    expect(unloaded.state).toBe('EMPTY_CONSTRUCT');
    expect(unloaded.loadedItems).toEqual([]);
    expect(unloaded.failedItems).toEqual([]);
    expect(unloaded.constructId).toBe(loaded.constructId);
    expect(unloaded.manifestFingerprint).toBe(loaded.manifestFingerprint);
  });

  it('an empty manifest (zero items) loads vacuously to LOADED', () => {
    const record = loadConstruct(manifest({ items: [] }), {});
    expect(record.state).toBe('LOADED');
    expect(record.loadedItems).toEqual([]);
  });
});

describe('epistemic status is structurally impossible to upgrade', () => {
  it('LoadedConstructItem always carries the MANIFEST\'s declared epistemicStatus, regardless of what the loader itself would prefer', () => {
    // The loader's return type cannot even express an epistemicStatus — see ConstructItemLoader's signature.
    const m = manifest({ items: [item({ epistemicStatus: 'FICTIONAL_REFERENCE' })] });
    const record = loadConstruct(m, { ASSET: () => ({ fingerprint: 'fp' }) });
    expect(record.loadedItems[0]!.epistemicStatus).toBe('FICTIONAL_REFERENCE');
  });
});

describe('provenance: WORLD/SIMULATION/TRAINING items all stay traceable', () => {
  it('each loaded item is traceable to its own sourceRef and fingerprint', () => {
    const m = manifest({
      items: [
        item({ itemId: 'w', type: 'WORLD', sourceRef: 'world:1', fingerprint: 'fp_w', loadOrder: 0 }),
        item({ itemId: 's', type: 'SIMULATION', sourceRef: 'sim:1', fingerprint: 'fp_s', loadOrder: 1 }),
        item({ itemId: 't', type: 'TRAINING', sourceRef: 'train:1', fingerprint: 'fp_t', loadOrder: 2 }),
      ],
    });
    const loaders: ConstructLoaders = {
      WORLD: (i) => ({ fingerprint: `loaded_${i.sourceRef}` }),
      SIMULATION: (i) => ({ fingerprint: `loaded_${i.sourceRef}` }),
      TRAINING: (i) => ({ fingerprint: `loaded_${i.sourceRef}` }),
    };
    const record = loadConstruct(m, loaders);
    expect(record.state).toBe('LOADED');
    expect(record.loadedItems).toEqual([
      { itemId: 'w', type: 'WORLD', sourceRef: 'world:1', epistemicStatus: 'SIMULATION', fingerprint: 'loaded_world:1' },
      { itemId: 's', type: 'SIMULATION', sourceRef: 'sim:1', epistemicStatus: 'SIMULATION', fingerprint: 'loaded_sim:1' },
      { itemId: 't', type: 'TRAINING', sourceRef: 'train:1', epistemicStatus: 'SIMULATION', fingerprint: 'loaded_train:1' },
    ]);
  });
});
