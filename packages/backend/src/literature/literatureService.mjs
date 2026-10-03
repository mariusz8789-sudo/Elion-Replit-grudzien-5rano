import { deduplicateLiteratureSources, LITERATURE_RETRIEVAL_STATUS } from './literatureContracts.mjs';
import { queryEuropePmc } from './europePmcConnector.mjs';
import { queryPubmed } from './pubmedConnector.mjs';

const DEFAULT_CONNECTORS = Object.freeze([
  { id: 'EUROPE_PMC', query: queryEuropePmc },
  { id: 'PUBMED', query: queryPubmed },
]);

export async function searchLiterature(query, options = {}) {
  const connectors = options.connectors ?? DEFAULT_CONNECTORS;
  const connectorResults = await Promise.all(connectors.map(async (connector) => {
    try {
      return { connectorId: connector.id, ...(await connector.query(query, options)) };
    } catch {
      return {
        connectorId: connector.id,
        status: LITERATURE_RETRIEVAL_STATUS.BLOCKED_BY_NETWORK,
        sources: [],
        failureCode: 'LITERATURE_CONNECTOR_UNHANDLED_FAILURE',
        message: 'Literature connector failed closed.',
        provenance: { provider: connector.id },
      };
    }
  }));
  const sources = deduplicateLiteratureSources(connectorResults.flatMap((result) => result.sources));
  const status = sources.length > 0
    ? LITERATURE_RETRIEVAL_STATUS.METADATA_ONLY
    : connectorResults.some((result) => result.status === LITERATURE_RETRIEVAL_STATUS.BLOCKED_BY_NETWORK)
      ? LITERATURE_RETRIEVAL_STATUS.BLOCKED_BY_NETWORK
      : connectorResults.every((result) => result.status === LITERATURE_RETRIEVAL_STATUS.NOT_FOUND)
        ? LITERATURE_RETRIEVAL_STATUS.NOT_FOUND
        : LITERATURE_RETRIEVAL_STATUS.NO_ACCESS;
  return { status, sources, connectors: connectorResults };
}
