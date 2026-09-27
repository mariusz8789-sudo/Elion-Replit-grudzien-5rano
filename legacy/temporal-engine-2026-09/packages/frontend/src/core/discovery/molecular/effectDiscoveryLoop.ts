import { canonicalJson, fnv1a } from '../../events/hash';
import {
  runNaturalAnalogueCampaign,
  naturalAnalogueCampaignFingerprint,
  type NaturalAnalogueCampaignEngines,
  type NaturalAnalogueCampaignRequest,
  type NaturalAnalogueCampaignResult,
} from './naturalAnalogueCampaign';
import { sourceBackedKnowledgeForEffect, sourceBackedRegistryFingerprint } from './sourceBackedKnowledgeRegistry';

export const EFFECT_DISCOVERY_LOOP_VERSION = '1.0.0';

export interface DesiredEffectSpec {
  effectId: string;
  desiredEffect: string;
  domain: string;
  targetClasses: readonly string[];
  mechanismClasses: readonly string[];
  constraints: readonly string[];
  candidateClass: 'NATURAL' | 'KNOWN' | 'MIXED';
}

export interface EffectDiscoveryResult {
  effect: DesiredEffectSpec;
  interpretation: {
    measurableProperties: readonly string[];
    targetHypotheses: readonly string[];
    mechanismHypotheses: readonly string[];
  };
  campaign: NaturalAnalogueCampaignResult;
  sourceRecords: readonly ReturnType<typeof sourceBackedKnowledgeForEffect>[number][];
  evidenceStatus: 'SOURCE_BACKED' | 'PARTIAL' | 'NOT_AVAILABLE';
  nextExperiment: string;
  resultFingerprint: string;
}

/**
 * Universal effect-first seam. It interprets a declarative biological goal and
 * delegates candidate/evidence/structure/ADMET/falsification/ranking to the
 * existing natural campaign; it never infers missing biology from structure.
 */
export function runEffectDiscovery(
  effect: DesiredEffectSpec,
  campaignRequest: NaturalAnalogueCampaignRequest,
  engines: NaturalAnalogueCampaignEngines,
): EffectDiscoveryResult {
  const campaign = runNaturalAnalogueCampaign(campaignRequest, engines);
  const sourceRecords = sourceBackedKnowledgeForEffect(effect.effectId);
  const registryTargets = sourceRecords.map((record) => record.targetId).filter((target): target is string => target !== null);
  const registryMechanisms = sourceRecords.map((record) => record.mechanism).filter((mechanism): mechanism is string => mechanism !== null);
  const retained = campaign.candidates.filter((candidate) => candidate.status === 'RETAINED_RANKED').length;
  const evidenceStatus = campaign.candidates.length === 0
    ? 'NOT_AVAILABLE'
    : retained > 0 ? 'PARTIAL' : 'NOT_AVAILABLE';
  const nextExperiment = campaign.topCandidates[0]?.nextExperiment
    ?? 'Obtain a comparable functional assay for the declared target and mechanism; current computation cannot establish biological efficacy.';

  return {
    effect,
    interpretation: {
      measurableProperties: ['target engagement', 'functional activity', 'mechanistic direction', 'exposure/property constraints'],
      targetHypotheses: [...new Set([...effect.targetClasses, ...registryTargets])],
      mechanismHypotheses: [...new Set([...effect.mechanismClasses, ...registryMechanisms])],
    },
    campaign,
    sourceRecords,
    evidenceStatus,
    nextExperiment,
    resultFingerprint: fnv1a(canonicalJson({
      v: EFFECT_DISCOVERY_LOOP_VERSION,
      effect,
      campaign: naturalAnalogueCampaignFingerprint(campaign),
      registry: sourceBackedRegistryFingerprint(sourceRecords),
    })),
  };
}
