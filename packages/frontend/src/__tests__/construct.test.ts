import { describe, expect, it } from 'vitest';
import { canonicalJson, fnv1a } from '../core/events/hash';
import { Construct, computeConstructManifestFingerprint } from '../core/worldModel/construct/construct';
import { buildConstructManifest, type ConstructItem } from '../core/worldModel/construct/constructItem';

/**
 * GENESIS CONSTRUCT — E2E: manifest -> load -> City/WorldRegistry ->
 * provenance/fingerprint -> unload.
 *
 * Exercises the real Variant 1 pipeline (Construct -> WorldRegistry ->
 * genesisScientificCity4.ts), never a mock or a second implementation.
 */
describe('Genesis Construct: manifest -> load -> City/WorldRegistry -> provenance/fingerprint -> unload', () => {
  const cityItem: ConstructItem = {
    itemId: 'city-4-flagship',
    worldType: 'GENESIS_SCIENTIFIC_CITY_4',
    worldId: 'construct-city-4-flagship',
    modelStatus: 'WELL_SUPPORTED_MODEL',
    dataProvenance: 'SIMULATED',
    notes: 'Reference Trinity flagship scenario, loaded via Construct rather than called directly.',
  };

  it('computes a deterministic fingerprint from canonicalJson+fnv1a — the SAME utility used elsewhere, no second hashing scheme', () => {
    const manifest = buildConstructManifest('m1', [cityItem]);
    const expected = fnv1a(canonicalJson(manifest));
    expect(computeConstructManifestFingerprint(manifest)).toBe(expected);
    // Same items, same order -> same fingerprint (deterministic).
    const manifestAgain = buildConstructManifest('m1', [cityItem]);
    expect(computeConstructManifestFingerprint(manifestAgain)).toBe(computeConstructManifestFingerprint(manifest));
  });

  it('reordering items changes the fingerprint (load order is part of the deterministic manifest identity)', () => {
    const other: ConstructItem = { ...cityItem, itemId: 'city-4-second', worldId: 'construct-city-4-second' };
    const forward = buildConstructManifest('m2', [cityItem, other]);
    const reversed = buildConstructManifest('m2', [other, cityItem]);
    expect(computeConstructManifestFingerprint(forward)).not.toBe(computeConstructManifestFingerprint(reversed));
  });

  it('loads a real GenesisScientificCity4 world into the shared WorldRegistry, preserving declared provenance untouched', () => {
    const construct = new Construct();
    const manifest = buildConstructManifest('m3', [cityItem]);
    const result = construct.load(manifest);

    expect(result.manifestFingerprint).toBe(computeConstructManifestFingerprint(manifest));
    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0];
    expect(entry.state).toBe('LOADED');
    expect(entry.error).toBeUndefined();
    // No silent epistemic upgrade: declared axes come back exactly as given.
    expect(entry.item.modelStatus).toBe('WELL_SUPPORTED_MODEL');
    expect(entry.item.dataProvenance).toBe('SIMULATED');

    // Real City 4.0 world, really registered in Construct's shared WorldRegistry (not a private one).
    const world = entry.world!;
    expect(world.base.worldId).toBe('construct-city-4-flagship');
    expect(world.base.validation.ok).toBe(true);
    const stored = construct.registry.load('construct-city-4-flagship');
    expect(stored).toBeDefined();
    expect(stored!.record.worldId).toBe('construct-city-4-flagship');
    expect(construct.registry.list().map((r) => r.worldId)).toContain('construct-city-4-flagship');

    // The world actually runs: advancing it produces the same real cascade City 4.0's own tests assert.
    const engine = world.base.engine;
    engine.advance(1, world.updater);
    expect(engine.graph.getEntity(world.pumpPipeId)).toBeDefined();
  });

  it('unload removes the world from the shared registry and transitions the item to UNLOADED', () => {
    const construct = new Construct();
    const manifest = buildConstructManifest('m4', [cityItem]);
    construct.load(manifest);

    expect(construct.registry.load('construct-city-4-flagship')).toBeDefined();
    const unloaded = construct.unload('city-4-flagship');
    expect(unloaded).toBe(true);
    expect(construct.registry.load('construct-city-4-flagship')).toBeUndefined();
    expect(construct.get('city-4-flagship')?.state).toBe('UNLOADED');
    expect(construct.get('city-4-flagship')?.world).toBeUndefined();

    // Idempotent: unloading again (or an unknown item) is a soft `false`, never a throw.
    expect(construct.unload('city-4-flagship')).toBe(false);
    expect(construct.unload('never-loaded')).toBe(false);
  });

  it('explicit partial failure: a duplicate worldId fails that one item without aborting the rest of the manifest', () => {
    const construct = new Construct();
    const duplicate: ConstructItem = { ...cityItem, itemId: 'city-4-duplicate' }; // same worldId on purpose
    const third: ConstructItem = { ...cityItem, itemId: 'city-4-third', worldId: 'construct-city-4-third' };
    const manifest = buildConstructManifest('m5', [cityItem, duplicate, third]);

    const result = construct.load(manifest);
    expect(result.entries.map((e) => e.state)).toEqual(['LOADED', 'FAILED', 'LOADED']);
    expect(result.entries[1].error).toBeTruthy();
    expect(result.entries[1].world).toBeUndefined();
    // The third item still loaded despite the second one's failure.
    expect(construct.registry.load('construct-city-4-third')).toBeDefined();
  });
});
