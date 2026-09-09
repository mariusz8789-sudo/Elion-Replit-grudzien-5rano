import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DiscoveryOutcome } from '../core/agent/discoveryOrchestrator';
import type { InquiryLoopInput } from '../core/agent/inquiryLoop';

/**
 * MEMORY → CANDIDATES → EXPERIMENT AND QUESTION SELECTION.
 *
 * "Memory influences the next decision" is easy to assert and hard to earn. The
 * check here is a comparison: the SAME question, on the SAME system, run twice —
 * once with an empty store and once after a real earlier investigation was
 * banked and the process restarted. If memory only recorded history, the two
 * runs would measure the same things and raise the same questions.
 *
 * They do not, and the difference is measured rather than described.
 *
 * ## The regression this file also pins
 *
 * The comparison found something worse than a missing feature: memory was
 * making Genesis reason WORSE. A remembered run skips re-testing what an
 * earlier one refuted, so its own `falsified` list comes back EMPTY — and every
 * reader downstream saw a run that had established nothing. At a true
 * temperature of 1.0 the cold run raised a narrowing question and the warm run
 * raised none at all. Efficiency had been bought by dropping the evidence.
 *
 * Fixed by counting memory's refutations where the reasoning needs them, which
 * is what `alsoRefutedHypothesisIds` exists for. The test below fails if that
 * is ever undone.
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

/** One run with no memory, and one after a real earlier run was banked. */
async function coldAndWarm(truth: number): Promise<{
  cold: { outcome: DiscoveryOutcome; input: InquiryLoopInput };
  warm: { outcome: DiscoveryOutcome; input: InquiryLoopInput };
}> {
  vi.stubGlobal('window', { localStorage: makeFakeStorage() });
  vi.resetModules();
  let orchestrator = await import('../core/agent/discoveryOrchestrator');
  let fixture = await import('../core/agent/proteinFoldingInquiry');
  const coldInput = fixture.proteinFoldingInquiry(truth);
  const cold = orchestrator.runDiscovery({ shape: 'PARAMETER', input: coldInput });

  const store = makeFakeStorage();
  vi.stubGlobal('window', { localStorage: store });
  vi.resetModules();
  const session = await import('../core/agent/inquirySession');
  const seedFixture = await import('../core/agent/proteinFoldingInquiry');
  session.runInquiryAndRemember(seedFixture.proteinFoldingInquiry(truth));

  // A real restart: fresh module graph, same persisted store.
  vi.resetModules();
  vi.stubGlobal('window', { localStorage: store });
  orchestrator = await import('../core/agent/discoveryOrchestrator');
  fixture = await import('../core/agent/proteinFoldingInquiry');
  const warmInput = fixture.proteinFoldingInquiry(truth);
  const warm = orchestrator.runDiscovery({ shape: 'PARAMETER', input: warmInput });

  return { cold: { outcome: cold, input: coldInput }, warm: { outcome: warm, input: warmInput } };
}

describe('memory changes what Genesis measures, not just what it stores', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('THE DEFINING BEHAVIOUR: the remembered run spends fewer measurements on settled questions', async () => {
    const { cold, warm } = await coldAndWarm(1.0);
    if (cold.outcome.status !== 'RAN' || warm.outcome.status !== 'RAN') throw new Error('expected RAN');

    // Same question, same system, different experiments actually performed.
    const coldProbes = cold.outcome.run.rounds.map((r) => r.what);
    const warmProbes = warm.outcome.run.rounds.map((r) => r.what);
    expect(warmProbes).not.toEqual(coldProbes);
    expect(warmProbes.length).toBeLessThan(coldProbes.length);

    // And the reason is memory, named on the outcome itself.
    expect(warm.outcome.priorInvestigation).not.toBeNull();
    expect([...warm.outcome.priorInvestigation!.skippedHypothesisIds].sort()).toEqual([
      'h:cold',
      'h:cool',
      'h:hot',
    ]);
    // Those three are never measured again.
    const warmTested = warm.outcome.run.rounds.flatMap((r) => r.verdicts.map((v) => v.hypothesisId));
    for (const skipped of warm.outcome.priorInvestigation!.skippedHypothesisIds) {
      expect(warmTested).not.toContain(skipped);
    }
  }, 300_000);

  it('THE REGRESSION, pinned: remembering must not make Genesis ask FEWER questions', async () => {
    const { cold, warm } = await coldAndWarm(1.0);
    const { selectNextResearchQuestion } = await import('../core/agent/nextQuestion');

    const coldSelection = selectNextResearchQuestion(cold.outcome, cold.input);
    const warmSelection = selectNextResearchQuestion(warm.outcome, warm.input);

    // The cold run refutes three values and leaves one standing between two of
    // them — a real region to narrow.
    expect(coldSelection.selected?.kind).toBe('NARROW_A_DERIVED_INTERVAL');

    // The warm run refutes nothing IN THIS RUN, because memory already had
    // those refutations. It must still reach the same question: the evidence
    // exists, it is simply older.
    expect(warm.outcome.status === 'RAN' && warm.outcome.run.falsified).toEqual([]);
    expect(warmSelection.selected?.kind).toBe('NARROW_A_DERIVED_INTERVAL');

    // And the question must be grounded in the remembered refutations, not in
    // an empty list.
    expect(warmSelection.selected!.groundedIn.join(' ')).toContain('h:cool');
  }, 300_000);

  it('the remembered run reaches the same region as the run that measured everything', async () => {
    const { cold, warm } = await coldAndWarm(1.0);
    const { selectNextResearchQuestion } = await import('../core/agent/nextQuestion');

    const coldQuestion = selectNextResearchQuestion(cold.outcome, cold.input).selected!.question;
    const warmQuestion = selectNextResearchQuestion(warm.outcome, warm.input).selected!.question;

    // Same region, arrived at with fewer measurements. That is what memory is
    // FOR: the same conclusion, cheaper — not a different, weaker one.
    const region = /\[([\d.]+), ([\d.]+)\]/;
    expect(region.exec(warmQuestion)?.[0]).toBe(region.exec(coldQuestion)?.[0]);
  }, 300_000);

  it('memory does not transfer across a genuinely different system', async () => {
    const store = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: store });
    vi.resetModules();
    const session = await import('../core/agent/inquirySession');
    const seedFixture = await import('../core/agent/proteinFoldingInquiry');
    session.runInquiryAndRemember(seedFixture.proteinFoldingInquiry(1.0));

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: store });
    const { runDiscovery } = await import('../core/agent/discoveryOrchestrator');
    const fixture = await import('../core/agent/proteinFoldingInquiry');
    const other = fixture.proteinFoldingInquiry(1.0);

    const outcome = runDiscovery({
      shape: 'PARAMETER',
      input: { ...other, system: { ...other.system, systemId: 'a-genuinely-different-fold' } },
    });
    if (outcome.status !== 'RAN') throw new Error('expected RAN');
    expect(outcome.priorInvestigation).toBeNull();
  }, 300_000);
});
