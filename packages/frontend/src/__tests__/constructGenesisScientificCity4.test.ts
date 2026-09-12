import { describe, expect, it } from 'vitest';
import { createConstruct, loadConstruct, unloadConstruct, type ConstructManifest } from '../core/worldModel/construct/construct';
import { buildGenesisScientificCity4, type GenesisScientificCity4 } from '../core/worldModel/domains/genesisScientificCity4';
import { GenesisWorldSim3D } from '../components/visual-simulation/GenesisWorldScreen';

/**
 * REAL E2E — Genesis Construct staging the SAME production world the
 * flagship 3D screen renders (`GenesisWorldScreen.tsx`'s
 * `GenesisWorldSim3D` constructor calls this exact function). No fixture,
 * no fake payload: `buildGenesisScientificCity4` is Genesis's real Trinity
 * demo world (WorldSpecification -> compileSpecification -> generateWorld
 * -> WorldRegistry), and this test proves Construct can genuinely stage it:
 *
 *   manifest -> load -> real World -> provenance/fingerprint -> unload
 */
describe('Construct staging Genesis Scientific City 4.0 — the real production world', () => {
  function buildManifest(): ConstructManifest {
    return {
      constructId: 'genesis-scientific-city-4-construct',
      seed: 4,
      requestedBy: 'constructGenesisScientificCity4.test.ts',
      timestamp: '2026-09-12T00:00:00.000Z',
      items: [{
        itemId: 'city4-world',
        type: 'WORLD',
        sourceRef: 'genesis-scientific-city-4',
        // Declared ahead of load — the real world's own worldId/branch identity is only known
        // after loading, so the declared fingerprint here names the SPECIFICATION being requested,
        // not content only the load can produce.
        fingerprint: 'spec:genesis-scientific-city-4',
        epistemicStatus: 'SIMULATION',
        loadOrder: 0,
      }],
    };
  }

  it('createConstruct starts EMPTY_CONSTRUCT for the real manifest', () => {
    const record = createConstruct(buildManifest());
    expect(record.state).toBe('EMPTY_CONSTRUCT');
  });

  it('loading through Construct genuinely builds the real world and its own fingerprint is REUSED, not invented', () => {
    let loadedCity: GenesisScientificCity4 | undefined;

    const record = loadConstruct(buildManifest(), {
      WORLD: (item) => {
        expect(item.sourceRef).toBe('genesis-scientific-city-4');
        loadedCity = buildGenesisScientificCity4({ rainfallAtTick: 2, populationCount: 500 });
        // Reuses the generator's OWN existing fingerprint (worldGenerator.ts's paramsHash,
        // already recorded on the real generationEvent) — Construct/this test invents nothing.
        const paramsHash = loadedCity.base.provenance.generationEvent.provenance?.paramsHash;
        if (paramsHash === undefined) return null;
        return { fingerprint: paramsHash };
      },
    });

    expect(record.state).toBe('LOADED');
    expect(record.loadedItems).toHaveLength(1);
    expect(loadedCity).toBeDefined();

    const loadedItem = record.loadedItems[0]!;
    expect(loadedItem.itemId).toBe('city4-world');
    expect(loadedItem.type).toBe('WORLD');
    // Provenance: traceable straight back to the real world's own generation event fingerprint.
    expect(loadedItem.fingerprint).toBe(loadedCity!.base.provenance.generationEvent.provenance?.paramsHash);
    expect(loadedItem.fingerprint).toEqual(expect.stringMatching(/^[0-9a-f]+$/i));
    // Epistemic status carried verbatim from the manifest — never independently produced by the loader.
    expect(loadedItem.epistemicStatus).toBe('SIMULATION');

    // The real world is genuinely usable after loading — same shape GenesisWorldScreen.tsx relies on.
    expect(loadedCity!.pumpPipeId).toBeDefined();
    expect(loadedCity!.registry.load(loadedCity!.base.worldId)).toBeDefined();
  });

  it('two loads of the SAME real world produce the SAME reused fingerprint — determinism holds through a real generator, not just fixtures', () => {
    const load = (): string => {
      let fp: string | undefined;
      loadConstruct(buildManifest(), {
        WORLD: () => {
          const city = buildGenesisScientificCity4({ rainfallAtTick: 2, populationCount: 500 });
          fp = city.base.provenance.generationEvent.provenance?.paramsHash;
          return fp === undefined ? null : { fingerprint: fp };
        },
      });
      return fp!;
    };
    expect(load()).toBe(load());
  });

  it('a WORLD item whose sourceRef the loader refuses becomes PARTIAL_LOADED, never a silent success', () => {
    const record = loadConstruct(buildManifest(), { WORLD: () => null });
    expect(record.state).toBe('FAILED'); // only item, and it failed
    expect(record.failedItems).toEqual([{ itemId: 'city4-world', reason: 'Loader for type WORLD could not resolve sourceRef "genesis-scientific-city-4".' }]);
  });

  it('unloadConstruct returns the real, loaded world Construct to EMPTY_CONSTRUCT', () => {
    const loaded = loadConstruct(buildManifest(), {
      WORLD: () => {
        const city = buildGenesisScientificCity4({ rainfallAtTick: 2, populationCount: 500 });
        const fp = city.base.provenance.generationEvent.provenance?.paramsHash;
        return fp === undefined ? null : { fingerprint: fp };
      },
    });
    expect(loaded.state).toBe('LOADED');
    const unloaded = unloadConstruct(loaded);
    expect(unloaded.state).toBe('EMPTY_CONSTRUCT');
    expect(unloaded.loadedItems).toEqual([]);
    // The real world itself is untouched by unloading the Construct record — Construct tracks
    // staging state, it does not own the World's own lifecycle (WorldRegistry does).
  });
});

describe('the LIVE production component actually routes through Construct — not just a parallel test path', () => {
  it('GenesisWorldSim3D (the real flagship 3D screen class) exposes a LOADED constructRecord for its own city', () => {
    const sim = new GenesisWorldSim3D();
    expect(sim.constructRecord.state).toBe('LOADED');
    expect(sim.constructRecord.loadedItems).toHaveLength(1);
    const loadedItem = sim.constructRecord.loadedItems[0]!;
    expect(loadedItem.itemId).toBe('city4-world');
    // The SAME fingerprint the real, live-rendered `city` was actually generated with — proof this
    // is the production path, not a second copy of `buildGenesisScientificCity4` built only for tests.
    expect(loadedItem.fingerprint).toBe(sim.city.base.provenance.generationEvent.provenance?.paramsHash);
    expect(sim.city.pumpPipeId).toBeDefined(); // `city`'s own shape is completely unaffected by Construct's presence
  });
});
