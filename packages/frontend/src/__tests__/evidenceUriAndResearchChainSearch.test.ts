import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatEvidenceUri, parseEvidenceUri, EVIDENCE_URI_VERSION, type EvidenceUriFields } from '../core/experimentFabric/evidenceUri';

/**
 * C1 — "CAMPAIGN SEARCH + evidence:// ADRESOWALNOŚĆ" (the C1 task, reconciled
 * against Qwen's evidence:// spec proposal and real `evidencePack.ts` fields).
 *
 * Three things proven here:
 * 1. `evidence://` round-trip over the REAL field names Genesis already has
 *    (`evidencePackId`/`evidenceChainId`), not Qwen's proposed short aliases —
 *    the reconciliation decision documented in `evidenceUri.ts` itself.
 * 2. `searchResearchChains` — a real, filtered read over saved
 *    `SavedResearchChainManifest` records, against actually-saved fixtures,
 *    not asserted shape.
 * 3. CHAT ENTRY — `resolveCommand` recognizes the trigger phrases and
 *    returns the right action/query, deliberately NOT using "kampani*"
 *    (that already means the backend molecule-optimization workshop).
 */

function makeFakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => { map.set(k, v); },
  } as Storage;
}

describe('evidence:// URI — round-trip over real evidencePack fields', () => {
  it('is version 1, with no authority/federation concept (none exists in Genesis today)', () => {
    expect(EVIDENCE_URI_VERSION).toBe(1);
  });

  it('encodes and decodes packId-only (no chainId)', () => {
    const fields: EvidenceUriFields = { evidencePackId: 'pack_a1b2c3d4', evidenceChainId: null };
    const uri = formatEvidenceUri(fields);
    expect(uri).toBe('evidence://pack_a1b2c3d4');
    expect(parseEvidenceUri(uri)).toEqual(fields);
  });

  it('encodes and decodes packId + chainId', () => {
    const fields: EvidenceUriFields = { evidencePackId: 'pack_a1b2c3d4', evidenceChainId: 'chain_9f8e7d6c' };
    const uri = formatEvidenceUri(fields);
    expect(uri).toBe('evidence://pack_a1b2c3d4/chain_9f8e7d6c');
    expect(parseEvidenceUri(uri)).toEqual(fields);
  });

  it('percent-encodes and round-trips a slash embedded in an id', () => {
    const fields: EvidenceUriFields = { evidencePackId: 'pack/weird', evidenceChainId: 'chain/also-weird' };
    const uri = formatEvidenceUri(fields);
    expect(uri).not.toContain('pack/weird'); // the literal slash must not survive unencoded
    expect(parseEvidenceUri(uri)).toEqual(fields);
  });

  it('rejects an empty evidencePackId rather than encoding a malformed URI', () => {
    expect(() => formatEvidenceUri({ evidencePackId: '', evidenceChainId: null })).toThrow();
  });

  it('parseEvidenceUri returns null (not a guess) for a non-evidence:// string', () => {
    expect(parseEvidenceUri('https://example.com/pack_a1b2c3d4')).toBeNull();
    expect(parseEvidenceUri('evidence://')).toBeNull();
    expect(parseEvidenceUri('evidence://a/b/c')).toBeNull();
  });
});

describe('searchResearchChains — filtered read over real saved manifests', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function seedThreeChains() {
    // storage.ts caches `isAvailable()`'s result at module scope — without a
    // fresh module instance per test, a `window` from an EARLIER test file in
    // this worker (or none at all) stays cached, and every write here becomes
    // a silent no-op (this is the fix for exactly that: all six tests below
    // originally saw `searchResearchChains()` return `[]` because nothing was
    // ever really persisted, not because the search itself was wrong).
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { buildSavedResearchChainManifest, saveResearchChainManifestToMemory } = await import('../core/scienceMemory');
    const step = (question: string) => [{ step: 1, question, kind: 'INITIAL', why: 'w', ranSuccessfully: true, savedExperimentIds: ['x'] }];

    saveResearchChainManifestToMemory(buildSavedResearchChainManifest({
      chainShape: 'PARAMETER', steps: step('Does temperature drive folding rate?'),
      selfChosenSteps: 0, stoppedBecause: 'settled', terminalStatus: 'SETTLED',
    }));
    saveResearchChainManifestToMemory(buildSavedResearchChainManifest({
      chainShape: 'PARAMETER', steps: step('Does pressure affect reaction yield?'),
      selfChosenSteps: 1, stoppedBecause: 'blocked', terminalStatus: 'BLOCKED',
    }));
    saveResearchChainManifestToMemory(buildSavedResearchChainManifest({
      chainShape: 'MECHANISM', steps: step('Will the generator lever compose?'),
      selfChosenSteps: 2, stoppedBecause: 'inconclusive', terminalStatus: 'INCONCLUSIVE',
    }));
  }

  it('with no query, returns every saved research chain', async () => {
    await seedThreeChains();
    const { searchResearchChains } = await import('../core/scienceMemory');
    expect(searchResearchChains()).toHaveLength(3);
  });

  it('filters by terminalStatus (Qwen\'s "outcomeType")', async () => {
    await seedThreeChains();
    const { searchResearchChains } = await import('../core/scienceMemory');
    const settled = searchResearchChains({ terminalStatus: 'SETTLED' });
    expect(settled).toHaveLength(1);
    expect(settled[0]!.manifest.initialQuestion).toContain('temperature');
  });

  it('filters by chainShape', async () => {
    await seedThreeChains();
    const { searchResearchChains } = await import('../core/scienceMemory');
    expect(searchResearchChains({ chainShape: 'MECHANISM' })).toHaveLength(1);
    expect(searchResearchChains({ chainShape: 'PARAMETER' })).toHaveLength(2);
  });

  it('filters by questionContains, case-insensitively', async () => {
    await seedThreeChains();
    const { searchResearchChains } = await import('../core/scienceMemory');
    expect(searchResearchChains({ questionContains: 'PRESSURE' })).toHaveLength(1);
    expect(searchResearchChains({ questionContains: 'nonexistent-topic' })).toHaveLength(0);
  });

  it('combines filters — chainShape AND terminalStatus', async () => {
    await seedThreeChains();
    const { searchResearchChains } = await import('../core/scienceMemory');
    expect(searchResearchChains({ chainShape: 'PARAMETER', terminalStatus: 'BLOCKED' })).toHaveLength(1);
    expect(searchResearchChains({ chainShape: 'MECHANISM', terminalStatus: 'SETTLED' })).toHaveLength(0);
  });

  it('filters by createdAfter/createdBefore against the OWNING SavedExperiment.createdAt', async () => {
    await seedThreeChains();
    const { searchResearchChains } = await import('../core/scienceMemory');
    const farFuture = new Date(Date.now() + 86_400_000).toISOString();
    const farPast = new Date(Date.now() - 86_400_000).toISOString();
    expect(searchResearchChains({ createdAfter: farFuture })).toHaveLength(0);
    expect(searchResearchChains({ createdBefore: farPast })).toHaveLength(0);
    expect(searchResearchChains({ createdAfter: farPast, createdBefore: farFuture })).toHaveLength(3);
  });

  it('an empty Science Memory returns an empty result, not an error', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { searchResearchChains } = await import('../core/scienceMemory');
    expect(searchResearchChains()).toEqual([]);
  });
});

describe('CHAT ENTRY — resolveCommand recognizes research chain search, not "kampani*"', () => {
  // Dynamically imported (not a top-level static import) for the same reason
  // every scienceMemory-adjacent import in this file is: `core/storage.ts`
  // caches `window.localStorage` availability in a MODULE-LEVEL variable on
  // its first call, for the lifetime of this test file. A static top-level
  // import of resolveCommand.ts (or anything in ITS import graph) would run
  // before any `vi.stubGlobal` below, poisoning that cache to `false`
  // permanently — exactly the bug this file used to have, traced down to
  // this mechanism.
  it('a bare "łańcuchy badawcze" request resolves with an empty query', async () => {
    const { resolveCommand } = await import('../core/scienceChat/resolveCommand');
    const res = resolveCommand('pokaz lancuchy badawcze', null);
    expect(res.intent).toBe('SEARCH_RESEARCH_CHAINS');
    expect(res.action).toEqual({ type: 'searchResearchChains', query: {} });
  });

  it('"rozstrzygnięte łańcuchy badawcze" resolves with terminalStatus SETTLED', async () => {
    const { resolveCommand } = await import('../core/scienceChat/resolveCommand');
    const res = resolveCommand('pokaz rozstrzygniete lancuchy badawcze', null);
    expect(res.action).toEqual({ type: 'searchResearchChains', query: { terminalStatus: 'SETTLED' } });
  });

  it('"zablokowane łańcuchy badawcze" resolves with terminalStatus BLOCKED', async () => {
    const { resolveCommand } = await import('../core/scienceChat/resolveCommand');
    const res = resolveCommand('zablokowane lancuchy badawcze', null);
    expect(res.action).toEqual({ type: 'searchResearchChains', query: { terminalStatus: 'BLOCKED' } });
  });

  it('does not fire on the unrelated "kampania naukowa" (molecule-optimization) trigger', async () => {
    const { resolveCommand } = await import('../core/scienceChat/resolveCommand');
    const res = resolveCommand('otworz kampanie naukowa', null);
    expect(res.intent).toBe('OPEN_CAMPAIGN');
    expect(res.intent).not.toBe('SEARCH_RESEARCH_CHAINS');
  });

  it('does not fire on an unrelated message', async () => {
    const { resolveCommand } = await import('../core/scienceChat/resolveCommand');
    const res = resolveCommand('jaka jest temperatura wrzenia wody', null);
    expect(res.intent).not.toBe('SEARCH_RESEARCH_CHAINS');
  });
});
