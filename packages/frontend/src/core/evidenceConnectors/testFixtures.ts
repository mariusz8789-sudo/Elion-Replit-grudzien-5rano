import type { ConnectorPort, SourceConfig } from './contracts';

/**
 * TEST-ONLY connector ports. Explicitly named so nothing importing them
 * could mistake one for a real network call (same convention as
 * `core/orchestrator/toyAdapters.ts`'s `SYNTHETIC_TEST_ONLY` naming).
 */

/** Always returns the same real bytes for a given sourceId — deterministic, for replay/drift tests. */
export function fixedBytesPort(bytesBySource: Readonly<Record<string, string>>): ConnectorPort {
  return {
    async fetchBytes(source: SourceConfig): Promise<Uint8Array> {
      const text = bytesBySource[source.sourceId];
      if (text === undefined) throw new Error(`no fixture bytes registered for source "${source.sourceId}"`);
      return new TextEncoder().encode(text);
    },
  };
}

/** Every call throws — exercises FETCH_FAILED without any network dependency. */
export const alwaysFailingPort: ConnectorPort = {
  async fetchBytes(source: SourceConfig): Promise<Uint8Array> {
    throw new Error(`simulated network failure for "${source.sourceId}"`);
  },
};
