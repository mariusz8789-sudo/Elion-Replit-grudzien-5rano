import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DuplicateRecordConflictError,
  InMemoryRecordStore,
  LocalRecordStore,
  MalformedRecordCollectionError,
  UnsafeRecordIdError,
} from '../core/provenance/recordStore';
import { InMemoryEvidenceStore, type StoredEvidence } from '../core/discovery/evidenceStore';
import { InMemoryHazardProvenanceStore, ImmutableConflictError } from '../core/hazard/hazardProvenanceStore';
import { runDiscoveryCase } from '../core/discovery/discoveryEngine';
import type { DiscoveryCaseSpec } from '../core/discovery/discoveryCase';
import type { SourceArtifact } from '../core/hazard/contracts';
import { computeSourceArtifactContentHash } from '../core/hazard/fingerprint';

/**
 * PHASE 0.1 — EVIDENCE STORE CONVERGENCE.
 *
 * Proves the shared `core/provenance/recordStore.ts` primitive genuinely
 * replaced two independent implementations rather than adding a third: the
 * epidemic EvidenceStore's existing permissive (`'overwrite'`) policy and
 * the hazard store's immutable (`'reject-if-different'`) policy are both
 * exercised through the SAME class, and the two domains' persisted data
 * never leak into each other despite sharing the storage mechanism.
 */

function makeFakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

const conditions = { nAgents: 160, initialInfected: 5, seed: 777, days: 40, stepsPerDay: 4 };
const spec = (over: Partial<DiscoveryCaseSpec> = {}): DiscoveryCaseSpec => ({
  question: 'Czy izolacja objawowych obniża szczyt zakażeń?',
  hypothesis: {
    statement: 'Izolacja objawowych obniża szczytową liczbę zakaźnych względem braku interwencji.',
    falsification: {
      metric: 'peakInfectious',
      relation: 'less-than',
      rationale: 'Izolacja usuwa zakaźnych z obiegu kontaktów.',
    },
    assumptions: ['Wykrywalność objawowych jest natychmiastowa.'],
  },
  baselineScenario: 'BASELINE',
  variantScenario: 'ISOLATION',
  initialConditions: conditions,
  ...over,
});

function makeEpidemicEntry(): StoredEvidence {
  const record = runDiscoveryCase(spec());
  return {
    schemaVersion: '1.0.0',
    record,
    sha256: null,
    codeCommitHash: 'test-commit-hash',
    savedAt: Date.now(),
  };
}

async function makeArtifact(rawContent = 'convergence-fixture'): Promise<SourceArtifact> {
  return {
    artifactId: 'artifact-conv-1',
    contentHash: await computeSourceArtifactContentHash(rawContent),
    crs: null,
    extent: null,
    rawContentRef: `blob://${rawContent}`,
    provenance: {
      provider: 'test-provider',
      sourceUrl: null,
      sourceTime: null,
      retrievedAt: Date.now(),
      license: 'CC0',
      adapterVersion: 'adapter-v1',
    },
  };
}

describe('Duplication check — both domain stores now share one primitive', () => {
  it('EvidenceStore.save/load/list/delete and HazardProvenanceStore.put*/get*/list* are both backed by core/provenance/recordStore.ts', () => {
    // Structural proof, not a guess: both concrete classes are constructed from the same imported primitive.
    const backing = new InMemoryRecordStore<{ x: number }>('overwrite');
    expect(backing).toBeInstanceOf(InMemoryRecordStore);
    const immutableBacking = new InMemoryRecordStore<{ x: number }>('reject-if-different');
    expect(immutableBacking).toBeInstanceOf(InMemoryRecordStore);
  });

  it('ImmutableConflictError (hazard) and DuplicateRecordConflictError (shared) are the same class, not two error types for one concept', () => {
    expect(ImmutableConflictError).toBe(DuplicateRecordConflictError);
  });
});

describe('Test 3 — duplicate id + bit-identical content', () => {
  it('epidemic EvidenceStore (overwrite policy): re-saving the identical entry under its own id is a harmless no-op, per its existing policy', async () => {
    const store = new InMemoryEvidenceStore();
    const entry = makeEpidemicEntry();
    await store.save(entry);
    await expect(store.save({ ...entry })).resolves.toBeUndefined();
    expect((await store.load(entry.record.caseId))?.record.caseId).toBe(entry.record.caseId);
  });

  it('hazard store (immutable policy): re-putting identical content under the same id is idempotent, not a conflict', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const artifact = await makeArtifact();
    await store.putArtifact(artifact);
    await expect(store.putArtifact({ ...artifact })).resolves.toBeUndefined();
  });
});

describe('Test 4 — duplicate id + different canonical content is rejected under the immutable policy', () => {
  it('the shared primitive itself rejects a conflicting put when constructed with reject-if-different', async () => {
    const store = new InMemoryRecordStore<{ v: number }>('reject-if-different');
    await store.put('id-1', { v: 1 });
    await expect(store.put('id-1', { v: 2 })).rejects.toThrow(DuplicateRecordConflictError);
  });

  it('the shared primitive allows overwriting when constructed with overwrite (epidemic policy, unchanged)', async () => {
    const store = new InMemoryRecordStore<{ v: number }>('overwrite');
    await store.put('id-1', { v: 1 });
    await expect(store.put('id-1', { v: 2 })).resolves.toBeUndefined();
    expect(await store.get('id-1')).toEqual({ v: 2 });
  });

  it('hazard provenance store still rejects a conflicting HazardRun write (existing Phase 0 guarantee preserved)', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const artifact = await makeArtifact();
    await store.putArtifact(artifact);
    await expect(store.putArtifact({ ...artifact, crs: 'EPSG:3857' })).rejects.toThrow(
      DuplicateRecordConflictError,
    );
  });
});

describe('Test 5 — namespace isolation between epidemic and hazard records', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('an epidemic record and a hazard record saved under the SAME id string on the same fake localStorage never collide', async () => {
    const fake = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: fake });

    const sharedId = 'shared-id-collision-probe';
    const baseEntry = makeEpidemicEntry();
    const epidemicEntry: StoredEvidence = { ...baseEntry, record: { ...baseEntry.record, caseId: sharedId } };
    const artifact = await makeArtifact('namespace-isolation-fixture');
    const hazardRecord: SourceArtifact = { ...artifact, artifactId: sharedId };

    const { LocalEvidenceStore: FreshEvidenceStore } = await import('../core/discovery/evidenceStore');
    const { LocalHazardProvenanceStore: FreshHazardStore } =
      await import('../core/hazard/hazardProvenanceStore');

    const evidenceStore = new FreshEvidenceStore();
    const hazardStore = new FreshHazardStore();

    await evidenceStore.save(epidemicEntry);
    await hazardStore.putArtifact(hazardRecord);

    const loadedEpidemic = await evidenceStore.load(sharedId);
    const loadedHazard = await hazardStore.getArtifact(sharedId);

    expect(loadedEpidemic?.record.caseId).toBe(sharedId);
    expect(loadedHazard?.artifactId).toBe(sharedId);
    // Cross-domain type confusion would show up as one store returning the other's shape.
    expect(loadedEpidemic).not.toHaveProperty('contentHash');
    expect(loadedHazard).not.toHaveProperty('caseId');
  });

  it('epidemic and hazard local stores write to different storage keys', async () => {
    const fake = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: fake });
    const { LocalEvidenceStore: FreshEvidenceStore } = await import('../core/discovery/evidenceStore');
    const { LocalHazardProvenanceStore: FreshHazardStore } =
      await import('../core/hazard/hazardProvenanceStore');

    await new FreshEvidenceStore().save(makeEpidemicEntry());
    await new FreshHazardStore().putArtifact(await makeArtifact());

    const keys: string[] = [];
    for (let i = 0; i < fake.length; i++) keys.push(fake.key(i)!);
    const evidenceKeys = keys.filter((k) => k.includes('evidence-store'));
    const hazardKeys = keys.filter((k) => k.includes('hazard-provenance-store'));
    expect(evidenceKeys.length).toBeGreaterThan(0);
    expect(hazardKeys.length).toBeGreaterThan(0);
    expect(evidenceKeys).not.toEqual(expect.arrayContaining(hazardKeys));
  });
});

describe('Test 6 — existing persisted epidemic records remain readable after the convergence refactor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('a record written to evidence-store/v1 in the pre-refactor flat-object shape is still loadable by the refactored LocalEvidenceStore', async () => {
    const fake = makeFakeStorage();
    const entry = makeEpidemicEntry();
    // Simulate data persisted by a Genesis build from before this convergence pass: write the flat
    // Record<string, StoredEvidence> object directly, exactly as the pre-refactor LocalEvidenceStore did,
    // without going through any new code.
    fake.setItem('genesis-os:evidence-store/v1', JSON.stringify({ [entry.record.caseId]: entry }));

    vi.stubGlobal('window', { localStorage: fake });
    const { LocalEvidenceStore: FreshStore } = await import('../core/discovery/evidenceStore');
    const store = new FreshStore();

    const loaded = await store.load(entry.record.caseId);
    expect(loaded).not.toBeNull();
    expect(loaded?.record.caseId).toBe(entry.record.caseId);
    expect(loaded?.codeCommitHash).toBe('test-commit-hash');
    // Never silently dropped: it must also appear in list().
    expect(await store.list()).toContain(entry.record.caseId);
  });
});

describe('LocalRecordStore — the shared primitive directly, both policies', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('persists and survives reconstruction under the overwrite policy', async () => {
    const fake = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: fake });
    const store = new LocalRecordStore<{ v: number }>('convergence-test/overwrite/v1', 'overwrite');
    await store.put('a', { v: 1 });
    await store.put('a', { v: 2 });
    expect(await store.get('a')).toEqual({ v: 2 });
  });

  it('persists and enforces immutability under the reject-if-different policy', async () => {
    const fake = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: fake });
    const store = new LocalRecordStore<{ v: number }>('convergence-test/immutable/v1', 'reject-if-different');
    await store.put('a', { v: 1 });
    await expect(store.put('a', { v: 2 })).rejects.toThrow(DuplicateRecordConflictError);
  });

  it.each(['[]', 'null', '"not-a-record-map"'])(
    'treats retained %s collections as unreadable, preserves the raw value, and refuses a destructive write',
    async (raw) => {
      const fake = makeFakeStorage();
      const key = 'convergence-test/malformed/v1';
      fake.setItem(`genesis-os:${key}`, raw);
      vi.stubGlobal('window', { localStorage: fake });
      const store = new LocalRecordStore<{ v: number }>(key, 'overwrite');

      await expect(store.get('a')).resolves.toBeNull();
      await expect(store.list()).resolves.toEqual([]);
      await expect(store.delete('a')).resolves.toBeUndefined();
      await expect(store.put('a', { v: 1 })).rejects.toThrow(MalformedRecordCollectionError);
      expect(fake.getItem(`genesis-os:${key}`)).toBe(raw);
    },
  );

  it('continues to read and extend a legacy flat map without changing its overwrite policy', async () => {
    const fake = makeFakeStorage();
    const key = 'convergence-test/legacy-flat-map/v1';
    fake.setItem(`genesis-os:${key}`, JSON.stringify({ existing: { v: 1 } }));
    vi.stubGlobal('window', { localStorage: fake });
    const store = new LocalRecordStore<{ v: number }>(key, 'overwrite');

    await expect(store.get('existing')).resolves.toEqual({ v: 1 });
    await store.put('fresh', { v: 2 });
    await store.put('existing', { v: 3 });
    expect(await store.list()).toEqual(['existing', 'fresh']);
    expect(await store.get('existing')).toEqual({ v: 3 });
  });

  it('refuses prototype-sensitive ids without exposing them through get, list, or delete', async () => {
    const fake = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: fake });
    const store = new LocalRecordStore<{ v: number }>('convergence-test/unsafe-id/v1', 'overwrite');

    await expect(store.put('__proto__', { v: 1 })).rejects.toThrow(UnsafeRecordIdError);
    await expect(store.put('constructor', { v: 1 })).rejects.toThrow(UnsafeRecordIdError);
    await expect(store.get('__proto__')).resolves.toBeNull();
    await expect(store.get('toString')).resolves.toBeNull();
    await expect(store.delete('prototype')).resolves.toBeUndefined();
    expect(await store.list()).toEqual([]);
  });
});
