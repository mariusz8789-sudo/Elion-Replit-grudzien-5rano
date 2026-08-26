import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDiscoveryCase } from '../core/discovery/discoveryEngine';
import type { DiscoveryCaseSpec } from '../core/discovery/discoveryCase';
import {
  EVIDENCE_STORE_SCHEMA_VERSION,
  InMemoryEvidenceStore,
  listExperimentRegistry,
  summarizeStoredEvidence,
  type EvidenceStore,
  type StoredEvidence,
} from '../core/discovery/evidenceStore';
import { computeEvidencePackSha256 } from '../core/discovery/evidenceCrypto';

const conditions = { nAgents: 160, initialInfected: 5, seed: 777, days: 40, stepsPerDay: 4 };
const spec = (over: Partial<DiscoveryCaseSpec> = {}): DiscoveryCaseSpec => ({
  question: 'Czy izolacja objawowych obniża szczyt zakażeń?',
  hypothesis: {
    statement: 'Izolacja objawowych obniża szczytową liczbę zakaźnych względem braku interwencji.',
    falsification: { metric: 'peakInfectious', relation: 'less-than', rationale: 'Izolacja usuwa zakaźnych z obiegu kontaktów.' },
    assumptions: ['Wykrywalność objawowych jest natychmiastowa.'],
  },
  baselineScenario: 'BASELINE',
  variantScenario: 'ISOLATION',
  initialConditions: conditions,
  ...over,
});

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

async function makeEntry(overSeed = 777): Promise<StoredEvidence> {
  const c = runDiscoveryCase(spec({ initialConditions: { ...conditions, seed: overSeed } }));
  const sha256 = await computeEvidencePackSha256(c.evidence!);
  return { schemaVersion: EVIDENCE_STORE_SCHEMA_VERSION, record: c, sha256, codeCommitHash: 'test-commit-hash', savedAt: Date.now() };
}

async function runsExercise(store: EvidenceStore) {
  const entry = await makeEntry();
  await store.save(entry);
  const loaded = await store.load(entry.record.caseId);
  expect(loaded).not.toBeNull();
  expect(loaded!.record).toEqual(entry.record);
  expect(loaded!.sha256).toBe(entry.sha256);
  expect(loaded!.schemaVersion).toBe(EVIDENCE_STORE_SCHEMA_VERSION);
  expect(loaded!.codeCommitHash).toBe('test-commit-hash');
  // Replay capability actually needs the per-arm run series, not just the summary pack.
  expect(loaded!.record.arms[0].run.series.length).toBeGreaterThan(0);

  const ids = await store.list();
  expect(ids).toContain(entry.record.caseId);
  expect(await store.load('never-saved')).toBeNull();

  await store.delete(entry.record.caseId);
  expect(await store.load(entry.record.caseId)).toBeNull();
  expect(await store.list()).not.toContain(entry.record.caseId);
}

describe('InMemoryEvidenceStore', () => {
  it('saves, loads, lists, and deletes a real discovery case with its evidence', async () => {
    await runsExercise(new InMemoryEvidenceStore());
  });
});

describe('LocalEvidenceStore — genuinely persistent, unlike the InMemory-only store from the uploaded ZIP', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('saves, loads, lists, and deletes a real discovery case via localStorage', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { LocalEvidenceStore } = await import('../core/discovery/evidenceStore');
    await runsExercise(new LocalEvidenceStore());
  });

  it('survives being reconstructed — the whole point of swapping InMemory for a persistent store', async () => {
    const fake = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: fake });
    const entry = await makeEntry();
    const { LocalEvidenceStore } = await import('../core/discovery/evidenceStore');
    const first = new LocalEvidenceStore();
    await first.save(entry);

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: fake });
    const { LocalEvidenceStore: FreshStore } = await import('../core/discovery/evidenceStore');
    const freshInstance = new FreshStore();
    const loaded = await freshInstance.load(entry.record.caseId);
    expect(loaded?.sha256).toBe(entry.sha256);
    expect(loaded?.record.arms[0].run.series.length).toBe(entry.record.arms[0].run.series.length);
  });
});

describe('summarizeStoredEvidence — Experiment Registry projection', () => {
  it('carries every field the registry needs, all read from real data', async () => {
    const entry = await makeEntry();
    const summary = summarizeStoredEvidence(entry);
    expect(summary.experimentId).toBe(entry.record.caseId);
    expect(summary.scenarioId).toBe('BASELINE→ISOLATION');
    expect(summary.seed).toBe(777);
    expect(summary.modelVersion).toBe(entry.record.model.modelVersion);
    expect(summary.codeCommitHash).toBe('test-commit-hash');
    expect(summary.inputFingerprint).toBe(entry.record.inputFingerprint);
    expect(summary.resultFingerprint).toBe(entry.record.runFingerprint);
    expect(summary.status).toBe(entry.record.status);
    expect(summary.provenance.modelId).toBe(entry.record.model.modelId);
    expect(summary.provenance.codeCommitHash).toBe('test-commit-hash');
  });
});

describe('listExperimentRegistry — every saved experiment, newest first', () => {
  it('lists real saved entries sorted by save time, not fabricated ones', async () => {
    const store = new InMemoryEvidenceStore();
    const first = await makeEntry(1);
    await store.save({ ...first, savedAt: 1000 });
    const second = await makeEntry(2);
    await store.save({ ...second, savedAt: 2000 });

    const registry = await listExperimentRegistry(store);
    expect(registry).toHaveLength(2);
    expect(registry[0].experimentId).toBe(second.record.caseId);
    expect(registry[1].experimentId).toBe(first.record.caseId);
  });

  it('returns an empty list, not a crash, when the store is empty', async () => {
    expect(await listExperimentRegistry(new InMemoryEvidenceStore())).toEqual([]);
  });
});
