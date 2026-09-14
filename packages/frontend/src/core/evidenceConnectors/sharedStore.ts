import { EvidenceConnectorStore } from './store';

/**
 * One shared, in-memory `EvidenceConnectorStore` for UI read-only status
 * panels (`/gov-campaign`, `/research-console`) to project — not a second
 * store per screen, and not persisted (a page refresh starts a fresh,
 * honestly-empty ingest history rather than a fabricated one).
 */
export const sharedEvidenceConnectorStore = new EvidenceConnectorStore();
