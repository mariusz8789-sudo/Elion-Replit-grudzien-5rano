import { describe, expect, it } from 'vitest';

import { runInquiryWithGeneration } from '../core/agent/inquirySession';
import { proteinFoldingInquiry } from '../core/agent/proteinFoldingInquiry';
import type { InquiryLoopInput } from '../core/agent/inquiryLoop';

/**
 * THE CLOSED LOOP, unprompted: A ❌ B ❌ C ❌ D ❌ → Genesis derives E BY ITSELF
 * → tests E on evidence E did not author → E survives.
 *
 * `parameterAlternative.test.ts` proves the derivation is honest and lands on
 * the real value. This file proves nobody has to ask for it: one call, and the
 * exhausted space triggers its own continuation.
 *
 * Real seeded HP-lattice Metropolis solver throughout. A fold at temperature
 * 0.5 is one nobody declared — the candidates are 0.3, 0.7, 1.2 and 2.0.
 */

const TRUE_HIDDEN_TEMPERATURE = 0.5;

describe('inquiry → generation → fresh investigation, without being asked', () => {
  it('THE DEFINING BEHAVIOUR: every declared value fails, and Genesis continues on its own', () => {
    const outcome = runInquiryWithGeneration(proteinFoldingInquiry(TRUE_HIDDEN_TEMPERATURE));

    // 1. The declared space really was exhausted — nothing survived.
    expect(outcome.first.survivingHypothesisIds).toEqual([]);
    expect([...outcome.first.falsifiedHypothesisIds].sort()).toEqual(['h:cold', 'h:cool', 'h:hot', 'h:warm']);

    // 2. Genesis generated, unprompted.
    expect(outcome.noGenerationReason).toBeNull();
    expect(outcome.generated).not.toBeNull();
    const generated = outcome.generated!;
    expect(generated.derived.value).toBe(0.5);
    expect(generated.derived.hypothesisId).toBe('h:derived-temperature-0.5');

    // 3. It ran a SECOND, real investigation — not a re-read of the first.
    expect(generated.followUpResult.rounds.length).toBeGreaterThan(0);
    expect(generated.followUpInput.hypotheses.map((h) => h.hypothesisId)).toContain('h:derived-temperature-0.5');

    // 4. The derived value SURVIVED, and the two claims that bracketed it did not.
    expect(generated.survived).toBe(true);
    expect(generated.followUpResult.survivingHypothesisIds).toEqual(['h:derived-temperature-0.5']);
    expect([...generated.followUpResult.falsifiedHypothesisIds].sort()).toEqual(['h:cold', 'h:cool']);
  });

  it('ANTI-HARKING IS ENFORCED, not merely reported: the follow-up opens on evidence the derivation never saw', () => {
    const outcome = runInquiryWithGeneration(proteinFoldingInquiry(TRUE_HIDDEN_TEMPERATURE));
    const generated = outcome.generated!;

    const firstRunProbes = outcome.first.rounds.map((r) => r.probeValue);
    const opening = generated.followUpInput.openingProbeValue;

    // Not the measurement that produced the candidate...
    expect(generated.derived.excludedProbeValues).toContain(generated.derived.derivedFromProbeValue);
    expect(opening).not.toBe(generated.derived.derivedFromProbeValue);
    expect(generated.derived.excludedProbeValues).not.toContain(opening);
    // ...and not ANY setting the first inquiry already used.
    expect(firstRunProbes).not.toContain(opening);

    // The verdict on the derived hypothesis rests on real rounds at those new
    // settings, so it was genuinely tested rather than carried through.
    const judged = generated.followUpResult.rounds.filter((r) =>
      r.outcomes.some((o) => o.hypothesisId === generated.derived.hypothesisId),
    );
    expect(judged.length).toBeGreaterThan(0);
    expect(generated.followUpResult.untestedHypothesisIds).not.toContain(generated.derived.hypothesisId);
  });

  it('does not generate when a declared hypothesis is still standing, and says why', () => {
    // A fold at 0.45 leaves h:cool alive: the space is not exhausted, so
    // inventing would pre-empt the loop's own job of testing between survivors.
    const outcome = runInquiryWithGeneration(proteinFoldingInquiry(0.45));
    expect(outcome.first.survivingHypothesisIds.length).toBeGreaterThan(0);
    expect(outcome.generated).toBeNull();
    expect(outcome.noGenerationReason).toContain('still standing');
  });

  it('refuses to continue when no untried setting is left, rather than judging the candidate on its own data', () => {
    // The space is exhausted and a value IS derivable — but every candidate
    // setting has been spent, so there is no evidence left that the derivation
    // did not already use.
    const base = proteinFoldingInquiry(TRUE_HIDDEN_TEMPERATURE);
    const spent: InquiryLoopInput = {
      ...base,
      // Only the two settings the first inquiry actually runs are offered.
      system: { ...base.system, candidateProbeValues: [200, 5000] },
    };
    const outcome = runInquiryWithGeneration(spent);

    expect(outcome.first.survivingHypothesisIds).toEqual([]);
    expect(outcome.generated).toBeNull();
    expect(outcome.noGenerationReason).toContain('A value was derived');
    expect(outcome.noGenerationReason).toContain('untested proposal');
  });
});
