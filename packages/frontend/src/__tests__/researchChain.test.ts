import { describe, expect, it } from 'vitest';

import { runResearchChain } from '../core/agent/researchChain';
import { proteinFoldingInquiry } from '../core/agent/proteinFoldingInquiry';

/**
 * GENESIS CHOOSING ITS OWN NEXT QUESTION, AND CATCHING ITS OWN MISTAKE.
 *
 * No human between the steps and no hardcoded sequence: each step is whatever
 * `nextQuestion.ts` ranked highest among the questions the previous run itself
 * raised. Real seeded HP-lattice solver throughout.
 */

describe('runResearchChain — the loop continues without being told to', () => {
  it('THE DEFINING BEHAVIOUR: derived value, then a self-chosen step that narrows the interval', () => {
    const chain = runResearchChain(proteinFoldingInquiry(0.5), 4);

    expect(chain.steps).toHaveLength(2);
    expect(chain.selfChosenSteps).toBe(1);

    // Step 1 is the caller's question. Every declared value fails; the front
    // door derives 0.5 and it survives — but only as an interval.
    const first = chain.steps[0]!;
    expect(first.kind).toBe('INITIAL');
    if (first.outcome.status !== 'RAN') throw new Error('expected RAN');
    expect(first.outcome.run.surviving).toEqual([]);
    expect(first.outcome.generated!.standing.standing).toBe('SUPPORTED_INTERVAL_NOT_IDENTIFIED');
    expect(first.outcome.generated!.standing.interval).toEqual([0.3, 0.7]);

    // Step 2 was chosen by the question selector, not by this test and not by
    // a person.
    const second = chain.steps[1]!;
    expect(second.kind).toBe('NARROW_A_DERIVED_INTERVAL');
    expect(second.question).toContain('[0.3, 0.7]');

    // And it really narrowed: 0.4 and 0.6 refuted, 0.5 — the true hidden
    // temperature — left standing, on a setting no earlier step used.
    expect(second.narrowing).not.toBeNull();
    expect(second.narrowing!.narrowed).toBe(true);
    expect(second.narrowing!.priorInterval).toEqual([0.3, 0.7]);
    expect(second.narrowing!.narrowedInterval).toEqual([0.4, 0.6]);
    expect(second.narrowing!.survivingValues).toEqual([0.5]);
    expect([...second.narrowing!.refutedValues].sort()).toEqual([0.4, 0.6]);
  });

  it('anti-HARKing across the whole chain: no step judges a candidate on a setting an earlier step used', () => {
    const chain = runResearchChain(proteinFoldingInquiry(0.5), 4);
    const seen = new Set<string>();
    for (const step of chain.steps) {
      if (step.outcome.status !== 'RAN') continue;
      const runs =
        step.outcome.generated === null
          ? [step.outcome.run]
          : [step.outcome.run, step.outcome.generated.run];
      for (const run of runs) {
        for (const round of run.rounds) {
          expect(seen.has(round.what), `setting reused: ${round.what}`).toBe(false);
          seen.add(round.what);
        }
      }
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  it('a wrong derived value is refuted at step 1, so the chain does not spend a step chasing it', () => {
    // The fold really ran at 0.65, and 0.5 is derived. Once the follow-up is
    // barred from re-measuring at the setting that authored the value, it
    // refutes 0.5 by itself — so there is no interval to narrow and no second
    // step to take. The chain correctly does nothing further.
    const chain = runResearchChain(proteinFoldingInquiry(0.65), 4);

    const first = chain.steps[0]!;
    if (first.outcome.status !== 'RAN') throw new Error('expected RAN');
    expect(first.outcome.generated!.derived.value).toBe(0.5);
    expect(first.outcome.generated!.survived).toBe(false);
    expect(first.outcome.generated!.standing.standing).toBe('REFUTED');

    expect(chain.steps).toHaveLength(1);
    expect(chain.selfChosenSteps).toBe(0);
  });

  it('a residual degeneracy still gets a self-chosen narrowing step', () => {
    // 0.55 is the case the instrument genuinely cannot separate from 0.5 at a
    // declared ±15% band, so 0.5 survives and the interval is the honest
    // finding — which is exactly when narrowing is the right next question.
    const chain = runResearchChain(proteinFoldingInquiry(0.55), 4);
    expect(chain.selfChosenSteps).toBeGreaterThanOrEqual(1);
    expect(chain.steps[1]!.kind).toBe('NARROW_A_DERIVED_INTERVAL');
  });

  it('a settled question ends the chain after one step, without manufacturing work', () => {
    // A fold at 1.0 leaves h:warm standing, so nothing is open.
    const chain = runResearchChain(proteinFoldingInquiry(1.0), 4);
    expect(chain.steps).toHaveLength(1);
    expect(chain.selfChosenSteps).toBe(0);
    expect(chain.stoppedBecause).toContain('raised no new one');
  });
});
