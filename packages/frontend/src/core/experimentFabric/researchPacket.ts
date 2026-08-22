/**
 * GENESIS SOURCE-BOUND RESEARCH PACKET
 *
 * A deterministic packet of already registered corpus metadata and
 * supplemental records. It is intentionally not RAG: it does not retrieve
 * webpage content, generate a narrative answer, infer a scientific claim,
 * choose a solver or upgrade a capability.
 */

import { canonicalJson, fnv1a } from '../events/hash';
import { findGenesisKnowledgeContext } from '../knowledge/context';
import { knowledgeSourcesForDomain, type KnowledgeCapability } from '../knowledge/registry';
import type { KnowledgeEpistemicStatus, KnowledgeSourceKind } from '../knowledge/supplementalRegistry';

export const GENESIS_RESEARCH_PACKET_VERSION = '1.0.0';
export const MAX_RESEARCH_QUERY_LENGTH = 1000;

export type ResearchPacketStatus = 'RETRIEVED' | 'NO_MATCH';

export interface ResearchCorpusSource {
  sourceId: string;
  kind: 'knowledge-corpus';
  domainId: string;
  title: string;
  sourceFile: string;
  locator: string;
  capability: KnowledgeCapability;
  registeredModelIds: readonly string[];
  relatedCorpusFiles: readonly string[];
  assumptions: readonly string[];
  requiredSolver: string;
}

export interface ResearchSupplementalSource {
  sourceId: string;
  kind: 'supplemental-knowledge';
  domainId: string;
  title: string;
  epistemicStatus: KnowledgeEpistemicStatus;
  statement: string;
  source: {
    kind: KnowledgeSourceKind;
    title: string;
    locator: string;
    retrievedAt: string;
  };
  capability: KnowledgeCapability;
  registeredModelIds: readonly string[];
  requiredSolver: string;
  limitation: string;
}

export interface GenesisResearchPacket {
  contractVersion: string;
  packetId: string;
  status: ResearchPacketStatus;
  /** Normalized only for packet identity; matching itself is delegated unchanged to the existing Registry. */
  normalizedQuery: string;
  corpusSources: readonly ResearchCorpusSource[];
  supplementalSources: readonly ResearchSupplementalSource[];
  packetFingerprint: string;
  disclaimer: string;
}

function normalizeForFingerprint(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pl-PL');
}

/**
 * Resolves an auditable source packet from existing registry entries only.
 * An empty or unmatched query produces NO_MATCH rather than an invented answer.
 */
export function createGenesisResearchPacket(query: string): GenesisResearchPacket {
  if (query.length > MAX_RESEARCH_QUERY_LENGTH) {
    throw new Error(`Research query must not exceed ${MAX_RESEARCH_QUERY_LENGTH} characters.`);
  }
  const normalizedQuery = normalizeForFingerprint(query);
  const context = findGenesisKnowledgeContext(query);
  const corpusSources = context.corpusDomains.map((domain) => ({
    sourceId: `corpus:${domain.sourceFile}`,
    kind: 'knowledge-corpus' as const,
    domainId: domain.id,
    title: domain.title,
    sourceFile: domain.sourceFile,
    locator: `knowledge/${domain.sourceFile}`,
    capability: domain.capability,
    registeredModelIds: domain.realModels,
    relatedCorpusFiles: knowledgeSourcesForDomain(domain.id),
    assumptions: domain.assumptions,
    requiredSolver: domain.requiredSolver,
  }));
  const supplementalSources = context.supplementalRecords.map((record) => ({
    sourceId: `supplemental:${record.id}`,
    kind: 'supplemental-knowledge' as const,
    domainId: record.domainId,
    title: record.title,
    epistemicStatus: record.epistemicStatus,
    statement: record.statement,
    source: {
      kind: record.source.kind,
      title: record.source.title,
      locator: record.source.url,
      retrievedAt: record.source.retrievedAt,
    },
    capability: record.capability,
    registeredModelIds: record.realModelIds,
    requiredSolver: record.requiredSolver,
    limitation: record.limitation,
  }));
  const status: ResearchPacketStatus = corpusSources.length > 0 || supplementalSources.length > 0 ? 'RETRIEVED' : 'NO_MATCH';
  const packetFingerprint = `research_${fnv1a(canonicalJson({
    version: GENESIS_RESEARCH_PACKET_VERSION,
    normalizedQuery,
    status,
    corpusSources,
    supplementalSources,
  }))}`;
  return {
    contractVersion: GENESIS_RESEARCH_PACKET_VERSION,
    packetId: packetFingerprint,
    status,
    normalizedQuery,
    corpusSources,
    supplementalSources,
    packetFingerprint,
    disclaimer: 'Research Packet wylicza wyłącznie istniejące rekordy i ich ograniczenia. Nie jest odpowiedzią naukową, wynikiem obliczeń, cytowaniem pełnej treści źródła, RAG-generowanym claimem ani zmianą capability/solverów. Każdy ewentualny eksperyment wymaga osobnego routera, prerejestracji i realnego execution.',
  };
}

/** Deterministic replay: the same query and registry version yield the same packet fingerprint. */
export function replayGenesisResearchPacket(query: string): GenesisResearchPacket {
  return createGenesisResearchPacket(query);
}
