import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  executePreregisteredHypotheses, executePreregisteredHypothesesAsync, generateCompetingHypotheses,
  HYPOTHESIS_PROBLEMS, preregisterHypotheses, type HypothesisLoopResult,
} from '../core/experimentFabric/hypothesisLoop';
import { combineEvidencePackRoCrates, type DomainEvidenceEntry } from '../core/experimentFabric/evidencePackRoCrate';

/**
 * CROSS-DOMAIN MEMORY LOOP — proves the EXISTING Scientific Memory
 * (`scienceMemory.ts`) can persist ONE combined epidemiology + particle
 * physics + molecular chemistry investigation as ONE record, and load it
 * back without losing provenance, domain identity, uncertainty or replay
 * identity. No second memory system, no reconstructed RO-Crate: the saved
 * bundle must be the exact same object `combineEvidencePackRoCrates`
 * (unchanged, from Mission D) already produces.
 *
 * Chemistry is real BACKEND_REAL_ENGINE (RDKit); only its HTTP transport is
 * mocked, using the exact same real captured descriptor values as the other
 * RDKit-backed tests in this codebase. Epidemiology and physics are local,
 * synchronous, real models — no mocking needed.
 */
function makeFakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

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

async function threeDomainInputs() {
  const epi = runLocalLoop('problem:lowest-modeled-deaths');
  const phys = runLocalLoop('problem:particle-relativistic-kinetic-energy-velocity');
  vi.stubGlobal('fetch', rdkitFetchMock());
  const chem = await runChemLoop();
  return [
    { domainId: 'EPIDEMIOLOGY', loopResult: epi, question: epi.preregistration.set.problem.statement, replayStatus: 'MATCH', notModeled: ['spatial-position'] },
    { domainId: 'PHYSICS', loopResult: phys, question: phys.preregistration.set.problem.statement },
    { domainId: 'CHEMISTRY', loopResult: chem, question: chem.preregistration.set.problem.statement, notModeled: ['toxicity', 'admet', 'binding-affinity'] },
  ];
}

describe('Scientific Memory — cross-domain investigation persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('1. saves all three independently-executed domains as ONE SavedExperiment record', async () => {
    const domains = await threeDomainInputs();
    const { saveInvestigationToMemory, listExperiments } = await import('../core/scienceMemory');
    saveInvestigationToMemory(domains);
    const all = listExperiments();
    expect(all).toHaveLength(1);
    expect(all[0]!.investigation!.domains.map((d) => d.domainId)).toEqual(['EPIDEMIOLOGY', 'PHYSICS', 'CHEMISTRY']);
  });

  it('2. save -> load round trip preserves the investigation without loss', async () => {
    const domains = await threeDomainInputs();
    const { saveInvestigationToMemory, listExperiments } = await import('../core/scienceMemory');
    const saved = saveInvestigationToMemory(domains);
    const loaded = listExperiments().find((entry) => entry.id === saved.id)!;
    expect(loaded.investigation).toEqual(saved.investigation);
  });

  it('3. investigationFingerprint is deterministic for identical real inputs', async () => {
    const domains = await threeDomainInputs();
    const { buildSavedInvestigation } = await import('../core/scienceMemory');
    const first = buildSavedInvestigation(domains);
    const second = buildSavedInvestigation(domains);
    expect(first.investigationFingerprint).toBe(second.investigationFingerprint);
    expect(first.investigationFingerprint).toMatch(/^[0-9a-f]+$/);
  });

  it('4. the persisted roCrate is the SAME bundle combineEvidencePackRoCrates already produces — not a reconstructed duplicate', async () => {
    const domains = await threeDomainInputs();
    const { buildSavedInvestigation } = await import('../core/scienceMemory');
    const investigation = buildSavedInvestigation(domains);
    const expectedEntries: DomainEvidenceEntry[] = domains.map((d) => ({
      domainId: d.domainId, question: d.question, pack: d.loopResult.packs[0]!,
      ...(('replayStatus' in d && d.replayStatus !== undefined) ? { replayStatus: d.replayStatus } : {}),
      ...(('notModeled' in d && d.notModeled !== undefined) ? { notModeled: d.notModeled } : {}),
    }));
    const expected = combineEvidencePackRoCrates(expectedEntries);
    expect(JSON.stringify(investigation.roCrate)).toBe(JSON.stringify(expected));
  });

  it('5. domain identity, question, and NOT_MODELED/UNKNOWN declarations survive save -> load verbatim', async () => {
    const domains = await threeDomainInputs();
    const { saveInvestigationToMemory, listExperiments } = await import('../core/scienceMemory');
    saveInvestigationToMemory(domains);
    const loaded = listExperiments()[0]!.investigation!;
    const epi = loaded.domains.find((d) => d.domainId === 'EPIDEMIOLOGY')!;
    const phys = loaded.domains.find((d) => d.domainId === 'PHYSICS')!;
    const chem = loaded.domains.find((d) => d.domainId === 'CHEMISTRY')!;
    expect(epi.notModeled).toEqual(['spatial-position']);
    expect(epi.replayStatus).toBe('MATCH');
    expect(chem.notModeled).toEqual(['toxicity', 'admet', 'binding-affinity']);
    // Physics declared no notModeled/replayStatus — must stay absent, never backfilled.
    expect(phys.notModeled).toBeUndefined();
    expect(phys.replayStatus).toBeUndefined();
    expect(phys.question).toContain('prędkości');
    expect(chem.question).toContain('SMILES');
  });

  it('6. no domain-specific field leaks into another domain\'s saved record', async () => {
    const domains = await threeDomainInputs();
    const { buildSavedInvestigation } = await import('../core/scienceMemory');
    const investigation = buildSavedInvestigation(domains);
    const epi = investigation.domains.find((d) => d.domainId === 'EPIDEMIOLOGY')!;
    const chem = investigation.domains.find((d) => d.domainId === 'CHEMISTRY')!;
    expect(epi.hypothesisLoop.problem.domainId).not.toBe(chem.hypothesisLoop.problem.domainId);
    expect(chem.notModeled).not.toEqual(epi.notModeled);
  });

  it('7. replaying the saved investigation re-executes every domain and reports MATCH end-to-end', async () => {
    const domains = await threeDomainInputs();
    const { saveInvestigationToMemory, replaySavedInvestigation } = await import('../core/scienceMemory');
    const saved = saveInvestigationToMemory(domains);
    vi.stubGlobal('fetch', rdkitFetchMock());
    const replay = await replaySavedInvestigation(saved.investigation!);
    expect(replay.status).toBe('MATCH');
    expect(replay.domains).toHaveLength(3);
    expect(replay.domains.every((d) => d.replay.status === 'MATCH')).toBe(true);
    expect(replay.domains.map((d) => d.domainId)).toEqual(['EPIDEMIOLOGY', 'PHYSICS', 'CHEMISTRY']);
  });

  it('8. a tampered outcome status is caught as DRIFT on replay, never silently accepted as MATCH', async () => {
    const domains = await threeDomainInputs();
    const { saveInvestigationToMemory, replaySavedInvestigation, isSavedInvestigation } = await import('../core/scienceMemory');
    const saved = saveInvestigationToMemory(domains);
    const tampered = {
      ...saved.investigation!,
      domains: saved.investigation!.domains.map((d, i) => i === 0
        ? { ...d, hypothesisLoop: { ...d.hypothesisLoop, outcomes: d.hypothesisLoop.outcomes.map((o, j) => j === 0 ? { ...o, status: 'FALSIFIED' as const } : o) } }
        : d),
    };
    expect(isSavedInvestigation(tampered)).toBe(true); // structurally still valid — tampering is a content problem, not a shape problem
    vi.stubGlobal('fetch', rdkitFetchMock());
    const replay = await replaySavedInvestigation(tampered);
    expect(replay.status).toBe('DRIFT');
  });

  it('9. malformed investigation input is rejected by saveExperiment, never silently accepted', async () => {
    const { saveExperiment } = await import('../core/scienceMemory');
    expect(() => saveExperiment({
      labId: 'x', experimentId: 'x', experimentName: 'x', params: {}, honesty: 'simplified', honestyNote: 'x',
      investigation: { contractVersion: '1.0.0', domains: [], roCrate: { '@context': [], '@graph': [] }, investigationFingerprint: 'x' } as never,
    })).toThrow(/dochodzenia wielodomenowego/);
  });

  it('10. building an investigation from zero domains is rejected, never silently produces an empty record', async () => {
    const { buildSavedInvestigation } = await import('../core/scienceMemory');
    expect(() => buildSavedInvestigation([])).toThrow(/co najmniej jedną domenę/);
  });

  it('11. all three real HypothesisLoop results (with real evidence packs) survive inside the one record', async () => {
    const domains = await threeDomainInputs();
    const { saveInvestigationToMemory, listExperiments } = await import('../core/scienceMemory');
    saveInvestigationToMemory(domains);
    const loaded = listExperiments()[0]!.investigation!;
    for (const domain of loaded.domains) {
      expect(domain.hypothesisLoop.outcomes.length).toBeGreaterThan(0);
      expect(domain.hypothesisLoop.loopFingerprint).toMatch(/^[0-9a-f]+$/);
    }
  });
});
