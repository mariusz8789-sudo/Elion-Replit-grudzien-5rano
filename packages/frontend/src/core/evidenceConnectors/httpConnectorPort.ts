import type { ConnectorPort, SourceConfig } from './contracts';

/**
 * REAL connector port: an actual `fetch(source.url)`, real bytes, real
 * failure on a non-OK response — the same honest posture as
 * `scripts/fetch-real-data.mjs`, which documents that this sandbox's own
 * network policy blocks several of its targets and must be run from an
 * unrestricted network to actually pull data. This file does not work
 * around that; a blocked fetch here throws, and `EvidenceConnectorStore.ingest`
 * turns that into a genuine `FETCH_FAILED` record — never a fabricated
 * `FROZEN` one.
 */
export const httpConnectorPort: ConnectorPort = {
  async fetchBytes(source: SourceConfig): Promise<Uint8Array> {
    const res = await fetch(source.url);
    if (!res.ok) {
      throw new Error(`${source.url} -> HTTP ${res.status}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  },
};
