import { findKnowledgeDomains, type KnowledgeDomainDescriptor } from './registry';
import { findSupplementalKnowledge, type SupplementalKnowledgeRecord } from './supplementalRegistry';

export interface KnowledgeContextMatch {
  corpusDomains: readonly KnowledgeDomainDescriptor[];
  supplementalRecords: readonly SupplementalKnowledgeRecord[];
}

/**
 * Context retrieval only. It deliberately performs no route selection, result
 * calculation or capability upgrade; those responsibilities remain in Router.
 */
export function findGenesisKnowledgeContext(text: string): KnowledgeContextMatch {
  return {
    corpusDomains: findKnowledgeDomains(text),
    supplementalRecords: findSupplementalKnowledge(text),
  };
}
