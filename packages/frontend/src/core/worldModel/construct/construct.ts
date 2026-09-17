import { canonicalJson, fnv1a } from '../../events/hash';

/**
 * GENESIS CONSTRUCT — a deterministic staging/container layer for loading
 * heterogeneous Genesis content (worlds, simulations, training scenarios,
 * assets) under one manifest, with real provenance and a real state
 * machine. It is NOT a second world registry, a second scenario engine, a
 * second fingerprint scheme, or a second epistemic vocabulary:
 *
 *  - LOADING is delegated entirely to caller-supplied `ConstructLoaders`.
 *    Construct never knows how to build a WORLD or run a SIMULATION — that
 *    knowledge stays exactly where it already lives (`WorldRegistry`,
 *    `orchestration/createScientificWorld.ts`, `core/simulation/`). A
 *    loader's only job is: resolve `sourceRef`, return the loaded content's
 *    OWN real fingerprint, or `null` if it cannot be resolved.
 *  - FINGERPRINTING reuses `canonicalJson` + `fnv1a` (`core/events/hash.ts`)
 *    verbatim — no new canonicalization, no new hash.
 *  - EPISTEMIC STATUS is carried, never produced. `ConstructItemInput`
 *    declares it (the same untyped field Genesis already writes to
 *    `SavedExperiment.epistemicStatus` — Construct introduces no
 *    competing vocabulary while that field remains unconsolidated); a
 *    `ConstructItemLoader` cannot change it, because `LoadedConstructItem`
 *    copies it verbatim from the manifest rather than accepting it from the
 *    loader's return value — "no upgrade" is structural here, not a
 *    convention a future edit could quietly break.
 */
export const CONSTRUCT_CONTRACT_VERSION = '1.0.0';

export type ConstructItemType = 'WORLD' | 'SIMULATION' | 'TRAINING' | 'ASSET' | 'INTERACTIVE_OBJECT';

export type ConstructState = 'EMPTY_CONSTRUCT' | 'LOADING' | 'LOADED' | 'PARTIAL_LOADED' | 'UNLOADING' | 'FAILED';

export interface ConstructItemInput {
  readonly itemId: string;
  readonly type: ConstructItemType;
  readonly sourceRef: string;
  /** The DECLARED fingerprint of `sourceRef`'s own content, supplied by the caller — never computed by Construct itself. */
  readonly fingerprint: string;
  /** Reuses whatever value Genesis already writes to `SavedExperiment.epistemicStatus`. Construct defines no vocabulary of its own. */
  readonly epistemicStatus: string;
  /** Loading order — the ONLY thing that determines load sequence. Array position in `ConstructManifest.items` never matters. */
  readonly loadOrder: number;
}

export interface ConstructManifest {
  readonly constructId: string;
  readonly seed: number;
  readonly items: readonly ConstructItemInput[];
  readonly requestedBy: string;
  /** Caller-supplied, request-tracking metadata — never read from the wall clock by Construct, and deliberately excluded from `manifestFingerprint` (audit metadata, not content identity — the same reason `criterionFingerprint` excludes a criterion's own prose `rationale`). */
  readonly timestamp: string;
}

export interface LoadedConstructItem {
  readonly itemId: string;
  readonly type: ConstructItemType;
  readonly sourceRef: string;
  /** Copied verbatim from the manifest's own declared value — see the module doc's "structural, not conventional" note. */
  readonly epistemicStatus: string;
  /** The loaded artifact's OWN real fingerprint, as returned by the loader — proof that something was actually resolved, not merely declared. */
  readonly fingerprint: string;
}

export interface FailedConstructItem {
  readonly itemId: string;
  readonly reason: string;
}

export interface ConstructRecord {
  readonly contractVersion: string;
  readonly constructId: string;
  readonly manifestFingerprint: string;
  readonly state: ConstructState;
  readonly loadedItems: readonly LoadedConstructItem[];
  readonly failedItems: readonly FailedConstructItem[];
}

/**
 * Resolves ONE declared item's `sourceRef` into its loaded fingerprint, or
 * `null` when it cannot be resolved. This is the ONLY extension point:
 * Construct calls a loader, it never contains loading logic of its own.
 */
export type ConstructItemLoader = (item: ConstructItemInput) => { readonly fingerprint: string } | null;
export type ConstructLoaders = Partial<Readonly<Record<ConstructItemType, ConstructItemLoader>>>;

/** Deterministic load order: `loadOrder` first, `itemId` as a stable tie-break — never the order items happened to arrive in `manifest.items`. */
function sortedItems(items: readonly ConstructItemInput[]): readonly ConstructItemInput[] {
  return [...items].sort((a, b) => a.loadOrder - b.loadOrder || a.itemId.localeCompare(b.itemId));
}

/**
 * Genuine structural validation — never a placeholder that always returns
 * `true`. Rejects: an empty `constructId`/`requestedBy`, a non-finite
 * `seed`, any item with an empty `itemId`/`sourceRef`/`fingerprint`, and a
 * duplicate `itemId`.
 */
export function isValidConstructManifest(manifest: ConstructManifest): boolean {
  if (manifest.constructId.length === 0) return false;
  if (!Number.isFinite(manifest.seed)) return false;
  if (manifest.requestedBy.length === 0) return false;
  const seenIds = new Set<string>();
  for (const item of manifest.items) {
    if (item.itemId.length === 0 || item.sourceRef.length === 0 || item.fingerprint.length === 0) return false;
    if (seenIds.has(item.itemId)) return false;
    seenIds.add(item.itemId);
  }
  return true;
}

/**
 * `fnv1a(canonicalJson(...))` over the manifest's content — items IN LOAD
 * ORDER, never input array order, so a shuffled-but-identical manifest
 * fingerprints identically. Excludes `requestedBy`/`timestamp` (request
 * metadata, not content identity).
 */
export function computeManifestFingerprint(manifest: ConstructManifest): string {
  const base = {
    contractVersion: CONSTRUCT_CONTRACT_VERSION,
    constructId: manifest.constructId,
    seed: manifest.seed,
    items: sortedItems(manifest.items).map((item) => ({
      itemId: item.itemId, type: item.type, sourceRef: item.sourceRef,
      fingerprint: item.fingerprint, epistemicStatus: item.epistemicStatus,
    })),
  };
  return fnv1a(canonicalJson(base));
}

function assertValid(manifest: ConstructManifest): void {
  if (isValidConstructManifest(manifest)) return;
  throw new Error(
    `Invalid Construct manifest "${manifest.constructId}": constructId/requestedBy must be non-empty, seed must be finite, ` +
    'and every item needs a non-empty itemId/sourceRef/fingerprint with no duplicate itemId.',
  );
}

/** An empty Construct, not yet loaded — `EMPTY_CONSTRUCT`, the state before `loadConstruct` and after `unloadConstruct`. */
export function createConstruct(manifest: ConstructManifest): ConstructRecord {
  assertValid(manifest);
  return {
    contractVersion: CONSTRUCT_CONTRACT_VERSION,
    constructId: manifest.constructId,
    manifestFingerprint: computeManifestFingerprint(manifest),
    state: 'EMPTY_CONSTRUCT',
    loadedItems: [],
    failedItems: [],
  };
}

/**
 * Loads every declared item, in load order, through the caller-supplied
 * `loaders`. An item whose type has no registered loader, or whose loader
 * returns `null`, becomes a `FailedConstructItem` with an honest reason —
 * never silently dropped, and never blocks any other item from loading.
 *
 * Resulting state: `LOADED` when every item resolved (or the manifest
 * declares zero items — vacuously loaded); `PARTIAL_LOADED` when some
 * resolved and some failed; `FAILED` when none resolved and at least one
 * failure was recorded.
 */
export function loadConstruct(manifest: ConstructManifest, loaders: ConstructLoaders): ConstructRecord {
  assertValid(manifest);
  const loadedItems: LoadedConstructItem[] = [];
  const failedItems: FailedConstructItem[] = [];

  for (const item of sortedItems(manifest.items)) {
    const loader = loaders[item.type];
    if (loader === undefined) {
      failedItems.push({ itemId: item.itemId, reason: `No loader registered for type ${item.type}.` });
      continue;
    }
    const resolved = loader(item);
    if (resolved === null) {
      failedItems.push({ itemId: item.itemId, reason: `Loader for type ${item.type} could not resolve sourceRef "${item.sourceRef}".` });
      continue;
    }
    loadedItems.push({ itemId: item.itemId, type: item.type, sourceRef: item.sourceRef, epistemicStatus: item.epistemicStatus, fingerprint: resolved.fingerprint });
  }

  const state: ConstructState = failedItems.length === 0
    ? 'LOADED'
    : loadedItems.length === 0 ? 'FAILED' : 'PARTIAL_LOADED';

  return {
    contractVersion: CONSTRUCT_CONTRACT_VERSION,
    constructId: manifest.constructId,
    manifestFingerprint: computeManifestFingerprint(manifest),
    state, loadedItems, failedItems,
  };
}

/** Unloads a Construct back to `EMPTY_CONSTRUCT` — a pure transition; `manifestFingerprint`/`constructId` survive, `loadedItems`/`failedItems` do not. */
export function unloadConstruct(record: ConstructRecord): ConstructRecord {
  return { ...record, state: 'EMPTY_CONSTRUCT', loadedItems: [], failedItems: [] };
}
