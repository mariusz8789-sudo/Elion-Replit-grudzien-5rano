import { describe, expect, it } from 'vitest';
import { parseObservationIntent } from '../core/lookingGlass/observationIntent';

/**
 * C1 SCIENTIFIC CONTROL LOOP — the new NL surface `parseObservationIntent` needed to close the
 * loop: imperative intervention commands, "what if X fails" hypotheticals, and "what changed?".
 * The mission's own worked example sentences, verbatim (Polish and English).
 */
describe('parseObservationIntent — intervention commands ("Wyłącz pompę" / "turn off the pump")', () => {
  it('recognizes a Polish imperative command and names its own target', () => {
    const intent = parseObservationIntent('Wyłącz pompę.');
    expect(intent.interventionRequested).toBe(true);
    expect(intent.target).toBe('pompę');
  });

  it('recognizes the English equivalent', () => {
    const intent = parseObservationIntent('Turn off the pump.');
    expect(intent.interventionRequested).toBe(true);
    expect(intent.target).toBe('pump');
  });

  it('other verbs (stop/disable/fail/zatrzymaj) are recognized the same way', () => {
    for (const sentence of ['Stop the pump.', 'Disable the pump.', 'Fail the pump.', 'Zatrzymaj pompę.']) {
      expect(parseObservationIntent(sentence).interventionRequested, sentence).toBe(true);
    }
  });

  it('never flags TARGET as unresolved for a recognized intervention command', () => {
    const intent = parseObservationIntent('Wyłącz pompę.');
    expect(intent.unresolved).not.toContain('TARGET');
  });
});

describe('parseObservationIntent — "what if X fails" hypotheticals', () => {
  it('the mission\'s own target test sentence, in Polish', () => {
    const intent = parseObservationIntent('Co się stanie, jeśli pompa w mieście przestanie działać?');
    expect(intent.interventionRequested).toBe(true);
    expect(intent.target).toContain('pompa');
    expect(intent.comparison).toBe(true);
  });

  it('"Co się stanie, jeśli pompa padnie?"', () => {
    const intent = parseObservationIntent('Co się stanie, jeśli pompa padnie?');
    expect(intent.interventionRequested).toBe(true);
    expect(intent.target).toBe('pompa');
  });

  it('the English equivalent', () => {
    const intent = parseObservationIntent('What happens if the pump fails?');
    expect(intent.interventionRequested).toBe(true);
    expect(intent.target).toBe('pump');
    expect(intent.comparison).toBe(true);
  });

  it('"what would happen if" / "stops working" phrasing also matches', () => {
    const intent = parseObservationIntent('What would happen if the pump stops working?');
    expect(intent.interventionRequested).toBe(true);
    expect(intent.target).toBe('pump');
  });

  it('a hypothetical about an unrelated entity does not name the pump — never a guessed target', () => {
    const intent = parseObservationIntent('What happens if the hospital fails?');
    expect(intent.target).toBe('hospital');
  });
});

describe('parseObservationIntent — "Co się zmieniło?" / "what changed?"', () => {
  it('recognizes the question bilingually', () => {
    expect(parseObservationIntent('Co się zmieniło?').askingWhatChanged).toBe(true);
    expect(parseObservationIntent('What changed?').askingWhatChanged).toBe(true);
    expect(parseObservationIntent("What's different?").askingWhatChanged).toBe(true);
  });

  it('is distinct from askingWhy — a diff question, not a cause question', () => {
    const changed = parseObservationIntent('Co się zmieniło?');
    expect(changed.askingWhy).toBe(false);
    const why = parseObservationIntent('Why did this happen?');
    expect(why.askingWhatChanged).toBe(false);
  });

  it('never flags TARGET as unresolved', () => {
    expect(parseObservationIntent('Co się zmieniło?').unresolved).not.toContain('TARGET');
  });
});

describe('parseObservationIntent — "Pokaż mi przed i po" / before-and-after (already-existing mode detection, regression check)', () => {
  it('still resolves to BEFORE_AFTER mode after the new fields were added', () => {
    expect(parseObservationIntent('Pokaż mi przed i po.').mode).toBe('BEFORE_AFTER');
    expect(parseObservationIntent('Show me before and after.').mode).toBe('BEFORE_AFTER');
  });
});

describe('parseObservationIntent — "Cofnij do momentu przed awarią" (before the failure)', () => {
  it('resolves to a BEFORE_EVENT time intent naming the failure', () => {
    const intent = parseObservationIntent('Cofnij do momentu przed awarią.');
    expect(intent.time).toEqual({ kind: 'BEFORE_EVENT', eventRef: 'awarią' });
    expect(intent.event).toBe('awarią');
  });
});

describe('parseObservationIntent — plain observation requests still work (regression)', () => {
  it('"Pokaż pompę" is a plain target request, not an intervention', () => {
    const intent = parseObservationIntent('Pokaż pompę.');
    expect(intent.target).toBe('pompę');
    expect(intent.interventionRequested).toBe(false);
  });
});
