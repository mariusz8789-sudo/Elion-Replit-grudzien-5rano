import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collectCrossDomainOpenItems,
  synthesizeNextQuestion,
  type CrossDomainOpenItem,
} from '../core/agent/crossDomainSynthesis';
import type { SavedExperiment } from '../core/scienceMemory';
import type { CyberInvestigationResult } from '../core/agent/cyberInvestigation';
import type { DeciphermentCaseResult } from '../core/agent/decipherment/deciphermentTypes';

/**
 * CROSS-DOMAIN NEXT QUESTION — the master gap plan's P1.3, proven two ways:
 *
 * 1. Unit-level, on hand-built `SavedExperiment` fixtures passed directly
 *    into `collectCrossDomainOpenItems`/`synthesizeNextQuestion` (both take
 *    an optional `records` override for exactly this) — precise control
 *    over the ranking logic itself, across three domains at once.
 * 2. End to end, on REAL persisted records: a real BLOCKED
 *    `runMechanismResearchChain` run (mechanism-research-chain domain) and a
 *    real `saveCyberInvestigationToMemory` call (cyber-security domain),
 *    both landing in the same fake-storage-backed Science Memory, read back
 *    by `synthesizeNextQuestion()` with no override — proving this reads the
 *    real store, not a shape it was handed.
 */

function makeFakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

function baseExperiment(overrides: Partial<SavedExperiment> & Pick<SavedExperiment, 'id' | 'labId'>): SavedExperiment {
  return {
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    experimentId: overrides.id,
    experimentName: overrides.id,
    params: {},
    stats: {},
    honesty: 'simplified',
    honestyNote: 'test fixture',
    equations: [],
    assumptions: [],
    epistemicStatus: 'TEST_FIXTURE',
    contentHash: `hash:${overrides.id}`,
    ...overrides,
  };
}

function cyberResultWithInconclusive(overrides: Partial<CyberInvestigationResult> = {}): CyberInvestigationResult {
  return {
    investigationId: 'inv-1',
    goal: 'Is /profile safe?',
    observations: [{ observationId: 'obs:1', endpoint: '/profile', method: 'GET', statusCode: 200, responseSummary: 'AMBIGUOUS_BODY' }],
    attackSurface: { assets: [{ assetId: 'ENDPOINT::/profile', kind: 'ENDPOINT', derivedFromObservationIds: ['obs:1'] }], trustBoundaries: [] },
    hypotheses: [{
      hypothesisId: 'hyp:AUTH_BYPASS::/profile',
      kind: 'AUTH_BYPASS',
      statement: 'Unauthenticated access to /profile yields sensitive data.',
      derivedFromAssetIds: ['ENDPOINT::/profile'],
      falsifier: { predictedObservable: { statusCode: 200, summaryContains: ['OWNER_RECORD'] }, falsifyingObservable: { statusCodeIn: [401, 403] } },
    }],
    testResults: [{ testId: 'test:1', hypothesisId: 'hyp:AUTH_BYPASS::/profile', executedAt: '2026-01-02T00:00:00.000Z', observedResult: { statusCode: 200, body: 'unclear', responseSummary: 'AMBIGUOUS_BODY' }, provenance: 'SIMULATED' }],
    verdicts: [{ hypothesisId: 'hyp:AUTH_BYPASS::/profile', assessment: 'INCONCLUSIVE', reasoning: 'Observed result matches neither prediction nor falsifier.' }],
    attackPath: null,
    remediation: null,
    retestResult: null,
    retestVerdict: null,
    conflicts: [],
    ...overrides,
  };
}

/** Same fixture, but with a real SUPPORTED+FALSIFIED history preserved as a conflict — the shape
 * `toCyberInvestigationResultFromAdaptive` actually produces from a live `runAdaptiveInvestigation`. */
function cyberResultWithConflict(): CyberInvestigationResult {
  return cyberResultWithInconclusive({
    verdicts: [
      { hypothesisId: 'hyp:AUTH_BYPASS::/profile', assessment: 'SUPPORTED_WITHIN_PROTOCOL', reasoning: 'First test matched the predicted observable.' },
      { hypothesisId: 'hyp:AUTH_BYPASS::/profile', assessment: 'FALSIFIED_WITHIN_PROTOCOL', reasoning: 'Independent retest matched the falsifying observable instead.' },
    ],
    conflicts: ['hyp:AUTH_BYPASS::/profile'],
  });
}

function deciphermentResultWithConflict(): DeciphermentCaseResult {
  return {
    caseId: 'decipherment:seq-1',
    sequenceFingerprint: 'fp:seq-1',
    sourceKind: 'SYNTHETIC',
    glyphCount: 12,
    readings: [{
      readingId: 'reading:1',
      label: 'Caesar shift 3',
      cipherModelId: 'CAESAR',
      candidateKey: null,
      mapping: {},
      output: 'hello world',
      matchedGlyphs: 12,
      unresolvedGlyphs: 0,
      reconstructedGlyphs: 0,
      structuralFit: 0.8,
      linguisticFit: 0.7,
      assumptions: [],
      epistemicStatus: 'SYNTHETIC',
      fingerprint: 'fp:reading:1',
    }],
    hypotheses: [{
      hypothesisId: 'hyp:caesar-3',
      readingId: 'reading:1',
      statement: 'The sequence is a Caesar cipher with shift 3.',
      falsifier: { predictedObservable: 'held-out segment decodes to valid text', falsifyingObservable: 'held-out segment does not decode', testKind: 'NGRAM_COHERENCE' },
      supportingObservations: ['obs:1'],
      contradictions: ['obs:2'],
      assumptions: [],
      unresolvedSymbols: [],
      assessment: 'FALSIFIED_WITHIN_PROTOCOL',
      fingerprint: 'fp:hyp:caesar-3',
    }],
    testsRun: ['test:1', 'test:2'],
    assessmentHistory: { 'hyp:caesar-3': ['SUPPORTED_WITHIN_PROTOCOL', 'FALSIFIED_WITHIN_PROTOCOL'] },
    conflicts: [{ conflictId: 'conflict:1', hypothesisId: 'hyp:caesar-3', history: ['SUPPORTED_WITHIN_PROTOCOL', 'FALSIFIED_WITHIN_PROTOCOL'], fingerprint: 'fp:conflict:1' }],
    seed: 1,
    modelVersion: '1.0.0',
  };
}

describe('collectCrossDomainOpenItems: reads three domains\' own terminal-status vocabularies, invents nothing', () => {
  it('finds an INCONCLUSIVE cyber hypothesis, an UNRESOLVED_CONFLICT decipherment hypothesis, and a BLOCKED research chain, each attributed to its own domain', () => {
    const records: SavedExperiment[] = [
      baseExperiment({ id: 'cyber-1', labId: 'cyber-security', cyberInvestigation: { contractVersion: '1.0.0', result: cyberResultWithInconclusive(), resultFingerprint: 'fp:cyber-1' } }),
      baseExperiment({ id: 'decipherment-1', labId: 'decipherment', deciphermentCase: { contractVersion: '1.0.0', result: deciphermentResultWithConflict(), resultFingerprint: 'fp:decipherment-1' } }),
      baseExperiment({
        id: 'chain-1', labId: 'mechanism-research-chain',
        researchChain: {
          contractVersion: '1.0.0', chainShape: 'MECHANISM', initialQuestion: 'Maximise X?',
          steps: [{ step: 1, question: 'Maximise X?', kind: 'INITIAL', why: 'start', ranSuccessfully: false, savedExperimentIds: [] }],
          selfChosenSteps: 0, stoppedBecause: 'no actuator for this question', terminalStatus: 'BLOCKED', resultFingerprint: 'fp:chain-1',
        },
      }),
      // A settled chain must NOT be reported as open — the whole point of reading terminalStatus honestly.
      baseExperiment({
        id: 'chain-2', labId: 'parameter-research-chain',
        researchChain: {
          contractVersion: '1.0.0', chainShape: 'PARAMETER', initialQuestion: 'Minimise Y?',
          steps: [{ step: 1, question: 'Minimise Y?', kind: 'INITIAL', why: 'start', ranSuccessfully: true, savedExperimentIds: ['x'] }],
          selfChosenSteps: 0, stoppedBecause: 'settled its question', terminalStatus: 'SETTLED', resultFingerprint: 'fp:chain-2',
        },
      }),
    ];

    const items = collectCrossDomainOpenItems(records);
    const byDomain = new Map(items.map((i) => [i.labId, i]));

    expect(items).toHaveLength(3);
    expect(byDomain.get('cyber-security')?.kind).toBe('INCONCLUSIVE_HYPOTHESIS');
    expect(byDomain.get('decipherment')?.kind).toBe('UNRESOLVED_CONFLICT');
    expect(byDomain.get('mechanism-research-chain')?.kind).toBe('BLOCKED_CHAIN');
    expect(byDomain.has('parameter-research-chain')).toBe(false);
  });

  it('reports a real cyber conflict (SUPPORTED and FALSIFIED both on record for the same hypothesis) as UNRESOLVED_CONFLICT, not merely INCONCLUSIVE', () => {
    const records: SavedExperiment[] = [
      baseExperiment({ id: 'cyber-conflict-1', labId: 'cyber-security', cyberInvestigation: { contractVersion: '1.0.0', result: cyberResultWithConflict(), resultFingerprint: 'fp:cyber-conflict-1' } }),
    ];
    const items = collectCrossDomainOpenItems(records);
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('UNRESOLVED_CONFLICT');
    expect(items[0]?.shape).toBe('cyberInvestigation');
    expect(items[0]?.detail).toContain('SUPPORTED_WITHIN_PROTOCOL');
    expect(items[0]?.detail).toContain('FALSIFIED_WITHIN_PROTOCOL');
  });
});

describe('synthesizeNextQuestion: an explicit, non-fabricated ranking, cross-domain', () => {
  const records: SavedExperiment[] = [
    baseExperiment({
      id: 'chain-1', labId: 'mechanism-research-chain', createdAt: '2026-01-01T00:00:00.000Z',
      researchChain: {
        contractVersion: '1.0.0', chainShape: 'MECHANISM', initialQuestion: 'Maximise X?',
        steps: [{ step: 1, question: 'Maximise X?', kind: 'INITIAL', why: 'start', ranSuccessfully: false, savedExperimentIds: [] }],
        selfChosenSteps: 0, stoppedBecause: 'no actuator for this question', terminalStatus: 'BLOCKED', resultFingerprint: 'fp:chain-1',
      },
    }),
    baseExperiment({
      id: 'cyber-1', labId: 'cyber-security', createdAt: '2026-01-02T00:00:00.000Z',
      cyberInvestigation: { contractVersion: '1.0.0', result: cyberResultWithInconclusive(), resultFingerprint: 'fp:cyber-1' },
    }),
    baseExperiment({
      id: 'decipherment-1', labId: 'decipherment', createdAt: '2026-01-03T00:00:00.000Z',
      deciphermentCase: { contractVersion: '1.0.0', result: deciphermentResultWithConflict(), resultFingerprint: 'fp:decipherment-1' },
    }),
  ];

  it('picks the UNRESOLVED_CONFLICT over the INCONCLUSIVE hypothesis and the BLOCKED chain, across three domains', () => {
    const answer = synthesizeNextQuestion(records);
    expect(answer).not.toBeNull();
    if (!answer) return;
    expect(answer.domain).toBe('decipherment');
    expect(answer.question).toBe('The sequence is a Caesar cipher with shift 3.');
    expect(answer.domainsScanned).toBe(3);
    expect(answer.openItemCount).toBe(3);
    // The other two domains are named as alternatives, not silently dropped.
    expect(answer.consideredAlternatives.map((a) => a.domain).sort()).toEqual(['cyber-security', 'mechanism-research-chain']);
    expect(answer.nextTestOrExperiment).toContain('planNextTest');
    expect(answer.expectedDiscrimination).toMatch(/SUPPORTED and FALSIFIED/);
    // No fabricated probability-of-truth number anywhere in the output.
    const serialized = JSON.stringify(answer);
    expect(serialized).not.toMatch(/probability|confidence.?score/i);
  });

  it('names the conflict itself in `conflicts` when it is the picked domain', () => {
    const answer = synthesizeNextQuestion(records);
    expect(answer?.conflicts.length).toBeGreaterThan(0);
    expect(answer?.conflicts[0]).toContain('Caesar cipher');
  });

  it('reports real relations when a genuine Matrix edge connects two records, none when it does not', () => {
    const sharedPack = 'evidence-pack:shared-1';
    const withRelation: SavedExperiment[] = [
      baseExperiment({
        id: 'chain-1', labId: 'mechanism-research-chain', evidencePackId: sharedPack,
        researchChain: {
          contractVersion: '1.0.0', chainShape: 'MECHANISM', initialQuestion: 'Maximise X?',
          steps: [{ step: 1, question: 'Maximise X?', kind: 'INITIAL', why: 'start', ranSuccessfully: false, savedExperimentIds: [] }],
          selfChosenSteps: 0, stoppedBecause: 'no actuator for this question', terminalStatus: 'BLOCKED', resultFingerprint: 'fp:chain-1',
        },
      }),
      baseExperiment({ id: 'related-1', labId: 'mechanism-research-chain', evidencePackId: sharedPack }),
    ];
    const answer = synthesizeNextQuestion(withRelation);
    expect(answer?.relatedPriorWork).toHaveLength(1);
    expect(answer?.relatedPriorWork[0]).toMatchObject({ experimentId: 'related-1', relation: 'SHARED_EVIDENCE_PACK' });
  });

  it('returns null — honestly, not a fabricated question — when nothing is open', () => {
    expect(synthesizeNextQuestion([])).toBeNull();
    const onlySettled: SavedExperiment[] = [
      baseExperiment({
        id: 'chain-2', labId: 'parameter-research-chain',
        researchChain: {
          contractVersion: '1.0.0', chainShape: 'PARAMETER', initialQuestion: 'Minimise Y?',
          steps: [{ step: 1, question: 'Minimise Y?', kind: 'INITIAL', why: 'start', ranSuccessfully: true, savedExperimentIds: ['x'] }],
          selfChosenSteps: 0, stoppedBecause: 'settled its question', terminalStatus: 'SETTLED', resultFingerprint: 'fp:chain-2',
        },
      }),
    ];
    expect(synthesizeNextQuestion(onlySettled)).toBeNull();
  });

  it('deterministically breaks ties within the same priority by which item has gone longest unresolved', () => {
    const older: CrossDomainOpenItem = {
      sourceExperimentId: 'a', labId: 'domain-a', shape: 'cyberInvestigation', kind: 'INCONCLUSIVE_HYPOTHESIS',
      question: 'older', detail: '', createdAt: '2020-01-01T00:00:00.000Z', evidencePackId: null,
    };
    const newer: CrossDomainOpenItem = { ...older, sourceExperimentId: 'b', labId: 'domain-b', question: 'newer', createdAt: '2025-01-01T00:00:00.000Z' };
    const recordFor = (item: CrossDomainOpenItem): SavedExperiment => baseExperiment({
      id: item.sourceExperimentId, labId: item.labId, createdAt: item.createdAt,
      cyberInvestigation: { contractVersion: '1.0.0', result: cyberResultWithInconclusive(), resultFingerprint: `fp:${item.sourceExperimentId}` },
    });
    const answer = synthesizeNextQuestion([recordFor(newer), recordFor(older)]);
    expect(answer?.domain).toBe('domain-a');
  });
});

describe('End to end on REAL persisted records: a real BLOCKED chain and a real cyber investigation, two domains, no override', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads a real BLOCKED runMechanismResearchChain result and a real saved cyber investigation straight out of Science Memory', async () => {
    // This file's own top-level static import of `crossDomainSynthesis` (used by the
    // record-override tests above, which never touch real storage) already loaded
    // `scienceMemory.ts` bound to whatever `window` existed at file-parse time — before
    // `vi.stubGlobal` below runs. `resetModules` forces every module this test imports
    // to re-evaluate fresh, bound to the fake storage stubbed next.
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runMechanismResearchChain } = await import('../core/agent/researchChain');
    const { GENESIS_GENERATOR_CATALOG } = await import('../core/agent/electricalGeneratorLeverCatalog');
    const { buildSavedCyberInvestigation, saveCyberInvestigationToMemory } = await import('../core/scienceMemory');
    const { synthesizeNextQuestion: realSynthesize } = await import('../core/agent/crossDomainSynthesis');

    // A real, previously-proven BLOCKED fixture (mechanismResearchChainGenerator.test.ts):
    // round 1 alone spends the whole 2-experiment budget, nothing is ever refuted, so a
    // retry reproduces the identical untested set forever and the chain stops honestly.
    const chain = runMechanismResearchChain(
      { shape: 'MECHANISM', goal: 'Maximise remaining fuel, at most 2 experiments.', catalog: GENESIS_GENERATOR_CATALOG },
      6,
    );
    expect(chain.terminalStatus).toBe('BLOCKED');

    saveCyberInvestigationToMemory(buildSavedCyberInvestigation(cyberResultWithInconclusive()));

    const answer = realSynthesize();
    expect(answer).not.toBeNull();
    if (!answer) return;
    expect(answer.domainsScanned).toBeGreaterThanOrEqual(2);
    // INCONCLUSIVE_HYPOTHESIS (priority 2) outranks BLOCKED_CHAIN (priority 1).
    expect(answer.domain).toBe('cyber-security');
    expect(answer.consideredAlternatives.some((a) => a.domain === 'mechanism-research-chain' && a.kind === 'BLOCKED_CHAIN')).toBe(true);
  });
});
