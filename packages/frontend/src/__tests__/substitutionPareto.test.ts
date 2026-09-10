import { describe, expect, it } from 'vitest';
import { counterfactualSubstitution, paretoFrontier } from '../core/biotechData/substitutionPareto';
import type { CandidateRanking } from '../core/biotechDiscoveryContract';

/**
 * Ported from an external (Qwen) draft written against the exact real
 * `CandidateRanking` shape — every fixture here is a well-formed
 * `CandidateRanking`, not the draft's own standalone type.
 */

const cand = (id: string, components: Partial<CandidateRanking['components']>): CandidateRanking => ({
  candidateId: id, score: 0.5,
  components: { evidenceQuality: 0.5, targetRelevance: 0.5, safetyPenalty: 0.5, uncertaintyPenalty: 0.5, ...components },
  rationale: 'test fixture', uncertainty: 'test fixture', epistemicStatus: 'PREDICTION',
});

describe('paretoFrontier', () => {
  it('penalty axis: lower safetyPenalty dominates', () => {
    expect(paretoFrontier([cand('a', { safetyPenalty: 0.2 }), cand('b', { safetyPenalty: 0.8 })], ['safetyPenalty'])).toEqual(['a']);
  });
  it('penalty axis: lower uncertaintyPenalty dominates', () => {
    expect(paretoFrontier([cand('a', { uncertaintyPenalty: 0.1 }), cand('b', { uncertaintyPenalty: 0.9 })], ['uncertaintyPenalty'])).toEqual(['a']);
  });
  it('benefit axis: higher evidenceQuality dominates', () => {
    expect(paretoFrontier([cand('a', { evidenceQuality: 0.9 }), cand('b', { evidenceQuality: 0.3 })], ['evidenceQuality'])).toEqual(['a']);
  });
  it('benefit axis: higher computeSupport dominates when both defined', () => {
    expect(paretoFrontier([cand('p', { computeSupport: 0.9 }), cand('q', { computeSupport: 0.4 })], ['computeSupport'])).toEqual(['p']);
  });
  it('trade-off across directions: neither dominates', () => {
    const a = cand('a', { evidenceQuality: 0.9, safetyPenalty: 0.8 });
    const b = cand('b', { evidenceQuality: 0.3, safetyPenalty: 0.2 });
    expect(paretoFrontier([a, b], ['evidenceQuality', 'safetyPenalty'])).toEqual(['a', 'b']);
  });
  it('identical components: both on frontier, deterministic order by candidateId', () => {
    expect(paretoFrontier([cand('b', {}), cand('a', {})], ['evidenceQuality', 'safetyPenalty'])).toEqual(['a', 'b']);
  });
  it('computeSupport undefined: axis skipped, no fabricated 0 — candidate without it can still dominate on other axes', () => {
    const x = cand('X', { evidenceQuality: 0.5, computeSupport: 0.9 });
    const y = cand('Y', { evidenceQuality: 0.9 }); // computeSupport absent
    expect(paretoFrontier([x, y], ['evidenceQuality', 'computeSupport'])).toEqual(['Y']);
  });
  it('computeSupport undefined: incomparable pair both remain on frontier', () => {
    const w = cand('W', { evidenceQuality: 0.5, computeSupport: 0.9 });
    const z = cand('Z', { evidenceQuality: 0.5 }); // computeSupport absent
    expect(paretoFrontier([w, z], ['evidenceQuality', 'computeSupport'])).toEqual(['W', 'Z']);
  });
});

describe('counterfactualSubstitution', () => {
  it('functionRetained formula exact and violation below 0.5', () => {
    const r = counterfactualSubstitution(cand('a', { uncertaintyPenalty: 0.25 }), { replacementFraction: 1, potencyFactor: 0.5, toxicityLimit: null });
    expect(r.functionRetained).toBe(0.375);
    expect(r.violations).toEqual(['functionRetained=0.375 < 0.5']);
  });
  it('functionRetained capped at 1, no violation', () => {
    const r = counterfactualSubstitution(cand('a', { uncertaintyPenalty: 0 }), { replacementFraction: 1, potencyFactor: 2, toxicityLimit: null });
    expect(r.functionRetained).toBe(1);
    expect(r.violations).toEqual([]);
  });
  it('safety violation only when toxicityLimit set and exceeded', () => {
    const withLimit = counterfactualSubstitution(cand('a', { uncertaintyPenalty: 0, safetyPenalty: 0.75 }), { replacementFraction: 1, potencyFactor: 1, toxicityLimit: 0.5 });
    expect(withLimit.violations).toEqual(['safety penalty too high']);
    const noLimit = counterfactualSubstitution(cand('a', { uncertaintyPenalty: 0, safetyPenalty: 0.75 }), { replacementFraction: 1, potencyFactor: 1, toxicityLimit: null });
    expect(noLimit.violations).toEqual([]);
  });
  it('both violations, deterministic order', () => {
    const r = counterfactualSubstitution(cand('a', { uncertaintyPenalty: 0.75, safetyPenalty: 0.6 }), { replacementFraction: 1, potencyFactor: 1, toxicityLimit: 0.5 });
    expect(r.violations).toEqual(['functionRetained=0.25 < 0.5', 'safety penalty too high']);
  });
  it('label and mergedIntoEvidence are constant literals', () => {
    for (const up of [0, 0.5, 1]) {
      const r = counterfactualSubstitution(cand('a', { uncertaintyPenalty: up }), { replacementFraction: 0.5, potencyFactor: 0.5, toxicityLimit: 0.1 });
      expect(r.label).toBe('COUNTERFACTUAL/SIMULATED');
      expect(r.mergedIntoEvidence).toBe(false);
    }
  });
});
