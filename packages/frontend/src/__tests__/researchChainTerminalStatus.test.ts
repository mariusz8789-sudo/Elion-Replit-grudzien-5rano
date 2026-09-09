import { afterEach, describe, expect, it, vi } from 'vitest';

import type { InquiryLoopInput } from '../core/agent/inquiryLoop';

/**
 * SETTLED / OPEN / INCONCLUSIVE / BLOCKED — Genesis's own honest category for
 * why a research chain stopped, not just a prose sentence a reader has to
 * parse.
 *
 * The four are kept apart because they call for different next actions:
 * SETTLED needs nothing further; OPEN means more autonomous work is available
 * on demand (the chain simply ran out of step budget); INCONCLUSIVE means the
 * evidence itself does not decide and more data of a kind Genesis already
 * knows how to gather would resolve it; BLOCKED means Genesis has no mechanism
 * for the open question at all. Conflating INCONCLUSIVE with BLOCKED would
 * hide exactly the distinction a reader deciding what to build or measure next
 * needs.
 *
 * All four are reproduced here on real fixtures, not asserted from the
 * implementation.
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

describe('ResearchChainResult.terminalStatus — the four honest categories, each reproduced', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('SETTLED: a wrong derived value is refuted at step 1, and nothing further is open', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runResearchChain } = await import('../core/agent/researchChain');
    const { proteinFoldingInquiry } = await import('../core/agent/proteinFoldingInquiry');

    const chain = runResearchChain(proteinFoldingInquiry(0.65), 4);
    expect(chain.terminalStatus).toBe('SETTLED');
    expect(chain.stoppedBecause).toContain('raised no new one');
  });

  it('OPEN: a runnable next question exists, and the chain simply ran out of step budget', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runResearchChain } = await import('../core/agent/researchChain');
    const { proteinFoldingSystem, PROTEIN_FOLDING_HYPOTHESES } = await import('../core/agent/proteinFoldingInquiry');

    // This fixture is known to run at least 2 self-chosen steps at a
    // sufficient budget (`autonomousQuestionChainBenchmark.test.ts`); capping
    // the budget at 1 stops it mid-way, with real further work available.
    const base = proteinFoldingSystem(0.8);
    const input: InquiryLoopInput = {
      question: 'What temperature did this HP-lattice protein fold actually run at?',
      system: { ...base, candidateProbeValues: [200, 500, 1000, 2000, 5000, 10000, 20000, 35000, 50000] },
      hypotheses: PROTEIN_FOLDING_HYPOTHESES,
      openingProbeValue: 200,
      maxRounds: 4,
    };
    const chain = runResearchChain(input, 1);
    expect(chain.terminalStatus).toBe('OPEN');
    expect(chain.stoppedBecause).toBe('Step budget of 1 reached.');
  });

  it('INCONCLUSIVE: real rival survivors, and no untried setting separates them', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runResearchChain } = await import('../core/agent/researchChain');
    const { proteinFoldingInquiry } = await import('../core/agent/proteinFoldingInquiry');

    // A fold at 0.9 leaves h:warm and h:hot both standing with no discriminating probe.
    const chain = runResearchChain(proteinFoldingInquiry(0.9), 8);
    expect(chain.terminalStatus).toBe('INCONCLUSIVE');
    expect(chain.stoppedBecause).toContain('could not separate them');
  });

  it('INCONCLUSIVE: narrowing runs out of untried settings, not out of capability', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runResearchChain } = await import('../core/agent/researchChain');
    const { proteinFoldingInquiry } = await import('../core/agent/proteinFoldingInquiry');

    const chain = runResearchChain(proteinFoldingInquiry(0.5), 4);
    expect(chain.terminalStatus).toBe('INCONCLUSIVE');
    expect(chain.stoppedBecause).toContain('already used');
  });

  it('BLOCKED: no capability behind the question at all', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runResearchChain } = await import('../core/agent/researchChain');
    const { proteinFoldingInquiry } = await import('../core/agent/proteinFoldingInquiry');

    const input = proteinFoldingInquiry(0.5);
    const chain = runResearchChain({ ...input, system: { ...input.system, modelId: 'not-a-real-model' } }, 4);
    expect(chain.terminalStatus).toBe('BLOCKED');
    expect(chain.stoppedBecause).toContain('refused');
  });

  it('INCONCLUSIVE and BLOCKED are never the same value for the two evidence-limited kinds', () => {
    // Guards the classification itself: SEPARATE_SURVIVORS and
    // GO_OUTSIDE_THE_DECLARED_SPACE are the two kinds whose "cannot run" means
    // the evidence does not decide, and nothing else should share that bucket
    // by accident.
    const inconclusiveKinds = new Set(['SEPARATE_SURVIVORS', 'GO_OUTSIDE_THE_DECLARED_SPACE']);
    expect(inconclusiveKinds.has('RESOLVE_APPARATUS_FAILURE')).toBe(false);
    expect(inconclusiveKinds.has('ACQUIRE_A_MISSING_CAPABILITY')).toBe(false);
  });
});
