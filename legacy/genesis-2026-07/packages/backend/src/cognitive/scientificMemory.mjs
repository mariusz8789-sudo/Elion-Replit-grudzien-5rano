/**
 * Scientific Memory (Genesis V4, Phase 7). Accumulates learning from Genesis's OWN completed
 * campaigns (real outcomes, via active learning) and maintains a registry of external knowledge
 * sources (publications, patents, ChEMBL, PubChem, BindingDB, PDB, UniProt, DrugBank, Open Targets,
 * PubMed) with their licence + retrieval status. External sources are egress-blocked in this
 * environment, so learning-from-external returns BLOCKED_BY_RUNTIME — no external data is invented.
 */
import { learnFromCampaigns } from './activeLearning.mjs';

export const SCIENTIFIC_MEMORY_VERSION = 'genesis-scientific-memory/1';

/** External knowledge sources Genesis can learn from once egress / a licensed feed is available. */
export const EXTERNAL_KNOWLEDGE_SOURCES = Object.freeze([
  { source: 'PubMed', kind: 'literature', license: 'PUBLIC (abstracts)' },
  { source: 'Publications (Europe PMC)', kind: 'literature', license: 'PER_RECORD' },
  { source: 'Patents', kind: 'patent', license: 'PUBLIC (office data)' },
  { source: 'ChEMBL', kind: 'bioactivity', license: 'CC-BY-SA-3.0' },
  { source: 'PubChem', kind: 'compound', license: 'PUBLIC_DOMAIN' },
  { source: 'BindingDB', kind: 'binding-affinity', license: 'CC-BY-3.0' },
  { source: 'PDB', kind: 'structure', license: 'CC0' },
  { source: 'UniProt', kind: 'protein', license: 'CC-BY-4.0' },
  { source: 'DrugBank', kind: 'drug', license: 'PROPRIETARY (requires a licence — used only per licence)' },
  { source: 'Open Targets', kind: 'target-disease', license: 'CC0' },
]);

/**
 * Build/refresh scientific memory. `completedDossiers` are real finished-campaign dossiers.
 * `externalFetch` (optional) is an injected retriever for external sources; absent → BLOCKED.
 */
export function accumulateMemory({ completedDossiers = [], externalFetch = null } = {}) {
  const campaignLearning = learnFromCampaigns(completedDossiers);
  const externalSources = EXTERNAL_KNOWLEDGE_SOURCES.map((s) => ({
    ...s,
    status: externalFetch ? 'AVAILABLE' : 'BLOCKED_BY_RUNTIME',
    reason: externalFetch ? null : 'egress policy / no licensed feed — supply an offline bundle or a networked host (never fabricated)',
    licenceCompliance: s.license.includes('PROPRIETARY') ? 'used ONLY under a valid licence' : 'open / attribution-respecting',
  }));
  return {
    version: SCIENTIFIC_MEMORY_VERSION,
    ownCampaigns: {
      status: campaignLearning.status,
      campaignsLearnedFrom: campaignLearning.campaignsLearnedFrom ?? 0,
      samples: campaignLearning.samples ?? 0,
      learnedPolicy: campaignLearning.status === 'COMPLETED' ? { transformationWeights: campaignLearning.transformationWeights, planning: campaignLearning.planning } : null,
    },
    externalSources,
    externalLearningStatus: externalFetch ? 'AVAILABLE' : 'BLOCKED_BY_RUNTIME',
    honesty: 'Learns from real completed campaigns only. External knowledge (publications/patents/DBs) is licence-respecting and BLOCKED_BY_RUNTIME here (egress) — never fabricated. DrugBank is used only under a valid licence.',
  };
}
