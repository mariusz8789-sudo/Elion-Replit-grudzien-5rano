import { describe, expect, it } from 'vitest';
import { GOVERNED_PREPAREDNESS_QUESTIONS } from '../core/simulation/preparednessQuestions';
import {
  buildSavedTemporalMultiverse,
  isSavedTemporalMultiverse,
  replaySavedTemporalMultiverse,
  runTemporalMultiverse,
  type TemporalMultiverseSpec,
} from '../core/simulation/temporalMultiverse';

/**
 * PREREJESTRACJA MULTIVERSE.
 *
 * Nośnik pytania istnieje po to, żeby kryterium falsyfikacji dało się
 * zadeklarować PRZED wykonaniem. Testy pilnują trzech rzeczy: że wymyślonego
 * pytania nie da się podłożyć, że brak pytania NIE jest po cichu uzupełniany,
 * i że raz zadeklarowane pytanie przeżywa zapis oraz odtworzenie.
 */

const QUESTION = GOVERNED_PREPAREDNESS_QUESTIONS[0]!;
const PREPAREDNESS = { questionId: QUESTION.questionId, askedText: QUESTION.question, resolutionFingerprint: 'fp-multiverse-prereg' };

const BASE: TemporalMultiverseSpec = {
  baselineScenarioId: 'BASELINE',
  days: 14,
  stepsPerDay: 2,
  baseParams: { nAgents: 120, initialInfected: 4, seed: 20260901 },
  branches: [{ branchId: 'A', scenarioId: 'ISOLATION' }],
};

describe('Prerejestracja multiverse', () => {
  it('odrzuca pytanie spoza katalogu zamiast przyjąć wymyślony identyfikator', () => {
    expect(() => runTemporalMultiverse({
      ...BASE,
      preparedness: { questionId: 'prep:nie-istnieje', askedText: 'x', resolutionFingerprint: 'y' },
    })).toThrow(/nie istnieje w katalogu/);
  });

  it('brak prerejestracji zostaje brakiem — nic nie jest dorabiane', () => {
    const saved = buildSavedTemporalMultiverse(runTemporalMultiverse(BASE));

    expect(saved.preparedness).toBeUndefined();
    expect(saved.baseline.preparedness).toBeUndefined();
    expect(saved.branches[0]!.saved.preparedness).toBeUndefined();
    expect(isSavedTemporalMultiverse(saved)).toBe(true);
  });

  it('zadeklarowane pytanie schodzi do multiverse i do KAŻDEGO ramienia', () => {
    const saved = buildSavedTemporalMultiverse(runTemporalMultiverse({ ...BASE, preparedness: PREPAREDNESS }));

    expect(saved.preparedness).toEqual(PREPAREDNESS);
    expect(saved.baseline.preparedness).toEqual(PREPAREDNESS);
    expect(saved.branches[0]!.saved.preparedness).toEqual(PREPAREDNESS);
  });

  it('prerejestracja przeżywa odtworzenie — odtworzony multiverse wie, na jakie pytanie odpowiadał', () => {
    const saved = buildSavedTemporalMultiverse(runTemporalMultiverse({ ...BASE, preparedness: PREPAREDNESS }));
    const replay = replaySavedTemporalMultiverse(saved);

    expect(replay.status).toBe('MATCH');
    expect(replay.multiverse!.spec.preparedness).toEqual(PREPAREDNESS);
  });

  it('ten sam zestaw przebiegów pod innym pytaniem to inny eksperyment, nie ten sam z inną etykietą', () => {
    const withoutQuestion = runTemporalMultiverse(BASE);
    const withQuestion = runTemporalMultiverse({ ...BASE, preparedness: PREPAREDNESS });

    expect(withQuestion.multiverseFingerprint).not.toBe(withoutQuestion.multiverseFingerprint);
  });

  it('niekompletny nośnik pytania jest odrzucany — gorszy niż jego brak', () => {
    const saved = buildSavedTemporalMultiverse(runTemporalMultiverse({ ...BASE, preparedness: PREPAREDNESS }));

    expect(isSavedTemporalMultiverse({ ...saved, preparedness: { questionId: QUESTION.questionId } })).toBe(false);
    expect(isSavedTemporalMultiverse({ ...saved, preparedness: { questionId: '', askedText: '', resolutionFingerprint: '' } })).toBe(false);
  });

  it('samo pole nie jest dowodem: prerejestracja nie zmienia werdyktu odtworzenia', () => {
    const saved = buildSavedTemporalMultiverse(runTemporalMultiverse({ ...BASE, preparedness: PREPAREDNESS }));
    const tampered = { ...saved, branches: saved.branches.map((b) => ({ ...b, saved: { ...b.saved, resultFingerprint: 'deadbeef' } })) };

    // Zadeklarowane pytanie nie ratuje zdryfowanej gałęzi.
    expect(replaySavedTemporalMultiverse(tampered).status).not.toBe('MATCH');
  });
});
