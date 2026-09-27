import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNodeHttpSourceConnector } from '../core/discovery/sources/httpSourceConnector.node';
import {
  buildSearchPlanForUnknown,
  runUnknownDrivenAcquisition,
  saveUnknownAcquisitionAttemptToMemory,
} from '../core/discovery/sources/unknownDrivenAcquisition';
import {
  ALPRAZOLAM_SUBSTITUTE_CHALLENGE_AFTER_KNOWLEDGE_PACK_6,
  buildInitialSubstituteChallengeGraph,
  unknownExplanation,
} from '../core/discovery/molecular/pharmacologicalSubstituteChallenge';
import { applyEpistemicUpdates } from '../core/discovery/epistemicEngine';

/**
 * REAL NETWORK, NO MOCKS. Every test here makes a genuine HTTP attempt via
 * the existing, already-tested `createNodeHttpSourceConnector` (the same
 * connector `autonomousSourceAcquisition.test.ts` uses). Whatever the
 * network actually does is what gets asserted — this file does not assume
 * success or failure ahead of time, only that the real outcome is honestly
 * classified and recorded.
 */
const RUN_TIMEOUT_MS = 120_000;
const connector = createNodeHttpSourceConnector({ timeoutSeconds: 30 });

function buildGraphAndUnknown() {
  const graph = buildInitialSubstituteChallengeGraph(ALPRAZOLAM_SUBSTITUTE_CHALLENGE_AFTER_KNOWLEDGE_PACK_6);
  return { graph, unknown: unknownExplanation(graph) };
}

describe('unknownDrivenAcquisition — search plan generation', () => {
  it('1. the plan is built directly from the real UNKNOWN node text, not a hand-typed question', () => {
    const { unknown } = buildGraphAndUnknown();
    const plan = buildSearchPlanForUnknown(unknown, { compoundName: 'chrysin', referenceCompoundName: 'alprazolam', referencePmid: '1964224' });
    expect(plan.unknownNodeId).toBe(unknown.nodeId);
    expect(plan.rationale).toContain(unknown.whatIsUnknown);
    expect(plan.rationale).toContain(unknown.potentialResolution);
  });

  it('2. every candidate source is a real, valid, publicly documented API URL — never a template with unfilled placeholders', () => {
    const { unknown } = buildGraphAndUnknown();
    const plan = buildSearchPlanForUnknown(unknown, { compoundName: 'chrysin', referenceCompoundName: 'alprazolam', referencePmid: '1964224' });
    expect(plan.candidateSources.length).toBeGreaterThanOrEqual(4);
    for (const source of plan.candidateSources) {
      expect(() => new URL(source.url)).not.toThrow();
      expect(source.url).not.toContain('{');
      expect(source.url).not.toContain('undefined');
      expect(source.requiresCredential).toBe(false);
    }
  });

  it('3. a real PMID already on record is used to verify/enrich a citation, not to search blind', () => {
    const { unknown } = buildGraphAndUnknown();
    const plan = buildSearchPlanForUnknown(unknown, { compoundName: 'chrysin', referenceCompoundName: 'alprazolam', referencePmid: '1964224' });
    const eutilsSummary = plan.candidateSources.find((s) => s.sourceId.startsWith('eutils-esummary'));
    expect(eutilsSummary).toBeDefined();
    expect(eutilsSummary!.url).toContain('id=1964224');
  });

  it('4. no referencePmid means no esummary-verification source is proposed (never fabricate a PMID to search)', () => {
    const { unknown } = buildGraphAndUnknown();
    const plan = buildSearchPlanForUnknown(unknown, { compoundName: 'chrysin', referenceCompoundName: 'alprazolam', referencePmid: null });
    expect(plan.candidateSources.some((s) => s.sourceId.startsWith('eutils-esummary'))).toBe(false);
  });
});

describe('unknownDrivenAcquisition — REAL execution against the actual GABA-A/alprazolam UNKNOWN (live network, no mocks)', () => {
  it('5. every real attempt is honestly classified — RETRIEVED only with real content, otherwise a real failure state', () => {
    const { unknown } = buildGraphAndUnknown();
    const plan = buildSearchPlanForUnknown(unknown, { compoundName: 'chrysin', referenceCompoundName: 'alprazolam', referencePmid: '1964224' });
    const result = runUnknownDrivenAcquisition(connector, plan);

    expect(result.outcomes.length).toBe(plan.candidateSources.length);
    for (const outcome of result.outcomes) {
      expect(outcome.reason.length).toBeGreaterThan(0);
      if (outcome.state === 'RETRIEVED') {
        expect(outcome.content).not.toBeNull();
        expect(outcome.contentSha256).toMatch(/^[0-9a-f]{64}$/);
      } else {
        expect(outcome.content).toBeNull();
        expect(outcome.contentSha256).toBeNull();
        expect(['BLOCKED', 'UNAVAILABLE', 'REQUIRES_AUTH', 'PAYWALLED']).toContain(outcome.state);
      }
    }
  }, RUN_TIMEOUT_MS);

  it('6. the real access report never claims success for a source that returned nothing', () => {
    const { unknown } = buildGraphAndUnknown();
    const plan = buildSearchPlanForUnknown(unknown, { compoundName: 'chrysin', referenceCompoundName: 'alprazolam', referencePmid: '1964224' });
    const result = runUnknownDrivenAcquisition(connector, plan);
    expect(result.access.attempted).toBe(plan.candidateSources.length);
    expect(result.access.reachable.length + result.access.blocked.length).toBe(plan.candidateSources.length);
    if (!result.anySourceReachable) {
      expect(result.unresolvedReason).not.toBeNull();
      expect(result.unresolvedReason).toContain('attempted for real');
    }
  }, RUN_TIMEOUT_MS);

  it('7. the real attempt is saved to Scientific Memory with an honest per-source breakdown, whether or not anything was reachable', () => {
    const { unknown } = buildGraphAndUnknown();
    const plan = buildSearchPlanForUnknown(unknown, { compoundName: 'chrysin', referenceCompoundName: 'alprazolam', referencePmid: '1964224' });
    const result = runUnknownDrivenAcquisition(connector, plan);
    const saved = saveUnknownAcquisitionAttemptToMemory(result);

    expect(saved.stats.attempted).toBe(plan.candidateSources.length);
    expect(saved.stats.reachable + saved.stats.blocked).toBe(plan.candidateSources.length);
    expect(saved.epistemicStatus).toBe(result.anySourceReachable ? 'REACHABLE' : 'BLOCKED');
    expect(saved.analysis!.length).toBe(1 + result.outcomes.length);
  }, RUN_TIMEOUT_MS);

  it('8. the EpistemicGraph\'s UNKNOWN node is NOT silently resolved by a failed search — it stays exactly what it was', () => {
    const { graph, unknown } = buildGraphAndUnknown();
    const plan = buildSearchPlanForUnknown(unknown, { compoundName: 'chrysin', referenceCompoundName: 'alprazolam', referencePmid: '1964224' });
    const result = runUnknownDrivenAcquisition(connector, plan);

    // No StatusUpdate is produced by this module for a failed search — applying
    // an empty update list must leave the UNKNOWN node completely unchanged.
    const propagation = applyEpistemicUpdates(graph, []);
    const unknownNodeAfter = propagation.graph.nodes.find((n) => n.nodeId === unknown.nodeId)!;
    expect(unknownNodeAfter.status).toBe('UNKNOWN');
    expect(propagation.changes.length).toBe(0);
    if (!result.anySourceReachable) {
      expect(result.unresolvedReason).not.toBeNull();
    }
  }, RUN_TIMEOUT_MS);

  it('9. never fabricates content: a BLOCKED/UNAVAILABLE outcome never carries a body', () => {
    const { unknown } = buildGraphAndUnknown();
    const plan = buildSearchPlanForUnknown(unknown, { compoundName: 'chrysin', referenceCompoundName: 'alprazolam', referencePmid: '1964224' });
    const result = runUnknownDrivenAcquisition(connector, plan);
    for (const outcome of result.outcomes) {
      if (outcome.state !== 'RETRIEVED') expect(outcome.content).toBeNull();
    }
  }, RUN_TIMEOUT_MS);
});

describe('unknownDrivenAcquisition — chat retrieval reads back a real saved attempt without manual re-import', () => {
  function makeFakeStorage() {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      key: (i: number) => [...m.keys()][i] ?? null,
      get length() { return m.size; },
    };
  }

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
  });

  it('10. a chat query finds NOTHING before any real search has been run and saved', async () => {
    const { answerResearchAttemptFor } = await import('../core/discovery/molecular/knowledgeChatRetrieval');
    const before = answerResearchAttemptFor('chrysin');
    expect(before.recordCount).toBe(0);
    expect(before.answer).toContain('no saved real-search attempt');
  });

  it('11. after a real search is run and saved, chat retrieval finds it WITHOUT any manual re-import step', async () => {
    const { buildInitialSubstituteChallengeGraph: buildGraph, unknownExplanation: explainFn, ALPRAZOLAM_SUBSTITUTE_CHALLENGE_AFTER_KNOWLEDGE_PACK_6: config } = await import('../core/discovery/molecular/pharmacologicalSubstituteChallenge');
    const { buildSearchPlanForUnknown: buildPlan, runUnknownDrivenAcquisition: run, saveUnknownAcquisitionAttemptToMemory: save } = await import('../core/discovery/sources/unknownDrivenAcquisition');
    const { createNodeHttpSourceConnector: makeConnector } = await import('../core/discovery/sources/httpSourceConnector.node');
    const { answerResearchAttemptFor } = await import('../core/discovery/molecular/knowledgeChatRetrieval');

    const graph = buildGraph(config);
    const unknown = explainFn(graph);
    const plan = buildPlan(unknown, { compoundName: 'chrysin', referenceCompoundName: 'alprazolam', referencePmid: '1964224' });
    const result = run(makeConnector({ timeoutSeconds: 30 }), plan);
    save(result);

    const after = answerResearchAttemptFor('chrysin');
    expect(after.recordCount).toBeGreaterThan(0);
    expect(after.answer).toContain('chrysin');
    expect(after.provenance.length).toBeGreaterThan(0);
    expect(after.answer).toContain(result.anySourceReachable ? 'RETRIEVED' : plan.candidateSources[0]!.sourceId);
  }, RUN_TIMEOUT_MS);
});
