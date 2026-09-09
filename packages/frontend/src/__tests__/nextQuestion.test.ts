import { describe, expect, it } from 'vitest';

import { runDiscovery } from '../core/agent/discoveryOrchestrator';
import { selectNextResearchQuestion } from '../core/agent/nextQuestion';
import {
  PROTEIN_FOLDING_HYPOTHESES,
  proteinFoldingInquiry,
  proteinFoldingSystem,
} from '../core/agent/proteinFoldingInquiry';
import { GENESIS_GENERATOR_CATALOG } from '../core/agent/electricalGeneratorLeverCatalog';
import { GENESIS_FLOOD_CATALOG } from '../core/agent/worldGoalIntent';
import type { InquiryLoopInput } from '../core/agent/inquiryLoop';

/**
 * QUESTION SELECTION, distinct from experiment selection.
 *
 * Every existing selector answers "how do I best answer THIS question?". This
 * one answers "what should I be asking now?", from what the finished run itself
 * raised — and, just as importantly, reports honestly when the most important
 * question is one Genesis cannot run.
 */

describe('selectNextResearchQuestion — derived from the run, never invented', () => {
  it('MECHANISM composition ALREADY ran inside this outcome, so it is not re-proposed as open', () => {
    // discoveryOrchestrator wires generation into the SAME runDiscovery call
    // (P0), so by the time this outcome exists the joint arm has already been
    // measured and classified (SUB_ADDITIVE on this fixture). Proposing
    // TEST_WHETHER_MECHANISMS_COMPOSE here — as this test originally asserted,
    // before that wiring existed — would present an answered question as an
    // open, runnable one.
    const outcome = runDiscovery({
      shape: 'MECHANISM',
      goal: 'Maximise remaining fuel, at most 12 experiments.',
      catalog: GENESIS_GENERATOR_CATALOG,
    });
    if (outcome.status !== 'RAN') throw new Error('expected RAN');
    expect(outcome.generated?.kind).toBe('COMPOSED_MECHANISM');
    if (outcome.generated?.kind !== 'COMPOSED_MECHANISM') throw new Error('expected a composed mechanism');
    expect(outcome.generated.assessment.interaction).toBe('SUB_ADDITIVE');

    const selection = selectNextResearchQuestion(outcome);
    expect(selection.selected).toBeNull();
    expect(selection.candidates).toEqual([]);
    expect(selection.why).toContain('no open question');
  });

  it('composition is proposed as OPEN only when it genuinely has not run yet', () => {
    // Survivors here are DERIVED (~RELATION_FLIP), so mechanismGeneration.ts
    // itself refuses: a derived hypothesis reuses its parent's intervention,
    // and combining it would apply the same lever twice. That refusal is real
    // and current, so the question is honestly reported as open but blocked —
    // never as "answerableNow: true" the way an already-run composition once
    // was.
    const goal = `Minimise ${Object.keys(GENESIS_GENERATOR_CATALOG.metricPhrases)[0]!}, at most 10 experiments.`;
    const outcome = runDiscovery({ shape: 'MECHANISM', goal, catalog: GENESIS_GENERATOR_CATALOG });
    if (outcome.status !== 'RAN') throw new Error('expected RAN');
    expect(outcome.generated).toBeNull();
    expect([...outcome.run.surviving].sort()).toEqual([
      'h:fuel-efficiency~RELATION_FLIP',
      'h:load-shedding~RELATION_FLIP',
    ]);

    const selection = selectNextResearchQuestion(outcome);
    expect(selection.selected?.kind).toBe('TEST_WHETHER_MECHANISMS_COMPOSE');
    expect(selection.selected!.question).toContain('compose');
    expect(selection.selected!.answerableNow).toBe(false);
    expect(selection.selected!.why).toBe(outcome.noGenerationReason);
    expect(selection.blockedOnHuman).toBe(true);
  });

  it('after its own generation succeeds, the open question is the interval — and it is runnable', () => {
    // Every declared temperature refuted, 0.5 derived and it survives. The
    // honest next question is where in [0.3, 0.7] the truth actually lies.
    //
    // This question came back `answerableNow: false` when this module was
    // first written — nothing could propose a value from a SURVIVING state,
    // because generation is gated on an exhausted one. `intervalNarrowing.ts`
    // was built for exactly that gap, which is why it is runnable now.
    const outcome = runDiscovery({ shape: 'PARAMETER', input: proteinFoldingInquiry(0.5) });
    const selection = selectNextResearchQuestion(outcome);

    expect(selection.selected?.kind).toBe('NARROW_A_DERIVED_INTERVAL');
    expect(selection.selected!.question).toContain('[0.3, 0.7]');
    expect(selection.selected!.answerableNow).toBe(true);
    expect(selection.nextExecutable?.kind).toBe('NARROW_A_DERIVED_INTERVAL');
    expect(selection.blockedOnHuman).toBe(false);
  });

  it('a blocked top question does not dead-end the loop when something else is runnable', () => {
    // The apparatus failed, which is the most important thing to resolve and
    // not something the run can settle. But four hypotheses were never tested,
    // and THAT is runnable — so Genesis still has a move.
    const base = proteinFoldingSystem(0.5);
    const input: InquiryLoopInput = {
      question: 'What temperature did this fold run at?',
      system: { ...base, candidateProbeValues: [999_999, 5000] },
      hypotheses: PROTEIN_FOLDING_HYPOTHESES,
      openingProbeValue: 999_999,
      maxRounds: 4,
    };
    const selection = selectNextResearchQuestion(runDiscovery({ shape: 'PARAMETER', input }));

    expect(selection.selected?.kind).toBe('RESOLVE_APPARATUS_FAILURE');
    expect(selection.selected!.answerableNow).toBe(false);
    // The distinction the two fields exist for.
    expect(selection.nextExecutable?.kind).toBe('TEST_UNTESTED_HYPOTHESIS');
    expect(selection.blockedOnHuman).toBe(false);
    expect(selection.why).toContain('The most important one it CAN run is');
  });

  it('a refused question turns into a question about capability, with what is missing named', () => {
    const selection = selectNextResearchQuestion(
      runDiscovery({ shape: 'MECHANISM', goal: 'Will the volcano erupt tomorrow?', catalog: GENESIS_FLOOD_CATALOG }),
    );
    expect(selection.selected?.kind).toBe('ACQUIRE_A_MISSING_CAPABILITY');
    expect(selection.selected!.answerableNow).toBe(false);
    expect(selection.blockedOnHuman).toBe(true);
    // Specific, actionable-by-a-person, from the admission's own words.
    expect(selection.selected!.groundedIn.join(' ')).toContain('process model');
  });

  it('a settled run raises nothing, rather than manufacturing a question to look busy', () => {
    const selection = selectNextResearchQuestion(
      runDiscovery({
        shape: 'MECHANISM',
        goal: 'Minimise peak flood depth, at most 8 experiments.',
        catalog: GENESIS_FLOOD_CATALOG,
      }),
    );
    expect(selection.candidates).toEqual([]);
    expect(selection.selected).toBeNull();
    expect(selection.blockedOnHuman).toBe(false);
    expect(selection.why).toContain('no open question');
  });

  it('ranking is the declared cascade, not a score: apparatus outranks untested', () => {
    const base = proteinFoldingSystem(0.5);
    const input: InquiryLoopInput = {
      question: 'q',
      system: { ...base, candidateProbeValues: [999_999, 5000] },
      hypotheses: PROTEIN_FOLDING_HYPOTHESES,
      openingProbeValue: 999_999,
      maxRounds: 4,
    };
    const selection = selectNextResearchQuestion(runDiscovery({ shape: 'PARAMETER', input }));
    expect(selection.candidates.map((c) => c.kind)).toEqual([
      'RESOLVE_APPARATUS_FAILURE',
      'TEST_UNTESTED_HYPOTHESIS',
    ]);
  });
});
