import { describe, expect, it } from 'vitest';
import { parseObservationIntent } from '../core/lookingGlass/observationIntent';

/**
 * C1 SCIENTIFIC DIRECTOR — the flagship dialogue's own NL surface. The mission's exact sentences,
 * verbatim, both languages.
 */
describe('parseObservationIntent — scenarioRequest (opening the flagship scenario)', () => {
  it('the mission\'s own Polish opening sentence', () => {
    const intent = parseObservationIntent('Pokaż mi miasto podczas ekstremalnego deszczu.');
    expect(intent.scenarioRequest).toBe('EXTREME_RAINFALL');
  });

  it('the English equivalent', () => {
    expect(parseObservationIntent('Show me the city during extreme rainfall.').scenarioRequest).toBe('EXTREME_RAINFALL');
  });

  it('is null for an unrelated sentence', () => {
    expect(parseObservationIntent('Show me the pump.').scenarioRequest).toBeNull();
  });

  it('never flags TARGET as unresolved for a recognized scenario request', () => {
    expect(parseObservationIntent('Pokaż mi miasto podczas ekstremalnego deszczu.').unresolved).not.toContain('TARGET');
  });
});

describe('parseObservationIntent — askingWhatIsHappening', () => {
  it('bilingual "what\'s happening" / "co się dzieje"', () => {
    expect(parseObservationIntent('Co się dzieje?').askingWhatIsHappening).toBe(true);
    expect(parseObservationIntent('What is happening?').askingWhatIsHappening).toBe(true);
    expect(parseObservationIntent("What's happening?").askingWhatIsHappening).toBe(true);
  });

  it('is distinct from askingWhy and askingWhatChanged', () => {
    const happening = parseObservationIntent('Co się dzieje?');
    expect(happening.askingWhy).toBe(false);
    expect(happening.askingWhatChanged).toBe(false);
  });
});

describe('parseObservationIntent — rainfallCounterfactualQuery (now a real, computable counterfactual)', () => {
  it('the mission\'s own target sentence, Polish', () => {
    const intent = parseObservationIntent('Co jeśli deszcz będzie o 30% mniejszy?');
    expect(intent.rainfallCounterfactualQuery).toBe(true);
    expect(intent.rainfallCounterfactualPercent).toBe(30);
    expect(intent.rainfallCounterfactualDirection).toBe('LOWER');
  });

  it('the English equivalent', () => {
    const intent = parseObservationIntent('What if the rainfall were 30% lower?');
    expect(intent.rainfallCounterfactualQuery).toBe(true);
    expect(intent.rainfallCounterfactualPercent).toBe(30);
    expect(intent.rainfallCounterfactualDirection).toBe('LOWER');
  });

  it('the HIGHER direction — the Genesis Urban Resilience Engine audit\'s own example sentence, Polish', () => {
    const intent = parseObservationIntent('Co jeśli deszcz będzie o 30% większy?');
    expect(intent.rainfallCounterfactualQuery).toBe(true);
    expect(intent.rainfallCounterfactualPercent).toBe(30);
    expect(intent.rainfallCounterfactualDirection).toBe('HIGHER');
  });

  it('the HIGHER direction, English', () => {
    const intent = parseObservationIntent('What if the rainfall were 30% higher?');
    expect(intent.rainfallCounterfactualQuery).toBe(true);
    expect(intent.rainfallCounterfactualPercent).toBe(30);
    expect(intent.rainfallCounterfactualDirection).toBe('HIGHER');
  });

  it('direction is null when no counterfactual query matched at all', () => {
    expect(parseObservationIntent('Compare the two worlds.').rainfallCounterfactualDirection).toBeNull();
  });

  it('reads a different percentage, not just the flagship\'s own 30%', () => {
    expect(parseObservationIntent('What if the rainfall were 50% lower?').rainfallCounterfactualPercent).toBe(50);
  });

  it('does NOT get misrouted into the pump-failure intervention path', () => {
    const intent = parseObservationIntent('What if the rainfall were 30% lower?');
    expect(intent.interventionRequested).toBe(false);
  });

  it('is false for an unrelated comparison request', () => {
    expect(parseObservationIntent('Compare the two worlds.').rainfallCounterfactualQuery).toBe(false);
  });

  it('is false for the real pump hypothetical (must not over-match)', () => {
    expect(parseObservationIntent('What happens if the pump fails?').rainfallCounterfactualQuery).toBe(false);
  });
});

describe('parseObservationIntent — "next N hours" (the flagship dialogue\'s own forward-time phrasing)', () => {
  it('the mission\'s own Polish sentence', () => {
    const intent = parseObservationIntent('Pokaż następne 24 godziny.');
    expect(intent.time).toEqual({ kind: 'RELATIVE', direction: 'FORWARD', amount: 24, unit: 'HOUR' });
  });

  it('the English equivalent', () => {
    const intent = parseObservationIntent('Show me the next 24 hours.');
    expect(intent.time).toEqual({ kind: 'RELATIVE', direction: 'FORWARD', amount: 24, unit: 'HOUR' });
  });

  it('never flags TIME as unresolved for this phrasing', () => {
    expect(parseObservationIntent('Pokaż następne 24 godziny.').unresolved).not.toContain('TIME');
  });

  it('is distinct from "go back" — "next" is always forward', () => {
    const intent = parseObservationIntent('Pokaż kolejne 3 dni.');
    expect(intent.time).toEqual({ kind: 'RELATIVE', direction: 'FORWARD', amount: 3, unit: 'DAY' });
  });
});

describe('parseObservationIntent — askingForLimitations (Genesis Urban Resilience Engine success criterion 8)', () => {
  it('English phrasing', () => {
    expect(parseObservationIntent('What are the assumptions?').askingForLimitations).toBe(true);
    expect(parseObservationIntent('What are the limitations?').askingForLimitations).toBe(true);
    expect(parseObservationIntent('Show me the limits.').askingForLimitations).toBe(true);
  });

  it('Polish phrasing', () => {
    expect(parseObservationIntent('Jakie są ograniczenia?').askingForLimitations).toBe(true);
    expect(parseObservationIntent('Pokaż założenia.').askingForLimitations).toBe(true);
  });

  it('is distinct from askingWhatIsHappening — a grounding question, not a status question', () => {
    const intent = parseObservationIntent('What are the limitations?');
    expect(intent.askingWhatIsHappening).toBe(false);
  });

  it('never flags TARGET as unresolved for this phrasing', () => {
    expect(parseObservationIntent('What are the limitations?').unresolved).not.toContain('TARGET');
  });

  it('is false for an unrelated sentence', () => {
    expect(parseObservationIntent('Show me the pump.').askingForLimitations).toBe(false);
  });
});
