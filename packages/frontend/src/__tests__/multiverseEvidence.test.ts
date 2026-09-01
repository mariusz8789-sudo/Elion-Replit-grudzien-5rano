import { describe, expect, it } from 'vitest';
import { buildMultiverseBranchEvidencePack } from '../core/experimentFabric/multiverseEvidence';
import { GOVERNED_PREPAREDNESS_QUESTIONS } from '../core/simulation/preparednessQuestions';
import {
  buildSavedTemporalMultiverse,
  multiverseBranchAsCounterfactual,
  replaySavedTemporalMultiverse,
  runTemporalMultiverse,
  type TemporalMultiverseSpec,
} from '../core/simulation/temporalMultiverse';

/**
 * MULTIVERSE → EVIDENCE, PRZEZ ISTNIEJĄCY MOST KONTRFAKTYCZNY.
 *
 * Te testy pilnują, że most tylko PRZEKŁADA już policzone porównanie gałęzi
 * w kontrakt, który Evidence Pack rozumie — nie liczy nic drugi raz i nie
 * omija żadnej z czterech bramek fail-closed, które `counterfactualEvidence`
 * już egzekwuje.
 */

const QUESTION = GOVERNED_PREPAREDNESS_QUESTIONS[0]!; // prep:isolation-timing — ISOLATION vs ISOLATION, dzień 0 vs 20
const PREPAREDNESS = { questionId: QUESTION.questionId, askedText: QUESTION.question, resolutionFingerprint: 'fp-multiverse-evidence' };

const SPEC: TemporalMultiverseSpec = {
  baselineScenarioId: 'ISOLATION',
  days: 18,
  stepsPerDay: 2,
  baseParams: { nAgents: 120, initialInfected: 4, seed: 20260831 },
  branches: [{ branchId: 'B', scenarioId: 'ISOLATION', interventionStartDay: 20 }],
  preparedness: PREPAREDNESS,
};

describe('Gałąź multiverse jako kontrfaktyk', () => {
  it('projekcja niesie realne porównanie, które multiverse już policzył', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const branch = multiverse.branches[0]!;
    const counterfactual = multiverseBranchAsCounterfactual(multiverse, 'B')!;

    expect(counterfactual.comparison).toBe(branch.comparisonToBaseline);
    expect(counterfactual.firstDivergentDay).toBe(branch.firstDivergentDayFromBaseline);
    expect(counterfactual.baseline).toBe(multiverse.baseline);
    expect(counterfactual.variant).toBe(branch.run);
    expect(counterfactual.spec.variantInterventionStartDay).toBe(20);
  });

  it('nieistniejąca gałąź zwraca null zamiast zmyślonego kontrfaktyku', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    expect(multiverseBranchAsCounterfactual(multiverse, 'Z-nie-istnieje')).toBeNull();
  });

  it('gałąź NOT_MODELED (porównanie niekompletne) też zwraca null', () => {
    const multiverse = runTemporalMultiverse({ ...SPEC, branches: [{ branchId: 'X', scenarioId: 'VACCINATION' }] });
    expect(multiverseBranchAsCounterfactual(multiverse, 'X')).toBeNull();
  });
});

describe('Evidence Pack z gałęzi multiverse przez ISTNIEJĄCY kontrakt', () => {
  it('tworzy paczkę z realnych przebiegów i prerejestrowanego kryterium', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const result = buildMultiverseBranchEvidencePack(multiverse, 'B');

    expect(result.status).toBe('CREATED');
    expect(result.pack).not.toBeNull();
    expect(result.pack!.protocol.hypothesis.falsification).toEqual(QUESTION.falsification);
    expect(result.sweptLever).toBe('interventionStartDay');
  });

  it('brak prerejestracji na specu daje NOT_AVAILABLE — kryterium nie jest dorabiane', () => {
    const multiverse = runTemporalMultiverse({ ...SPEC, preparedness: undefined });
    const result = buildMultiverseBranchEvidencePack(multiverse, 'B');

    expect(result.status).toBe('NOT_AVAILABLE');
    expect(result.pack).toBeNull();
  });

  it('nieistniejąca gałąź jest BLOCKED_NOT_COMPARABLE, nigdy CREATED', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const result = buildMultiverseBranchEvidencePack(multiverse, 'Z-nie-istnieje');

    expect(result.status).toBe('BLOCKED_NOT_COMPARABLE');
    expect(result.pack).toBeNull();
  });

  it('działa też na multiverse odtworzonym przez replay (MATCH), nie tylko świeżym runie', () => {
    const saved = buildSavedTemporalMultiverse(runTemporalMultiverse(SPEC));
    const replay = replaySavedTemporalMultiverse(saved);
    expect(replay.status).toBe('MATCH');

    const result = buildMultiverseBranchEvidencePack(replay.multiverse!, 'B');
    expect(result.status).toBe('CREATED');
  });

  it('ten sam multiverse daje deterministycznie tę samą paczkę', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const first = buildMultiverseBranchEvidencePack(multiverse, 'B').pack!;
    const second = buildMultiverseBranchEvidencePack(multiverse, 'B').pack!;

    expect(second.evidencePackId).toBe(first.evidencePackId);
  });

  it('multiverse z wieloma gałęziami daje NIEZALEŻNE paczki, nie jedną za całość', () => {
    const twoWorlds = runTemporalMultiverse({
      ...SPEC,
      branches: [
        { branchId: 'B-natychmiast', scenarioId: 'ISOLATION', interventionStartDay: 0 },
        { branchId: 'C-opoznione', scenarioId: 'ISOLATION', interventionStartDay: 20 },
      ],
    });

    const immediate = buildMultiverseBranchEvidencePack(twoWorlds, 'B-natychmiast');
    const delayed = buildMultiverseBranchEvidencePack(twoWorlds, 'C-opoznione');

    // Baseline vs siebie samego (dzień 0 wobec dnia 0) nie jest wariantem.
    expect(immediate.status).toBe('BLOCKED_NOT_COMPARABLE');
    expect(delayed.status).toBe('CREATED');
    expect(delayed.pack).not.toBeNull();
  });
});
