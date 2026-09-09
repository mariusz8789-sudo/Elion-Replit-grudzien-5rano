import { describe, expect, it } from 'vitest';
import { runDiscovery } from '../core/agent/discoveryOrchestrator';
import { buildGenesisMatrixView } from '../core/agent/genesisMatrix';
import { narrateIntro, narrateInvestigation, narrateNext, narrateRound } from '../core/agent/genesisNarration';
import { GENESIS_FLOOD_CATALOG } from '../core/agent/worldGoalIntent';

/**
 * NARRATION — every line traced back to a real field on a real run, the same
 * pump-lever investigation the P3/Matrix tests already measure.
 */

const PUMP_GOAL = 'Minimise peak flood depth using the pump, at most 4 experiments.';

function pumpView() {
  const outcome = runDiscovery({ shape: 'MECHANISM', goal: PUMP_GOAL, catalog: GENESIS_FLOOD_CATALOG });
  if (outcome.status !== 'RAN') throw new Error(`expected RAN, got REFUSED: ${outcome.admission.why}`);
  return buildGenesisMatrixView(outcome);
}

describe('genesis narration — real fields, never filler', () => {
  it('narrates the intro with the real question and the real capability caveat', () => {
    const view = pumpView();
    const lines = narrateIntro(view);
    expect(lines.some((l) => l.phase === 'INTRO' && l.text.includes(PUMP_GOAL))).toBe(true);
    // APPROXIMATION admissions carry a caveat — a listener must hear it, not
    // just a reader of the JSON.
    expect(view.admissionCaveat).toBeTruthy();
    expect(lines.some((l) => l.phase === 'CAVEAT' && l.text === view.admissionCaveat)).toBe(true);
  });

  it('narrates round 1 — the real falsification, with the real measured numbers', () => {
    const view = pumpView();
    const lines = narrateRound(view.entries[0]!);

    // MECHANISM predicts nothing (asserts a direction, not a value) — no
    // PREDICTION line invented to match a script.
    expect(lines.some((l) => l.phase === 'PREDICTION')).toBe(false);
    expect(lines.some((l) => l.phase === 'OBSERVATION' && l.text.includes('1.466356695856317') && l.text.includes('1.4495159056888596'))).toBe(true);
    expect(lines.some((l) => l.phase === 'VERDICT' && l.text.includes('h:pump-capacity') && l.text.includes('was rejected'))).toBe(true);
  });

  it('narrates round 2 — P3\'s own regenerated hypothesis, by its real id', () => {
    const view = pumpView();
    const lines = narrateRound(view.entries[1]!);
    expect(lines.some((l) => l.text.includes('h:pump-capacity~RELATION_FLIP'))).toBe(true);
  });

  it('narrates a real next-experiment or a real stop reason, never both, never neither at the end', () => {
    const view = pumpView();
    const lines = narrateNext(view);
    expect(lines).toHaveLength(1);
    if (view.nextExperiment) {
      expect(lines[0]!.text).toContain(view.nextExperiment.action);
    } else {
      expect(lines[0]!.text).toContain(view.stopReason!);
    }
  });

  it('a PARAMETER run narrates real predictions, the shape MECHANISM cannot', () => {
    const outcome = runDiscovery({
      shape: 'PARAMETER',
      input: {
        question: 'Which activation energy does this sample have?',
        system: {
          systemId: 'sample-under-test', label: 'Unknown kinetics sample', modelId: 'chemistry-arrhenius',
          hiddenParameters: { activationEnergyKJ: 60 }, probeParameterId: 'temperatureK',
          candidateProbeValues: [400, 450, 800], fixedParameters: { preExponentialLog10: 4 },
          observedMetric: 'rateConstant', agreementTolerance: 0.15,
        },
        hypotheses: [
          { hypothesisId: 'h:ea-60', statement: 'Ea is 60 kJ/mol.', claimedValues: { activationEnergyKJ: 60 }, priorConfidence: 0.5 },
          { hypothesisId: 'h:ea-70', statement: 'Ea is 70 kJ/mol.', claimedValues: { activationEnergyKJ: 70 }, priorConfidence: 0.5 },
        ],
        openingProbeValue: 400,
        maxRounds: 3,
      },
    });
    if (outcome.status !== 'RAN') throw new Error(`expected RAN, got REFUSED: ${outcome.admission.why}`);
    const view = buildGenesisMatrixView(outcome);
    const lines = view.entries.flatMap((e) => narrateRound(e));
    expect(lines.some((l) => l.phase === 'PREDICTION')).toBe(true);
  });

  it('a refused question narrates only the real refusal, never a fake investigation', () => {
    const outcome = runDiscovery({ shape: 'MECHANISM', goal: 'Will the volcano erupt tomorrow?', catalog: GENESIS_FLOOD_CATALOG });
    const view = buildGenesisMatrixView(outcome);
    const lines = narrateInvestigation(view);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.phase).toBe('CAVEAT');
    expect(lines[0]!.text).toContain(view.refusalReason);
  });

  it('narrateInvestigation stops at the requested round — never ahead of what the scene has staged', () => {
    const view = pumpView();
    const upToFirst = narrateInvestigation(view, 0);
    // Round 2's own regenerated-hypothesis id must not leak into a script that
    // has only staged round 1.
    expect(upToFirst.some((l) => l.text.includes('RELATION_FLIP'))).toBe(false);
    // And it has not narrated "next", because round 1 was not the last one staged.
    expect(upToFirst.some((l) => l.phase === 'NEXT')).toBe(false);

    const full = narrateInvestigation(view);
    expect(full.some((l) => l.text.includes('RELATION_FLIP'))).toBe(true);
    expect(full.some((l) => l.phase === 'NEXT')).toBe(true);
  });
});
