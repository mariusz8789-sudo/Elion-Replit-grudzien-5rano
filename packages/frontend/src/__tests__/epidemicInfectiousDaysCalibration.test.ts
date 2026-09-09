import { describe, expect, it } from 'vitest';
import {
  runAutonomousWorldCalibration,
  worldCalibrationResultFingerprint,
  WORLD_PARAMETER_CALIBRATION_CONTRACT_VERSION,
} from '../core/agent/worldParameterCalibration';
import type { WorldParameterCalibrationInput } from '../core/agent/worldParameterCalibration';
import {
  buildEpidemicWorldAt,
  epidemicInfectiousDaysCalibration,
  epidemicInfectiousDaysSystem,
  EPIDEMIC_CALIBRATION_PARAMETER_ID,
  EPIDEMIC_CALIBRATION_WORLD_ID,
  EPIDEMIC_INFECTIOUS_DAYS_CANDIDATES,
  EPIDEMIC_INFECTIOUS_DAYS_NOT_MODELLED,
  EPIDEMIC_INFECTIOUS_DAYS_OPENING_TICK,
} from '../core/agent/epidemicInfectiousDaysCalibration';

/**
 * WORLD ↔ INQUIRY CALIBRATION — the first (and, per the domain audit in
 * `TWO_AUTONOMOUS_LOOPS_DECISION.md` §11, so far only) real candidate for a
 * PARAMETER question run ON a WorldGraph world rather than the Experiment
 * Fabric: this outbreak's own mean infectious period, a real SEIRD solver
 * input `epidemicLeverCatalog.ts` deliberately never exposes as a lever.
 *
 * Every number below was measured against the real RK4 SEIRD integration
 * before being written down (see `epidemicInfectiousDaysCalibration.ts`'s
 * own module doc and `worldParameterCalibration.ts`'s).
 */

const [SHORT, BRIEF, TYPICAL, EXTENDED, LONG] = EPIDEMIC_INFECTIOUS_DAYS_CANDIDATES;
const cache = new Map<string, ReturnType<typeof runAutonomousWorldCalibration>>();
function run(c: (typeof EPIDEMIC_INFECTIOUS_DAYS_CANDIDATES)[number]) {
  const cached = cache.get(c.id);
  if (cached) return cached;
  const fresh = runAutonomousWorldCalibration(epidemicInfectiousDaysCalibration(c.infectiousDays));
  cache.set(c.id, fresh);
  return fresh;
}

describe('epidemic infectious-days calibration — the substrate is real', () => {
  it('runs on the real RK4 SEIRD solver, not a stub defined here', () => {
    const { graph, updater } = buildEpidemicWorldAt(7);
    const entity = graph.getEntity('population:city-1');
    expect(entity.domainBinding?.solverId).toBe('epidemic-seir-rk4');
    expect(entity.grounding).toBe('MODEL_ESTIMATE');
    expect(typeof updater).toBe('function');

    const result = run(TYPICAL);
    expect(result.contractVersion).toBe(WORLD_PARAMETER_CALIBRATION_CONTRACT_VERSION);
    expect(result.domainId).toBe('epidemiology');
    expect(result.worldId).toBe(EPIDEMIC_CALIBRATION_WORLD_ID);
    expect(result.parameterId).toBe(EPIDEMIC_CALIBRATION_PARAMETER_ID);
    for (const round of result.rounds) {
      expect(round.observed).not.toBeNull();
    }
  });

  it('is deterministic: the same hidden truth twice gives the same probes and beliefs', () => {
    const a = runAutonomousWorldCalibration(epidemicInfectiousDaysCalibration(TYPICAL.infectiousDays));
    const b = runAutonomousWorldCalibration(epidemicInfectiousDaysCalibration(TYPICAL.infectiousDays));
    expect(b.rounds.map((r) => r.probeTick)).toEqual(a.rounds.map((r) => r.probeTick));
    expect(b.finalBeliefs).toEqual(a.finalBeliefs);
    expect(worldCalibrationResultFingerprint(b)).toBe(worldCalibrationResultFingerprint(a));
  });

  it('never leaks the hidden value into the serialized result', () => {
    const result = run(TYPICAL);
    expect(JSON.stringify(result)).not.toContain('hiddenValue');
  });
});

describe('epidemic infectious-days calibration — the opening measurement is genuinely uninformative', () => {
  it('reads back nearly identical infection counts at day 2 regardless of the true infectious period', () => {
    for (const c of EPIDEMIC_INFECTIOUS_DAYS_CANDIDATES) {
      const first = run(c).rounds[0]!;
      expect(first.probeTick).toBe(EPIDEMIC_INFECTIOUS_DAYS_OPENING_TICK);
      // Measured: 18.07-18.51 across all five candidates at tick=2 — under a 2.5% spread.
      expect(first.observed).toBeGreaterThan(17.9);
      expect(first.observed).toBeLessThan(18.6);
      expect(first.outcomes.every((o) => o.assessment === 'SUPPORTED_WITHIN_PROTOCOL')).toBe(true);
    }
  });
});

/**
 * PROOF OF AUTONOMY. Identical question, identical five hypotheses, identical
 * priors, identical candidate tick list, identical opening tick. The ONLY
 * difference between these five runs is which infectious period is actually
 * driving the hidden world. Measured: the round-2 probe tick itself depends on
 * which truth produced round 1's observation — 30 for short/brief/typical,
 * 45 for extended/long, because which PAIR of hypotheses comes out on top
 * after round 1 shifts with the hidden truth, and that pair needs a
 * different tick to separate.
 */
describe('epidemic infectious-days calibration — PROOF OF AUTONOMY: the observation decides what happens next', () => {
  it('starts every calibration from a genuinely identical opening state', () => {
    const results = EPIDEMIC_INFECTIOUS_DAYS_CANDIDATES.map(run);
    for (const result of results) {
      expect(result.rounds[0]!.probeTick).toBe(EPIDEMIC_INFECTIOUS_DAYS_OPENING_TICK);
      expect(result.rounds[0]!.selection.rule).toBe('OPENING_PROBE_DECLARED');
    }
    const predictions = results.map((r) => r.rounds[0]!.outcomes.map((o) => o.predicted));
    expect(predictions[1]).toEqual(predictions[0]);
    expect(predictions[2]).toEqual(predictions[0]);
    expect(predictions[3]).toEqual(predictions[0]);
    expect(predictions[4]).toEqual(predictions[0]);
  });

  it('picks a genuinely different second probe tick depending on the hidden truth', () => {
    expect(run(SHORT).rounds[1]?.probeTick).toBe(30);
    expect(run(BRIEF).rounds[1]?.probeTick).toBe(30);
    expect(run(TYPICAL).rounds[1]?.probeTick).toBe(30);
    expect(run(EXTENDED).rounds[1]?.probeTick).toBe(45);
    expect(run(LONG).rounds[1]?.probeTick).toBe(45);
    // Real, independently-built worlds — not the same trajectory read twice.
    expect(run(SHORT).rounds[1]!.observed).not.toBe(run(EXTENDED).rounds[1]!.observed);
  });

  it('resolves to the hidden truth in exactly two rounds, every time', () => {
    for (const c of EPIDEMIC_INFECTIOUS_DAYS_CANDIDATES) {
      const result = run(c);
      expect(result.rounds).toHaveLength(2);
      expect(result.survivingHypothesisIds).toEqual([c.id]);
      expect(result.falsifiedHypothesisIds).toHaveLength(4);
      expect(result.stopReason).toBe('NO_CONTENDERS_LEFT');
    }
  });

  it('never repeats a measurement it has already taken', () => {
    for (const c of EPIDEMIC_INFECTIOUS_DAYS_CANDIDATES) {
      const ticks = run(c).rounds.map((r) => r.probeTick);
      expect(new Set(ticks).size).toBe(ticks.length);
    }
  });
});

describe('epidemic infectious-days calibration — honesty when the truth was never proposed', () => {
  it('falsifies every candidate rather than crowning a least-wrong one', () => {
    const unproposed = runAutonomousWorldCalibration(epidemicInfectiousDaysCalibration(20));
    expect(unproposed.survivingHypothesisIds).toHaveLength(0);
    expect(unproposed.falsifiedHypothesisIds).toHaveLength(5);
    expect(unproposed.stopReason).toBe('NO_CONTENDERS_LEFT');
    expect(unproposed.openQuestions.join(' ')).toContain('not among the values anyone proposed');
  });

  it('states the model boundary rather than implying a claim about a real outbreak', () => {
    const limitations = run(TYPICAL).limitations.join(' ');
    expect(limitations).toContain(EPIDEMIC_CALIBRATION_WORLD_ID);
    expect(limitations).toContain('not the same as being true of any real system');
    expect(EPIDEMIC_INFECTIOUS_DAYS_NOT_MODELLED.join(' ')).toContain('Pathogen X');
    expect(EPIDEMIC_INFECTIOUS_DAYS_NOT_MODELLED.join(' ')).toContain('No real case-count data');
  });
});

/**
 * HONESTY, the other half: candidates spaced closely enough (0.1 day apart,
 * a tenth of this domain's own declared default) that the real solver's
 * trajectories never separate beyond the declared ±12% band at any of the
 * six candidate ticks — MEASURED, not assumed. The calibration is required
 * to say so rather than pick a nearest survivor it cannot actually support.
 */
describe('epidemic infectious-days calibration — honesty when the candidates genuinely will not separate', () => {
  const closeHypotheses = [
    { hypothesisId: 'h:a', statement: 'a', claimedValue: 6.9, priorConfidence: 0.5 },
    { hypothesisId: 'h:b', statement: 'b', claimedValue: 7.0, priorConfidence: 0.5 },
    { hypothesisId: 'h:c', statement: 'c', claimedValue: 7.1, priorConfidence: 0.5 },
  ];

  function tieInput(hiddenValue: number): WorldParameterCalibrationInput {
    return {
      question: "What is this outbreak's real mean infectious period?",
      system: epidemicInfectiousDaysSystem(hiddenValue, 'tie-test'),
      hypotheses: closeHypotheses,
      openingProbeTick: EPIDEMIC_INFECTIOUS_DAYS_OPENING_TICK,
      maxRounds: 6,
    };
  }

  it('refuses to resolve three closely-spaced candidates rather than guessing', () => {
    for (const hidden of [6.9, 7.0, 7.1]) {
      const result = runAutonomousWorldCalibration(tieInput(hidden));
      expect(result.stopReason).toBe('NO_DISCRIMINATING_PROBE');
      expect(result.nextExperiment.probeTick).toBeNull();
      expect(result.survivingHypothesisIds).toEqual(['h:a', 'h:b', 'h:c']);
      expect(result.falsifiedHypothesisIds).toHaveLength(0);
    }
  });

  it('says exactly why no further reading would help', () => {
    const result = runAutonomousWorldCalibration(tieInput(7.0));
    expect(result.nextExperiment.why).toContain('No untried tick separates');
    expect(result.openQuestions.join(' ')).toContain('did not separate them');
  });
});

describe('epidemicInfectiousDaysSystem — the hidden value never leaks into a reasoning step', () => {
  it('builds a system with the declared world and probe axis', () => {
    const system = epidemicInfectiousDaysSystem(7, 'test-system');
    expect(system.systemId).toBe('test-system');
    expect(system.worldId).toBe(EPIDEMIC_CALIBRATION_WORLD_ID);
    expect(system.parameterId).toBe(EPIDEMIC_CALIBRATION_PARAMETER_ID);
    expect(system.hiddenValue).toBe(7);
    expect(system.candidateProbeTicks.length).toBeGreaterThan(0);
  });
});
