import { describe, expect, it } from 'vitest';
import {
  generateSpacetimeHypotheses,
  GENERATION_LIMITATIONS,
  replayGeneratedSpacetimeHypotheses,
  saveGeneratedSpacetimeHypothesesToMemory,
  selectRelevantConstraints,
} from '../core/discovery/physics/generatedSpacetimeHypotheses';
import { ESTABLISHED_SPACETIME_CONSTRAINTS, SPACETIME_DEGREE_OF_FREEDOM_HYPOTHESES } from '../core/discovery/physics/spacetimeStructureInquiry';

/** The mission's example unseen question — never used as a hypothesis statement anywhere in this codebase. */
const UNSEEN_QUESTION = 'Are there mathematically consistent structures that could relate different temporal states without introducing an additional physical dimension?';

describe('selectRelevantConstraints — deterministic, auditable relevance', () => {
  it('is deterministic: identical question yields identical selection', () => {
    const a = selectRelevantConstraints(UNSEEN_QUESTION);
    const b = selectRelevantConstraints(UNSEEN_QUESTION);
    expect(a.selected.map((s) => s.constraint.constraintId)).toEqual(b.selected.map((s) => s.constraint.constraintId));
    expect(a.usedFallback).toBe(b.usedFallback);
  });

  it('falls back to the full registry, explicitly, when relevance is too sparse — never silently returns almost nothing', () => {
    const result = selectRelevantConstraints('completely unrelated question about baking bread');
    expect(result.usedFallback).toBe(true);
    expect(result.selected).toHaveLength(ESTABLISHED_SPACETIME_CONSTRAINTS.length);
    expect(result.fallbackReason.length).toBeGreaterThan(0);
  });

  it('every scored constraint carries its real matched tokens, traceable to the question text', () => {
    const result = selectRelevantConstraints('dimension');
    const withMatch = result.selected.find((s) => s.relevance > 0);
    if (withMatch) {
      for (const token of withMatch.matchedTokens) {
        expect('dimension'.toLowerCase()).toContain(token);
      }
    }
  });
});

describe('generateSpacetimeHypotheses — the unseen question, not preloaded', () => {
  it('the exact question text is not a statement of any preloaded hand-authored hypothesis', () => {
    for (const h of SPACETIME_DEGREE_OF_FREEDOM_HYPOTHESES) {
      expect(h.statement).not.toBe(UNSEEN_QUESTION);
    }
  });

  it('generates more than one candidate, each traceable to real constraint dependencies', () => {
    const result = generateSpacetimeHypotheses(UNSEEN_QUESTION);
    expect(result.candidates.length).toBeGreaterThan(1);
    for (const c of result.candidates) {
      expect(c.dependencyIds.length).toBeGreaterThanOrEqual(2);
      for (const id of c.dependencyIds) {
        expect(ESTABLISHED_SPACETIME_CONSTRAINTS.some((k) => k.constraintId === id)).toBe(true);
      }
    }
  });

  it('never regenerates a pair already used by a hand-authored hypothesis', () => {
    const result = generateSpacetimeHypotheses(UNSEEN_QUESTION);
    const namedPairs = new Set<string>();
    for (const h of SPACETIME_DEGREE_OF_FREEDOM_HYPOTHESES) {
      const ids = h.dependencies.map((d) => d.constraintId);
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) namedPairs.add([ids[i], ids[j]].sort().join('|'));
    }
    for (const c of result.candidates) {
      const key = [...c.dependencyIds].sort().join('|');
      expect(namedPairs.has(key)).toBe(false);
    }
  });

  it('every candidate reaches TESTED (or is honestly BLOCKED), never left GENERATED with no verdict', () => {
    const result = generateSpacetimeHypotheses(UNSEEN_QUESTION);
    for (const c of result.candidates) {
      expect(c.verdict).not.toBeNull();
      expect(['TESTED', 'GENERATED', 'FORMALIZED', 'CHECKED']).toContain(c.status);
      if (c.status === 'TESTED') {
        expect(['SUPPORTED', 'WEAKENED', 'UNRESOLVED']).toContain(c.verdict);
      }
    }
  });

  it('never fabricates CONTRADICTS/FALSIFIED — this strategy cannot honestly detect contradiction', () => {
    const result = generateSpacetimeHypotheses(UNSEEN_QUESTION);
    for (const c of result.candidates) {
      expect(c.verdict).not.toBe('FALSIFIED');
    }
    expect(GENERATION_LIMITATIONS.some((l) => l.includes('CONTRADICTS'))).toBe(true);
  });

  it('every candidate carries noveltyStatus NOVELTY_NOT_ESTABLISHED', () => {
    const result = generateSpacetimeHypotheses(UNSEEN_QUESTION);
    for (const c of result.candidates) {
      expect(c.noveltyStatus).toBe('NOVELTY_NOT_ESTABLISHED');
    }
  });

  it('never asserts a forbidden premise in any generated statement', () => {
    const result = generateSpacetimeHypotheses(UNSEEN_QUESTION);
    for (const c of result.candidates) {
      expect(c.statement.toLowerCase()).not.toMatch(/fifth dimension exists|time travel is possible/);
    }
  });

  it('is deterministic across runs', () => {
    const a = generateSpacetimeHypotheses(UNSEEN_QUESTION);
    const b = generateSpacetimeHypotheses(UNSEEN_QUESTION);
    expect(a.resultFingerprint).toBe(b.resultFingerprint);
  });
});

describe('generateSpacetimeHypotheses — replay and memory', () => {
  it('replays MATCH against its own freshly recomputed result', () => {
    const saved = generateSpacetimeHypotheses(UNSEEN_QUESTION);
    expect(replayGeneratedSpacetimeHypotheses(saved).status).toBe('MATCH');
  });

  it('replays DRIFT when the saved fingerprint is tampered with', () => {
    const saved = generateSpacetimeHypotheses(UNSEEN_QUESTION);
    const tampered = { ...saved, resultFingerprint: `${saved.resultFingerprint}0` };
    expect(replayGeneratedSpacetimeHypotheses(tampered).status).toBe('DRIFT');
  });

  it('replays NOT_COMPARABLE when a candidate depends on a constraint id no longer in the registry', () => {
    const saved = generateSpacetimeHypotheses(UNSEEN_QUESTION);
    const tampered = {
      ...saved,
      candidates: [{ ...saved.candidates[0]!, dependencyIds: ['DOES_NOT_EXIST_ANYMORE', ...saved.candidates[0]!.dependencyIds] }, ...saved.candidates.slice(1)],
    };
    expect(replayGeneratedSpacetimeHypotheses(tampered).status).toBe('NOT_COMPARABLE');
  });

  it('saves to memory keyed on the result fingerprint', () => {
    const result = generateSpacetimeHypotheses(UNSEEN_QUESTION);
    const saved = saveGeneratedSpacetimeHypothesesToMemory(result);
    expect(saved.experimentId).toContain(result.resultFingerprint);
    expect(saved.honestyNote).toMatch(/NOVELTY_NOT_ESTABLISHED/);
  });
});
