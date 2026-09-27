/**
 * SCIENTIFIC SOURCE ACCESS — the contract for autonomous data acquisition.
 *
 * Genesis must be able to start from a question and go and GET the data,
 * rather than waiting for a hand-prepared Knowledge Pack. This module defines
 * what "getting it" means, and — just as importantly — what every possible
 * failure means, so that a source Genesis could not reach is never quietly
 * replaced by something it made up.
 *
 * THE STATE MACHINE IS THE POINT.
 *
 * Retrieval is not binary. A source can be reachable but unparseable, parsed
 * but yield no evidence, or yield evidence that fails validation. Collapsing
 * those into "failed" throws away exactly the information a scientist needs to
 * know whether to trust the pipeline. Each state below is a different fact
 * with a different remedy.
 *
 * WHAT THIS LAYER MUST NEVER DO:
 *  - invent content for a source it could not fetch;
 *  - present a cached or fixture payload as a live retrieval;
 *  - bypass authentication, paywalls, CAPTCHA, rate limits or access controls.
 *    Where human authorisation is genuinely required the honest answer is
 *    REQUIRES_HUMAN_AUTH, and that is a terminal state here, not an obstacle
 *    to route around.
 */
export const SCIENTIFIC_SOURCE_ACCESS_VERSION = '1.0.0';

/**
 * Ordered roughly by how far a retrieval got. The first five are progress; the
 * rest are distinct, named ways of not getting there.
 */
export type SourceAccessState =
  | 'AVAILABLE'
  | 'RETRIEVED'
  | 'PARSED'
  | 'EXTRACTED'
  | 'VERIFIED'
  | 'UNAVAILABLE'
  | 'BLOCKED'
  | 'PAYWALLED'
  | 'REQUIRES_AUTH'
  | 'REQUIRES_HUMAN_AUTH'
  | 'NOT_EXTRACTED'
  | 'NOT_VERIFIED';

export type SourceKind =
  | 'PUBLIC_DATASET'
  | 'STRUCTURED_DATABASE_API'
  | 'LITERATURE_API'
  | 'PREPRINT_SERVER'
  | 'INSTITUTIONAL_REPOSITORY'
  | 'PACKAGE_REGISTRY';

export interface SourceDescriptor {
  sourceId: string;
  kind: SourceKind;
  /** The exact URL a retrieval will hit. No wildcards, no templates left unfilled. */
  url: string;
  /** Human-readable provenance of the underlying science, not of the file. */
  citation: string;
  /** Licence/access terms as stated by the host, when known. */
  accessTerms: string;
  /** True only when the source is served publicly with no credential of any kind. */
  requiresCredential: boolean;
}

/**
 * What actually happened on the wire. `httpStatus` and `reason` are recorded
 * verbatim so a BLOCKED verdict can be audited rather than taken on trust.
 */
export interface RetrievalOutcome {
  sourceId: string;
  url: string;
  state: SourceAccessState;
  httpStatus: number | null;
  reason: string;
  /** SHA-256 of the exact bytes retrieved; null when nothing was retrieved. */
  contentSha256: string | null;
  contentBytes: number | null;
  retrievedAt: string;
  /** The payload, when retrieval succeeded. Never populated for a failed state. */
  content: string | null;
}

export interface SourceConnector {
  connectorId: string;
  /** Real network attempt. Must return a failure state rather than throwing. */
  retrieve(source: SourceDescriptor): RetrievalOutcome;
}

/**
 * Maps a transport-level result onto the state machine.
 *
 * The mapping is deliberately conservative: an unrecognised failure becomes
 * UNAVAILABLE with the raw reason attached, never a more specific state that
 * would imply Genesis diagnosed something it did not.
 */
export function classifyHttpOutcome(httpStatus: number | null, transportError: string): SourceAccessState {
  if (httpStatus === 200) return 'RETRIEVED';
  if (httpStatus === 401) return 'REQUIRES_AUTH';
  if (httpStatus === 402) return 'PAYWALLED';
  if (httpStatus === 403) {
    // A 403 from the egress proxy is a policy denial, which is a different
    // fact from the publisher refusing us.
    return transportError.includes('CONNECT tunnel failed') || transportError.includes('proxy')
      ? 'BLOCKED'
      : 'REQUIRES_AUTH';
  }
  if (httpStatus === 404) return 'UNAVAILABLE';
  if (httpStatus === 429) return 'BLOCKED';
  if (transportError.includes('CONNECT tunnel failed') || transportError.includes('403')) return 'BLOCKED';
  return 'UNAVAILABLE';
}

/** True for states that carry real retrieved content. */
export function hasContent(state: SourceAccessState): boolean {
  return state === 'RETRIEVED' || state === 'PARSED' || state === 'EXTRACTED' || state === 'VERIFIED';
}

export interface SourceAccessReport {
  attempted: number;
  outcomes: readonly RetrievalOutcome[];
  reachable: readonly string[];
  blocked: readonly string[];
  /** Plain summary a person can read without decoding the state machine. */
  summary: string;
}

export function summariseAccess(outcomes: readonly RetrievalOutcome[]): SourceAccessReport {
  const reachable = outcomes.filter((o) => hasContent(o.state)).map((o) => o.sourceId);
  const blocked = outcomes.filter((o) => !hasContent(o.state)).map((o) => o.sourceId);
  return {
    attempted: outcomes.length,
    outcomes,
    reachable,
    blocked,
    summary: `${reachable.length} of ${outcomes.length} source(s) returned real content. `
      + (blocked.length > 0
        ? `${blocked.length} did not: ${blocked.join(', ')}. Each carries its real HTTP status or transport error — none was substituted with generated content.`
        : 'No source failed.'),
  };
}
