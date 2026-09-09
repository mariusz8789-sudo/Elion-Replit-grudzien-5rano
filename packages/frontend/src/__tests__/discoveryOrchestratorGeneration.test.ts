import { describe, expect, it } from 'vitest';

import { runDiscovery } from '../core/agent/discoveryOrchestrator';
import { parameterStrategy } from '../core/agent/discoveryStrategies';
import { proteinFoldingInquiry } from '../core/agent/proteinFoldingInquiry';

/**
 * P0 — GENERATION THROUGH THE REAL FRONT DOOR.
 *
 * `inquiryGenerationLoop.test.ts` proves the generating engine works when
 * called directly. This file proves the engine is no longer standing beside
 * the system: one `runDiscovery` call — the orchestrator every routed question
 * goes through — carries the whole chain
 *
 *   QUESTION -> HYPOTHESES -> EXPERIMENT -> FALSIFICATION
 *     -> DECLARED_SPACE_INSUFFICIENT -> NEW HYPOTHESIS -> FRESH EXPERIMENT -> RESULT
 *
 * Real seeded HP-lattice Metropolis solver throughout. The declared candidates
 * are temperatures 0.3, 0.7, 1.2 and 2.0; a fold at 0.5 is one nobody proposed.
 */

const TRUE_HIDDEN_TEMPERATURE = 0.5;

describe('runDiscovery — the declared space runs out and Genesis continues by itself', () => {
  it('THE DEFINING BEHAVIOUR: A/B/C/D refuted, E derived, E tested, E assessed — in one routed call', () => {
    const outcome = runDiscovery({ shape: 'PARAMETER', input: proteinFoldingInquiry(TRUE_HIDDEN_TEMPERATURE) });
    if (outcome.status !== 'RAN') throw new Error(`expected RAN, got REFUSED: ${outcome.admission.why}`);

    // A/B/C/D — every declared value refuted by the first investigation.
    expect(outcome.run.surviving).toEqual([]);
    expect([...outcome.run.falsified].sort()).toEqual(['h:cold', 'h:cool', 'h:hot', 'h:warm']);

    // E — derived without anyone asking, by the front door itself.
    expect(outcome.noGenerationReason).toBeNull();
    expect(outcome.generated).not.toBeNull();
    const generated = outcome.generated!;
    expect(generated.derived.value).toBe(0.5);
    expect(generated.derived.hypothesisId).toBe('h:derived-temperature-0.5');

    // E tested — a SECOND real run, reported in the same shared contract as any
    // other, with real solver predictions on its rounds.
    expect(generated.run.shape).toBe('PARAMETER');
    expect(generated.run.rounds.length).toBeGreaterThan(0);
    const judgedRounds = generated.run.rounds.filter((r) =>
      r.verdicts.some((v) => v.hypothesisId === 'h:derived-temperature-0.5' && v.predicted !== null),
    );
    expect(judgedRounds.length).toBeGreaterThan(0);

    // E assessed — and it survived evidence it did not author.
    expect(generated.survived).toBe(true);
    expect(generated.run.surviving).toEqual(['h:derived-temperature-0.5']);
    expect(generated.run.untested).not.toContain('h:derived-temperature-0.5');
  });

  it('the first run is BYTE-FOR-BYTE what a direct strategy call produces — generation added nothing to it', () => {
    const input = proteinFoldingInquiry(TRUE_HIDDEN_TEMPERATURE);
    const outcome = runDiscovery({ shape: 'PARAMETER', input });
    if (outcome.status !== 'RAN') throw new Error('expected RAN');

    // The equivalence this file's contract promises: a 1.1.0 reader sees an
    // unchanged finding, not merely a compatible one.
    const direct = parameterStrategy.run(input);
    expect(outcome.run.resultFingerprint).toBe(direct.resultFingerprint);
    expect(outcome.run.rounds).toEqual(direct.rounds);
    expect(outcome.run.surviving).toEqual(direct.surviving);
    expect(outcome.run.falsified).toEqual(direct.falsified);
    expect(outcome.run.stopReason).toBe(direct.stopReason);
  });

  it('generates nothing while a declared value still stands, and says which refusal applied', () => {
    // A fold at 0.45 leaves h:cool alive. Inventing here would be the engine
    // preferring novelty to evidence.
    const outcome = runDiscovery({ shape: 'PARAMETER', input: proteinFoldingInquiry(0.45) });
    if (outcome.status !== 'RAN') throw new Error('expected RAN');

    expect(outcome.run.surviving.length).toBeGreaterThan(0);
    expect(outcome.generated).toBeNull();
    expect(outcome.noGenerationReason).toContain('still standing');
  });

  it('MECHANISM reports no generation path rather than a fabricated one', async () => {
    const { GENESIS_FLOOD_CATALOG } = await import('../core/agent/worldGoalIntent');
    const outcome = runDiscovery({
      shape: 'MECHANISM',
      goal: 'Minimise peak flood depth, at most 4 experiments.',
      catalog: GENESIS_FLOOD_CATALOG,
    });
    if (outcome.status !== 'RAN') throw new Error('expected RAN');
    expect(outcome.generated).toBeNull();
    expect(outcome.noGenerationReason).toContain('no generation path');
  });
});

/**
 * THE OVERCLAIM THIS SPRINT FOUND, PINNED SO IT CANNOT COME BACK.
 *
 * `survived: true` is not "the value was found". Measured on the real solver:
 * four different true temperatures all produce the identical surviving derived
 * value 0.5, because the declared ±15% agreement band cannot separate them at
 * the settings the loop chose. At a true 0.65 the follow-up ends
 * `NO_CONTENDERS_LEFT` with no open questions over a value wrong by 23%.
 *
 * Nothing in the loop lies — every round is judged honestly against a declared
 * band. The overclaim was in the SUMMARY, and `standing` is the correction.
 */
describe('a surviving derived value is reported as an interval, never as an identification', () => {
  it('the same derived value survives four different truths — so survival cannot mean identification', () => {
    const survivingAt = [0.4, 0.5, 0.55, 0.65].map((hidden) => {
      const outcome = runDiscovery({ shape: 'PARAMETER', input: proteinFoldingInquiry(hidden) });
      if (outcome.status !== 'RAN') throw new Error('expected RAN');
      return { hidden, generated: outcome.generated };
    });

    for (const { hidden, generated } of survivingAt) {
      expect(generated, `expected generation at hidden=${hidden}`).not.toBeNull();
      expect(generated!.derived.value, `hidden=${hidden}`).toBe(0.5);
      expect(generated!.survived, `hidden=${hidden}`).toBe(true);
    }
  });

  it('standing states the earned INTERVAL and refuses the point claim', () => {
    // True 0.65: the derived 0.5 survives and is wrong. The honest reading is
    // the interval its two refuted bracket parents drew — which does contain
    // the truth, while the point value does not equal it.
    const outcome = runDiscovery({ shape: 'PARAMETER', input: proteinFoldingInquiry(0.65) });
    if (outcome.status !== 'RAN') throw new Error('expected RAN');
    const generated = outcome.generated!;

    expect(generated.survived).toBe(true);
    expect(generated.standing.standing).toBe('SUPPORTED_INTERVAL_NOT_IDENTIFIED');

    // The interval is earned: BOTH ends were really refuted by the follow-up.
    expect(generated.standing.interval).toEqual([0.3, 0.7]);
    expect([...generated.standing.refutedBracketEnds].sort()).toEqual(['h:cold', 'h:cool']);

    // The truth is inside the interval the evidence supports...
    const [lo, hi] = generated.standing.interval;
    expect(0.65).toBeGreaterThan(lo);
    expect(0.65).toBeLessThan(hi);
    // ...and is NOT the point value that survived. The report must not conflate them.
    expect(generated.derived.value).not.toBe(0.65);
    expect(generated.standing.why).toContain('not the same as being identified');
  });
});
