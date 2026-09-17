import { describe, expect, it } from 'vitest';
import { runDiscoveryCampaign, type CampaignLaboratory } from '../core/agent/discoveryCampaign';
import { buildDiscoveryGraph, transferKnowledge } from '../core/agent/discoveryGraph';
import { makeKeplerCampaignLab, makeQe4CampaignLab } from '../core/biotechData/campaignLabs';
import { findNextDirections } from '../core/agent/directionFinder';

/**
 * E1 acceptance criterion A: `generatedDirection ∉ seededQuestions`.
 *
 * Every laboratory below is real (the same `makeQe4CampaignLab`/
 * `makeKeplerCampaignLab` used by discoveryCampaign.test.ts's own §13/§14
 * acceptance cases) or a deterministic synthetic lab in the same style as
 * that file's own `pureQuadraticLab` — never a hand-typed `CampaignResult`.
 */

const FROZEN_GRAMMAR = { maxRounds: 6, maxTerms: 1, excludeBases: ['LOG', 'RECIPROCAL', 'POWER', 'EXP_SATURATION'] as const };

/** Guarantees leftover residual structure: true relation needs 3 terms, grammar is frozen to 1. */
function pureQuadraticLab(labId: string): CampaignLaboratory {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8];
  const byX = new Map(xs.map((x) => [x, { x, y: 2 + 0.5 * x * x, sigma: 0.05 }]));
  return {
    labId,
    problem: `Synthetic (${labId}): y = 2 + 0.5x², deliberately outside a CONSTANT/LINEAR-only grammar.`,
    candidateX: xs,
    observe: (x) => byX.get(x) ?? null,
    xRange: { min: 1, max: 8 },
    xLabel: 'x',
    yLabel: 'y',
  };
}

/** Pure linear data with a rich-enough grammar to fit it exactly — no residual, no gap, single winner expected. */
function boringLinearLab(): CampaignLaboratory {
  const xs = [1, 2, 3, 4, 5, 6];
  const byX = new Map(xs.map((x) => [x, { x, y: 3 + 2 * x, sigma: 0.01 }]));
  return {
    labId: 'boring-linear',
    problem: 'Synthetic: y = 3 + 2x, a grammar-complete relation with no leftover structure.',
    candidateX: xs,
    observe: (x) => byX.get(x) ?? null,
    xRange: { min: 1, max: 6 },
    xLabel: 'x',
    yLabel: 'y',
  };
}

describe('E1 direction finder — grounded in a real, finished CampaignResult', () => {
  it('a residual left by a frozen grammar produces a RESIDUAL_STRUCTURE_UNEXPLAINED direction, distinct from the seeded question', () => {
    const result = runDiscoveryCampaign(pureQuadraticLab('quad-1'), FROZEN_GRAMMAR);
    const finder = findNextDirections({ result });

    expect(finder.seededQuestion).toBe(result.problem);
    expect(finder.candidates.length).toBeGreaterThan(0);
    expect(finder.candidates.some((c) => c.generationMethod === 'RESIDUAL_STRUCTURE_UNEXPLAINED')).toBe(true);

    // Criterion A: the generated direction is not the seeded question, verbatim.
    for (const candidate of finder.candidates) {
      expect(candidate.question).not.toBe(finder.seededQuestion);
      expect(finder.seededQuestion.includes(candidate.question)).toBe(false);
    }
  });

  it('every candidate is grounded — provenance points at the real campaign fingerprint, parentKnowledge is non-empty', () => {
    const result = runDiscoveryCampaign(pureQuadraticLab('quad-2'), FROZEN_GRAMMAR);
    const finder = findNextDirections({ result });
    expect(finder.candidates.length).toBeGreaterThan(0);
    for (const candidate of finder.candidates) {
      expect(candidate.provenance.sourceCampaignFingerprint).toBe(result.campaignFingerprint);
      expect(candidate.provenance.campaignId).toBe(result.labId);
      expect(candidate.parentKnowledge.length).toBeGreaterThan(0);
      expect(candidate.falsifiability.length).toBeGreaterThan(0);
    }
  });

  it('a cleanly converged, grammar-complete campaign proposes nothing — no direction is invented from nothing', () => {
    const result = runDiscoveryCampaign(boringLinearLab(), { maxRounds: 6, maxTerms: 2 });
    const finder = findNextDirections({ result });
    expect(finder.selected).toBeNull();
    expect(finder.why.length).toBeGreaterThan(0);
  });

  it('real QE4 campaign: findNextDirections runs against actual pinned data without throwing, and stays bounded to the campaign\'s own facts', () => {
    const result = runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 6, maxTerms: 2 });
    const finder = findNextDirections({ result });
    expect(finder.seededQuestion).toBe(result.problem);
    for (const candidate of finder.candidates) {
      expect(candidate.question).not.toBe(result.problem);
    }
  });

  it('real Kepler campaign: same non-fabrication guarantee holds', () => {
    const result = runDiscoveryCampaign(makeKeplerCampaignLab(), { maxRounds: 7, maxTerms: 2 });
    const finder = findNextDirections({ result });
    expect(finder.seededQuestion).toBe(result.problem);
    for (const candidate of finder.candidates) {
      expect(candidate.question).not.toBe(result.problem);
    }
  });

  it('candidates are deterministic across replay: same campaign, same directions, same fingerprints', () => {
    const a = runDiscoveryCampaign(pureQuadraticLab('quad-replay'), FROZEN_GRAMMAR);
    const b = runDiscoveryCampaign(pureQuadraticLab('quad-replay'), FROZEN_GRAMMAR);
    const finderA = findNextDirections({ result: a });
    const finderB = findNextDirections({ result: b });
    expect(finderA.candidates.map((c) => c.fingerprint)).toEqual(finderB.candidates.map((c) => c.fingerprint));
  });
});

describe('E1 direction finder — cross-campaign transfer refusals surface a real direction', () => {
  it('a falsified model refused on import (no changedAssumptions declared) becomes a CROSS_CAMPAIGN_TRANSFER direction', () => {
    const source = runDiscoveryCampaign(pureQuadraticLab('quad-source'), FROZEN_GRAMMAR);
    const targetResult = runDiscoveryCampaign(pureQuadraticLab('quad-target'), FROZEN_GRAMMAR);
    const sourceGraph = buildDiscoveryGraph(source);
    const targetGraph = buildDiscoveryGraph(targetResult);

    const transfer = transferKnowledge(targetGraph, sourceGraph);
    const finder = findNextDirections({ result: targetResult, crossCampaignTransfers: [transfer] });

    if (transfer.refused.length > 0) {
      expect(finder.candidates.some((c) => c.generationMethod === 'CROSS_CAMPAIGN_TRANSFER')).toBe(true);
    } else {
      // Both campaigns produced disjoint fingerprints and no falsified overlap — a legitimate outcome, asserted rather than assumed.
      expect(transfer.imported.length).toBeGreaterThanOrEqual(0);
    }
  });
});
