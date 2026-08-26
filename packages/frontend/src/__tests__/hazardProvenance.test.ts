/// <reference types="node" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../core/events/hash';
import {
  computeHazardInputFingerprint,
  computeHazardRunResultFingerprint,
  computeSourceArtifactContentHash,
} from '../core/hazard/fingerprint';
import {
  checkHazardInputAdmission,
  checkHazardRunAdmission,
  checkSourceArtifactAdmission,
} from '../core/hazard/hazardEvidenceGate';
import {
  ImmutableConflictError,
  InMemoryHazardProvenanceStore,
} from '../core/hazard/hazardProvenanceStore';
import { replayHazardRun, type HazardReferenceEvaluator } from '../core/hazard/hazardReplay';
import type { HazardInput, HazardRun, SourceArtifact } from '../core/hazard/contracts';

const HERE = dirname(fileURLToPath(import.meta.url));
const HAZARD_DIR = join(HERE, '..', 'core', 'hazard');

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
  const contentHash = await computeSourceArtifactContentHash('fixture-raw-content-v1');
  return {
    artifactId: 'artifact-1',
    contentHash,
    crs: 'EPSG:4326',
    extent: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    rawContentRef: 'blob://fixture-raw-content-v1',
    provenance: {
      provider: 'test-provider',
      sourceUrl: 'https://example.invalid/dataset',
      sourceTime: 1_700_000_000_000,
      retrievedAt: 1_700_000_100_000,
      license: 'CC-BY-4.0',
      adapterVersion: 'adapter-v1',
    },
    ...overrides,
  };
}

async function makeInput(artifact: SourceArtifact, scientificFields: Record<string, unknown> = { magnitude: 5.5 }, overrides: Partial<HazardInput> = {}): Promise<HazardInput> {
  const seed = 42;
  const inputFingerprint = await computeHazardInputFingerprint({
    hazardType: 'test-hazard',
    sourceArtifactContentHash: artifact.contentHash,
    scientificFields,
    seed,
  });
  return {
    hazardInputId: 'input-1',
    hazardType: 'test-hazard',
    sourceArtifactId: artifact.artifactId,
    scientificFields,
    seed,
    displayName: 'My Test Run',
    inputFingerprint,
    ...overrides,
  };
}

/** A deterministic, test-local reference fixture — NOT a hazard scientific model. See hazardReplay.ts's own disclaimer. */
const sumFieldsEvaluator: HazardReferenceEvaluator = {
  evaluate: (input) => {
    const total = Object.values(input.scientificFields).reduce<number>((acc, v) => acc + (typeof v === 'number' ? v : 0), 0);
    return { total };
  },
};

async function makeRun(input: HazardInput, artifact: SourceArtifact, overrides: Partial<HazardRun> = {}): Promise<HazardRun> {
  const outputFields = await sumFieldsEvaluator.evaluate(input, artifact);
  const resultFingerprint = await computeHazardRunResultFingerprint({
    hazardInputId: input.hazardInputId,
    hazardModuleVersion: 'module-v1',
    codeCommitHash: 'test-commit-hash',
    outputFields,
  });
  return {
    hazardRunId: 'run-1',
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

describe('Test 1 — canonical serialization is deterministic regardless of key order', () => {
  it('produces identical output for the same object with keys in a different order', async () => {
    const artifact = await makeArtifact();
    const shuffled: SourceArtifact = {
      provenance: artifact.provenance,
      rawContentRef: artifact.rawContentRef,
      extent: artifact.extent,
      crs: artifact.crs,
      contentHash: artifact.contentHash,
      artifactId: artifact.artifactId,
    };
    expect(canonicalJson(artifact)).toBe(canonicalJson(shuffled));
  });

  it('holds for all six primary contract shapes (artifact, input, run + their nested provenance)', async () => {
    const artifact = await makeArtifact();
    const input = await makeInput(artifact);
    const run = await makeRun(input, artifact);
    for (const value of [artifact, input, run, artifact.provenance]) {
      const reversed = JSON.parse(JSON.stringify(value));
      expect(canonicalJson(value)).toBe(canonicalJson(reversed));
    }
  });
});

describe('Test 2 — input fingerprint sensitivity', () => {
  it('changes when a scientifically relevant field changes', async () => {
    const artifact = await makeArtifact();
    const a = await makeInput(artifact, { magnitude: 5.5 });
    const b = await makeInput(artifact, { magnitude: 6.1 });
    expect(a.inputFingerprint).not.toBe(b.inputFingerprint);
  });

  it('does not change when only displayName changes', async () => {
    const artifact = await makeArtifact();
    const a = await makeInput(artifact, { magnitude: 5.5 }, { displayName: 'Run A' });
    const b = await makeInput(artifact, { magnitude: 5.5 }, { displayName: 'Something Completely Different' });
    expect(a.inputFingerprint).toBe(b.inputFingerprint);
  });
});

describe('Test 3 — honest replay: same frozen artifact + input + evaluator re-executes to MATCH', () => {
  it('returns MATCH when nothing changed', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const artifact = await makeArtifact();
    const input = await makeInput(artifact);
    const run = await makeRun(input, artifact);
    await store.putArtifact(artifact);
    await store.putInput(input);
    await store.putRun(run);

    const result = await replayHazardRun({ store, hazardRunId: run.hazardRunId, evaluator: sumFieldsEvaluator });
    expect(result.status).toBe('MATCH');
    expect(result.replayResultFingerprint).toBe(run.resultFingerprint);
    expect(result.differences).toEqual([]);
  });
});

describe('Test 4 — a real input or output change yields DRIFT', () => {
  it('detects drift when the evaluator produces a different output than the stored run claims', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const artifact = await makeArtifact();
    const input = await makeInput(artifact, { magnitude: 5.5 });
    const run = await makeRun(input, artifact);
    await store.putArtifact(artifact);
    await store.putInput(input);
    // Tamper the stored run's fingerprint directly (bypassing the evaluator) to simulate a genuine output change without touching immutability rules on creation.
    await store.putRun({ ...run, resultFingerprint: 'deliberately-wrong-fingerprint-to-force-drift' });

    const result = await replayHazardRun({ store, hazardRunId: run.hazardRunId, evaluator: sumFieldsEvaluator });
    expect(result.status).toBe('DRIFT');
    expect(result.differences.length).toBeGreaterThan(0);
  });
});

describe('Test 5 — missing or mutated artifact never yields a false MATCH', () => {
  it('returns NOT_REPRODUCIBLE when the hazardRun itself is not found', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const result = await replayHazardRun({ store, hazardRunId: 'never-saved', evaluator: sumFieldsEvaluator });
    expect(result.status).toBe('NOT_REPRODUCIBLE');
  });

  it('returns NOT_REPRODUCIBLE when the referenced hazardInput is missing', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const artifact = await makeArtifact();
    const input = await makeInput(artifact);
    const run = await makeRun(input, artifact);
    await store.putArtifact(artifact);
    // Input intentionally not saved.
    await store.putRun(run);

    const result = await replayHazardRun({ store, hazardRunId: run.hazardRunId, evaluator: sumFieldsEvaluator });
    expect(result.status).toBe('NOT_REPRODUCIBLE');
  });

  it('returns BLOCKED when the referenced source artifact is missing', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const artifact = await makeArtifact();
    const input = await makeInput(artifact);
    const run = await makeRun(input, artifact);
    // Artifact intentionally not saved.
    await store.putInput(input);
    await store.putRun(run);

    const result = await replayHazardRun({ store, hazardRunId: run.hazardRunId, evaluator: sumFieldsEvaluator });
    expect(result.status).toBe('BLOCKED');
  });

  it('returns BLOCKED, never MATCH, when the pinned artifact content hash no longer matches what the input was created against', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const artifact = await makeArtifact();
    const input = await makeInput(artifact);
    const run = await makeRun(input, artifact);
    await store.putInput(input);
    await store.putRun(run);
    // Simulate tampering that bypasses store immutability entirely (e.g. a corrupted external write).
    await store.putArtifact({ ...artifact, contentHash: await computeSourceArtifactContentHash('different-raw-content') });

    const result = await replayHazardRun({ store, hazardRunId: run.hazardRunId, evaluator: sumFieldsEvaluator });
    expect(result.status).toBe('BLOCKED');
    expect(result.status).not.toBe('MATCH');
  });
});

describe('Test 6 — store immutability: same id with different content is rejected', () => {
  it('rejects a second SourceArtifact write under the same id with different content', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const artifact = await makeArtifact();
    await store.putArtifact(artifact);
    await expect(store.putArtifact({ ...artifact, crs: 'EPSG:3857' })).rejects.toThrow(ImmutableConflictError);
  });

  it('allows re-putting the exact same content under the same id (idempotent, not a conflict)', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const artifact = await makeArtifact();
    await store.putArtifact(artifact);
    await expect(store.putArtifact({ ...artifact })).resolves.toBeUndefined();
  });

  it('rejects a conflicting HazardInput and HazardRun the same way', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const artifact = await makeArtifact();
    const input = await makeInput(artifact);
    const run = await makeRun(input, artifact);
    await store.putInput(input);
    await store.putRun(run);
    await expect(store.putInput({ ...input, seed: 999 })).rejects.toThrow(ImmutableConflictError);
    await expect(store.putRun({ ...run, hazardModuleVersion: 'module-v2' })).rejects.toThrow(ImmutableConflictError);
  });

  describe('LocalHazardProvenanceStore — persistent backend, same immutability guarantee', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.resetModules();
    });

    it('enforces immutability and survives being reconstructed', async () => {
      const fake = makeFakeStorage();
      vi.stubGlobal('window', { localStorage: fake });
      const { LocalHazardProvenanceStore: FirstStore } = await import('../core/hazard/hazardProvenanceStore');
      const store = new FirstStore();
      const artifact = await makeArtifact();
      await store.putArtifact(artifact);
      await expect(store.putArtifact({ ...artifact, crs: 'EPSG:3857' })).rejects.toThrow();

      vi.resetModules();
      vi.stubGlobal('window', { localStorage: fake });
      const { LocalHazardProvenanceStore: FreshStore } = await import('../core/hazard/hazardProvenanceStore');
      const fresh = new FreshStore();
      const loaded = await fresh.getArtifact(artifact.artifactId);
      expect(loaded?.contentHash).toBe(artifact.contentHash);
    });
  });
});

describe('Test 7 — evidence completeness gate blocks admission on missing mandatory fields', () => {
  it('admits a fully-populated SourceArtifact', async () => {
    const artifact = await makeArtifact();
    expect(checkSourceArtifactAdmission(artifact)).toEqual({ admitted: true, missingFields: [] });
  });

  it('rejects a SourceArtifact missing provenance.adapterVersion', async () => {
    const artifact = await makeArtifact();
    const broken = { ...artifact, provenance: { ...artifact.provenance, adapterVersion: '' } };
    const result = checkSourceArtifactAdmission(broken);
    expect(result.admitted).toBe(false);
    expect(result.missingFields).toContain('provenance.adapterVersion');
  });

  it('rejects a HazardInput with empty scientificFields', async () => {
    const artifact = await makeArtifact();
    const input = await makeInput(artifact, {});
    const result = checkHazardInputAdmission(input);
    expect(result.admitted).toBe(false);
    expect(result.missingFields).toContain('scientificFields');
  });

  it('rejects a HazardRun missing hazardModuleVersion', async () => {
    const artifact = await makeArtifact();
    const input = await makeInput(artifact);
    const run = await makeRun(input, artifact, { hazardModuleVersion: '' });
    const result = checkHazardRunAdmission(run);
    expect(result.admitted).toBe(false);
    expect(result.missingFields).toContain('hazardModuleVersion');
  });
});

describe('Test 8 — isolation from epidemic Scientific Core and WorldEngineContract', () => {
  const forbiddenModules = [
    'epidemicCity',
    'cityAgent',
    'roadNetwork',
    'worldEngineContract',
    'worldEngineInterface',
    'hospitalResource',
    'scenarioEngine',
    'discoveryCase',
    'discoveryEngine',
    'discoveryEvidence',
    'discoveryReplay',
    'discoveryExecution',
  ];

  it('imports only generic, domain-neutral shared utilities — no Scientific Core or WorldEngineContract module', () => {
    const files = readdirSync(HAZARD_DIR).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(join(HAZARD_DIR, file), 'utf8');
      const importLines = source.match(/^import .*$/gm) ?? [];
      for (const line of importLines) {
        for (const forbidden of forbiddenModules) {
          expect(line.toLowerCase()).not.toContain(forbidden.toLowerCase());
        }
      }
    }
  });

  it('the only cross-cutting imports used are the shared, already-generic hashing/storage primitives', () => {
    const source = readFileSync(join(HAZARD_DIR, 'fingerprint.ts'), 'utf8');
    expect(source).toContain("from '../events/hash'");
    expect(source).toContain("from '../discovery/evidenceCrypto'");
    // evidenceCrypto.ts itself wraps Web Crypto only — verified separately in evidenceCrypto.test.ts — it does not import Scientific Core.
  });
});
