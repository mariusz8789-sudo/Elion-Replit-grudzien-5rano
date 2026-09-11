import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  ResearchChainResult,
  ResearchStep,
  classifyUnseparatedSurvivors as ClassifyUnseparatedSurvivorsFn,
  summarizeResearchBranches as SummarizeResearchBranchesFn,
} from '../core/agent/researchChain';
import type { DiscoveryOutcome } from '../core/agent/discoveryOrchestrator';
import type { InquiryLoopInput, InquiryLoopResult, ParameterHypothesis } from '../core/agent/inquiryLoop';

/**
 * C1 — "DRZEWO BADAWCZE + STOP NA POZIOMIE KAMPANII" (the C1 task).
 *
 * Two things proven here, each against real behaviour rather than a
 * description of intended behaviour:
 *
 * 1. `summarizeResearchBranches` reads a DERIVED trunk-and-leaves tree off
 *    `researchChain.ts`'s already-linear `steps` — both against hand-built
 *    fixtures (so every leaf status is independently checkable) and against
 *    a REAL two-step chain from the seeded HP-lattice solver.
 * 2. `classifyUnseparatedSurvivors` — the pure decision behind the fix that
 *    stops `runResearchChain` reporting BLOCKED (an architecture gap) when
 *    the result was actually already decisive (SETTLED). Tested directly
 *    against every survivor-count combination, because a full sweep of the
 *    real solver's declared temperature range never happened to land on
 *    this exact edge — asserting this from a fixture that doesn't reliably
 *    exist would be worse than testing the extracted decision on its own.
 *
 * `researchChain.ts` imports `scienceMemory.ts`, whose storage backend binds
 * to `window` on first access — so every test here stubs `window` BEFORE
 * dynamically importing `researchChain.ts`, exactly like
 * `researchChainManifest.test.ts` already does, rather than a top-level
 * static import that would bind before any stub runs.
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

function hypothesis(id: string): ParameterHypothesis {
  return { hypothesisId: id, statement: id, claimedValues: {}, priorConfidence: 0.5 };
}

function ranOutcome(surviving: readonly string[], falsified: readonly string[]): DiscoveryOutcome {
  // `summarizeResearchBranches` reads only `outcome.run.native` when
  // `outcome.status === 'RAN'` — everything else here exists purely to
  // satisfy the type, per the cast below.
  const native: Partial<InquiryLoopResult> = {
    survivingHypothesisIds: surviving,
    falsifiedHypothesisIds: falsified,
  };
  return {
    status: 'RAN',
    contractVersion: '1.0.0',
    shape: 'PARAMETER',
    admission: { status: 'REAL', why: 'test fixture' },
    run: { native },
    generated: null,
    priorInvestigation: null,
  } as unknown as DiscoveryOutcome;
}

function fakeStep(step: number, ids: readonly string[], surviving: readonly string[], falsified: readonly string[]): ResearchStep {
  const input: InquiryLoopInput = {
    question: `q${step}`,
    system: {} as InquiryLoopInput['system'],
    hypotheses: ids.map(hypothesis),
    openingProbeValue: 0,
    maxRounds: 4,
  };
  return {
    step,
    question: input.question,
    kind: step === 1 ? 'INITIAL' : 'SEPARATE_SURVIVORS',
    why: 'test',
    outcome: ranOutcome(surviving, falsified),
    executedInput: input,
    narrowing: null,
    remembered: [],
  };
}

async function loadResearchChain() {
  vi.stubGlobal('window', { localStorage: makeFakeStorage() });
  return import('../core/agent/researchChain');
}

describe('summarizeResearchBranches — a derived trunk-and-leaves view, not a second executor', () => {
  afterEach(() => vi.unstubAllGlobals());
  let summarizeResearchBranches: typeof SummarizeResearchBranchesFn;

  it('an empty chain (no steps) summarizes to an empty tree', async () => {
    ({ summarizeResearchBranches } = await loadResearchChain());
    const result: ResearchChainResult = {
      contractVersion: '1.0.0',
      steps: [],
      selfChosenSteps: 0,
      stoppedBecause: 'n/a',
      terminalStatus: 'BLOCKED',
    };
    expect(summarizeResearchBranches(result)).toEqual({ initialHypothesisIds: [], sharedTrunkSteps: [], leaves: [] });
  });

  it('three declared hypotheses: one falsified at step 2, one still surviving, one never tested', async () => {
    ({ summarizeResearchBranches } = await loadResearchChain());
    // Step 1 runs all three; H3 is narrowed away (never appears in either
    // list again) before it is ever measured — UNTESTED, not FALSIFIED.
    const step1 = fakeStep(1, ['H1', 'H2', 'H3'], ['H1', 'H2'], []);
    // Step 2 only re-runs H1/H2 (H3 already dropped from the declared set);
    // H2 is falsified this step, H1 keeps surviving.
    const step2 = fakeStep(2, ['H1', 'H2'], ['H1'], ['H2']);
    const result: ResearchChainResult = {
      contractVersion: '1.0.0',
      steps: [step1, step2],
      selfChosenSteps: 1,
      stoppedBecause: 'test',
      terminalStatus: 'SETTLED',
    };

    const tree = summarizeResearchBranches(result);
    expect(tree.initialHypothesisIds).toEqual(['H1', 'H2', 'H3']);
    expect(tree.sharedTrunkSteps).toEqual([1, 2]);
    expect(tree.leaves).toEqual([
      { hypothesisId: 'H1', finalStatus: 'SURVIVING', eliminatedAtStep: null },
      { hypothesisId: 'H2', finalStatus: 'FALSIFIED', eliminatedAtStep: 2 },
      { hypothesisId: 'H3', finalStatus: 'UNTESTED', eliminatedAtStep: null },
    ]);
  });

  it('a hypothesis falsified on step 1 itself is recorded as eliminated at step 1, not later', async () => {
    ({ summarizeResearchBranches } = await loadResearchChain());
    const step1 = fakeStep(1, ['H1', 'H2'], ['H1'], ['H2']);
    const result: ResearchChainResult = {
      contractVersion: '1.0.0',
      steps: [step1],
      selfChosenSteps: 0,
      stoppedBecause: 'test',
      terminalStatus: 'SETTLED',
    };
    const tree = summarizeResearchBranches(result);
    expect(tree.leaves.find((l) => l.hypothesisId === 'H2')).toEqual({
      hypothesisId: 'H2',
      finalStatus: 'FALSIFIED',
      eliminatedAtStep: 1,
    });
  });

  it('a refused step (outcome.status !== RAN) contributes no survivor/falsified data, only trunk', async () => {
    ({ summarizeResearchBranches } = await loadResearchChain());
    const refusedStep: ResearchStep = {
      step: 1,
      question: 'q',
      kind: 'INITIAL',
      why: 'test',
      outcome: { status: 'REFUSED', contractVersion: '1.0.0', shape: 'PARAMETER', stage: 'ADMISSION', admission: { status: 'REFUSED', why: 'no model' } } as never,
      executedInput: { question: 'q', system: {} as InquiryLoopInput['system'], hypotheses: [hypothesis('H1')], openingProbeValue: 0, maxRounds: 4 },
      narrowing: null,
      remembered: [],
    };
    const result: ResearchChainResult = {
      contractVersion: '1.0.0',
      steps: [refusedStep],
      selfChosenSteps: 0,
      stoppedBecause: 'refused',
      terminalStatus: 'BLOCKED',
    };
    const tree = summarizeResearchBranches(result);
    expect(tree.sharedTrunkSteps).toEqual([1]);
    expect(tree.leaves).toEqual([{ hypothesisId: 'H1', finalStatus: 'UNTESTED', eliminatedAtStep: null }]);
  });

  it('against a REAL two-step chain from the seeded HP-lattice solver: shape invariants hold', async () => {
    const { runResearchChain, summarizeResearchBranches: summarize } = await loadResearchChain();
    const { proteinFoldingInquiry } = await import('../core/agent/proteinFoldingInquiry');

    const chain = runResearchChain(proteinFoldingInquiry(0.5), 4);
    expect(chain.steps).toHaveLength(2);

    const tree = summarize(chain);
    expect(tree.sharedTrunkSteps).toEqual([1, 2]);
    expect(tree.initialHypothesisIds).toEqual(chain.steps[0]!.executedInput.hypotheses.map((h) => h.hypothesisId));
    expect(tree.leaves).toHaveLength(tree.initialHypothesisIds.length);
    // Every leaf accounts for exactly one declared hypothesis, in the same order.
    expect(tree.leaves.map((l) => l.hypothesisId)).toEqual(tree.initialHypothesisIds);
    // A FALSIFIED leaf always carries the step it was eliminated at; every
    // other status never does — the two facts are never both true or both false.
    for (const leaf of tree.leaves) {
      expect(leaf.finalStatus === 'FALSIFIED').toBe(leaf.eliminatedAtStep !== null);
    }
  });
});

describe('classifyUnseparatedSurvivors — campaign-level STOP, tested directly', () => {
  afterEach(() => vi.unstubAllGlobals());
  let classifyUnseparatedSurvivors: typeof ClassifyUnseparatedSurvivorsFn;

  it('exactly one survivor overall: SETTLED, not BLOCKED — the fix this task was for', async () => {
    ({ classifyUnseparatedSurvivors } = await loadResearchChain());
    const result = classifyUnseparatedSurvivors(['H1']);
    expect(result.terminalStatus).toBe('SETTLED');
    expect(result.detail).toContain('H1');
    expect(result.detail).toContain('survived at all');
  });

  it('zero survivors overall: BLOCKED — no declared candidate to re-test at all', async () => {
    ({ classifyUnseparatedSurvivors } = await loadResearchChain());
    const result = classifyUnseparatedSurvivors([]);
    expect(result.terminalStatus).toBe('BLOCKED');
  });

  it('two or more survivors overall (but fewer than two DECLARED, per the caller-side filter): still BLOCKED, not falsely SETTLED', async () => {
    ({ classifyUnseparatedSurvivors } = await loadResearchChain());
    // This is the case the old code silently mishandled: real rivals remain
    // (derived ones), just none the chain can re-test — an actuator gap,
    // not a decided question. Must never read as SETTLED.
    const result = classifyUnseparatedSurvivors(['derived-A', 'derived-B']);
    expect(result.terminalStatus).toBe('BLOCKED');
  });
});

describe('SavedResearchChainManifest.branches — additive, fingerprint-stable', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a real PARAMETER chain banks branches matching summarizeResearchBranches(chain), and replay still MATCHes', async () => {
    const { runResearchChain, summarizeResearchBranches } = await loadResearchChain();
    const { proteinFoldingInquiry } = await import('../core/agent/proteinFoldingInquiry');
    const { listExperiments, replaySavedResearchChainManifest } = await import('../core/scienceMemory');

    const chain = runResearchChain(proteinFoldingInquiry(0.5), 4);
    const expectedBranches = summarizeResearchBranches(chain);

    const manifestRecords = listExperiments().filter((e) => e.researchChain !== undefined);
    expect(manifestRecords).toHaveLength(1);
    const manifest = manifestRecords[0]!.researchChain!;

    // `branches` was added AFTER `resultFingerprint` became load-bearing for
    // every already-saved chain, so it must never enter that hash — proven
    // here by replay still reporting MATCH with the new field present.
    expect(manifest.branches).toEqual(expectedBranches);
    const replay = replaySavedResearchChainManifest(manifestRecords[0]!);
    expect(replay.status).toBe('MATCH');
  });

  it('a manifest saved before this field existed (no branches key) still passes the type guard', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { isSavedResearchChainManifest } = await import('../core/scienceMemory');
    const legacyShaped = {
      contractVersion: '1.0.0',
      chainShape: 'PARAMETER',
      initialQuestion: 'q',
      steps: [{ step: 1, question: 'q', kind: 'INITIAL', why: 'w', ranSuccessfully: true, savedExperimentIds: ['x'] }],
      selfChosenSteps: 0,
      stoppedBecause: 'done',
      terminalStatus: 'SETTLED',
      resultFingerprint: 'irrelevant-for-this-check',
      // no `branches` key at all — exactly what a pre-existing record looks like.
    };
    expect(isSavedResearchChainManifest(legacyShaped)).toBe(true);
  });
});

describe('CHAT ENTRY — unaffected by today\'s researchChain.ts changes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resolveCommand.ts still imports and resolves, unbroken by the branches/SETTLED edits', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const mod = await import('../core/scienceChat/resolveCommand');
    expect(typeof mod.resolveCommand).toBe('function');
  });
});
