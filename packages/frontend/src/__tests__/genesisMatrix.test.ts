import { describe, expect, it } from 'vitest';
import { buildWorldDiscoveryEvidenceBundle } from '../core/scienceMemory';
import { runAutonomousDiscoveryWithEngines } from '../core/agent/discoveryLoop';
import { runDiscovery } from '../core/agent/discoveryOrchestrator';
import { buildGenesisMatrixView } from '../core/agent/genesisMatrix';
import { buildWorldDiscoveryPlan, parseWorldDiscoveryGoal, GENESIS_FLOOD_CATALOG } from '../core/agent/worldGoalIntent';

/**
 * GENESIS MATRIX — the join, proved against a REAL run and a REAL evidence
 * bundle, not synthetic objects standing in for either.
 */

const PUMP_GOAL = 'Minimise peak flood depth using the pump, at most 4 experiments.';

function pumpOnlyPlan() {
  const plan = buildWorldDiscoveryPlan(parseWorldDiscoveryGoal(PUMP_GOAL, GENESIS_FLOOD_CATALOG), GENESIS_FLOOD_CATALOG);
  if ('error' in plan) throw new Error(`expected a runnable plan, got: ${plan.error}`);
  return plan;
}

describe('genesis matrix — the cross-cutting join', () => {
  it('joins a real orchestrator outcome, round by round, from the public contract alone', () => {
    const outcome = runDiscovery({ shape: 'MECHANISM', goal: PUMP_GOAL, catalog: GENESIS_FLOOD_CATALOG });
    if (outcome.status !== 'RAN') throw new Error(`expected RAN, got REFUSED: ${outcome.admission.why}`);

    const view = buildGenesisMatrixView(outcome);

    expect(view.domainId).toBe('flood-hydrology');
    expect(view.shape).toBe('MECHANISM');
    expect(view.admission).toBe('APPROXIMATION');
    expect(view.entries).toHaveLength(outcome.run.rounds.length);

    // Round 1: the falsification P3's regeneration reacts to.
    const first = view.entries[0]!;
    expect(first.round).toBe(1);
    expect(first.reference).toBeCloseTo(1.4495159056888596, 9);
    expect(first.observed).toBeCloseTo(1.466356695856317, 9);
    expect(first.verdicts).toHaveLength(1);
    expect(first.verdicts[0]!.hypothesisId).toBe('h:pump-capacity');
    expect(first.verdicts[0]!.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
    // MECHANISM hypotheses assert a direction, never a value — carried as null,
    // never invented.
    expect(first.verdicts[0]!.predicted).toBeNull();
    // SPACE is honestly absent: no entity/location field exists on `StrategyRound`.
    expect(first.entityId).toBeNull();

    // Round 2: P3's own regenerated hypothesis, joined the same way.
    const second = view.entries[1]!;
    expect(second.verdicts[0]!.hypothesisId).toBe('h:pump-capacity~RELATION_FLIP');

    expect(view.resultFingerprint).toBe(outcome.run.resultFingerprint);
    expect(view.stopReason).toBe(outcome.run.stopReason);
  });

  it('carries a REAL Evidence Bundle and its own Replay verdict, not a second replay mechanism', () => {
    const plan = pumpOnlyPlan();
    const outcome = runDiscovery({ shape: 'MECHANISM', goal: PUMP_GOAL, catalog: GENESIS_FLOOD_CATALOG });
    if (outcome.status !== 'RAN') throw new Error('expected RAN');

    // The SAME production path `scienceMemory.ts` uses to build a bundle from
    // a live execution — not a bundle assembled by hand for this test.
    const execution = runAutonomousDiscoveryWithEngines(plan);
    const bundle = buildWorldDiscoveryEvidenceBundle(GENESIS_FLOOD_CATALOG, execution, PUMP_GOAL);

    const view = buildGenesisMatrixView(outcome, bundle);

    expect(view.evidence).not.toBeNull();
    expect(view.evidence!.bundleId).toBe(bundle.bundleId);
    expect(view.evidence!.replayVerdict).toBe(bundle.replay.verdict);
  });

  it('a run with no evidence attached reports that honestly, never a fabricated bundle', () => {
    const outcome = runDiscovery({ shape: 'MECHANISM', goal: PUMP_GOAL, catalog: GENESIS_FLOOD_CATALOG });
    if (outcome.status !== 'RAN') throw new Error('expected RAN');
    expect(buildGenesisMatrixView(outcome).evidence).toBeNull();
  });

  it('a refused question joins to an empty investigation, never a question or domain it never had', () => {
    const outcome = runDiscovery({ shape: 'MECHANISM', goal: 'Will the volcano erupt tomorrow?', catalog: GENESIS_FLOOD_CATALOG });
    expect(outcome.status).toBe('REFUSED');

    const view = buildGenesisMatrixView(outcome);
    expect(view.entries).toEqual([]);
    // `DiscoveryRefused` itself carries no domain or question — the view says
    // so rather than inventing either.
    expect(view.domainId).toBeNull();
    expect(view.question).toBeNull();
    expect(view.admission).toBe('NOT_MODELLED');
    expect(view.refusalReason).toBeTruthy();
    expect(view.nextExperiment).toBeNull();
  });

  it('PARAMETER predictions reach the view, real solver output not arithmetic done here', () => {
    const input = {
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
    } as const;

    const outcome = runDiscovery({ shape: 'PARAMETER', input });
    if (outcome.status !== 'RAN') throw new Error(`expected RAN, got REFUSED: ${outcome.admission.why}`);

    const view = buildGenesisMatrixView(outcome);
    const predicted = view.entries.flatMap((e) => e.verdicts.map((v) => v.predicted)).filter((p) => p !== null);
    expect(predicted.length).toBeGreaterThan(0);
    // This shape's reference is per-hypothesis, not one round-level number.
    expect(view.entries.every((e) => e.reference === null)).toBe(true);
  });
});
