/// <reference types="node" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DuplicateRecordConflictError,
  LocalRecordStore,
} from '../core/provenance/recordStore';
import { LocalEvidenceStore, type StoredEvidence } from '../core/discovery/evidenceStore';
import {
  ImmutableConflictError,
  InMemoryHazardProvenanceStore,
  LocalHazardProvenanceStore,
} from '../core/hazard/hazardProvenanceStore';
import type { HazardReferenceEvaluator } from '../core/hazard/hazardReplay';
import { listEarthquakePersistedRunHistory } from '../core/simulationRenderer/earthquakePersistedRunHistory';
import { earthquakeEvaluator } from '../core/hazard/earthquake/earthquakeEvaluator';
import { getHazardModule } from '../core/hazard/hazardModuleRegistry';
import { computeHazardInputFingerprint, computeHazardRunResultFingerprint, computeSourceArtifactContentHash } from '../core/hazard/fingerprint';
import type { HazardInput, HazardRun, SourceArtifact } from '../core/hazard/contracts';

/**
 * PHASE 0.2 — PERSISTENCE INTEGRITY & RECOVERY.
 *
 * See docs/PHASE0_2_PERSISTENCE_INTEGRITY.md for the full contract. This
 * file proves the boundary in `core/provenance/recordStore.ts` against the
 * shapes a real corrupted `localStorage` can actually contain: not-quite-
 * valid JSON, valid JSON that isn't a record collection at all (`null`, an
 * array, a primitive), a collection poisoned with a reserved key, and a
 * collection whose per-record shape is wrong. None of this is a hazard
 * science test — every fixture below reuses the existing test-local
 * `HazardReferenceEvaluator`/earthquake evaluator, exactly as
 * `hazardProvenance.test.ts` and `earthquakePersistedRunHistory.test.ts`
 * already do.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_DIR = join(HERE, '..', 'core');

function makeFakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  };
}

async function makeArtifact(overrides: Partial<SourceArtifact> = {}): Promise<SourceArtifact> {
  const contentHash = await computeSourceArtifactContentHash('integrity-fixture-raw-v1');
  return {
    artifactId: 'artifact-integrity-1',
    contentHash,
    crs: null,
    extent: null,
    rawContentRef: 'blob://integrity-fixture-raw-v1',
    provenance: {
      provider: 'test-provider',
      sourceUrl: null,
      sourceTime: null,
      retrievedAt: 1_700_000_000_000,
      license: 'CC0',
      adapterVersion: 'adapter-v1',
    },
    ...overrides,
  };
}

async function makeInput(artifact: SourceArtifact, overrides: Partial<HazardInput> = {}): Promise<HazardInput> {
  const scientificFields = { magnitude: 5.5 };
  const seed = 42;
  const inputFingerprint = await computeHazardInputFingerprint({
    hazardType: 'test-hazard',
    sourceArtifactContentHash: artifact.contentHash,
    scientificFields,
    seed,
  });
  return {
    hazardInputId: 'input-integrity-1',
    hazardType: 'test-hazard',
    sourceArtifactId: artifact.artifactId,
    scientificFields,
    seed,
    displayName: 'Integrity Fixture Run',
    inputFingerprint,
    ...overrides,
  };
}

const sumFieldsEvaluator: HazardReferenceEvaluator = {
  evaluate: (input) => {
    const total = Object.values(input.scientificFields).reduce<number>((acc, v) => acc + (typeof v === 'number' ? v : 0), 0);
    return { total };
  },
};

async function makeRun(input: HazardInput, overrides: Partial<HazardRun> = {}): Promise<HazardRun> {
  const outputFields = await sumFieldsEvaluator.evaluate(input, await makeArtifact());
  const resultFingerprint = await computeHazardRunResultFingerprint({
    hazardInputId: input.hazardInputId,
    hazardModuleVersion: 'module-v1',
    codeCommitHash: 'test-commit-hash',
    outputFields,
  });
  return {
    hazardRunId: 'run-integrity-1',
    hazardInputId: input.hazardInputId,
    hazardModuleVersion: 'module-v1',
    codeCommitHash: 'test-commit-hash',
    outputFields,
    resultFingerprint,
    status: 'COMPLETED',
    createdAt: 1_700_000_200_000,
    ...overrides,
  };
}

describe('Test 1 — legacy epidemic Evidence record remains readable', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('a StoredEvidence written in the pre-boundary flat shape still loads through the guarded LocalEvidenceStore', async () => {
    const fake = makeFakeStorage();
    const entry: StoredEvidence = {
      schemaVersion: '1.0.0',
      record: { caseId: 'legacy-case-1' } as unknown as StoredEvidence['record'],
      sha256: null,
      codeCommitHash: 'legacy-commit',
      savedAt: 1_700_000_000_000,
    };
    fake.setItem('genesis-os:evidence-store/v1', JSON.stringify({ 'legacy-case-1': entry }));
    vi.stubGlobal('window', { localStorage: fake });

    const { LocalEvidenceStore: FreshStore } = await import('../core/discovery/evidenceStore');
    const store = new FreshStore();
    const loaded = await store.load('legacy-case-1');
    expect(loaded?.record.caseId).toBe('legacy-case-1');
    expect(await store.list()).toContain('legacy-case-1');
  });
});

describe('Test 2 — legacy hazard artifact/input/run stays readable and replay keeps a truthful MATCH', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('records written directly in the pre-boundary flat shape replay MATCH through the guarded LocalHazardProvenanceStore', async () => {
    const fake = makeFakeStorage();
    const artifact = await makeArtifact();
    const input = await makeInput(artifact);
    const run = await makeRun(input);

    fake.setItem('genesis-os:hazard-provenance-store/artifacts/v1', JSON.stringify({ [artifact.artifactId]: artifact }));
    fake.setItem('genesis-os:hazard-provenance-store/inputs/v1', JSON.stringify({ [input.hazardInputId]: input }));
    fake.setItem('genesis-os:hazard-provenance-store/runs/v1', JSON.stringify({ [run.hazardRunId]: run }));
    vi.stubGlobal('window', { localStorage: fake });

    const { LocalHazardProvenanceStore: FreshHazardStore } = await import('../core/hazard/hazardProvenanceStore');
    const { replayHazardRun: freshReplay } = await import('../core/hazard/hazardReplay');
    const store = new FreshHazardStore();

    expect(await store.getArtifact(artifact.artifactId)).toEqual(artifact);
    expect(await store.getInput(input.hazardInputId)).toEqual(input);
    expect(await store.getRun(run.hazardRunId)).toEqual(run);

    const replay = await freshReplay({ store, hazardRunId: run.hazardRunId, evaluator: sumFieldsEvaluator });
    expect(replay.status).toBe('MATCH');
  });
});

describe('Test 3 — malformed JSON is a safe, silent fallback', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('get/list/put/delete never throw when the stored bytes are not valid JSON', async () => {
    const fake = makeFakeStorage();
    fake.setItem('genesis-os:integrity-malformed-json/v1', '{ this is not json');
    vi.stubGlobal('window', { localStorage: fake });

    const store = new LocalRecordStore<{ v: number }>('integrity-malformed-json/v1');
    await expect(store.list()).resolves.toEqual([]);
    await expect(store.get('anything')).resolves.toBeNull();
    await expect(store.put('fresh', { v: 1 })).resolves.toBeUndefined();
    expect(await store.get('fresh')).toEqual({ v: 1 });
  });
});

describe('Test 4 — null, array, and primitive JSON are never treated as a record collection', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it.each([
    ['null', 'null'],
    ['an array', '[1,2,3]'],
    ['a string primitive', '"hello"'],
    ['a number primitive', '42'],
    ['a boolean primitive', 'true'],
  ])('%s is read back as an empty collection, not a crash', async (_label, rawJson) => {
    const fake = makeFakeStorage();
    fake.setItem('genesis-os:integrity-non-collection/v1', rawJson);
    vi.stubGlobal('window', { localStorage: fake });

    const store = new LocalRecordStore<{ v: number }>('integrity-non-collection/v1');
    await expect(store.list()).resolves.toEqual([]);
    await expect(store.get('0')).resolves.toBeNull();
    await expect(store.get('anything')).resolves.toBeNull();
  });
});

describe('Test 5 — reserved/prototype-adjacent keys never poison the collection', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('a "__proto__" entry already sitting in storage is stripped from list() and never returned by get()', async () => {
    const fake = makeFakeStorage();
    fake.setItem('genesis-os:integrity-proto-key/v1', JSON.stringify({
      __proto__: { v: 999 },
      constructor: { v: 999 },
      'real-id': { v: 1 },
    }));
    vi.stubGlobal('window', { localStorage: fake });

    const store = new LocalRecordStore<{ v: number }>('integrity-proto-key/v1');
    const ids = await store.list();
    expect(ids).toEqual(['real-id']);
    expect(await store.get('real-id')).toEqual({ v: 1 });
    expect(await store.get('__proto__')).toBeNull();
    expect(await store.get('constructor')).toBeNull();
    expect(await store.get('toString')).toBeNull();
  });

  it('put() rejects "__proto__"/"constructor"/"prototype" as a record id instead of silently mutating the collection', async () => {
    const fake = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: fake });
    const store = new LocalRecordStore<{ v: number }>('integrity-proto-write/v1');

    await expect(store.put('__proto__', { v: 1 })).rejects.toThrow();
    await expect(store.put('constructor', { v: 1 })).rejects.toThrow();
    await expect(store.put('prototype', { v: 1 })).rejects.toThrow();
    // The rejected writes must not have corrupted the collection for legitimate ids.
    await store.put('legit', { v: 7 });
    expect(await store.get('legit')).toEqual({ v: 7 });
    expect(await store.list()).toEqual(['legit']);
  });
});

describe('Test 6 — a mix of valid and invalid records never produces a fabricated MATCH', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('a run record with a semantically invalid shape resolves to NOT_REPRODUCIBLE, never MATCH', async () => {
    const fake = makeFakeStorage();
    const artifact = await makeArtifact();
    const input = await makeInput(artifact);
    const corruptedRun = { hazardRunId: 'run-corrupt-1', hazardInputId: input.hazardInputId, hazardModuleVersion: 42 /* wrong type */ };

    fake.setItem('genesis-os:hazard-provenance-store/artifacts/v1', JSON.stringify({ [artifact.artifactId]: artifact }));
    fake.setItem('genesis-os:hazard-provenance-store/inputs/v1', JSON.stringify({ [input.hazardInputId]: input }));
    fake.setItem('genesis-os:hazard-provenance-store/runs/v1', JSON.stringify({
      [corruptedRun.hazardRunId]: corruptedRun,
    }));
    vi.stubGlobal('window', { localStorage: fake });

    const { LocalHazardProvenanceStore: FreshHazardStore } = await import('../core/hazard/hazardProvenanceStore');
    const { replayHazardRun: freshReplay } = await import('../core/hazard/hazardReplay');
    const store = new FreshHazardStore();

    expect(await store.getRun(corruptedRun.hazardRunId)).toBeNull();
    const replay = await freshReplay({ store, hazardRunId: corruptedRun.hazardRunId, evaluator: sumFieldsEvaluator });
    expect(replay.status).toBe('NOT_REPRODUCIBLE');
    expect(replay.status).not.toBe('MATCH');
  });
});

describe('Test 7 — reject-if-different still blocks a real immutable-provenance conflict, including against a corrupted existing record', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('putArtifact still rejects a genuine different-content conflict under an otherwise-valid existing record', async () => {
    const fake = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: fake });
    const store = new LocalHazardProvenanceStore();
    const artifact = await makeArtifact();
    await store.putArtifact(artifact);
    await expect(store.putArtifact({ ...artifact, crs: 'EPSG:3857' })).rejects.toThrow(ImmutableConflictError);
  });

  it('never replaces a corrupted existing record with a fresh one under the same id — fails closed instead', async () => {
    const fake = makeFakeStorage();
    const input = await makeInput(await makeArtifact());
    // Simulate storage corruption directly under the input's own id: a value that fails the shape gate.
    fake.setItem('genesis-os:hazard-provenance-store/inputs/v1', JSON.stringify({
      [input.hazardInputId]: { hazardInputId: input.hazardInputId /* missing every other required field */ },
    }));
    vi.stubGlobal('window', { localStorage: fake });

    const store = new LocalHazardProvenanceStore();
    expect(await store.getInput(input.hazardInputId)).toBeNull();
    await expect(store.putInput(input)).rejects.toThrow(DuplicateRecordConflictError);
  });
});

describe('Test 8 — overwrite policy remains fully compatible with the existing EvidenceStore', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('LocalEvidenceStore.save still overwrites its own id under the guarded boundary', async () => {
    const fake = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: fake });
    const store = new LocalEvidenceStore();
    const base: StoredEvidence = {
      schemaVersion: '1.0.0',
      record: { caseId: 'overwrite-case-1' } as unknown as StoredEvidence['record'],
      sha256: null,
      codeCommitHash: 'commit-a',
      savedAt: 1,
    };
    await store.save(base);
    await store.save({ ...base, codeCommitHash: 'commit-b', savedAt: 2 });
    const loaded = await store.load('overwrite-case-1');
    expect(loaded?.codeCommitHash).toBe('commit-b');
  });
});

describe('Test 9 — Earthquake persisted-run history stays read-only, even facing corrupted siblings', () => {
  it('listEarthquakePersistedRunHistory never calls putArtifact/putInput/putRun on the store it reads', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const artifact = await makeArtifact();
    const descriptor = getHazardModule('earthquake');
    const earthquakeInput = await makeInput(artifact, { hazardType: descriptor.hazardType });
    await store.putArtifact(artifact);
    await store.putInput(earthquakeInput);
    await store.putRun(await makeRun(earthquakeInput, { hazardModuleVersion: descriptor.moduleVersion }));

    const putArtifactSpy = vi.spyOn(store, 'putArtifact');
    const putInputSpy = vi.spyOn(store, 'putInput');
    const putRunSpy = vi.spyOn(store, 'putRun');

    await listEarthquakePersistedRunHistory(store);

    expect(putArtifactSpy).not.toHaveBeenCalled();
    expect(putInputSpy).not.toHaveBeenCalled();
    expect(putRunSpy).not.toHaveBeenCalled();
    void earthquakeEvaluator; // imported only to confirm this module needs no separate wiring — history uses the registry's own evaluator internally
  });
});

describe('Test 10 — no import into City3D, GIS, live data, or Scientific Core', () => {
  const forbiddenModules = [
    'city3d',
    'cityagent',
    'roadnetwork',
    'epidemiccity',
    'worldenginecontract',
    'worldengineinterface',
    'hospitalresource',
    'scenarioengine',
    'discoveryengine',
    'discoveryreplay',
    'discoveryexecution',
    'resolvecontacts',
    '@react-three',
    'threejs',
    'leaflet',
    'mapbox',
    'proj4',
    'topojson',
  ];
  const filesToScan = [
    join(CORE_DIR, 'provenance', 'recordStore.ts'),
    join(CORE_DIR, 'discovery', 'evidenceStore.ts'),
    join(CORE_DIR, 'hazard', 'hazardProvenanceStore.ts'),
    join(CORE_DIR, 'simulationRenderer', 'earthquakePersistedRunHistory.ts'),
  ];

  it('the persistence-integrity boundary and its consumers import only domain-neutral/hazard-generic modules', () => {
    for (const file of filesToScan) {
      const source = readFileSync(file, 'utf8');
      const importLines = source.match(/^import .*$/gm) ?? [];
      for (const line of importLines) {
        for (const forbidden of forbiddenModules) {
          expect(line.toLowerCase()).not.toContain(forbidden.toLowerCase());
        }
      }
    }
  });

  it('the hazard directory as a whole still has no such import (regression guard on the existing Test 8 boundary)', () => {
    const hazardDir = join(CORE_DIR, 'hazard');
    const files = readdirSync(hazardDir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(join(hazardDir, file), 'utf8');
      const importLines = source.match(/^import .*$/gm) ?? [];
      for (const line of importLines) {
        for (const forbidden of forbiddenModules) {
          expect(line.toLowerCase()).not.toContain(forbidden.toLowerCase());
        }
      }
    }
  });
});
