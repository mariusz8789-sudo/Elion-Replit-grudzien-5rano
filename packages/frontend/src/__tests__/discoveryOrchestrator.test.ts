import { describe, expect, it } from 'vitest';
import { GENESIS_CHEMISTRY_CATALOG } from '../core/agent/chemistryLeverCatalog';
import { discoveryResultFingerprint } from '../core/agent/discoveryLoop';
import { runDiscovery, type DiscoveryRan } from '../core/agent/discoveryOrchestrator';
import { calibrationStrategy, mechanismStrategy, parameterStrategy } from '../core/agent/discoveryStrategies';
import {
  epidemicInfectiousDaysCalibration,
  epidemicInfectiousDaysSystem,
  EPIDEMIC_INFECTIOUS_DAYS_OPENING_TICK,
} from '../core/agent/epidemicInfectiousDaysCalibration';
import { runAutonomousInquiry, type InquiryLoopInput } from '../core/agent/inquiryLoop';
import { runAutonomousWorldCalibration, type WorldParameterCalibrationInput } from '../core/agent/worldParameterCalibration';
import {
  buildWorldDiscoveryPlan,
  parseWorldDiscoveryGoal,
  GENESIS_FLOOD_CATALOG,
  WORLD_LEVER_CATALOGS,
} from '../core/agent/worldGoalIntent';

/**
 * ORCHESTRATOR — the property that makes a host safe is that it hosts.
 *
 * The whole risk of putting an entry point in front of two working engines is
 * that the entry point starts deciding things. These tests hold it to the same
 * discipline the adapters were held to: a question routed through the
 * orchestrator must produce the SAME finding as calling the strategy directly,
 * compared against a direct call rather than against the orchestrator's own
 * account of itself.
 */

const FLOOD_GOAL = 'Minimise peak flood depth, at most 3 experiments.';

function floodPlan() {
  const plan = buildWorldDiscoveryPlan(parseWorldDiscoveryGoal(FLOOD_GOAL, GENESIS_FLOOD_CATALOG), GENESIS_FLOOD_CATALOG);
  if ('error' in plan) throw new Error(`expected a runnable plan, got: ${plan.error}`);
  return plan;
}

/** A real degenerate-parameter inquiry: two Arrhenius assignments that agree at one temperature. */
function inquiryInput(): InquiryLoopInput {
  return {
    question: 'Which activation energy does this sample have?',
    system: {
      systemId: 'sample-under-test',
      label: 'Unknown kinetics sample',
      modelId: 'chemistry-arrhenius',
      hiddenParameters: { activationEnergyKJ: 60 },
      probeParameterId: 'temperatureK',
      candidateProbeValues: [400, 450, 800],
      fixedParameters: { preExponentialLog10: 4 },
      observedMetric: 'rateConstant',
      agreementTolerance: 0.15,
    },
    hypotheses: [
      { hypothesisId: 'h:ea-60', statement: 'Ea is 60 kJ/mol.', claimedValues: { activationEnergyKJ: 60 }, priorConfidence: 0.5 },
      { hypothesisId: 'h:ea-70', statement: 'Ea is 70 kJ/mol.', claimedValues: { activationEnergyKJ: 70 }, priorConfidence: 0.5 },
    ],
    openingProbeValue: 400,
    maxRounds: 3,
  };
}

function expectRan(outcome: ReturnType<typeof runDiscovery>): DiscoveryRan {
  if (outcome.status !== 'RAN') throw new Error(`expected RAN, got REFUSED at ${outcome.stage}: ${outcome.admission.why}`);
  return outcome;
}

describe('discovery orchestrator — routing changes nothing about the finding', () => {
  it('MECHANISM: routing produces the same finding as calling the strategy directly', () => {
    // Compared by content fingerprint, not object equality: `TemporalEngine`
    // labels branches from a process-global counter, so two runs of one plan
    // carry different branch ids while being the same science.
    const direct = mechanismStrategy.run(floodPlan());
    const routed = expectRan(runDiscovery({ shape: 'MECHANISM', goal: FLOOD_GOAL, catalog: GENESIS_FLOOD_CATALOG }));

    expect(routed.run.resultFingerprint).toBe(direct.resultFingerprint);
    expect(routed.run.stopReason).toBe(direct.stopReason);
    expect(routed.run.surviving).toEqual(direct.surviving);
    expect(routed.run.falsified).toEqual(direct.falsified);
    expect(routed.run.strategyId).toBe(direct.strategyId);
  });

  it('PARAMETER: routing produces the same finding as calling the strategy directly', () => {
    const input = inquiryInput();
    const direct = parameterStrategy.run(input);
    const routed = expectRan(runDiscovery({ shape: 'PARAMETER', input }));

    // This loop measures through the Fabric rather than forking a world, so it
    // carries no process-local labels and full equality holds.
    expect(routed.run.native).toEqual(runAutonomousInquiry(input));
    expect(routed.run.resultFingerprint).toBe(direct.resultFingerprint);
    expect(routed.run.surviving).toEqual(direct.surviving);
    expect(routed.run.nextExperiment?.selectorId).toBe('parameter-inquiry');
    // Rounds actually ran: a model the router does not carry yields an inquiry
    // in which no measurement executes, and every assertion above would still
    // hold over that empty result.
    expect(routed.run.rounds.length).toBeGreaterThan(0);
  });

  it('CALIBRATION: routing produces the same finding as calling the strategy directly', () => {
    // P6's real domain, routed through the SAME general-purpose entry point
    // MECHANISM and PARAMETER already go through — see
    // `TWO_AUTONOMOUS_LOOPS_DECISION.md` §11-§12 for why this composition
    // earned a third `QuestionShape` instead of overloading PARAMETER.
    const input = epidemicInfectiousDaysCalibration(7);
    const direct = calibrationStrategy.run(input);
    const routed = expectRan(runDiscovery({ shape: 'CALIBRATION', input }));

    expect(routed.run.native).toEqual(runAutonomousWorldCalibration(input));
    expect(routed.run.resultFingerprint).toBe(direct.resultFingerprint);
    expect(routed.run.strategyId).toBe(direct.strategyId);
    expect(routed.run.surviving).toEqual(direct.surviving);
    expect(routed.run.falsified).toEqual(direct.falsified);
    expect(routed.run.stopReason).toBe(direct.stopReason);
    expect(routed.run.nextExperiment?.selectorId).toBe('world-parameter-calibration');
    expect(routed.shape).toBe('CALIBRATION');
    expect(routed.admission.status).toBe('REAL');
  });

  it('CALIBRATION: an honest tie (NO_DISCRIMINATING_PROBE) survives routing unchanged', () => {
    // Same tightly-spaced control case from `epidemicInfectiousDaysCalibration.test.ts`:
    // three candidates 0.1 day apart never separate within the declared ±12%
    // band. Routing through the orchestrator must not paper over that with a
    // guess, or rename the stop reason to something friendlier.
    const closeHypotheses = [
      { hypothesisId: 'h:a', statement: 'a', claimedValue: 6.9, priorConfidence: 0.5 },
      { hypothesisId: 'h:b', statement: 'b', claimedValue: 7.0, priorConfidence: 0.5 },
      { hypothesisId: 'h:c', statement: 'c', claimedValue: 7.1, priorConfidence: 0.5 },
    ];
    const input: WorldParameterCalibrationInput = {
      question: "What is this outbreak's real mean infectious period?",
      system: epidemicInfectiousDaysSystem(7.0, 'orchestrator-tie-test'),
      hypotheses: closeHypotheses,
      openingProbeTick: EPIDEMIC_INFECTIOUS_DAYS_OPENING_TICK,
      maxRounds: 6,
    };

    const outcome = expectRan(runDiscovery({ shape: 'CALIBRATION', input }));
    expect(outcome.run.stopReason).toBe('NO_DISCRIMINATING_PROBE');
    expect(outcome.run.nextExperiment?.status).toBe('RESOLVED');
    expect(outcome.run.nextExperiment?.rule).toBe('NO_DISCRIMINATING_PROBE');
    expect(outcome.run.surviving).toEqual(['h:a', 'h:b', 'h:c']);
    expect(outcome.run.falsified).toHaveLength(0);
  });

  it('MECHANISM: equivalence holds on every catalog in the registry, not two hand-picked ones', () => {
    // Same discipline as the adapter suite: the goal for each world is built
    // from that world's OWN declared metric phrases, so this cannot ask a
    // question a world does not compute, and cannot silently stop covering a
    // domain added later.
    for (const [catalogId, catalog] of Object.entries(WORLD_LEVER_CATALOGS)) {
      const metricPhrase = Object.keys(catalog.metricPhrases)[0]!;
      const goal = `Minimise ${metricPhrase}, at most 2 experiments.`;
      const plan = buildWorldDiscoveryPlan(parseWorldDiscoveryGoal(goal, catalog), catalog);
      if ('error' in plan) throw new Error(`${catalogId} could not build a plan: ${plan.error}`);

      const outcome = runDiscovery({ shape: 'MECHANISM', goal, catalog });
      if (outcome.status !== 'RAN') {
        throw new Error(`${catalogId} was refused at ${outcome.stage}: ${outcome.admission.why}`);
      }
      expect(outcome.run.resultFingerprint).toBe(discoveryResultFingerprint(mechanismStrategy.run(plan).native as never));
      expect(outcome.shape).toBe('MECHANISM');
    }
  });
});

describe('discovery orchestrator — refusal is a result, not an exception', () => {
  it('refuses at ADMISSION when Genesis has no capability behind the question', () => {
    // The gap neither loop checks: today `runAutonomousDiscovery` would happily
    // search a flood city's levers for an answer about a volcano.
    const outcome = runDiscovery({
      shape: 'MECHANISM',
      goal: 'Will the volcano erupt tomorrow?',
      catalog: GENESIS_FLOOD_CATALOG,
    });

    expect(outcome.status).toBe('REFUSED');
    if (outcome.status !== 'REFUSED') return;
    expect(outcome.stage).toBe('ADMISSION');
    expect(outcome.admission.status).toBe('NOT_MODELLED');
    // A refusal that names nothing missing is not an honest refusal.
    expect(outcome.admission.missing.length).toBeGreaterThan(0);
  });

  it('refuses at PLAN when the capability exists but the goal asks this world nothing', () => {
    // "flood" classifies and is modelled, so admission passes — and the goal
    // still names no quantity and no direction. Two different real facts,
    // reported as two different stages rather than collapsed into one.
    const outcome = runDiscovery({ shape: 'MECHANISM', goal: 'Tell me about the flood.', catalog: GENESIS_FLOOD_CATALOG });

    expect(outcome.status).toBe('REFUSED');
    if (outcome.status !== 'REFUSED') return;
    expect(outcome.stage).toBe('PLAN');
    expect(outcome.admission.missing.length).toBeGreaterThan(0);
    // The planner's own sentence, which already names what this world computes.
    expect(outcome.admission.why.length).toBeGreaterThan(0);
  });

  it('refuses a parameter question whose model the router does not carry', () => {
    const outcome = runDiscovery({
      shape: 'PARAMETER',
      input: { ...inquiryInput(), system: { ...inquiryInput().system, modelId: 'no-such-model' } },
    });

    expect(outcome.status).toBe('REFUSED');
    if (outcome.status !== 'REFUSED') return;
    expect(outcome.stage).toBe('ADMISSION');
    expect(outcome.admission.status).toBe('BLOCKED');
  });

  it('refuses a calibration whose scenario kind Genesis has no solver for', () => {
    // Same `solverCapabilityFor` registry MECHANISM's admission already reads
    // (`discoveryAdmission.ts`'s `admitWorldCalibration`), consulted with a
    // `ScenarioKind` this registry reports NOT_MODELLED for. The system is
    // otherwise a real, buildable epidemic world — only `scenarioKind` is
    // wrong, which is exactly the fact this refusal is supposed to catch
    // before anything runs.
    const input: WorldParameterCalibrationInput = {
      ...epidemicInfectiousDaysCalibration(7),
      system: { ...epidemicInfectiousDaysSystem(7), scenarioKind: 'TSUNAMI' },
    };
    const outcome = runDiscovery({ shape: 'CALIBRATION', input });

    expect(outcome.status).toBe('REFUSED');
    if (outcome.status !== 'REFUSED') return;
    expect(outcome.stage).toBe('ADMISSION');
    expect(outcome.admission.status).toBe('NOT_MODELLED');
    expect(outcome.admission.missing.length).toBeGreaterThan(0);
  });

  it('invents no new refusal vocabulary for the planning stage', () => {
    // Both stages speak the existing four-value admission vocabulary. A fifth
    // status word for "the goal did not parse" would be a second way of saying
    // no, and the two would drift.
    const outcome = runDiscovery({ shape: 'MECHANISM', goal: 'Tell me about the flood.', catalog: GENESIS_FLOOD_CATALOG });
    if (outcome.status !== 'REFUSED') throw new Error('expected a refusal');
    expect(['REAL', 'APPROXIMATION', 'NOT_MODELLED', 'BLOCKED']).toContain(outcome.admission.status);
  });
});

describe('discovery orchestrator — the caveat travels with the finding', () => {
  it('carries the admission on a successful run, not only on a refusal', () => {
    // A result obtained through a PARTIALLY_MODELLED capability is worth exactly
    // what that capability is worth. A consumer holding only `run` could not know.
    const outcome = expectRan(runDiscovery({ shape: 'MECHANISM', goal: FLOOD_GOAL, catalog: GENESIS_FLOOD_CATALOG }));

    expect(outcome.admission.status).toBe('APPROXIMATION');
    expect(outcome.admission.caveat).toBeTruthy();
  });

  it('runs a second real domain through the same entry point, unchanged', () => {
    const goal = 'Minimise the remaining fraction by heating, at most 2 experiments.';
    const outcome = expectRan(runDiscovery({ shape: 'MECHANISM', goal, catalog: GENESIS_CHEMISTRY_CATALOG }));

    expect(outcome.run.domainId).toBe('chemistry-kinetics');
    expect(outcome.run.rounds.length).toBeGreaterThan(0);
    // The world's declared limits reach the caller, or the screen claims more
    // than the model can prove.
    expect(outcome.run.limitations.length).toBeGreaterThan(0);
  });
});
