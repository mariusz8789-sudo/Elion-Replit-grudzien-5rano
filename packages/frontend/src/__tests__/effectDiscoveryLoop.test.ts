import { describe, expect, it } from 'vitest';
import { createNodeAdmetTransport } from '../core/discovery/molecular/admetTransport.node';
import { runEffectDiscovery } from '../core/discovery/molecular/effectDiscoveryLoop';
import type { NaturalAnalogueCampaignRequest } from '../core/discovery/molecular/naturalAnalogueCampaign';
import { NATURAL_PRODUCT_CANDIDATE_POOL } from '../core/discovery/molecular/naturalProductCandidatePool';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import type { DiscoveryConstraints, DiscoveryQuestion } from '../core/discovery/molecular/types';

const constraints: DiscoveryConstraints = {
  allowedElements: ['C', 'H', 'N', 'O', 'S', 'Cl', 'F'],
  maxHeavyAtoms: 40,
  criteria: [
    { criterionId: 'mw', propertyId: 'molecularWeight', op: 'lte', value: 450, required: true, rationale: 'Bounded CNS-relevant molecular weight screen.' },
    { criterionId: 'tpsa', propertyId: 'tpsa', op: 'lte', value: 90, required: true, rationale: 'Bounded polar surface screen.' },
  ],
};

const request: NaturalAnalogueCampaignRequest = {
  referenceName: 'ketamine',
  referenceFallbackSmiles: 'CNC1(CCCCC1=O)c1ccccc1Cl',
  referenceFallbackFormula: 'C13H16ClNO',
  target: {
    referenceCompound: 'ketamine',
    declaredTarget: {
      targetId: 'nmda-receptor',
      targetName: 'NMDA receptor',
      biologicalSystem: 'CNS glutamatergic neurotransmission',
      mechanismHypothesis: 'Non-competitive open-channel antagonist',
      evidence: [{ source: 'LITERATURE', identifier: 'Anis et al. 1983', establishes: 'Ketamine antagonism at NMDA receptors.' }],
    },
  },
  referenceTargetKeywords: ['nmda'],
  candidatePool: NATURAL_PRODUCT_CANDIDATE_POOL,
  screeningConstraints: constraints,
  objectives: [
    { objectiveId: 'mw', propertyId: 'molecularWeight', direction: 'minimise', rationale: 'Lower molecular weight is a declared screen objective.' },
    { objectiveId: 'bbb', propertyId: 'bloodBrainBarrier', direction: 'maximise', rationale: 'Predicted BBB is relevant to the CNS question.' },
  ],
  question: {
    questionId: 'effect-first-ketamine-v1',
    question: 'Find naturally occurring compounds with evidence-supported mechanistic relationship to ketamine.',
    target: { targetId: 'nmda-receptor', label: 'NMDA receptor', source: 'USER_SUPPLIED', affinityCapability: 'REQUIRES_EXTERNAL_ENGINE' },
    constraints,
  } satisfies DiscoveryQuestion,
};

describe('effect-first discovery loop', () => {
  it('runs desired effect through the existing real campaign seam', () => {
    const result = runEffectDiscovery({
      effectId: 'nmda-antagonism',
      desiredEffect: 'CNS NMDA-receptor modulation under bounded property constraints',
      domain: 'neurobiology',
      targetClasses: ['NMDA receptor'],
      mechanismClasses: ['open-channel antagonist', 'co-agonist', 'agonist'],
      constraints: ['no clinical efficacy claim', 'no safety inference from ADMET'],
      candidateClass: 'MIXED',
    }, request, { rdkit: createNodeRdkitTransport(), admet: createNodeAdmetTransport() });

    expect(result.effect.effectId).toBe('nmda-antagonism');
    expect(result.interpretation.targetHypotheses).toContain('NMDA receptor');
    expect(result.sourceRecords.length).toBeGreaterThan(0);
    expect(result.sourceRecords.some((record) => record.compoundId === 'agmatine')).toBe(true);
    expect(result.interpretation.mechanismHypotheses).toContain('open-channel antagonism');
    expect(result.campaign.candidates.length).toBe(NATURAL_PRODUCT_CANDIDATE_POOL.length);
    expect(result.resultFingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(result.nextExperiment.length).toBeGreaterThan(0);
  }, 120000);
});
