import { describe, expect, it } from 'vitest';
import {
  createHypothesis, updateConfidence, rankHypotheses, activeHypotheses,
  checkDiscriminability, selectMostDiscriminatingExperiment,
} from '../core/experimentFabric/beliefRevision';
import type { FalsificationCriterion } from '../core/experimentFabric/scientificDiscovery';

const CRITERION: FalsificationCriterion = {
  metric: 'headLossM', relation: 'greater-than', expectedValue: 5, rationale: 'flood raises head loss',
};

describe('createHypothesis', () => {
  it('starts ACTIVE with no history and the declared prior confidence', () => {
    const h = createHypothesis('H1', CRITERION, 0.7);
    expect(h.status).toBe('ACTIVE');
    expect(h.confidence).toBe(0.7);
    expect(h.history).toEqual([]);
    expect(h.generatedBy).toBe('INITIAL');
    expect(h.parentHypothesisId).toBeNull();
  });

  it('clamps an out-of-range prior rather than accepting an invalid confidence', () => {
    expect(createHypothesis('H1', CRITERION, 1.5).confidence).toBeLessThanOrEqual(0.99);
    expect(createHypothesis('H1', CRITERION, -0.5).confidence).toBeGreaterThanOrEqual(0.01);
  });
});

describe('updateConfidence — real, monotonic movement grounded in real evidence magnitude', () => {
  it('supporting evidence raises confidence; a history record is appended, not overwritten', () => {
    const h = createHypothesis('H1', CRITERION, 0.5);
    const updated = updateConfidence(h, 'SUPPORTED_WITHIN_PROTOCOL', 0.8, 'strong support', 0);
    expect(updated.confidence).toBeGreaterThan(h.confidence);
    expect(updated.status).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(updated.history.length).toBe(1);
    expect(updated.history[0].beforeConfidence).toBe(0.5);
    expect(updated.history[0].afterConfidence).toBe(updated.confidence);
  });

  it('contradicting evidence lowers confidence', () => {
    const h = createHypothesis('H1', CRITERION, 0.5);
    const updated = updateConfidence(h, 'FALSIFIED_WITHIN_PROTOCOL', 0.8, 'strong contradiction', 0);
    expect(updated.confidence).toBeLessThan(h.confidence);
    expect(updated.status).toBe('FALSIFIED_WITHIN_PROTOCOL');
  });

  it('a decisive contradiction moves confidence MORE than a weak one', () => {
    const h = createHypothesis('H1', CRITERION, 0.5);
    const weak = updateConfidence(h, 'FALSIFIED_WITHIN_PROTOCOL', 0.1, 'barely missed', 0);
    const strong = updateConfidence(h, 'FALSIFIED_WITHIN_PROTOCOL', 0.9, 'missed by a wide margin', 0);
    expect(h.confidence - strong.confidence).toBeGreaterThan(h.confidence - weak.confidence);
  });

  it('INCONCLUSIVE leaves confidence and status unchanged but still records the step', () => {
    const h = createHypothesis('H1', CRITERION, 0.6);
    const updated = updateConfidence(h, 'INCONCLUSIVE', 0.5, 'not yet decidable', 0);
    expect(updated.confidence).toBe(0.6);
    expect(updated.status).toBe('ACTIVE');
    expect(updated.history.length).toBe(1);
  });

  it('a real, worked multi-step trajectory: repeated contradiction drives confidence down across real recorded steps', () => {
    let h = createHypothesis('H1', CRITERION, 0.82);
    h = updateConfidence(h, 'FALSIFIED_WITHIN_PROTOCOL', 0.6, 'observation 1 contradicts', 0);
    const afterOne = h.confidence;
    h = updateConfidence(h, 'FALSIFIED_WITHIN_PROTOCOL', 0.6, 'observation 2 also contradicts', 1);
    expect(h.confidence).toBeLessThan(afterOne);
    expect(h.confidence).toBeLessThan(0.82);
    expect(h.history.map((r) => r.reason)).toEqual(['observation 1 contradicts', 'observation 2 also contradicts']);
  });

  it('never leaves the open (0,1) interval regardless of how much evidence accumulates', () => {
    let h = createHypothesis('H1', CRITERION, 0.5);
    for (let i = 0; i < 50; i++) h = updateConfidence(h, 'SUPPORTED_WITHIN_PROTOCOL', 1, 'support', i);
    expect(h.confidence).toBeLessThan(1);
    expect(h.confidence).toBeGreaterThan(0);
  });
});

describe('rankHypotheses / activeHypotheses', () => {
  it('ranks by confidence descending', () => {
    const h1 = createHypothesis('H1', CRITERION, 0.3);
    const h2 = createHypothesis('H2', CRITERION, 0.8);
    const h3 = createHypothesis('H3', CRITERION, 0.5);
    expect(rankHypotheses([h1, h2, h3]).map((h) => h.id)).toEqual(['H2', 'H3', 'H1']);
  });

  it('a falsified hypothesis is excluded from the active set even at high leftover confidence', () => {
    let h1 = createHypothesis('H1', CRITERION, 0.9);
    h1 = updateConfidence(h1, 'FALSIFIED_WITHIN_PROTOCOL', 0.05, 'barely falsified', 0); // confidence stays high-ish
    const h2 = createHypothesis('H2', CRITERION, 0.4);
    const active = activeHypotheses([h1, h2]);
    expect(active.map((h) => h.id)).toEqual(['H2']);
  });
});

describe('checkDiscriminability / selectMostDiscriminatingExperiment — the request\'s own worked example', () => {
  const h1 = createHypothesis('H1', { metric: 'x', relation: 'greater-than', expectedValue: 100, rationale: 'H1: x > 100' }, 0.6);
  const h2 = createHypothesis('H2', { metric: 'x', relation: 'less-than', expectedValue: 100, rationale: 'H2: x < 100' }, 0.4);

  it('a candidate both hypotheses agree on does NOT discriminate', () => {
    // Both H1 (>100) and H2 (<100) are FALSIFIED by x=100 exactly (neither > nor <).
    const check = checkDiscriminability(h1, h2, 0, 100);
    expect(check.discriminates).toBe(false);
  });

  it('a candidate the hypotheses disagree on DOES discriminate', () => {
    const check = checkDiscriminability(h1, h2, 0, 150); // >100 true (H1 supported), <100 false (H2 falsified)
    expect(check.discriminates).toBe(true);
  });

  it('selectMostDiscriminatingExperiment prefers a discriminating candidate over a non-discriminating one earlier in the list', () => {
    // First candidate offered (50) discriminates neither... wait: 50 is <100 (H2 supported) and not >100 (H1 falsified) -- it DOES discriminate too.
    // Use a genuinely non-discriminating value first: x itself equal to expectedValue is undecided for both strict relations at the boundary only in
    // the sense both fail; test with two genuinely tied outcomes instead using tolerance criteria on both sides is unnecessary -- direct greater/less
    // relations already differ at every non-boundary point, so exercise the boundary (non-discriminating) then a clear point (discriminating).
    const result = selectMostDiscriminatingExperiment(h1, h2, 0, [100, 150]);
    expect(result).not.toBeNull();
    expect(result!.intervention).toBe(150);
  });

  it('returns null when NONE of the offered candidates discriminate — never picks a useless one anyway', () => {
    const result = selectMostDiscriminatingExperiment(h1, h2, 0, [100]);
    expect(result).toBeNull();
  });
});

describe('persistence compatibility — a Hypothesis is a plain JSON structure, so it survives real iterations via AgentRun', () => {
  it('round-trips through JSON.stringify/parse byte-identical, including its full confidence history', () => {
    // `agent_run_steps.hypothesis_json` (packages/backend/src/agentRun.mjs, shipped
    // earlier tonight) is the real persistence layer this belongs to: every field on
    // Hypothesis is a plain string/number/array, so a real AgentStep can carry a full
    // belief-state snapshot with no adapter layer and no loss across a real restart —
    // the exact "close the DB handle, reopen, read back byte-identical" guarantee
    // agentRun.test.mjs already proves for the column itself. This test proves the
    // OTHER half: that what gets put into that column is not itself lossy.
    let h = createHypothesis('H1', CRITERION, 0.82);
    h = updateConfidence(h, 'FALSIFIED_WITHIN_PROTOCOL', 0.6, 'observation 1', 0);
    h = updateConfidence(h, 'FALSIFIED_WITHIN_PROTOCOL', 0.4, 'observation 2', 1);
    const restored = JSON.parse(JSON.stringify(h));
    expect(restored).toEqual(h);
    expect(restored.history.length).toBe(2);
  });
});
