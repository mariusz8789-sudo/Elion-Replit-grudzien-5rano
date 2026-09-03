import { describe, expect, it } from 'vitest';
import {
  describeStructuredRequest,
  isActionableRequest,
  parseNaturalLanguageScientificRequest,
} from '../core/discovery/molecular/naturalLanguageScientificRequest';

describe('natural language -> structured scientific request', () => {
  it('extracts named fields from a well-formed question', () => {
    const r = parseNaturalLanguageScientificRequest(
      'Which naturally occurring compound has the strongest evidence-supported mechanistic relationship to ketamine, an NMDA receptor open-channel blocker?',
      'q1',
    );
    expect(r.goal.status).toBe('FOUND');
    expect(r.goal.values).toContain('DISCOVER_CANDIDATE');
    expect(r.targets.values).toContain('NMDAR');
    expect(r.mechanisms.values).toContain('open-channel blocker');
    expect(r.referenceCompounds.values).toContain('ketamine');
    expect(r.constraintPhrases.values).toContain('naturally occurring');
  });

  it('marks unnamed fields UNKNOWN rather than guessing', () => {
    const r = parseNaturalLanguageScientificRequest('Tell me something interesting.', 'q2');
    expect(r.goal.status).toBe('UNKNOWN');
    expect(r.targets.status).toBe('UNKNOWN');
    expect(r.domain.status).toBe('UNKNOWN');
    expect(r.unresolvedFields.length).toBeGreaterThan(0);
    expect(isActionableRequest(r)).toBe(false);
  });

  it('every extracted value carries the literal matched text', () => {
    const r = parseNaturalLanguageScientificRequest('Compare mephedrone to ketamine.', 'q3');
    expect(r.referenceCompounds.matchedText.length).toBeGreaterThan(0);
    for (const m of r.referenceCompounds.matchedText) {
      expect('Compare mephedrone to ketamine.'.toLowerCase()).toContain(m.toLowerCase());
    }
  });

  it('flags ambiguity rather than silently picking one match', () => {
    const r = parseNaturalLanguageScientificRequest('Compare agmatine at NMDAR and morphine at the mu opioid receptor.', 'q4');
    expect(r.targets.status).toBe('AMBIGUOUS');
    expect(r.targets.values.length).toBeGreaterThan(1);
  });

  it('an actionable request needs both a goal and a target or reference', () => {
    const withGoalOnly = parseNaturalLanguageScientificRequest('Find a candidate.', 'q5');
    expect(isActionableRequest(withGoalOnly)).toBe(false);
    const withBoth = parseNaturalLanguageScientificRequest('Find a candidate similar to ketamine at NMDAR.', 'q6');
    expect(isActionableRequest(withBoth)).toBe(true);
  });

  it('describeStructuredRequest names every unresolved field', () => {
    const r = parseNaturalLanguageScientificRequest('Investigate something.', 'q7');
    const text = describeStructuredRequest(r);
    for (const field of r.unresolvedFields) expect(text).toContain(field);
  });
});
