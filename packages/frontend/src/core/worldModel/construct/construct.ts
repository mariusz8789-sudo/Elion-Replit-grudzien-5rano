import { canonicalJson, fnv1a } from '../../events/hash';
import { buildGenesisScientificCity4, type GenesisScientificCity4 } from '../domains/genesisScientificCity4';
import { WorldRegistry } from '../persistence/worldRegistry';
import type { ConstructItem, ConstructLoadState, ConstructManifest } from './constructItem';

/**
 * GENESIS CONSTRUCT — the loader + state machine sitting on top of the
 * EXISTING `WorldRegistry`/`genesisScientificCity4.ts` pipeline (Variant 1).
 *
 * Construct itself never generates a world, ticks a solver, or validates a
 * specification — every one of those already exists
 * (`createScientificWorld.ts`, `buildGenesisScientificCity4`,
 * `WorldRegistry`). Construct's own job, and the only thing this file adds,
 * is: read a `ConstructManifest` in DETERMINISTIC order, dispatch each item
 * to the one real builder it knows about, record what happened (including
 * partial failures — never silently swallowed), and let an item be
 * unloaded later.
 */

/** One manifest item's outcome, after `Construct.load` has run it (or attempted to). `world`/`error` are mutually exclusive with the state: only `LOADED` carries a `world`, only `FAILED` carries an `error`. */
export interface ConstructLoadedEntry {
  readonly item: ConstructItem;
  state: ConstructLoadState;
  world?: GenesisScientificCity4;
  error?: string;
}

export interface ConstructLoadResult {
  readonly manifestId: string;
  readonly manifestFingerprint: string;
  readonly entries: readonly ConstructLoadedEntry[];
}

/** `fnv1a(canonicalJson(...))` — the SAME fingerprinting idiom already used by `experimentGraph.ts::graphFingerprint`, Engine 08's `epistemicStateGraph.ts`, and `biotechScientificFingerprint`; Construct introduces no second hashing scheme. Array order in `manifest.items` is preserved by `canonicalJson` (only object keys are sorted), so reordering items — which changes deterministic load order — also changes the fingerprint, as it should. */
export function computeConstructManifestFingerprint(manifest: ConstructManifest): string {
  return fnv1a(canonicalJson(manifest));
}

function buildConstructItem(item: ConstructItem, registry: WorldRegistry): GenesisScientificCity4 {
  switch (item.worldType) {
    case 'GENESIS_SCIENTIFIC_CITY_4':
      return buildGenesisScientificCity4({ ...item.options, worldId: item.worldId, registry });
    default: {
      const exhaustive: never = item.worldType;
      throw new Error(`Unknown ConstructWorldType: ${String(exhaustive)}`);
    }
  }
}

/**
 * Construct: loader + state machine over a shared `WorldRegistry`. Never a
 * second registry/engine — every loaded item's world is registered in the
 * ONE `WorldRegistry` this instance holds (constructor-injected into
 * `buildGenesisScientificCity4` so its own internal `registry.save` writes
 * there, not into a private, unreachable registry).
 */
export class Construct {
  readonly registry: WorldRegistry;
  private readonly entries = new Map<string, ConstructLoadedEntry>();

  constructor(registry: WorldRegistry = new WorldRegistry()) {
    this.registry = registry;
  }

  /**
   * Loads every item in `manifest.items`, IN ORDER. An item that throws is
   * recorded as `FAILED` with the real error message and does NOT stop the
   * remaining items from being attempted — an explicit partial failure,
   * never a silent one and never an all-or-nothing abort. Declared
   * `modelStatus`/`dataProvenance` on each item are carried through to its
   * `ConstructLoadedEntry` completely unchanged (no silent epistemic
   * upgrade): this method never reads, infers, or rewrites either field.
   */
  load(manifest: ConstructManifest): ConstructLoadResult {
    const manifestFingerprint = computeConstructManifestFingerprint(manifest);
    const entries: ConstructLoadedEntry[] = [];
    for (const item of manifest.items) {
      let entry: ConstructLoadedEntry;
      try {
        const world = buildConstructItem(item, this.registry);
        entry = { item, state: 'LOADED', world };
      } catch (err) {
        entry = { item, state: 'FAILED', error: err instanceof Error ? err.message : String(err) };
      }
      this.entries.set(item.itemId, entry);
      entries.push(entry);
    }
    return { manifestId: manifest.manifestId, manifestFingerprint, entries };
  }

  /**
   * Unloads a previously `LOADED` item: unregisters its world from the
   * shared `WorldRegistry` (so its `TemporalEngine` can be garbage
   * collected) and transitions it to `UNLOADED`. Returns `false` (never
   * throws) for an unknown `itemId` or an item that was never `LOADED` —
   * unloading is idempotent, not a hard failure.
   */
  unload(itemId: string): boolean {
    const entry = this.entries.get(itemId);
    if (!entry || entry.state !== 'LOADED' || !entry.world) return false;
    this.registry.remove(entry.world.base.worldId);
    entry.state = 'UNLOADED';
    entry.world = undefined;
    return true;
  }

  get(itemId: string): ConstructLoadedEntry | undefined {
    return this.entries.get(itemId);
  }

  list(): readonly ConstructLoadedEntry[] {
    return [...this.entries.values()];
  }
}
