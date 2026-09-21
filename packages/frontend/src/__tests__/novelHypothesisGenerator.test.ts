import { describe, expect, it } from 'vitest';
import { runDiscoveryCampaign } from '../core/agent/discoveryCampaign';
import { findNextDirections } from '../core/agent/directionFinder';
import { makeKeplerCampaignLab } from '../core/biotechData/campaignLabs';
import type { FalsificationCriterion } from '../core/experimentFabric/scientificDiscovery';
import {
  generateNovelHypothesis,
  assertHypothesisWellFormed,
  NovelHypothesisViolationError,
  type CompetingExplanation,
} from '../core/agent/novelHypothesisGenerator';

function criterion(metric: string): FalsificationCriterion {
  return { metric, relation: 'less-than', rationale: 'test fixture' };
}

const RIVAL: CompetingExplanation = { statement: 'The pattern is a measurement artifact, not a real effect.', rationale: 'Instrument drift can produce a similar signature.' };

describe('assertHypothesisWellFormed — nothing is optional', () => {
  it('throws when mechanism is empty', () => {
    expect(() => assertHypothesisWellFormed({ mechanism: '', competingExplanations: [RIVAL], falsifier: 'x', requiredExperiment: 'y' })).toThrow(NovelHypothesisViolationError);
  });
  it('throws when no competing explanation is supplied', () => {
    expect(() => assertHypothesisWellFormed({ mechanism: 'm', competingExplanations: [], falsifier: 'x', requiredExperiment: 'y' })).toThrow(NovelHypothesisViolationError);
  });
  it('throws when falsifier is empty', () => {
    expect(() => assertHypothesisWellFormed({ mechanism: 'm', competingExplanations: [RIVAL], falsifier: '', requiredExperiment: 'y' })).toThrow(NovelHypothesisViolationError);
  });
  it('throws when requiredExperiment is empty', () => {
    expect(() => assertHypothesisWellFormed({ mechanism: 'm', competingExplanations: [RIVAL], falsifier: 'x', requiredExperiment: '' })).toThrow(NovelHypothesisViolationError);
  });
  it('does not throw when everything is present', () => {
    expect(() => assertHypothesisWellFormed({ mechanism: 'm', competingExplanations: [RIVAL], falsifier: 'x', requiredExperiment: 'y' })).not.toThrow();
  });
});

describe('generateNovelHypothesis — built from a real CandidateDirection off a real campaign', () => {
  it('produces a well-formed NovelHypothesis wrapping a real beliefRevision.ts Hypothesis', () => {
    const result = runDiscoveryCampaign(makeKeplerCampaignLab(), { maxRounds: 7, maxTerms: 2 });
    const finder = findNextDirections({ result });
    // Kepler converges cleanly with nothing left to explain (Phase E's own
    // finding) — construct a synthetic direction-shaped object only when
    // the real campaign raised none, so this test still exercises the real
    // generator function against a realistic CandidateDirection shape.
    const direction = finder.selected ?? {
      id: 'synthetic-direction',
      question: 'Does a residual pattern in the Kepler fit hint at a real effect?',
      whyNow: 'test fixture',
      parentKnowledge: ['test'],
      originatingObservation: null,
      originatingResidual: null,
      falsifiability: 'test',
      feasibility: 'RUNNABLE_NOW' as const,
      expectedScientificValue: 'test',
      noveltyCandidate: true,
      provenance: { campaignId: result.labId, sourceCampaignFingerprint: result.campaignFingerprint, round: null },
      generationMethod: 'RESIDUAL_STRUCTURE_UNEXPLAINED' as const,
      fingerprint: 'synthetic-fp',
    };

    const hyp = generateNovelHypothesis({
      direction,
      hypothesisId: 'hyp-1',
      criterion: criterion('test-metric'),
      priorConfidence: 0.5,
      mechanism: 'A real physical mechanism explaining the observed pattern.',
      competingExplanations: [RIVAL],
      falsifier: 'If the pattern disappears under an independent remeasurement, this hypothesis is refuted.',
      requiredExperiment: 'Remeasure under different instrument settings.',
      llmAssisted: false,
    });

    expect(hyp.hypothesis.status).toBe('ACTIVE');
    expect(hyp.hypothesis.confidence).toBeCloseTo(0.5, 5);
    expect(hyp.parentDirectionFingerprint).toBe(direction.fingerprint);
    expect(hyp.competingExplanations.length).toBeGreaterThan(0);
    expect(hyp.falsifier.length).toBeGreaterThan(0);
    expect(hyp.llmAssisted).toBe(false);
    expect(hyp.fingerprint.length).toBeGreaterThan(0);
  });

  it('is deterministic: identical inputs produce identical fingerprints', () => {
    const result = runDiscoveryCampaign(makeKeplerCampaignLab(), { maxRounds: 7, maxTerms: 2 });
    const direction = {
      id: 'synthetic-direction-2',
      question: 'q', whyNow: 'w', parentKnowledge: ['k'], originatingObservation: null, originatingResidual: null,
      falsifiability: 'f', feasibility: 'RUNNABLE_NOW' as const, expectedScientificValue: 'v', noveltyCandidate: true,
      provenance: { campaignId: result.labId, sourceCampaignFingerprint: result.campaignFingerprint, round: null },
      generationMethod: 'RESIDUAL_STRUCTURE_UNEXPLAINED' as const, fingerprint: 'fp-det',
    };
    const input = {
      direction, hypothesisId: 'hyp-det', criterion: criterion('m'), priorConfidence: 0.5,
      mechanism: 'mech', competingExplanations: [RIVAL], falsifier: 'fals', requiredExperiment: 'exp', llmAssisted: true,
    };
    const a = generateNovelHypothesis(input);
    const b = generateNovelHypothesis(input);
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('propagates the well-formedness check — a caller cannot bypass it by calling generateNovelHypothesis directly', () => {
    const result = runDiscoveryCampaign(makeKeplerCampaignLab(), { maxRounds: 7, maxTerms: 2 });
    const direction = {
      id: 'd', question: 'q', whyNow: 'w', parentKnowledge: ['k'], originatingObservation: null, originatingResidual: null,
      falsifiability: 'f', feasibility: 'RUNNABLE_NOW' as const, expectedScientificValue: 'v', noveltyCandidate: true,
      provenance: { campaignId: result.labId, sourceCampaignFingerprint: result.campaignFingerprint, round: null },
      generationMethod: 'RESIDUAL_STRUCTURE_UNEXPLAINED' as const, fingerprint: 'fp',
    };
    expect(() =>
      generateNovelHypothesis({ direction, hypothesisId: 'h', criterion: criterion('m'), priorConfidence: 0.5, mechanism: 'm', competingExplanations: [], falsifier: 'f', requiredExperiment: 'e', llmAssisted: false }),
    ).toThrow(NovelHypothesisViolationError);
  });
});
