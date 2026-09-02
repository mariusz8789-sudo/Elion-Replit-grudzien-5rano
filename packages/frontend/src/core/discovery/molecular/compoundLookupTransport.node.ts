/**
 * NODE LIVE PROBE — attempts the REAL PubChem/ChEMBL endpoints directly.
 *
 * `CompoundLookupTransport.fetchJson` (compoundResolver.ts) is synchronous by
 * contract, matching how `resolveCompound`/`resolveTargetHypothesis` are
 * used elsewhere in this pipeline. A real network call is not synchronous, so
 * rather than fake that with a stub that always claims BLOCKED, this module
 * is the place a caller that CAN await (a script, an async test setup) makes
 * the actual attempt and records what really happened, before deciding
 * whether to proceed with `unavailableLookupTransport` and a cross-validated
 * fallback structure (see `naturalAnalogueCampaign.resolveReferenceWithFallback`).
 *
 * Node-only on purpose (uses the platform `fetch`) — kept separate so the
 * browser bundle never needs it; in the browser the honest path is the
 * backend's allowlisted `/api/biotech/source` proxy instead.
 */
export const NODE_COMPOUND_LOOKUP_PROBE_VERSION = '1.0.0';

const TIMEOUT_MS = 8_000;

export interface LiveProbeResult {
  available: boolean;
  reason: string;
  httpStatus: number | null;
  url: string;
}

/** A real, awaited GET against an allowlisted PubChem/ChEMBL URL. */
export async function probeLiveCompoundLookup(url: string): Promise<LiveProbeResult> {
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return {
      available: response.ok,
      reason: response.ok ? '' : `Responded with HTTP ${response.status}.`,
      httpStatus: response.status,
      url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { available: false, reason: `Unreachable: ${message}`, httpStatus: null, url };
  }
}

/**
 * A real, awaited fetch returning the same shape `CompoundLookupTransport.fetchJson`
 * expects, for callers that CAN await (scripts, async test setup).
 */
export async function fetchJsonLive(url: string): Promise<{ ok: true; body: unknown } | { ok: false; reason: string }> {
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
    const body: unknown = await response.json();
    return { ok: true, body };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: message };
  }
}
