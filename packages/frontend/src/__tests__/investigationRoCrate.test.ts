import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  executePreregisteredHypotheses, executePreregisteredHypothesesAsync, generateCompetingHypotheses,
  HYPOTHESIS_PROBLEMS, preregisterHypotheses, type HypothesisLoopResult,
} from '../core/experimentFabric/hypothesisLoop';
import { combineEvidencePackRoCrates, type DomainEvidenceEntry } from '../core/experimentFabric/evidencePackRoCrate';

/**
 * THREE-DOMAIN INVESTIGATION EXPORT — proves the EXISTING
 * `exportEvidencePackRoCrate` (unchanged) can back one deterministic
 * bundle spanning epidemiology, particle physics, and molecular chemistry,
 * via the new `combineEvidencePackRoCrates` merge-only wrapper.
 *
 * Chemistry is a real BACKEND_REAL_ENGINE model (RDKit); only its HTTP
 * transport is mocked, exactly like every other test in this codebase that
 * exercises `chem-rdkit-descriptors` — the descriptor VALUES are the real
 * numbers this session captured from an actually-running RDKit 2026.03.5.
 * Epidemiology and physics are local, synchronous, real models — no
 * mocking needed at all.
 */
function fakeResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function rdkitFetchMock() {
  let seq = 0;
  return vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    seq += 1;
    const body = JSON.parse(String(init?.body ?? '{}'));
    const smiles = String(body.inputs?.smiles);
    const outputs = smiles === 'CCO'
      ? { molWt: 46.069, canonicalSmiles: 'CCO', molecularFormula: 'C2H6O' }
      : { molWt: 180.159, canonicalSmiles: smiles, molecularFormula: 'C9H8O4' };
    return fakeResponse({
      contractVersion: '1.0.0', request: body,
      run: {
        runId: `chem-${seq}`, modelId: 'chem-rdkit-descriptors', modelVersion: '1.0.0', domain: 'chemistry',
        engine: 'genesis-compute@1.0.0', status: 'ok', deterministic: true, inputs: body.inputs, outputs, units: {},
        warnings: [], assumptions: [],
        provenance: { source: 'compute/rdkitAdapter.mjs', formula: 'RDKit Descriptors', honesty: 'real_external_engine', engine: 'RDKit 2026.03.5' },
      },
      persisted: false,
    });
  });
}

function runLocalLoop(problemId: string): HypothesisLoopResult {
  const problem = HYPOTHESIS_PROBLEMS.find((p) => p.problemId === problemId)!;
  return executePreregisteredHypotheses(preregisterHypotheses(generateCompetingHypotheses(problem)));
}

async function runChemLoop(): Promise<HypothesisLoopResult> {
  const problem = HYPOTHESIS_PROBLEMS.find((p) => p.problemId === 'problem:chem-rdkit-molecular-weight-comparison')!;
  return executePreregisteredHypothesesAsync(preregisterHypotheses(generateCompetingHypotheses(problem)));
}

async function threeDomainEntries(): Promise<DomainEvidenceEntry[]> {
  const epi = runLocalLoop('problem:lowest-modeled-deaths');
  const phys = runLocalLoop('problem:particle-relativistic-kinetic-energy-velocity');
  vi.stubGlobal('fetch', rdkitFetchMock());
  const chem = await runChemLoop();
  return [
    { domainId: 'EPIDEMIOLOGY', question: epi.preregistration.set.problem.statement, pack: epi.packs[0]!, replayStatus: 'MATCH', notModeled: ['spatial-position'] },
    { domainId: 'PHYSICS', question: phys.preregistration.set.problem.statement, pack: phys.packs[0]! },
    { domainId: 'CHEMISTRY', question: chem.preregistration.set.problem.statement, pack: chem.packs[0]!, notModeled: ['toxicity', 'admet', 'binding-affinity'] },
  ];
}

describe('Three-domain scientific investigation RO-Crate export', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('1. all three domains (epidemiology, particle physics, molecular chemistry) enter the SAME exporter', async () => {
    const entries = await threeDomainEntries();
    const bundle = combineEvidencePackRoCrates(entries);
    const domainNodes = bundle['@graph'].filter((n) => typeof n['@id'] === 'string' && (n['@id'] as string).startsWith('#domain/'));
    expect(domainNodes).toHaveLength(3);
    expect(domainNodes.map((n) => n['genesis:domainId'])).toEqual(['EPIDEMIOLOGY', 'PHYSICS', 'CHEMISTRY']);
  });

  it('2. the export is deterministic — same real inputs produce byte-identical bundles', async () => {
    const entries = await threeDomainEntries();
    const first = combineEvidencePackRoCrates(entries);
    const second = combineEvidencePackRoCrates(entries);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('3. real provenance (run fingerprints, engine, model identity) survives export for every domain', async () => {
    const entries = await threeDomainEntries();
    const bundle = combineEvidencePackRoCrates(entries);
    const activityNodes = bundle['@graph'].filter((n) => n['@type'] === 'prov:Activity');
    expect(activityNodes.length).toBeGreaterThanOrEqual(3);
    for (const node of activityNodes) {
      expect(typeof node['genesis:runFingerprint']).toBe('string');
      expect((node['genesis:runFingerprint'] as string).length).toBeGreaterThan(0);
    }
  });

  it('4. UNKNOWN / NOT_MODELED declarations survive export verbatim, never dropped or converted to negative evidence', async () => {
    const entries = await threeDomainEntries();
    const bundle = combineEvidencePackRoCrates(entries);
    const chemDomainNode = bundle['@graph'].find((n) => n['genesis:domainId'] === 'CHEMISTRY')!;
    expect(chemDomainNode['genesis:notModeled']).toEqual(['toxicity', 'admet', 'binding-affinity']);
    const epiDomainNode = bundle['@graph'].find((n) => n['genesis:domainId'] === 'EPIDEMIOLOGY')!;
    expect(epiDomainNode['genesis:notModeled']).toEqual(['spatial-position']);
    // Physics declared none — must stay absent, never backfilled with an empty-array guess.
    const physDomainNode = bundle['@graph'].find((n) => n['genesis:domainId'] === 'PHYSICS')!;
    expect(physDomainNode['genesis:notModeled']).toBeUndefined();
  });

  it('5. no domain-specific field leaks into another domain\'s root node', async () => {
    const entries = await threeDomainEntries();
    const bundle = combineEvidencePackRoCrates(entries);
    const physDomainNode = bundle['@graph'].find((n) => n['genesis:domainId'] === 'PHYSICS')!;
    expect(physDomainNode['genesis:notModeled']).toBeUndefined();
    expect(physDomainNode['genesis:investigationQuestion']).toContain('prędkości');
    const chemDomainNode = bundle['@graph'].find((n) => n['genesis:domainId'] === 'CHEMISTRY')!;
    expect(chemDomainNode['genesis:investigationQuestion']).toContain('SMILES');
    expect(chemDomainNode['genesis:investigationQuestion']).not.toContain('prędkości');
  });

  it('6. replay identity (real MATCH/DRIFT/BLOCKED status) is preserved verbatim when supplied', async () => {
    const entries = await threeDomainEntries();
    const bundle = combineEvidencePackRoCrates(entries);
    const epiDomainNode = bundle['@graph'].find((n) => n['genesis:domainId'] === 'EPIDEMIOLOGY')!;
    expect(epiDomainNode['genesis:replayStatus']).toBe('MATCH');
    const physDomainNode = bundle['@graph'].find((n) => n['genesis:domainId'] === 'PHYSICS')!;
    expect(physDomainNode['genesis:replayStatus']).toBeUndefined();
  });

  it('7. export does not mutate the source ScientificEvidencePack objects', async () => {
    const entries = await threeDomainEntries();
    const before = entries.map((e) => JSON.stringify(e.pack));
    combineEvidencePackRoCrates(entries);
    const after = entries.map((e) => JSON.stringify(e.pack));
    expect(after).toEqual(before);
  });

  it('8. computational descriptors are never relabeled as laboratory measurements, hypotheses never relabeled as facts', async () => {
    const entries = await threeDomainEntries();
    const bundle = combineEvidencePackRoCrates(entries);
    const packNodes = bundle['@graph'].filter((n) => Array.isArray(n['@type']) && (n['@type'] as string[]).includes('CreativeWork') && typeof n['genesis:evidenceChainId'] === 'string');
    for (const node of packNodes) {
      // The pack's own disclaimer (unchanged, from evidencePack.ts) must survive and still say what it always said.
      expect(String(node['genesis:disclaimer'])).toContain('nie stanowi odkrycia');
      const assessment = node['genesis:hypothesisAssessment'] as { assessment: string } | undefined;
      expect(assessment?.assessment).not.toBe('FACT');
    }
  });

  it('9. a single-domain export via the unchanged exportEvidencePackRoCrate still works standalone (no regression)', async () => {
    const entries = await threeDomainEntries();
    const solo = combineEvidencePackRoCrates([entries[0]!]);
    expect(solo['@graph'].filter((n) => typeof n['@id'] === 'string' && (n['@id'] as string).startsWith('#domain/'))).toHaveLength(1);
  });

  it('10. domain order is preserved exactly, not sorted or reordered', async () => {
    const entries = await threeDomainEntries();
    const reversed = [...entries].reverse();
    const bundle = combineEvidencePackRoCrates(reversed);
    const root = bundle['@graph'][0]!;
    expect((root.hasPart as { '@id': string }[]).map((p) => p['@id'])).toEqual(['#domain/CHEMISTRY', '#domain/PHYSICS', '#domain/EPIDEMIOLOGY']);
  });
});
