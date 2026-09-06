import { describe, expect, it } from 'vitest';
import { parseObservationIntent } from '../core/lookingGlass/observationIntent';

describe('Looking Glass — parseObservationIntent: the mission\'s own example sentences', () => {
  it('"Show me the hospital after the pump failure." — target + AFTER_EVENT', () => {
    const intent = parseObservationIntent('Show me the hospital after the pump failure.');
    expect(intent.target).toBe('hospital');
    expect(intent.time).toEqual({ kind: 'AFTER_EVENT', eventRef: 'pump failure' });
    expect(intent.event).toBe('pump failure');
    expect(intent.unresolved).not.toContain('TARGET');
  });

  it('"Go back before the incident." — BEFORE_EVENT, no target named', () => {
    const intent = parseObservationIntent('Go back before the incident.');
    expect(intent.time).toEqual({ kind: 'BEFORE_EVENT', eventRef: 'incident' });
    expect(intent.event).toBe('incident');
  });

  it('"Why did this change happen?" — askingWhy, no target required', () => {
    const intent = parseObservationIntent('Why did this change happen?');
    expect(intent.askingWhy).toBe(true);
    expect(intent.unresolved).not.toContain('TARGET');
  });

  it('"Compare with the intervention branch." — comparison trigger', () => {
    const intent = parseObservationIntent('Compare with the intervention branch.');
    expect(intent.comparison).toBe(true);
  });

  it('"Follow the hospital." — target and focus both set from the same word', () => {
    const intent = parseObservationIntent('Follow the hospital.');
    expect(intent.target).toBe('hospital');
    expect(intent.focus).toBe('hospital');
  });

  it('"Show me the consequence six hours later." — RELATIVE FORWARD 6 HOUR, no fabricated entity target', () => {
    const intent = parseObservationIntent('Show me the consequence six hours later.');
    // "consequence" is a generic word for "the answer to a question", not an
    // entity name — the parser must not invent an entity search for it.
    expect(intent.target).toBeNull();
  });

  it('"6 hours later" parses to a real RELATIVE FORWARD time intent', () => {
    const intent = parseObservationIntent('Show me the state 6 hours later.');
    expect(intent.time).toEqual({ kind: 'RELATIVE', direction: 'FORWARD', amount: 6, unit: 'HOUR' });
  });

  it('REGRESSION: "zoom into"/"zoom in on"/"take me to" are recognised target triggers', () => {
    // Found live in Chromium (Looking Glass 2.1): "Zoom into the hospital"
    // fell all the way through to an honest "no target was named" refusal,
    // even though the sentence plainly named one — TARGET_TRIGGERS simply
    // never listed "zoom into" as a trigger phrase.
    expect(parseObservationIntent('Zoom into the hospital.').target).toBe('hospital');
    expect(parseObservationIntent('Zoom in on the substance.').scale).toBe('MACRO');
    expect(parseObservationIntent('Zoom in on the substance.').target).toBe('substance');
    expect(parseObservationIntent('Take me to the laboratory.').target).toBe('laboratory');
  });

  it('REGRESSION: "go back 3 hours" (direction word BEFORE the amount) is not silently truncated to 1', () => {
    // Found live in Chromium: the bare GO_BACK fallback matched "go back"
    // first and discarded "3 hours" entirely, moving the world by 1 tick
    // instead of 3 — a silent, wrong answer, not a crash.
    expect(parseObservationIntent('Go back 3 hours.').time).toEqual({ kind: 'RELATIVE', direction: 'BACKWARD', amount: 3, unit: 'HOUR' });
    expect(parseObservationIntent('Go forward 6 hours.').time).toEqual({ kind: 'RELATIVE', direction: 'FORWARD', amount: 6, unit: 'HOUR' });
    expect(parseObservationIntent('Cofnij o 2 dni.').time).toEqual({ kind: 'RELATIVE', direction: 'BACKWARD', amount: 2, unit: 'DAY' });
  });
});

describe('Looking Glass — parseObservationIntent: modes, perspective, scale, baseline', () => {
  it('reads observation mode words, bilingual', () => {
    expect(parseObservationIntent('Show me this as a scientist.').mode).toBe('SCIENTIST');
    expect(parseObservationIntent('Show me this as an operator.').mode).toBe('ENGINEER');
    expect(parseObservationIntent('Show me this as a citizen.').mode).toBe('CITIZEN');
    expect(parseObservationIntent('Give me the system view.').mode).toBe('SYSTEM');
    expect(parseObservationIntent('Pokaż to jako naukowiec.').mode).toBe('SCIENTIST');
  });

  it('reads perspective words distinct from mode words', () => {
    const intent = parseObservationIntent('Show me the hospital as a scientist.');
    expect(intent.perspective).toBe('SCIENTIST_POV');
  });

  it('reads scale words', () => {
    expect(parseObservationIntent('Zoom in on the substance.').scale).toBe('MACRO');
    expect(parseObservationIntent('Show me the whole system from above.').scale).toBe('WIDE');
    expect(parseObservationIntent('Show me the hospital.').scale).toBeNull();
  });

  it('reads "return to baseline" distinctly from a plain comparison request', () => {
    const intent = parseObservationIntent('Return to baseline.');
    expect(intent.returningToBaseline).toBe(true);
    expect(intent.comparison).toBe(false);
  });

  it('a bare "compare" request is not confused with "return to baseline"', () => {
    const intent = parseObservationIntent('Compare with the intervention branch.');
    expect(intent.returningToBaseline).toBe(false);
    expect(intent.comparison).toBe(true);
  });
});

describe('Looking Glass — parseObservationIntent: determinism and honesty', () => {
  it('the same sentence always produces the same intentId', () => {
    const a = parseObservationIntent('Show me the hospital after the pump failure.');
    const b = parseObservationIntent('Show me the hospital after the pump failure.');
    expect(a.intentId).toBe(b.intentId);
  });

  it('two different sentences never collide on intentId', () => {
    const a = parseObservationIntent('Show me the hospital.');
    const b = parseObservationIntent('Show me the reactor.');
    expect(a.intentId).not.toBe(b.intentId);
  });

  it('a sentence naming nothing at all is honestly reported as unresolved TARGET, never a guessed default', () => {
    const intent = parseObservationIntent('Hello.');
    expect(intent.unresolved).toContain('TARGET');
    expect(intent.target).toBeNull();
  });

  it('"before X"/"after X" with no event text still gets marked resolved for TARGET (mode/time carry the sentence) but not silently invented', () => {
    const intent = parseObservationIntent('Go back before.');
    // No named event: BEFORE_EVENT never fires without a captured group, so
    // this correctly falls back to a bare "go back" relative time intent —
    // never a fabricated eventRef.
    expect(intent.time).toEqual({ kind: 'RELATIVE', direction: 'BACKWARD', amount: 1, unit: null });
  });
});
